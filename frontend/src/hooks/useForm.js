import { useCallback, useState } from 'react';
import { errorMessage, fieldErrorsFrom } from '../utils/errors.js';

/**
 * Minimal form state: values, per-field errors (client-side or from the API's validation
 * details), a form-level error, and a submit wrapper that tracks progress.
 *
 * @param {object} initialValues
 * @param {(values: object) => Record<string, string>} [validate] - client-side checks
 */
export function useForm(initialValues, validate) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const setField = useCallback(
    (name) => (e) => {
      const value = e?.target
        ? e.target.type === 'checkbox'
          ? e.target.checked
          : e.target.value
        : e;
      setValues((v) => ({ ...v, [name]: value }));
      setErrors((errs) => (errs[name] ? { ...errs, [name]: undefined } : errs));
    },
    [],
  );

  const reset = useCallback((next) => {
    setValues(next);
    setErrors({});
    setFormError(null);
  }, []);

  /** Runs client validation, then `action`; maps API errors onto fields. Returns success. */
  const submit = useCallback(
    async (action) => {
      setFormError(null);
      const clientErrors = validate ? validate(values) : {};
      if (Object.values(clientErrors).some(Boolean)) {
        setErrors(clientErrors);
        return false;
      }
      setSubmitting(true);
      try {
        await action(values);
        return true;
      } catch (err) {
        const fieldErrors = fieldErrorsFrom(err);
        setErrors(fieldErrors);
        // Field errors speak for themselves; anything else goes in the banner.
        if (Object.keys(fieldErrors).length === 0 || err.status !== 400) {
          setFormError(errorMessage(err));
        }
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [validate, values],
  );

  return {
    values,
    setValues,
    setField,
    errors,
    setErrors,
    formError,
    setFormError,
    submitting,
    submit,
    reset,
  };
}

// Reusable validators returning an error message or undefined.
export const rules = {
  required: (v, label = 'This field') =>
    String(v ?? '').trim() ? undefined : `${label} is required.`,
  money: (v) =>
    /^\d{1,10}(\.\d{1,2})?$/.test(String(v).trim()) ? undefined : 'Enter an amount like 19.99.',
  wholeNumber: (v, { min = 0 } = {}) =>
    /^-?\d+$/.test(String(v).trim()) && Number(v) >= min
      ? undefined
      : `Enter a whole number${min > 0 ? ` of at least ${min}` : min === 0 ? ' (0 or more)' : ''}.`,
  email: (v) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim())
      ? undefined
      : 'Enter a valid email address.',
};
