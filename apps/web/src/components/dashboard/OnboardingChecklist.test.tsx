import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n.js';
import { OnboardingChecklist } from './OnboardingChecklist.js';
import { buildChecklist } from '../../lib/dashboard.js';

describe('OnboardingChecklist', () => {
  it('renders the progress counter, step titles and skip control with real i18n keys', () => {
    const checklist = buildChecklist({
      isCompany: true,
      clientCount: 1,
      poolCount: 0,
      basinCount: 0,
      reportCount: 0,
      exportCount: 0,
      routeCount: 0,
      memberCount: 1,
    });
    const onDismiss = vi.fn();
    render(
      <MemoryRouter>
        <OnboardingChecklist checklist={checklist} onDismiss={onDismiss} />
      </MemoryRouter>,
    );

    // 1 of 5 primary steps done (client).
    expect(screen.getByText('1/5')).toBeInTheDocument();
    expect(screen.getByText('Añade tu primera piscina')).toBeInTheDocument();
    expect(screen.getByText('Configuración opcional')).toBeInTheDocument();
    expect(screen.getByText('Omitir')).toBeInTheDocument();
  });
});
