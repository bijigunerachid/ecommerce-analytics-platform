import {
  Boxes,
  FileChartColumn,
  Lightbulb,
  LayoutDashboard,
  Package,
  ReceiptText,
  ScrollText,
  Tags,
  UserCog,
  Users,
} from 'lucide-react';

/**
 * The app's sections, in sidebar order. The sidebar, breadcrumbs, command palette, and
 * keyboard shortcuts ("g" then `key`) all read this list, so they never disagree.
 */
export const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, key: 'd' },
      { to: '/insights', label: 'Insights', icon: Lightbulb, key: 'n' },
      { to: '/reports', label: 'Reports', icon: FileChartColumn, key: 'r' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { to: '/orders', label: 'Orders', icon: ReceiptText, key: 'o' },
      { to: '/customers', label: 'Customers', icon: Users, key: 'c' },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { to: '/products', label: 'Products', icon: Package, key: 'p' },
      { to: '/categories', label: 'Categories', icon: Tags, key: 't' },
      { to: '/inventory', label: 'Inventory', icon: Boxes, key: 'i' },
    ],
  },
  {
    label: 'Administration',
    adminOnly: true,
    items: [
      { to: '/users', label: 'Users', icon: UserCog, key: 'u', adminOnly: true },
      { to: '/audit-log', label: 'Audit log', icon: ScrollText, key: 'l', adminOnly: true },
    ],
  },
];

/** Groups and items the user may see (admin-only entries are hidden from analysts). */
export function visibleNavGroups(role) {
  return NAV_GROUPS.filter((g) => !g.adminOnly || role === 'admin')
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || role === 'admin') }))
    .filter((g) => g.items.length > 0);
}

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));

/**
 * Breadcrumb trail for a path: [{ label, to? }]. The last crumb is the current page and has
 * no link.
 */
export function breadcrumbsFor(pathname) {
  if (pathname === '/') return [{ label: 'Dashboard' }];
  if (pathname === '/account') return [{ label: 'Account' }];
  const [first, second] = pathname.split('/').filter(Boolean);
  const section = NAV_ITEMS.find((i) => i.to === `/${first}`);
  if (!section) return [{ label: 'Not found' }];
  const trail = [{ label: section.group }];
  if (!second) return [...trail, { label: section.label }];
  const singular = section.label.replace(/s$/, '');
  const leaf = second === 'new' ? `New ${singular.toLowerCase()}` : `${singular} #${second}`;
  return [...trail, { label: section.label, to: section.to }, { label: leaf }];
}
