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
