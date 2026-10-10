export function createHealthController({ db }) {
  return {
    // Liveness: the process is up and serving requests.
    live(_req, res) {
      res.json({ status: 'ok' });
    },

    // Readiness: the API can reach its database. Returns 503 when it cannot.
    async ready(_req, res) {
      const checks = { database: 'up' };
      try {
        await db.query('SELECT 1');
      } catch {
        checks.database = 'down';
      }
      const healthy = Object.values(checks).every((s) => s === 'up');
      res.status(healthy ? 200 : 503).json({
        status: healthy ? 'ok' : 'degraded',
        uptimeSeconds: Math.round(process.uptime()),
        checks,
      });
    },
  };
}
