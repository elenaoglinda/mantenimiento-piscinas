import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, ChevronRight, CircleHelp, Menu, Plus, Search } from 'lucide-react';
import { useAuth } from '../../auth/context.js';
import { resolveRoute } from './nav.js';

const HELP_URL = 'https://cloro.app';

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

      <Breadcrumb />

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

      <a
        href={HELP_URL}
        target="_blank"
        rel="noreferrer"
        aria-label={t('shell.help')}
        title={t('shell.help')}
        className="hidden size-9 items-center justify-center rounded-[var(--radius-md)] text-text-muted transition-colors hover:bg-surface-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:inline-flex"
      >
        <CircleHelp aria-hidden size={18} />
      </a>
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
function Breadcrumb() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { group, item, subKey } = resolveRoute(pathname);
  if (!item) return <div className="flex-1" />;

  const crumbs: { label: string; to?: string }[] = [];
  if (group?.labelKey) crumbs.push({ label: t(group.labelKey) });
  crumbs.push({ label: t(item.labelKey), to: subKey ? item.to : undefined });
  if (subKey) crumbs.push({ label: t(subKey) });

  return (
    <nav aria-label={t('shell.breadcrumb')} className="min-w-0 flex-1">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li
              key={i}
              // On phones only the current page fits; the trail returns from `sm` up.
              className={`min-w-0 items-center gap-1.5 ${last ? 'flex' : 'hidden sm:flex'}`}
            >
              {i > 0 && (
                <ChevronRight
                  aria-hidden
                  size={14}
                  className="hidden shrink-0 text-text-muted sm:block"
                />
              )}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-text">
                  {c.label}
                </span>
              ) : c.to ? (
                <Link to={c.to} className="truncate text-text-muted hover:text-text">
                  {c.label}
                </Link>
              ) : (
                <span className="truncate text-text-muted">{c.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
