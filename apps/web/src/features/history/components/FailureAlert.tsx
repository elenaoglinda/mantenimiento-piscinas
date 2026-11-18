import { useTranslation } from 'react-i18next';
import { Alert } from '../../../components/ui/feedback.js';
import type { DbFailure } from '../../../lib/dbError.js';

/** A failed history query, said plainly. Never an empty list that looks like "no visits". */
export function FailureAlert({ failure }: { failure: DbFailure | null }) {
  const { t } = useTranslation();
  if (!failure) return null;
  return (
    <Alert tone="error">
      <span>{t(`history.db.${failure.code}`, { defaultValue: t('history.db.unknown') })}</span>
      {failure.code === 'unknown' && failure.detail && (
        <span className="mt-1 block font-mono text-xs">{failure.detail}</span>
      )}
    </Alert>
  );
}
