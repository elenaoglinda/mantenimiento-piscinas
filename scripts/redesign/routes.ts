import type { AuthMode } from './mock';

/** Every page of the panel the harness visits, with the auth state it needs. */
export const ROUTES: { slug: string; path: string; auth: AuthMode }[] = [
  { slug: 'login', path: '/login', auth: 'none' },
  { slug: 'signup', path: '/signup', auth: 'none' },
  { slug: 'invite', path: '/invite/demo-token', auth: 'none' },
  { slug: 'onboarding', path: '/onboarding', auth: 'no-profile' },
  { slug: 'inicio', path: '/', auth: 'full' },
  { slug: 'pools', path: '/pools', auth: 'full' },
  { slug: 'pool-detail', path: '/pools/pool-1', auth: 'full' },
  { slug: 'reports', path: '/reports', auth: 'full' },
  { slug: 'report-new', path: '/reports/new', auth: 'full' },
  { slug: 'report-import', path: '/reports/import', auth: 'full' },
  { slug: 'report-detail', path: '/reports/rep-1', auth: 'full' },
  { slug: 'report-edit', path: '/reports/rep-1/edit', auth: 'full' },
  { slug: 'routes', path: '/routes', auth: 'full' },
  { slug: 'siloe', path: '/siloe', auth: 'full' },
  { slug: 'invoices', path: '/invoices', auth: 'full' },
  { slug: 'invoices-resumen', path: '/invoices/resumen', auth: 'full' },
  { slug: 'invoices-settings', path: '/invoices/settings', auth: 'full' },
  { slug: 'invoice-detail', path: '/invoices/inv-1', auth: 'full' },
  { slug: 'clients', path: '/clients', auth: 'full' },
  { slug: 'team', path: '/team', auth: 'full' },
];

// Added after the redesign; main doesn't have them.
if (process.env.SHOT_DIR !== 'before') {
  ROUTES.push(
    { slug: 'settings', path: '/settings', auth: 'full' },
    { slug: 'help', path: '/ayuda', auth: 'full' },
  );
}

// Service history (claude/service-history).
if (process.env.SHOT_DIR !== 'before') {
  ROUTES.push(
    { slug: 'pool-history', path: '/pools/pool-1?tab=historial', auth: 'full' },
    { slug: 'pool-history-visit', path: '/pools/pool-1?tab=historial&visita=hist-1', auth: 'full' },
    { slug: 'pool-trend', path: '/pools/pool-1?tab=evolucion', auth: 'full' },
    { slug: 'client-detail', path: '/clients/cli-1', auth: 'full' },
    { slug: 'reports-filtered', path: '/reports?cliente=cli-1&fuera=1', auth: 'full' },
  );
}

// Added by the redesign; the "before" build doesn't have it.
if (process.env.SHOT_DIR !== 'before') {
  ROUTES.push({ slug: 'design', path: '/design', auth: 'none' });
}
