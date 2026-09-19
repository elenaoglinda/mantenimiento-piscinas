import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import '../i18n.js';
import { ImportReportPage } from './ImportReportPage.js';
import { AuthContext, type AuthContextValue } from '../auth/context.js';
import type { Tables } from '../lib/database.types.js';

function renderPage(role: Tables<'app_user'>['role']) {
  const value: AuthContextValue = {
    session: null,
    loading: false,
    reloadProfile: vi.fn(),
    signOut: vi.fn(),
    profile: {
      user: { id: 'u1', role, full_name: 'Ana', org_id: 'o1' } as Tables<'app_user'>,
      org: { id: 'o1', name: 'Piscinas SL', type: 'company' } as Tables<'org'>,
    },
  };
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter>
        <ImportReportPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('ImportReportPage', () => {
  it('renders the upload step with real i18n keys', () => {
    renderPage('technician');
    expect(
      screen.getByRole('heading', { name: 'Importar parte desde una foto' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Elegir foto' })).toBeInTheDocument();
    // The review UI only appears after a successful extraction.
    expect(screen.queryByText('Guardar como borrador')).not.toBeInTheDocument();
  });

  it('blocks viewers, who may not create reports', () => {
    renderPage('viewer');
    expect(screen.getByText('Tu rol es de solo lectura y no puede importar partes.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Elegir foto' })).not.toBeInTheDocument();
  });
});
