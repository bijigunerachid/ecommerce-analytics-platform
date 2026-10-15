import {
  ChartNoAxesCombined,
  ChevronRight,
  ChevronsUpDown,
  CircleHelp,
  Keyboard,
  LogOut,
  Menu as MenuIcon,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.js';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Button, IconButton } from '../components/ui/Button.jsx';
import { Kbd } from '../components/ui/Kbd.jsx';
import { modKeyLabel } from '../utils/platform.js';
import { Menu } from '../components/ui/Menu.jsx';
import { Tooltip } from '../components/ui/Tooltip.jsx';
import { CommandPalette } from '../features/command/CommandPalette.jsx';
import { ShortcutsDialog } from '../features/command/ShortcutsDialog.jsx';
import { useGlobalShortcuts } from '../features/command/useGlobalShortcuts.js';
import { NotificationBell } from '../features/notifications/NotificationBell.jsx';
import { PipelineStatus } from '../features/shell/PipelineStatus.jsx';
import { useTheme } from '../theme/ThemeContext.js';
import { breadcrumbsFor, visibleNavGroups } from './navigation.js';

const COLLAPSED_KEY = 'sidebar-collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function Brand({ collapsed = false }) {
  return (
    <Link
      to="/"
      className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-surface-hover"
      aria-label="Commerce Analytics, go to dashboard"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-accent-fill to-accent-strong text-on-accent shadow-raised">
        <ChartNoAxesCombined aria-hidden="true" className="size-4" />
      </span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13px] font-semibold text-ink">
            Commerce Analytics
          </span>
          <span className="block text-[11px] text-ink-muted">Operations & insights</span>
        </span>
      )}
    </Link>
  );
}

function Navigation({ collapsed, onNavigate }) {
  const { user } = useAuth();
  return (
    <nav aria-label="Main" className="space-y-4">
      {visibleNavGroups(user?.role).map((group) => (
        <div key={group.label}>
          {collapsed ? (
            <div aria-hidden="true" className="mx-3 mb-2 h-px bg-line first:hidden" />
          ) : (
            <p className="mb-1 px-2.5 text-[11px] font-medium text-ink-muted">{group.label}</p>
          )}
          <ul className="space-y-0.5">
            {group.items.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <Tooltip content={collapsed ? label : null} side="right" className="flex">
                  <NavLink
                    to={to}
                    end={end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `group relative flex h-8 w-full items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors ${
                        collapsed ? 'justify-center px-2' : 'px-2.5'
                      } ${
                        isActive
                          ? 'bg-surface-raised text-ink shadow-card ring-1 ring-line'
                          : 'text-ink-secondary hover:bg-surface-hover hover:text-ink'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          aria-hidden="true"
                          className={`size-4 shrink-0 ${isActive ? 'text-accent' : ''}`}
                        />
                        <span className={collapsed ? 'sr-only' : 'truncate'}>{label}</span>
                      </>
                    )}
                  </NavLink>
                </Tooltip>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarContent({ collapsed = false, onNavigate, onToggleCollapsed }) {
  return (
    <div className="flex h-full flex-col">
      <div className={`flex h-14 items-center ${collapsed ? 'justify-center px-2' : 'px-3'}`}>
        <Brand collapsed={collapsed} />
      </div>
      <div className={`flex-1 overflow-y-auto py-3 ${collapsed ? 'px-2' : 'px-2.5'}`}>
        <Navigation collapsed={collapsed} onNavigate={onNavigate} />
      </div>
      <div className={`space-y-2 border-t border-line p-3 ${collapsed ? 'px-2' : ''}`}>
        <PipelineStatus collapsed={collapsed} />
        {onToggleCollapsed && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`w-full text-ink-muted ${collapsed ? 'justify-center px-0' : 'justify-start'}`}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" className="size-4" />
            ) : (
              <>
                <PanelLeftClose aria-hidden="true" className="size-4" /> Collapse
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function Breadcrumbs() {
  const { pathname } = useLocation();
  const crumbs = breadcrumbsFor(pathname);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li
              key={i}
              className={`flex min-w-0 items-center gap-1.5 ${last ? '' : 'hidden sm:flex'}`}
            >
              {crumb.to ? (
                <Link to={crumb.to} className="truncate text-ink-muted hover:text-ink">
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={`truncate ${last ? 'font-medium text-ink' : 'text-ink-muted'}`}
                >
                  {crumb.label}
                </span>
              )}
              {!last && (
                <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-ink-muted" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor };

function UserMenu({ onOpenHelp }) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  async function signOut() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <Menu
      label="Account"
      header={
        <div className="flex items-center gap-3 border-b border-line px-2.5 pt-2 pb-3 mb-1">
          <Avatar name={user.fullName} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{user.fullName}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
            <span className="mt-1 inline-flex rounded-full bg-accent-soft/60 px-2 py-0.5 text-[11px] font-medium text-ink capitalize dark:bg-accent-soft">
              {user.role}
            </span>
          </div>
        </div>
      }
      items={[
        { label: 'Account settings', icon: UserRound, onSelect: () => navigate('/account') },
        { type: 'separator' },
        { type: 'label', label: 'Theme' },
        ...['light', 'dark', 'system'].map((value) => ({
          label: value === 'system' ? 'System' : value === 'light' ? 'Light' : 'Dark',
          icon: THEME_ICONS[value],
          checked: theme === value,
          onSelect: () => setTheme(value),
        })),
        { type: 'separator' },
        { label: 'Keyboard shortcuts', icon: Keyboard, onSelect: onOpenHelp },
        { type: 'separator' },
        { label: 'Sign out', icon: LogOut, onSelect: signOut, danger: true },
      ]}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={`Account menu for ${user.fullName}`}
          className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-surface-sunken sm:rounded-lg"
        >
          <Avatar name={user.fullName} size="sm" />
          <span className="hidden text-left leading-tight md:block">
            <span className="block max-w-36 truncate text-sm font-medium text-ink">
              {user.fullName}
            </span>
            <span className="block text-[11px] text-ink-muted capitalize">{user.role}</span>
          </span>
          <ChevronsUpDown aria-hidden="true" className="hidden size-3.5 text-ink-muted md:block" />
        </button>
      )}
    />
  );
}

function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  const Icon = resolved === 'dark' ? Sun : Moon;
  return (
    <IconButton
      label={`Switch to ${next} theme`}
      icon={Icon}
      onClick={() => setTheme(next)}
      tooltipSide="bottom"
    />
  );
}

function TopBar({ onOpenMenu, onOpenPalette, onOpenHelp }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-page/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-page/70 sm:gap-3 sm:px-6 lg:px-8 print:hidden">
      <IconButton
        label="Open menu"
        icon={MenuIcon}
        onClick={onOpenMenu}
        tooltipSide="bottom"
        className="-ml-1 lg:hidden"
      />
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>
      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="Search"
        aria-keyshortcuts="Control+K Meta+K"
        className="flex h-8 items-center gap-2 rounded-lg border border-line bg-surface-raised px-2.5 text-[13px] text-ink-muted shadow-card transition-colors hover:border-line-strong hover:text-ink-secondary sm:w-60"
      >
        <Search aria-hidden="true" className="size-4" />
        <span className="hidden flex-1 text-left sm:inline">Search…</span>
        <span className="hidden items-center gap-0.5 sm:flex">
          <Kbd>{modKeyLabel()}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <div className="flex items-center gap-0.5">
        <NotificationBell />
        <ThemeToggle />
        <span className="hidden sm:inline-flex">
          <IconButton
            label="Keyboard shortcuts (?)"
            icon={CircleHelp}
            onClick={onOpenHelp}
            tooltipSide="bottom"
          />
        </span>
      </div>
      <div aria-hidden="true" className="hidden h-6 w-px bg-line sm:block" />
      <UserMenu onOpenHelp={onOpenHelp} />
    </header>
  );
}

/**
 * App shell: grouped sidebar (collapsible to icons on large screens, a drawer on small ones),
 * a top bar with breadcrumbs, search, and the account menu, plus the command palette and
 * keyboard shortcuts.
 */
export function AppLayout() {
  const location = useLocation();
  const { user } = useAuth();
  // The drawer belongs to the page it was opened on: navigating anywhere closes it.
  const [drawerPath, setDrawerPath] = useState(null);
  const drawerOpen = drawerPath === location.pathname;
  const setDrawerOpen = (open) => setDrawerPath(open ? location.pathname : null);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const navItems = useMemo(
    () => visibleNavGroups(user?.role).flatMap((g) => g.items),
    [user?.role],
  );
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  useGlobalShortcuts({ items: navItems, onOpenPalette: openPalette, onOpenHelp: openHelp });

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1');
      } catch {
        // Not remembering the choice is fine.
      }
      return !c;
    });
  }

  // Close the drawer with Escape.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawerPath(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const sidebarWidth = collapsed ? 'lg:w-[72px]' : 'lg:w-64';
  const contentOffset = collapsed ? 'lg:pl-[72px]' : 'lg:pl-64';

  return (
    <div className="min-h-dvh bg-page">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface-raised focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <aside
        aria-label="Sidebar"
        className={`fixed inset-y-0 left-0 hidden border-r border-line bg-sidebar transition-[width] duration-200 lg:block print:hidden ${sidebarWidth}`}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div
            className="animate-fade-in absolute inset-0 bg-overlay"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="animate-drawer-in-left absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-sidebar shadow-pop">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3.5 right-3"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
            >
              <X aria-hidden="true" className="size-5" />
            </Button>
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className={`transition-[padding] duration-200 print:pl-0 ${contentOffset}`}>
        <TopBar
          onOpenMenu={() => setDrawerOpen(true)}
          onOpenPalette={openPalette}
          onOpenHelp={openHelp}
        />
        <main
          id="main"
          className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:max-w-none print:p-0"
        >
          <div key={location.pathname} className="animate-page-in">
            <Outlet />
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} items={navItems} />
    </div>
  );
}
