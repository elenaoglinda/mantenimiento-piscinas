import { createContext, useContext } from 'react';

/** Something the user should look at, shown in the bell and counted on the sidebar. */
export interface ShellAlert {
  id: string;
  kind: 'reading' | 'invoice';
  title: string;
  detail: string;
  to: string;
}

export interface ShellData {
  /** null until the first load finishes. */
  alerts: ShellAlert[] | null;
  /** Draft reports waiting to be completed (Informes badge). */
  draftReports: number;
  /** Invoices needing attention (Facturación badge). */
  invoiceAttention: number;
}

export const EMPTY_SHELL_DATA: ShellData = { alerts: null, draftReports: 0, invoiceAttention: 0 };

export const ShellDataContext = createContext<ShellData>(EMPTY_SHELL_DATA);

export function useShellData(): ShellData {
  return useContext(ShellDataContext);
}
