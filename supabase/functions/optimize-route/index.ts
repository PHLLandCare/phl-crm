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

// Build a square drive-time matrix (seconds) between every stop, using
// Google's Distance Matrix API. Origin point (first stop, e.g. the shop or
// the first job of the day) is included as index 0 if provided separately.
async function getDurationMatrix(addresses: string[], apiKey: string): Promise<number[][]> {
  const n = addresses.length
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))

  // Distance Matrix API allows up to 25 origins x 25 destinations per request.
  // Our route stop counts are small (field service days), so one request
  // covering all stops at once is almost always enough; chunk defensively
  // just in case a day ever has a very large stop count.
  const CHUNK = 25
  for (let oStart = 0; oStart < n; oStart += CHUNK) {
    const origins = addresses.slice(oStart, oStart + CHUNK)
    for (let dStart = 0; dStart < n; dStart += CHUNK) {
      const destinations = addresses.slice(dStart, dStart + CHUNK)
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?` +
        `origins=${origins.map(encodeURIComponent).join('|')}` +
        `&destinations=${destinations.map(encodeURIComponent).join('|')}` +
        `&units=imperial&key=${apiKey}`

      const resp = await fetch(url)
      const data = await resp.json()
      if (data.status !== 'OK') throw new Error(`Distance Matrix error: ${data.status} ${data.error_message || ''}`)

      data.rows.forEach((row: any, i: number) => {
        row.elements.forEach((el: any, j: number) => {
          const duration = el.status === 'OK' ? el.duration.value : 99999 // seconds; huge penalty if unreachable
          matrix[oStart + i][dStart + j] = duration
        })
      })
    }
  }
  return matrix
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
    const { data: s } = await supabase.from('org_settings').select('google_maps_api_key').limit(1).single()
    const apiKey = s?.google_maps_api_key
    if (!apiKey) throw new Error('Google Maps API key not configured. Add it in Settings → Integrations.')

    const withAddress = stops.filter(s => s.address && s.address.trim())
    if (withAddress.length < 2) {
      // Nothing meaningful to optimize
      return new Response(JSON.stringify({ order: stops.map(s => s.id), totalDriveSeconds: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const addresses = withAddress.map(s => s.address)
    const matrix = await getDurationMatrix(addresses, apiKey)
    let order = nearestNeighborOrder(matrix)
    order = twoOpt(order, matrix)

    const totalDriveSeconds = order.slice(0, -1).reduce((sum, idx, i) => sum + matrix[idx][order[i + 1]], 0)
    const orderedIds = order.map(i => withAddress[i].id)

    // Re-append any stops with no address at the end, unchanged order
    const noAddressIds = stops.filter(s => !s.address || !s.address.trim()).map(s => s.id)

    return new Response(JSON.stringify({
      order: [...orderedIds, ...noAddressIds],
      totalDriveSeconds,
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
