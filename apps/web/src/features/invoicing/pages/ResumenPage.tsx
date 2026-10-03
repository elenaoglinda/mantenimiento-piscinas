import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatEuros, isOverdue, madridToday } from '@piscinas/shared';
import { listInvoices, needingAttention, type InvoiceWithRelations } from '../lib/data.js';
import type { DbFailure } from '../../../lib/dbError.js';
import { Card, Spinner } from '../../../components/ui/feedback.js';
import { DbFailureAlert } from '../components/DbFailureAlert.js';
import { FacturacionNav, TestEnvBadge } from '../components/FacturacionNav.js';

/**
 * Billing at a glance. Deliberately small: four numbers that answer "is anything wrong, and how
 * much money is outstanding". Everything here is derived from the invoice list, so it cannot
 * disagree with the Facturas table.
 */
export function ResumenPage() {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<InvoiceWithRelations[]>([]);
  const [attention, setAttention] = useState<{ invoice_id: string; reason: string }[]>([]);
  const [failure, setFailure] = useState<DbFailure | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [rows, att] = await Promise.all([listInvoices(), needingAttention()]);
    setInvoices(rows.data);
    setAttention(att.data);
    setFailure(rows.failure ?? att.failure);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner />;

  const month = madridToday().slice(0, 7);
  const issued = invoices.filter((i) => i.status !== 'draft');
  const billedThisMonth = issued
    .filter((i) => (i.issue_date ?? '').startsWith(month))
    .reduce((n, i) => n + Number(i.total_cents), 0);
  const outstanding = issued
    .filter((i) => i.payment_status === 'pending' && i.status !== 'void')
    .reduce((n, i) => n + Number(i.total_cents), 0);
  const overdue = issued.filter(
    (i) => i.status !== 'void' && isOverdue(i.due_date, i.payment_status),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text">{t('invoicing.title')}</h1>
        <TestEnvBadge />
      </div>
      <FacturacionNav />
      <DbFailureAlert failure={failure} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('invoicing.resumen.billedMonth')} value={formatEuros(billedThisMonth)} />
        <Stat label={t('invoicing.resumen.outstanding')} value={formatEuros(outstanding)} />
        <Stat
          label={t('invoicing.resumen.overdue')}
          value={String(overdue.length)}
          tone={overdue.length > 0 ? 'red' : undefined}
        />
        <Stat
          label={t('invoicing.resumen.attention')}
          value={String(attention.length)}
          tone={attention.length > 0 ? 'red' : undefined}
        />
      </div>

      <Card>
        <h2 className="mb-2 text-lg font-semibold text-text">{t('invoicing.resumen.attention')}</h2>
        {attention.length === 0 ? (
          <p className="text-sm text-text-muted">{t('invoicing.resumen.allClear')}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {attention.map((a) => {
              const inv = invoices.find((i) => i.id === a.invoice_id);
              return (
                <li key={a.invoice_id} className="flex flex-wrap justify-between gap-2">
                  <Link to={`/invoices/${a.invoice_id}`} className="text-primary hover:underline">
                    {inv?.invoice_series?.code ?? ''}/{inv?.number ?? '—'} ·{' '}
                    {inv?.client?.name ?? ''}
                  </Link>
                  <span className="text-status-red">
                    {t(`invoicing.resumen.reason.${a.reason}`, { defaultValue: a.reason })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'red' }) {
  return (
    <Card>
      <p className="text-sm text-text-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${tone === 'red' ? 'text-status-red' : 'text-text'}`}
      >
        {value}
      </p>
    </Card>
  );
}
