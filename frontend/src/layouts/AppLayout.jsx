import {
  ChartNoAxesCombined,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.js';
import { Button } from '../components/ui/Button.jsx';
import { SegmentedControl } from '../components/ui/SegmentedControl.jsx';
import { useTheme } from '../theme/ThemeContext.js';

const NAV_ITEMS = [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }];

function Brand() {
  return (
    <div className="flex items-center gap-2 px-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-on-accent">
        <ChartNoAxesCombined aria-hidden="true" className="size-4.5" />
      </span>
      <span className="text-sm font-semibold text-ink">Commerce Analytics</span>
    </div>
  );
}

function Navigation({ onNavigate }) {
  return (
    <nav aria-label="Main" className="space-y-1">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-accent-soft/60 text-ink dark:bg-accent-soft'
                : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink'
            }`
          }
        >
          <Icon aria-hidden="true" className="size-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <SegmentedControl
      label="Color theme"
      value={theme}
      onChange={setTheme}
      options={[
        {
          value: 'light',
          ariaLabel: 'Light theme',
          label: <Sun aria-hidden="true" className="size-3.5" />,
        },
        {
          value: 'dark',
          ariaLabel: 'Dark theme',
          label: <Moon aria-hidden="true" className="size-3.5" />,
        },
        {
          value: 'system',
          ariaLabel: 'System theme',
          label: <Monitor aria-hidden="true" className="size-3.5" />,
        },
      ]}
    />
  );
}

function UserBox() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  async function signOut() {
    await logout();
    navigate('/login', { replace: true });
  }
  return (
    <div className="space-y-3 border-t border-line pt-3">
      <div className="px-2">
        <p className="truncate text-sm font-medium text-ink">{user.fullName}</p>
        <p className="truncate text-xs text-ink-muted">
          {user.email} · <span className="capitalize">{user.role}</span>
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 px-2">
        <span className="text-xs text-ink-muted">Theme</span>
        <ThemeSwitcher />
      </div>
      <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start">
        <LogOut aria-hidden="true" className="size-4" /> Sign out
      </Button>
    </div>
  );
}

function SidebarContent({ onNavigate }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Brand />
      <div className="flex-1">
        <Navigation onNavigate={onNavigate} />
      </div>
      <UserBox />
    </div>
  );
}

/** App shell: fixed sidebar on large screens, a slide-in drawer on small ones. */
export function AppLayout() {
  const location = useLocation();
  // The drawer belongs to the page it was opened on: navigating anywhere closes it.
  const [drawerPath, setDrawerPath] = useState(null);
  const drawerOpen = drawerPath === location.pathname;
  const setDrawerOpen = (open) => setDrawerPath(open ? location.pathname : null);

  // Close with Escape.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawerPath(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="min-h-dvh bg-page">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface-raised focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-surface lg:block">
        <SidebarContent />
      </aside>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-surface">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
            >
              <X aria-hidden="true" className="size-5" />
            </Button>
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu aria-hidden="true" className="size-5" />
          </Button>
          <Brand />
        </header>
        <main id="main" className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
