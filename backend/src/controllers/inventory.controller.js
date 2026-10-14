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
      else {
        const change =
          movement.quantityChange > 0 ? `+${movement.quantityChange}` : movement.quantityChange;
        await req.audit({
          action: 'inventory.adjusted',
          entityType: 'product',
          entityId: movement.productId,
          summary: `${movement.reason === 'restock' ? 'Restocked' : 'Adjusted'} ${movement.sku} by ${change}`,
          details: {
            quantityChange: movement.quantityChange,
            reason: movement.reason,
            ...(movement.note && { note: movement.note }),
          },
        });
      }
      res.status(replayed ? 200 : 201).json({ movement });
    },
  };
}
