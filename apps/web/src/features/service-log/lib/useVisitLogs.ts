import { useEffect, useMemo, useState } from 'react';
import type { DbFailure } from '../../../lib/dbError.js';
import {
  fetchChemicalsForReports,
  fetchTasksForReports,
  type ProductUse,
  type TaskDone,
} from './data.js';

export interface VisitLog {
  products: ProductUse[];
  /** Tasks recorded for the visit (done, or with a note), in list order. */
  tasks: TaskDone[];
}

const EMPTY: VisitLog = { products: [], tasks: [] };

/**
 * What was done at each of these visits (products, tasks), for lists that show many visits at once.
 * Fetched separately from the visits themselves, so a database without the service-log tables
 * yet still shows the history, with a notice instead of the log.
 */
export function useVisitLogs(reportIds: string[]): {
  logs: Map<string, VisitLog> | null;
  failure: DbFailure | null;
  logOf: (id: string) => VisitLog;
} {
  const key = reportIds.join(',');
  const [logs, setLogs] = useState<Map<string, VisitLog> | null>(null);
  const [failure, setFailure] = useState<DbFailure | null>(null);

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    let active = true;
    void Promise.all([fetchChemicalsForReports(ids), fetchTasksForReports(ids)]).then(
      ([chem, tasks]) => {
        if (!active) return;
        const map = new Map<string, VisitLog>();
        for (const id of ids)
          map.set(id, { products: chem.data.get(id) ?? [], tasks: tasks.data.get(id) ?? [] });
        setLogs(map);
        setFailure(chem.failure ?? tasks.failure);
      },
    );
    return () => {
      active = false;
    };
  }, [key]);

  return useMemo(
    () => ({ logs, failure, logOf: (id: string) => logs?.get(id) ?? EMPTY }),
    [logs, failure],
  );
}
