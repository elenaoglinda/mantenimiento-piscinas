import { describe, expect, it } from 'vitest';
import {
  DEMO_ORG_ID,
  DEMO_TABLES,
  demoId,
  generateDemo,
  isDemoOrgName,
  routeDays,
  type Row,
} from './generate.js';
import { TEST_PARAMS, testInput } from './testFixtures.js';

const madridDay = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(iso));

describe('demo org name guard', () => {
  it('accepts only names ending in "(demo)"', () => {
    expect(isDemoOrgName('Piscinas Mediterráneo (demo)')).toBe(true);
    expect(isDemoOrgName('Otra empresa (demo) ')).toBe(true);
    expect(isDemoOrgName('Piscinas Mediterráneo SL')).toBe(false);
    expect(isDemoOrgName('Demo (demo) real SL')).toBe(false);
    expect(isDemoOrgName(null)).toBe(false);
  });
});

describe('generateDemo', () => {
  const { data, files } = generateDemo(testInput());
  const siloeIds = new Set(TEST_PARAMS.filter((p) => p.key < 100).map((p) => p.id));

  it('is deterministic: same input, same rows and files', () => {
    expect(JSON.stringify(generateDemo(testInput()))).toBe(JSON.stringify({ data, files }));
    expect(generateDemo(testInput('2026-11-04')).data.report).not.toEqual(data.report);
  });

  it('is one org: every row belongs to it, ids are unique', () => {
    expect(data.org).toEqual([expect.objectContaining({ id: DEMO_ORG_ID, type: 'company' })]);
    for (const t of DEMO_TABLES) {
      if (t === 'org') continue;
      for (const r of data[t]) expect(r.org_id, t).toBe(DEMO_ORG_ID);
      const ids = data[t].map((r) => r.id);
      expect(new Set(ids).size, t).toBe(ids.length);
    }
  });

  it('has the portfolio asked for', () => {
    expect(data.client).toHaveLength(3);
    expect(data.client.map((c) => c.name)).toEqual([
      expect.stringContaining('Comunidad de Propietarios'),
      expect.stringContaining('Hotel'),
      expect.stringContaining('Villa'),
    ]);
    expect(data.pool).toHaveLength(8);
    expect(data.basin).toHaveLength(11);
    expect(data.app_user.filter((u) => u.role === 'technician')).toHaveLength(2);
    expect(data.chemical_product).toHaveLength(8);
    expect(data.task_def).toHaveLength(8);
    // SILOÉ codes on the Tipo 1–3A pools and their vasos; none on the private villa.
    for (const p of data.pool) {
      expect(!!p.siloe_cod_p).toBe(p.pool_type != null);
      for (const b of data.basin.filter((x) => x.pool_id === p.id)) {
        expect(!!b.siloe_cod_v).toBe(p.pool_type != null);
      }
    }
    // The villa has a salt chlorinator: salt readings and its chlorinator task.
    const villa = data.basin.find(
      (b) => b.denominacion === 'Piscina' && b.pool_id === demoId('pool:almendros'),
    )!;
    const villaReports = new Set(
      data.report.filter((r) => r.basin_id === villa.id).map((r) => r.id),
    );
    expect(
      data.measurement.some(
        (m) => villaReports.has(m.report_id) && m.parameter_def_id === 'pd-103',
      ),
    ).toBe(true);
    // Never a phone number: a demo must not WhatsApp a stranger. E-mails are .example.com.
    for (const c of data.client) {
      expect(c.contact_phone).toBeNull();
      expect(String(c.contact_email)).toMatch(/\.example\.com$/);
    }
  });

  it('covers 90 days, 2–3 visits a week per pool', () => {
    const days = data.report.map((r) => madridDay(String(r.visited_at))).sort();
    expect(days[0]).toBe('2026-08-06');
    expect(days.at(-1)).toBe('2026-11-03');
    for (const p of data.pool) {
      const visitDays = new Set(
        data.report.filter((r) => r.pool_id === p.id).map((r) => madridDay(String(r.visited_at))),
      );
      const perWeek = visitDays.size / (90 / 7);
      expect(perWeek, String(p.denominacion)).toBeGreaterThanOrEqual(1.8);
      expect(perWeek, String(p.denominacion)).toBeLessThanOrEqual(3.1);
    }
  });

  it('has 5–6 legal red readings, each with an incident and a corrective action', () => {
    const red = data.measurement.filter(
      (m) => m.status === 'red' && siloeIds.has(String(m.parameter_def_id)),
    );
    expect(red.length).toBeGreaterThanOrEqual(5);
    expect(red.length).toBeLessThanOrEqual(6);
    for (const m of red) {
      const inc = data.incident.find((i) => i.report_id === m.report_id);
      expect(inc?.corrective_action).toBeTruthy();
    }
    expect(data.incident).toHaveLength(red.length);
    // The newest is recent, so the dashboard opens with an alert.
    const newest = red
      .map((m) => data.report.find((r) => r.id === m.report_id)!.visited_at as string)
      .sort()
      .at(-1)!;
    expect(madridDay(newest) >= '2026-10-31').toBe(true);
  });

  it('logs products and tasks on every visit, some photos, the last 7 days signed', () => {
    for (const r of data.report) {
      expect(data.report_chemical.some((c) => c.report_id === r.id) || isSaltOnlyVisit(r)).toBe(
        true,
      );
      expect(data.report_task.some((t) => t.report_id === r.id)).toBe(true);
      const recent = madridDay(String(r.visited_at)) >= '2026-10-28';
      expect(r.status).toBe(recent ? 'signed' : 'completed');
      if (recent) {
        expect(r.signed_by_name).toBeTruthy();
        expect(files.some((f) => f.path === r.signature_path && f.kind === 'signature')).toBe(true);
      }
    }
    expect(data.attachment.length).toBeGreaterThanOrEqual(10);
    for (const a of data.attachment)
      expect(files.some((f) => f.path === a.storage_path)).toBe(true);
    // Every incident visit has a photo.
    for (const i of data.incident)
      expect(data.attachment.some((a) => a.report_id === i.report_id)).toBe(true);
  });

  function isSaltOnlyVisit(r: Row) {
    // The salt villa doesn't always need products; it always gets its chlorinator checked.
    return r.pool_id === demoId('pool:almendros');
  }

  it('routes: last 5 and next working days, with done, skipped and pending stops', () => {
    const { past, upcoming } = routeDays('2026-11-03');
    expect(past).toEqual(['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02']);
    expect(upcoming[0]).toBe('2026-11-03');
    expect(upcoming).toHaveLength(6);
    const routeDates = new Set(data.route.map((r) => r.route_date));
    for (const d of [...past, ...upcoming]) expect(routeDates.has(d)).toBe(true);

    const dateOf = new Map(data.route.map((r) => [r.id, String(r.route_date)]));
    const skipped = data.route_stop.filter((s) => s.estado === 'saltada');
    expect(skipped).toHaveLength(2);
    for (const s of skipped) expect(String(s.motivo).length).toBeGreaterThan(5);
    for (const s of data.route_stop) {
      const d = dateOf.get(String(s.route_id))!;
      if (s.estado === 'hecha') {
        const rep = data.report.find((r) => r.id === s.report_id);
        expect(rep?.pool_id).toBe(s.pool_id);
        expect(madridDay(String(rep!.visited_at))).toBe(d);
      } else {
        expect(s.report_id).toBeNull();
      }
      if (d > '2026-11-03') expect(s.estado).toBe('pendiente');
      if (d < '2026-11-03') expect(s.estado).not.toBe('pendiente');
    }
    // Today: the first stop of each route is done, the rest pending.
    const todayStops = data.route_stop.filter(
      (s) => dateOf.get(String(s.route_id)) === '2026-11-03',
    );
    expect(todayStops.some((s) => s.estado === 'hecha')).toBe(true);
    expect(todayStops.some((s) => s.estado === 'pendiente')).toBe(true);
    // A skipped visit has no report that day.
    for (const s of skipped) {
      const d = dateOf.get(String(s.route_id))!;
      expect(
        data.report.some((r) => r.pool_id === s.pool_id && madridDay(String(r.visited_at)) === d),
      ).toBe(false);
    }
  });

  it('invoices are drafts only, with no billing profile (so they can never be issued)', () => {
    expect(data.invoice.length).toBeGreaterThanOrEqual(2);
    for (const i of data.invoice) {
      expect(i.status).toBe('draft');
      expect(i).not.toHaveProperty('number');
    }
    expect(DEMO_TABLES).not.toContain('billing_profile');
    expect(data.invoice_line.length).toBeGreaterThanOrEqual(data.invoice.length);
  });

  it('the org starts with its "incomplete" name; the seed renames it when done', () => {
    expect(isDemoOrgName(data.org[0]!.name)).toBe(true);
    expect(data.org[0]!.name).not.toBe('Piscinas Mediterráneo (demo)');
  });
});
