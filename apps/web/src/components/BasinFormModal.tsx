import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { Modal } from './ui/Modal.js';
import { Button } from './ui/Button.js';
import { TextField } from './ui/TextField.js';
import { SelectField, TextareaField } from './ui/fields.js';
import { Alert } from './ui/feedback.js';
import type { Enums, Tables } from '../lib/database.types.js';

type Basin = Tables<'basin'>;
type BasinClass = Enums<'basin_class'>;

const BASIN_CLASSES: BasinClass[] = ['cubierto', 'descubierto', 'mixto'];

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

export function BasinFormModal({
  basin,
  poolId,
  orgId,
  onClose,
  onSaved,
}: {
  basin: Basin | null;
  poolId: string;
  orgId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [denominacion, setDenominacion] = useState(basin?.denominacion ?? '');
  const [clase, setClase] = useState<BasinClass | ''>(basin?.clase ?? '');
  const [tipoVaso, setTipoVaso] = useState((basin?.tipo_vaso ?? []).join(', '));
  const [capacidad, setCapacidad] = useState(basin?.capacidad_m3?.toString() ?? '');
  const [lamina, setLamina] = useState(basin?.lamina_m2?.toString() ?? '');
  const [profMax, setProfMax] = useState(basin?.prof_max?.toString() ?? '');
  const [profMin, setProfMin] = useState(basin?.prof_min?.toString() ?? '');
  const [siloeCodV, setSiloeCodV] = useState(basin?.siloe_cod_v ?? '');
  const [observaciones, setObservaciones] = useState(basin?.observaciones ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      denominacion: denominacion.trim(),
      clase: clase || null,
      tipo_vaso: tipoVaso
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      capacidad_m3: numOrNull(capacidad),
      lamina_m2: numOrNull(lamina),
      prof_max: numOrNull(profMax),
      prof_min: numOrNull(profMin),
      siloe_cod_v: siloeCodV.trim() || null,
      observaciones: observaciones.trim() || null,
    };
    const { error } = basin
      ? await supabase.from('basin').update(payload).eq('id', basin.id)
      : await supabase.from('basin').insert({ ...payload, pool_id: poolId, org_id: orgId });
    setSaving(false);
    if (error) {
      setError(t('common.genericError'));
      return;
    }
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={basin ? t('basins.editBasin') : t('basins.addBasin')}>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        {error && <Alert tone="error">{error}</Alert>}
        <TextField
          label={t('basins.denominacion')}
          required
          value={denominacion}
          onChange={(e) => setDenominacion(e.target.value)}
        />
        <SelectField
          label={t('basins.clase')}
          value={clase}
          onChange={(e) => setClase(e.target.value as BasinClass | '')}
        >
          <option value="">{t('common.none')}</option>
          {BASIN_CLASSES.map((c) => (
            <option key={c} value={c}>
              {t(`basinClass.${c}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('basins.tipoVaso')}
          value={tipoVaso}
          onChange={(e) => setTipoVaso(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('basins.capacidad')}
            inputMode="decimal"
            value={capacidad}
            onChange={(e) => setCapacidad(e.target.value)}
          />
          <TextField
            label={t('basins.lamina')}
            inputMode="decimal"
            value={lamina}
            onChange={(e) => setLamina(e.target.value)}
          />
          <TextField
            label={t('basins.profMax')}
            inputMode="decimal"
            value={profMax}
            onChange={(e) => setProfMax(e.target.value)}
          />
          <TextField
            label={t('basins.profMin')}
            inputMode="decimal"
            value={profMin}
            onChange={(e) => setProfMin(e.target.value)}
          />
        </div>
        <TextField
          label={t('basins.siloeCodV')}
          hint={t('basins.siloeCodVHint')}
          value={siloeCodV}
          onChange={(e) => setSiloeCodV(e.target.value)}
        />
        <TextareaField
          label={t('basins.observaciones')}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
