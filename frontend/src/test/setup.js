import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server.js';

// jsdom lacks these browser APIs; charts and the theme provider use them.
// Many test files render the whole app in parallel; allow well over the 1 s default.
configure({ asyncUtilTimeout: 5000 });

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? ResizeObserverStub;

export function mockPrefersDark(dark) {
  // A plain function (not vi.fn): restoreMocks would reset a mock's implementation.
  window.matchMedia = (query) => ({
    matches: query.includes('dark') ? dark : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
}

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  // Pages are lazy-loaded; the first import compiles them (and the chart library). Do that
  // up front so tests measure app behavior, not module compilation.
  const { pageLoaders } = await import('../routes.jsx');
  await Promise.all(Object.values(pageLoaders).map((load) => load()));
}, 60_000);
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  mockPrefersDark(false);
});
afterAll(() => server.close());

mockPrefersDark(false);
