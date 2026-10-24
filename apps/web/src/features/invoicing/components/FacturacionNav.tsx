import { useTranslation } from 'react-i18next';
import { StatusPill } from '../../../components/ui/StatusPill.js';
import { TabsNav } from '../../../components/ui/Tabs.js';

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
    <TabsNav
      label={t('invoicing.sectionTitle')}
      items={ITEMS.map((item) => ({
        to: item.to,
        end: item.end,
        label: t(`invoicing.nav.${item.key}`),
        disabled: item.soon,
        hint: item.soon ? t('invoicing.nav.soon') : undefined,
      }))}
    />
  );
}

/**
 * Which Veri*Factu environment is in use. Always visible while in test, because the one thing
 * nobody should ever be unsure of is whether an invoice just reached the real AEAT.
 */
export function TestEnvBadge() {
  const { t } = useTranslation();
  return <StatusPill tone="amber">{t('invoicing.testBadge')}</StatusPill>;
}
