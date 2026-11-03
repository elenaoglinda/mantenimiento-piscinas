import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { doneCount, evaluate, type ParameterStatus } from '@piscinas/shared';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import {
  fetchResolvedParameterDefs,
  toEvaluatorDef,
  LAB_PARAM_IDS,
  type ParameterDefRow,
} from '../lib/parameters.js';
import { LocateFixed, Plus, Trash2 } from 'lucide-react';
import { Alert } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { Combobox } from '../components/ui/Combobox.js';
import { NativeSelect, Textarea } from '../components/ui/Input.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Skeleton, SkeletonText } from '../components/ui/Skeleton.js';
import { StatusPill } from '../components/ui/StatusPill.js';
import { TextField } from '../components/ui/TextField.js';
import { SelectField } from '../components/ui/fields.js';
import { StatusChip } from '../components/ui/StatusChip.js';
import { cn } from '../components/ui/utils.js';
import { useRecordCrumb } from '../features/app-shell/index.js';
import { ProductsSection, TasksSection, useServiceLogForm } from '../features/service-log/index.js';
import type { Enums } from '../lib/database.types.js';
import { HScroll } from '../components/ui/HScroll.js';

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

const num = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

/** "0,5–2", "≤ 0,6" or "≥ 7,2" from a parameter's OK range; null when it has none. */
function rangeLabel(d: ParameterDefRow): string | null {
  if (d.min_ok != null && d.max_ok != null)
    return `${num.format(d.min_ok)}–${num.format(d.max_ok)}`;
  if (d.max_ok != null) return `≤ ${num.format(d.max_ok)}`;
  if (d.min_ok != null) return `≥ ${num.format(d.min_ok)}`;
  return null;
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

  // Products (and, below, tasks) of this visit: the service log.
  const log = useServiceLogForm(reportId);

  const [defs, setDefs] = useState<ParameterDefRow[]>([]);
  const [values, setValues] = useState<Record<string, MeasurementInput>>({});
  const [incidents, setIncidents] = useState<IncidentInput[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Set once a new report's row exists, so a retry after a partial failure updates it
  // instead of creating a second report.
  const [savedId, setSavedId] = useState<string | null>(null);
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
    if (!log.validate()) {
      setError(t('serviceLog.products.fixQuantities'));
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

    const existingId = reportId ?? savedId;
    const { data: saved, error: repErr } = existingId
      ? await supabase
          .from('report')
          .update(reportPayload)
          .eq('id', existingId)
          .select('id')
          .single()
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
    setSavedId(rid);

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

    const logFailure = await log.save(rid, profile.org.id);
    setSaving(false);
    if (logFailure) {
      // The report is saved; say exactly what wasn't, and stay so it can be retried.
      setError(t(`serviceLog.db.${logFailure.code}`, { defaultValue: t('serviceLog.db.unknown') }));
      return;
    }
    navigate(`/reports/${rid}`);
  }

  useRecordCrumb(reportId ? selectedPool?.denominacion : null);
  const poolFieldId = useId();

  // Live summary of what has been entered so far.
  const readings = defs
    .map((d) => {
      const raw = values[d.id]?.value ?? '';
      const n = raw.trim() === '' ? null : Number(raw);
      return { d, raw, status: evaluate(n, toEvaluatorDef(d)).status as ParameterStatus };
    })
    .filter((r) => r.raw.trim() !== '');
  const counts = { green: 0, amber: 0, red: 0, unknown: 0 };
  for (const r of readings) counts[r.status] += 1;
  const flagged = readings.filter((r) => r.status === 'red' || r.status === 'amber');
  const selectedBasin = selectedPool?.basin.find((b) => b.id === basinId);
  const filledIncidents = incidents.filter((i) => i.description.trim()).length;

  if (loading) return <ReportFormSkeleton />;

  const actions = (
    <>
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
    </>
  );

  return (
    <div>
      <PageHeader
        back={
          reportId
            ? { to: `/reports/${reportId}`, label: t('reports.viewReport') }
            : { to: '/reports', label: t('reports.title') }
        }
        title={reportId ? t('reports.editReport') : t('reports.newReport')}
        description={t('reports.formHint')}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          {error && <Alert tone="error">{error}</Alert>}

          <Section n={1} title={t('reports.sectionVisit')}>
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={poolFieldId} className="text-sm font-medium text-text">
                    {t('reports.pool')}
                  </label>
                  <Combobox
                    id={poolFieldId}
                    value={poolId}
                    onValueChange={(v) => {
                      setPoolId(v);
                      setBasinId('');
                    }}
                    disabled={!!reportId}
                    options={pools.map((p) => ({ value: p.id, label: p.denominacion }))}
                    placeholder={t('reports.selectPool')}
                    searchPlaceholder={t('reports.searchPool')}
                    emptyText={t('pools.noMatches')}
                  />
                </div>

                {selectedPool && selectedPool.basin.length > 0 ? (
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
                ) : (
                  <SelectField label={t('reports.basin')} value="" disabled>
                    <option value="">{t('reports.selectBasin')}</option>
                  </SelectField>
                )}
              </div>

              {selectedPool && selectedPool.basin.length === 0 && (
                <Alert tone="info">{t('reports.noBasins')}</Alert>
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

              <div className="grid items-end gap-4 sm:grid-cols-2">
                <TextField
                  label={t('reports.visitedAt')}
                  type="datetime-local"
                  value={visitedAt}
                  onChange={(e) => setVisitedAt(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="secondary" onClick={captureLocation}>
                    <LocateFixed aria-hidden size={16} />
                    {t('reports.useLocation')}
                  </Button>
                  {lat != null && lng != null && (
                    <span className="text-xs text-text-muted tabular-nums">
                      {lat}, {lng}
                    </span>
                  )}
                  {geoMsg && (
                    <span role="status" className="text-xs text-text-muted">
                      {geoMsg}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Section>

          <Section n={2} title={t('reports.parameters')}>
            {!basinId ? (
              <p className="text-sm text-text-muted">{t('reports.parametersHint')}</p>
            ) : (
              <HScroll label={t('reports.parameters')} className="-mx-1">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-text-muted">
                      <th scope="col" className="px-1 pb-2 font-semibold">
                        {t('reports.parameter')}
                      </th>
                      <th scope="col" className="px-1 pb-2 font-semibold">
                        {t('reports.value')}
                      </th>
                      <th scope="col" className="px-1 pb-2 font-semibold">
                        {t('reports.lugar')}
                      </th>
                      <th scope="col" className="px-1 pb-2 text-right font-semibold">
                        {t('reports.statusFilter')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {defs.map((d) => {
                      const input = values[d.id];
                      const raw = input?.value ?? '';
                      const n = raw.trim() === '' ? null : Number(raw);
                      const status: ParameterStatus = evaluate(n, toEvaluatorDef(d)).status;
                      const lugar =
                        input?.lugar ?? (LAB_PARAM_IDS.has(d.siloe_param_id) ? 'lab' : 'in_situ');
                      const range = rangeLabel(d);
                      return (
                        <tr key={d.id} className="border-b border-border last:border-0">
                          <td className="px-1 py-2">
                            <span className="font-medium text-text">{d.name_es}</span>
                            {d.unit && (
                              <span className="ml-1 text-xs text-text-muted">({d.unit})</span>
                            )}
                            {range && (
                              <span className="block text-xs text-text-muted">
                                {t('reports.range', { range })}
                              </span>
                            )}
                          </td>
                          <td className="px-1 py-2">
                            <input
                              inputMode="decimal"
                              value={raw}
                              onChange={(e) =>
                                setValue(d.id, { value: e.target.value }, d.siloe_param_id)
                              }
                              className={cn(
                                'h-9 w-24 rounded-[var(--radius-md)] border bg-surface px-2.5 text-right text-text tabular-nums outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus/40',
                                status === 'red' ? 'border-status-red' : 'border-border',
                              )}
                              aria-label={`${d.name_es} ${t('reports.value')}`}
                            />
                          </td>
                          <td className="px-1 py-2">
                            <NativeSelect
                              value={lugar}
                              onChange={(e) =>
                                setValue(d.id, { lugar: e.target.value as Lugar }, d.siloe_param_id)
                              }
                              className="h-9 w-32"
                              aria-label={`${d.name_es} ${t('reports.lugar')}`}
                            >
                              <option value="in_situ">{t('lugar.in_situ')}</option>
                              <option value="lab">{t('lugar.lab')}</option>
                            </NativeSelect>
                          </td>
                          <td className="px-1 py-2 text-right">
                            <StatusChip status={status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </HScroll>
            )}
          </Section>

          <Section n={3} title={t('serviceLog.products.title')}>
            <ProductsSection
              products={log.products}
              failure={log.productsFailure}
              value={log.chemicals}
              onChange={log.setChemicals}
              invalid={log.invalidChemicals}
            />
          </Section>

          <Section n={4} title={t('serviceLog.tasks.title')}>
            <TasksSection
              defs={log.taskDefs}
              failure={log.tasksFailure}
              value={log.tasks}
              onChange={log.setTasks}
            />
          </Section>

          <Section
            n={5}
            title={t('reports.incidents')}
            action={
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() =>
                  setIncidents((p) => [...p, { description: '', corrective_action: '' }])
                }
              >
                <Plus aria-hidden size={16} />
                {t('reports.addIncident')}
              </Button>
            }
          >
            {incidents.length === 0 ? (
              <p className="text-sm text-text-muted">{t('reports.incidentsEmpty')}</p>
            ) : (
              <div className="flex flex-col gap-4">
                {incidents.map((inc, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border bg-surface-muted/40 p-4"
                  >
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
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      className="self-start text-text-muted"
                      onClick={() => setIncidents((p) => p.filter((_, i) => i !== idx))}
                    >
                      <Trash2 aria-hidden size={14} />
                      {t('common.delete')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section n={6} title={t('reports.notes')}>
            <Textarea
              aria-label={t('reports.notes')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Section>
        </div>

        {/* Live summary: sticky beside the form on wide screens, after it on narrow ones. */}
        <aside aria-label={t('reports.summary')} className="min-w-0">
          <Card className="flex flex-col gap-4 xl:sticky xl:top-20">
            <h2 className="text-base font-semibold text-text">{t('reports.summary')}</h2>
            <dl className="flex flex-col gap-3 text-sm">
              <SummaryRow label={t('reports.pool')}>
                {selectedPool?.denominacion ?? t('common.none')}
              </SummaryRow>
              <SummaryRow label={t('reports.basin')}>
                {selectedBasin?.denominacion ?? t('common.none')}
              </SummaryRow>
              <SummaryRow label={t('reports.visitedAt')}>
                {visitedAt
                  ? new Date(visitedAt).toLocaleString('es-ES', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })
                  : t('common.none')}
              </SummaryRow>
              <SummaryRow label={t('reports.parameters')}>
                {t('reports.enteredOf', { count: readings.length, total: defs.length })}
              </SummaryRow>
            </dl>
            {readings.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {counts.green > 0 && (
                  <StatusPill tone="green">
                    {counts.green} · {t('status.green')}
                  </StatusPill>
                )}
                {counts.amber > 0 && (
                  <StatusPill tone="amber">
                    {counts.amber} · {t('status.amber')}
                  </StatusPill>
                )}
                {counts.red > 0 && (
                  <StatusPill tone="red">
                    {counts.red} · {t('status.red')}
                  </StatusPill>
                )}
              </div>
            )}
            {flagged.length > 0 && (
              <ul className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
                {flagged.map((r) => (
                  <li key={r.d.id} className="flex justify-between gap-2">
                    <span className="truncate text-text">{r.d.name_es}</span>
                    <span
                      className={cn(
                        'shrink-0 font-semibold tabular-nums',
                        r.status === 'red' ? 'text-status-red-text' : 'text-status-amber-text',
                      )}
                    >
                      {r.raw} {r.d.unit ?? ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {log.tasks && doneCount(log.tasks) > 0 && (
              <p className="text-sm text-text-muted">
                {t('serviceLog.tasks.count', { count: doneCount(log.tasks) })}
              </p>
            )}
            {log.chemicals.length > 0 && (
              <p className="text-sm text-text-muted">
                {t('serviceLog.products.count', { count: log.chemicals.length })}
              </p>
            )}
            {filledIncidents > 0 && (
              <p className="text-sm text-text-muted">
                {t('reports.incidentsCount', { count: filledIncidents })}
              </p>
            )}
            <div className="hidden flex-col gap-2 border-t border-border pt-4 xl:flex [&>button]:w-full">
              {actions}
            </div>
          </Card>
        </aside>
      </div>

      {/* On narrow screens the actions stay reachable at the bottom of the viewport. */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-6 flex flex-wrap justify-end gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 xl:hidden">
        {actions}
      </div>
    </div>
  );
}

function Section({
  n,
  title,
  action,
  children,
}: {
  n: number;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-base font-semibold text-text">
          <span
            aria-hidden
            className="inline-flex size-6 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-navy-800"
          >
            {n}
          </span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-text">{children}</dd>
    </div>
  );
}

function ReportFormSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-8 h-4 w-80 max-w-full" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <SkeletonText lines={6} />
        </Card>
        <Card>
          <SkeletonText lines={4} />
        </Card>
      </div>
    </div>
  );
}
