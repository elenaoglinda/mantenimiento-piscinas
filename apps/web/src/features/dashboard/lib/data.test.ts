import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A stand-in for the supabase client: every query on a table resolves to that table's
 * configured response, whatever filters were chained. Enough to check how loadDashboard
 * combines results; the real queries are covered by the ui checks (scripts/redesign).
 */
type Response = { data?: unknown; count?: number | null; error?: unknown };
const responses = vi.hoisted(() => new Map<string, Response>());

vi.mock('../../../lib/supabase.js', () => {
  const query = (table: string) => {
    const result = () => {
      const r = responses.get(table) ?? {};
      return { data: r.data ?? [], count: r.count ?? null, error: r.error ?? null };
    };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'in', 'order', 'limit']) {
      chain[m] = () => chain;
    }
    chain.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(ok, ko);
    return chain;
  };
  return { supabase: { from: query } };
});

import { loadDashboard, loadRoutesBetween } from './data.js';

const POOLS = Array.from({ length: 7 }, (_, i) => ({
  id: `p${i}`,
  denominacion: `Piscina ${i}`,
  created_at: '2026-09-01T00:00:00Z',
  archived: false,
  client: { name: 'Comunidad' },
}));

beforeEach(() => {
  responses.clear();
  responses.set('pool', { data: POOLS });
  responses.set('parameter_def', { data: [] });
  responses.set('measurement', { data: [] });
});

describe('loadDashboard', () => {
  it('returns every pool with its client name', async () => {
    const { data, failure } = await loadDashboard({ today: '2026-11-13', siloeYear: 2025 });
    expect(failure).toBeNull();
    expect(data?.pools).toHaveLength(7);
    expect(data?.pools[0]).toMatchObject({ id: 'p0', clientName: 'Comunidad', archived: false });
  });

  it('returns no data when the pool query fails, so nothing reads as "0 pools"', async () => {
    responses.set('pool', {
      data: null,
      error: { code: 'PGRST200', message: "Could not find a relationship between 'pool'" },
    });
    const { data, failure } = await loadDashboard({ today: '2026-11-13', siloeYear: 2025 });
    expect(data).toBeNull();
    expect(failure).toEqual({
      code: 'unknown',
      detail: "Could not find a relationship between 'pool'",
    });
  });

  it('fails when the out-of-range readings cannot be read, so nothing reads as "Todo en orden"', async () => {
    responses.set('measurement', { data: null, error: { code: '42501', message: 'denied' } });
    const { data, failure } = await loadDashboard({ today: '2026-11-13', siloeYear: 2025 });
    expect(data).toBeNull();
    expect(failure?.code).toBe('forbidden');
  });

  it('fails on a count query too (missing table → missing_schema)', async () => {
    responses.set('xml_export', { error: { code: 'PGRST205', message: 'no table' } });
    const { data, failure } = await loadDashboard({ today: '2026-11-13', siloeYear: 2025 });
    expect(data).toBeNull();
    expect(failure?.code).toBe('missing_schema');
  });
});

describe('loadRoutesBetween', () => {
  it('returns routes and their stops', async () => {
    responses.set('route', { data: [{ id: 'r1', route_date: '2026-11-13' }] });
    responses.set('route_stop', {
      data: [{ route_id: 'r1', pool_id: 'p0', seq: 1, eta: null, estado: 'hecha' }],
    });
    const { data, failure } = await loadRoutesBetween('2026-11-13', '2026-11-13');
    expect(failure).toBeNull();
    expect(data?.routes).toHaveLength(1);
    expect(data?.stops[0]).toMatchObject({ pool_id: 'p0', estado: 'hecha' });
  });

  it('fails instead of returning an empty day when the stops cannot be read', async () => {
    responses.set('route', { data: [{ id: 'r1', route_date: '2026-11-13' }] });
    responses.set('route_stop', { data: null, error: { code: 'XX000', message: 'boom' } });
    const { data, failure } = await loadRoutesBetween('2026-11-13', '2026-11-13');
    expect(data).toBeNull();
    expect(failure).toEqual({ code: 'unknown', detail: 'boom' });
  });
});
