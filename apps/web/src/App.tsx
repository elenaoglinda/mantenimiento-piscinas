import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider.js';
import { PublicOnly, RequireAuth, RequireOnboarded } from './auth/guards.js';
import { AppShell } from './components/AppShell.js';
import { LoginPage } from './pages/LoginPage.js';
import { SignupPage } from './pages/SignupPage.js';
import { OnboardingPage } from './pages/OnboardingPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { TeamPage } from './pages/TeamPage.js';
import { ClientsPage } from './pages/ClientsPage.js';
import { PoolsPage } from './pages/PoolsPage.js';
import { PoolDetailPage } from './pages/PoolDetailPage.js';
import { ReportsPage } from './pages/ReportsPage.js';
import { ReportFormPage } from './pages/ReportFormPage.js';
import { ReportDetailPage } from './pages/ReportDetailPage.js';
import { SiloeExportPage } from './pages/SiloeExportPage.js';
import { RoutesPage } from './pages/RoutesPage.js';
import { InvitePage } from './pages/InvitePage.js';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public: reachable in any auth state; the page itself branches on session. */}
          <Route path="/invite/:token" element={<InvitePage />} />

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
                <Route path="/reports/:reportId" element={<ReportDetailPage />} />
                <Route path="/reports/:reportId/edit" element={<ReportFormPage />} />
                <Route path="/routes" element={<RoutesPage />} />
                <Route path="/siloe" element={<SiloeExportPage />} />
                <Route path="/clients" element={<ClientsPage />} />
                <Route path="/team" element={<TeamPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
