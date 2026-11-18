import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ProductsSection, TasksSection, useServiceLogForm } from '../features/service-log/index.js';
import {
  evaluate,
  isSiloeParameter,
  type ParameterStatus,
  type ReadingExtraction,
} from '@piscinas/shared';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import {
  fetchResolvedParameterDefs,
  poolRegion,
  toEvaluatorDef,
  isLabParameter,
  type ParameterDefRow,
} from '../lib/parameters.js';
import {
  extractFromPhoto,
  mapExtractionToDefs,
  PhotoImportError,
  type MeasurementInput,
  type PhotoImportErrorCode,
} from '../lib/photoImport.js';
import { Camera, Sparkles } from 'lucide-react';
import { Alert, Spinner } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { Card, CardHeader } from '../components/ui/Card.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { StatusPill } from '../components/ui/StatusPill.js';
import { cn } from '../components/ui/utils.js';
import { TextField } from '../components/ui/TextField.js';
import { SelectField, TextareaField } from '../components/ui/fields.js';
import { StatusChip } from '../components/ui/StatusChip.js';
import type { Enums } from '../lib/database.types.js';
import { savePhotoThumbnail } from '../features/client-reports/index.js';

type AnalysisType = Enums<'analysis_type'>;

interface PoolOption {
  id: string;
  denominacion: string;
  ccaa: string | null;
  /** Absent before the pool_ccaa_code migration. */
  ccaa_code?: string | null;
  basin: { id: string; denominacion: string }[];
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

/** Keep the time-of-day already on the form, but move it to the date read from the parte. */
function withDate(localInput: string, isoDate: string): string {
  return `${isoDate}T${localInput.slice(11, 16)}`;
}

/**
 * Import a paper parte from a photo: extract readings with Claude vision, let the technician
 * verify every value, then save as a DRAFT report.
 *
 * Always a draft, never completed or signed — machine-read values must pass through the normal
 * completion flow. Provenance (`source`, `extraction_meta`) plus the original photo are stored
 * so a SILOE audit can trace any figure back to the paper it came from.
 */
export function ImportReportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canWrite = profile ? profile.user.role !== 'viewer' : false;

  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [extraction, setExtraction] = useState<ReadingExtraction | null>(null);
  const [model, setModel] = useState<string>('');

  const [pools, setPools] = useState<PoolOption[]>([]);
  const [poolId, setPoolId] = useState('');
  const [basinId, setBasinId] = useState('');
  const [analysisType, setAnalysisType] = useState<AnalysisType>('autocontrol');
  const [visitedAt, setVisitedAt] = useState(toLocalInput(new Date().toISOString()));
  const [notes, setNotes] = useState('');

  // Products and tasks can be added to the draft too (service log); never prefilled from the
  // photo — only readings are extracted.
  const log = useServiceLogForm(undefined);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [defs, setDefs] = useState<ParameterDefRow[]>([]);
  const [values, setValues] = useState<Record<string, MeasurementInput>>({});
  const [lowConfidenceDefIds, setLowConfidenceDefIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  /** Guards the one-shot prefill so it never clobbers edits when defs reload. */
  const prefilled = useRef(false);

  const selectedPool = useMemo(() => pools.find((p) => p.id === poolId), [pools, poolId]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('pool')
        .select('*, basin(id, denominacion)') // `*`: ccaa_code once its migration has run
        .eq('archived', false)
        .order('denominacion');
      setPools((data as PoolOption[]) ?? []);
    })();
  }, []);

  const loadDefs = useCallback(async (ccaa: string | null) => {
    // Photo import reads SILOE parameters only (the extraction prompt is generated from them).
    setDefs((await fetchResolvedParameterDefs(ccaa)).filter(isSiloeParameter));
  }, []);
  useEffect(() => {
    if (selectedPool) void loadDefs(poolRegion(selectedPool));
  }, [selectedPool, loadDefs]);

  // Prefill the parameter grid once the pool's thresholds are known.
  useEffect(() => {
    if (!extraction || defs.length === 0 || prefilled.current) return;
    const mapped = mapExtractionToDefs(defs, extraction);
    setValues(mapped.values);
    setLowConfidenceDefIds(mapped.lowConfidenceDefIds);
    prefilled.current = true;
  }, [extraction, defs]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function onPick(picked: File) {
    setFile(picked);
    setError(null);
    setWarning(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(picked));
  }

  function errorMessageFor(code: PhotoImportErrorCode): string {
    switch (code) {
      case 'unavailable':
        return t('photoImport.errorUnavailable');
      case 'too_large':
        return t('photoImport.errorTooLarge');
      case 'unreadable':
        return t('photoImport.errorUnreadable');
      case 'unauthorized':
        return t('photoImport.errorUnauthorized');
      default:
        return t('photoImport.errorFailed');
    }
  }

  async function analyse() {
    if (!file) return;
    setScanning(true);
    setError(null);
    setWarning(null);
    try {
      const outcome = await extractFromPhoto(file);
      setExtraction(outcome.extraction);
      setModel(outcome.model);
      prefilled.current = false;

      if (outcome.extraction.date && outcome.extraction.dateConfidence === 'full') {
        setVisitedAt((prev) => withDate(prev, outcome.extraction.date as string));
      } else if (outcome.extraction.date) {
        // Partial date: don't silently trust it, but tell the technician what was read.
        setWarning(t('photoImport.datePartial', { date: outcome.extraction.date }));
      }
      if (outcome.extraction.notesSuggestion) {
        setNotes(`[${t('photoImport.notesPrefix')}] ${outcome.extraction.notesSuggestion}`);
      }
    } catch (err) {
      setError(
        err instanceof PhotoImportError ? errorMessageFor(err.code) : t('common.genericError'),
      );
    } finally {
      setScanning(false);
    }
  }

  function setValue(defId: string, value: string, def: ParameterDefRow) {
    setValues((prev) => ({
      ...prev,
      [defId]: {
        value,
        lugar: prev[defId]?.lugar ?? (isLabParameter(def) ? 'lab' : 'in_situ'),
      },
    }));
  }

  async function saveDraft() {
    if (!profile || !extraction || !poolId || !basinId) {
      setError(t('common.requiredField'));
      return;
    }
    if (!log.validate()) {
      setError(t('serviceLog.products.fixQuantities'));
      return;
    }
    setSaving(true);
    setError(null);

    const entered = defs
      .map((d) => ({ d, input: values[d.id] }))
      .filter((x) => x.input && x.input.value.trim() !== '');

    const { data: saved, error: repErr } = await supabase
      .from('report')
      .insert({
        org_id: profile.org.id,
        technician_id: profile.user.id,
        pool_id: poolId,
        basin_id: basinId,
        analysis_type: analysisType,
        visited_at: new Date(visitedAt).toISOString(),
        notes: notes.trim() || null,
        status: 'draft',
        source: 'photo_import',
        extraction_meta: { model, ...extraction },
      })
      .select('id')
      .single();

    if (repErr || !saved) {
      setSaving(false);
      setError(t('common.genericError'));
      return;
    }
    const rid = saved.id;

    if (entered.length > 0) {
      await supabase.from('measurement').insert(
        entered.map(({ d, input }) => {
          const num = Number(input.value);
          const { status, compliant } = evaluate(num, toEvaluatorDef(d));
          return {
            org_id: profile.org.id,
            report_id: rid,
            parameter_def_id: d.id,
            value: num,
            lugar: input.lugar,
            compliant,
            status,
          };
        }),
      );
    }

    const logFailure = await log.save(rid, profile.org.id);
    if (logFailure) {
      // The draft exists with its readings. Say what failed and offer the draft in the normal
      // form (saving here again would create a second draft).
      setSaving(false);
      setError(t(`serviceLog.db.${logFailure.code}`, { defaultValue: t('serviceLog.db.unknown') }));
      setSavedDraftId(rid);
      return;
    }

    // The original photo is the audit evidence — attach it, but never lose the report if the
    // upload fails; the report detail page can attach it manually.
    let photoFailed = false;
    if (file) {
      const path = `${profile.org.id}/${rid}/photo-${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('reports').upload(path, file);
      if (upErr) {
        photoFailed = true;
      } else {
        // Small copy for the client PDFs; the photo itself is the evidence and is saved anyway.
        await savePhotoThumbnail(path, file);
        const { error: attErr } = await supabase.from('attachment').insert({
          org_id: profile.org.id,
          report_id: rid,
          kind: 'photo',
          storage_path: path,
        });
        photoFailed = !!attErr;
      }
    }

    setSaving(false);
    navigate(`/reports/${rid}`, { state: photoFailed ? { photoAttachFailed: true } : undefined });
  }

  if (!profile) return null;

  if (!canWrite) {
    return <Alert tone="error">{t('photoImport.viewerNotAllowed')}</Alert>;
  }

  const lowConfidenceCount = extraction?.lowConfidenceFields.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="mb-0"
        back={{ to: '/reports', label: t('nav.reports') }}
        title={t('photoImport.title')}
        description={t('photoImport.subtitle')}
      />

      <ol
        className="flex flex-wrap gap-x-6 gap-y-2 text-sm"
        aria-label={t('photoImport.stepsLabel')}
      >
        {[t('photoImport.step1'), t('photoImport.step2'), t('photoImport.step3')].map(
          (label, i) => {
            const step = extraction ? 1 : 0;
            return (
              <li
                key={label}
                aria-current={i === step ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2',
                  i <= step ? 'font-medium text-text' : 'text-text-muted',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                    i < step
                      ? 'bg-primary text-primary-contrast'
                      : i === step
                        ? 'bg-accent-soft text-navy-800'
                        : 'border border-border',
                  )}
                >
                  {i + 1}
                </span>
                {label}
              </li>
            );
          },
        )}
      </ol>

      {error && <Alert tone="error">{error}</Alert>}
      {warning && <Alert tone="warning">{warning}</Alert>}

      <Card>
        <div className="flex flex-col gap-4">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
          />

          {previewUrl ? (
            <img
              src={previewUrl}
              alt={t('photoImport.previewAlt')}
              className="max-h-72 w-full rounded-[var(--radius-md)] border border-border bg-surface-muted object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed border-border bg-surface-muted/50 px-6 py-10 text-center">
              <span
                aria-hidden
                className="inline-flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent"
              >
                <Camera size={22} />
              </span>
              <p className="max-w-sm text-sm text-text-muted">{t('photoImport.uploadHint')}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={file ? 'secondary' : 'primary'}
              onClick={() => fileInput.current?.click()}
            >
              <Camera aria-hidden size={16} />
              {file ? t('photoImport.changePhoto') : t('photoImport.choosePhoto')}
            </Button>
            {file && !extraction && (
              <Button onClick={analyse} loading={scanning}>
                {!scanning && <Sparkles aria-hidden size={16} />}
                {scanning ? t('photoImport.analysing') : t('photoImport.analyse')}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {scanning && (
        <Card>
          <Spinner label={t('photoImport.analysing')} />
        </Card>
      )}

      {extraction && (
        <>
          <Alert tone={extraction.extractionConfidence === 'high' ? 'success' : 'warning'}>
            {t(`photoImport.confidence.${extraction.extractionConfidence}`)}{' '}
            {lowConfidenceCount > 0 && t('photoImport.verifyCount', { count: lowConfidenceCount })}
          </Alert>

          <Card>
            <CardHeader title={t('reports.sectionVisit')} />
            <div className="flex flex-col gap-4">
              <SelectField
                label={t('reports.pool')}
                value={poolId}
                onChange={(e) => {
                  setPoolId(e.target.value);
                  setBasinId('');
                }}
              >
                <option value="">{t('reports.selectPool')}</option>
                {pools.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.denominacion}
                  </option>
                ))}
              </SelectField>
              {extraction.poolNameHint && (
                <p className="-mt-2 text-sm text-text-muted">
                  {t('photoImport.poolHint', { name: extraction.poolNameHint })}
                </p>
              )}

              {selectedPool && selectedPool.basin.length === 0 && (
                <Alert tone="info">{t('reports.noBasins')}</Alert>
              )}
              {selectedPool && selectedPool.basin.length > 0 && (
                <SelectField
                  label={t('reports.basin')}
                  value={basinId}
                  onChange={(e) => setBasinId(e.target.value)}
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
                <TextField
                  label={t('reports.visitedAt')}
                  type="datetime-local"
                  value={visitedAt}
                  onChange={(e) => setVisitedAt(e.target.value)}
                />
                <SelectField
                  label={t('reports.analysisType')}
                  value={analysisType}
                  onChange={(e) => setAnalysisType(e.target.value as AnalysisType)}
                >
                  <option value="autocontrol">{t('analysisType.autocontrol')}</option>
                  <option value="vigilancia">{t('analysisType.vigilancia')}</option>
                </SelectField>
              </div>
            </div>
          </Card>

          {basinId && (
            <Card>
              <CardHeader
                title={t('reports.parameters')}
                description={t('photoImport.reviewHint')}
              />
              <div className="flex flex-col divide-y divide-border">
                {defs.map((d) => {
                  const raw = values[d.id]?.value ?? '';
                  const num = raw.trim() === '' ? null : Number(raw);
                  const status: ParameterStatus = evaluate(num, toEvaluatorDef(d)).status;
                  const needsCheck = lowConfidenceDefIds.has(d.id);
                  return (
                    <div
                      key={d.id}
                      className={cn(
                        'flex flex-wrap items-center gap-3 py-2.5',
                        needsCheck && '-mx-2 rounded-[var(--radius-md)] bg-status-amber-bg/40 px-2',
                      )}
                    >
                      <div className="min-w-40 flex-1">
                        <span className="text-sm font-medium text-text">{d.name_es}</span>
                        {d.unit && <span className="ml-1 text-xs text-text-muted">({d.unit})</span>}
                        {needsCheck && (
                          <StatusPill tone="amber" className="ml-2">
                            {t('photoImport.verifyBadge')}
                          </StatusPill>
                        )}
                      </div>
                      <input
                        inputMode="decimal"
                        value={raw}
                        onChange={(e) => setValue(d.id, e.target.value, d)}
                        aria-label={`${d.name_es} ${t('reports.value')}`}
                        className={`h-9 w-24 rounded-[var(--radius-md)] border bg-surface px-2.5 text-right text-text tabular-nums outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus/40 ${
                          needsCheck ? 'border-status-amber' : 'border-border'
                        }`}
                      />
                      <div className="w-28 text-right">
                        <StatusChip status={status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title={t('serviceLog.products.title')} />
            <ProductsSection
              products={log.products}
              failure={log.productsFailure}
              value={log.chemicals}
              onChange={log.setChemicals}
              invalid={log.invalidChemicals}
            />
          </Card>

          <Card>
            <CardHeader title={t('serviceLog.tasks.title')} />
            <TasksSection
              defs={log.taskDefs}
              failure={log.tasksFailure}
              value={log.tasks}
              onChange={log.setTasks}
            />
          </Card>

          <Card>
            <TextareaField
              label={t('reports.notes')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Card>

          <div className="flex flex-col items-end gap-2">
            {savedDraftId ? (
              <Button asChild>
                <Link to={`/reports/${savedDraftId}/edit`}>{t('serviceLog.openDraft')}</Link>
              </Button>
            ) : (
              <Button onClick={saveDraft} loading={saving} disabled={!poolId || !basinId}>
                {t('photoImport.saveDraft')}
              </Button>
            )}
            <p className="text-right text-xs text-text-muted">{t('photoImport.draftNote')}</p>
          </div>
        </>
      )}
    </div>
  );
}
