export function createInsightsController({ insightsService }) {
  return {
    async customer(req, res) {
      res.json({ insights: await insightsService.customer(req.validated.params.id) });
    },

    async product(req, res) {
      res.json({
        insights: await insightsService.product(req.validated.params.id, req.validated.query),
      });
    },
  };
}
