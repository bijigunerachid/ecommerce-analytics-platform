import {
  Activity,
  ChartNoAxesCombined,
  CircleAlert,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  Zap,
} from 'lucide-react';
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

const HIGHLIGHTS = [
  {
    icon: Zap,
    title: 'Real-time analytics',
    text: 'Orders flow through Kafka and Spark Structured Streaming into live dashboards.',
  },
  {
    icon: Activity,
    title: 'Anomaly detection',
    text: 'Unusual orders, bursts, revenue spikes, and stock write-offs are flagged automatically.',
  },
  {
    icon: ShieldCheck,
    title: 'Consistent by design',
    text: 'Transactional orders and stock, exactly-once aggregates, role-based access.',
  },
];

/** Product introduction beside the form on large screens (descriptive only, no figures). */
function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-linear-to-br from-[#1e1b4b] via-[#312e81] to-[#4f46e5] p-12 text-white lg:flex lg:flex-col">
      <div
        aria-hidden="true"
        className="absolute -top-32 -right-32 size-96 rounded-full bg-white/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-40 -left-24 size-96 rounded-full bg-[#0f0c2e]/60 blur-3xl"
      />
      <div className="relative flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25">
          <ChartNoAxesCombined aria-hidden="true" className="size-5" />
        </span>
        <span className="font-semibold">Commerce Analytics</span>
      </div>
      <div className="relative my-auto max-w-md py-12">
        <p className="text-3xl leading-tight font-semibold tracking-tight">
          Run your store and understand it, in one place.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-white/80">
          Manage orders, products, customers, and inventory, and watch the business update as it
          happens.
        </p>
        <ul className="mt-10 space-y-6">
          {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="mt-0.5 block text-sm text-white/75">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="relative text-xs text-white/60">
        Kafka · Spark Structured Streaming · PostgreSQL · React
      </p>
    </aside>
  );
}

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    `block h-11 w-full rounded-lg border bg-surface-raised pr-3 pl-10 text-sm text-ink shadow-card transition-[border-color,box-shadow] placeholder:text-ink-muted focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none ${
      invalid ? 'border-status-critical' : 'border-line-strong'
    }`;

  return (
    <div className="grid min-h-dvh bg-page lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <BrandPanel />
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent-fill text-on-accent">
              <ChartNoAxesCombined aria-hidden="true" className="size-5" />
            </span>
            <span className="font-semibold text-ink">Commerce Analytics</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Welcome back. Use your staff account to continue.
          </p>

          <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-status-critical/40 bg-status-critical/10 px-3 py-2.5 text-sm text-ink"
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
              <div className="relative mt-1.5">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-ink-muted"
                />
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={update('email')}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                  className={inputClass(fieldErrors.email)}
                />
              </div>
              {fieldErrors.email && (
                <p id="email-error" className="mt-1.5 text-xs text-text-critical">
                  {fieldErrors.email}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="text-sm font-medium text-ink">
                Password
              </label>
              <div className="relative mt-1.5">
                <Lock
                  aria-hidden="true"
                  className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-ink-muted"
                />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={update('password')}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                  className={`${inputClass(fieldErrors.password)} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute top-1.5 right-1.5 flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink"
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" className="size-4" />
                  ) : (
                    <Eye aria-hidden="true" className="size-4" />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="mt-1.5 text-xs text-text-critical">
                  {fieldErrors.password}
                </p>
              )}
            </div>
            <Button type="submit" className="h-11 w-full" disabled={submitting}>
              {submitting ? <Spinner label="Signing in" className="text-on-accent" /> : null}
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-8 text-center text-xs text-ink-muted">
            No account? Ask an administrator to create one.
          </p>
        </div>
      </main>
    </div>
  );
}
