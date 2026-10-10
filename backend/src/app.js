import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createAuthController } from './controllers/auth.controller.js';
import { createCategoriesController } from './controllers/categories.controller.js';
import { createHealthController } from './controllers/health.controller.js';
import { createProductsController } from './controllers/products.controller.js';
import { createUsersController } from './controllers/users.controller.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createCategoriesRepository } from './repositories/categories.repository.js';
import { createProductsRepository } from './repositories/products.repository.js';
import { createStockMovementsRepository } from './repositories/stock-movements.repository.js';
import { createUsersRepository } from './repositories/users.repository.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createCrudRouter } from './routes/crud.routes.js';
import { createUsersRouter } from './routes/users.routes.js';
import { createAuthService } from './services/auth.service.js';
import { createCategoriesService } from './services/categories.service.js';
import { createProductsService } from './services/products.service.js';
import { createUsersService } from './services/users.service.js';
import {
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from './validation/categories.schemas.js';
import {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from './validation/products.schemas.js';

/**
 * Builds the Express app. Dependencies are passed in (rather than imported) so tests can
 * run the real app against the test database with their own configuration.
 * @param {{ db: import('pg').Pool, config: ReturnType<typeof import('./config/env.js').loadConfig> }} deps
 */
export function createApp({ db, config }) {
  const { auth } = config;

  const usersRepository = createUsersRepository(db);
  const authService = createAuthService({ usersRepository, ...auth });
  const usersService = createUsersService({ usersRepository, bcryptRounds: auth.bcryptRounds });
  const categoriesService = createCategoriesService({
    categoriesRepository: createCategoriesRepository(db),
  });
  const productsService = createProductsService({
    db,
    productsRepository: createProductsRepository(db),
    stockMovementsRepository: createStockMovementsRepository(),
  });

  const healthController = createHealthController({ db });
  const authController = createAuthController({ authService, ...auth });
  const usersController = createUsersController({ usersService });
  const categoriesController = createCategoriesController({ categoriesService });
  const productsController = createProductsController({ productsService });
  const authenticate = requireAuth(authService);

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true, // allow the browser to send the auth cookie
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.get('/health', healthController.ready);
  api.get('/health/live', healthController.live);
  api.use(
    '/auth',
    createAuthRouter({
      authController,
      requireAuth: authenticate,
      loginRateLimit: config.loginRateLimit,
    }),
  );
  api.use('/users', createUsersRouter({ usersController, requireAuth: authenticate }));
  api.use(
    '/categories',
    createCrudRouter({
      controller: categoriesController,
      requireAuth: authenticate,
      schemas: {
        list: listCategoriesQuerySchema,
        create: createCategorySchema,
        update: updateCategorySchema,
      },
    }),
  );
  api.use(
    '/products',
    createCrudRouter({
      controller: productsController,
      requireAuth: authenticate,
      schemas: {
        list: listProductsQuerySchema,
        create: createProductSchema,
        update: updateProductSchema,
      },
    }),
  );
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
