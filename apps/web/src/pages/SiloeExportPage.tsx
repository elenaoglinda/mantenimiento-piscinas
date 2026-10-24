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
import { Alert, Card, Spinner } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { TextField } from '../components/ui/TextField.js';
import { SelectField } from '../components/ui/fields.js';
import type { Enums, Tables } from '../lib/database.types.js';

type AnalysisType = Enums<'analysis_type'>;
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

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-text">{t('siloe.title')}</h1>
        <p className="text-sm text-text-muted">{t('siloe.subtitle')}</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-32">
            <TextField
              label={t('siloe.year')}
              type="number"
              value={String(year)}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <div className="w-56">
            <SelectField
              label={t('siloe.analysisType')}
              value={analysisType}
              onChange={(e) => setAnalysisType(e.target.value as AnalysisType)}
            >
              <option value="autocontrol">{t('analysisType.autocontrol')}</option>
              <option value="vigilancia">{t('analysisType.vigilancia')}</option>
            </SelectField>
          </div>
          {canWrite && (
            <Button onClick={onGenerate} loading={busy}>
              {t('siloe.generate')}
            </Button>
          )}
        </div>
        {info && (
          <div className="mt-3">
            <Alert tone="success">{info}</Alert>
          </div>
        )}
      </Card>

      {errors.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-status-red-text">
            {t('siloe.validationTitle')}
          </h2>
          <ul className="flex flex-col gap-1 text-sm text-text">
            {errors.map((e, i) => (
              <li key={i}>
                <span className="font-mono text-xs text-text-muted">{e.code}</span> · {e.message}
                {e.context && <span className="text-text-muted"> ({e.context})</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-text-muted">{t('siloe.noResults')}</p>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-text">{t('siloe.resultsTitle', { year })}</h2>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={onSave} loading={busy}>
                  {t('siloe.saveChanges')}
                </Button>
                <Button onClick={onDownload} loading={busy}>
                  {t('siloe.downloadXml')}
                </Button>
              </div>
            )}
          </div>

          {rows.map((r) => (
            <Card key={r.id}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-medium text-text">{r.basin?.denominacion ?? '—'}</h3>
                <span className="text-sm text-text-muted">
                  {t('siloe.paramsCount', { count: r.annual_result_param.length })}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
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
          ))}
        </>
      )}

      <Card>
        <h2 className="mb-2 text-lg font-semibold text-text">{t('siloe.history')}</h2>
        {exports.length === 0 ? (
          <p className="text-sm text-text-muted">{t('siloe.historyEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {exports.map((x) => (
              <li
                key={x.id}
                className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-3"
              >
                <span className="text-text">
                  {x.kind} · {x.period_year} · {t('siloe.paramsCount', { count: x.item_count })}
                </span>
                <span className="shrink-0 text-text-muted">
                  {new Date(x.created_at).toLocaleString('es-ES')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
