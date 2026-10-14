import { lazy, Suspense } from 'react';
import { RequireAuth } from './auth/RequireAuth.jsx';
import { LoadingState } from './components/ui/States.jsx';
import { AppLayout } from './layouts/AppLayout.jsx';
import { LoginPage } from './pages/LoginPage.jsx';

// Every page after sign-in loads on demand (the dashboard also carries the charting
// library), so the sign-in page stays light and each page downloads only when opened.
const lazyPage = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
export const pageLoaders = {
  DashboardPage: () => import('./pages/DashboardPage.jsx'),
  OrdersPage: () => import('./pages/OrdersPage.jsx'),
  OrderDetailPage: () => import('./pages/OrderDetailPage.jsx'),
  NewOrderPage: () => import('./pages/NewOrderPage.jsx'),
  ProductsPage: () => import('./pages/ProductsPage.jsx'),
  CategoriesPage: () => import('./pages/CategoriesPage.jsx'),
  CustomersPage: () => import('./pages/CustomersPage.jsx'),
  InventoryPage: () => import('./pages/InventoryPage.jsx'),
  UsersPage: () => import('./pages/UsersPage.jsx'),
  NotFoundPage: () => import('./pages/NotFoundPage.jsx'),
  InvoicePage: () => import('./pages/InvoicePage.jsx'),
  CustomerDetailPage: () => import('./pages/CustomerDetailPage.jsx'),
  ProductDetailPage: () => import('./pages/ProductDetailPage.jsx'),
  AccountPage: () => import('./pages/AccountPage.jsx'),
  AuditLogPage: () => import('./pages/AuditLogPage.jsx'),
};
const DashboardPage = lazyPage(pageLoaders.DashboardPage, 'DashboardPage');
const OrdersPage = lazyPage(pageLoaders.OrdersPage, 'OrdersPage');
const OrderDetailPage = lazyPage(pageLoaders.OrderDetailPage, 'OrderDetailPage');
const NewOrderPage = lazyPage(pageLoaders.NewOrderPage, 'NewOrderPage');
const ProductsPage = lazyPage(pageLoaders.ProductsPage, 'ProductsPage');
const CategoriesPage = lazyPage(pageLoaders.CategoriesPage, 'CategoriesPage');
const CustomersPage = lazyPage(pageLoaders.CustomersPage, 'CustomersPage');
const InventoryPage = lazyPage(pageLoaders.InventoryPage, 'InventoryPage');
const UsersPage = lazyPage(pageLoaders.UsersPage, 'UsersPage');
const NotFoundPage = lazyPage(pageLoaders.NotFoundPage, 'NotFoundPage');
const InvoicePage = lazyPage(pageLoaders.InvoicePage, 'InvoicePage');
const CustomerDetailPage = lazyPage(pageLoaders.CustomerDetailPage, 'CustomerDetailPage');
const ProductDetailPage = lazyPage(pageLoaders.ProductDetailPage, 'ProductDetailPage');
const AccountPage = lazyPage(pageLoaders.AccountPage, 'AccountPage');
const AuditLogPage = lazyPage(pageLoaders.AuditLogPage, 'AuditLogPage');

const page = (element) => (
  <Suspense fallback={<LoadingState label="Loading page" className="h-96" />}>{element}</Suspense>
);

export const routes = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      // Printable pages render without the app shell.
      { path: 'orders/:id/invoice', element: page(<InvoicePage />) },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: page(<DashboardPage />) },
          { path: 'orders', element: page(<OrdersPage />) },
          { path: 'orders/:id', element: page(<OrderDetailPage />) },
          { path: 'products', element: page(<ProductsPage />) },
          { path: 'products/:id', element: page(<ProductDetailPage />) },
          { path: 'categories', element: page(<CategoriesPage />) },
          { path: 'customers', element: page(<CustomersPage />) },
          { path: 'customers/:id', element: page(<CustomerDetailPage />) },
          { path: 'inventory', element: page(<InventoryPage />) },
          { path: 'account', element: page(<AccountPage />) },
          // UI-level guards; the API enforces the same roles.
          {
            element: <RequireAuth roles={['admin']} />,
            children: [
              { path: 'orders/new', element: page(<NewOrderPage />) },
              { path: 'users', element: page(<UsersPage />) },
              { path: 'audit-log', element: page(<AuditLogPage />) },
            ],
          },
          { path: '*', element: page(<NotFoundPage />) },
        ],
      },
    ],
  },
];
