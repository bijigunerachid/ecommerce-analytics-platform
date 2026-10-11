import { ChartNoAxesCombined, CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.js';
import { Button } from '../components/ui/Button.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function messageFor(error) {
  if (error.code === 'UNAUTHORIZED') return 'Incorrect email or password.';
  if (error.code === 'TOO_MANY_REQUESTS')
    return 'Too many sign-in attempts. Wait a few minutes and try again.';
  return error.message || 'Sign-in failed. Please try again.';
}

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const destination = location.state?.from?.pathname
    ? `${location.state.from.pathname}${location.state.from.search ?? ''}`
    : '/';

  if (status === 'authenticated') return <Navigate to={destination} replace />;

  function validate() {
    const errors = {};
    if (!EMAIL.test(form.email.trim())) errors.email = 'Enter a valid email address.';
    if (!form.password) errors.password = 'Enter your password.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await login(form.email.trim(), form.password);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  }

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const inputClass = (invalid) =>
    `mt-1 block h-10 w-full rounded-lg border bg-surface-raised px-3 text-sm text-ink placeholder:text-ink-muted ${
      invalid ? 'border-status-critical' : 'border-line-strong'
    }`;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-page px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-on-accent">
            <ChartNoAxesCombined aria-hidden="true" className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">Sign in</h1>
            <p className="text-sm text-ink-secondary">Commerce Analytics, for staff accounts</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          noValidate
          className="space-y-4 rounded-xl border border-line bg-surface p-6 shadow-sm"
        >
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-ink"
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-status-critical"
              />
              {error}
            </div>
          )}
          <div>
            <label htmlFor="email" className="text-sm font-medium text-ink">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              value={form.email}
              onChange={update('email')}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              className={inputClass(fieldErrors.email)}
            />
            {fieldErrors.email && (
              <p id="email-error" className="mt-1 text-xs text-text-critical">
                {fieldErrors.email}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-medium text-ink">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={update('password')}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              className={inputClass(fieldErrors.password)}
            />
            {fieldErrors.password && (
              <p id="password-error" className="mt-1 text-xs text-text-critical">
                {fieldErrors.password}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Spinner label="Signing in" className="text-on-accent" /> : null}
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-ink-muted">
          No account? Ask an administrator to create one.
        </p>
      </div>
    </div>
  );
}
