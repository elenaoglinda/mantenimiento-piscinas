/**
 * Public surface of the dashboard (the home page, `/`).
 *
 * Everything outside this folder imports from here (docs/ONBOARDING.md §7.1). The pure helpers
 * the dashboard uses (`lib/dashboard.ts`: Madrid dates, stale pools, calendar grid) stay in
 * `src/lib/` because the app shell and the Rutas page use them too. README.md explains why.
 */
export { DashboardPage } from './pages/DashboardPage.js';
