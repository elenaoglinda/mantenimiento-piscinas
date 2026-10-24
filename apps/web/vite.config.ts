import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Vercel sets VERCEL_ENV (production | preview | development) at build time. Exposed so the
    // internal /design page can exist on previews but never in production.
    'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(process.env.VERCEL_ENV ?? ''),
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Libraries change rarely and every screen needs them: separate chunks download in
        // parallel and stay cached across deploys, while app code (pages are lazy-loaded in
        // App.tsx) changes. Keeps every chunk under Vite's 500 kB warning.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id))
            return 'react';
          if (id.includes('node_modules/@supabase/')) return 'supabase';
          if (
            /node_modules\/(@radix-ui|@floating-ui|cmdk|tailwind-merge|clsx|class-variance-authority)\//.test(
              id,
            )
          )
            return 'ui';
          if (/node_modules\/(i18next|react-i18next)\//.test(id)) return 'i18n';
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    env: {
      // Placeholders so the Supabase client constructs during tests (no network calls made).
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
});
