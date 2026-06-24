import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import './i18n.js';
import { App } from './App.js';

describe('App', () => {
  it('shows the login screen when unauthenticated', async () => {
    render(<App />);
    // AuthProvider resolves "no session" then PublicOnly renders the login route.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
  });
});
