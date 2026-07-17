import { describe, expect, it } from 'vitest';
import {
  bucketRoutesByDate,
  buildChecklist,
  daysBetween,
  lastVisitByPool,
  madridDateString,
  madridTime,
  monthGrid,
  stalePools,
  type PoolLite,
  type RouteLite,
} from './dashboard.js';

describe('date helpers (Europe/Madrid)', () => {
  it('buckets an instant into the correct Madrid calendar day near midnight (CEST, +02:00)', () => {
    // 2026-07-13 22:30 UTC is already 2026-07-14 00:30 in Madrid summer time.
    expect(madridDateString(new Date('2026-07-13T22:30:00Z'))).toBe('2026-07-14');
    // …and still 2026-07-13 just before.
    expect(madridDateString(new Date('2026-07-13T21:30:00Z'))).toBe('2026-07-13');
  });

  it('formats ETA in Madrid local time', () => {
    expect(madridTime('2026-07-13T07:30:00Z')).toBe('09:30'); // +02:00 in July
  });

  it('counts whole days between date strings', () => {
    expect(daysBetween('2026-07-01', '2026-07-31')).toBe(30);
    expect(daysBetween('2026-07-31', '2026-07-01')).toBe(-30);
  });
});

describe('bucketRoutesByDate', () => {
  it('groups routes by route_date verbatim (no timezone conversion)', () => {
    const routes: RouteLite[] = [
      { id: 'a', route_date: '2026-07-14', stops: [] },
      { id: 'b', route_date: '2026-07-14', stops: [] },
      { id: 'c', route_date: '2026-07-15', stops: [] },
    ];
    const map = bucketRoutesByDate(routes);
    expect(map.get('2026-07-14')?.map((r) => r.id)).toEqual(['a', 'b']);
    expect(map.get('2026-07-15')?.map((r) => r.id)).toEqual(['c']);
  });
});

describe('monthGrid', () => {
  it('produces a 42-cell Monday-first grid flagging in-month and today', () => {
    // July 2026: the 1st is a Wednesday → grid starts Mon Jun 29.
    const grid = monthGrid(2026, 6, '2026-07-13');
    expect(grid).toHaveLength(42);
    expect(grid[0].date).toBe('2026-06-29');
    expect(grid[0].inMonth).toBe(false);
    const today = grid.find((d) => d.isToday);
    expect(today?.date).toBe('2026-07-13');
    expect(today?.inMonth).toBe(true);
  });
});

describe('lastVisitByPool + stalePools', () => {
  it('keeps the most recent visit per pool', () => {
    const map = lastVisitByPool([
      { pool_id: 'p1', visited_at: '2026-07-01T10:00:00Z' },
      { pool_id: 'p1', visited_at: '2026-07-10T10:00:00Z' },
      { pool_id: 'p2', visited_at: '2026-06-01T10:00:00Z' },
    ]);
    expect(map.get('p1')).toBe('2026-07-10T10:00:00Z');
    expect(map.get('p2')).toBe('2026-06-01T10:00:00Z');
  });

  it('flags pools stale beyond the threshold, most overdue first, and excludes recent ones', () => {
    const pools: PoolLite[] = [
      { id: 'p1', denominacion: 'Fresh', created_at: '2026-01-01T00:00:00Z' },
      { id: 'p2', denominacion: 'Stale', created_at: '2026-01-01T00:00:00Z' },
      { id: 'p3', denominacion: 'New empty', created_at: '2026-07-10T00:00:00Z' },
      { id: 'p4', denominacion: 'Old empty', created_at: '2026-01-01T00:00:00Z' },
    ];
    const visits = new Map([
      ['p1', '2026-07-05T10:00:00Z'], // 8 days → not stale
      ['p2', '2026-05-01T10:00:00Z'], // ~73 days → stale
    ]);
    const result = stalePools(pools, visits, '2026-07-13', 30);
    const ids = result.map((s) => s.pool.id);
    expect(ids).toContain('p2'); // stale visited
    expect(ids).toContain('p4'); // never visited, created long ago
    expect(ids).not.toContain('p1'); // visited recently
    expect(ids).not.toContain('p3'); // never visited but brand new
    // most overdue first
    expect(ids[0]).toBe('p4');
    expect(result.find((s) => s.pool.id === 'p4')?.neverVisited).toBe(true);
  });
});

describe('buildChecklist', () => {
  const base = {
    clientCount: 0,
    poolCount: 0,
    basinCount: 0,
    reportCount: 0,
    exportCount: 0,
    routeCount: 0,
    memberCount: 1,
  };

  it('gives owners 4 primary steps (no client step) and tracks progress', () => {
    const cl = buildChecklist({ ...base, isCompany: false, poolCount: 1, basinCount: 1 });
    expect(cl.total).toBe(4);
    expect(cl.primary.map((s) => s.key)).toEqual([
      'addPool',
      'addBasin',
      'createReport',
      'exportSiloe',
    ]);
    expect(cl.doneCount).toBe(2);
    expect(cl.allDone).toBe(false);
  });

  it('gives companies a 5th client step and marks allDone when every primary step is done', () => {
    const cl = buildChecklist({
      isCompany: true,
      clientCount: 1,
      poolCount: 1,
      basinCount: 1,
      reportCount: 1,
      exportCount: 1,
      routeCount: 0,
      memberCount: 1,
    });
    expect(cl.total).toBe(5);
    expect(cl.primary[0].key).toBe('addClient');
    expect(cl.allDone).toBe(true);
    expect(cl.secondary.map((s) => s.key)).toEqual(['inviteTeam', 'planRoute']);
  });
});
