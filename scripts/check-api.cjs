/**
 * Builds every /api function with Vercel's own Node builder (@vercel/node), the way a deploy
 * does, then loads each built handler in plain Node. Catches what typecheck and unit tests
 * can't: a function that compiles but crashes at load on Vercel (FUNCTION_INVOCATION_FAILED).
 *
 * That is not hypothetical: api/extract-reading.ts imported `@piscinas/shared`, whose package
 * entry points at TypeScript source. Vercel compiles that source to .js but Node still
 * resolved the .ts entry, so every call failed in production. Importing shared code by
 * relative path (../packages/shared/src/x.js) works; this check keeps it that way.
 *
 * Also reports each function's size against Vercel's 250 MB (unzipped) limit.
 * Handlers are only loaded, never called. api/verifacti.ts is skipped on purpose: nothing in
 * CI should touch the invoicing send path.
 *
 * Usage: node scripts/check-api.cjs
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { build } = require('@vercel/node');
const { glob } = require('@vercel/build-utils');

const ROOT = path.resolve(__dirname, '..');
const LIMIT_BYTES = 250 * 1024 * 1024;
const SKIP = new Set(['api/verifacti.ts']);

function writeLambda(files, out) {
  let bytes = 0;
  for (const [name, f] of Object.entries(files)) {
    const dest = path.join(out, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (f.type === 'FileBlob') {
      fs.writeFileSync(dest, f.data);
      bytes += Buffer.byteLength(f.data);
    } else if (f.type === 'FileFsRef') {
      const st = fs.lstatSync(f.fsPath);
      if (st.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(f.fsPath), dest);
      else if (st.isDirectory()) fs.mkdirSync(dest, { recursive: true });
      else {
        fs.copyFileSync(f.fsPath, dest);
        bytes += st.size;
      }
    } else {
      throw new Error(`Unexpected file type ${f.type} for ${name}`);
    }
  }
  return bytes;
}

(async () => {
  const files = await glob('**', { cwd: ROOT, ignore: ['node_modules/**', '.git/**'] });
  const entrypoints = fs
    .readdirSync(path.join(ROOT, 'api'))
    .filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
    .map((f) => `api/${f}`)
    .filter((f) => !SKIP.has(f));
  let failed = false;
  for (const entrypoint of entrypoints) {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'api-check-'));
    try {
      const { output } = await build({
        files,
        entrypoint,
        workPath: ROOT,
        repoRootPath: ROOT,
        config: {},
        meta: { skipDownload: true },
      });
      const bytes = writeLambda(output.files, out);
      const mod = await import(pathToFileURL(path.join(out, output.handler)).href);
      if (typeof mod.default !== 'function') throw new Error('no default export handler');
      const mb = (bytes / 1024 / 1024).toFixed(1);
      if (bytes > LIMIT_BYTES) throw new Error(`${mb} MB is over Vercel's 250 MB limit`);
      console.log(`ok   ${entrypoint} (${mb} MB, ${Object.keys(output.files).length} files)`);
    } catch (err) {
      failed = true;
      console.error(`FAIL ${entrypoint}: ${err && err.message ? err.message : err}`);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }
  process.exit(failed ? 1 : 0);
})();
