import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

/**
 * List state (page, sort, search, filters) kept in the URL, so list views survive reloads and
 * can be shared. Changing anything except the page resets to page 1.
 *
 * @param {Record<string, string>} defaults - default values; keys not listed are ignored
 */
export function useListParams(defaults) {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(() => {
    const values = {};
    for (const [key, fallback] of Object.entries(defaults)) {
      values[key] = searchParams.get(key) ?? fallback;
    }
    values.page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
    return values;
    // defaults are static per page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const update = useCallback(
    (changes) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value === '' || value === null || value === undefined || value === defaults[key]) {
              next.delete(key);
            } else {
              next.set(key, String(value));
            }
          }
          if (!('page' in changes)) next.delete('page');
          if (next.get('page') === '1') next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setSearchParams],
  );

  /** Clicking the current sort column flips the order; a new column starts ascending. */
  const toggleSort = useCallback(
    (field, defaultOrder = 'asc') => {
      if (params.sort === field) update({ order: params.order === 'asc' ? 'desc' : 'asc' });
      else update({ sort: field, order: defaultOrder });
    },
    [params.sort, params.order, update],
  );

  return { params, update, toggleSort };
}

/** Removes empty values so they are not sent to the API. */
export function cleanParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  );
}
