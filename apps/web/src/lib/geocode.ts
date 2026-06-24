/** Client wrapper for the /api/geocode serverless proxy (Mapbox). */
export interface GeocodeResult {
  lat: number;
  lng: number;
  placeName: string;
}

export type GeocodeOutcome =
  | { ok: true; result: GeocodeResult }
  | { ok: false; reason: 'unavailable' | 'not_found' | 'error' };

export async function geocodeAddress(query: string): Promise<GeocodeOutcome> {
  try {
    const resp = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    if (resp.status === 503) return { ok: false, reason: 'unavailable' };
    if (resp.status === 404) return { ok: false, reason: 'not_found' };
    if (!resp.ok) return { ok: false, reason: 'error' };
    const data = (await resp.json()) as { lat: number; lng: number; place_name: string };
    return { ok: true, result: { lat: data.lat, lng: data.lng, placeName: data.place_name } };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
