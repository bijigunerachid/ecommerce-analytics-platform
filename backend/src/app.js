import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createAnalyticsController } from './controllers/analytics.controller.js';
import { createAuthController } from './controllers/auth.controller.js';
import { createCategoriesController } from './controllers/categories.controller.js';
import { createCustomersController } from './controllers/customers.controller.js';
import { createAuditController } from './controllers/audit.controller.js';
import { createExportsController } from './controllers/exports.controller.js';
import { createPredictiveController } from './controllers/predictive.controller.js';
import { createInsightsController } from './controllers/insights.controller.js';
import { createNotificationsController } from './controllers/notifications.controller.js';
import { createStreamController } from './controllers/stream.controller.js';
import { createHealthController } from './controllers/health.controller.js';
import { createInventoryController } from './controllers/inventory.controller.js';
import { createPipelineController } from './controllers/pipeline.controller.js';
import { createOrdersController } from './controllers/orders.controller.js';
import { createProductsController } from './controllers/products.controller.js';
import { createUsersController } from './controllers/users.controller.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createAnalyticsRepository } from './repositories/analytics.repository.js';
import { createCategoriesRepository } from './repositories/categories.repository.js';
import { createCustomersRepository } from './repositories/customers.repository.js';
import { createExportDefinitions } from './exports/definitions.js';
import { auditContext } from './middleware/audit.js';
import { createAuditRepository } from './repositories/audit.repository.js';
import { createInsightsRepository } from './repositories/insights.repository.js';
import { createPredictiveRepository } from './repositories/predictive.repository.js';
import { createNotificationsRepository } from './repositories/notifications.repository.js';
import { createEventHub } from './realtime/event-hub.js';
import { createOrdersRepository } from './repositories/orders.repository.js';
import { createOutboxRepository } from './repositories/outbox.repository.js';
import { createPipelineRepository } from './repositories/pipeline.repository.js';
import { createProductsRepository } from './repositories/products.repository.js';
import { createStockMovementsRepository } from './repositories/stock-movements.repository.js';
import { createUsersRepository } from './repositories/users.repository.js';
import { createAnalyticsRouter } from './routes/analytics.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createCrudRouter } from './routes/crud.routes.js';
import { createAuditRouter } from './routes/audit.routes.js';
import { createExportsRouter } from './routes/exports.routes.js';
import { createInsightsRouter } from './routes/insights.routes.js';
import { createRealtimeRouter } from './routes/realtime.routes.js';
import { createInventoryRouter } from './routes/inventory.routes.js';
import { createPipelineRouter } from './routes/pipeline.routes.js';
import { createOrdersRouter } from './routes/orders.routes.js';
import { createUsersRouter } from './routes/users.routes.js';
import { createAnalyticsService } from './services/analytics.service.js';
import { createAuthService } from './services/auth.service.js';
import { createCategoriesService } from './services/categories.service.js';
import { createCustomersService } from './services/customers.service.js';
import { createInsightsService } from './services/insights.service.js';
import { createPredictiveService } from './services/predictive.service.js';
import { createInventoryService } from './services/inventory.service.js';
import { createPipelineService } from './services/pipeline.service.js';
import { createOrdersService } from './services/orders.service.js';
import { createProductsService } from './services/products.service.js';
import { createUsersService } from './services/users.service.js';
import {
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from './validation/categories.schemas.js';
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from './validation/customers.schemas.js';
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
  const usersService = createUsersService({
    db,
    usersRepository,
    bcryptRounds: auth.bcryptRounds,
  });
  const auditRepository = createAuditRepository(db);
  const categoriesService = createCategoriesService({
    categoriesRepository: createCategoriesRepository(db),
  });
  const outboxRepository = createOutboxRepository();
  const stockMovementsRepository = createStockMovementsRepository({ db, outboxRepository });
  const customersRepository = createCustomersRepository(db);
  const productsRepository = createProductsRepository(db);
  const productsService = createProductsService({
    db,
    productsRepository,
    stockMovementsRepository,
  });
  const customersService = createCustomersService({ customersRepository });
  const ordersService = createOrdersService({
    db,
    ordersRepository: createOrdersRepository(db),
    customersRepository,
    stockMovementsRepository,
    outboxRepository,
  });
  const inventoryService = createInventoryService({ db, stockMovementsRepository });
  const predictiveService = createPredictiveService({
    predictiveRepository: createPredictiveRepository(db),
  });
  const insightsService = createInsightsService({
    predictiveService,
    insightsRepository: createInsightsRepository(db),
    customersRepository,
    productsRepository,
  });

  const healthController = createHealthController({ db });
  const authController = createAuthController({ authService, ...auth });
  const usersController = createUsersController({ usersService });
  const categoriesController = createCategoriesController({ categoriesService });
  const productsController = createProductsController({ productsService });
  const customersController = createCustomersController({ customersService });
  const ordersController = createOrdersController({ ordersService });
  const inventoryController = createInventoryController({ inventoryService });
  const insightsController = createInsightsController({ insightsService });
  const auditController = createAuditController({ auditRepository });
  const notificationsController = createNotificationsController({
    notificationsRepository: createNotificationsRepository(db),
  });
  // Live events from PostgreSQL to SSE streams; stopped by the caller on shutdown.
  const eventHub = createEventHub({ dbConfig: config.db });
  const streamController = createStreamController({
    eventHub,
    authService,
    heartbeatMs: config.streamHeartbeatMs,
  });
  const analyticsService = createAnalyticsService({
    analyticsRepository: createAnalyticsRepository(db),
  });
  const analyticsController = createAnalyticsController({ analyticsService });
  const predictiveController = createPredictiveController({ predictiveService });
  const exportsController = createExportsController({
    definitions: createExportDefinitions({
      ordersService,
      productsService,
      customersService,
      inventoryService,
      auditRepository,
      analyticsService,
    }),
    maxRows: config.exportMaxRows,
  });
  const pipelineController = createPipelineController({
    pipelineService: createPipelineService({ pipelineRepository: createPipelineRepository(db) }),
  });
  const authenticate = requireAuth(authService);

  const app = express();
  app.locals.eventHub = eventHub;
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy ?? 0);
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true, // allow the browser to send the auth cookie
      exposedHeaders: ['Idempotent-Replayed'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(auditContext(auditRepository));
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
  api.use('/audit-log', createAuditRouter({ auditController, requireAuth: authenticate }));
  api.use('/exports', createExportsRouter({ exportsController, requireAuth: authenticate }));
  // Before the resource routers, which would treat "insights" as an unknown sub-path.
  api.use(createInsightsRouter({ insightsController, requireAuth: authenticate }));
  api.use(
    createRealtimeRouter({ notificationsController, streamController, requireAuth: authenticate }),
  );
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
  api.use(
    '/customers',
    createCrudRouter({
      controller: customersController,
      requireAuth: authenticate,
      schemas: {
        list: listCustomersQuerySchema,
        create: createCustomerSchema,
        update: updateCustomerSchema,
      },
    }),
  );
  api.use('/orders', createOrdersRouter({ ordersController, requireAuth: authenticate }));
  api.use('/inventory', createInventoryRouter({ inventoryController, requireAuth: authenticate }));
  api.use('/pipeline', createPipelineRouter({ pipelineController, requireAuth: authenticate }));
  api.use(
    '/analytics',
    createAnalyticsRouter({ analyticsController, predictiveController, requireAuth: authenticate }),
  );
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
