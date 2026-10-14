export const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Commerce Analytics';

/** INV-000042 for order 42. */
export function invoiceNumber(orderId) {
  return `INV-${String(orderId).padStart(6, '0')}`;
}
