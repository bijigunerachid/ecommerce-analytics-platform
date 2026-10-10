// PostgreSQL SQLSTATE codes the services translate into HTTP errors.
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';
export const PG_CHECK_VIOLATION = '23514';

export const isPgError = (err, code, constraint) =>
  err?.code === code && (constraint === undefined || err.constraint === constraint);
