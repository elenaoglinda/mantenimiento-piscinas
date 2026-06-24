import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '../components/ui/feedback.js';
import { useAuth } from './context.js';
import type { Enums } from '../lib/database.types.js';

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner />
    </div>
  );
}

/** For login/sign-up: if already authenticated, bounce to the app. */
export function PublicOnly() {
  const { session, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Requires an authenticated session; otherwise redirects to /login. */
export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Requires a provisioned profile; sends authenticated-but-new users to onboarding. */
export function RequireOnboarded() {
  const { profile, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!profile) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/** Restricts a route to specific roles; others are bounced to the dashboard. */
export function RequireRole({ allow }: { allow: Array<Enums<'user_role'>> }) {
  const { profile, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!profile) return <Navigate to="/onboarding" replace />;
  if (!allow.includes(profile.user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
