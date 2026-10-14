// Mirrors the API's rule for new passwords (backend validation/common.js).
export const PASSWORD_MIN_LENGTH = 12;

/** An error message for a new password, or undefined if it is acceptable. */
export function newPasswordError(password) {
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (new TextEncoder().encode(password).length > 72) return 'Use at most 72 bytes.';
  return undefined;
}
