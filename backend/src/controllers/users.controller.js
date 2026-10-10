export function createUsersController({ usersService }) {
  return {
    async list(_req, res) {
      res.json({ users: await usersService.listUsers() });
    },

    async create(req, res) {
      const user = await usersService.createUser(req.validated.body);
      res.status(201).json({ user });
    },
  };
}
