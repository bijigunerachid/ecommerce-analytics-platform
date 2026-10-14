import { createResourceController } from './resource.controller.js';

export function createCategoriesController({ categoriesService }) {
  return createResourceController({
    service: categoriesService,
    key: 'category',
    describe: (c) => c.name,
  });
}
