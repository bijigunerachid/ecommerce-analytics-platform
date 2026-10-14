import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { signInAsAnalyst } from '../test/server.js';
import { renderApp } from '../test/render.jsx';
import { pageWindow } from '../utils/pagination.js';
import { initials } from '../utils/text.js';
import { breadcrumbsFor } from './navigation.js';

describe('app shell', () => {
  it('groups the navigation and shows breadcrumbs for the current page', async () => {
    renderApp('/orders');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByText('Sales')).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Orders' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Orders')).toHaveAttribute('aria-current', 'page');
  });

  it('shows live pipeline status in the sidebar', async () => {
    renderApp('/');
    expect(await screen.findByRole('status', { name: 'Pipeline healthy' })).toBeInTheDocument();
  });

  it('collapses the sidebar and remembers it', async () => {
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    expect(localStorage.getItem('sidebar-collapsed')).toBe('1');
  });

  it('switches the theme from the account menu', async () => {
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: /Account menu/ }));
    const menu = screen.getByRole('menu', { name: 'Account' });
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Dark' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the account menu with Escape and returns focus to its button', async () => {
    const { user } = renderApp('/');
    const trigger = await screen.findByRole('button', { name: /Account menu/ });
    await user.click(trigger);
    expect(screen.getByRole('menuitemradio', { name: 'Light' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe('command palette', () => {
  it('opens with Ctrl+K and jumps to a page', async () => {
    const { user, router } = renderApp('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.keyboard('{Control>}k{/Control}');
    const input = screen.getByRole('combobox', { name: /Search pages/ });
    expect(input).toHaveFocus();
    await user.type(input, 'inven');
    expect(screen.getByRole('option', { name: /Inventory/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/inventory'));
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('finds orders, products, and customers', async () => {
    const { user, router } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Search' }));
    await user.type(screen.getByRole('combobox'), 'Alice');
    const customer = await screen.findByRole('option', { name: /^Alice Martin/ });
    expect(screen.getByRole('group', { name: 'Products' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Orders' })).toBeInTheDocument();
    await user.click(customer);
    await waitFor(() => expect(router.state.location.pathname).toBe('/customers/5'));
    expect(await screen.findByRole('heading', { name: /Alice Martin/ })).toBeInTheDocument();
  });

  it('hides admin-only actions from analysts', async () => {
    signInAsAnalyst();
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.queryByRole('option', { name: /Create order/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Users/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Orders/ })).toBeInTheDocument();
  });
});

describe('keyboard shortcuts', () => {
  it('navigates with "g" then a page key and lists shortcuts with "?"', async () => {
    const { user, router } = renderApp('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.keyboard('go');
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders'));
    await user.keyboard('?');
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByText('Products')).toBeInTheDocument();
  });

  it('ignores single-key shortcuts while typing', async () => {
    const { user, router } = renderApp('/orders');
    await user.type(await screen.findByRole('searchbox', { name: 'Search orders' }), 'gp');
    expect(router.state.location.pathname).toBe('/orders');
  });
});

describe('dashboard live mode', () => {
  it('toggles and remembers live refresh', async () => {
    const { user } = renderApp('/');
    const toggle = await screen.findByRole('button', { name: 'Live' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('dashboard-live')).toBe('1');
  });
});

describe('shell helpers', () => {
  it('builds breadcrumbs', () => {
    expect(breadcrumbsFor('/')).toEqual([{ label: 'Dashboard' }]);
    expect(breadcrumbsFor('/orders/42')).toEqual([
      { label: 'Sales' },
      { label: 'Orders', to: '/orders' },
      { label: 'Order #42' },
    ]);
    expect(breadcrumbsFor('/orders/new').at(-1)).toEqual({ label: 'New order' });
  });

  it('windows page numbers', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 10)).toEqual([1, 2, null, 10]);
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageWindow(3, 4)).toEqual([1, 2, 3, 4]);
  });

  it('makes initials', () => {
    expect(initials('rachid bijigune')).toBe('RB');
    expect(initials('Ada')).toBe('A');
    expect(initials('  ')).toBe('?');
  });
});
