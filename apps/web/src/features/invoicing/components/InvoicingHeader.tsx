import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../../components/ui/PageHeader.js';
import { FacturacionNav, TestEnvBadge } from './FacturacionNav.js';

/**
 * The header every Facturación tab shares: one section name (matching the sidebar), the test
 * environment badge, and the section tabs. Pages add their own actions.
 */
export function InvoicingHeader({
  actions,
  className,
}: {
  actions?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <PageHeader
      title={t('invoicing.sectionTitle')}
      description={t('invoicing.subtitle')}
      badges={<TestEnvBadge />}
      actions={actions}
      tabs={<FacturacionNav />}
      className={className}
    />
  );
}
