import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { API, server } from '../test/server.js';
import { ApiError, apiRequest, onUnauthorized } from './client.js';

describe('apiRequest', () => {
  it('sends credentials and JSON, drops empty query params, and parses the response', async () => {
    let seen;
    server.use(
      http.post(`${API}/things`, async ({ request }) => {
        seen = {
          url: request.url,
          credentials: request.credentials,
          contentType: request.headers.get('content-type'),
          body: await request.json(),
        };
        return HttpResponse.json({ ok: true });
      }),
    );
    const data = await apiRequest('/things', {
      method: 'POST',
      body: { a: 1 },
      params: { page: 2, search: '', empty: null },
    });
    expect(data).toEqual({ ok: true });
    expect(seen.url).toBe(`${API}/things?page=2`);
    expect(seen.credentials).toBe('include');
    expect(seen.contentType).toBe('application/json');
    expect(seen.body).toEqual({ a: 1 });
  });

  it('turns API errors into ApiError with code and details', async () => {
    server.use(
      http.get(`${API}/broken`, () =>
        HttpResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Bad input', details: [{ path: 'x' }] } },
          { status: 400 },
        ),
      ),
    );
    const err = await apiRequest('/broken').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'Bad input' });
    expect(err.details).toEqual([{ path: 'x' }]);
  });

  it('handles non-JSON error bodies and network failures', async () => {
    server.use(
      http.get(`${API}/proxy`, () => new HttpResponse('<html>Bad Gateway</html>', { status: 502 })),
    );
    await expect(apiRequest('/proxy')).rejects.toMatchObject({ status: 502, code: 'HTTP_ERROR' });

    server.use(http.get(`${API}/down`, () => HttpResponse.error()));
    await expect(apiRequest('/down')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('returns null for 204 responses', async () => {
    server.use(http.delete(`${API}/item`, () => new HttpResponse(null, { status: 204 })));
    expect(await apiRequest('/item', { method: 'DELETE' })).toBeNull();
  });

  it('notifies listeners on 401 unless told not to', async () => {
    server.use(
      http.get(`${API}/private`, () =>
        HttpResponse.json({ error: { code: 'UNAUTHORIZED', message: 'nope' } }, { status: 401 }),
      ),
    );
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    await apiRequest('/private').catch(() => {});
    await apiRequest('/private', { skipUnauthorizedEvent: true }).catch(() => {});
    unsubscribe();
    await apiRequest('/private').catch(() => {});
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
