import { lazy, Suspense } from 'react';
import { RequireAuth } from './auth/RequireAuth.jsx';
import { LoadingState } from './components/ui/States.jsx';
import { AppLayout } from './layouts/AppLayout.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { CategoriesPage } from './pages/CategoriesPage.jsx';
import { CustomersPage } from './pages/CustomersPage.jsx';
import { InventoryPage } from './pages/InventoryPage.jsx';
import { NewOrderPage } from './pages/NewOrderPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { OrderDetailPage } from './pages/OrderDetailPage.jsx';
import { OrdersPage } from './pages/OrdersPage.jsx';
import { ProductsPage } from './pages/ProductsPage.jsx';
import { UsersPage } from './pages/UsersPage.jsx';

// The dashboard carries the charting library; loading it lazily keeps the sign-in page light.
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage.jsx').then((m) => ({ default: m.DashboardPage })),
);

const page = (element) => (
  <Suspense fallback={<LoadingState label="Loading page" className="h-96" />}>{element}</Suspense>
);

export const routes = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: page(<DashboardPage />) },
          { path: 'orders', element: <OrdersPage /> },
          { path: 'orders/:id', element: <OrderDetailPage /> },
          { path: 'products', element: <ProductsPage /> },
          { path: 'categories', element: <CategoriesPage /> },
          { path: 'customers', element: <CustomersPage /> },
          { path: 'inventory', element: <InventoryPage /> },
          // UI-level guards; the API enforces the same roles.
          {
            element: <RequireAuth roles={['admin']} />,
            children: [
              { path: 'orders/new', element: <NewOrderPage /> },
              { path: 'users', element: <UsersPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
