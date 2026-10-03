import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Secondary navigation for the Facturación section.
 *
 * A sub-nav rather than more top-level entries: the main nav already carries seven items, and
 * invoicing has six of its own. Items that are not built yet are rendered disabled rather than
 * hidden, so the shape of the section is visible and nobody wonders whether they missed a page.
 */
const ITEMS = [
  { to: '/invoices/resumen', key: 'resumen' },
  { to: '/invoices', key: 'facturas', end: true },
  { to: '/invoices/catalogo', key: 'catalogo', soon: true },
  { to: '/clients', key: 'clientes' },
  { to: '/invoices/informes', key: 'informes', soon: true },
  { to: '/invoices/settings', key: 'ajustes' },
];

export function FacturacionNav() {
  const { t } = useTranslation();
  return (
    <nav className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max items-center gap-1 border-b border-border pb-px">
        {ITEMS.map((item) =>
          item.soon ? (
            <li key={item.key}>
              <span
                aria-disabled
                title={t('invoicing.nav.soon')}
                className="inline-block cursor-not-allowed rounded-t-[var(--radius-md)] px-3 py-2 text-sm text-text-muted opacity-50"
              >
                {t(`invoicing.nav.${item.key}`)}
              </span>
            </li>
          ) : (
            <li key={item.key}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `inline-block rounded-t-[var(--radius-md)] px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'border-b-2 border-primary font-medium text-primary'
                      : 'text-text-muted hover:text-text'
                  }`
                }
              >
                {t(`invoicing.nav.${item.key}`)}
              </NavLink>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}

/**
 * Which Veri*Factu environment is in use. Always visible while in test, because the one thing
 * nobody should ever be unsure of is whether an invoice just reached the real AEAT.
 */
export function TestEnvBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-status-amber/15 px-2.5 py-1 text-xs font-semibold text-status-amber">
      <span aria-hidden className="size-1.5 rounded-full bg-status-amber" />
      {t('invoicing.testBadge')}
    </span>
  );
}
