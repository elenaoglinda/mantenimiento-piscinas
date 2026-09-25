import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_TAX_RATE,
  amountToCents,
  formatEuros,
  formatInvoiceNumber,
  type TaxBreakdownRow,
} from '@piscinas/shared';
import { useAuth } from '../auth/context.js';
import {
  InvoiceSendError,
  addLine,
  deleteDraft,
  deleteLine,
  getInvoice,
  getTaxBreakdown,
  issueInvoice,
  refreshStatus,
  sendInvoice,
  type InvoiceWithRelations,
} from '../lib/invoicing.js';
import { Alert, Card, Spinner } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { TextField } from '../components/ui/TextField.js';
import { SendStatusBadge } from '../components/invoicing/SendStatusBadge.js';

export function InvoiceDetailPage() {
  const { t } = useTranslation();
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canWrite = profile ? profile.user.role !== 'viewer' : false;

  const [invoice, setInvoice] = useState<InvoiceWithRelations | null>(null);
  const [breakdown, setBreakdown] = useState<TaxBreakdownRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    const inv = await getInvoice(invoiceId);
    setInvoice(inv);
    setBreakdown(inv ? await getTaxBreakdown(invoiceId) : []);
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner />;
  if (!invoice) return <Alert tone="error">{t('invoicing.notFound')}</Alert>;

  const isDraft = invoice.status === 'draft';
  const lines = [...invoice.invoice_line].sort((a, b) => a.line_no - b.line_no);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (err) {
      setError(
        err instanceof InvoiceSendError
          ? t(`invoicing.error.${err.code}`, { defaultValue: err.message })
          : t('invoicing.error.failed'),
      );
    }
    await load();
    setBusy(false);
  }

  async function onAddLine() {
    const cents = amountToCents(price);
    const quantity = Number(qty.replace(',', '.'));
    if (!desc.trim() || cents == null || !Number.isFinite(quantity) || quantity <= 0) {
      setError(t('invoicing.error.invalidLine'));
      return;
    }
    await run(async () => {
      await addLine({
        orgId: invoice!.org_id,
        invoiceId: invoice!.id,
        lineNo: lines.length,
        description: desc.trim(),
        quantity,
        unitPriceCents: cents,
        taxRate: DEFAULT_TAX_RATE,
      });
      setDesc('');
      setQty('1');
      setPrice('');
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text">
            {formatInvoiceNumber(invoice.invoice_series?.code ?? '', invoice.number)}
          </h1>
          <p className="text-sm text-text-muted">
            {invoice.client?.name ?? '—'} · {invoice.descripcion}
          </p>
        </div>
        <SendStatusBadge status={invoice.status} sendStatus={invoice.send_status} />
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {info && <Alert tone="success">{info}</Alert>}

      {!isDraft && <Alert tone="info">{t('invoicing.immutableNotice')}</Alert>}

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-text">{t('invoicing.lines')}</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-text-muted">{t('invoicing.noLines')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-text-muted">
                  <th className="py-1 pr-2 font-medium">{t('invoicing.lineDescription')}</th>
                  <th className="py-1 pr-2 text-right font-medium">{t('invoicing.quantity')}</th>
                  <th className="py-1 pr-2 text-right font-medium">{t('invoicing.unitPrice')}</th>
                  <th className="py-1 pr-2 text-right font-medium">{t('invoicing.taxRate')}</th>
                  <th className="py-1 pr-2 text-right font-medium">{t('invoicing.lineTotal')}</th>
                  {isDraft && canWrite && <th className="py-1" />}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="py-2 pr-2 text-text">{l.description}</td>
                    <td className="py-2 pr-2 text-right text-text">{l.quantity}</td>
                    <td className="py-2 pr-2 text-right text-text">
                      {formatEuros(Number(l.unit_price_cents))}
                    </td>
                    <td className="py-2 pr-2 text-right text-text">{l.tax_rate}%</td>
                    <td className="py-2 pr-2 text-right text-text">
                      {formatEuros(Number(l.base_cents))}
                    </td>
                    {isDraft && canWrite && (
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          className="text-sm text-status-red hover:underline"
                          onClick={() => void run(() => deleteLine(l.id))}
                        >
                          {t('common.delete')}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {isDraft && canWrite && (
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <TextField
              label={t('invoicing.lineDescription')}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
            <TextField
              label={t('invoicing.quantity')}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
            />
            <TextField
              label={t('invoicing.unitPrice')}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              hint={t('invoicing.unitPriceHint')}
            />
            <div className="flex items-end">
              <Button variant="secondary" onClick={onAddLine} loading={busy}>
                {t('invoicing.addLine')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-text">{t('invoicing.totals')}</h2>
        <dl className="flex flex-col gap-1 text-sm">
          {breakdown.map((b) => (
            <div key={b.taxRate} className="flex justify-between">
              <dt className="text-text-muted">{t('invoicing.baseAtRate', { rate: b.taxRate })}</dt>
              <dd className="text-text">
                {formatEuros(b.baseCents)} + {formatEuros(b.quotaCents)}
              </dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt className="text-text">{t('invoicing.total')}</dt>
            <dd className="text-text">{formatEuros(Number(invoice.total_cents))}</dd>
          </div>
        </dl>
      </Card>

      {!isDraft && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-text">{t('invoicing.verifactu')}</h2>
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-text-muted">{t('invoicing.aeatEstado')}</dt>
              <dd className="text-text">{invoice.aeat_estado ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-muted">{t('invoicing.huella')}</dt>
              <dd className="truncate font-mono text-xs text-text">
                {invoice.verifacti_huella ?? '—'}
              </dd>
            </div>
            {invoice.last_error && (
              <div className="flex justify-between gap-3">
                <dt className="text-text-muted">{t('invoicing.lastError')}</dt>
                <dd className="truncate text-xs text-status-red">{invoice.last_error}</dd>
              </div>
            )}
          </dl>
          {invoice.aeat_url && (
            <a
              href={invoice.aeat_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              {t('invoicing.validateAtAeat')}
            </a>
          )}
        </Card>
      )}

      {canWrite && (
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <>
              <Button
                onClick={() =>
                  void run(async () => {
                    await issueInvoice(invoice!.id);
                    setInfo(t('invoicing.issued'));
                  })
                }
                loading={busy}
                disabled={lines.length === 0}
              >
                {t('invoicing.issue')}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void run(async () => {
                    await deleteDraft(invoice!.id);
                    navigate('/invoices');
                  })
                }
                loading={busy}
              >
                {t('invoicing.deleteDraft')}
              </Button>
            </>
          )}
          {!isDraft && invoice.send_status !== 'accepted' && (
            <Button
              onClick={() =>
                void run(async () => {
                  await sendInvoice(invoice!);
                  setInfo(t('invoicing.sent'));
                })
              }
              loading={busy}
            >
              {t('invoicing.send')}
            </Button>
          )}
          {!isDraft && (
            <Button
              variant="secondary"
              onClick={() => void run(() => refreshStatus(invoice!).then(() => undefined))}
              loading={busy}
            >
              {t('invoicing.refreshStatus')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
