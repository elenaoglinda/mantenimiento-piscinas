import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../../i18n.js';
import { DbFailureAlert } from './DbFailureAlert.js';

describe('DbFailureAlert', () => {
  it('renders nothing when there is no failure', () => {
    const { container } = render(<DbFailureAlert failure={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the missing migration instead of a generic error', () => {
    render(<DbFailureAlert failure={{ code: 'missing_schema' }} />);
    expect(screen.getByText(/20260925120000_invoicing\.sql/)).toBeInTheDocument();
  });

  it('shows the database message for a rule violation', () => {
    render(
      <DbFailureAlert failure={{ code: 'rule', detail: 'Una factura emitida es inmutable.' }} />,
    );
    expect(screen.getByText('Una factura emitida es inmutable.')).toBeInTheDocument();
  });
});
