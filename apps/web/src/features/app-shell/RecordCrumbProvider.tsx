import { useState, type ReactNode } from 'react';
import { SetCtx, ValueCtx, type RecordCrumb } from './recordCrumb.js';

/** Holds the current page's record name for the breadcrumb. See recordCrumb.ts. */
export function RecordCrumbProvider({ children }: { children: ReactNode }) {
  const [crumb, setCrumb] = useState<RecordCrumb | null>(null);
  return (
    <SetCtx.Provider value={setCrumb}>
      <ValueCtx.Provider value={crumb}>{children}</ValueCtx.Provider>
    </SetCtx.Provider>
  );
}
