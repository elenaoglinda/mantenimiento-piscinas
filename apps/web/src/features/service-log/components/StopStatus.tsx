import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleCheck, CircleSlash } from 'lucide-react';
import { skipReason, stopEstado, type StopEstado } from '@piscinas/shared';
import { Button } from '../../../components/ui/Button.js';
import { Field, Textarea } from '../../../components/ui/Input.js';
import { Modal } from '../../../components/ui/Modal.js';
import { StatusPill } from '../../../components/ui/StatusPill.js';
import { cn, focusRing } from '../../../components/ui/utils.js';
import type { DbFailure } from '../../../lib/dbError.js';
import { reopenStop, skipStop } from '../lib/data.js';
import { ServiceLogAlert } from './ServiceLogAlert.js';

export interface StopState {
  id?: string;
  estado?: StopEstado | null;
  motivo?: string | null;
  report_id?: string | null;
}

const TONE = { pendiente: 'neutral', hecha: 'green', saltada: 'amber' } as const;

/** "Pendiente" / "Hecha" / "Saltada · Cliente ausente". Words, not just colour. */
export function StopStatusPill({ stop }: { stop: StopState }) {
  const { t } = useTranslation();
  const estado = stopEstado(stop);
  return (
    <span className="flex min-w-0 flex-col items-end">
      <StatusPill tone={TONE[estado]}>{t(`serviceLog.stops.estado.${estado}`)}</StatusPill>
      {estado === 'saltada' && stop.motivo && (
        <span className="max-w-40 truncate text-xs text-text-muted" title={stop.motivo}>
          {stop.motivo}
        </span>
      )}
    </span>
  );
}

/**
 * What a technician can do with a stop: a pending one can be visited or skipped (with a
 * reason); a skipped one can be undone; a done one links to its report.
 */
export function StopActions({
  stop,
  poolId,
  poolName,
  canWrite,
  onChanged,
}: {
  stop: StopState;
  poolId: string;
  poolName: string;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [skipping, setSkipping] = useState(false);
  const [failure, setFailure] = useState<DbFailure | null>(null);
  const estado = stopEstado(stop);
  // Before the migration reaches the database, stops have no id/state to change.
  const editable = canWrite && !!stop.id && stop.estado !== undefined;

  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      {estado === 'hecha' && stop.report_id ? (
        <Button asChild variant="ghost" size="sm">
          <Link
            to={`/reports/${stop.report_id}`}
            aria-label={`${t('serviceLog.stops.viewReport')}: ${poolName}`}
          >
            <CircleCheck aria-hidden size={14} />
            {t('serviceLog.stops.viewReport')}
          </Link>
        </Button>
      ) : null}
      {estado === 'pendiente' && canWrite && (
        <Button asChild variant="ghost" size="sm">
          <Link to={`/reports/new?poolId=${poolId}`}>{t('routes.startVisit')}</Link>
        </Button>
      )}
      {estado === 'pendiente' && editable && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${t('serviceLog.stops.skip')}: ${poolName}`}
          onClick={() => setSkipping(true)}
        >
          <CircleSlash aria-hidden size={14} />
          {t('serviceLog.stops.skip')}
        </Button>
      )}
      {estado === 'saltada' && editable && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${t('serviceLog.stops.undo')}: ${poolName}`}
          onClick={async () => {
            const f = await reopenStop(stop.id!);
            setFailure(f);
            if (!f) onChanged();
          }}
        >
          {t('serviceLog.stops.undo')}
        </Button>
      )}
      {failure && <ServiceLogAlert failure={failure} compact />}
      {skipping && (
        <SkipModal
          poolName={poolName}
          onClose={() => setSkipping(false)}
          onSkip={async (motivo) => {
            const f = await skipStop(stop.id!, motivo);
            if (f) return f;
            setSkipping(false);
            onChanged();
            return null;
          }}
        />
      )}
    </span>
  );
}

function SkipModal({
  poolName,
  onClose,
  onSkip,
}: {
  poolName: string;
  onClose: () => void;
  onSkip: (motivo: string) => Promise<DbFailure | null>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<DbFailure | null>(null);
  const reasons = t('serviceLog.stops.reasons', { returnObjects: true }) as string[];
  const motivo = skipReason(text);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!motivo) return;
    setSaving(true);
    setFailure(await onSkip(motivo));
    setSaving(false);
  }

  return (
    <Modal open onClose={onClose} title={t('serviceLog.stops.skipTitle', { name: poolName })}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <ServiceLogAlert failure={failure} />
        <div
          role="group"
          aria-label={t('serviceLog.stops.quickReasons')}
          className="flex flex-wrap gap-2"
        >
          {reasons.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={text === r}
              onClick={() => setText(r)}
              className={cn(
                'min-h-10 rounded-[var(--radius-full)] border px-3.5 text-sm font-medium transition-colors',
                focusRing,
                text === r
                  ? 'border-accent bg-accent-soft text-navy-800'
                  : 'border-border bg-surface text-text hover:bg-surface-muted',
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <Field label={t('serviceLog.stops.reason')} hint={t('serviceLog.stops.reasonHint')}>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving} disabled={!motivo}>
            {t('serviceLog.stops.confirmSkip')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
