export function createProductsController({ productsService }) {
  return {
    async list(req, res) {
      res.json(await productsService.list(req.validated.query));
    },

    async get(req, res) {
      res.json({ product: await productsService.get(req.validated.params.id) });
    },

    async create(req, res) {
      const product = await productsService.create(req.validated.body, { userId: req.user.id });
      res.status(201).json({ product });
    },

    async update(req, res) {
      const { id } = req.validated.params;
      res.json({ product: await productsService.update(id, req.validated.body) });
    },

    async remove(req, res) {
      await productsService.delete(req.validated.params.id);
      res.status(204).end();
    },
  };
}
