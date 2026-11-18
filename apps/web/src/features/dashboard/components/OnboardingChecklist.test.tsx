import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n.js';
import { OnboardingChecklist } from './OnboardingChecklist.js';
import { buildChecklist } from '../../../lib/dashboard.js';

describe('OnboardingChecklist', () => {
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

  it('shows progress and the next step, and expands to every step', () => {
    render(
      <MemoryRouter>
        <OnboardingChecklist checklist={checklist} onDismiss={vi.fn()} />
      </MemoryRouter>,
    );

    // 1 of 5 primary steps done (client); the next one is the pool.
    expect(screen.getByText('1/5')).toBeInTheDocument();
    expect(screen.getByText('Añade tu primera piscina')).toBeInTheDocument();
    expect(screen.queryByText('Configuración opcional')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Ver todos los pasos/ }));
    expect(screen.getByText('Configuración opcional')).toBeInTheDocument();
    expect(screen.getByText('Crea tu primer informe')).toBeInTheDocument();
  });

  it('can be dismissed', () => {
    const onDismiss = vi.fn();
    render(
      <MemoryRouter>
        <OnboardingChecklist checklist={checklist} onDismiss={onDismiss} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Omitir' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
