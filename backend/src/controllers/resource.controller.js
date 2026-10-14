/** Fields whose values differ: { field: { from, to } } (timestamps are not changes). */
export function changedFields(before, after) {
  const ignored = new Set(['updatedAt', 'createdAt']);
  return Object.fromEntries(
    Object.keys(after)
      .filter((k) => !ignored.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
      .map((k) => [k, { from: before[k], to: after[k] }]),
  );
}

/**
 * Controller for a standard resource (see routes/crud.routes.js) that records every create,
 * update, and delete in the audit log.
 *
 * @param {{ service: object, key: string, describe: (entity: object) => string,
 *           passUser?: boolean }} options
 *   key: response property and audit entity type, e.g. 'product' (actions product.created, ...)
 *   passUser: also give the service { userId } on create
 */
export function createResourceController({ service, key, describe, passUser = false }) {
  return {
    async list(req, res) {
      res.json(await service.list(req.validated.query));
    },

    async get(req, res) {
      res.json({ [key]: await service.get(req.validated.params.id) });
    },

    async create(req, res) {
      const entity = await service.create(
        req.validated.body,
        ...(passUser ? [{ userId: req.user.id }] : []),
      );
      await req.audit({
        action: `${key}.created`,
        entityType: key,
        entityId: entity.id,
        summary: `Created ${key} ${describe(entity)}`,
      });
      res.status(201).json({ [key]: entity });
    },

    async update(req, res) {
      const { id } = req.validated.params;
      const before = await service.get(id);
      const entity = await service.update(id, req.validated.body);
      await req.audit({
        action: `${key}.updated`,
        entityType: key,
        entityId: entity.id,
        summary: `Updated ${key} ${describe(entity)}`,
        details: changedFields(before, entity),
      });
      res.json({ [key]: entity });
    },

    async remove(req, res) {
      const { id } = req.validated.params;
      const before = await service.get(id);
      await service.delete(id);
      await req.audit({
        action: `${key}.deleted`,
        entityType: key,
        entityId: id,
        summary: `Deleted ${key} ${describe(before)}`,
      });
      res.status(204).end();
    },
  };
}
