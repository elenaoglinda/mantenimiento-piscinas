/** URL of one visit inside its pool's Historial tab: the row opens expanded and in view. */
export function historyLink(poolId: string, reportId: string): string {
  return `/pools/${poolId}?tab=historial&visita=${encodeURIComponent(reportId)}`;
}

/** Query parameter that names the visit to open in a Historial list. */
export const VISIT_PARAM = 'visita';
