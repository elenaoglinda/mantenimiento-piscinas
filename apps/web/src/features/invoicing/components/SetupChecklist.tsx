import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../components/ui/feedback.js';
import { Button } from '../../../components/ui/Button.js';

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
        <Link to="/invoices/settings">
          <Button variant={hasFiscal ? 'ghost' : 'primary'}>
            {hasFiscal ? t('common.edit') : t('invoicing.editFiscal')}
          </Button>
        </Link>
      ) : null,
    },
    {
      done: hasSeries,
      label: t('invoicing.step2'),
      action:
        canWrite && !hasSeries ? (
          <Button onClick={onCreateSeries} loading={busy}>
            {t('invoicing.createSeries')}
          </Button>
        ) : null,
    },
    { done: hasInvoice, label: t('invoicing.step3'), action: null },
  ];

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold text-text">{t('invoicing.setupTitle')}</h2>
      <ol className="flex flex-col gap-3">
        {steps.map((step, i) => (
          <li key={i} className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <span
                aria-hidden
                className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  step.done
                    ? 'bg-status-green/15 text-status-green-text'
                    : 'bg-surface-muted text-text-muted'
                }`}
              >
                {step.done ? '✓' : i + 1}
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
