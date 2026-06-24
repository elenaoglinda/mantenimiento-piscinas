import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import './i18n.js';
import { App } from './App.js';

describe('App', () => {
  it('renders the Phase 0 heading and status chips', () => {
    render(<App />);
    expect(screen.getByText('Base del proyecto lista')).toBeInTheDocument();
    // pH 6.8 is below the legal range -> "Fuera de rango"
    expect(screen.getAllByText('Fuera de rango').length).toBeGreaterThan(0);
    // pH 7.6 is comfortably inside -> "Correcto"
    expect(screen.getAllByText('Correcto').length).toBeGreaterThan(0);
  });
});
