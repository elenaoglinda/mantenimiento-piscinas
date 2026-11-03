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
    void fetchProducts().then((r) => {
      if (!active) return;
      setProducts(r.data);
      setProductsFailure(r.failure);
    });
    void Promise.all([
      fetchTaskDefs(),
      reportId ? fetchReportTasks(reportId) : Promise.resolve({ data: [], failure: null }),
    ]).then(([defs, saved]) => {
      if (!active) return;
      setTaskDefs(defs.data);
      setTasksFailure(defs.failure);
      const entries = saved.failure ? [] : entriesFromTaskRows(saved.data);
      setSavedTasks(entries);
      setTasks(checklist(defs.data, entries));
    });
    if (reportId)
      void fetchReportChemicals(reportId).then((r) => {
        if (active && !r.failure) setChemicals(entriesFromRows(r.data));
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
    // Nothing to write and nowhere to write it (migration not applied yet): not an error.
    if (!(productsFailure && chemicals.length === 0)) {
      const f = await replaceReportChemicals(rid, orgId, chemicalRows(chemicals).rows);
      if (f) return f;
    }
    const rows = taskRows(tasks ?? []);
    if (tasksFailure && rows.length === 0) return null;
    return replaceReportTasks(rid, orgId, rows);
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
