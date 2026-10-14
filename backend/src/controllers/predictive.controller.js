export function createPredictiveController({ predictiveService: s }) {
  return {
    async segments(_req, res) {
      res.json(await s.segments());
    },

    async segmentCustomers(req, res) {
      res.json(await s.segmentCustomers(req.validated.params.segment, req.validated.query));
    },

    async cohorts(req, res) {
      res.json(await s.cohorts(req.validated.query));
    },

    async forecast(_req, res) {
      res.json(await s.forecast());
    },
  };
}
