// Thin fetch wrapper for the backend API.
// - Sends the HttpOnly session cookie (credentials: 'include'); JavaScript never sees the token.
// - Turns error responses ({ error: { code, message, details } }) into ApiError.
// - Notifies listeners on 401 so the app can return to the login page when a session expires.

export const API_BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const unauthorizedListeners = new Set();

/** Registers a callback for 401 responses; returns an unsubscribe function. */
export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function toQuery(params) {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * @param {string} path - e.g. '/analytics/overview'
 * @param {{ method?: string, body?: unknown, params?: object, headers?: object,
 *           signal?: AbortSignal, skipUnauthorizedEvent?: boolean }} [options]
 */
export async function apiRequest(path, options = {}) {
  const { method = 'GET', body, params, headers, signal, skipUnauthorizedEvent } = options;
  let response;
  try {
    response = await fetch(`${API_BASE}${path}${toQuery(params)}`, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection.');
  }

  if (response.status === 204) return null;
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body (e.g. a proxy error page); handled below.
  }

  if (!response.ok) {
    if (response.status === 401 && !skipUnauthorizedEvent) {
      unauthorizedListeners.forEach((listener) => listener());
    }
    const error = data?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? `Request failed (${response.status})`,
      error?.details,
    );
  }
  return data;
}

export const api = {
  get: (path, options) => apiRequest(path, { ...options, method: 'GET' }),
  post: (path, body, options) => apiRequest(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => apiRequest(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => apiRequest(path, { ...options, method: 'DELETE' }),
};
