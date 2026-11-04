/**
 * Public surface of the service-history feature.
 *
 * Everything outside this folder imports from here, never from a file inside it (see
 * docs/ONBOARDING.md §7.1). README.md explains what each piece shows and why.
 *
 * The app shell imports `historyLink` from here, so this barrel is in the main bundle's import
 * graph. Module-level calls in the feature are marked `/* @__PURE__ *\/` so the bundler can
 * still drop the screens the shell doesn't use; removing those marks adds ~23 kB to the first
 * download (README → "Bundle").
 */
export { historyLink, VISIT_PARAM } from './lib/links.js';
export { WaterStateCards } from './components/WaterStateCards.js';
export { VisitHistory } from './components/VisitHistory.js';
export { TrendPanel } from './components/TrendPanel.js';
export { ClientDetailPage } from './pages/ClientDetailPage.js';
export { VisitFilters } from './components/VisitFilters.js';
export { ExportCsvButton } from './components/ExportCsvButton.js';
export { FailureAlert } from './components/FailureAlert.js';
export { useVisitPages } from './lib/useVisitPages.js';
export { useVisitFilterOptions } from './lib/useVisitFilterOptions.js';
export { visitOutOfRange } from './lib/visit.js';
export type { Visit, VisitScope } from './lib/data.js';
