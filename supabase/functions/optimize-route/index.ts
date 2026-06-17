import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface StopIn {
  id: string
  address: string
}

// Geocode a single address to [lon, lat] using OpenRouteService's free
// Pelias-based geocoder. No billing/card required for this service.
async function geocode(address: string, apiKey: string): Promise<[number, number] | null> {
  const url = `https://api.openrouteservice.org/geocode/search?` +
    `api_key=${apiKey}&text=${encodeURIComponent(address)}&size=1&boundary.country=US`
  const resp = await fetch(url)
  if (!resp.ok) return null
  const data = await resp.json()
  const coords = data?.features?.[0]?.geometry?.coordinates
  return Array.isArray(coords) ? [coords[0], coords[1]] : null
}

// Build a square drive-time matrix (seconds) between every stop, using
// OpenRouteService: geocode each address, then a single Matrix API call
// for real drive-time durations between every pair.
async function getDurationMatrix(addresses: string[], apiKey: string): Promise<{ matrix: number[][]; unreachable: number[] }> {
  const n = addresses.length

  // Geocode every address to coordinates first.
  const coords = await Promise.all(addresses.map(a => geocode(a, apiKey)))
  const unreachable: number[] = []
  coords.forEach((c, i) => { if (!c) unreachable.push(i) })

  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(99999))
  const validIdx = coords.map((c, i) => c ? i : -1).filter(i => i !== -1)
  if (validIdx.length < 2) return { matrix, unreachable }

  // ORS Matrix allows up to 3,500 location-pairs per request (e.g. 50x50).
  // Field service stop counts are small, so one call covers a full day.
  const locations = validIdx.map(i => coords[i] as [number, number])
  const resp = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ locations, metrics: ['duration'], units: 'mi' }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(`OpenRouteService Matrix error: ${data?.error?.message || resp.statusText}`)

  const durations: number[][] = data.durations
  validIdx.forEach((origI, oi) => {
    validIdx.forEach((destI, di) => {
      const d = durations?.[oi]?.[di]
      matrix[origI][destI] = typeof d === 'number' ? d : 99999
    })
  })

  return { matrix, unreachable }
}

// Nearest-neighbor construction starting from stop 0 (kept fixed — typically
// the first scheduled job or the shop), using real drive times.
function nearestNeighborOrder(matrix: number[][]): number[] {
  const n = matrix.length
  const visited = new Set<number>([0])
  const order = [0]
  let current = 0
  while (visited.size < n) {
    let best = -1, bestTime = Infinity
    for (let j = 0; j < n; j++) {
      if (visited.has(j)) continue
      if (matrix[current][j] < bestTime) { bestTime = matrix[current][j]; best = j }
    }
    visited.add(best)
    order.push(best)
    current = best
  }
  return order
}

// 2-opt improvement pass: repeatedly try reversing segments of the route to
// see if total drive time improves, until no improving swap is found. Stop
// counts in field service routes are small (rarely >20/day), so this runs
// near-instantly and meaningfully tightens the naive nearest-neighbor route.
function twoOpt(order: number[], matrix: number[][]): number[] {
  let improved = true
  let route = [...order]
  const dist = (a: number, b: number) => matrix[a][b]

  while (improved) {
    improved = false
    for (let i = 1; i < route.length - 2; i++) {
      for (let k = i + 1; k < route.length - 1; k++) {
        const a = route[i - 1], b = route[i], c = route[k], d = route[k + 1]
        const before = dist(a, b) + dist(c, d)
        const after = dist(a, c) + dist(b, d)
        if (after < before) {
          // reverse segment [i, k]
          route = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)]
          improved = true
        }
      }
    }
  }
  return route
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { stops } = await req.json() as { stops: StopIn[] }
    if (!Array.isArray(stops) || stops.length === 0) throw new Error('No stops provided')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: s } = await supabase.from('org_settings').select('ors_api_key').limit(1).single()
    const apiKey = s?.ors_api_key
    if (!apiKey) throw new Error('OpenRouteService API key not configured. Add it in Settings → Integrations (it\'s free, no credit card needed).')

    const withAddress = stops.filter(s => s.address && s.address.trim())
    if (withAddress.length < 2) {
      // Nothing meaningful to optimize
      return new Response(JSON.stringify({ order: stops.map(s => s.id), totalDriveSeconds: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const addresses = withAddress.map(s => s.address)
    const { matrix, unreachable } = await getDurationMatrix(addresses, apiKey)
    const unreachableSet = new Set(unreachable)
    const reachableLocalIdx = withAddress.map((_, i) => i).filter(i => !unreachableSet.has(i))

    if (reachableLocalIdx.length < 2) {
      throw new Error('Could not geocode enough addresses to optimize this route. Check that stop addresses are complete (street, city, state).')
    }

    // Run the optimizer only over reachable stops, using a sub-matrix.
    const subMatrix = reachableLocalIdx.map(r => reachableLocalIdx.map(c => matrix[r][c]))
    let subOrder = nearestNeighborOrder(subMatrix)
    subOrder = twoOpt(subOrder, subMatrix)
    const order = subOrder.map(i => reachableLocalIdx[i])

    const totalDriveSeconds = order.slice(0, -1).reduce((sum, idx, i) => sum + matrix[idx][order[i + 1]], 0)
    const orderedIds = order.map(i => withAddress[i].id)

    // Re-append any stops with no address, or that failed to geocode, at the
    // end in their original order, so nothing silently disappears from the route.
    const skippedIds = [
      ...stops.filter(s => !s.address || !s.address.trim()).map(s => s.id),
      ...unreachable.map(i => withAddress[i].id),
    ]

    return new Response(JSON.stringify({
      order: [...orderedIds, ...skippedIds],
      totalDriveSeconds,
      skippedCount: skippedIds.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
