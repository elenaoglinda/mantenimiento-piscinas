import { describe, expect, it } from 'vitest';
import {
  checklist,
  doneCount,
  entriesFromTaskRows,
  setTaskNote,
  taskRows,
  toggleTask,
  type TaskDef,
} from './tasks.js';

const defs: TaskDef[] = [
  { id: 't2', nombre: 'Contralavado del filtro', orden: 2, activo: true },
  { id: 't1', nombre: 'Barrido / limpieza de fondo', orden: 1, activo: true },
  { id: 't3', nombre: 'Retirada de hojas', orden: 3, activo: false },
];

describe('task checklist', () => {
  it('shows active tasks in order, unchecked', () => {
    expect(checklist(defs, [])).toEqual([
      { taskId: 't1', hecho: false, nota: '' },
      { taskId: 't2', hecho: false, nota: '' },
    ]);
  });
  it('keeps a deactivated task this visit already recorded', () => {
    const list = checklist(defs, [{ taskId: 't3', hecho: true, nota: '' }]);
    expect(list.map((e) => e.taskId)).toEqual(['t1', 't2', 't3']);
    expect(list[2].hecho).toBe(true);
  });
  it('toggles, notes, and saves only what was done or noted', () => {
    let list = checklist(defs, []);
    list = toggleTask(list, 't1');
    list = setTaskNote(list, 't2', '  presión alta ');
    expect(doneCount(list)).toBe(1);
    expect(taskRows(list)).toEqual([
      { task_id: 't1', hecho: true, nota: null },
      { task_id: 't2', hecho: false, nota: 'presión alta' },
    ]);
    expect(taskRows(toggleTask(list, 't1'))).toHaveLength(1);
  });
  it('an untouched checklist saves nothing', () => {
    expect(taskRows(checklist(defs, []))).toEqual([]);
  });
  it('round-trips saved rows', () => {
    expect(entriesFromTaskRows([{ task_id: 't1', hecho: true, nota: null }])).toEqual([
      { taskId: 't1', hecho: true, nota: '' },
    ]);
  });
});
