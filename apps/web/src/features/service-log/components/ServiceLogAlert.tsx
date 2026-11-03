import { useTranslation } from 'react-i18next';
import { Alert } from '../../../components/ui/feedback.js';
import type { DbFailure } from '../../../lib/dbError.js';

/**
 * A service-log query failed. `missing_schema` gets its own wording: it means this version of
 * the app is running against a database the service-log migrations haven't reached yet (a
 * preview before merge, or the minutes between deploy and migration).
 */
export function ServiceLogAlert({
  failure,
  compact = false,
}: {
  failure: DbFailure | null;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  if (!failure) return null;
  const message =
    failure.code === 'rule' && failure.detail
      ? failure.detail
      : t(`serviceLog.db.${failure.code}`, { defaultValue: t('serviceLog.db.unknown') });
  return (
    <Alert
      tone={failure.code === 'missing_schema' ? 'info' : 'error'}
      className={compact ? 'text-xs' : undefined}
    >
      {message}
    </Alert>
  );
}
