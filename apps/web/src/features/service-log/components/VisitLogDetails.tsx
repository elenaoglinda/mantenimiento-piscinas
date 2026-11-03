import { useTranslation } from 'react-i18next';
import { CircleCheck, CircleMinus, FlaskConical, ListChecks } from 'lucide-react';
import { doneCount, formatQuantity } from '@piscinas/shared';
import type { VisitLog } from '../lib/useVisitLogs.js';

/** Products added and tasks done at a visit. Used in Historial rows and the report detail. */
export function VisitLogDetails({
  log,
  headingLevel = 4,
}: {
  log: VisitLog;
  headingLevel?: 3 | 4;
}) {
  const { t } = useTranslation();
  const H = `h${headingLevel}` as const;
  if (log.products.length === 0 && log.tasks.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {log.products.length > 0 && (
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
      )}
      {log.tasks.length > 0 && (
        <div>
          <H className="text-xs font-semibold tracking-[0.06em] text-text-muted uppercase">
            {t('serviceLog.tasks.title')}
          </H>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {log.tasks.map((task, i) => (
              <li key={i} className="flex items-start gap-1.5">
                {task.hecho ? (
                  <CircleCheck
                    aria-hidden
                    size={14}
                    className="mt-0.5 shrink-0 text-status-green-text"
                  />
                ) : (
                  <CircleMinus aria-hidden size={14} className="mt-0.5 shrink-0 text-text-muted" />
                )}
                <span className={task.hecho ? 'text-text' : 'text-text-muted'}>
                  {task.nombre}
                  <span className="sr-only">
                    , {task.hecho ? t('serviceLog.tasks.done') : t('serviceLog.tasks.notDone')}
                  </span>
                  {task.nota && <span className="text-text-muted"> — {task.nota}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The row icons: products added and tasks done (words for screen readers). */
export function VisitLogIcons({ log }: { log: VisitLog }) {
  const { t } = useTranslation();
  const done = doneCount(log.tasks);
  const items = [
    log.products.length > 0 && {
      key: 'p',
      Icon: FlaskConical,
      n: log.products.length,
      label: t('serviceLog.products.count', { count: log.products.length }),
    },
    done > 0 && {
      key: 't',
      Icon: ListChecks,
      n: done,
      label: t('serviceLog.tasks.count', { count: done }),
    },
  ].filter(Boolean) as { key: string; Icon: typeof FlaskConical; n: number; label: string }[];
  return (
    <>
      {items.map(({ key, Icon, n, label }) => (
        <span
          key={key}
          title={label}
          className="inline-flex items-center gap-0.5 text-xs text-text-muted"
        >
          <Icon aria-hidden size={14} />
          <span aria-hidden>{n}</span>
          <span className="sr-only">{label}</span>
        </span>
      ))}
    </>
  );
}
