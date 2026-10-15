import { timingSafeEqual } from 'node:crypto';
import { unauthorized } from '../utils/http-error.js';

function sameToken(given, expected) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * GET /api/metrics (Prometheus text format). With METRICS_TOKEN set, scrapers must send
 * `Authorization: Bearer <token>`. The web container does not expose this path; Prometheus
 * scrapes the API directly on the Compose network.
 */
export function createMetricsController({ metrics, token }) {
  return {
    async scrape(req, res) {
      if (token) {
        const header = req.get('authorization') ?? '';
        const given = header.startsWith('Bearer ') ? header.slice(7) : '';
        if (!sameToken(given, token)) throw unauthorized('A valid metrics token is required');
      }
      res.set('Content-Type', metrics.registry.contentType);
      res.send(await metrics.registry.metrics());
    },
  };
}
