import { HttpError } from '../utils/http-error.js';

export function notFoundHandler(req, _res, next) {
  next(new HttpError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
}

// Central error handler: every error response has the shape
// { error: { code, message, details? } } and never includes stack traces.
// Express identifies error handlers by their 4 arguments, so _next must stay.
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    const body = { code: err.code, message: err.message };
    if (err.details !== undefined) body.details = err.details;
    return res.status(err.status).json({ error: body });
  }

  // Malformed JSON or oversized bodies from express.json()
  if (err.type === 'entity.parse.failed') {
    return res
      .status(400)
      .json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
  }
  if (err.type === 'entity.too.large') {
    return res
      .status(413)
      .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
  }

  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  return res
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}
