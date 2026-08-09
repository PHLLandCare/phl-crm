// optimize-route Edge Function
// Optimizes a list of service stops using OpenRouteService API
// Called by: RoutePage
// POST { stops: [{ id: string, address: string }] }
// Returns { order: string[] } — ordered list of stop IDs

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Content-Type": "application/json",
};

const ORS_API_KEY = Deno.env.get("ORS_API_KEY");
const ORS_BASE = "https://api.openrouteservice.org";

// Geocode an address to [lng, lat] using ORS Geocoding
async function geocode(address: string): Promise<[number, number] | null> {
  if (!ORS_API_KEY) return null;
  try {
    const url = `${ORS_BASE}/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(address)}&size=1&boundary.country=US`;
    const res = await fetch(url);
    const data = await res.json();
    const coords = data?.features?.[0]?.geometry?.coordinates;
    if (coords && coords.length === 2) return coords as [number, number];
    return null;
  } catch {
    return null;
  }
}

// Optimize route order using ORS Optimization (Vehicle Routing Problem)
async function optimizeWithORS(
  jobs: { id: string; location: [number, number] }[]
): Promise<string[] | null> {
  if (!ORS_API_KEY || jobs.length < 2) return null;

  try {
    const payload = {
      jobs: jobs.map((j, i) => ({
        id: i + 1,
        location: j.location,
        service: 1800, // 30 min per stop
      })),
      vehicles: [
        {
          id: 1,
          profile: "driving-car",
          start: jobs[0].location,
          end: jobs[0].location,
          capacity: [jobs.length],
        },
      ],
    };

    const res = await fetch(`${ORS_BASE}/optimization`, {
      method: "POST",
      headers: {
        Authorization: ORS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || !data?.routes?.[0]?.steps) return null;

    // Extract job order from route steps
    const order = data.routes[0].steps
      .filter((s: { type: string; job?: number }) => s.type === "job" && s.job !== undefined)
      .map((s: { job: number }) => jobs[s.job - 1]?.id)
      .filter(Boolean);

    return order;
  } catch {
    return null;
  }
}

// Simple nearest-neighbor fallback when ORS is unavailable
function nearestNeighborOrder(
  jobs: { id: string; location: [number, number] | null }[]
): string[] {
  const withCoords = jobs.filter((j) => j.location);
  const noCoords = jobs.filter((j) => !j.location);

  if (withCoords.length < 2) return jobs.map((j) => j.id);

  const visited = new Set<string>();
  const order: string[] = [];
  let current = withCoords[0];
  visited.add(current.id);
  order.push(current.id);

  while (order.length < withCoords.length) {
    let nearest = withCoords.find((j) => !visited.has(j.id))!;
    let minDist = Infinity;

    for (const j of withCoords) {
      if (visited.has(j.id)) continue;
      const dx = (j.location![0] - current.location![0]);
      const dy = (j.location![1] - current.location![1]);
      const dist = dx * dx + dy * dy;
      if (dist < minDist) {
        minDist = dist;
        nearest = j;
      }
    }

    visited.add(nearest.id);
    order.push(nearest.id);
    current = nearest;
  }

  // Append stops without coords at the end
  return [...order, ...noCoords.map((j) => j.id)];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { stops } = await req.json();

    if (!stops || !Array.isArray(stops) || stops.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing or empty stops array" }),
        { status: 400, headers: cors }
      );
    }

    if (stops.length === 1) {
      return new Response(
        JSON.stringify({ ok: true, order: [stops[0].id] }),
        { headers: cors }
      );
    }

    if (!ORS_API_KEY) {
      console.warn("[optimize-route] ORS_API_KEY not configured — returning original order");
      return new Response(
        JSON.stringify({
          ok: true,
          order: stops.map((s: { id: string }) => s.id),
          error: "Route optimization not configured — add ORS_API_KEY secret to enable",
        }),
        { headers: cors }
      );
    }

    // Geocode all addresses in parallel
    const geocoded = await Promise.all(
      stops.map(async (s: { id: string; address: string }) => ({
        id: s.id,
        location: await geocode(s.address),
      }))
    );

    // Try ORS optimization
    const withCoords = geocoded.filter((j) => j.location) as {
      id: string;
      location: [number, number];
    }[];

    let order: string[] | null = null;
    if (withCoords.length >= 2) {
      order = await optimizeWithORS(withCoords);
    }

    // Fall back to nearest neighbor
    if (!order) {
      order = nearestNeighborOrder(geocoded);
    }

    console.log(`[optimize-route] Optimized ${stops.length} stops → ${order.join(", ")}`);
    return new Response(
      JSON.stringify({ ok: true, order }),
      { headers: cors }
    );

  } catch (e) {
    console.error("[optimize-route] Error:", e.message);
    return new Response(
      JSON.stringify({ ok: false, error: e.message }),
      { status: 500, headers: cors }
    );
  }
});
