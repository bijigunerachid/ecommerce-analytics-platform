import { createBrowserRouter, RouterProvider } from 'react-router';
import { Providers } from './Providers.jsx';
import { routes } from './routes.jsx';

const router = createBrowserRouter(routes);

export default function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  );
}
