import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronsUpDown,
  CircleHelp,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  X,
} from 'lucide-react';
import { useAuth } from '../../auth/context.js';
import { Logo } from '../../components/brand/Logo.js';
import { Avatar } from '../../components/ui/Avatar.js';
import { visibleGroups, type NavItem } from './nav.js';

/** Where "Ayuda" points until there is real help content. See README → follow-ups. */
const HELP_URL = 'https://cloro.app';

interface SidebarProps {
  /** `rail` is the desktop sidebar; `drawer` is the same content inside the mobile drawer. */
  variant: 'rail' | 'drawer';
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
}

export function Sidebar({ variant, collapsed = false, onToggleCollapse, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const groups = visibleGroups(profile?.org.type);
  const rail = variant === 'rail' && collapsed;

  return (
    <aside
      className={`flex h-full flex-col border-r border-border bg-sidebar transition-[width] duration-200 ${
        variant === 'drawer' ? 'w-full' : rail ? 'w-[68px]' : 'w-[248px]'
      }`}
    >
      {/* Brand + collapse control */}
      <div
        className={`flex h-14 shrink-0 items-center ${rail ? 'justify-center' : 'justify-between px-4'}`}
      >
        <Logo size="sm" markOnly={rail} />
        {variant === 'drawer' ? (
          <IconButton label={t('shell.closeMenu')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        ) : (
          !rail && (
            <IconButton label={t('shell.collapse')} onClick={onToggleCollapse}>
              <PanelLeftClose size={18} />
            </IconButton>
          )
        )}
      </div>

      {rail && (
        <div className="flex justify-center pb-2">
          <RailTooltip label={t('shell.expand')}>
            <IconButton label={t('shell.expand')} onClick={onToggleCollapse}>
              <PanelLeftOpen size={18} />
            </IconButton>
          </RailTooltip>
        </div>
      )}

      {/* Company row — a single company today, laid out for a switcher later. */}
      {!rail && profile && (
        <div className="mx-3 mb-3 flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-2.5 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text">{profile.org.name}</p>
            <p className="truncate text-xs text-text-muted">
              {profile.user.full_name ?? profile.user.email}
            </p>
          </div>
          <ChevronsUpDown aria-hidden size={14} className="shrink-0 text-text-muted" />
        </div>
      )}

      <nav aria-label={t('shell.mainNav')} className="flex-1 overflow-y-auto px-2 pb-3">
        {groups.map((group, gi) => (
          <div key={group.id} className={gi > 0 ? 'mt-4' : ''}>
            {group.labelKey &&
              (rail ? (
                <div aria-hidden className="mx-2 mb-2 h-px bg-border" />
              ) : (
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                  {t(group.labelKey)}
                </p>
              ))}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <SidebarLink item={item} rail={rail} onNavigate={onClose} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-border px-2 py-2">
        <RailTooltip label={t('shell.help')} enabled={rail}>
          <a
            href={HELP_URL}
            target="_blank"
            rel="noreferrer"
            aria-label={rail ? t('shell.help') : undefined}
            className={`flex h-9 items-center gap-3 rounded-[var(--radius-md)] text-sm font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              rail ? 'justify-center' : 'px-3'
            }`}
          >
            <CircleHelp aria-hidden size={18} />
            {!rail && t('shell.help')}
          </a>
        </RailTooltip>
        <UserCard rail={rail} />
      </div>
    </aside>
  );
}

function SidebarLink({
  item,
  rail,
  onNavigate,
}: {
  item: NavItem;
  rail: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const label = t(item.labelKey);
  const Icon = item.icon;

  return (
    <RailTooltip label={label} enabled={rail}>
      <NavLink
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        aria-label={rail ? label : undefined}
        className={({ isActive }) =>
          `relative flex h-9 items-center gap-3 rounded-[var(--radius-md)] text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
            rail ? 'justify-center' : 'px-3'
          } ${
            isActive
              ? 'bg-accent-soft text-navy-800'
              : 'text-text-muted hover:bg-surface-muted hover:text-text'
          }`
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span
                aria-hidden
                className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-accent"
              />
            )}
            <Icon aria-hidden size={18} className={isActive ? 'text-accent' : ''} />
            {!rail && <span className="truncate">{label}</span>}
          </>
        )}
      </NavLink>
    </RailTooltip>
  );
}

/** Avatar + name + role; opens a small menu with Ajustes and Cerrar sesión. */
function UserCard({ rail }: { rail: boolean }) {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled])')?.focus();

    const onPointer = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [
          ...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
        ];
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        items[(next + items.length) % items.length]?.focus();
        e.preventDefault();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!profile) return null;
  const name = profile.user.full_name ?? profile.user.email ?? '';
  const role = t(`roles.${profile.user.role}`);

  return (
    <div ref={wrapRef} className="relative mt-1">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        // Expanded, the visible name and role are the label (WCAG 2.5.3); the rail shows only
        // the avatar, so it needs one.
        aria-label={rail ? `${t('shell.userMenu')}: ${name}` : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2.5 rounded-[var(--radius-md)] py-1.5 text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
          rail ? 'justify-center' : 'px-2'
        }`}
      >
        <Avatar name={name} />
        {!rail && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-text">{name}</span>
              <span className="block truncate text-xs text-text-muted">{role}</span>
            </span>
            <ChevronsUpDown aria-hidden size={14} className="shrink-0 text-text-muted" />
          </>
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t('shell.userMenu')}
          className={`absolute z-50 w-56 rounded-[var(--radius-lg)] border border-border bg-surface p-1 shadow-card ${
            rail ? 'bottom-0 left-full ml-2' : 'bottom-full left-0 mb-2'
          }`}
        >
          <span
            role="menuitem"
            aria-disabled="true"
            tabIndex={-1}
            title={t('shell.comingSoon')}
            className="flex h-9 cursor-not-allowed items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 text-sm text-text-muted"
          >
            <Settings aria-hidden size={16} />
            {t('shell.settings')}
            <span className="ml-auto text-xs">{t('shell.comingSoon')}</span>
          </span>
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            className="flex h-9 w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 text-left text-sm text-text transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
          >
            <LogOut aria-hidden size={16} />
            {t('auth.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-[var(--radius-md)] text-text-muted transition-colors hover:bg-surface-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {children}
    </button>
  );
}

/**
 * Label to the right of an icon in the collapsed rail, on hover and on keyboard focus.
 * Positioned `fixed` from the trigger's rect so the nav's scroll container can't clip it.
 */
function RailTooltip({
  label,
  enabled = true,
  children,
}: {
  label: string;
  enabled?: boolean;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  if (!enabled) return <>{children}</>;

  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPos({ top: r.top + r.height / 2, left: r.right + 8 });
  };

  return (
    <span
      className="block"
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setPos(null)}
      onFocusCapture={(e) => show(e.currentTarget)}
      onBlurCapture={() => setPos(null)}
    >
      {children}
      {pos && (
        <span
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
          className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-sm)] bg-navy-900 px-2 py-1 text-xs font-medium text-white shadow-card"
        >
          {label}
        </span>
      )}
    </span>
  );
}
