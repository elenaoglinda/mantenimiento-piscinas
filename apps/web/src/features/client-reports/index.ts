/**
 * Public surface of the client-reports feature: the PDFs a pool company sends its own client
 * (one visit, or one pool's month) and the buttons that send them. Outside code imports only
 * from here (docs/ONBOARDING.md §7.1). See README.md.
 */
export { SendVisitReportCard } from './components/SendVisitReportCard.js';
export { MonthlySummaryCard } from './components/MonthlySummaryCard.js';
export { LogoSettings } from './components/LogoSettings.js';
export { savePhotoThumbnail, thumbnailPath } from './lib/thumbnail.js';
