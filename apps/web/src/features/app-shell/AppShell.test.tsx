import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../i18n.js';
import { AppShell } from './AppShell.js';
import { useRecordCrumb } from './recordCrumb.js';
import { AuthContext, type AuthContextValue } from '../../auth/context.js';
import type { Tables } from '../../lib/database.types.js';

function Where() {
  const { pathname } = useLocation();
  // Stands in for a detail page that names its record once loaded.
  useRecordCrumb(pathname === '/pools/p1' ? 'Villa Mar' : null);
  return <div data-testid="where">{pathname}</div>;
}

function renderShell({
  path = '/',
  orgType = 'company',
  role = 'admin',
  signOut = vi.fn(),
}: { path?: string; orgType?: string; role?: string; signOut?: () => Promise<void> } = {}) {
  const value: AuthContextValue = {
    session: null,
    loading: false,
    reloadProfile: vi.fn(),
    signOut,
    profile: {
      user: { id: 'u1', role, full_name: 'Ana López', org_id: 'o1' } as Tables<'app_user'>,
      org: { id: 'o1', name: 'Piscinas SL', type: orgType } as Tables<'org'>,
    },
  };
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="*" element={<Where />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

/** The desktop rail is the first navigation landmark; the drawer adds a second only when open. */
const rail = () => screen.getAllByRole('navigation', { name: 'Navegación principal' })[0];

afterEach(() => window.localStorage.clear());

describe('AppShell sidebar', () => {
  it('groups the pages under Operación, Cumplimiento and Gestión', () => {
    renderShell();
    const nav = rail();
    for (const label of ['Operación', 'Cumplimiento', 'Gestión']) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
    for (const label of [
      'Inicio',
      'Rutas',
      'Piscinas',
      'Informes',
      'Clientes',
      'SILOÉ',
      'Facturación',
      'Equipo',
    ]) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('keeps the owner-org rule: no Clientes', () => {
    renderShell({ orgType: 'owner' });
    expect(within(rail()).queryByRole('link', { name: 'Clientes' })).toBeNull();
  });

  it('marks the parent item active on a nested route', () => {
    renderShell({ path: '/pools/abc' });
    expect(within(rail()).getByRole('link', { name: 'Piscinas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(rail()).getByRole('link', { name: 'Inicio' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('remembers the collapsed state across a remount', () => {
    const first = renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Contraer menú' }));
    expect(screen.getByRole('button', { name: 'Expandir menú' })).toBeInTheDocument();
    first.unmount();

    renderShell();
    expect(screen.getByRole('button', { name: 'Expandir menú' })).toBeInTheDocument();
  });

  it('still works when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderShell();
    expect(screen.getByRole('button', { name: 'Contraer menú' })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('moves Cerrar sesión into the user menu', () => {
    const signOut = vi.fn(() => Promise.resolve());
    renderShell({ signOut });
    fireEvent.click(
      within(rail().closest('aside')!).getByRole('button', { name: 'Menú de usuario' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
    expect(signOut).toHaveBeenCalled();
  });
});

describe('AppShell mobile drawer', () => {
  it('opens from the menu button and closes with Esc', () => {
    renderShell();
    const toggle = screen.getByRole('button', { name: 'Menú' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('mobile-drawer')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('mobile-drawer')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.getElementById('mobile-drawer')).toBeNull();
  });

  it('closes when a link is followed', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Menú' }));
    const drawer = document.getElementById('mobile-drawer')!;
    fireEvent.click(within(drawer).getByRole('link', { name: 'Equipo' }));
    expect(document.getElementById('mobile-drawer')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent('/team');
  });
});

describe('AppShell top bar', () => {
  it('sets the document title from the route', () => {
    renderShell({ path: '/reports/new' });
    expect(document.title).toBe('Cloro · Nuevo informe');
  });

  it('builds the breadcrumb from group, page and sub-page', () => {
    renderShell({ path: '/reports/abc/edit' });
    const crumbs = screen.getByRole('navigation', { name: 'Ruta de navegación' });
    expect(within(crumbs).getByText('Operación')).toBeInTheDocument();
    expect(within(crumbs).getByRole('link', { name: 'Informes' })).toHaveAttribute(
      'href',
      '/reports',
    );
    expect(within(crumbs).getByText('Editar')).toHaveAttribute('aria-current', 'page');
  });

  it('offers Nuevo informe to writers but not to viewers', () => {
    const { unmount } = renderShell();
    expect(screen.getByRole('link', { name: 'Nuevo informe' })).toHaveAttribute(
      'href',
      '/reports/new',
    );
    unmount();
    renderShell({ role: 'viewer' });
    expect(screen.queryByRole('link', { name: 'Nuevo informe' })).toBeNull();
  });
});

describe('AppShell record names', () => {
  it('shows the record a detail page names, in the breadcrumb and the tab title', () => {
    renderShell({ path: '/pools/p1' });
    const crumbs = screen.getByRole('navigation', { name: 'Ruta de navegación' });
    expect(within(crumbs).getByText('Villa Mar')).toHaveAttribute('aria-current', 'page');
    expect(within(crumbs).getByRole('link', { name: 'Piscinas' })).toHaveAttribute(
      'href',
      '/pools',
    );
    expect(document.title).toBe('Cloro · Villa Mar');
  });

  it('falls back to "Detalle" while the record is unnamed', () => {
    renderShell({ path: '/pools/p2' });
    const crumbs = screen.getByRole('navigation', { name: 'Ruta de navegación' });
    expect(within(crumbs).getByText('Detalle')).toBeInTheDocument();
  });
});

describe('AppShell command palette', () => {
  it('opens with ⌘K, filters accent-insensitively, and navigates on Enter', () => {
    renderShell();
    act(() => {
      fireEvent.keyDown(document, { key: 'k', metaKey: true });
    });
    const input = screen.getByRole('combobox', { name: 'Ir a una página' });
    fireEvent.change(input, { target: { value: 'facturacion' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('where')).toHaveTextContent('/invoices');
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('says plainly that record search is not there yet', () => {
    renderShell();
    act(() => {
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    });
    expect(screen.getByText(/próximamente/i)).toBeInTheDocument();
  });
});
