/**
 * Public surface of the service-log feature: what a technician does at a visit beyond the
 * SILOE readings. Outside code imports only from here (docs/ONBOARDING.md §7.1).
 */
export { ProductsSection } from './components/ProductsSection.js';
export { ProductCatalogueSettings } from './components/ProductCatalogueSettings.js';
export { TasksSection } from './components/TasksSection.js';
export { TaskListSettings } from './components/TaskListSettings.js';
export { VisitLogDetails, VisitLogIcons } from './components/VisitLogDetails.js';
export { ServiceLogAlert } from './components/ServiceLogAlert.js';
export { useServiceLogForm } from './lib/useServiceLogForm.js';
export { useVisitLogs, type VisitLog } from './lib/useVisitLogs.js';
export { ReportServiceLogCard } from './components/ReportServiceLogCard.js';
