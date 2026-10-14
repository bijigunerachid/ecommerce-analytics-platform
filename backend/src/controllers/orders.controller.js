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
      else {
        await req.audit({
          action: 'order.created',
          entityType: 'order',
          entityId: order.id,
          summary: `Placed order #${order.id} for ${order.customerName} (${order.totalAmount})`,
          details: {
            customerId: order.customerId,
            totalAmount: order.totalAmount,
            items: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          },
        });
      }
      res.status(replayed ? 200 : 201).json({ order });
    },

    async updateStatus(req, res) {
      const { status, note } = req.validated.body;
      const order = await ordersService.updateStatus(req.validated.params.id, status, {
        userId: req.user.id,
        note,
      });
      await req.audit({
        action: 'order.status_changed',
        entityType: 'order',
        entityId: order.id,
        summary: `Changed order #${order.id} to ${status}`,
        details: { status, ...(note && { note }) },
      });
      res.json({ order });
    },

    async bulkUpdateStatus(req, res) {
      const { orderIds, status, note } = req.validated.body;
      const result = await ordersService.bulkUpdateStatus(orderIds, status, {
        userId: req.user.id,
        note,
      });
      await req.audit({
        action: 'order.bulk_status_changed',
        entityType: 'order',
        summary: `Changed ${result.updated.length} of ${orderIds.length} orders to ${status}`,
        details: {
          status,
          updated: result.updated,
          failed: result.failed.map((f) => f.orderId),
          ...(note && { note }),
        },
      });
      res.json(result);
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
      await req.audit({
        action: 'order.note_added',
        entityType: 'order',
        entityId: req.validated.params.id,
        summary: `Added a note to order #${req.validated.params.id}`,
      });
      res.status(201).json({ note });
    },
  };
}
