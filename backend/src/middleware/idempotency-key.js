import { badRequest } from '../utils/http-error.js';

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

/**
 * Requires an Idempotency-Key header on requests that must not be applied twice
 * (e.g. a client retrying "create order" after a timeout). Sets req.idempotencyKey.
 * Clients should send a fresh random value (e.g. a UUID) per logical operation.
 */
export function requireIdempotencyKey(req, _res, next) {
  const key = req.get('Idempotency-Key');
  if (!key || !KEY_PATTERN.test(key)) {
    return next(
      badRequest('A valid Idempotency-Key header is required', [
        {
          location: 'headers',
          path: 'Idempotency-Key',
          message: 'Must be 8-100 characters: letters, digits, "-" or "_" (a UUID works)',
        },
      ]),
    );
  }
  req.idempotencyKey = key;
  next();
}
