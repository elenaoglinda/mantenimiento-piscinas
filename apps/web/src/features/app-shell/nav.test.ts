import { describe, expect, it } from 'vitest';
import { resolveRoute, visibleGroups } from './nav.js';

describe('resolveRoute', () => {
  it('matches Inicio only on the exact root', () => {
    expect(resolveRoute('/').item?.to).toBe('/');
    expect(resolveRoute('/pools').item?.to).toBe('/pools');
  });

  it('keeps the parent active on nested routes', () => {
    expect(resolveRoute('/pools/abc').item?.to).toBe('/pools');
    expect(resolveRoute('/reports/abc/edit').item?.to).toBe('/reports');
    expect(resolveRoute('/invoices/resumen').item?.to).toBe('/invoices');
  });

  it('reads specific sub-pages before the generic detail pattern', () => {
    expect(resolveRoute('/reports/new').subKey).toBe('shell.crumbs.newReport');
    expect(resolveRoute('/reports/import').subKey).toBe('shell.crumbs.import');
    expect(resolveRoute('/reports/abc/edit').subKey).toBe('shell.crumbs.edit');
    expect(resolveRoute('/invoices/settings').subKey).toBe('shell.crumbs.settings');
    expect(resolveRoute('/invoices/abc').subKey).toBe('shell.crumbs.detail');
  });

  it('has no sub-page for a section root', () => {
    expect(resolveRoute('/pools').subKey).toBeUndefined();
  });

  it('does not treat a prefix-sharing path as a child', () => {
    // "/reportsx" must not light up Informes.
    expect(resolveRoute('/reportsx').item).toBeUndefined();
  });

  it('reports the owning group', () => {
    expect(resolveRoute('/siloe').group?.id).toBe('cumplimiento');
    expect(resolveRoute('/team').group?.id).toBe('gestion');
  });
});

describe('visibleGroups', () => {
  const tos = (type?: string) => visibleGroups(type).flatMap((g) => g.items.map((i) => i.to));

  it('hides Clientes for owner orgs, as the previous nav did', () => {
    expect(tos('owner')).not.toContain('/clients');
    expect(tos('company')).toContain('/clients');
  });

  it('shows every other page to both org types', () => {
    for (const t of ['owner', 'company']) {
      expect(tos(t)).toEqual(
        expect.arrayContaining([
          '/',
          '/routes',
          '/pools',
          '/reports',
          '/siloe',
          '/invoices',
          '/team',
        ]),
      );
    }
  });
});

describe('utility pages', () => {
  it('resolves Ajustes and Ayuda without putting them in a group', () => {
    expect(resolveRoute('/settings').item?.labelKey).toBe('shell.settings');
    expect(resolveRoute('/settings').group).toBeUndefined();
    expect(resolveRoute('/ayuda').item?.labelKey).toBe('shell.help');
  });
});
