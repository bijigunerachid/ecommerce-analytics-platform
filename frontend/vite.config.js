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
      // The entry chunk is React DOM + React Router (~170 kB gzipped); the charting library
      // is split into the lazily loaded dashboard chunk. Warn only above that baseline.
      chunkSizeWarningLimit: 600,
    },
    test: {
      // Node's fetch needs absolute URLs; MSW intercepts requests to this origin in tests.
      env: { VITE_API_URL: 'http://localhost/api' },
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      css: false,
      restoreMocks: true,
    },
  };
});
