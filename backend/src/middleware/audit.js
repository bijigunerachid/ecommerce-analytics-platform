/**
 * Gives controllers `req.audit({ action, entityType, entityId, summary, details })`, which
 * records an audit entry for the signed-in user (or the given `actor`) and the client IP.
 * Controllers call it after the change succeeded, so failed requests leave no entry.
 */
export function auditContext(auditRepository) {
  return (req, _res, next) => {
    req.audit = ({ actor = req.user, ...entry }) =>
      auditRepository.insert({
        ...entry,
        actorId: actor?.id,
        actorEmail: actor?.email,
        ip: req.ip,
      });
    next();
  };
}
