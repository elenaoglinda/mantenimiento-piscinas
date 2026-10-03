import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../../../i18n.js';
import { FiscalStateBadge, PaymentBadge } from './FiscalStateBadge.js';

const base = { status: 'issued' as const, send_status: 'accepted' as const, aeat_estado: null };

describe('FiscalStateBadge', () => {
  it('shows a draft as a draft', () => {
    render(<FiscalStateBadge invoice={{ ...base, status: 'draft', send_status: 'not_sent' }} />);
    expect(screen.getByText('Borrador')).toBeInTheDocument();
  });

  it('separates Correcta from Aceptada con errores', () => {
    const { rerender } = render(
      <FiscalStateBadge invoice={{ ...base, aeat_estado: 'Correcta' }} />,
    );
    expect(screen.getByText('Enviada a AEAT')).toBeInTheDocument();
    rerender(<FiscalStateBadge invoice={{ ...base, aeat_estado: 'AceptadaConErrores' }} />);
    expect(screen.getByText('Aceptada con errores')).toBeInTheDocument();
  });

  it('shows Anulada for a void invoice', () => {
    render(<FiscalStateBadge invoice={{ ...base, status: 'void' }} />);
    expect(screen.getByText('Anulada')).toBeInTheDocument();
  });

  it('shows Rectificada when a rectificativa points at it', () => {
    render(<FiscalStateBadge invoice={{ ...base, rectified: true }} />);
    expect(screen.getByText('Rectificada')).toBeInTheDocument();
  });
});

describe('PaymentBadge', () => {
  it('renders nothing for a draft — payment is meaningless before issue', () => {
    const { container } = render(
      <PaymentBadge paymentStatus="pending" dueDate={null} status="draft" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows Vencida only when unpaid and past due', () => {
    render(<PaymentBadge paymentStatus="pending" dueDate="2020-01-01" status="issued" />);
    expect(screen.getByText('Vencida')).toBeInTheDocument();
  });

  it('never shows Vencida once paid', () => {
    render(<PaymentBadge paymentStatus="paid" dueDate="2020-01-01" status="issued" />);
    expect(screen.getByText('Pagada')).toBeInTheDocument();
  });
});
