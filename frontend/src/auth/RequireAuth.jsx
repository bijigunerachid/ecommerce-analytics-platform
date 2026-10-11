import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageSpinner } from '../components/ui/Spinner.jsx';
import { useAuth } from './AuthContext.js';

/**
 * Guards child routes: signed-out users go to /login, which returns them here afterwards.
 * This is a convenience for the UI only; the API enforces authentication and roles itself.
 */
export function RequireAuth({ roles }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner label="Checking your session" />;
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
