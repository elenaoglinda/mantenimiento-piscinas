import { useTranslation } from 'react-i18next';
import { FlaskConical } from 'lucide-react';
import { formatQuantity } from '@piscinas/shared';
import type { VisitLog } from '../lib/useVisitLogs.js';

/** Products added at a visit, as a compact list. Used in Historial rows and the report detail. */
export function VisitLogDetails({
  log,
  headingLevel = 4,
}: {
  log: VisitLog;
  headingLevel?: 3 | 4;
}) {
  const { t } = useTranslation();
  const H = `h${headingLevel}` as const;
  if (log.products.length === 0) return null;
  return (
    <div>
      <H className="text-xs font-semibold tracking-[0.06em] text-text-muted uppercase">
        {t('serviceLog.products.title')}
      </H>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text">
        {log.products.map((p, i) => (
          <li key={i} className="inline-flex items-center gap-1.5">
            <FlaskConical aria-hidden size={14} className="text-text-muted" />
            {p.nombre}{' '}
            <span className="text-text-muted tabular-nums">
              {formatQuantity(p.cantidad, p.unidad)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The row icons: how many products were added (words for screen readers). */
export function VisitLogIcons({ log }: { log: VisitLog }) {
  const { t } = useTranslation();
  if (log.products.length === 0) return null;
  const label = t('serviceLog.products.count', { count: log.products.length });
  return (
    <span title={label} className="inline-flex items-center gap-0.5 text-xs text-text-muted">
      <FlaskConical aria-hidden size={14} />
      <span aria-hidden>{log.products.length}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
