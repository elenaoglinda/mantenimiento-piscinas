/**
 * Public surface of the service-history feature.
 *
 * Everything outside this folder imports from here, never from a file inside it (see
 * docs/ONBOARDING.md §7.1). README.md explains what each piece shows and why.
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
