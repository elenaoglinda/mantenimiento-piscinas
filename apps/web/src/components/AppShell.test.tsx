import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import '../i18n.js';
import { AppShell } from './AppShell.js';
import { AuthContext, type AuthContextValue } from '../auth/context.js';
import type { Tables } from '../lib/database.types.js';

function renderShell() {
  const value: AuthContextValue = {
    session: null,
    loading: false,
    reloadProfile: vi.fn(),
    signOut: vi.fn(),
    profile: {
      user: { id: 'u1', role: 'admin', full_name: 'Ana', org_id: 'o1' } as Tables<'app_user'>,
      org: { id: 'o1', name: 'Piscinas SL', type: 'owner' } as Tables<'org'>,
    },
  };
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div>home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('AppShell mobile menu', () => {
  it('toggles the mobile navigation panel via the menu button', () => {
    renderShell();

    const toggle = screen.getByRole('button', { name: 'Menú' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('mobile-nav')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('mobile-nav')).not.toBeNull();
  });
});
