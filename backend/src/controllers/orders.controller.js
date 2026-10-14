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
      const { status, note } = req.validated.body;
      const order = await ordersService.updateStatus(req.validated.params.id, status, {
        userId: req.user.id,
        note,
      });
      res.json({ order });
    },

    async bulkUpdateStatus(req, res) {
      const { orderIds, status, note } = req.validated.body;
      res.json(
        await ordersService.bulkUpdateStatus(orderIds, status, { userId: req.user.id, note }),
      );
    },

    async history(req, res) {
      res.json({ history: await ordersService.history(req.validated.params.id) });
    },

    async notes(req, res) {
      res.json({ notes: await ordersService.notes(req.validated.params.id) });
    },

    async addNote(req, res) {
      const note = await ordersService.addNote(req.validated.params.id, {
        body: req.validated.body.body,
        userId: req.user.id,
      });
      res.status(201).json({ note });
    },
  };
}
