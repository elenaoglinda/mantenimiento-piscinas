import { useTranslation } from 'react-i18next';
import { Card } from '../../../components/ui/feedback.js';
import type { Tables } from '../../../lib/database.types.js';

/**
 * The invoice's history, newest first. Append-only in the database — nothing here can edit it,
 * and neither can anything else: `invoice_activity` has no insert/update/delete policy, so only
 * the SECURITY DEFINER functions write to it. A timeline that can be rewritten is not evidence.
 */
export function InvoiceTimeline({ entries }: { entries: Tables<'invoice_activity'>[] }) {
  const { t } = useTranslation();

  if (entries.length === 0) {
    return (
      <Card>
        <h2 className="mb-2 text-lg font-semibold text-text">{t('invoicing.timeline')}</h2>
        <p className="text-sm text-text-muted">{t('invoicing.timelineEmpty')}</p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold text-text">{t('invoicing.timeline')}</h2>
      <ol className="flex flex-col gap-3">
        {entries.map((e) => {
          const payload = (e.payload ?? {}) as Record<string, unknown>;
          const detail = describe(payload);
          return (
            <li key={e.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
              <span className="text-sm font-medium text-text">
                {t(`invoicing.activity.${e.kind}`, { defaultValue: e.kind })}
              </span>
              {detail && <span className="font-mono text-xs text-text-muted">{detail}</span>}
              <span className="text-xs text-text-muted">
                {new Date(e.created_at).toLocaleString('es-ES')}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** Surfaces the few payload fields worth reading, rather than dumping raw JSON at the user. */
function describe(payload: Record<string, unknown>): string | null {
  const parts: string[] = [];
  const push = (label: string, key: string) => {
    const v = payload[key];
    if (typeof v === 'string' || typeof v === 'number') parts.push(`${label}: ${v}`);
  };
  push('serie', 'serie');
  push('nº', 'numero');
  push('estado', 'estado');
  push('huella', 'huella');
  push('CSV', 'csv');
  push('código', 'code');
  push('motivo', 'message');
  push('intento', 'attempt');
  push('tipo', 'tipo');
  return parts.length > 0 ? parts.join(' · ') : null;
}
