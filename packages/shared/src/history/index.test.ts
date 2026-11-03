import { describe, expect, it } from 'vitest';
import type { ParameterDef } from '../evaluate.js';
import {
  activeFilterCount,
  buildTrend,
  csvNumber,
  dateRangeBounds,
  daysSince,
  EMPTY_VISIT_FILTERS,
  groupReadingsByVisit,
  latestStateByBasin,
  madridStartOfDay,
  niceTicks,
  parseVisitFilters,
  readingStatus,
  toCsv,
  trendDomain,
  visitsCsv,
  worstStatus,
  writeVisitFilters,
} from './index.js';

const PH: ParameterDef = { minOk: 7.2, maxOk: 8.0, closureMin: 6, closureMax: 9 };
const FREE_CL: ParameterDef = { minOk: 0.5, maxOk: 2.0 };
const defs = new Map<number, ParameterDef>([
  [1, PH],
  [10, FREE_CL],
]);

describe('worstStatus / readingStatus', () => {
  it('ranks red over amber over green over unknown', () => {
    expect(worstStatus(['green', 'amber', 'green'])).toBe('amber');
    expect(worstStatus(['unknown', 'red', 'amber'])).toBe('red');
    expect(worstStatus([])).toBe('unknown');
  });

  it('evaluates with the current definition, else keeps the stored status', () => {
    expect(readingStatus(8.6, PH)).toBe('red');
    expect(readingStatus(7.6, PH)).toBe('green');
    expect(readingStatus(5, undefined, 'amber')).toBe('amber');
    expect(readingStatus(null, PH, 'red')).toBe('unknown');
  });
});

describe('daysSince (Madrid calendar days)', () => {
  const now = new Date('2026-07-15T10:00:00Z');
  it('counts calendar days, not 24-hour periods', () => {
    expect(daysSince('2026-07-15T06:00:00Z', now)).toBe(0);
    // 23:30 Madrid on the 14th is "yesterday" even though it is under 24 h ago.
    expect(daysSince('2026-07-14T21:30:00Z', now)).toBe(1);
    expect(daysSince('2026-07-01T10:00:00Z', now)).toBe(14);
  });
  it('never goes negative for a future timestamp', () => {
    expect(daysSince('2026-07-20T10:00:00Z', now)).toBe(0);
  });
});

describe('dateRangeBounds', () => {
  it('starts at Madrid midnight in summer (UTC+2) and winter (UTC+1)', () => {
    expect(madridStartOfDay('2026-07-01')).toBe('2026-06-30T22:00:00.000Z');
    expect(madridStartOfDay('2026-01-10')).toBe('2026-01-09T23:00:00.000Z');
  });
  it('makes the end day inclusive with a half-open upper bound', () => {
    expect(dateRangeBounds('2026-07-01', '2026-07-31')).toEqual({
      gte: '2026-06-30T22:00:00.000Z',
      lt: '2026-07-31T22:00:00.000Z',
    });
  });
  it('handles the DST change day and open ends, and ignores garbage', () => {
    // 2026-03-29: clocks go forward at 02:00, midnight is still UTC+1.
    expect(dateRangeBounds('2026-03-29', null)).toEqual({ gte: '2026-03-28T23:00:00.000Z' });
    expect(dateRangeBounds(null, '2026-10-25')).toEqual({ lt: '2026-10-25T23:00:00.000Z' });
    expect(dateRangeBounds('ayer', '2026-13-45')).toEqual({});
  });
});

describe('latestStateByBasin', () => {
  it('keeps the newest value per parameter and lights it with the current thresholds', () => {
    const state = latestStateByBasin(
      [
        {
          basinId: 'v1',
          siloeParamId: 1,
          value: 8.6,
          visitedAt: '2026-07-01T09:00:00Z',
          reportId: 'r1',
        },
        {
          basinId: 'v1',
          siloeParamId: 1,
          value: 7.5,
          visitedAt: '2026-07-10T09:00:00Z',
          reportId: 'r2',
        },
        {
          basinId: 'v1',
          siloeParamId: 10,
          value: 0.55,
          visitedAt: '2026-07-05T09:00:00Z',
          reportId: 'r3',
        },
      ],
      defs,
      ['v1', 'v2'],
    );
    const v1 = state.get('v1')!;
    expect(v1.params.map((p) => [p.siloeParamId, p.value, p.status])).toEqual([
      [1, 7.5, 'green'],
      [10, 0.55, 'amber'],
    ]);
    expect(v1.lastReadingAt).toBe('2026-07-10T09:00:00Z');
    expect(v1.status).toBe('amber');
  });

  it('gives a basin with no readings an empty state', () => {
    const v2 = latestStateByBasin([], defs, ['v2']).get('v2')!;
    expect(v2).toEqual({ basinId: 'v2', params: [], lastReadingAt: null, status: 'unknown' });
  });

  it('falls back to the stored status for a parameter with no definition', () => {
    const s = latestStateByBasin(
      [
        {
          basinId: 'v',
          siloeParamId: 99,
          value: 3,
          visitedAt: '2026-07-01T00:00:00Z',
          reportId: 'r',
          status: 'red',
        },
      ],
      defs,
    );
    expect(s.get('v')!.status).toBe('red');
  });
});

describe('groupReadingsByVisit', () => {
  it('indexes readings by visit and parameter', () => {
    const g = groupReadingsByVisit([
      { reportId: 'r1', siloeParamId: 1, value: 7.4 },
      { reportId: 'r1', siloeParamId: 10, value: 1.1 },
      { reportId: 'r2', siloeParamId: 1, value: null },
    ]);
    expect(g.get('r1')!.get(10)!.value).toBe(1.1);
    expect(g.get('r2')!.get(1)!.value).toBeNull();
    expect(g.get('r3')).toBeUndefined();
  });
});

describe('trend', () => {
  const now = new Date('2026-07-31T12:00:00Z');
  const readings = [
    { basinId: 'v1', visitedAt: '2026-07-20T09:00:00Z', value: 7.4, reportId: 'a' },
    { basinId: 'v1', visitedAt: '2026-07-02T09:00:00Z', value: 8.4, reportId: 'b' },
    { basinId: 'v2', visitedAt: '2026-07-25T09:00:00Z', value: 7.0, reportId: 'c' },
    { basinId: 'v2', visitedAt: '2026-01-25T09:00:00Z', value: 7.3, reportId: 'old' },
    { basinId: 'v1', visitedAt: '2026-07-21T09:00:00Z', value: null, reportId: 'empty' },
  ];

  it('builds one series per basin inside the window, oldest first, marking out-of-range points', () => {
    const series = buildTrend(readings, PH, 30, now);
    expect(series.map((s) => s.basinId).sort()).toEqual(['v1', 'v2']);
    const v1 = series.find((s) => s.basinId === 'v1')!;
    expect(v1.points.map((p) => p.reportId)).toEqual(['b', 'a']);
    expect(v1.points[0].outOfRange).toBe(true);
    expect(v1.points[1].outOfRange).toBe(false);
    const v2 = series.find((s) => s.basinId === 'v2')!;
    expect(v2.points.map((p) => p.reportId)).toEqual(['c']);
    expect(v2.points[0].status).toBe('red');
  });

  it('widens the window to include older readings', () => {
    const series = buildTrend(readings, PH, 365, now);
    expect(series.find((s) => s.basinId === 'v2')!.points).toHaveLength(2);
  });

  it('covers both the values and the legal band in the y-domain', () => {
    const [lo, hi] = trendDomain(buildTrend(readings, PH, 30, now), PH);
    expect(lo).toBeLessThan(7.0);
    expect(hi).toBeGreaterThan(8.4);
    expect(trendDomain([], undefined)).toEqual([0, 1]);
    // Non-negative readings never get a negative axis.
    const [clLo] = trendDomain(
      [
        {
          basinId: 'v',
          points: [
            { t: 0, visitedAt: '', value: 0.1, reportId: 'x', status: 'red', outOfRange: true },
          ],
        },
      ],
      FREE_CL,
    );
    expect(clLo).toBe(0);
  });

  it('chooses round ticks', () => {
    expect(niceTicks(6.9, 8.6, 5)).toEqual([7, 7.5, 8, 8.5]);
    expect(niceTicks(0, 2.2, 4)).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(niceTicks(3, 3)).toEqual([3]);
  });
});

describe('CSV for Spanish Excel', () => {
  it('uses a decimal comma and no thousands separator', () => {
    expect(csvNumber(7.4)).toBe('7,4');
    expect(csvNumber(0.125)).toBe('0,125');
    expect(csvNumber(1250)).toBe('1250');
    expect(csvNumber(null)).toBe('');
    expect(csvNumber(Number.NaN)).toBe('');
  });

  it('starts with a BOM, separates with ";" and quotes what needs it', () => {
    const csv = toCsv([
      ['Fecha', 'Piscina'],
      ['01/07/2026', 'Villa "Mar"; norte'],
      ['=HYPERLINK("x")', -1.5],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe(
      'Fecha;Piscina\r\n01/07/2026;"Villa ""Mar""; norte"\r\n"\'=HYPERLINK(""x"")";-1,5\r\n',
    );
  });

  it('exports one row per visit and one column per parameter, in Madrid time', () => {
    const csv = visitsCsv(
      [
        {
          id: 'r1',
          visitedAt: '2026-07-01T08:05:00Z',
          clientName: 'Comunidad Las Dunas',
          poolName: 'Piscina',
          basinName: 'Vaso grande',
          technicianName: 'Lucía',
          statusLabel: 'Firmado',
          incidentCount: 1,
          openIncidentCount: 0,
        },
      ],
      new Map([['r1', new Map([[1, { value: 7.45 }]])]]),
      [
        { siloeParamId: 1, label: 'pH' },
        { siloeParamId: 10, label: 'Cloro libre residual (mg/L)' },
      ],
      {
        date: 'Fecha',
        time: 'Hora',
        client: 'Cliente',
        pool: 'Piscina',
        basin: 'Vaso',
        technician: 'Técnico',
        status: 'Estado',
        incidents: 'Incidencias',
        openIncidents: 'Incidencias abiertas',
      },
    );
    const [header, row] = csv.slice(1).trim().split('\r\n');
    expect(header).toBe(
      'Fecha;Hora;Cliente;Piscina;Vaso;Técnico;Estado;pH;Cloro libre residual (mg/L);Incidencias;Incidencias abiertas',
    );
    expect(row).toBe(
      '01/07/2026;10:05;Comunidad Las Dunas;Piscina;Vaso grande;Lucía;Firmado;7,45;;1;0',
    );
  });
});

describe('visit filters in the URL', () => {
  it('reads valid filters and drops malformed ones', () => {
    const q = new URLSearchParams(
      'desde=2026-07-01&hasta=nope&cliente=c1&tecnico=u1&fuera=1&estado=signed&q=x',
    );
    expect(parseVisitFilters((k) => q.get(k))).toEqual({
      ...EMPTY_VISIT_FILTERS,
      from: '2026-07-01',
      client: 'c1',
      technician: 'u1',
      outOfRange: true,
      status: 'signed',
    });
    const bad = new URLSearchParams('estado=deleted&fuera=yes');
    expect(parseVisitFilters((k) => bad.get(k))).toEqual(EMPTY_VISIT_FILTERS);
  });

  it('writes filters back, keeps unrelated params and removes cleared ones', () => {
    const start = new URLSearchParams('q=villa&cliente=c1&fuera=1');
    const next = writeVisitFilters(start, { client: null, outOfRange: false, pool: 'p9' });
    expect(next.toString()).toBe('q=villa&piscina=p9');
    const round = parseVisitFilters((k) =>
      writeVisitFilters(new URLSearchParams(), { from: '2026-01-01', outOfRange: true }).get(k),
    );
    expect(round.from).toBe('2026-01-01');
    expect(round.outOfRange).toBe(true);
  });

  it('counts active filters', () => {
    expect(activeFilterCount(EMPTY_VISIT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_VISIT_FILTERS, pool: 'p', outOfRange: true })).toBe(2);
  });
});
