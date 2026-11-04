import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The guard that matters most in the form hook: when a visit's saved products or tasks can't
 * be read, saving must not replace them with an empty list.
 */
const data = vi.hoisted(() => ({
  fetchProducts: vi.fn(),
  fetchReportChemicals: vi.fn(),
  fetchTaskDefs: vi.fn(),
  fetchReportTasks: vi.fn(),
  replaceReportChemicals: vi.fn(),
  replaceReportTasks: vi.fn(),
}));
vi.mock('./data.js', () => data);

import { useServiceLogForm } from './useServiceLogForm.js';

const ok = <T>(d: T) => Promise.resolve({ data: d, failure: null });
const broken = Promise.resolve({
  data: [],
  failure: { code: 'unknown' as const, detail: 'timeout' },
});

beforeEach(() => {
  vi.clearAllMocks();
  data.fetchProducts.mockReturnValue(
    ok([{ id: 'p1', nombre: 'Cloro', unidad: 'kg', cantidadHabitual: null, activo: true }]),
  );
  data.fetchTaskDefs.mockReturnValue(ok([{ id: 't1', nombre: 'Barrido', orden: 1, activo: true }]));
  data.replaceReportChemicals.mockResolvedValue(null);
  data.replaceReportTasks.mockResolvedValue(null);
});

describe('useServiceLogForm', () => {
  it('saves products and tasks of a visit whose rows loaded', async () => {
    data.fetchReportChemicals.mockReturnValue(
      ok([{ product_id: 'p1', cantidad: 1, unidad: 'kg' }]),
    );
    data.fetchReportTasks.mockReturnValue(ok([{ task_id: 't1', hecho: true, nota: null }]));
    const { result } = renderHook(() => useServiceLogForm('r1'));
    await waitFor(() => expect(result.current.tasks).not.toBeNull());
    await act(async () => {
      expect(await result.current.save('r1', 'o1')).toBeNull();
    });
    expect(data.replaceReportChemicals).toHaveBeenCalledWith('r1', 'o1', [
      { product_id: 'p1', cantidad: 1, unidad: 'kg' },
    ]);
    expect(data.replaceReportTasks).toHaveBeenCalledWith('r1', 'o1', [
      { task_id: 't1', hecho: true, nota: null },
    ]);
  });

  it('never saves over saved rows it could not read', async () => {
    data.fetchReportChemicals.mockReturnValue(broken);
    data.fetchReportTasks.mockReturnValue(broken);
    const { result } = renderHook(() => useServiceLogForm('r1'));
    await waitFor(() => expect(result.current.productsFailure).not.toBeNull());
    await waitFor(() => expect(result.current.tasksFailure).not.toBeNull());
    await act(async () => {
      await result.current.save('r1', 'o1');
    });
    expect(data.replaceReportChemicals).not.toHaveBeenCalled();
    expect(data.replaceReportTasks).not.toHaveBeenCalled();
  });
});
