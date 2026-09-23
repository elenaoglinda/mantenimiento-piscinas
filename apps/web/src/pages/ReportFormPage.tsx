import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { evaluate, type ParameterStatus } from '@piscinas/shared';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import {
  fetchResolvedParameterDefs,
  toEvaluatorDef,
  LAB_PARAM_IDS,
  type ParameterDefRow,
} from '../lib/parameters.js';
import { Alert, Card, Spinner } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { TextField } from '../components/ui/TextField.js';
import { SelectField, TextareaField } from '../components/ui/fields.js';
import { StatusChip } from '../components/ui/StatusChip.js';
import type { Enums } from '../lib/database.types.js';

type Lugar = Enums<'measurement_lugar'>;
type AnalysisType = Enums<'analysis_type'>;

interface PoolOption {
  id: string;
  denominacion: string;
  ccaa: string | null;
  basin: { id: string; denominacion: string }[];
}

interface MeasurementInput {
  value: string;
  lugar: Lugar;
}

interface IncidentInput {
  description: string;
  corrective_action: string;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function ReportFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { reportId } = useParams();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();

  const [pools, setPools] = useState<PoolOption[]>([]);
  const [poolId, setPoolId] = useState(searchParams.get('poolId') ?? '');
  const [basinId, setBasinId] = useState(searchParams.get('basinId') ?? '');
  const [analysisType, setAnalysisType] = useState<AnalysisType>('autocontrol');
  const [puntoMuestreo, setPuntoMuestreo] = useState('2');
  const [visitedAt, setVisitedAt] = useState(toLocalInput(new Date().toISOString()));
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  const [defs, setDefs] = useState<ParameterDefRow[]>([]);
  const [values, setValues] = useState<Record<string, MeasurementInput>>({});
  const [incidents, setIncidents] = useState<IncidentInput[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  const selectedPool = useMemo(() => pools.find((p) => p.id === poolId), [pools, poolId]);

  // Load pools (+ basins) once, and the existing report if editing.
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: poolData } = await supabase
        .from('pool')
        .select('id, denominacion, ccaa, basin(id, denominacion)')
        .eq('archived', false)
        .order('denominacion');
      if (!active) return;
      setPools((poolData as PoolOption[]) ?? []);

      if (reportId) {
        const [{ data: rep }, { data: meas }, { data: incs }] = await Promise.all([
          supabase.from('report').select('*').eq('id', reportId).maybeSingle(),
          supabase.from('measurement').select('*').eq('report_id', reportId),
          supabase.from('incident').select('*').eq('report_id', reportId),
        ]);
        if (!active) return;
        if (rep) {
          setPoolId(rep.pool_id);
          setBasinId(rep.basin_id);
          setAnalysisType(rep.analysis_type);
          setPuntoMuestreo(String(rep.punto_muestreo ?? 2));
          setVisitedAt(toLocalInput(rep.visited_at));
          setLat(rep.location_lat);
          setLng(rep.location_lng);
          setNotes(rep.notes ?? '');
          const vmap: Record<string, MeasurementInput> = {};
          for (const m of meas ?? [])
            vmap[m.parameter_def_id] = { value: m.value?.toString() ?? '', lugar: m.lugar };
          setValues(vmap);
          setIncidents(
            (incs ?? []).map((i) => ({
              description: i.description,
              corrective_action: i.corrective_action ?? '',
            })),
          );
        }
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [reportId]);

  // Load resolved parameter defs whenever the pool (region) changes.
  const loadDefs = useCallback(async (ccaa: string | null) => {
    setDefs(await fetchResolvedParameterDefs(ccaa));
  }, []);
  useEffect(() => {
    if (selectedPool) void loadDefs(selectedPool.ccaa);
  }, [selectedPool, loadDefs]);

  function setValue(defId: string, patch: Partial<MeasurementInput>, siloeId: number) {
    setValues((prev) => ({
      ...prev,
      [defId]: {
        value: prev[defId]?.value ?? '',
        lugar: prev[defId]?.lugar ?? (LAB_PARAM_IDS.has(siloeId) ? 'lab' : 'in_situ'),
        ...patch,
      },
    }));
  }

  function captureLocation() {
    setGeoMsg(null);
    if (!navigator.geolocation) {
      setGeoMsg(t('reports.locationError'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Number(pos.coords.latitude.toFixed(8)));
        setLng(Number(pos.coords.longitude.toFixed(8)));
        setGeoMsg(t('reports.locationCaptured'));
      },
      () => setGeoMsg(t('reports.locationError')),
    );
  }

  async function save(status: 'draft' | 'completed') {
    if (!profile || !poolId || !basinId) {
      setError(t('common.requiredField'));
      return;
    }
    const entered = defs
      .map((d) => ({ d, input: values[d.id] }))
      .filter((x) => x.input && x.input.value.trim() !== '');

    if (status === 'completed' && entered.length === 0) {
      setError(t('reports.completedRequiresValues'));
      return;
    }

    setSaving(true);
    setError(null);

    const reportPayload = {
      pool_id: poolId,
      basin_id: basinId,
      analysis_type: analysisType,
      punto_muestreo: Number(puntoMuestreo),
      visited_at: new Date(visitedAt).toISOString(),
      location_lat: lat,
      location_lng: lng,
      notes: notes.trim() || null,
      status,
    };

    const { data: saved, error: repErr } = reportId
      ? await supabase.from('report').update(reportPayload).eq('id', reportId).select('id').single()
      : await supabase
          .from('report')
          .insert({ ...reportPayload, org_id: profile.org.id, technician_id: profile.user.id })
          .select('id')
          .single();

    if (repErr || !saved) {
      setSaving(false);
      setError(t('common.genericError'));
      return;
    }
    const rid = saved.id;

    // Replace children (simple + correct for online v1).
    await supabase.from('measurement').delete().eq('report_id', rid);
    await supabase.from('incident').delete().eq('report_id', rid);

    const measRows = entered.map(({ d, input }) => {
      const num = Number(input.value);
      const { status: st, compliant } = evaluate(num, toEvaluatorDef(d));
      const status: Enums<'measurement_status'> = st;
      return {
        org_id: profile.org.id,
        report_id: rid,
        parameter_def_id: d.id,
        value: num,
        lugar: input.lugar,
        compliant,
        status,
      };
    });
    if (measRows.length) await supabase.from('measurement').insert(measRows);

    const incRows = incidents
      .filter((i) => i.description.trim())
      .map((i) => ({
        org_id: profile.org.id,
        report_id: rid,
        description: i.description.trim(),
        corrective_action: i.corrective_action.trim() || null,
      }));
    if (incRows.length) await supabase.from('incident').insert(incRows);

    setSaving(false);
    navigate(`/reports/${rid}`);
  }

  if (loading) return <Spinner />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-text">
        {reportId ? t('reports.editReport') : t('reports.newReport')}
      </h1>
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="flex flex-col gap-4">
          <SelectField
            label={t('reports.pool')}
            value={poolId}
            onChange={(e) => {
              setPoolId(e.target.value);
              setBasinId('');
            }}
            disabled={!!reportId}
          >
            <option value="">{t('reports.selectPool')}</option>
            {pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.denominacion}
              </option>
            ))}
          </SelectField>

          {selectedPool && selectedPool.basin.length === 0 && (
            <Alert tone="info">{t('reports.noBasins')}</Alert>
          )}

          {selectedPool && selectedPool.basin.length > 0 && (
            <SelectField
              label={t('reports.basin')}
              value={basinId}
              onChange={(e) => setBasinId(e.target.value)}
              disabled={!!reportId}
            >
              <option value="">{t('reports.selectBasin')}</option>
              {selectedPool.basin.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.denominacion}
                </option>
              ))}
            </SelectField>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t('reports.analysisType')}
              value={analysisType}
              onChange={(e) => setAnalysisType(e.target.value as AnalysisType)}
            >
              <option value="autocontrol">{t('analysisType.autocontrol')}</option>
              <option value="vigilancia">{t('analysisType.vigilancia')}</option>
            </SelectField>
            <SelectField
              label={t('reports.puntoMuestreo')}
              value={puntoMuestreo}
              onChange={(e) => setPuntoMuestreo(e.target.value)}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {t(`puntoMuestreo.${n}`)}
                </option>
              ))}
            </SelectField>
          </div>

          <TextField
            label={t('reports.visitedAt')}
            type="datetime-local"
            value={visitedAt}
            onChange={(e) => setVisitedAt(e.target.value)}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={captureLocation}>
              {t('reports.useLocation')}
            </Button>
            {lat != null && lng != null && (
              <span className="text-sm text-text-muted">
                {lat}, {lng}
              </span>
            )}
            {geoMsg && <span className="text-sm text-text-muted">{geoMsg}</span>}
          </div>
        </div>
      </Card>

      {basinId && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-text">{t('reports.parameters')}</h2>
          <div className="flex flex-col divide-y divide-border">
            {defs.map((d) => {
              const input = values[d.id];
              const raw = input?.value ?? '';
              const num = raw.trim() === '' ? null : Number(raw);
              const status: ParameterStatus = evaluate(num, toEvaluatorDef(d)).status;
              const lugar =
                input?.lugar ?? (LAB_PARAM_IDS.has(d.siloe_param_id) ? 'lab' : 'in_situ');
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-40 flex-1">
                    <span className="text-sm font-medium text-text">{d.name_es}</span>
                    {d.unit && <span className="ml-1 text-xs text-text-muted">({d.unit})</span>}
                  </div>
                  <input
                    inputMode="decimal"
                    value={raw}
                    onChange={(e) => setValue(d.id, { value: e.target.value }, d.siloe_param_id)}
                    className="w-24 rounded-[var(--radius-md)] border border-border bg-surface px-2.5 py-1.5 text-text outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                    aria-label={`${d.name_es} ${t('reports.value')}`}
                  />
                  <select
                    value={lugar}
                    onChange={(e) =>
                      setValue(d.id, { lugar: e.target.value as Lugar }, d.siloe_param_id)
                    }
                    className="rounded-[var(--radius-md)] border border-border bg-surface px-2 py-1.5 text-sm text-text"
                    aria-label={`${d.name_es} ${t('reports.lugar')}`}
                  >
                    <option value="in_situ">{t('lugar.in_situ')}</option>
                    <option value="lab">{t('lugar.lab')}</option>
                  </select>
                  <div className="w-24 text-right">
                    <StatusChip status={status} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">{t('reports.incidents')}</h2>
          <button
            type="button"
            onClick={() => setIncidents((p) => [...p, { description: '', corrective_action: '' }])}
            className="text-sm font-medium text-primary hover:underline"
          >
            {t('reports.addIncident')}
          </button>
        </div>
        {incidents.length === 0 ? (
          <p className="text-sm text-text-muted">{t('common.none')}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {incidents.map((inc, idx) => (
              <div key={idx} className="flex flex-col gap-2 border-l-2 border-border pl-3">
                <TextField
                  label={t('reports.incidentDescription')}
                  value={inc.description}
                  onChange={(e) =>
                    setIncidents((p) =>
                      p.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)),
                    )
                  }
                />
                <TextField
                  label={t('reports.correctiveAction')}
                  value={inc.corrective_action}
                  onChange={(e) =>
                    setIncidents((p) =>
                      p.map((x, i) =>
                        i === idx ? { ...x, corrective_action: e.target.value } : x,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => setIncidents((p) => p.filter((_, i) => i !== idx))}
                  className="self-start text-sm text-text-muted hover:text-text"
                >
                  {t('common.delete')}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <TextareaField
          label={t('reports.notes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => save('draft')}
          loading={saving}
          disabled={!basinId}
        >
          {t('reports.saveDraft')}
        </Button>
        <Button onClick={() => save('completed')} loading={saving} disabled={!basinId}>
          {t('reports.markCompleted')}
        </Button>
      </div>
    </div>
  );
}
