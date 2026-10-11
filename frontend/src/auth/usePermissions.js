import { useAuth } from './AuthContext.js';

/**
 * What the signed-in user may do. Used only to hide controls they could not use;
 * the API enforces every permission itself.
 */
export function usePermissions() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  return { isAdmin, canEdit: isAdmin };
}
