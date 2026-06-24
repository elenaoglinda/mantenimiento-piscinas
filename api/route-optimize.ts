import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Mapbox Optimization proxy. GET /api/route-optimize?coords=lng,lat;lng,lat;...
 * The first coord is treated as the start. Returns the optimal visiting order of the remaining
 * stops plus per-leg and total driving time/distance. Token stays server-side. (Phase 6.2)
 */
interface OptimizationResponse {
  code: string;
  trips?: Array<{ distance: number; duration: number; legs: Array<{ duration: number }> }>;
  waypoints?: Array<{ waypoint_index: number }>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    res.status(503).json({ error: 'routing_unavailable' });
    return;
  }
  const coords = typeof req.query.coords === 'string' ? req.query.coords : '';
  const points = coords.split(';').filter(Boolean);
  if (points.length < 2) {
    res.status(400).json({ error: 'need_at_least_two_points' });
    return;
  }
  if (points.length > 12) {
    res.status(400).json({ error: 'too_many_points' });
    return;
  }

  // Round trip from the first coord (the start). Mapbox Optimization only supports open routes
  // when BOTH ends are fixed; a round trip from a fixed start is the robust choice for a day plan.
  const url =
    `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords}` +
    `?source=first&roundtrip=true&geometries=geojson&overview=simplified&access_token=${token}`;

  try {
    const resp = await fetch(url);
    const data = (await resp.json()) as OptimizationResponse;
    if (data.code !== 'Ok' || !data.trips?.[0] || !data.waypoints) {
      res.status(502).json({ error: 'optimization_failed', code: data.code });
      return;
    }
    const trip = data.trips[0];
    // waypoints[i].waypoint_index = position of input i within the optimized trip.
    const order: number[] = new Array(points.length);
    data.waypoints.forEach((w, inputIndex) => {
      order[w.waypoint_index] = inputIndex;
    });
    res.status(200).json({
      order,
      distance: trip.distance,
      duration: trip.duration,
      legs: trip.legs.map((l) => l.duration),
    });
  } catch {
    res.status(502).json({ error: 'optimization_failed' });
  }
}
