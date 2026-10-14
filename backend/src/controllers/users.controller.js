/** Changed fields only: { field: { from, to } }. */
function diff(before, after, fields) {
  return Object.fromEntries(
    fields.filter((f) => before[f] !== after[f]).map((f) => [f, { from: before[f], to: after[f] }]),
  );
}

export function createUsersController({ usersService }) {
  return {
    async list(_req, res) {
      res.json({ users: await usersService.listUsers() });
    },

    async create(req, res) {
      const user = await usersService.createUser(req.validated.body);
      await req.audit({
        action: 'user.created',
        entityType: 'user',
        entityId: user.id,
        summary: `Created ${user.role} account ${user.email}`,
        details: { email: user.email, fullName: user.fullName, role: user.role },
      });
      res.status(201).json({ user });
    },

    async update(req, res) {
      const { before, after } = await usersService.updateUser(
        req.user,
        req.validated.params.id,
        req.validated.body,
      );
      const changes = diff(before, after, ['fullName', 'role', 'isActive']);
      await req.audit({
        action: 'user.updated',
        entityType: 'user',
        entityId: after.id,
        summary: `Updated account ${after.email}`,
        details: changes,
      });
      res.json({ user: after });
    },

    async resetPassword(req, res) {
      const user = await usersService.resetPassword(
        req.user,
        req.validated.params.id,
        req.validated.body.password,
      );
      await req.audit({
        action: 'user.password_reset',
        entityType: 'user',
        entityId: user.id,
        summary: `Reset the password of ${user.email} and signed out their sessions`,
      });
      res.json({ user });
    },
  };
}
