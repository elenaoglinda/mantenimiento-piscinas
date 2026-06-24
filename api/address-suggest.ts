import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Mapbox address autocomplete proxy (keeps the token server-side).
 * GET /api/address-suggest?q=<partial address> → { suggestions: [...] } | 503 (no token).
 * Each suggestion carries parsed Spanish address parts so the pool form can fill its fields.
 */
interface MapboxContext {
  id: string;
  text: string;
}
interface MapboxFeature {
  place_name: string;
  center: [number, number];
  text: string;
  address?: string;
  context?: MapboxContext[];
}

function partFromContext(ctx: MapboxContext[] | undefined, prefix: string): string | null {
  return ctx?.find((c) => c.id.startsWith(prefix))?.text ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    res.status(503).json({ error: 'geocoding_unavailable' });
    return;
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 3) {
    res.status(200).json({ suggestions: [] });
    return;
  }

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?country=es&autocomplete=true&types=address&limit=5&language=es&access_token=${token}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      res.status(502).json({ error: 'upstream_error' });
      return;
    }
    const data = (await resp.json()) as { features?: MapboxFeature[] };
    const suggestions = (data.features ?? []).map((f) => {
      const street = [f.text, f.address].filter(Boolean).join(' ');
      return {
        placeName: f.place_name,
        direccion: street || f.place_name.split(',')[0],
        cp: partFromContext(f.context, 'postcode'),
        localidad: partFromContext(f.context, 'place'),
        provincia: partFromContext(f.context, 'region'),
        lat: f.center[1],
        lng: f.center[0],
      };
    });
    res.status(200).json({ suggestions });
  } catch {
    res.status(502).json({ error: 'upstream_error' });
  }
}
