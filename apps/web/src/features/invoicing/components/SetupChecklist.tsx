import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Card, CardHeader } from '../../../components/ui/Card.js';
import { Button } from '../../../components/ui/Button.js';
import { cn } from '../../../components/ui/utils.js';

/**
 * The three things that must exist before an invoice can be issued, as an ordered checklist
 * rather than a list of complaints. issue_invoice() refuses without the first two, so showing
 * them in order — with the next action always visible — is the difference between a dead end
 * and a path.
 */
export function SetupChecklist({
  hasFiscal,
  hasSeries,
  hasInvoice,
  canWrite,
  busy,
  onCreateSeries,
}: {
  hasFiscal: boolean;
  hasSeries: boolean;
  hasInvoice: boolean;
  canWrite: boolean;
  busy: boolean;
  onCreateSeries: () => void;
}) {
  const { t } = useTranslation();

  const steps = [
    {
      done: hasFiscal,
      label: t('invoicing.step1'),
      action: canWrite ? (
        <Button asChild size="sm" variant={hasFiscal ? 'ghost' : 'primary'}>
          <Link to="/invoices/settings">
            {hasFiscal ? t('common.edit') : t('invoicing.editFiscal')}
          </Link>
        </Button>
      ) : null,
    },
    {
      done: hasSeries,
      label: t('invoicing.step2'),
      action:
        canWrite && !hasSeries ? (
          <Button size="sm" onClick={onCreateSeries} loading={busy}>
            {t('invoicing.createSeries')}
          </Button>
        ) : null,
    },
    { done: hasInvoice, label: t('invoicing.step3'), action: null },
  ];

  const next = steps.findIndex((s) => !s.done);

  return (
    <Card>
      <CardHeader
        title={t('invoicing.setupTitle')}
        description={t('invoicing.newInvoiceBlocked')}
      />
      <ol className="flex flex-col">
        {steps.map((step, i) => (
          <li
            key={i}
            aria-current={i === next ? 'step' : undefined}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
          >
            <span className="flex items-center gap-3">
              <span
                aria-hidden
                className={cn(
                  'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  step.done
                    ? 'bg-status-green-bg text-status-green-text'
                    : i === next
                      ? 'bg-accent-soft text-navy-800'
                      : 'border border-border text-text-muted',
                )}
              >
                {step.done ? <Check size={14} /> : i + 1}
              </span>
              <span className={step.done ? 'text-text-muted line-through' : 'text-text'}>
                {step.label}
              </span>
            </span>
            {!step.done && step.action}
          </li>
        ))}
      </ol>
    </Card>
  );
}
