import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Health check for the serverless API layer. Confirms /api functions deploy and run.
 * Real functions (XML build/validation, geocoding/routing proxy, PDF) land in later phases.
 */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ status: 'ok', service: 'piscinas-api', time: new Date().toISOString() });
}
