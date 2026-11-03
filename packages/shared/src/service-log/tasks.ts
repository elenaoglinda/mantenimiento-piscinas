/**
 * The task checklist of a visit. The form shows every active task of the org's list; only
 * tasks that were done, or carry a note, are saved — an untouched checklist stores nothing.
 */
export interface TaskDef {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

export interface TaskEntry {
  taskId: string;
  hecho: boolean;
  nota: string;
}

export interface TaskRow {
  task_id: string;
  hecho: boolean;
  nota: string | null;
}

/**
 * The checklist to show: every active task in order, with what was saved for this visit;
 * a task deactivated since stays (at the end) if this visit recorded it.
 */
export function checklist(defs: readonly TaskDef[], saved: readonly TaskEntry[]): TaskEntry[] {
  const byId = new Map(saved.map((e) => [e.taskId, e]));
  const ordered = [...defs].sort(
    (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'),
  );
  const shown = ordered.filter((d) => d.activo || byId.has(d.id));
  return shown.map((d) => byId.get(d.id) ?? { taskId: d.id, hecho: false, nota: '' });
}

export function toggleTask(entries: readonly TaskEntry[], taskId: string): TaskEntry[] {
  return entries.map((e) => (e.taskId === taskId ? { ...e, hecho: !e.hecho } : e));
}

export function setTaskNote(
  entries: readonly TaskEntry[],
  taskId: string,
  nota: string,
): TaskEntry[] {
  return entries.map((e) => (e.taskId === taskId ? { ...e, nota } : e));
}

/** Rows to save: tasks done or with a note. */
export function taskRows(entries: readonly TaskEntry[]): TaskRow[] {
  return entries
    .filter((e) => e.hecho || e.nota.trim() !== '')
    .map((e) => ({ task_id: e.taskId, hecho: e.hecho, nota: e.nota.trim() || null }));
}

export function entriesFromTaskRows(rows: readonly TaskRow[]): TaskEntry[] {
  return rows.map((r) => ({ taskId: r.task_id, hecho: r.hecho, nota: r.nota ?? '' }));
}

export function doneCount(entries: readonly { hecho: boolean }[]): number {
  return entries.filter((e) => e.hecho).length;
}
