export function createCategoriesController({ categoriesService }) {
  return {
    async list(req, res) {
      res.json(await categoriesService.list(req.validated.query));
    },

    async get(req, res) {
      res.json({ category: await categoriesService.get(req.validated.params.id) });
    },

    async create(req, res) {
      res.status(201).json({ category: await categoriesService.create(req.validated.body) });
    },

    async update(req, res) {
      const { id } = req.validated.params;
      res.json({ category: await categoriesService.update(id, req.validated.body) });
    },

    async remove(req, res) {
      await categoriesService.delete(req.validated.params.id);
      res.status(204).end();
    },
  };
}
