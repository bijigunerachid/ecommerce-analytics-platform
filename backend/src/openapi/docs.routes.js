import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import express, { Router } from 'express';
import { buildOpenApiDocument } from './spec.js';

const require = createRequire(import.meta.url);
const SWAGGER_UI_DIR = dirname(require.resolve('swagger-ui-dist/package.json'));

// Swagger UI's own start-up script, pointed at our document. Served as a file (not inline) so
// the Content-Security-Policy can keep forbidding inline scripts.
const INITIALIZER = `window.onload = function () {
  window.ui = SwaggerUIBundle({
    url: '../openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    withCredentials: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: 'StandaloneLayout',
  });
};
`;

/**
 * GET /api/openapi.json and the Swagger UI at /api/docs/ (signed-in users: the session cookie
 * is sent with "Try it out" requests, so the documented endpoints can be called directly).
 */
export function createDocsRouter({ requireAuth }) {
  const router = Router();
  const document = buildOpenApiDocument();

  router.get('/openapi.json', requireAuth, (_req, res) => res.json(document));
  router.get('/docs/swagger-initializer.js', requireAuth, (_req, res) => {
    res.type('application/javascript').send(INITIALIZER);
  });
  router.use(
    '/docs',
    requireAuth,
    express.static(SWAGGER_UI_DIR, { index: 'index.html', maxAge: '1h' }),
  );
  return router;
}

// Sanity check at start-up: the bundle must be where we expect it.
readFileSync(join(SWAGGER_UI_DIR, 'swagger-ui-bundle.js'));
