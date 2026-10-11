/**
 * Maps API validation details ({ location: 'body', path: 'price', message }) to
 * { price: message } for showing errors next to form fields. Nested paths like
 * "items.0.productId" are kept as-is.
 */
export function fieldErrorsFrom(error) {
  if (!Array.isArray(error?.details)) return {};
  const errors = {};
  for (const detail of error.details) {
    if (detail?.path && detail.location !== 'query' && !errors[detail.path]) {
      errors[detail.path] = detail.message;
    }
  }
  return errors;
}

/** A user-facing message for a failed request, preferring the API's own wording. */
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;
  if (error.code === 'NETWORK_ERROR') return error.message;
  return error.message || fallback;
}
