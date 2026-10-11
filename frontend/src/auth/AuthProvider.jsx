import { useCallback, useEffect, useMemo, useState } from 'react';
import { onUnauthorized } from '../api/client.js';
import { authApi } from '../api/endpoints.js';
import { AuthContext } from './AuthContext.js';

/**
 * Holds the signed-in user. On start it asks the API who is signed in (the session lives in
 * an HttpOnly cookie, so the browser cannot inspect it). Any 401 from the API afterwards
 * means the session expired or was revoked: the user is cleared and routes redirect to login.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const controller = new AbortController();
    authApi
      .me({ signal: controller.signal })
      .then(({ user: me }) => {
        setUser(me);
        setStatus('authenticated');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setUser(null);
        setStatus('anonymous');
      });
    return () => controller.abort();
  }, []);

  useEffect(
    () =>
      onUnauthorized(() => {
        setUser(null);
        setStatus('anonymous');
      }),
    [],
  );

  const login = useCallback(async (email, password) => {
    const { user: signedIn } = await authApi.login(email, password);
    setUser(signedIn);
    setStatus('authenticated');
    return signedIn;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo(() => ({ user, status, login, logout }), [user, status, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
