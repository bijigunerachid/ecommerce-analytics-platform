export function createInventoryController({ inventoryService }) {
  return {
    async listMovements(req, res) {
      res.json(await inventoryService.listMovements(req.validated.query));
    },

    async adjust(req, res) {
      const { movement, replayed } = await inventoryService.adjust(req.validated.body, {
        idempotencyKey: req.idempotencyKey,
        userId: req.user.id,
      });
      if (replayed) res.set('Idempotent-Replayed', 'true');
      res.status(replayed ? 200 : 201).json({ movement });
    },
  };
}
