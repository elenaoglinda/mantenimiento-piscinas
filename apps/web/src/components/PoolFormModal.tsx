import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CCAA,
  CCAA_CODES,
  ccaaFromPostcode,
  isCcaaCode,
  resolveCcaa,
  type CcaaCode,
} from '@piscinas/shared';
import { supabase } from '../lib/supabase.js';
import { Modal } from './ui/Modal.js';
import { Button } from './ui/Button.js';
import { TextField } from './ui/TextField.js';
import { SelectField, TextareaField } from './ui/fields.js';
import { Alert } from './ui/feedback.js';
import { AddressAutocomplete, type AddressSuggestion } from './AddressAutocomplete.js';
import type { Enums, Tables } from '../lib/database.types.js';

type Pool = Tables<'pool'>;
type WaterSource = Enums<'water_source'>;
type PoolType = Enums<'pool_type'>;

const POOL_TYPES: PoolType[] = ['tipo_1', 'tipo_2', 'tipo_3a'];
const WATER_SOURCES: WaterSource[] = ['red_publica', 'mar', 'captacion_propia'];

/** The 19 communities in alphabetical order, for the select. */
const CCAA_OPTIONS = [...CCAA_CODES].sort((a, b) => CCAA[a].localeCompare(CCAA[b], 'es'));

interface ClientOption {
  id: string;
  name: string;
  is_self: boolean;
}

export function PoolFormModal({
  pool,
  orgId,
  isOwnerOrg,
  onClose,
  onSaved,
}: {
  pool: Pool | null;
  orgId: string;
  isOwnerOrg: boolean;
  onClose: () => void;
  onSaved: (poolId: string) => void;
}) {
  const { t } = useTranslation();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState(pool?.client_id ?? '');
  const [denominacion, setDenominacion] = useState(pool?.denominacion ?? '');
  const [poolType, setPoolType] = useState<PoolType | ''>(pool?.pool_type ?? '');
  const [aguas, setAguas] = useState<WaterSource[]>(pool?.agua_alimentacion ?? []);
  const [direccion, setDireccion] = useState(pool?.direccion ?? '');
  const [cp, setCp] = useState(pool?.cp ?? '');
  const [localidad, setLocalidad] = useState(pool?.localidad ?? '');
  const [municipio, setMunicipio] = useState(pool?.municipio ?? '');
  const [provincia, setProvincia] = useState(pool?.provincia ?? '');
  // Prefilled from the saved code, else from the address and the old free text. Once the user
  // picks one, the address never changes it again.
  const [ccaaCode, setCcaaCode] = useState<CcaaCode | ''>(() =>
    pool ? (isCcaaCode(pool.ccaa_code) ? pool.ccaa_code : (resolveCcaa(pool) ?? '')) : '',
  );
  const [ccaaChosen, setCcaaChosen] = useState(isCcaaCode(pool?.ccaa_code));
  const [lat, setLat] = useState(pool?.lat?.toString() ?? '');
  const [lng, setLng] = useState(pool?.lng?.toString() ?? '');
  const [siloeCodP, setSiloeCodP] = useState(pool?.siloe_cod_p ?? '');
  const [observaciones, setObservaciones] = useState(pool?.observaciones ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('client')
        .select('id, name, is_self')
        .eq('archived', false)
        .order('name');
      const opts = data ?? [];
      setClients(opts);
      if (!pool) {
        const self = opts.find((c) => c.is_self);
        if (isOwnerOrg && self) setClientId(self.id);
      }
    })();
  }, [pool, isOwnerOrg]);

  function toggleAgua(value: WaterSource) {
    setAguas((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function onAddressSelect(s: AddressSuggestion) {
    setDireccion(s.direccion);
    if (s.cp) setCp(s.cp);
    if (s.localidad) setLocalidad(s.localidad);
    if (s.provincia) setProvincia(s.provincia);
    const fromAddress = resolveCcaa({ cp: s.cp, provincia: s.provincia });
    if (!ccaaChosen && fromAddress) setCcaaCode(fromAddress);
    setLat(s.lat.toFixed(8));
    setLng(s.lng.toFixed(8));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setError(t('common.requiredField'));
      return;
    }
    setSaving(true);
    setError(null);
    const base = {
      client_id: clientId,
      denominacion: denominacion.trim(),
      pool_type: poolType || null,
      agua_alimentacion: aguas,
      direccion: direccion.trim() || null,
      cp: cp.trim() || null,
      localidad: localidad.trim() || null,
      municipio: municipio.trim() || null,
      provincia: provincia.trim() || null,
      // Expand step: the name also goes in the old text field, which older app versions read.
      ccaa: ccaaCode ? CCAA[ccaaCode] : (pool?.ccaa ?? null),
      lat: lat ? Number(lat) : null,
      lng: lng ? Number(lng) : null,
      siloe_cod_p: siloeCodP.trim() || null,
      observaciones: observaciones.trim() || null,
    };
    const payload = { ...base, ccaa_code: ccaaCode || null };
    const save = (row: typeof base) =>
      pool
        ? supabase.from('pool').update(row).eq('id', pool.id).select('id').single()
        : supabase
            .from('pool')
            .insert({ ...row, org_id: orgId })
            .select('id')
            .single();
    let { data, error } = await save(payload);
    // Until the pool_ccaa_code migration has run (previews use the production database), the
    // column doesn't exist: save without it; the name is still in `ccaa`.
    if (error?.code === 'PGRST204' && error.message.includes('ccaa_code')) {
      ({ data, error } = await save(base));
    }
    setSaving(false);
    if (error || !data) {
      setError(t('common.genericError'));
      return;
    }
    onSaved(data.id);
  }

  return (
    <Modal
      open
      variant="sheet"
      onClose={onClose}
      title={pool ? t('pools.editPool') : t('pools.addPool')}
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        {error && <Alert tone="error">{error}</Alert>}

        <TextField
          label={t('pools.denominacion')}
          required
          value={denominacion}
          onChange={(e) => setDenominacion(e.target.value)}
        />

        {!isOwnerOrg && (
          <SelectField
            label={t('pools.client')}
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="" disabled>
              —
            </option>
            {clients
              .filter((c) => !c.is_self)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </SelectField>
        )}

        <SelectField
          label={t('pools.poolType')}
          value={poolType}
          onChange={(e) => setPoolType(e.target.value as PoolType | '')}
        >
          <option value="">{t('common.none')}</option>
          {POOL_TYPES.map((pt) => (
            <option key={pt} value={pt}>
              {t(`poolType.${pt}`)}
            </option>
          ))}
        </SelectField>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-text">{t('pools.waterSource')}</legend>
          {WATER_SOURCES.map((ws) => (
            <label key={ws} className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                className="accent-primary"
                checked={aguas.includes(ws)}
                onChange={() => toggleAgua(ws)}
              />
              {t(`waterSource.${ws}`)}
            </label>
          ))}
        </fieldset>

        <AddressAutocomplete
          value={direccion}
          onTextChange={setDireccion}
          onSelect={onAddressSelect}
        />
        <p className="-mt-2 text-xs text-text-muted">{t('pools.addressManualHint')}</p>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('pools.cp')}
            value={cp}
            onChange={(e) => {
              setCp(e.target.value);
              const fromCp = ccaaFromPostcode(e.target.value);
              if (!ccaaChosen && fromCp) setCcaaCode(fromCp);
            }}
          />
          <TextField
            label={t('pools.localidad')}
            value={localidad}
            onChange={(e) => setLocalidad(e.target.value)}
          />
          <TextField
            label={t('pools.municipio')}
            value={municipio}
            onChange={(e) => setMunicipio(e.target.value)}
          />
          <TextField
            label={t('pools.provincia')}
            value={provincia}
            onChange={(e) => setProvincia(e.target.value)}
          />
        </div>
        <SelectField
          label={t('pools.ccaa')}
          hint={t('pools.ccaaHint')}
          value={ccaaCode}
          onChange={(e) => {
            setCcaaCode(isCcaaCode(e.target.value) ? e.target.value : '');
            setCcaaChosen(e.target.value !== '');
          }}
        >
          <option value="">{t('pools.ccaaNone')}</option>
          {CCAA_OPTIONS.map((code) => (
            <option key={code} value={code}>
              {CCAA[code]}
            </option>
          ))}
        </SelectField>

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('pools.lat')}
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
          <TextField
            label={t('pools.lng')}
            inputMode="decimal"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
        </div>

        <TextField
          label={t('pools.siloeCodP')}
          value={siloeCodP}
          onChange={(e) => setSiloeCodP(e.target.value)}
        />
        <TextareaField
          label={t('pools.observaciones')}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
        />

        {/* Kept in view at the bottom of the side panel while the long form scrolls. */}
        <div className="sticky -bottom-5 -mx-6 -mb-5 flex justify-end gap-2 border-t border-border bg-surface px-6 py-4">
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
