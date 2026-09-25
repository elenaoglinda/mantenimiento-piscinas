import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../../i18n.js';
import { SendStatusBadge } from './SendStatusBadge.js';

describe('SendStatusBadge', () => {
  it('shows a draft as a draft, ignoring any AEAT state', () => {
    render(<SendStatusBadge status="draft" sendStatus="not_sent" />);
    expect(screen.getByText('Borrador')).toBeInTheDocument();
  });

  it('reports the AEAT verdict once issued', () => {
    render(<SendStatusBadge status="issued" sendStatus="accepted" />);
    expect(screen.getByText('Aceptada')).toBeInTheDocument();
  });

  it('distinguishes in-flight from rejected', () => {
    const { rerender } = render(<SendStatusBadge status="issued" sendStatus="sending" />);
    expect(screen.getByText('Enviando a la AEAT')).toBeInTheDocument();
    rerender(<SendStatusBadge status="issued" sendStatus="rejected" />);
    expect(screen.getByText('Rechazada')).toBeInTheDocument();
  });
});
