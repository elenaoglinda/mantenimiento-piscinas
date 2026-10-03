import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../components/ui/Modal.js';
import { Button } from '../../../components/ui/Button.js';
import { SelectField } from '../../../components/ui/fields.js';
import { Alert } from '../../../components/ui/feedback.js';
import type { Tables } from '../../../lib/database.types.js';

const TIPOS = ['R1', 'R2', 'R3', 'R4', 'R5'] as const;

/**
 * Create a rectificativa from an accepted invoice.
 *
 * Two things the regulation forces into the UI:
 *  - the series must be a **different** one (RD 1619/2012 requires a serie específica), so only
 *    other series are offered and the RPC refuses if the original's is chosen anyway;
 *  - the correction mode is explicit. "Por diferencias" states only the delta; "por sustitución"
 *    restates the whole invoice and carries the rectified base and quota.
 */
export function RectificativaDialog({
  open,
  onClose,
  series,
  originalSeriesId,
  busy,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  series: Tables<'invoice_series'>[];
  originalSeriesId: string;
  busy: boolean;
  onCreate: (input: { tipo: string; modo: 'S' | 'I'; seriesId: string }) => void;
}) {
  const { t } = useTranslation();
  const [tipo, setTipo] = useState<string>('R1');
  const [modo, setModo] = useState<'S' | 'I'>('I');
  const [seriesId, setSeriesId] = useState('');

  const eligible = series.filter((s) => s.id !== originalSeriesId && !s.archived);

  return (
    <Modal open={open} onClose={onClose} title={t('invoicing.rectificativa.title')}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-muted">{t('invoicing.rectificativa.intro')}</p>

        {eligible.length === 0 && (
          <Alert tone="error">{t('invoicing.rectificativa.needsOtherSeries')}</Alert>
        )}

        <SelectField
          label={t('invoicing.rectificativa.tipo')}
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
        >
          {TIPOS.map((x) => (
            <option key={x} value={x}>
              {x} — {t(`invoicing.rectificativa.tipos.${x}`)}
            </option>
          ))}
        </SelectField>

        <SelectField
          label={t('invoicing.rectificativa.modo')}
          value={modo}
          onChange={(e) => setModo(e.target.value as 'S' | 'I')}
        >
          <option value="I">{t('invoicing.rectificativa.modoI')}</option>
          <option value="S">{t('invoicing.rectificativa.modoS')}</option>
        </SelectField>

        <SelectField
          label={t('invoicing.rectificativa.series')}
          value={seriesId}
          onChange={(e) => setSeriesId(e.target.value)}
        >
          <option value="">—</option>
          {eligible.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code}
            </option>
          ))}
        </SelectField>
        <p className="-mt-1 text-xs text-text-muted">{t('invoicing.rectificativa.seriesHint')}</p>

        <div className="mt-1 flex flex-wrap gap-2">
          <Button
            onClick={() => onCreate({ tipo, modo, seriesId })}
            loading={busy}
            disabled={!seriesId}
          >
            {t('invoicing.rectificativa.create')}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
