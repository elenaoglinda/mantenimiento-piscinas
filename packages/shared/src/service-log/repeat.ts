/**
 * "Repetir última visita": start a new report from what was done last time at the same vaso —
 * technician, products and tasks. Readings are never copied: they must be measured.
 */
import {
  entriesFromRows,
  type ChemicalEntry,
  type ChemicalProduct,
  type ChemicalUnit,
} from './chemicals.js';
import type { TaskDef, TaskEntry } from './tasks.js';

export interface LastVisit {
  visitedAt: string;
  technicianId: string | null;
  chemicals: { product_id: string; cantidad: number; unidad: ChemicalUnit }[];
  tasks: { task_id: string; hecho: boolean; nota: string | null }[];
}

export interface RepeatedVisit {
  technicianId: string | null;
  chemicals: ChemicalEntry[];
  tasks: TaskEntry[];
  /** Items left out because they were deactivated since (for the message). */
  skipped: number;
}

/**
 * What to prefill. Only products and tasks that are still active are copied; quantities are
 * the ones used last time (and stay editable); tasks are copied as done, without their notes
 * (a note describes that visit, not this one). Tasks not done last time stay unchecked.
 */
export function repeatVisit(
  last: LastVisit,
  products: readonly ChemicalProduct[],
  taskDefs: readonly TaskDef[],
): RepeatedVisit {
  const activeProducts = new Set(products.filter((p) => p.activo).map((p) => p.id));
  const activeTasks = new Set(taskDefs.filter((d) => d.activo).map((d) => d.id));
  const chemRows = last.chemicals.filter((c) => activeProducts.has(c.product_id));
  const doneTasks = last.tasks.filter((t) => t.hecho);
  const taskRows = doneTasks.filter((t) => activeTasks.has(t.task_id));
  return {
    technicianId: last.technicianId,
    chemicals: entriesFromRows(chemRows),
    tasks: taskRows.map((t) => ({ taskId: t.task_id, hecho: true, nota: '' })),
    skipped: last.chemicals.length - chemRows.length + (doneTasks.length - taskRows.length),
  };
}
