import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render.jsx';
import { API, server, unauthorized } from '../test/server.js';

const signedOut = () => server.use(http.get(`${API}/auth/me`, unauthorized));

describe('authentication flow', () => {
  it('restores an existing session and shows the dashboard', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getAllByText('Ada Admin').length).toBeGreaterThan(0);
  });

  it('sends signed-out visitors to the login page', async () => {
    signedOut();
    const { router } = renderApp('/?range=7d');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('validates the form before calling the API', async () => {
    signedOut();
    const { user } = renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a clear message for wrong credentials and rate limiting', async () => {
    signedOut();
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'admin@example.test');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');

    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ error: { code: 'TOO_MANY_REQUESTS', message: 'x' } }, { status: 429 }),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Too many sign-in attempts/);
  });

  it('signs in and returns to the page that was requested', async () => {
    signedOut();
    const { user, router } = renderApp('/?range=7d');
    await user.type(await screen.findByLabelText('Email'), 'admin@example.test');
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('?range=7d');
  });

  it('returns to the login page when the session expires mid-use', async () => {
    renderApp('/');
    await screen.findByRole('heading', { name: 'Dashboard' });

    server.use(http.get(`${API}/analytics/*`, unauthorized));
    // Any API call now gets 401 (e.g. a refresh); the app drops the session.
    const { user } = { user: (await import('@testing-library/user-event')).default.setup() };
    await user.click(screen.getByRole('button', { name: 'Refresh data' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('signs out', async () => {
    const { user, router } = renderApp('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getAllByRole('button', { name: 'Sign out' })[0]);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('shows a not-found page for unknown routes inside the app', async () => {
    renderApp('/does-not-exist');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
