import { useEffect, useState } from 'react';
import type { DbFailure } from '../../../lib/dbError.js';
import { fetchParamCatalog, type LoadResult, type ParamCatalog } from './data.js';

// Parameter definitions change only with a migration: load them once per session.
let pending: Promise<LoadResult<ParamCatalog>> | null = null;

/** The parameter catalogue (names, units, thresholds), shared by every history screen. */
export function useParamCatalog(): { catalog: ParamCatalog | null; failure: DbFailure | null } {
  const [state, setState] = useState<{ catalog: ParamCatalog | null; failure: DbFailure | null }>({
    catalog: null,
    failure: null,
  });
  useEffect(() => {
    let active = true;
    pending ??= fetchParamCatalog();
    void pending.then((r) => {
      if (r.failure) pending = null; // try again next time instead of caching the error
      if (active) setState({ catalog: r.failure ? null : r.data, failure: r.failure });
    });
    return () => {
      active = false;
    };
  }, []);
  return state;
}
