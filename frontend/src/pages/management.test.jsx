import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import * as f from '../test/fixtures.js';
import { renderApp } from '../test/render.jsx';
import { API, server, signInAsAnalyst } from '../test/server.js';

const conflict = (message) =>
  HttpResponse.json({ error: { code: 'CONFLICT', message } }, { status: 409 });

describe('products', () => {
  it('lists products with stock state and reads filters from the URL', async () => {
    let seen;
    server.use(
      http.get(`${API}/products`, ({ request }) => {
        seen = new URL(request.url).searchParams;
        return HttpResponse.json(f.productsList);
      }),
    );
    renderApp('/products?lowStock=true&sort=price&order=desc');
    const table = await screen.findByRole('table', { name: 'Products' });
    expect(within(table).getByText('Aurora 14" Laptop')).toBeInTheDocument();
    expect(within(table).getByText('Low')).toBeInTheDocument(); // 3 in stock, reorder at 8
    expect(seen.get('lowStock')).toBe('true');
    expect(seen.get('sort')).toBe('price');
    expect(seen.get('order')).toBe('desc');
    expect(screen.getByRole('columnheader', { name: /Price/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('searches as you type and sorts by clicking a header', async () => {
    const requests = [];
    server.use(
      http.get(`${API}/products`, ({ request }) => {
        requests.push(new URL(request.url).searchParams);
        return HttpResponse.json(f.productsList);
      }),
    );
    const { user, router } = renderApp('/products');
    await screen.findByRole('table', { name: 'Products' });

    await user.type(screen.getByRole('searchbox', { name: 'Search products' }), 'mouse');
    await waitFor(() => expect(router.state.location.search).toContain('search=mouse'));
    await waitFor(() => expect(requests.at(-1).get('search')).toBe('mouse'));

    await user.click(screen.getByRole('button', { name: /SKU/ }));
    await waitFor(() => expect(router.state.location.search).toContain('sort=sku'));
  });

  it('hides editing controls from analysts', async () => {
    signInAsAnalyst();
    renderApp('/products');
    await screen.findByRole('table', { name: 'Products' });
    expect(screen.queryByRole('button', { name: 'New product' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit ELC/ })).not.toBeInTheDocument();
  });

  it('validates the form, then creates the product', async () => {
    let body;
    server.use(
      http.post(`${API}/products`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { product: { ...f.mouse, id: 99, sku: 'NEW-1' } },
          { status: 201 },
        );
      }),
    );
    const { user } = renderApp('/products');
    await user.click(await screen.findByRole('button', { name: 'New product' }));
    const dialog = screen.getByRole('dialog', { name: 'New product' });

    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Use 2–40 letters, digits, "-" or "_".')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose a category.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter an amount like 19.99.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/SKU/), 'new-1');
    await user.type(within(dialog).getByLabelText(/^Name/), 'New thing');
    await user.selectOptions(within(dialog).getByLabelText(/Category/), 'Electronics');
    await user.type(within(dialog).getByLabelText(/Price/), '12.50');
    await user.clear(within(dialog).getByLabelText(/Initial stock/));
    await user.type(within(dialog).getByLabelText(/Initial stock/), '25');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Product NEW-1 created.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(body).toEqual({
      sku: 'new-1',
      name: 'New thing',
      description: '',
      categoryId: 1,
      price: '12.50',
      reorderLevel: 10,
      isActive: true,
      initialStock: 25,
    });
  });

  it('shows API validation errors next to the right field and conflicts in a banner', async () => {
    server.use(
      http.post(`${API}/products`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Category does not exist',
              details: [
                { location: 'body', path: 'categoryId', message: 'Category does not exist' },
              ],
            },
          },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderApp('/products');
    await user.click(await screen.findByRole('button', { name: 'New product' }));
    const dialog = screen.getByRole('dialog', { name: 'New product' });
    await user.type(within(dialog).getByLabelText(/SKU/), 'X-1');
    await user.type(within(dialog).getByLabelText(/^Name/), 'X');
    await user.selectOptions(within(dialog).getByLabelText(/Category/), 'Audio');
    await user.type(within(dialog).getByLabelText(/Price/), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    const category = within(dialog).getByLabelText(/Category/);
    expect(await within(dialog).findByText('Category does not exist')).toBeInTheDocument();
    expect(category).toHaveAttribute('aria-invalid', 'true');

    server.use(
      http.post(`${API}/products`, () => conflict('A product with this SKU already exists')),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('SKU already exists');
  });

  it('explains why a product with history cannot be deleted', async () => {
    server.use(
      http.delete(`${API}/products/:id`, () =>
        conflict(
          'Product has order or inventory history and cannot be deleted; set isActive to false instead',
        ),
      ),
    );
    const { user } = renderApp('/products');
    await user.click(await screen.findByRole('button', { name: 'Delete ELC-LAPTOP-14' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete product?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('set isActive to false');
    expect(screen.getByRole('dialog')).toBeInTheDocument(); // stays open on failure
  });

  it('edits without offering a stock field', async () => {
    let body;
    server.use(
      http.patch(`${API}/products/:id`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ product: { ...f.laptop, price: '1199.00' } });
      }),
    );
    const { user } = renderApp('/products');
    await user.click(await screen.findByRole('button', { name: 'Edit ELC-LAPTOP-14' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit ELC-LAPTOP-14' });
    expect(within(dialog).queryByLabelText(/Initial stock/)).not.toBeInTheDocument();
    const price = within(dialog).getByLabelText(/Price/);
    await user.clear(price);
    await user.type(price, '1199.00');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Product ELC-LAPTOP-14 updated.');
    expect(body.price).toBe('1199.00');
    expect(body).not.toHaveProperty('stockQuantity');
    expect(body).not.toHaveProperty('initialStock');
  });
});

describe('categories and customers', () => {
  it('blocks deleting a category that still has products, with the API reason', async () => {
    server.use(
      http.delete(`${API}/categories/:id`, () =>
        conflict('Category still has products; move or delete them first'),
      ),
    );
    const { user } = renderApp('/categories');
    await user.click(await screen.findByRole('button', { name: 'Delete Electronics' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete category?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('still has products');
  });

  it('creates a customer and links to their orders', async () => {
    server.use(
      http.post(`${API}/customers`, async ({ request }) =>
        HttpResponse.json(
          { customer: { ...f.customer, ...(await request.json()), id: 6 } },
          { status: 201 },
        ),
      ),
    );
    const { user } = renderApp('/customers');
    const link = await screen.findByRole('link', { name: 'Orders of Alice Martin' });
    expect(link).toHaveAttribute('href', '/orders?customerId=5');

    await user.click(screen.getByRole('button', { name: 'New customer' }));
    const dialog = screen.getByRole('dialog', { name: 'New customer' });
    await user.type(within(dialog).getByLabelText(/First name/), 'Bob');
    await user.type(within(dialog).getByLabelText(/Last name/), 'Stone');
    await user.type(within(dialog).getByLabelText(/Email/), 'not-an-email');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Enter a valid email address.')).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText(/Email/));
    await user.type(within(dialog).getByLabelText(/Email/), 'bob@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Customer Bob Stone created.')).toBeInTheDocument();
  });
});

describe('users (admin only)', () => {
  it('is hidden from analysts in the menu and by route', async () => {
    signInAsAnalyst();
    const { router } = renderApp('/users');
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it('lets admins create accounts with a strong password', async () => {
    let body;
    server.use(
      http.post(`${API}/users`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { user: { ...f.analystUser, id: 3, email: body.email } },
          { status: 201 },
        );
      }),
    );
    const { user } = renderApp('/users');
    expect(await screen.findByText('Ana Lyst')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New user' }));
    const dialog = screen.getByRole('dialog', { name: 'New staff account' });
    await user.type(within(dialog).getByLabelText(/Full name/), 'New Person');
    await user.type(within(dialog).getByLabelText(/Email/), 'new@example.com');
    await user.type(within(dialog).getByLabelText(/Password/), 'short');
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }));
    expect(within(dialog).getByText('Use at least 12 characters.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Password/), '-but-now-long-enough');
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Account created for new@example.com.')).toBeInTheDocument();
    expect(body).toMatchObject({ role: 'analyst', email: 'new@example.com' });
  });
});

describe('modal accessibility', () => {
  it('moves focus into the dialog, closes on Escape, and returns focus', async () => {
    const { user } = renderApp('/categories');
    const opener = await screen.findByRole('button', { name: 'New category' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'New category' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByLabelText(/Name/)).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
