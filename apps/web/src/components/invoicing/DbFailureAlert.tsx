import { useTranslation } from 'react-i18next';
import { Alert } from '../ui/feedback.js';
import type { DbFailure } from '../../lib/dbError.js';

/**
 * Renders a database failure as something actionable.
 *
 * `missing_schema` and `missing_function` get their own wording because they mean the app is
 * deployed ahead of its migration — a deployment problem, not a user error, and one nobody can
 * guess at from an empty form.
 */
export function DbFailureAlert({ failure }: { failure: DbFailure | null }) {
  const { t } = useTranslation();
  if (!failure) return null;

  // Our own triggers raise in Spanish; show what the database actually said.
  const message =
    failure.code === 'rule' && failure.detail
      ? failure.detail
      : t(`invoicing.db.${failure.code}`, { defaultValue: t('invoicing.db.unknown') });

  return (
    <Alert tone="error">
      <span>{message}</span>
      {failure.code === 'unknown' && failure.detail && (
        <span className="mt-1 block font-mono text-xs opacity-80">{failure.detail}</span>
      )}
    </Alert>
  );
}
