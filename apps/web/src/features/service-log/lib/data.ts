import type { ChemicalProduct, ChemicalUnit, LastVisit, TaskDef, TaskRow } from '@piscinas/shared';
import { supabase } from '../../../lib/supabase.js';
import { toDbFailure, type DbFailure } from '../../../lib/dbError.js';

/**
 * Data access for the service log. Every call returns its failure (lib/dbError.ts); a missing
 * table (`missing_schema`) means the app is deployed ahead of its migration, and the screens
 * say so instead of showing an empty list.
 */
export interface LoadResult<T> {
  data: T;
  failure: DbFailure | null;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function fetchProducts(): Promise<LoadResult<ChemicalProduct[]>> {
  const { data, error } = await supabase
    .from('chemical_product')
    .select('id, nombre, unidad, cantidad_habitual, activo')
    .order('orden')
    .order('nombre');
  return {
    data: (data ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      unidad: p.unidad,
      cantidadHabitual: p.cantidad_habitual,
      activo: p.activo,
    })),
    failure: toDbFailure(error),
  };
}

export interface ChemicalRow {
  product_id: string;
  cantidad: number;
  unidad: ChemicalUnit;
}

export async function fetchReportChemicals(reportId: string): Promise<LoadResult<ChemicalRow[]>> {
  const { data, error } = await supabase
    .from('report_chemical')
    .select('product_id, cantidad, unidad')
    .eq('report_id', reportId)
    .order('created_at');
  return { data: data ?? [], failure: toDbFailure(error) };
}

/** Replace a report's products with `rows` (like measurements: simple and correct). */
export async function replaceReportChemicals(
  reportId: string,
  orgId: string,
  rows: ChemicalRow[],
): Promise<DbFailure | null> {
  const del = await supabase.from('report_chemical').delete().eq('report_id', reportId);
  if (del.error) return toDbFailure(del.error);
  if (rows.length === 0) return null;
  const { error } = await supabase
    .from('report_chemical')
    .insert(rows.map((r) => ({ ...r, report_id: reportId, org_id: orgId })));
  return toDbFailure(error);
}

export interface ProductUse {
  nombre: string;
  cantidad: number;
  unidad: ChemicalUnit;
}

/** Products added at each of these visits, for the history and detail screens. */
export async function fetchChemicalsForReports(
  reportIds: string[],
): Promise<LoadResult<Map<string, ProductUse[]>>> {
  const out = new Map<string, ProductUse[]>();
  if (reportIds.length === 0) return { data: out, failure: null };
  const { data, error } = await supabase
    .from('report_chemical')
    .select(
      'report_id, cantidad, unidad, chemical_product!report_chemical_product_id_org_id_fkey(nombre)',
    )
    .in('report_id', reportIds)
    .order('created_at');
  type Row = {
    report_id: string;
    cantidad: number;
    unidad: ChemicalUnit;
    chemical_product: { nombre: string } | null;
  };
  for (const r of (data ?? []) as unknown as Row[]) {
    const list = out.get(r.report_id) ?? [];
    list.push({
      nombre: r.chemical_product?.nombre ?? '—',
      cantidad: r.cantidad,
      unidad: r.unidad,
    });
    out.set(r.report_id, list);
  }
  return { data: out, failure: toDbFailure(error) };
}

// Catalogue edits (admins; RLS refuses anyone else).

export async function createProduct(
  orgId: string,
  p: { nombre: string; unidad: ChemicalUnit; cantidadHabitual: number | null; orden: number },
): Promise<DbFailure | null> {
  const { error } = await supabase.from('chemical_product').insert({
    org_id: orgId,
    nombre: p.nombre.trim(),
    unidad: p.unidad,
    cantidad_habitual: p.cantidadHabitual,
    orden: p.orden,
  });
  return toDbFailure(error);
}

export async function updateProduct(
  id: string,
  patch: Partial<{
    nombre: string;
    unidad: ChemicalUnit;
    cantidadHabitual: number | null;
    activo: boolean;
  }>,
): Promise<DbFailure | null> {
  const { error } = await supabase
    .from('chemical_product')
    .update({
      ...(patch.nombre !== undefined ? { nombre: patch.nombre.trim() } : {}),
      ...(patch.unidad !== undefined ? { unidad: patch.unidad } : {}),
      ...(patch.cantidadHabitual !== undefined
        ? { cantidad_habitual: patch.cantidadHabitual }
        : {}),
      ...(patch.activo !== undefined ? { activo: patch.activo } : {}),
    })
    .eq('id', id);
  return toDbFailure(error);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function fetchTaskDefs(): Promise<LoadResult<TaskDef[]>> {
  const { data, error } = await supabase
    .from('task_def')
    .select('id, nombre, orden, activo')
    .order('orden')
    .order('nombre');
  return { data: data ?? [], failure: toDbFailure(error) };
}

export async function fetchReportTasks(reportId: string): Promise<LoadResult<TaskRow[]>> {
  const { data, error } = await supabase
    .from('report_task')
    .select('task_id, hecho, nota')
    .eq('report_id', reportId);
  return { data: data ?? [], failure: toDbFailure(error) };
}

export async function replaceReportTasks(
  reportId: string,
  orgId: string,
  rows: TaskRow[],
): Promise<DbFailure | null> {
  const del = await supabase.from('report_task').delete().eq('report_id', reportId);
  if (del.error) return toDbFailure(del.error);
  if (rows.length === 0) return null;
  const { error } = await supabase
    .from('report_task')
    .insert(rows.map((r) => ({ ...r, report_id: reportId, org_id: orgId })));
  return toDbFailure(error);
}

export interface TaskDone {
  nombre: string;
  orden: number;
  hecho: boolean;
  nota: string | null;
}

export async function fetchTasksForReports(
  reportIds: string[],
): Promise<LoadResult<Map<string, TaskDone[]>>> {
  const out = new Map<string, TaskDone[]>();
  if (reportIds.length === 0) return { data: out, failure: null };
  const { data, error } = await supabase
    .from('report_task')
    .select('report_id, hecho, nota, task_def!report_task_task_id_org_id_fkey(nombre, orden)')
    .in('report_id', reportIds);
  type Row = {
    report_id: string;
    hecho: boolean;
    nota: string | null;
    task_def: { nombre: string; orden: number } | null;
  };
  for (const r of (data ?? []) as unknown as Row[]) {
    const list = out.get(r.report_id) ?? [];
    list.push({
      nombre: r.task_def?.nombre ?? '—',
      orden: r.task_def?.orden ?? 0,
      hecho: r.hecho,
      nota: r.nota,
    });
    out.set(r.report_id, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.orden - b.orden);
  return { data: out, failure: toDbFailure(error) };
}

export async function createTask(
  orgId: string,
  nombre: string,
  orden: number,
): Promise<DbFailure | null> {
  const { error } = await supabase
    .from('task_def')
    .insert({ org_id: orgId, nombre: nombre.trim(), orden });
  return toDbFailure(error);
}

export async function updateTask(
  id: string,
  patch: Partial<{ nombre: string; orden: number; activo: boolean }>,
): Promise<DbFailure | null> {
  const { error } = await supabase
    .from('task_def')
    .update({ ...patch, ...(patch.nombre !== undefined ? { nombre: patch.nombre.trim() } : {}) })
    .eq('id', id);
  return toDbFailure(error);
}

// ---------------------------------------------------------------------------
// Repetir última visita / technicians
// ---------------------------------------------------------------------------

/** The vaso's latest visit with its products and tasks (never its readings), or null. */
export async function fetchLastVisit(
  basinId: string,
  excludeReportId?: string,
): Promise<LoadResult<LastVisit | null>> {
  let q = supabase
    .from('report')
    .select('id, visited_at, technician_id')
    .eq('basin_id', basinId)
    .order('visited_at', { ascending: false })
    .limit(1);
  if (excludeReportId) q = q.neq('id', excludeReportId);
  const { data, error } = await q;
  const rep = data?.[0];
  if (error || !rep) return { data: null, failure: toDbFailure(error) };
  const [chem, tasks] = await Promise.all([fetchReportChemicals(rep.id), fetchReportTasks(rep.id)]);
  return {
    data: {
      visitedAt: rep.visited_at,
      technicianId: rep.technician_id,
      chemicals: chem.data,
      tasks: tasks.data,
    },
    // A database without the service-log tables still repeats the technician.
    failure: chem.failure?.code === 'missing_schema' ? null : (chem.failure ?? tasks.failure),
  };
}

export interface Technician {
  id: string;
  label: string;
  role: string;
}

/** Members who can record a visit (admins and technicians). */
export async function fetchTechnicians(): Promise<LoadResult<Technician[]>> {
  const { data, error } = await supabase
    .from('app_user')
    .select('id, full_name, email, role')
    .in('role', ['admin', 'technician'])
    .order('full_name');
  return {
    data: (data ?? []).map((u) => ({
      id: u.id,
      label: u.full_name?.trim() || u.email || '—',
      role: u.role,
    })),
    failure: toDbFailure(error),
  };
}

// ---------------------------------------------------------------------------
// Route stops
// ---------------------------------------------------------------------------

export async function skipStop(stopId: string, motivo: string): Promise<DbFailure | null> {
  const { error } = await supabase
    .from('route_stop')
    .update({ estado: 'saltada', motivo })
    .eq('id', stopId);
  return toDbFailure(error);
}

/** Back to pending (undo a skip). A stop marked done by its report keeps its link. */
export async function reopenStop(stopId: string): Promise<DbFailure | null> {
  const { error } = await supabase
    .from('route_stop')
    .update({ estado: 'pendiente', motivo: null })
    .eq('id', stopId);
  return toDbFailure(error);
}
