import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
// Relative imports, not `@piscinas/shared`: see scripts/check-api.cjs for why.
import { toDbFailure } from '../../apps/web/src/lib/dbError.js';
import { isSiloeParameter, paramKey } from '../../packages/shared/src/service-log/params.js';
import {
  madridYmd,
  monthBounds,
  type MonthlyParam,
  type MonthlySummaryData,
  type MonthlyVisit,
  type PdfChemical,
  type PdfReading,
  type VisitReportData,
} from '../../packages/shared/src/client-reports/index.js';
import type { ParameterStatus } from '../../packages/shared/src/evaluate.js';

/**
 * Loads what the client PDFs show, AS THE CALLER (their token; RLS applies), and maps it to
 * the plain shapes the shared layout takes. Every query's error is checked: a failure stops
 * the PDF with a reason, except one case — a service-log table the database doesn't have yet
 * (migration not applied), which marks that section "unavailable" in the PDF and comes back
 * as a warning the UI shows.
 */

export type LoadErrorCode = 'not_found' | 'not_ready' | 'db';

export class LoadError extends Error {
  constructor(
    readonly code: LoadErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
  }
}

type Result = { data: unknown; error: PostgrestError | null };

async function must<T = unknown>(query: PromiseLike<Result>, what: string): Promise<T> {
  const { data, error } = await query;
  if (error) {
    const f = toDbFailure(error);
    throw new LoadError('db', `${what}: ${f?.code ?? 'unknown'} ${error.message}`);
  }
  return data as T;
}

/** Like must(), but a table that doesn't exist yet gives 'missing' instead of failing. */
async function optional<T = unknown>(
  query: PromiseLike<Result>,
  what: string,
): Promise<T | 'missing'> {
  const { data, error } = await query;
  if (error) {
    const f = toDbFailure(error);
    if (f?.code === 'missing_schema') return 'missing';
    throw new LoadError('db', `${what}: ${f?.code ?? 'unknown'} ${error.message}`);
  }
  return data as T;
}

/** Splits `ids` for `.in()` filters, keeping URLs short. */
function chunks<T>(ids: readonly T[], size = 80): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

async function inChunks<T>(
  ids: readonly string[],
  run: (part: string[]) => PromiseLike<Result>,
  what: string,
  isOptional = false,
): Promise<T[] | 'missing'> {
  const out: T[] = [];
  for (const part of chunks(ids)) {
    const r = isOptional ? await optional<T[]>(run(part), what) : await must<T[]>(run(part), what);
    if (r === 'missing') return 'missing';
    out.push(...(r ?? []));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const BUCKET = 'reports';
/** Photos above this, with no thumbnail, are left out of the PDF (and counted as such). */
const MAX_ORIGINAL_BYTES = 1_500_000;
const MAX_PHOTOS = 6;
const MAX_LOGO_BYTES = 1_000_000;

/** File bytes, or null when the object doesn't exist or can't be read. */
async function download(client: SupabaseClient, path: string): Promise<Uint8Array | null> {
  const { data, error } = await client.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * A photo small enough for the PDF: the thumbnail the app saves next to new photos
 * (`<path>.thumb.jpg`), else Supabase's resized image (if the plan has image transformations),
 * else the original when it is small. Null means "left out".
 */
async function photoForPdf(client: SupabaseClient, path: string): Promise<Uint8Array | null> {
  const thumb = await download(client, `${path}.thumb.jpg`);
  if (thumb) return thumb;
  const { data: resized } = await client.storage.from(BUCKET).download(path, {
    transform: { width: 640, height: 640, resize: 'contain', quality: 70, format: 'origin' },
  });
  if (resized) {
    const bytes = new Uint8Array(await resized.arrayBuffer());
    if (bytes.length <= MAX_ORIGINAL_BYTES) return bytes;
  }
  const original = await download(client, path);
  return original && original.length <= MAX_ORIGINAL_BYTES ? original : null;
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

export interface Loaded<T> {
  data: T;
  images: Map<string, Uint8Array>;
  orgId: string;
  warnings: string[];
  /** For the stored object's path and the download file name. */
  pathPrefix: string;
  fileName: string;
}

/** Billing-profile razón social if set, else the org name; plus the logo, if uploaded. */
async function loadCompany(
  client: SupabaseClient,
  orgId: string,
  images: Map<string, Uint8Array>,
  warnings: string[],
): Promise<{ name: string; logoRef: string | null }> {
  const [org, billing, logo] = await Promise.all([
    must<{ name: string }>(client.from('org').select('name').eq('id', orgId).single(), 'org'),
    optional<{ razon_social: string | null } | null>(
      client.from('billing_profile').select('razon_social').eq('org_id', orgId).maybeSingle(),
      'billing_profile',
    ),
    download(client, `${orgId}/branding/logo`),
  ]);
  const razon =
    billing !== 'missing' && billing && typeof billing.razon_social === 'string'
      ? billing.razon_social.trim()
      : '';
  let logoRef: string | null = null;
  if (logo && logo.length <= MAX_LOGO_BYTES) {
    images.set('logo', logo);
    logoRef = 'logo';
  } else if (logo) {
    warnings.push('logo_too_large');
  }
  return { name: razon || org.name, logoRef };
}

function address(pool: Record<string, unknown>): string | null {
  const s = (k: string) => (typeof pool[k] === 'string' ? (pool[k] as string).trim() : '');
  const town = [s('cp'), s('municipio') || s('localidad')].filter(Boolean).join(' ');
  const parts = [s('direccion'), town, s('provincia')].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function personName(u: { full_name?: string | null; email?: string | null } | null): string | null {
  return u?.full_name?.trim() || u?.email?.trim() || null;
}

/** "Informe-Residencial-Mar-Azul-2026-11-02.pdf": ASCII only, safe in every mail client. */
export function pdfFileName(...parts: string[]): string {
  const slug = parts
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return `${slug || 'informe'}.pdf`;
}

interface DefRow {
  name_es: string;
  unit: string | null;
  siloe_param_id: number | null;
  in_siloe?: boolean | null;
  clave?: string | null;
  min_ok: number | null;
  max_ok: number | null;
  min_warn: number | null;
  max_warn: number | null;
  closure_min: number | null;
  closure_max: number | null;
  warn_margin_ratio: number | null;
}

interface ProductRow {
  id: string;
  nombre: string;
}

async function productNames(client: SupabaseClient, ids: string[]) {
  const rows = await inChunks<ProductRow>(
    [...new Set(ids)],
    (part) => client.from('chemical_product').select('id, nombre').in('id', part),
    'chemical_product',
    true,
  );
  return rows === 'missing' ? 'missing' : new Map(rows.map((r) => [r.id, r.nombre]));
}

// ---------------------------------------------------------------------------
// Visit report
// ---------------------------------------------------------------------------

export async function loadVisitReport(
  client: SupabaseClient,
  reportId: string,
): Promise<Loaded<VisitReportData>> {
  const report = await must(
    client.from('report').select('*').eq('id', reportId).maybeSingle(),
    'report',
  );
  if (!report) throw new LoadError('not_found');
  const r = report as Record<string, unknown> & {
    org_id: string;
    pool_id: string;
    basin_id: string;
    status: 'draft' | 'completed' | 'signed';
    visited_at: string;
    technician_id: string | null;
    notes: string | null;
    signature_path: string | null;
    signed_by_name: string | null;
    signed_at: string | null;
  };
  if (r.status === 'draft') throw new LoadError('not_ready');

  const images = new Map<string, Uint8Array>();
  const warnings: string[] = [];

  const [pool, basin, measurements, incidents, photos, chemRows, taskRows, tech, company] =
    await Promise.all([
      must(client.from('pool').select('*').eq('id', r.pool_id).single(), 'pool'),
      must(client.from('basin').select('denominacion').eq('id', r.basin_id).single(), 'basin'),
      must(
        client.from('measurement').select('*, parameter_def(*)').eq('report_id', reportId),
        'measurement',
      ),
      must(
        client.from('incident').select('*').eq('report_id', reportId).order('created_at'),
        'incident',
      ),
      must(
        client
          .from('attachment')
          .select('storage_path')
          .eq('report_id', reportId)
          .eq('kind', 'photo')
          .order('created_at'),
        'attachment',
      ),
      optional(
        client.from('report_chemical').select('*').eq('report_id', reportId).order('created_at'),
        'report_chemical',
      ),
      optional(client.from('report_task').select('*').eq('report_id', reportId), 'report_task'),
      r.technician_id
        ? must(
            client
              .from('app_user')
              .select('full_name, email')
              .eq('id', r.technician_id)
              .maybeSingle(),
            'app_user',
          )
        : Promise.resolve(null),
      loadCompany(client, r.org_id, images, warnings),
    ]);

  const p = pool as Record<string, unknown> & { client_id: string; denominacion: string };
  const clientRow = await must(
    client.from('client').select('name').eq('id', p.client_id).maybeSingle(),
    'client',
  );

  // Readings: SILOÉ in catalogue order, then the others.
  type M = { value: number | null; status: ParameterStatus; parameter_def: DefRow | null };
  const readings: PdfReading[] = (measurements as M[])
    .filter((m) => m.parameter_def)
    .sort((a, b) => (paramKey(a.parameter_def!) ?? 999) - (paramKey(b.parameter_def!) ?? 999))
    .map((m) => ({
      name: m.parameter_def!.name_es,
      unit: m.parameter_def!.unit,
      value: m.value == null ? null : Number(m.value),
      status: m.status,
      inSiloe: isSiloeParameter(m.parameter_def!),
      minOk: m.parameter_def!.min_ok,
      maxOk: m.parameter_def!.max_ok,
    }));

  // Products.
  const unavailable: VisitReportData['unavailable'] = [];
  let chemicals: PdfChemical[] = [];
  if (chemRows === 'missing') unavailable.push('chemicals');
  else {
    const rows = chemRows as { product_id: string; cantidad: number; unidad: string }[];
    const names = await productNames(
      client,
      rows.map((c) => c.product_id),
    );
    if (names === 'missing') unavailable.push('chemicals');
    else
      chemicals = rows.map((c) => ({
        name: names.get(c.product_id) ?? '—',
        cantidad: Number(c.cantidad),
        unidad: c.unidad,
      }));
  }

  // Tasks, in the org's list order.
  let tasks: VisitReportData['tasks'] = [];
  if (taskRows === 'missing') unavailable.push('tasks');
  else {
    const rows = taskRows as { task_id: string; hecho: boolean; nota: string | null }[];
    const defs = rows.length
      ? await optional(
          client
            .from('task_def')
            .select('id, nombre, orden')
            .in(
              'id',
              rows.map((t) => t.task_id),
            ),
          'task_def',
        )
      : [];
    if (defs === 'missing') unavailable.push('tasks');
    else {
      const byId = new Map(
        (defs as { id: string; nombre: string; orden: number }[]).map((d) => [d.id, d]),
      );
      tasks = rows
        .map((t) => ({ ...t, def: byId.get(t.task_id) }))
        .sort((a, b) => (a.def?.orden ?? 0) - (b.def?.orden ?? 0))
        .map((t) => ({ name: t.def?.nombre ?? '—', hecho: t.hecho, nota: t.nota }));
    }
  }
  if (unavailable.length) warnings.push('service_log_unavailable');

  // Photos and signature.
  const photoPaths = (photos as { storage_path: string }[]).map((a) => a.storage_path);
  const wanted = photoPaths.slice(0, MAX_PHOTOS);
  const photoBytes = await Promise.all(wanted.map((path) => photoForPdf(client, path)));
  const photoRefs: string[] = [];
  photoBytes.forEach((bytes, i) => {
    if (!bytes) return;
    images.set(`photo:${i}`, bytes);
    photoRefs.push(`photo:${i}`);
  });
  const photosLeftOut = photoPaths.length - photoRefs.length;
  if (photosLeftOut > 0) warnings.push('photos_left_out');

  let signatureRef: string | null = null;
  if (r.status === 'signed' && r.signature_path) {
    const sig = await download(client, r.signature_path);
    if (sig) {
      images.set('signature', sig);
      signatureRef = 'signature';
    } else warnings.push('signature_unreadable');
  }

  const poolName = p.denominacion;
  const basinName = (basin as { denominacion: string }).denominacion;
  return {
    orgId: r.org_id,
    images,
    warnings,
    pathPrefix: `${r.org_id}/client-reports/visits/${reportId}`,
    fileName: pdfFileName('Informe', poolName, basinName, madridYmd(r.visited_at)),
    data: {
      company,
      clientName: (clientRow as { name: string } | null)?.name ?? null,
      poolName,
      poolAddress: address(p),
      basinName,
      visitedAt: r.visited_at,
      status: r.status,
      technician: personName(tech as { full_name: string | null; email: string | null } | null),
      readings,
      chemicals,
      tasks,
      incidents: (incidents as { description: string; corrective_action: string | null }[]).map(
        (i) => ({ description: i.description, correctiveAction: i.corrective_action }),
      ),
      notes: r.notes,
      photoRefs,
      photosLeftOut,
      signature:
        r.status === 'signed'
          ? { ref: signatureRef, name: r.signed_by_name, signedAt: r.signed_at }
          : null,
      unavailable,
    },
  };
}

// ---------------------------------------------------------------------------
// Monthly summary
// ---------------------------------------------------------------------------

export async function loadMonthlySummary(
  client: SupabaseClient,
  poolId: string,
  month: string,
): Promise<Loaded<MonthlySummaryData>> {
  const pool = await must(client.from('pool').select('*').eq('id', poolId).maybeSingle(), 'pool');
  if (!pool) throw new LoadError('not_found');
  const p = pool as Record<string, unknown> & {
    id: string;
    org_id: string;
    client_id: string;
    denominacion: string;
  };
  const { from, to } = monthBounds(month);
  const images = new Map<string, Uint8Array>();
  const warnings: string[] = [];

  const [clientRow, basins, reports, company] = await Promise.all([
    must(client.from('client').select('name').eq('id', p.client_id).maybeSingle(), 'client'),
    must(
      client
        .from('basin')
        .select('id, denominacion, num_orden, fecha_baja')
        .eq('pool_id', poolId)
        .order('num_orden', { nullsFirst: false })
        .order('denominacion'),
      'basin',
    ),
    must(
      client
        .from('report')
        .select('id, basin_id, visited_at, technician_id')
        .eq('pool_id', poolId)
        .in('status', ['completed', 'signed'])
        .gte('visited_at', from)
        .lt('visited_at', to)
        .order('visited_at'),
      'report',
    ),
    loadCompany(client, p.org_id, images, warnings),
  ]);

  type Rep = { id: string; basin_id: string; visited_at: string; technician_id: string | null };
  const reps = reports as Rep[];
  const ids = reps.map((x) => x.id);

  type M = {
    report_id: string;
    value: number | null;
    status: ParameterStatus;
    parameter_def: DefRow | null;
  };
  const [meas, incs, chems, techs] = ids.length
    ? await Promise.all([
        inChunks<M>(
          ids,
          (part) =>
            client
              .from('measurement')
              .select('report_id, value, status, parameter_def(*)')
              .in('report_id', part),
          'measurement',
        ),
        inChunks<{ report_id: string; description: string; corrective_action: string | null }>(
          ids,
          (part) =>
            client
              .from('incident')
              .select('report_id, description, corrective_action, created_at')
              .in('report_id', part)
              .order('created_at'),
          'incident',
        ),
        inChunks<{ report_id: string; product_id: string; cantidad: number; unidad: string }>(
          ids,
          (part) =>
            client
              .from('report_chemical')
              .select('report_id, product_id, cantidad, unidad')
              .in('report_id', part),
          'report_chemical',
          true,
        ),
        inChunks<{ id: string; full_name: string | null; email: string | null }>(
          [...new Set(reps.map((x) => x.technician_id).filter((x): x is string => !!x))],
          (part) => client.from('app_user').select('id, full_name, email').in('id', part),
          'app_user',
        ),
      ])
    : [[], [], [], []];

  const unavailable: MonthlySummaryData['unavailable'] = [];
  let names: Map<string, string> | 'missing' = new Map();
  if (chems === 'missing') unavailable.push('chemicals');
  else {
    names = await productNames(
      client,
      chems.map((c) => c.product_id),
    );
    if (names === 'missing') unavailable.push('chemicals');
  }
  if (unavailable.length) warnings.push('service_log_unavailable');

  // One definition per parameter: the one recorded at its latest visit.
  const params = new Map<number, MonthlyParam & { at: string }>();
  const visitAt = new Map(reps.map((x) => [x.id, x.visited_at]));
  for (const m of meas as M[]) {
    const def = m.parameter_def;
    const key = def ? paramKey(def) : null;
    if (!def || key == null) continue;
    const at = visitAt.get(m.report_id) ?? '';
    const prev = params.get(key);
    if (prev && prev.at >= at) continue;
    params.set(key, {
      key,
      at,
      name: def.name_es,
      unit: def.unit,
      inSiloe: isSiloeParameter(def),
      def: {
        minOk: def.min_ok,
        maxOk: def.max_ok,
        minWarn: def.min_warn,
        maxWarn: def.max_warn,
        closureMin: def.closure_min,
        closureMax: def.closure_max,
        warnMarginRatio: def.warn_margin_ratio ?? undefined,
      },
    });
  }

  const techName = new Map(
    (techs as { id: string; full_name: string | null; email: string | null }[]).map((u) => [
      u.id,
      personName(u),
    ]),
  );
  const visits = new Map<string, MonthlyVisit>(
    reps.map((x) => [
      x.id,
      {
        reportId: x.id,
        visitedAt: x.visited_at,
        technician: x.technician_id ? (techName.get(x.technician_id) ?? null) : null,
        readings: [],
        incidents: [],
        chemicals: [],
      },
    ]),
  );
  for (const m of meas as M[]) {
    const key = m.parameter_def ? paramKey(m.parameter_def) : null;
    if (key == null) continue;
    visits.get(m.report_id)?.readings.push({
      key,
      value: m.value == null ? null : Number(m.value),
      status: m.status,
    });
  }
  for (const i of incs as {
    report_id: string;
    description: string;
    corrective_action: string | null;
  }[]) {
    visits
      .get(i.report_id)
      ?.incidents.push({ description: i.description, correctiveAction: i.corrective_action });
  }
  if (chems !== 'missing' && names !== 'missing') {
    for (const c of chems) {
      visits.get(c.report_id)?.chemicals.push({
        name: names.get(c.product_id) ?? '—',
        cantidad: Number(c.cantidad),
        unidad: c.unidad,
      });
    }
  }

  const monthStart = from.slice(0, 10);
  type B = { id: string; denominacion: string; fecha_baja: string | null };
  const basinList = (basins as B[])
    // A vaso closed before the month started isn't listed, unless it still has visits in it.
    .filter(
      (b) => !b.fecha_baja || b.fecha_baja >= monthStart || reps.some((x) => x.basin_id === b.id),
    )
    .map((b) => ({
      id: b.id,
      name: b.denominacion,
      visits: reps.filter((x) => x.basin_id === b.id).map((x) => visits.get(x.id)!),
    }));

  return {
    orgId: p.org_id,
    images,
    warnings,
    pathPrefix: `${p.org_id}/client-reports/monthly/${poolId}/${month}`,
    fileName: pdfFileName('Resumen', p.denominacion, month),
    data: {
      company,
      clientName: (clientRow as { name: string } | null)?.name ?? null,
      poolName: p.denominacion,
      poolAddress: address(p),
      month,
      params: [...params.values()].map((x) => ({
        key: x.key,
        name: x.name,
        unit: x.unit,
        inSiloe: x.inSiloe,
        def: x.def,
      })),
      basins: basinList,
      unavailable,
    },
  };
}
