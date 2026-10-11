import { lazy, Suspense } from 'react';
import { RequireAuth } from './auth/RequireAuth.jsx';
import { LoadingState } from './components/ui/States.jsx';
import { AppLayout } from './layouts/AppLayout.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';

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
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
