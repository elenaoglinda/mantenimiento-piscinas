import { useTranslation } from 'react-i18next';
import { Alert, Card } from '../../../components/ui/feedback.js';
import { Button } from '../../../components/ui/Button.js';

/**
 * What to do about a record AEAT rejected.
 *
 * Deliberately not a single "corregir y reenviar" button. Verifacti restricts subsanación to
 * changes with **no fiscal repercussion**, so a rejection caused by a wrong amount, NIF or tax
 * rate cannot be fixed that way — it needs anulación plus a new invoice. Offering one generic
 * fix would quietly produce an illegal correction, so the user picks the cause and the options
 * follow from it.
 */
export function RejectionPanel({
  errorCode,
  errorMessage,
  busy,
  onResend,
  onSubsanar,
  onCancelAndReplace,
}: {
  errorCode: string | null;
  errorMessage: string | null;
  busy: boolean;
  onResend: () => void;
  onSubsanar: () => void;
  onCancelAndReplace: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Card>
      <h2 className="mb-2 text-base font-semibold text-status-red-text">
        {t('invoicing.rejection.title')}
      </h2>

      <Alert tone="error">
        <span className="block">{errorMessage ?? t('invoicing.rejection.noMessage')}</span>
        {errorCode && (
          <span className="mt-1 block font-mono text-xs">
            {t('invoicing.rejection.code')}: {errorCode}
          </span>
        )}
      </Alert>

      <p className="mt-3 text-sm text-text-muted">{t('invoicing.rejection.chooseCause')}</p>

      <div className="mt-3 flex flex-col gap-4">
        <Option
          title={t('invoicing.rejection.formalTitle')}
          body={t('invoicing.rejection.formalBody')}
          action={
            <Button onClick={onResend} loading={busy}>
              {t('invoicing.rejection.resend')}
            </Button>
          }
        />
        <Option
          title={t('invoicing.rejection.nonFiscalTitle')}
          body={t('invoicing.rejection.nonFiscalBody')}
          action={
            <Button variant="secondary" onClick={onSubsanar} loading={busy}>
              {t('invoicing.rejection.subsanar')}
            </Button>
          }
        />
        <Option
          title={t('invoicing.rejection.fiscalTitle')}
          body={t('invoicing.rejection.fiscalBody')}
          action={
            <Button variant="secondary" onClick={onCancelAndReplace} loading={busy}>
              {t('invoicing.cancelAndReplace')}
            </Button>
          }
        />
      </div>
    </Card>
  );
}

function Option({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">{title}</p>
        <p className="text-sm text-text-muted">{body}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
