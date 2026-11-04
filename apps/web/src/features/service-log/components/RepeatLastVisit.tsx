import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import {
  repeatVisit,
  type ChemicalProduct,
  type RepeatedVisit,
  type TaskDef,
} from '@piscinas/shared';
import { Button } from '../../../components/ui/Button.js';
import type { DbFailure } from '../../../lib/dbError.js';
import { fetchLastVisit } from '../lib/data.js';
import { ServiceLogAlert } from './ServiceLogAlert.js';

const dateFmt = /* @__PURE__ */ new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * "Repetir última visita" on a new report: copies the technician, products and tasks of this
 * vaso's last visit. Readings are never copied — they must be measured — and the message says
 * so every time.
 */
export function RepeatLastVisit({
  basinId,
  products,
  taskDefs,
  onRepeat,
}: {
  basinId: string;
  products: ChemicalProduct[];
  taskDefs: TaskDef[];
  onRepeat: (visit: RepeatedVisit) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<DbFailure | null>(null);

  async function run() {
    setBusy(true);
    setFailure(null);
    const { data, failure } = await fetchLastVisit(basinId);
    setBusy(false);
    if (failure) {
      setFailure(failure);
      return;
    }
    if (!data) {
      setMessage(t('serviceLog.repeat.none'));
      return;
    }
    const repeated = repeatVisit(data, products, taskDefs);
    onRepeat(repeated);
    const parts = [
      repeated.technicianId ? t('serviceLog.repeat.technician') : null,
      t('serviceLog.products.count', { count: repeated.chemicals.length }),
      t('serviceLog.tasks.count', { count: repeated.tasks.length }),
    ].filter(Boolean);
    setMessage(
      t('serviceLog.repeat.done', {
        date: dateFmt.format(new Date(data.visitedAt)),
        what: parts.join(', '),
      }) +
        (repeated.skipped ? ` ${t('serviceLog.repeat.skipped', { count: repeated.skipped })}` : ''),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" variant="secondary" loading={busy} onClick={() => void run()}>
          <RotateCcw aria-hidden size={16} />
          {t('serviceLog.repeat.action')}
        </Button>
      </div>
      <ServiceLogAlert failure={failure} />
      <p role="status" className="text-sm text-text-muted empty:hidden">
        {message && (
          <>
            {message}{' '}
            <strong className="font-medium text-text">{t('serviceLog.repeat.noReadings')}</strong>
          </>
        )}
      </p>
    </div>
  );
}
