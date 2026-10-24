import {
  CircleHelp,
  ClipboardList,
  House,
  Settings,
  Receipt,
  Route,
  ShieldCheck,
  UserCog,
  Users,
  Waves,
  type LucideIcon,
} from 'lucide-react';

/**
 * The sidebar's information architecture, plus the route metadata the breadcrumb, the
 * command palette and `document.title` derive from. One table, so the three can't disagree.
 *
 * Pure data and pure functions — no React — so the routing rules are unit-tested directly.
 */
export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** Only an exact match activates it (needed for "/", which prefixes everything). */
  end?: boolean;
  /** Hidden for owner orgs, which only have their implicit self-client. */
  companyOnly?: boolean;
}

export interface NavGroup {
  id: string;
  /** Absent for the ungrouped top item (Inicio). */
  labelKey?: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'home', items: [{ to: '/', labelKey: 'nav.dashboard', icon: House, end: true }] },
  {
    id: 'operacion',
    labelKey: 'shell.groups.operacion',
    items: [
      { to: '/routes', labelKey: 'nav.routes', icon: Route },
      { to: '/pools', labelKey: 'nav.pools', icon: Waves },
      { to: '/reports', labelKey: 'nav.reports', icon: ClipboardList },
      { to: '/clients', labelKey: 'nav.clients', icon: Users, companyOnly: true },
    ],
  },
  {
    id: 'cumplimiento',
    labelKey: 'shell.groups.cumplimiento',
    items: [{ to: '/siloe', labelKey: 'nav.siloe', icon: ShieldCheck }],
  },
  {
    id: 'gestion',
    labelKey: 'shell.groups.gestion',
    items: [
      { to: '/invoices', labelKey: 'nav.invoicing', icon: Receipt },
      { to: '/team', labelKey: 'nav.team', icon: UserCog },
      // Planned, not rendered yet — add here when the feature exists:
      // { to: '/whatsapp', labelKey: 'nav.whatsappAgent', icon: MessageCircle },
      // { to: '/chemicals', labelKey: 'nav.chemicals', icon: FlaskConical },
    ],
  },
];

/**
 * Pages reached from the user menu and the help links rather than the main nav. They aren't
 * listed in the sidebar groups, but the breadcrumb, `document.title` and ⌘K still know them.
 */
export const UTILITY_PAGES: NavItem[] = [
  { to: '/settings', labelKey: 'shell.settings', icon: Settings },
  { to: '/ayuda', labelKey: 'shell.help', icon: CircleHelp },
];

/** Groups as a given org should see them: company-only items removed, empty groups dropped. */
export function visibleGroups(orgType: string | undefined): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.companyOnly || orgType === 'company'),
  })).filter((g) => g.items.length > 0);
}

/**
 * Sub-pages that sit under a nav item. Order matters: specific patterns before the generic
 * "/section/:id" detail pattern, so "/reports/new" isn't read as a report called "new".
 */
const SUB_PAGES: { pattern: RegExp; labelKey: string }[] = [
  { pattern: /^\/reports\/new\/?$/, labelKey: 'shell.crumbs.newReport' },
  { pattern: /^\/reports\/import\/?$/, labelKey: 'shell.crumbs.import' },
  { pattern: /^\/reports\/[^/]+\/edit\/?$/, labelKey: 'shell.crumbs.edit' },
  { pattern: /^\/invoices\/resumen\/?$/, labelKey: 'shell.crumbs.summary' },
  { pattern: /^\/invoices\/settings\/?$/, labelKey: 'shell.crumbs.settings' },
  { pattern: /^\/(pools|reports|invoices)\/[^/]+\/?$/, labelKey: 'shell.crumbs.detail' },
];

export interface ResolvedRoute {
  group?: NavGroup;
  item?: NavItem;
  /** Label key of the sub-page, when the path is deeper than the nav item itself. */
  subKey?: string;
}

/** Which nav item a path belongs to — the same rule that drives the sidebar's active state. */
export function resolveRoute(pathname: string): ResolvedRoute {
  let best: { group: NavGroup; item: NavItem } | undefined;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const matches = item.end
        ? pathname === item.to
        : pathname === item.to || pathname.startsWith(`${item.to}/`);
      if (matches && (!best || item.to.length > best.item.to.length)) best = { group, item };
    }
  }
  if (!best) {
    const utility = UTILITY_PAGES.find((u) => pathname === u.to || pathname.startsWith(`${u.to}/`));
    if (utility) return { item: utility };
  }
  const subKey = SUB_PAGES.find((s) => s.pattern.test(pathname))?.labelKey;
  return { group: best?.group, item: best?.item, subKey };
}
