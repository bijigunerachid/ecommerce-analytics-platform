import { createResourceController } from './resource.controller.js';

export function createCustomersController({ customersService }) {
  return createResourceController({
    service: customersService,
    key: 'customer',
    describe: (c) => `${c.firstName} ${c.lastName} (${c.email})`,
  });
}
