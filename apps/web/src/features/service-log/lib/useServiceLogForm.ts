import { useEffect, useState } from 'react';
import {
  checklist,
  chemicalRows,
  entriesFromRows,
  entriesFromTaskRows,
  taskRows,
  type ChemicalEntry,
  type ChemicalProduct,
  type TaskDef,
  type TaskEntry,
} from '@piscinas/shared';
import type { DbFailure } from '../../../lib/dbError.js';
import {
  fetchProducts,
  fetchReportChemicals,
  fetchReportTasks,
  fetchTaskDefs,
  replaceReportChemicals,
  replaceReportTasks,
} from './data.js';

/**
 * The service-log part of a report form (new report, edit, photo import): loads the org's
 * catalogues and, when editing, what the visit already has; validates; saves after the report.
 */
export function useServiceLogForm(reportId: string | undefined) {
  const [products, setProducts] = useState<ChemicalProduct[] | null>(null);
  const [productsFailure, setProductsFailure] = useState<DbFailure | null>(null);
  const [chemicals, setChemicals] = useState<ChemicalEntry[]>([]);
  const [invalidChemicals, setInvalidChemicals] = useState<string[]>([]);

  const [taskDefs, setTaskDefs] = useState<TaskDef[] | null>(null);
  const [tasksFailure, setTasksFailure] = useState<DbFailure | null>(null);
  const [savedTasks, setSavedTasks] = useState<TaskEntry[]>([]);
  // The checklist as edited; null until the list (and a saved visit's rows) have loaded.
  const [tasks, setTasks] = useState<TaskEntry[] | null>(null);

  useEffect(() => {
    let active = true;
    // Catalogue and this visit's saved products together, so neither failure can hide the other.
    void Promise.all([
      fetchProducts(),
      reportId ? fetchReportChemicals(reportId) : Promise.resolve({ data: [], failure: null }),
    ]).then(([catalogue, saved]) => {
      if (!active) return;
      setProducts(catalogue.data);
      // An unreadable list must never be saved over as empty: keep the failure, write nothing.
      setProductsFailure(catalogue.failure ?? saved.failure);
      if (!saved.failure) setChemicals(entriesFromRows(saved.data));
    });
    void Promise.all([
      fetchTaskDefs(),
      reportId ? fetchReportTasks(reportId) : Promise.resolve({ data: [], failure: null }),
    ]).then(([defs, saved]) => {
      if (!active) return;
      setTaskDefs(defs.data);
      // If this visit's saved tasks can't be read, show the failure and save nothing over them.
      setTasksFailure(defs.failure ?? saved.failure);
      const entries = saved.failure ? [] : entriesFromTaskRows(saved.data);
      setSavedTasks(entries);
      setTasks(checklist(defs.data, entries));
    });
    return () => {
      active = false;
    };
  }, [reportId]);

  /** Check before saving the report: products need a real quantity. */
  function validate(): boolean {
    const { invalid } = chemicalRows(chemicals);
    setInvalidChemicals(invalid);
    return invalid.length === 0;
  }

  /** Save after the report row exists. Returns the first failure, if any. */
  async function save(rid: string, orgId: string): Promise<DbFailure | null> {
    // A section that failed to load is never written: either its table doesn't exist yet
    // (migration not applied) or the visit's saved rows couldn't be read and must not be lost.
    if (!productsFailure) {
      const f = await replaceReportChemicals(rid, orgId, chemicalRows(chemicals).rows);
      if (f) return f;
    }
    if (tasksFailure || tasks === null) return null;
    return replaceReportTasks(rid, orgId, taskRows(tasks));
  }

  return {
    products,
    productsFailure,
    chemicals,
    setChemicals: (next: ChemicalEntry[]) => {
      setChemicals(next);
      if (invalidChemicals.length) setInvalidChemicals(chemicalRows(next).invalid);
    },
    invalidChemicals,
    taskDefs,
    tasksFailure,
    tasks,
    setTasks,
    /** Replace both lists at once (Repetir última visita). */
    prefill(next: { chemicals: ChemicalEntry[]; tasks: TaskEntry[] }) {
      setChemicals(next.chemicals);
      setInvalidChemicals([]);
      if (taskDefs) setTasks(checklist(taskDefs, next.tasks));
    },
    savedTasks,
    validate,
    save,
  };
}
