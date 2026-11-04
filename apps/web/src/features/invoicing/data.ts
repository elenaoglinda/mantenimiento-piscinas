/**
 * Public data helpers of the invoicing feature, for code outside it that needs invoicing data
 * without its pages (the app shell's alerts). Kept apart from index.ts so importing these
 * doesn't pull the invoicing pages into the main bundle — they are lazy-loaded by the router.
 */
export { needingAttention } from './lib/data.js';
