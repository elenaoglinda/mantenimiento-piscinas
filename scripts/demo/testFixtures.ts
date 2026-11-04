/** Inputs shared by the demo tests (not a test file itself). */
import { demoId, type DemoInput, type DemoParamDef } from './generate.js';

// National RD 742/2013 rows as seeded by the migrations (ids are arbitrary here).
export const TEST_PARAMS: DemoParamDef[] = [
  { id: 'pd-1', key: 1, minOk: 7.2, maxOk: 8, closureMin: 6, closureMax: 9 },
  { id: 'pd-3', key: 3, minOk: 24, maxOk: 30, closureMax: 40 },
  { id: 'pd-6', key: 6, minOk: null, maxOk: 5 },
  { id: 'pd-7', key: 7, minOk: null, maxOk: 75 },
  { id: 'pd-9', key: 9, minOk: null, maxOk: 0.6 },
  { id: 'pd-10', key: 10, minOk: 0.5, maxOk: 2 },
  { id: 'pd-101', key: 101, minOk: 80, maxOk: 120 },
  { id: 'pd-102', key: 102, minOk: 200, maxOk: 400 },
  { id: 'pd-103', key: 103, minOk: 3, maxOk: 5 },
  { id: 'pd-104', key: 104, minOk: null, maxOk: 0.1 },
];

export function testInput(today = '2026-11-03'): DemoInput {
  return {
    today,
    admin: { id: demoId('test-admin'), email: 'demo@example.com', fullName: 'Administración demo' },
    technicians: [
      { id: demoId('test-tech-1'), email: 't1@example.com', fullName: 'Lucía Ferrer' },
      { id: demoId('test-tech-2'), email: 't2@example.com', fullName: 'Javier Martí' },
    ],
    params: TEST_PARAMS,
  };
}
