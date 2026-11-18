import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildAnnualResultsXml,
  validateAnnualResults,
  type ValidationError,
} from '@piscinas/shared';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { buildExport, generateAnnualResults } from '../lib/siloeExport.js';
import { Check, Download, FileCheck2, ShieldCheck, Sparkles } from 'lucide-react';
import { Alert } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { Card, CardHeader } from '../components/ui/Card.js';
import { DataTable, type Column } from '../components/ui/DataTable.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { ProgressBar } from '../components/ui/ProgressBar.js';
import { Select } from '../components/ui/Select.js';
import { SkeletonText } from '../components/ui/Skeleton.js';
import { StatusPill } from '../components/ui/StatusPill.js';
import { TextField } from '../components/ui/TextField.js';
import { SelectField } from '../components/ui/fields.js';
import { cn } from '../components/ui/utils.js';
import type { Enums, Tables } from '../lib/database.types.js';

type AnalysisType = Enums<'analysis_type'>;
/** Fields the XML validator requires on each annual result (codes are checked at download). */
const REQUIRED: {
  key: 'laboratorio' | 'fecha_apertura' | 'fecha_cierre' | 'dias_apertura';
  label: string;
}[] = [
  { key: 'laboratorio', label: 'siloe.laboratorio' },
  { key: 'fecha_apertura', label: 'siloe.fechaApertura' },
  { key: 'fecha_cierre', label: 'siloe.fechaCierre' },
  { key: 'dias_apertura', label: 'siloe.diasApertura' },
];

type Row = Tables<'annual_result'> & {
  basin: { denominacion: string } | null;
  annual_result_param: { id: string }[];
};

export function SiloeExportPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const canWrite = profile ? profile.user.role !== 'viewer' : false;

  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [analysisType, setAnalysisType] = useState<AnalysisType>('autocontrol');
  const [rows, setRows] = useState<Row[]>([]);
  const [exports, setExports] = useState<Tables<'xml_export'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: hist }] = await Promise.all([
      supabase
        .from('annual_result')
        .select(
          '*, basin!annual_result_basin_id_org_id_fkey(denominacion), annual_result_param(id)',
        )
        .eq('year', year)
        .eq('analysis_type', analysisType)
        .order('created_at'),
      supabase.from('xml_export').select('*').order('created_at', { ascending: false }).limit(10),
    ]);
    setRows((data as Row[]) ?? []);
    setExports(hist ?? []);
    setLoading(false);
  }, [year, analysisType]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  function patchRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function onGenerate() {
    if (!profile) return;
    setBusy(true);
    setInfo(null);
    setErrors([]);
    const { basins } = await generateAnnualResults(profile.org.id, year, analysisType);
    await loadRows();
    setBusy(false);
    setInfo(basins === 0 ? t('siloe.noData') : t('siloe.generatedCount', { count: basins }));
  }

  async function saveChanges() {
    for (const r of rows) {
      await supabase
        .from('annual_result')
        .update({
          laboratorio: r.laboratorio,
          fecha_apertura: r.fecha_apertura,
          fecha_cierre: r.fecha_cierre,
          dias_apertura: r.dias_apertura,
          n_iniciales: r.n_iniciales,
          n_rutina: r.n_rutina,
          n_periodicos: r.n_periodicos,
          punto_muestreo: r.punto_muestreo,
        })
        .eq('id', r.id);
    }
  }

  async function onSave() {
    setBusy(true);
    await saveChanges();
    setBusy(false);
    setInfo(t('siloe.saved'));
  }

  async function onDownload() {
    if (!profile) return;
    setBusy(true);
    setInfo(null);
    setErrors([]);
    await saveChanges();

    const { muestreos } = await buildExport(year, analysisType);
    const validationErrors = validateAnnualResults(muestreos, {
      currentYear: new Date().getFullYear(),
    });
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      setBusy(false);
      return;
    }

    const xml = buildAnnualResultsXml(muestreos);
    const blob = new Blob([xml], { type: 'application/xml' });

    // Trigger download.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `siloe-resultados-${year}-${analysisType}.xml`;
    a.click();
    URL.revokeObjectURL(url);

    // Store a copy + log the export.
    const path = `${profile.org.id}/exports/siloe-${year}-${analysisType}-${Date.now()}.xml`;
    await supabase.storage.from('reports').upload(path, blob, { contentType: 'application/xml' });
    await supabase.from('xml_export').insert({
      org_id: profile.org.id,
      kind: 'resultado_anual',
      period_year: year,
      item_count: muestreos.reduce((n, m) => n + m.mvasos.length, 0),
      file_path: path,
      created_by: profile.user.id,
    });
    await loadRows();
    setBusy(false);
    setInfo(t('siloe.exportSuccess'));
  }

  const missing = (r: Row) =>
    REQUIRED.filter(({ key }) => r[key] === null || r[key] === undefined || r[key] === '');
  const readyCount = rows.filter((r) => missing(r).length === 0).length;
  const exported = exports.some((x) => x.kind === 'resultado_anual' && x.period_year === year);
  // 0: choose + generate, 1: review, 2: download. Done steps get a check.
  const step = rows.length === 0 ? 0 : exported ? 3 : 1;
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => String(thisYear - i));
  if (!years.includes(String(year))) years.push(String(year));

  const exportColumns: Column<Tables<'xml_export'>>[] = [
    {
      id: 'date',
      header: t('siloe.exportedAt'),
      cell: (x) => (
        <time dateTime={x.created_at}>{new Date(x.created_at).toLocaleString('es-ES')}</time>
      ),
      sortValue: (x) => x.created_at,
    },
    {
      id: 'year',
      header: t('siloe.year'),
      cell: (x) => x.period_year ?? '—',
      sortValue: (x) => x.period_year,
    },
    { id: 'kind', header: t('siloe.kind'), cell: (x) => x.kind, hideBelow: 'md' },
    { id: 'count', header: t('basins.title'), cell: (x) => x.item_count, align: 'right' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader className="mb-0" title={t('siloe.title')} description={t('siloe.subtitle')} />

      <ol
        aria-label={t('photoImport.stepsLabel')}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {[t('siloe.step1'), t('siloe.step2'), t('siloe.step3')].map((label, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li
              key={label}
              aria-current={current ? 'step' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-sm',
                current
                  ? 'border-accent bg-accent-soft font-medium text-navy-800'
                  : 'border-border bg-surface text-text-muted',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  done
                    ? 'bg-primary text-primary-contrast'
                    : current
                      ? 'bg-surface text-navy-800'
                      : 'border border-border',
                )}
              >
                {done ? <Check size={14} /> : i + 1}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      <Card>
        <CardHeader title={t('siloe.step1')} description={t('siloe.step1Hint')} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5 sm:w-40">
            <label htmlFor="siloe-year" className="text-sm font-medium text-text">
              {t('siloe.year')}
            </label>
            <Select
              id="siloe-year"
              value={String(year)}
              onValueChange={(v) => setYear(Number(v))}
              options={years.map((y) => ({ value: y, label: y }))}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:w-56">
            <label htmlFor="siloe-type" className="text-sm font-medium text-text">
              {t('siloe.analysisType')}
            </label>
            <Select
              id="siloe-type"
              value={analysisType}
              onValueChange={(v) => setAnalysisType(v as AnalysisType)}
              options={[
                { value: 'autocontrol', label: t('analysisType.autocontrol') },
                { value: 'vigilancia', label: t('analysisType.vigilancia') },
              ]}
            />
          </div>
          {canWrite && (
            <Button
              onClick={onGenerate}
              loading={busy}
              variant={rows.length ? 'secondary' : 'primary'}
            >
              {!busy && <Sparkles aria-hidden size={16} />}
              {t('siloe.generate')}
            </Button>
          )}
        </div>
        {info && (
          <Alert tone="success" className="mt-4">
            {info}
          </Alert>
        )}
      </Card>

      {errors.length > 0 && (
        <Alert tone="error">
          <p className="font-semibold">{t('siloe.validationTitle')}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {errors.map((e, i) => (
              <li key={i}>
                <span className="font-mono text-xs">{e.code}</span> · {e.message}
                {e.context && <span> ({e.context})</span>}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {loading ? (
        <Card>
          <SkeletonText lines={6} />
        </Card>
      ) : rows.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<ShieldCheck size={22} />}
            title={t('siloe.emptyTitle', { year })}
            description={t('siloe.noResults')}
          />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader
              title={t('siloe.resultsTitle', { year })}
              description={t('siloe.readiness', { ready: readyCount, total: rows.length })}
              actions={
                canWrite && (
                  <>
                    <Button variant="secondary" onClick={onSave} loading={busy}>
                      {t('siloe.saveChanges')}
                    </Button>
                    <Button onClick={onDownload} loading={busy}>
                      {!busy && <Download aria-hidden size={16} />}
                      {t('siloe.downloadXml')}
                    </Button>
                  </>
                )
              }
            />
            <ProgressBar
              value={readyCount}
              max={rows.length}
              tone={readyCount === rows.length ? 'green' : 'accent'}
              label={t('siloe.readiness', { ready: readyCount, total: rows.length })}
            />
          </Card>

          {rows.map((r) => {
            const gaps = missing(r);
            return (
              <Card key={r.id}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-text">
                      {r.basin?.denominacion ?? '—'}
                    </h3>
                    {gaps.length === 0 ? (
                      <StatusPill tone="green">{t('siloe.ready')}</StatusPill>
                    ) : (
                      <StatusPill tone="amber">
                        {t('siloe.missing', { fields: gaps.map((g) => t(g.label)).join(', ') })}
                      </StatusPill>
                    )}
                  </div>
                  <span className="text-sm text-text-muted">
                    {t('siloe.paramsCount', { count: r.annual_result_param.length })}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <TextField
                    label={t('siloe.laboratorio')}
                    value={r.laboratorio ?? ''}
                    onChange={(e) => patchRow(r.id, { laboratorio: e.target.value })}
                  />
                  <TextField
                    label={t('siloe.fechaApertura')}
                    type="date"
                    value={r.fecha_apertura ?? ''}
                    onChange={(e) => patchRow(r.id, { fecha_apertura: e.target.value })}
                  />
                  <TextField
                    label={t('siloe.fechaCierre')}
                    type="date"
                    value={r.fecha_cierre ?? ''}
                    onChange={(e) => patchRow(r.id, { fecha_cierre: e.target.value })}
                  />
                  <TextField
                    label={t('siloe.diasApertura')}
                    type="number"
                    value={String(r.dias_apertura ?? '')}
                    onChange={(e) => patchRow(r.id, { dias_apertura: Number(e.target.value) })}
                  />
                  <TextField
                    label={t('siloe.nIniciales')}
                    type="number"
                    value={String(r.n_iniciales)}
                    onChange={(e) => patchRow(r.id, { n_iniciales: Number(e.target.value) })}
                  />
                  <TextField
                    label={t('siloe.nRutina')}
                    type="number"
                    value={String(r.n_rutina)}
                    onChange={(e) => patchRow(r.id, { n_rutina: Number(e.target.value) })}
                  />
                  <TextField
                    label={t('siloe.nPeriodicos')}
                    type="number"
                    value={String(r.n_periodicos)}
                    onChange={(e) => patchRow(r.id, { n_periodicos: Number(e.target.value) })}
                  />
                  <SelectField
                    label={t('siloe.puntoMuestreo')}
                    value={String(r.punto_muestreo)}
                    onChange={(e) => patchRow(r.id, { punto_muestreo: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {t(`puntoMuestreo.${n}`)}
                      </option>
                    ))}
                  </SelectField>
                </div>
              </Card>
            );
          })}
        </>
      )}

      <section>
        <h2 className="mb-3 text-base font-semibold text-text">{t('siloe.history')}</h2>
        <DataTable
          caption={t('siloe.history')}
          columns={exportColumns}
          rows={exports}
          getRowId={(x) => x.id}
          loading={loading}
          empty={
            <EmptyState compact icon={<FileCheck2 size={20} />} title={t('siloe.historyEmpty')} />
          }
        />
      </section>
    </div>
  );
}
