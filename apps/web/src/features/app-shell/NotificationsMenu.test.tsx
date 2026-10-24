import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n.js';
import { AuthContext, type AuthContextValue } from '../../auth/context.js';
import type { Tables } from '../../lib/database.types.js';
import { NotificationsMenu } from './NotificationsMenu.js';
import { Sidebar } from './Sidebar.js';
import { ShellDataContext, type ShellData } from './shellData.js';

const data: ShellData = {
  draftReports: 2,
  invoiceAttention: 1,
  alerts: [
    {
      id: 'reading-r1',
      kind: 'reading',
      title: 'Villa Mar · Vaso principal',
      detail: 'Lecturas fuera de rango · 22/10/2026',
      to: '/reports/r1',
    },
    {
      id: 'invoice-i1',
      kind: 'invoice',
      title: '2026/0007 · Hotel Las Palmeras',
      detail: 'Rechazada por la AEAT',
      to: '/invoices/i1',
    },
  ],
};

const auth: AuthContextValue = {
  session: null,
  loading: false,
  reloadProfile: vi.fn(),
  signOut: vi.fn(),
  profile: {
    user: { id: 'u1', role: 'admin', full_name: 'Ana López', org_id: 'o1' } as Tables<'app_user'>,
    org: { id: 'o1', name: 'Piscinas SL', type: 'company' } as Tables<'org'>,
  },
};

function renderWith(ui: React.ReactNode, value: ShellData = data) {
  return render(
    <AuthContext.Provider value={auth}>
      <ShellDataContext.Provider value={value}>
        <MemoryRouter>{ui}</MemoryRouter>
      </ShellDataContext.Provider>
    </AuthContext.Provider>,
  );
}

describe('NotificationsMenu', () => {
  it('announces how many alerts there are and lists them as links', () => {
    renderWith(<NotificationsMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Avisos: 2 pendientes' }));
    expect(screen.getByRole('link', { name: /Villa Mar · Vaso principal/ })).toHaveAttribute(
      'href',
      '/reports/r1',
    );
    expect(screen.getByRole('link', { name: /Rechazada por la AEAT/ })).toHaveAttribute(
      'href',
      '/invoices/i1',
    );
  });

  it('says everything is in order when there is nothing', () => {
    renderWith(<NotificationsMenu />, { ...data, alerts: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Avisos' }));
    expect(screen.getByText('Todo en orden')).toBeInTheDocument();
  });
});

describe('Sidebar counts', () => {
  it('puts the count in the link name so it is announced', () => {
    renderWith(<Sidebar variant="rail" />);
    expect(screen.getByRole('link', { name: /^Informes\s*, 2 borradores$/ })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /^Facturación\s*, 1 requiere atención$/ }),
    ).toBeInTheDocument();
  });

  it('opens the organisation settings from the company row', () => {
    renderWith(<Sidebar variant="rail" />);
    expect(screen.getByRole('link', { name: /Piscinas SL/ })).toHaveAttribute('href', '/settings');
  });
});
