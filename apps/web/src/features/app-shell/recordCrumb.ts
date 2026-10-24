import { createContext, useContext, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Lets a detail page tell the shell what its record is called, so the breadcrumb and the tab
 * title read "Piscinas › Villa Mar" instead of "Piscinas › Detalle".
 *
 * The label is stored with the path it belongs to and only shown on that path, so a stale name
 * can never leak onto the next page while it loads.
 */
export interface RecordCrumb {
  path: string;
  label: string;
}

export const SetCtx = createContext<(crumb: RecordCrumb | null) => void>(() => {});
export const ValueCtx = createContext<RecordCrumb | null>(null);

/** Call from a detail page once its record has loaded: `useRecordCrumb(pool?.denominacion)`. */
export function useRecordCrumb(label: string | null | undefined) {
  const set = useContext(SetCtx);
  const { pathname } = useLocation();
  useEffect(() => {
    if (!label) return;
    set({ path: pathname, label });
    return () => set(null);
  }, [label, pathname, set]);
}

/** The current page's record name, if it has published one. */
export function useCurrentRecordLabel(): string | null {
  const crumb = useContext(ValueCtx);
  const { pathname } = useLocation();
  return useMemo(() => (crumb && crumb.path === pathname ? crumb.label : null), [crumb, pathname]);
}
