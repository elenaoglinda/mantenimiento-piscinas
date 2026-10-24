import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_TAX_RATE,
  amountToCents,
  formatEuros,
  formatInvoiceNumber,
  type TaxBreakdownRow,
} from '@piscinas/shared';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../auth/context.js';
import {
  addLine,
  cancelAndReplace,
  cancelInvoice,
  createRectificativa,
  deleteDraft,
  deleteLine,
  getActivity,
  getAeatRecords,
  getInvoice,
  getTaxBreakdown,
  issueInvoice,
  markPaid,
  refreshStatus,
  sendInvoice,
  type InvoiceWithRelations,
} from '../lib/data.js';
import type { DbFailure } from '../../../lib/dbError.js';
import { Alert, Card, Spinner } from '../../../components/ui/feedback.js';
import { Button } from '../../../components/ui/Button.js';
import { TextField } from '../../../components/ui/TextField.js';
import { Modal } from '../../../components/ui/Modal.js';
import { DbFailureAlert } from '../components/DbFailureAlert.js';
import { FiscalStateBadge, PaymentBadge } from '../components/FiscalStateBadge.js';
import { InvoiceTimeline } from '../components/InvoiceTimeline.js';
import { RejectionPanel } from '../components/RejectionPanel.js';
import { RectificativaDialog } from '../components/RectificativaDialog.js';
import type { Tables } from '../../../lib/database.types.js';

export function InvoiceDetailPage() {
  const { t } = useTranslation();
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canWrite = profile ? profile.user.role !== 'viewer' : false;

  const [invoice, setInvoice] = useState<InvoiceWithRelations | null>(null);
  const [breakdown, setBreakdown] = useState<TaxBreakdownRow[]>([]);
  const [activity, setActivity] = useState<Tables<'invoice_activity'>[]>([]);
  const [records, setRecords] = useState<Tables<'invoice_aeat_record'>[]>([]);
  const [series, setSeries] = useState<Tables<'invoice_series'>[]>([]);
  const [rectificativa, setRectificativa] = useState<{ id: string; number: number | null } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DbFailure | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [rectOpen, setRectOpen] = useState(false);

  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    const { data: inv, failure: f } = await getInvoice(invoiceId);
    setInvoice(inv);
    if (inv) {
      const [bd, act, recs, ser, rect] = await Promise.all([
        getTaxBreakdown(invoiceId),
        getActivity(invoiceId),
        getAeatRecords(invoiceId),
        supabase.from('invoice_series').select('*').order('code'),
        supabase
          .from('invoice')
          .select('id, number')
          .eq('rectifies_invoice_id', invoiceId)
          .maybeSingle(),
      ]);
      setBreakdown(bd.data);
      setActivity(act.data);
      setRecords(recs.data);
      setSeries(ser.data ?? []);
      setRectificativa(rect.data ?? null);
      setFailure(f ?? bd.failure ?? act.failure);
    } else {
      setFailure(f);
    }
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner />;
  if (!invoice) {
    return (
      <div className="flex flex-col gap-3">
        <Link to="/invoices" className="text-sm text-accent hover:underline">
          ← {t('invoicing.backToInvoices')}
        </Link>
        <DbFailureAlert failure={failure} />
        {!failure && <Alert tone="error">{t('invoicing.notFound')}</Alert>}
      </div>
    );
  }

  const isDraft = invoice.status === 'draft';
  const isVoid = invoice.status === 'void';
  const lines = [...invoice.invoice_line].sort((a, b) => a.line_no - b.line_no);
  const openRecord = records.find((r) => !r.settled_at) ?? records[0] ?? null;

  async function run(fn: () => Promise<DbFailure | null | void>) {
    setBusy(true);
    setFailure(null);
    setInfo(null);
    const f = await fn();
    if (f) setFailure(f);
    await load();
    setBusy(false);
  }

  async function onAddLine() {
    const cents = amountToCents(price);
    const quantity = Number(qty.replace(',', '.'));
    if (!desc.trim() || cents == null || !Number.isFinite(quantity) || quantity <= 0) {
      setFailure({ code: 'rule', detail: t('invoicing.error.invalidLine') });
      return;
    }
    await run(async () => {
      const f = await addLine({
        orgId: invoice!.org_id,
        invoiceId: invoice!.id,
        lineNo: lines.length,
        description: desc.trim(),
        quantity,
        unitPriceCents: cents,
        taxRate: DEFAULT_TAX_RATE,
      });
      if (!f) {
        setDesc('');
        setQty('1');
        setPrice('');
      }
      return f;
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/invoices" className="text-sm text-accent hover:underline">
            ← {t('invoicing.backToInvoices')}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-text">
            {formatInvoiceNumber(invoice.invoice_series?.code ?? '', invoice.number)}
          </h1>
          <p className="truncate text-sm text-text-muted">
            {invoice.client?.name ?? '—'} · {invoice.descripcion}
          </p>
        </div>
        <span className="flex flex-wrap items-center gap-1.5">
          <FiscalStateBadge invoice={{ ...invoice, rectified: Boolean(rectificativa) }} />
          <PaymentBadge
            paymentStatus={invoice.payment_status}
            dueDate={invoice.due_date}
            status={invoice.status}
          />
        </span>
      </div>

      <DbFailureAlert failure={failure} />
      {info && <Alert tone="success">{info}</Alert>}

      {!isDraft && !isVoid && <Alert tone="info">{t('invoicing.immutableNotice')}</Alert>}

      {/* Where this invoice sits relative to its corrections. */}
      {(rectificativa || invoice.rectifies_invoice_id || invoice.replaced_by_invoice_id) && (
        <Card>
          <ul className="flex flex-col gap-1 text-sm">
            {rectificativa && (
              <li>
                {t('invoicing.link.rectifiedBy')}{' '}
                <Link to={`/invoices/${rectificativa.id}`} className="text-accent hover:underline">
                  {t('invoicing.link.open')}
                </Link>
              </li>
            )}
            {invoice.rectifies_invoice_id && (
              <li>
                {t('invoicing.link.rectifies')}{' '}
                <Link
                  to={`/invoices/${invoice.rectifies_invoice_id}`}
                  className="text-accent hover:underline"
                >
                  {t('invoicing.link.open')}
                </Link>
              </li>
            )}
            {invoice.replaced_by_invoice_id && (
              <li>
                {t('invoicing.link.replacedBy')}{' '}
                <Link
                  to={`/invoices/${invoice.replaced_by_invoice_id}`}
                  className="text-accent hover:underline"
                >
                  {t('invoicing.link.open')}
                </Link>
              </li>
            )}
          </ul>
        </Card>
      )}

      {invoice.send_status === 'rejected' && canWrite && (
        <RejectionPanel
          errorCode={openRecord?.error_code ?? null}
          errorMessage={openRecord?.error_message ?? invoice.last_error}
          busy={busy}
          onResend={() =>
            void run(async () => (await sendInvoice(invoice!, 'subsanacion')).failure)
          }
          onSubsanar={() =>
            void run(async () => (await sendInvoice(invoice!, 'subsanacion')).failure)
          }
          onCancelAndReplace={() =>
            void run(async () => {
              const { id, failure: f } = await cancelAndReplace(invoice!.id);
              if (id) navigate(`/invoices/${id}`);
              return f;
            })
          }
        />
      )}

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
                          className="text-sm text-status-red-text hover:underline"
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
            <Row label={t('invoicing.aeatEstado')} value={invoice.aeat_estado ?? '—'} />
            <Row label={t('invoicing.huella')} value={invoice.verifacti_huella ?? '—'} mono />
            {invoice.aeat_csv && <Row label="CSV" value={invoice.aeat_csv} mono />}
            {openRecord && (
              <Row label={t('invoicing.attempts')} value={String(openRecord.attempts)} />
            )}
          </dl>
          {invoice.aeat_url && (
            <a
              href={invoice.aeat_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm text-accent hover:underline"
            >
              {t('invoicing.validateAtAeat')}
            </a>
          )}
        </Card>
      )}

      <InvoiceTimeline entries={activity} />

      {canWrite && (
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <>
              <Button onClick={() => setConfirmIssue(true)} disabled={lines.length === 0}>
                {t('invoicing.issue')}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void run(async () => {
                    const f = await deleteDraft(invoice!.id);
                    if (!f) navigate('/invoices');
                    return f;
                  })
                }
                loading={busy}
              >
                {t('invoicing.deleteDraft')}
              </Button>
            </>
          )}

          {!isDraft && !isVoid && invoice.send_status !== 'accepted' && (
            <Button
              onClick={() =>
                void run(async () => {
                  const r = await sendInvoice(invoice!);
                  if (!r.failure && !r.skipped) setInfo(t('invoicing.sent'));
                  return r.failure;
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
              onClick={() => void run(async () => (await refreshStatus(invoice!)).failure)}
              loading={busy}
            >
              {t('invoicing.refreshStatus')}
            </Button>
          )}

          {!isDraft && !isVoid && (
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  void run(() => markPaid(invoice!.id, invoice!.payment_status !== 'paid'))
                }
                loading={busy}
              >
                {invoice.payment_status === 'paid'
                  ? t('invoicing.markUnpaid')
                  : t('invoicing.markPaid')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void run(() => cancelInvoice(invoice!.id))}
              >
                {t('invoicing.cancel')}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void run(async () => {
                    const { id, failure: f } = await cancelAndReplace(invoice!.id);
                    if (id) navigate(`/invoices/${id}`);
                    return f;
                  })
                }
              >
                {t('invoicing.cancelAndReplace')}
              </Button>
              {invoice.send_status === 'accepted' && !rectificativa && (
                <Button variant="secondary" onClick={() => setRectOpen(true)}>
                  {t('invoicing.rectificativa.action')}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {/* Issuing is irreversible: the number is allocated and the invoice is filed. */}
      <Modal
        open={confirmIssue}
        onClose={() => setConfirmIssue(false)}
        title={t('invoicing.confirmIssue.title')}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text">{t('invoicing.confirmIssue.body')}</p>
          <p className="text-sm text-text-muted">{t('invoicing.confirmIssue.remedy')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              loading={busy}
              onClick={() => {
                setConfirmIssue(false);
                void run(async () => {
                  try {
                    await issueInvoice(invoice!.id);
                    setInfo(t('invoicing.issued'));
                  } catch (err) {
                    return { code: 'rule', detail: (err as Error).message } as DbFailure;
                  }
                  return null;
                });
              }}
            >
              {t('invoicing.confirmIssue.confirm')}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmIssue(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </Modal>

      <RectificativaDialog
        open={rectOpen}
        onClose={() => setRectOpen(false)}
        series={series}
        originalSeriesId={invoice.series_id}
        busy={busy}
        onCreate={(input) => {
          setRectOpen(false);
          void run(async () => {
            const { id, failure: f } = await createRectificativa({
              invoiceId: invoice!.id,
              ...input,
            });
            if (id) navigate(`/invoices/${id}`);
            return f;
          });
        }}
      />
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className={`truncate text-text ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
