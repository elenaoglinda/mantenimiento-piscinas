import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
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
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const navItems: NavItem[] = [
    { to: '/', key: 'nav.dashboard', end: true },
    { to: '/pools', key: 'nav.pools' },
    { to: '/reports', key: 'nav.reports' },
    { to: '/routes', key: 'nav.routes' },
    { to: '/siloe', key: 'nav.siloe' },
    { to: '/invoices', key: 'nav.invoicing' },
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

          {/* Desktop: sign out inline. Mobile: a menu toggle. */}
          <button
            type="button"
            onClick={() => void signOut()}
            className="hidden rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text sm:block"
          >
            {t('auth.signOut')}
          </button>
          <button
            type="button"
            aria-label={t('nav.menu')}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((o) => !o)}
            className="-mr-1 inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] text-text transition-colors hover:bg-surface-muted sm:hidden"
          >
            {menuOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Desktop tab bar */}
        <nav className="mx-auto hidden max-w-5xl gap-1 px-3 sm:flex">
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

        {/* Mobile drop-down menu */}
        {menuOpen && (
          <nav id="mobile-nav" className="border-t border-border bg-surface px-2 py-2 sm:hidden">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `block rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-brand-50 text-primary' : 'text-text hover:bg-surface-muted'
                  }`
                }
              >
                {t(item.key)}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-1 block w-full rounded-[var(--radius-md)] px-3 py-2.5 text-left text-sm font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
            >
              {t('auth.signOut')}
            </button>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
