import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Mapbox Static Images proxy. GET /api/route-map?coords=lng,lat;lng,lat;... (already ordered)
 * Returns a PNG with numbered pins auto-fit to the stops. Keeps the token server-side. (Phase 6.3)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    res.status(503).end();
    return;
  }
  const coords = typeof req.query.coords === 'string' ? req.query.coords : '';
  const points = coords.split(';').filter(Boolean);
  if (points.length === 0) {
    res.status(400).end();
    return;
  }

  // Mapbox pin labels render for 1–9; extra stops get an unlabeled pin.
  const markers = points
    .map((p, i) => {
      const [lng, lat] = p.split(',');
      const label = i + 1 <= 9 ? `pin-s-${i + 1}` : 'pin-s';
      return `${label}+0d9488(${lng},${lat})`;
    })
    .join(',');

  const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${markers}/auto/640x400@2x?access_token=${token}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      res.status(502).end();
      return;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.status(200).send(buf);
  } catch {
    res.status(502).end();
  }
}
