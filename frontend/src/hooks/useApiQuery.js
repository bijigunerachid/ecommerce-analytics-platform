import { useCallback, useEffect, useState } from 'react';

/**
 * Runs an async API call and tracks its state. Re-runs when `deps` change, aborting the
 * previous request. While refetching, the previous data stays on screen (no skeleton flash);
 * `isFetching` tells the UI a refresh is in progress.
 *
 * Results are stored with the key of the inputs they were fetched for, so "fetching" is
 * derived (current key ≠ result key) instead of being set inside the effect.
 *
 * @param {(signal: AbortSignal) => Promise<any>} fetcher
 * @param {unknown[]} deps - everything the fetcher depends on (must be JSON-serializable)
 */
export function useApiQuery(fetcher, deps) {
  const [reloadCount, setReloadCount] = useState(0);
  const key = JSON.stringify([...deps, reloadCount]);
  const [result, setResult] = useState({ key: null, data: undefined, error: null });

  useEffect(() => {
    const controller = new AbortController();
    fetcher(controller.signal)
      .then((data) => setResult({ key, data, error: null }))
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setResult((prev) => ({ key, data: prev.data, error }));
      });
    return () => controller.abort();
    // The fetcher is recreated every render; `key` captures what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const refetch = useCallback(() => setReloadCount((n) => n + 1), []);
  const isFetching = result.key !== key;
  return {
    data: result.data,
    error: isFetching ? null : result.error,
    isFetching,
    isLoading: isFetching && result.data === undefined,
    refetch,
  };
}
