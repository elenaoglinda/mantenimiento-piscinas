import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider.js';
import { PublicOnly, RequireAuth, RequireOnboarded } from './auth/guards.js';
import { AppShell } from './features/app-shell/index.js';
import { LoginPage } from './pages/LoginPage.js';
import { SignupPage } from './pages/SignupPage.js';
import { OnboardingPage } from './pages/OnboardingPage.js';
import { InvitePage } from './pages/InvitePage.js';
import { Toaster } from './components/ui/Toast.js';
import { TooltipProvider } from './components/ui/Tooltip.js';
import { showDesignPage } from './features/design/visibility.js';

/**
 * Pages behind the login load on demand, each in its own chunk, so the first screen (login)
 * doesn't download the whole app. The shell shows a skeleton while a page's chunk arrives.
 */
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));

const DashboardPage = page(() => import('./pages/DashboardPage.js'), 'DashboardPage');
const TeamPage = page(() => import('./pages/TeamPage.js'), 'TeamPage');
const ClientsPage = page(() => import('./pages/ClientsPage.js'), 'ClientsPage');
const PoolsPage = page(() => import('./pages/PoolsPage.js'), 'PoolsPage');
const PoolDetailPage = page(() => import('./pages/PoolDetailPage.js'), 'PoolDetailPage');
const ReportsPage = page(() => import('./pages/ReportsPage.js'), 'ReportsPage');
const ReportFormPage = page(() => import('./pages/ReportFormPage.js'), 'ReportFormPage');
const ImportReportPage = page(() => import('./pages/ImportReportPage.js'), 'ImportReportPage');
const ReportDetailPage = page(() => import('./pages/ReportDetailPage.js'), 'ReportDetailPage');
const SiloeExportPage = page(() => import('./pages/SiloeExportPage.js'), 'SiloeExportPage');
const RoutesPage = page(() => import('./pages/RoutesPage.js'), 'RoutesPage');
const SettingsPage = page(() => import('./pages/SettingsPage.js'), 'SettingsPage');
const HelpPage = page(() => import('./pages/HelpPage.js'), 'HelpPage');
const InvoicesPage = page(() => import('./features/invoicing/index.js'), 'InvoicesPage');
const ResumenPage = page(() => import('./features/invoicing/index.js'), 'ResumenPage');
const InvoiceDetailPage = page(() => import('./features/invoicing/index.js'), 'InvoiceDetailPage');
const BillingSettingsPage = page(
  () => import('./features/invoicing/index.js'),
  'BillingSettingsPage',
);

// Internal component gallery: dev and Vercel previews only, and never in the main bundle.
const DesignPage = lazy(() =>
  import('./features/design/DesignPage.js').then((m) => ({ default: m.DesignPage })),
);

export function App() {
  return (
    <AuthProvider>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            {/* Public: reachable in any auth state; the page itself branches on session. */}
            <Route path="/invite/:token" element={<InvitePage />} />

            {showDesignPage && (
              <Route
                path="/design"
                element={
                  <Suspense fallback={null}>
                    <DesignPage />
                  </Suspense>
                }
              />
            )}

            <Route element={<PublicOnly />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
            </Route>

            <Route element={<RequireAuth />}>
              <Route path="/onboarding" element={<OnboardingPage />} />

              <Route element={<RequireOnboarded />}>
                <Route element={<AppShell />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="/pools" element={<PoolsPage />} />
                  <Route path="/pools/:poolId" element={<PoolDetailPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/reports/new" element={<ReportFormPage />} />
                  <Route path="/reports/import" element={<ImportReportPage />} />
                  <Route path="/reports/:reportId" element={<ReportDetailPage />} />
                  <Route path="/reports/:reportId/edit" element={<ReportFormPage />} />
                  <Route path="/routes" element={<RoutesPage />} />
                  <Route path="/siloe" element={<SiloeExportPage />} />
                  <Route path="/invoices" element={<InvoicesPage />} />
                  <Route path="/invoices/resumen" element={<ResumenPage />} />
                  <Route path="/invoices/settings" element={<BillingSettingsPage />} />
                  <Route path="/invoices/:invoiceId" element={<InvoiceDetailPage />} />
                  <Route path="/clients" element={<ClientsPage />} />
                  <Route path="/team" element={<TeamPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/ayuda" element={<HelpPage />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </TooltipProvider>
    </AuthProvider>
  );
}
