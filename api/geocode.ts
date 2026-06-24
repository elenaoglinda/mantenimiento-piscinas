import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Server-side Mapbox geocoding proxy. Keeps the Mapbox token off the client.
 * GET /api/geocode?q=<address> → { lat, lng, place_name } | 404 | 503 (token not configured).
 * Set MAPBOX_TOKEN in the Vercel project env (and .env for local `vercel dev`).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    res.status(503).json({ error: 'geocoding_unavailable' });
    return;
  }

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) {
    res.status(400).json({ error: 'missing_query' });
    return;
  }

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?country=es&limit=1&language=es&access_token=${token}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      res.status(502).json({ error: 'upstream_error' });
      return;
    }
    const data = (await resp.json()) as {
      features?: Array<{ center: [number, number]; place_name: string }>;
    };
    const feature = data.features?.[0];
    if (!feature) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const [lng, lat] = feature.center;
    res.status(200).json({ lat, lng, place_name: feature.place_name });
  } catch {
    res.status(502).json({ error: 'upstream_error' });
  }
}
