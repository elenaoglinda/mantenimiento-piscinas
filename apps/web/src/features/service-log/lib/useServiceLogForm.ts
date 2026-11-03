import { useEffect, useState } from 'react';
import {
  chemicalRows,
  entriesFromRows,
  type ChemicalEntry,
  type ChemicalProduct,
} from '@piscinas/shared';
import type { DbFailure } from '../../../lib/dbError.js';
import { fetchProducts, fetchReportChemicals, replaceReportChemicals } from './data.js';

/**
 * The service-log part of a report form (new report, edit, photo import): loads the org's
 * catalogue and, when editing, what the visit already has; validates; saves after the report.
 */
export function useServiceLogForm(reportId: string | undefined) {
  const [products, setProducts] = useState<ChemicalProduct[] | null>(null);
  const [productsFailure, setProductsFailure] = useState<DbFailure | null>(null);
  const [chemicals, setChemicals] = useState<ChemicalEntry[]>([]);
  const [invalidChemicals, setInvalidChemicals] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void fetchProducts().then((r) => {
      if (!active) return;
      setProducts(r.data);
      setProductsFailure(r.failure);
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
    if (productsFailure && chemicals.length === 0) return null;
    return replaceReportChemicals(rid, orgId, chemicalRows(chemicals).rows);
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
    validate,
    save,
  };
}
