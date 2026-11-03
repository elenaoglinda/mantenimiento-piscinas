import { describe, expect, it } from 'vitest';
import { repeatVisit, type LastVisit } from './repeat.js';

const last: LastVisit = {
  visitedAt: '2026-10-30T10:00:00Z',
  technicianId: 'u2',
  chemicals: [
    { product_id: 'p1', cantidad: 0.5, unidad: 'kg' },
    { product_id: 'p2', cantidad: 2, unidad: 'L' },
  ],
  tasks: [
    { task_id: 't1', hecho: true, nota: 'Mucha hoja' },
    { task_id: 't2', hecho: false, nota: 'No dio tiempo' },
    { task_id: 't3', hecho: true, nota: null },
  ],
};

describe('Repetir última visita', () => {
  it('copies technician, products with their amounts and done tasks without notes', () => {
    const r = repeatVisit(
      last,
      [
        { id: 'p1', nombre: 'Cloro', unidad: 'kg', cantidadHabitual: 1, activo: true },
        { id: 'p2', nombre: 'Floculante', unidad: 'L', cantidadHabitual: null, activo: true },
      ],
      [
        { id: 't1', nombre: 'Barrido', orden: 1, activo: true },
        { id: 't2', nombre: 'Contralavado', orden: 2, activo: true },
        { id: 't3', nombre: 'Hojas', orden: 3, activo: true },
      ],
    );
    expect(r.technicianId).toBe('u2');
    expect(r.chemicals).toEqual([
      { productId: 'p1', cantidad: '0,5', unidad: 'kg' },
      { productId: 'p2', cantidad: '2', unidad: 'L' },
    ]);
    expect(r.tasks).toEqual([
      { taskId: 't1', hecho: true, nota: '' },
      { taskId: 't3', hecho: true, nota: '' },
    ]);
    expect(r.skipped).toBe(0);
  });

  it('leaves out products and tasks deactivated since, and counts them', () => {
    const r = repeatVisit(
      last,
      [{ id: 'p1', nombre: 'Cloro', unidad: 'kg', cantidadHabitual: 1, activo: false }],
      [{ id: 't1', nombre: 'Barrido', orden: 1, activo: true }],
    );
    expect(r.chemicals).toEqual([]);
    expect(r.tasks.map((t) => t.taskId)).toEqual(['t1']);
    expect(r.skipped).toBe(3); // p1 inactive, p2 gone, t3 gone
  });

  it('never has readings to copy', () => {
    expect(Object.keys(repeatVisit(last, [], []))).not.toContain('readings');
  });
});
