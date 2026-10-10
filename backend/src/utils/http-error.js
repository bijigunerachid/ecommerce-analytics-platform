// Errors that are safe to show to API clients. Anything else becomes a generic 500.
export class HttpError extends Error {
  /**
   * @param {number} status - HTTP status code
   * @param {string} code - stable machine-readable error code
   * @param {string} message - human-readable message
   * @param {unknown} [details] - optional structured details (e.g. validation issues)
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) =>
  new HttpError(400, 'VALIDATION_ERROR', message, details);
export const unauthorized = (message = 'Authentication required') =>
  new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Resource not found') =>
  new HttpError(404, 'NOT_FOUND', message);
export const conflict = (message) => new HttpError(409, 'CONFLICT', message);
