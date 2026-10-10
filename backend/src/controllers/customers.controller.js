export function createCustomersController({ customersService }) {
  return {
    async list(req, res) {
      res.json(await customersService.list(req.validated.query));
    },

    async get(req, res) {
      res.json({ customer: await customersService.get(req.validated.params.id) });
    },

    async create(req, res) {
      res.status(201).json({ customer: await customersService.create(req.validated.body) });
    },

    async update(req, res) {
      const { id } = req.validated.params;
      res.json({ customer: await customersService.update(id, req.validated.body) });
    },

    async remove(req, res) {
      await customersService.delete(req.validated.params.id);
      res.status(204).end();
    },
  };
}
