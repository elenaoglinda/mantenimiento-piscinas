import { useEffect, useState } from 'react';
import type { DbFailure } from '../../../lib/dbError.js';
import { fetchFilterOptions, type Option } from './data.js';

export interface VisitFilterOptions {
  clients: Option[];
  pools: Option[];
  technicians: Option[];
}

/** Clients, pools and technicians for the Informes filters. null while loading. */
export function useVisitFilterOptions(): {
  options: VisitFilterOptions | null;
  failure: DbFailure | null;
} {
  const [state, setState] = useState<{
    options: VisitFilterOptions | null;
    failure: DbFailure | null;
  }>({ options: null, failure: null });
  useEffect(() => {
    let active = true;
    void fetchFilterOptions().then((r) => {
      if (active) setState({ options: r.data, failure: r.failure });
    });
    return () => {
      active = false;
    };
  }, []);
  return state;
}
