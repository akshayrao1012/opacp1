/**
 * R-IA-1..3 — the top-level groups replacing the single "Overviews" bucket.
 * Maximum depth is Group → Module → Tab; tabs live inside the module page, so
 * this tree is exactly two levels deep and a group whose every item is hidden
 * by permission disappears entirely.
 */

export interface NavItem {
  label: string
  to: string
  /** Any one of these permissions makes the item visible. */
  permissions: string[]
  /** Tabs inside the module, for orientation in the nav and the breadcrumb. */
  tabs?: string[]
  /** Primary actions the module hosts, shown as a hint in the nav tooltip. */
  actions?: string[]
  badge?: 'approvals' | 'kyc' | 'jobs' | 'abuse'
  description?: string
}

export interface NavGroup {
  id: string
  label: string
  icon: string
  /** Whole group is admin-only. */
  adminOnly?: boolean
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    id: 'home',
    label: 'Home',
    icon: 'Home',
    items: [
      {
        label: 'Dashboard',
        to: '/',
        permissions: [],
        description: 'Role-aware landing + global search (domain / reseller / order ID)',
      },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: 'Users',
    items: [
      {
        label: 'Resellers',
        to: '/customers/resellers',
        permissions: ['reseller.read'],
        tabs: ['Profile', 'Domains', 'Billing', 'Notifications', 'Settings'],
        description: 'List → detail',
      },
      { label: 'Contact Validation', to: '/customers/contact-validation', permissions: ['customer.contact.read'] },
      { label: 'Identity Verification', to: '/customers/identity-verification', permissions: ['customer.kyc.read'], badge: 'kyc', description: 'KYC / KYB' },
      {
        label: 'Membership Plans',
        to: '/customers/membership-plans',
        permissions: ['reseller.membership.read', 'ops.ratelimit.read'],
        tabs: ['Subscriptions', 'Rate Limits'],
      },
    ],
  },
  {
    id: 'domains',
    label: 'Domains',
    icon: 'Globe',
    items: [
      {
        label: 'All Domains',
        to: '/domains',
        permissions: ['domain.read'],
        actions: ['Create in DB', 'Internal Transfer', 'Bulk domain form'],
      },
      { label: 'Premium Domains', to: '/domains/premium', permissions: ['domain.read'] },
      {
        label: 'Transfers',
        to: '/domains/transfers',
        permissions: ['domain.transfer.read'],
        tabs: ['All third-party', 'Grouped by reseller'],
      },
      { label: 'Notifications', to: '/domains/notifications', permissions: ['domain.notification.read'] },
      { label: 'Trademark Manager', to: '/domains/trademarks', permissions: ['product.trademark.read'] },
      {
        label: 'Providers',
        to: '/domains/providers',
        permissions: ['catalog.provider.read', 'reseller.provider.read'],
        tabs: ['Providers', 'Reseller mapping'],
      },
    ],
  },
  {
    id: 'products',
    label: 'Products & Services',
    icon: 'Package',
    items: [
      { label: 'DNS Zones', to: '/products/dns-zones', permissions: ['product.dns.read'], actions: ['Bulk DNS form'] },
      { label: 'SSL', to: '/products/ssl', permissions: ['product.ssl.read'], tabs: ['Certificates', 'SSL Panel'] },
      { label: 'Licenses', to: '/products/licenses', permissions: ['product.license.read'], tabs: ['Licenses', 'Migrations'] },
      {
        label: 'SpamExperts',
        to: '/products/spamexperts',
        permissions: ['product.spamexperts.read'],
        tabs: ['Domains', 'Bundles', 'Configurations'],
      },
      { label: 'Extensions', to: '/products/extensions', permissions: ['catalog.extension.read'], actions: ['Create new'] },
      { label: 'Virtual Products', to: '/products/virtual-products', permissions: ['product.virtual.read'] },
    ],
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: 'CreditCard',
    items: [
      {
        label: 'Payments',
        to: '/billing/payments',
        permissions: ['payment.read'],
        tabs: ['Payments', 'Refunds'],
        badge: 'approvals',
      },
      { label: 'Invoices', to: '/billing/invoices', permissions: ['finance.invoice.read'] },
      { label: 'Promotions', to: '/billing/promotions', permissions: ['catalog.promotion.read'], tabs: ['Promotions', 'Multiyear'] },
      {
        label: 'Promocodes',
        to: '/billing/promocodes',
        permissions: ['catalog.promocode.read'],
        tabs: ['Manager', 'Fast Checkout'],
        actions: ['Generate'],
      },
      { label: 'Subscriptions', to: '/billing/subscriptions', permissions: ['reseller.membership.read'], description: 'Reseller WPP' },
    ],
  },
  {
    id: 'risk',
    label: 'Risk & Abuse',
    icon: 'ShieldAlert',
    items: [
      {
        label: 'Bruteforce',
        to: '/risk/bruteforce',
        permissions: ['risk.bruteforce.read'],
        tabs: ['Overview', 'Activation', 'Last-minute changes'],
      },
      { label: 'IP Blacklist', to: '/risk/ip-blacklist', permissions: ['risk.blacklist.read'] },
      { label: 'Banned Keywords', to: '/risk/banned-keywords', permissions: ['risk.keywords.read'] },
      { label: 'Bulk Abuse Form', to: '/risk/bulk-abuse', permissions: ['domain.bulk.suspend', 'ops.bulk.console'], badge: 'abuse' },
      { label: 'Batch Cracker', to: '/risk/batch-cracker', permissions: ['risk.batch.read'] },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: 'BarChart3',
    items: [
      { label: 'Support Dashboard', to: '/reports/support', permissions: ['reports.read'] },
      { label: 'Sales Dashboard', to: '/reports/sales', permissions: ['reports.sales.read'] },
      { label: 'Postpaid Customer Debt', to: '/reports/postpaid-debt', permissions: ['reports.finance.read'] },
      { label: 'Negative Available Balance', to: '/reports/negative-balance', permissions: ['reports.finance.read'] },
      { label: 'Domain Provider Statistics', to: '/reports/provider-statistics', permissions: ['reports.read'] },
      { label: 'EV Report', to: '/reports/ev', permissions: ['reports.read'] },
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: 'Settings',
    adminOnly: true,
    items: [
      { label: 'Task Manager', to: '/system/tasks', permissions: ['ops.task.read'], tabs: ['Tasks', 'Errors'] },
      { label: 'Mail', to: '/system/mail', permissions: ['ops.mail.read'], tabs: ['Delivery', 'Verification'] },
      { label: 'Custom Settings', to: '/system/custom-settings', permissions: ['ops.settings.read'], actions: ['Create new'] },
      { label: 'Query Runner', to: '/system/query-runner', permissions: ['system.query.read'] },
      {
        label: 'Roles & Permissions',
        to: '/system/roles',
        permissions: ['admin.user.read', 'admin.role.write'],
        tabs: ['Roles', 'Permissions', 'Users', 'Effective access'],
      },
      { label: 'Audit Log', to: '/system/audit', permissions: ['admin.audit.read'] },
      { label: 'Job Centre', to: '/system/jobs', permissions: ['admin.job.read'], badge: 'jobs' },
    ],
  },
]

/** Flat lookup for breadcrumbs. */
export const NAV_INDEX: Record<string, { group: NavGroup; item: NavItem }> = {}
for (const group of NAV) {
  for (const item of group.items) {
    NAV_INDEX[item.to] = { group, item }
  }
}

/** Prototype-only meta page, linked from the sidebar footer rather than a group. */
export const COVERAGE_ITEM: NavItem = {
  label: 'PRD coverage',
  to: '/coverage',
  permissions: [],
  description: 'How this prototype maps onto the PRD',
}
NAV_INDEX[COVERAGE_ITEM.to] = {
  group: { id: 'meta', label: 'Prototype', icon: 'Settings', items: [COVERAGE_ITEM] },
  item: COVERAGE_ITEM,
}

/** Routes that exist but are reached from a module rather than the nav. */
const SATELLITE_ROUTES: Record<string, { group: string; item: string; to: string }> = {
  '/domains/domain-info': { group: 'Domains', item: 'Domain info (EPP)', to: '/domains/domain-info' },
  '/domains/create-in-database': { group: 'Domains', item: 'Create in database', to: '/domains/create-in-database' },
  '/domains/bulk': { group: 'Domains', item: 'Bulk domain form', to: '/domains/bulk' },
  '/products/bulk-dns': { group: 'Products & Services', item: 'Bulk DNS form', to: '/products/bulk-dns' },
  '/system/bulk': { group: 'System', item: 'Bulk operations', to: '/system/bulk' },
}

export function crumbsFor(pathname: string): { label: string; to?: string }[] {
  const satellite = SATELLITE_ROUTES[pathname]
  if (satellite) return [{ label: satellite.group }, { label: satellite.item, to: satellite.to }]

  const exact = NAV_INDEX[pathname]
  if (exact) {
    return exact.group.id === 'home'
      ? [{ label: 'Home' }]
      : [{ label: exact.group.label }, { label: exact.item.label, to: exact.item.to }]
  }
  // Longest-prefix match, for detail routes.
  const keys = Object.keys(NAV_INDEX)
    .filter((k) => k !== '/' && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)
  if (keys.length) {
    const { group, item } = NAV_INDEX[keys[0]]
    const rest = pathname.slice(keys[0].length).split('/').filter(Boolean)
    return [{ label: group.label }, { label: item.label, to: item.to }, ...rest.map((r) => ({ label: decodeURIComponent(r) }))]
  }
  return [{ label: 'Openprovider ACP' }]
}
