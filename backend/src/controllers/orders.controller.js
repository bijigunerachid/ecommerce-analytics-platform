export function createOrdersController({ ordersService }) {
  return {
    async list(req, res) {
      res.json(await ordersService.list(req.validated.query));
    },

    async get(req, res) {
      res.json({ order: await ordersService.get(req.validated.params.id) });
    },

    async create(req, res) {
      const { order, replayed } = await ordersService.create(req.validated.body, {
        idempotencyKey: req.idempotencyKey,
        userId: req.user.id,
      });
      // A retried request gets the original order back, flagged so clients can tell.
      if (replayed) res.set('Idempotent-Replayed', 'true');
      res.status(replayed ? 200 : 201).json({ order });
    },

    async updateStatus(req, res) {
      const order = await ordersService.updateStatus(
        req.validated.params.id,
        req.validated.body.status,
        { userId: req.user.id },
      );
      res.json({ order });
    },
  };
}
