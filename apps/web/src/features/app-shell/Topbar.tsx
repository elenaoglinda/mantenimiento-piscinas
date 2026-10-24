import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, CircleHelp, Menu, Plus, Search } from 'lucide-react';
import { useAuth } from '../../auth/context.js';
import { Breadcrumb, type Crumb } from '../../components/ui/Breadcrumb.js';
import { resolveRoute } from './nav.js';
import { useCurrentRecordLabel } from './recordCrumb.js';

interface TopbarProps {
  drawerOpen: boolean;
  onOpenDrawer: () => void;
  onOpenSearch: () => void;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
}

export function Topbar({ drawerOpen, onOpenDrawer, onOpenSearch, menuButtonRef }: TopbarProps) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  // Same rule the reports page uses: viewers can't create reports, so don't offer it.
  const canWrite = profile ? profile.user.role !== 'viewer' : false;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface/90 px-4 backdrop-blur sm:gap-3 sm:px-8">
      <button
        ref={menuButtonRef}
        type="button"
        aria-label={t('nav.menu')}
        aria-expanded={drawerOpen}
        aria-controls="mobile-drawer"
        onClick={onOpenDrawer}
        className="-ml-1.5 inline-flex size-9 items-center justify-center rounded-[var(--radius-md)] text-text transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus lg:hidden"
      >
        <Menu aria-hidden size={20} />
      </button>

      <TopbarBreadcrumb />

      <button
        type="button"
        onClick={onOpenSearch}
        aria-keyshortcuts="Meta+K Control+K"
        className="hidden h-9 w-72 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-left text-sm text-text-muted transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:flex"
      >
        <Search aria-hidden size={16} />
        <span className="flex-1 truncate">{t('shell.search')}</span>
        <kbd className="rounded border border-border bg-surface-muted px-1.5 font-sans text-[11px] text-text-muted">
          ⌘K
        </kbd>
      </button>
      <IconAction label={t('shell.search')} onClick={onOpenSearch} className="md:hidden">
        <Search aria-hidden size={18} />
      </IconAction>

      {canWrite && (
        <Link
          to="/reports/new"
          aria-label={t('shell.newReport')}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] bg-primary px-3 text-sm font-semibold text-primary-contrast transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Plus aria-hidden size={16} />
          <span className="hidden sm:inline">{t('shell.newReport')}</span>
        </Link>
      )}

      <Link
        to="/ayuda"
        aria-label={t('shell.help')}
        title={t('shell.help')}
        className="hidden size-9 items-center justify-center rounded-[var(--radius-md)] text-text-muted transition-colors hover:bg-surface-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:inline-flex"
      >
        <CircleHelp aria-hidden size={18} />
      </Link>
      {/* Placeholder until notifications exist; aria-disabled keeps it focusable for the label. */}
      <IconAction
        label={`${t('shell.notifications')} · ${t('shell.comingSoon')}`}
        disabled
        className="hidden sm:inline-flex"
      >
        <Bell aria-hidden size={18} />
      </IconAction>
    </header>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  className = '',
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
        disabled ? 'cursor-default opacity-60' : 'hover:bg-surface-muted hover:text-text'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Group / page / sub-page, derived from the URL by the same rule as the sidebar's active
 * state. Record names (e.g. a pool's) are page data the shell doesn't load — see README.
 */
function TopbarBreadcrumb() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const recordLabel = useCurrentRecordLabel();
  const { group, item, subKey } = resolveRoute(pathname);
  if (!item) return <div className="flex-1" />;

  const crumbs: Crumb[] = [];
  if (group?.labelKey) crumbs.push({ label: t(group.labelKey) });
  crumbs.push({ label: t(item.labelKey), to: subKey ? item.to : undefined });
  if (subKey === 'shell.crumbs.detail' && recordLabel) {
    crumbs.push({ label: recordLabel });
  } else if (subKey === 'shell.crumbs.edit' && recordLabel) {
    // /reports/:id/edit → Informes › {record} › Editar
    crumbs.push({ label: recordLabel, to: pathname.replace(/\/edit\/?$/, '') });
    crumbs.push({ label: t(subKey) });
  } else if (subKey) {
    crumbs.push({ label: t(subKey) });
  }

  return <Breadcrumb items={crumbs} label={t('shell.breadcrumb')} className="flex-1" />;
}
