import { createResourceController } from './resource.controller.js';

export function createProductsController({ productsService }) {
  return createResourceController({
    service: productsService,
    key: 'product',
    describe: (p) => `${p.name} (${p.sku})`,
    passUser: true,
  });
}
