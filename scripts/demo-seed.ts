/**
 * Demo data: one org, "Piscinas Mediterráneo (demo)", with 90 days of realistic history, so no
 * sales demo starts empty. See scripts/demo/README.md.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key> \
 *     npx tsx scripts/demo-seed.ts --admin-email demo@example.com [--reset]
 *
 * The service-role key comes from the environment only: never pass it as an argument, never
 * commit it. The script refuses to touch any org whose name doesn't end in "(demo)".
 */
import { createClient } from '@supabase/supabase-js';
import { RefusedError, runSeed } from './demo/run.js';
import { supabaseStore } from './demo/supabaseStore.js';

function usage(message?: string): never {
  if (message) console.error(`\n${message}\n`);
  console.error(
    'Uso: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/demo-seed.ts --admin-email <correo> [--reset]',
  );
  process.exit(1);
}

function madridToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--admin-email');
  const adminEmail =
    i >= 0 ? args[i + 1] : args.find((a) => a.startsWith('--admin-email='))?.split('=')[1];
  if (!adminEmail || adminEmail.startsWith('--')) usage('Falta --admin-email.');
  const unknown = args.filter(
    (a, n) =>
      a.startsWith('--') && !['--admin-email', '--reset'].includes(a.split('=')[0]!) && n !== i + 1,
  );
  if (unknown.length) usage(`Opción desconocida: ${unknown.join(' ')}`);
  const reset = args.includes('--reset');

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) usage('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.');

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  console.log(
    `Demo en ${new URL(url).host} · administrador ${adminEmail}${reset ? ' · --reset' : ''}`,
  );
  try {
    const result = await runSeed(supabaseStore(sb), {
      adminEmail,
      reset,
      today: madridToday(),
      log: (l) => console.log(l),
    });
    if (result.action !== 'exists') {
      console.log(
        `Hecho (${result.action === 'created' ? 'creada' : result.action === 'reset' ? 'regenerada' : 'reparada'}): ` +
          `${result.counts.client} clientes, ${result.counts.pool} piscinas, ${result.counts.basin} vasos, ` +
          `${result.counts.report} visitas, ${result.counts.invoice} facturas en borrador.`,
      );
    }
    console.log(
      `Entra en la app con ${adminEmail} (enlace mágico, o «¿Has olvidado tu contraseña?» para poner una).`,
    );
  } catch (err) {
    if (err instanceof RefusedError) {
      console.error(`\nNo se ha hecho nada: ${err.message}\n`);
      process.exit(2);
    }
    console.error('\nError:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

void main();
