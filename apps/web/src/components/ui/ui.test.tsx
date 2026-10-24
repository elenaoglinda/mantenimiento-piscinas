import { useState, type ComponentProps } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n.js';
import { Button } from './Button.js';
import { DataTable, type Column } from './DataTable.js';
import { Field, Input } from './Input.js';
import { Modal } from './Modal.js';
import { StatusChip } from './StatusChip.js';
import { Toaster } from './Toast.js';
import { toast } from './toast.js';
import { Combobox } from './Combobox.js';
import { foldFilter, initials, parseISODate, toISODate } from './utils.js';

describe('Button', () => {
  it('keeps the native submit default inside forms', () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Guardar</Button>
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('disables itself while loading', () => {
    render(<Button loading>Guardar</Button>);
    const b = screen.getByRole('button', { name: 'Guardar' });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
  });

  it('renders a router link with button styles via asChild', () => {
    render(
      <MemoryRouter>
        <Button asChild>
          <a href="/pools">Piscinas</a>
        </Button>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Piscinas' });
    expect(link.className).toContain('bg-primary');
  });
});

describe('Field', () => {
  it('wires the label, hint and error to the control', () => {
    render(
      <Field label="NIF" error="El NIF no es válido.">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('NIF');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('El NIF no es válido.');
  });
});

interface Row {
  id: string;
  name: string;
  n: number | null;
}
const cols: Column<Row>[] = [
  { id: 'name', header: 'Nombre', cell: (r) => r.name, sortValue: (r) => r.name },
  { id: 'n', header: 'Visitas', cell: (r) => r.n ?? '—', sortValue: (r) => r.n, align: 'right' },
];
const rows: Row[] = [
  { id: '1', name: 'Ébano', n: 2 },
  { id: '2', name: 'abeto', n: null },
  { id: '3', name: 'Cedro', n: 10 },
];

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderTable(props: Partial<ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <DataTable
                caption="Árboles"
                columns={cols}
                rows={rows}
                getRowId={(r) => r.id}
                {...props}
              />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const firstCells = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0].textContent);

describe('DataTable', () => {
  it('sorts in Spanish order, then descending, then back to the original order', () => {
    renderTable();
    const sortBy = screen.getByRole('button', { name: /Nombre/ });
    fireEvent.click(sortBy);
    expect(firstCells()).toEqual(['abeto', 'Cedro', 'Ébano']);
    expect(screen.getByRole('columnheader', { name: /Nombre/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    fireEvent.click(sortBy);
    expect(firstCells()).toEqual(['Ébano', 'Cedro', 'abeto']);
    fireEvent.click(sortBy);
    expect(firstCells()).toEqual(['Ébano', 'abeto', 'Cedro']);
  });

  it('keeps blanks last when sorting numbers', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /Visitas/ }));
    expect(firstCells()).toEqual(['Ébano', 'Cedro', 'abeto']);
  });

  it('shows the empty state, and skeleton rows while loading', () => {
    const { unmount } = renderTable({ rows: [], empty: <p>Sin árboles</p> });
    expect(screen.getByText('Sin árboles')).toBeInTheDocument();
    unmount();
    renderTable({ loading: true });
    expect(screen.queryByText('Cedro')).toBeNull();
  });

  it('links the first cell and follows the row on click', () => {
    renderTable({ rowHref: (r) => `/trees/${r.id}` });
    expect(screen.getByRole('link', { name: 'Cedro' })).toHaveAttribute('href', '/trees/3');
    fireEvent.click(screen.getByText('10'));
    expect(screen.getByTestId('where')).toHaveTextContent('/trees/3');
  });
});

describe('Modal', () => {
  it('is a named dialog that closes on Esc', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Nueva piscina">
        <input aria-label="Nombre" />
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Nueva piscina' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('StatusChip', () => {
  it('says the status in words, not only colour', () => {
    render(<StatusChip status="red" />);
    expect(screen.getByText('Fuera de rango')).toBeInTheDocument();
  });
});

describe('toast', () => {
  it('shows a toast raised from anywhere', () => {
    render(<Toaster />);
    act(() => toast('Piscina creada'));
    expect(screen.getByText('Piscina creada')).toBeInTheDocument();
  });
});

describe('Combobox', () => {
  it('finds an option by its detail line, accent-insensitively, and submits the value', () => {
    function Harness() {
      const [v, setV] = useState('');
      return (
        <form aria-label="f">
          <Combobox
            label="Piscina"
            name="pool"
            value={v}
            onValueChange={setV}
            options={[
              { value: 'p1', label: 'Villa Mar', detail: 'Comunidad Villa Mar' },
              { value: 'p2', label: 'Spa', detail: 'Hotel Las Palmeras' },
            ]}
            placeholder="Selecciona"
            searchPlaceholder="Buscar"
            emptyText="Nada"
          />
        </form>
      );
    }
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Piscina' }));
    fireEvent.change(screen.getByPlaceholderText('Buscar'), { target: { value: 'palmeras' } });
    fireEvent.click(screen.getByRole('option', { name: /Spa/ }));
    expect(container.querySelector('input[name="pool"]')).toHaveValue('p2');
  });
});

describe('helpers', () => {
  it('foldFilter ignores accents and case', () => {
    expect(foldFilter('SILOÉ', 'siloe')).toBe(1);
    expect(foldFilter('Facturación', 'xyz')).toBe(0);
    expect(foldFilter('p1', 'mar', ['Villa Mar'])).toBe(1);
  });

  it('initials', () => {
    expect(initials('Elena Oglinda')).toBe('EO');
    expect(initials('  ')).toBe('·');
  });

  it('round-trips ISO dates without a timezone shift', () => {
    const d = parseISODate('2026-01-01');
    expect(d?.getDate()).toBe(1);
    expect(toISODate(d!)).toBe('2026-01-01');
    expect(parseISODate('nope')).toBeUndefined();
  });
});
