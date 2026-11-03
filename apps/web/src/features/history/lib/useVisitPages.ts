import { useCallback, useEffect, useRef, useState } from 'react';
import type { DbFailure } from '../../../lib/dbError.js';
import { fetchVisitPage, type ParamCatalog, type Visit, type VisitScope } from './data.js';
import { useParamCatalog } from './useParamCatalog.js';

/**
 * A paged visit list for a scope: the first page on mount and whenever the scope changes,
 * then `loadMore()` for the next one. Pass a memoised scope (a new object reloads), or null
 * to wait until the caller knows it (e.g. while filter options load).
 */
export function useVisitPages(
  scope: VisitScope | null,
  pageSize: number,
): {
  catalog: ParamCatalog | null;
  visits: Visit[] | null;
  hasMore: boolean;
  loadingMore: boolean;
  failure: DbFailure | null;
  loadMore: () => void;
} {
  const { catalog, failure: catalogFailure } = useParamCatalog();
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState<DbFailure | null>(null);
  const request = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      if (!catalog || !scope) return;
      const id = ++request.current;
      if (offset === 0) setVisits(null);
      else setLoadingMore(true);
      const r = await fetchVisitPage(scope, catalog, offset, pageSize);
      if (id !== request.current) return; // a newer scope won
      setFailure(r.failure);
      setVisits((prev) => (offset === 0 ? r.data.visits : [...(prev ?? []), ...r.data.visits]));
      setHasMore(r.data.hasMore);
      setLoadingMore(false);
    },
    [catalog, scope, pageSize],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  return {
    catalog,
    visits,
    hasMore,
    loadingMore,
    failure: catalogFailure ?? failure,
    loadMore: () => void load(visits?.length ?? 0),
  };
}
