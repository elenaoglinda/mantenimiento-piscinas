import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CommandMenu } from './CommandMenu.js';
import { MobileDrawer } from './MobileDrawer.js';
import { Sidebar } from './Sidebar.js';
import { Topbar } from './Topbar.js';
import { resolveRoute } from './nav.js';
import { useSidebarCollapsed } from './useSidebarCollapsed.js';
import { RecordCrumbProvider } from './RecordCrumbProvider.js';
import { ShellDataProvider } from './ShellDataProvider.js';
import { useCurrentRecordLabel } from './recordCrumb.js';

/**
 * The authenticated layout: sidebar (rail ≥ 1024px, drawer below), sticky top bar, fluid
 * content area, and the ⌘K palette. Pages render unchanged inside <Outlet />.
 */
export function AppShell() {
  return (
    <RecordCrumbProvider>
      <ShellDataProvider>
        <ShellLayout />
      </ShellDataProvider>
    </RecordCrumbProvider>
  );
}

function ShellLayout() {
  const { t } = useTranslation();
  const recordLabel = useCurrentRecordLabel();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Navigation closes the drawer.
  useEffect(() => setDrawerOpen(false), [pathname]);

  // Every page gets "Cloro · {Page}", or "Cloro · {Record}" once a detail page names it.
  useEffect(() => {
    const { item, subKey } = resolveRoute(pathname);
    const page = recordLabel ?? (subKey ? t(subKey) : item ? t(item.labelKey) : null);
    document.title = page ? `Cloro · ${page}` : 'Cloro';
  }, [pathname, recordLabel, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  return (
    <div className="flex min-h-screen bg-bg">
      <a
        href="#main"
        className="sr-only z-[70] rounded-[var(--radius-md)] bg-primary px-3 py-2 text-sm font-semibold text-primary-contrast focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {t('shell.skipToContent')}
      </a>

      <div className="sticky top-0 hidden h-screen shrink-0 lg:block">
        <Sidebar
          variant="rail"
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
        />
      </div>

      {drawerOpen && <MobileDrawer onClose={closeDrawer} returnFocusTo={menuButtonRef} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          drawerOpen={drawerOpen}
          onOpenDrawer={() => setDrawerOpen(true)}
          onOpenSearch={() => setPaletteOpen(true)}
          menuButtonRef={menuButtonRef}
        />
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 focus:outline-none sm:px-8 sm:py-8"
        >
          <Outlet />
        </main>
      </div>

      <CommandMenu open={paletteOpen} onClose={closePalette} />
    </div>
  );
}
