import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context.js';

interface NavItem {
  to: string;
  key: string;
  end?: boolean;
}

export function AppShell() {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();

  const navItems: NavItem[] = [
    { to: '/', key: 'nav.dashboard', end: true },
    { to: '/pools', key: 'nav.pools' },
    { to: '/reports', key: 'nav.reports' },
    { to: '/siloe', key: 'nav.siloe' },
    // Companies manage multiple clients; owners only have their implicit self-client.
    ...(profile?.org.type === 'company' ? [{ to: '/clients', key: 'nav.clients' }] : []),
    { to: '/team', key: 'nav.team' },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-base font-semibold text-primary">{t('app.name')}</span>
            {profile && (
              <span className="hidden truncate text-sm text-text-muted sm:inline">
                · {profile.org.name}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
          >
            {t('auth.signOut')}
          </button>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-muted hover:text-text'
                }`
              }
            >
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
