import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { Providers } from '../Providers.jsx';
import { routes } from '../routes.jsx';

/** Renders the real app (routes, providers) at a URL, with an in-memory history. */
export function renderApp(url = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  const user = userEvent.setup();
  const utils = render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...utils, router, user };
}
