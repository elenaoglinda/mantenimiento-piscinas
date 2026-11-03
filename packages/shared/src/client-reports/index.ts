/**
 * Client reports: the visit PDF and the monthly summary a pool company sends its own client.
 * Imported by api/report-pdf.ts by relative path (see scripts/check-api.cjs), NOT through the
 * package barrel: it pulls in pdf-lib, which must never reach the browser bundle. The
 * browser-safe part (share links, months) is `share.ts`, which the barrel does export.
 */
export * from './text.js';
export * from './format.js';
export * from './palette.js';
export * from './layout.js';
export * from './header.js';
export * from './chart.js';
export * from './visit.js';
export * from './monthly.js';
export * from './labels.js';
export * from './render.js';
export * from './share.js';
