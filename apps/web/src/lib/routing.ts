/** Client wrapper for the /api/route-optimize Mapbox proxy. */
export interface LatLng {
  lat: number;
  lng: number;
}

export interface OptimizeResult {
  /** Input indices in optimal visiting order. */
  order: number[];
  /** Total driving distance (metres) and duration (seconds). */
  distance: number;
  duration: number;
  /** Per-leg driving seconds, aligned to consecutive pairs in `order`. */
  legs: number[];
}

export type OptimizeOutcome =
  | { ok: true; result: OptimizeResult }
  | { ok: false; reason: 'unavailable' | 'error' };

export async function optimizeRoute(points: LatLng[]): Promise<OptimizeOutcome> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  try {
    const resp = await fetch(`/api/route-optimize?coords=${encodeURIComponent(coords)}`);
    if (resp.status === 503) return { ok: false, reason: 'unavailable' };
    if (!resp.ok) return { ok: false, reason: 'error' };
    return { ok: true, result: (await resp.json()) as OptimizeResult };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export function routeMapUrl(orderedPoints: LatLng[]): string {
  const coords = orderedPoints.map((p) => `${p.lng},${p.lat}`).join(';');
  return `/api/route-map?coords=${encodeURIComponent(coords)}`;
}

/** Google Maps multi-stop directions link (origin → waypoints → destination). */
export function googleMapsLink(orderedPoints: LatLng[]): string {
  if (orderedPoints.length === 0) return '#';
  const fmt = (p: LatLng) => `${p.lat},${p.lng}`;
  const origin = fmt(orderedPoints[0]);
  const destination = fmt(orderedPoints[orderedPoints.length - 1]);
  const waypoints = orderedPoints.slice(1, -1).map(fmt).join('|');
  const base = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
  return waypoints ? `${base}&waypoints=${encodeURIComponent(waypoints)}` : base;
}
