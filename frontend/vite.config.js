import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Read the repo-root .env (shared with the backend) for the API port.
  const env = loadEnv(mode, '..', '');
  const apiTarget = env.VITE_API_PROXY_TARGET || `http://localhost:${env.API_PORT || 4000}`;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      // The browser talks to /api on the dev server's own origin, which forwards to the
      // backend. Same origin means the HttpOnly SameSite=Strict session cookie just works.
      proxy: { '/api': { target: apiTarget, changeOrigin: false } },
    },
    preview: {
      port: 4173,
      proxy: { '/api': { target: apiTarget, changeOrigin: false } },
    },
    build: {
      // The react-vendor chunk (~160 kB gzipped) is the framework itself and cannot shrink
      // further; warn only if a chunk grows beyond it.
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          // React, React DOM, and React Router in their own chunk: they change far less often
          // than the app, so browsers keep them cached across releases. Pages and the charting
          // library are split per route (lazy imports in routes.jsx).
          manualChunks(id) {
            if (/node_modules[\/](react|react-dom|react-router|scheduler)[\/]/.test(id)) {
              return 'react-vendor';
            }
            return undefined;
          },
        },
      },
    },
    test: {
      // Node's fetch needs absolute URLs; MSW intercepts requests to this origin in tests.
      env: { VITE_API_URL: 'http://localhost/api' },
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      css: false,
      restoreMocks: true,
      // Every test renders the whole app; under a parallel run on a busy machine 5 s is tight.
      testTimeout: 15_000,
    },
  };
});
