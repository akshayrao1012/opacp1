/**
 * R-RBAC-1..6 — permission model, risk tiers, roles, elevation.
 *
 * Permissions are `resource.action` strings. Roles are named bundles.
 * A session holds roles + optional reseller scope (R-RBAC-4) + time-boxed
 * elevation grants for T3 permissions (R-RBAC-5).
 */

export type Tier = 'T0' | 'T1' | 'T2' | 'T3'

export const TIERS: Record<Tier, { label: string; description: string; controls: string[] }> = {
  T0: {
    label: 'Read',
    description: 'Read-only access to a resource.',
    controls: ['Permission check', 'Access logged'],
  },
  T1: {
    label: 'Routine write',
    description: 'Low-risk create or edit, e.g. a promocode or a setting value.',
    controls: ['Permission check', 'Audit entry'],
  },
  T2: {
    label: 'Sensitive write',
    description: 'Affects money, resellers, pricing or a compliance decision.',
    controls: ['Permission check', 'Mandatory reason', 'Ticket reference', 'Audit entry'],
  },
  T3: {
    label: 'Destructive / irreversible',
    description: 'Deletes or anonymises data, or acts on unbounded sets of records.',
    controls: [
      'All T2 controls',
      'Mandatory dry run',
      'Typed confirmation',
      'Second-approver sign-off',
      'Time-boxed elevation',
    ],
  },
}

/** Every permission in the product, grouped for the role editor. */
export const PERMISSION_CATALOG: { group: string; permissions: { id: string; label: string; tier: Tier }[] }[] = [
  {
    group: 'Resellers',
    permissions: [
      { id: 'reseller.read', label: 'View resellers and reseller detail', tier: 'T0' },
      { id: 'reseller.write', label: 'Edit reseller records', tier: 'T1' },
      { id: 'reseller.approve', label: 'Approve or reject new resellers', tier: 'T2' },
      { id: 'reseller.delete', label: 'Delete resellers (GDPR erasure)', tier: 'T3' },
      { id: 'reseller.notification.read', label: 'View notification settings', tier: 'T0' },
      { id: 'reseller.notification.write', label: 'Edit notification settings', tier: 'T2' },
      { id: 'reseller.provider.read', label: 'View provider mappings', tier: 'T0' },
      { id: 'reseller.provider.write', label: 'Edit provider credentials', tier: 'T2' },
      { id: 'reseller.membership.read', label: 'View membership subscriptions', tier: 'T0' },
      { id: 'reseller.membership.write', label: 'Change memberships', tier: 'T2' },
      { id: 'reseller.statistics.read', label: 'View reseller statistics', tier: 'T0' },
    ],
  },
  {
    group: 'Customers',
    permissions: [
      { id: 'customer.contact.read', label: 'View contact validation', tier: 'T0' },
      { id: 'customer.contact.decide', label: 'Lock / approve / unlock contacts', tier: 'T2' },
      { id: 'customer.kyc.read', label: 'View identity verification queue', tier: 'T0' },
      { id: 'customer.kyc.decide', label: 'Approve or fail KYC/KYB cases', tier: 'T2' },
    ],
  },
  {
    group: 'Domains',
    permissions: [
      { id: 'domain.read', label: 'View domains and domain detail', tier: 'T0' },
      { id: 'domain.write', label: 'Edit domain records', tier: 'T1' },
      { id: 'domain.epp.read', label: 'Run EPP domain info lookups', tier: 'T0' },
      { id: 'domain.transfer.read', label: 'View transfers', tier: 'T0' },
      { id: 'domain.transfer.write', label: 'Act on transfers', tier: 'T2' },
      { id: 'domain.create_in_db', label: 'Create domains in database', tier: 'T2' },
      { id: 'domain.notification.read', label: 'View domain notifications', tier: 'T0' },
      { id: 'domain.bulk.lookup', label: 'Bulk domain lookup', tier: 'T1' },
      { id: 'domain.bulk.sync', label: 'Bulk sync domain dates', tier: 'T2' },
      { id: 'domain.bulk.delete', label: 'Bulk delete domains from database', tier: 'T3' },
      { id: 'domain.bulk.suspend', label: 'Bulk suspend / clientHold domains', tier: 'T3' },
      { id: 'domain.bulk.internal_transfer', label: 'Bulk internal transfer', tier: 'T3' },
    ],
  },
  {
    group: 'Products',
    permissions: [
      { id: 'product.ssl.read', label: 'View SSL orders', tier: 'T0' },
      { id: 'product.ssl.admin', label: 'Reset Comodo password', tier: 'T2' },
      { id: 'product.spamexperts.read', label: 'View SpamExperts', tier: 'T0' },
      { id: 'product.spamexperts.write', label: 'Edit SpamExperts configuration', tier: 'T1' },
      { id: 'product.license.read', label: 'View licenses', tier: 'T0' },
      { id: 'product.license.write', label: 'Edit licenses', tier: 'T1' },
      { id: 'product.license.migrate', label: 'Migrate license keys in bulk', tier: 'T3' },
      { id: 'product.dns.read', label: 'View DNS zones', tier: 'T0' },
      { id: 'product.dns.write', label: 'Edit DNS zones', tier: 'T1' },
      { id: 'product.dns.bulk.delete', label: 'Bulk delete DNS zones', tier: 'T3' },
      { id: 'product.virtual.read', label: 'View virtual products', tier: 'T0' },
      { id: 'product.virtual.write', label: 'Edit virtual products', tier: 'T1' },
      { id: 'product.trademark.read', label: 'View trademarks', tier: 'T0' },
      { id: 'product.trademark.write', label: 'Edit trademarks', tier: 'T1' },
    ],
  },
  {
    group: 'Finance',
    permissions: [
      { id: 'payment.read', label: 'View payments', tier: 'T0' },
      { id: 'payment.create', label: 'Record a payment against a reseller balance', tier: 'T2' },
      { id: 'payment.create.approve', label: 'Approve a recorded payment above threshold', tier: 'T3' },
      { id: 'payment.refund.create', label: 'Request a refund', tier: 'T2' },
      { id: 'payment.refund.approve', label: 'Approve a refund above threshold', tier: 'T3' },
      { id: 'finance.invoice.read', label: 'View invoices', tier: 'T0' },
      { id: 'finance.invoice.settle', label: 'Complete or cancel open invoice lines', tier: 'T2' },
    ],
  },
  {
    group: 'Catalog',
    permissions: [
      { id: 'catalog.extension.read', label: 'View extensions (TLDs)', tier: 'T0' },
      { id: 'catalog.extension.write', label: 'Create or edit extensions', tier: 'T2' },
      { id: 'catalog.promotion.read', label: 'View promotions', tier: 'T0' },
      { id: 'catalog.promotion.write', label: 'Create or edit promotions', tier: 'T2' },
      { id: 'catalog.promocode.read', label: 'View promocodes', tier: 'T0' },
      { id: 'catalog.promocode.write', label: 'Create or edit promocodes', tier: 'T1' },
      { id: 'catalog.provider.read', label: 'View registry providers', tier: 'T0' },
      { id: 'catalog.provider.write', label: 'Edit registry providers', tier: 'T2' },
    ],
  },
  {
    group: 'Platform Ops',
    permissions: [
      { id: 'ops.task.read', label: 'View task manager', tier: 'T0' },
      { id: 'ops.task.write', label: 'Retry or cancel tasks', tier: 'T1' },
      { id: 'ops.task.purge', label: 'Purge outdated tasks', tier: 'T3' },
      { id: 'ops.mail.read', label: 'View mail log', tier: 'T0' },
      { id: 'ops.settings.read', label: 'View custom settings', tier: 'T0' },
      { id: 'ops.settings.write', label: 'Change custom settings', tier: 'T2' },
      { id: 'ops.ratelimit.read', label: 'View rate limits', tier: 'T0' },
      { id: 'ops.ratelimit.write', label: 'Change rate limits', tier: 'T2' },
      { id: 'ops.bulk.console', label: 'Open the bulk operations console', tier: 'T0' },
    ],
  },
  {
    group: 'Risk & Abuse',
    permissions: [
      { id: 'risk.bruteforce.read', label: 'View bruteforce attempts and protection', tier: 'T0' },
      { id: 'risk.bruteforce.write', label: 'Change bruteforce thresholds and activation', tier: 'T2' },
      { id: 'risk.bruteforce.unblock', label: 'Unblock an IP or account', tier: 'T2' },
      { id: 'risk.blacklist.read', label: 'View the IP blacklist', tier: 'T0' },
      { id: 'risk.blacklist.write', label: 'Add or remove blacklist entries', tier: 'T2' },
      { id: 'risk.keywords.read', label: 'View banned keywords', tier: 'T0' },
      { id: 'risk.keywords.write', label: 'Add or edit banned keywords', tier: 'T2' },
      { id: 'risk.batch.read', label: 'View stuck batches', tier: 'T0' },
      { id: 'risk.batch.repair', label: 'Split, replay or resume a stuck batch', tier: 'T2' },
      { id: 'risk.batch.abandon', label: 'Abandon a batch and discard its remaining rows', tier: 'T3' },
    ],
  },
  {
    group: 'Reports',
    permissions: [
      { id: 'reports.read', label: 'View operational reports', tier: 'T0' },
      { id: 'reports.sales.read', label: 'View the sales dashboard', tier: 'T0' },
      { id: 'reports.finance.read', label: 'View debt and balance reports', tier: 'T0' },
    ],
  },
  {
    group: 'System',
    permissions: [
      { id: 'system.query.read', label: 'Open the query runner', tier: 'T0' },
      { id: 'system.query.run', label: 'Run an approved query', tier: 'T1' },
      { id: 'system.query.export', label: 'Export query results', tier: 'T2' },
    ],
  },
  {
    group: 'Admin & Governance',
    permissions: [
      { id: 'admin.user.read', label: 'View users and role assignments', tier: 'T0' },
      { id: 'admin.user.write', label: 'Assign roles to users', tier: 'T2' },
      { id: 'admin.role.write', label: 'Create and edit roles', tier: 'T2' },
      { id: 'admin.audit.read', label: 'Read the global audit log', tier: 'T0' },
      { id: 'admin.job.read', label: 'View the job centre', tier: 'T0' },
      { id: 'admin.job.cancel', label: 'Cancel running jobs', tier: 'T1' },
      { id: 'admin.elevation.grant', label: 'Grant elevation to others', tier: 'T2' },
      { id: 'export.run', label: 'Export table data', tier: 'T1' },
    ],
  },
]

export const ALL_PERMISSIONS: string[] = PERMISSION_CATALOG.flatMap((g) => g.permissions.map((p) => p.id))

export const PERMISSION_META: Record<string, { label: string; tier: Tier; group: string }> = Object.fromEntries(
  PERMISSION_CATALOG.flatMap((g) =>
    g.permissions.map((p) => [p.id, { label: p.label, tier: p.tier, group: g.group }] as const),
  ),
)

/** Permissions that may never be held permanently — R-RBAC-5. */
export const ELEVATION_REQUIRED: string[] = ALL_PERMISSIONS.filter((p) => PERMISSION_META[p].tier === 'T3')

export type RoleId =
  | 'support_l1'
  | 'support_l2'
  | 'finance'
  | 'finance_approver'
  | 'commercial'
  | 'abuse_compliance'
  | 'tech_ops'
  | 'sales'
  | 'auditor'
  | 'super_admin'

export interface Role {
  id: string
  name: string
  description: string
  /** Short persona label, from PRD section 5. */
  jobs: string
  permissions: string[]
  system?: boolean
}

const READ_ONLY_ALL = ALL_PERMISSIONS.filter((p) => PERMISSION_META[p].tier === 'T0')

export const DEFAULT_ROLES: Role[] = [
  {
    id: 'support_l1',
    name: 'Support Agent (L1)',
    description: 'Look up a reseller, domain or payment; explain what happened; escalate.',
    jobs: 'Lookup and explain',
    permissions: [
      'reports.read', 'risk.bruteforce.read',
      'reseller.read', 'reseller.statistics.read', 'reseller.membership.read',
      'domain.read', 'domain.epp.read', 'domain.transfer.read', 'domain.notification.read',
      'customer.contact.read', 'customer.kyc.read',
      'payment.read', 'ops.mail.read', 'product.license.read', 'product.dns.read',
      'product.ssl.read', 'product.spamexperts.read', 'catalog.extension.read',
      'catalog.promocode.read', 'export.run',
    ],
  },
  {
    id: 'support_l2',
    name: 'Support Lead (L2)',
    description: 'Fix what L1 escalates; small corrective actions.',
    jobs: 'Corrective actions',
    permissions: [
      'reports.read', 'risk.bruteforce.read', 'risk.blacklist.read', 'risk.batch.read',
      'reseller.read', 'reseller.write', 'reseller.membership.read', 'reseller.statistics.read',
      'domain.read', 'domain.write', 'domain.epp.read', 'domain.transfer.read', 'domain.transfer.write',
      'domain.create_in_db', 'domain.notification.read', 'domain.bulk.lookup',
      'domain.bulk.internal_transfer',
      'product.dns.read', 'product.dns.write', 'product.license.read', 'product.ssl.read',
      'product.spamexperts.read', 'customer.contact.read', 'customer.kyc.read',
      'payment.read', 'ops.mail.read', 'ops.task.read', 'ops.bulk.console',
      'catalog.extension.read', 'catalog.promocode.read', 'export.run', 'admin.job.read',
    ],
  },
  {
    id: 'finance',
    name: 'Finance',
    description: 'Reconcile, invoice and refund.',
    jobs: 'Reconcile and refund',
    permissions: [
      'reports.read', 'reports.finance.read',
      'payment.read', 'payment.create', 'payment.refund.create', 'finance.invoice.read', 'finance.invoice.settle',
      'reseller.read', 'reseller.membership.read', 'domain.read', 'export.run', 'admin.job.read',
    ],
  },
  {
    id: 'finance_approver',
    name: 'Finance Approver',
    description: 'Approve refunds and credit adjustments above threshold.',
    jobs: 'Approve refunds',
    permissions: [
      'reports.read', 'reports.finance.read',
      'payment.read', 'payment.create', 'payment.create.approve', 'payment.refund.create', 'payment.refund.approve',
      'finance.invoice.read', 'reseller.read', 'export.run',
      'admin.audit.read', 'admin.job.read',
    ],
  },
  {
    id: 'commercial',
    name: 'Commercial / Marketing',
    description: 'Pricing, promotions and campaign codes.',
    jobs: 'Pricing and promotions',
    permissions: [
      'reports.read', 'reports.sales.read',
      'catalog.extension.read', 'catalog.extension.write', 'catalog.promotion.read',
      'catalog.promotion.write', 'catalog.promocode.read', 'catalog.promocode.write',
      'catalog.provider.read', 'reseller.read', 'reseller.membership.read',
      'reseller.statistics.read', 'product.virtual.read', 'product.virtual.write',
      'export.run', 'admin.job.read',
    ],
  },
  {
    id: 'abuse_compliance',
    name: 'Abuse & Compliance',
    description: 'Enforce takedowns, process KYC/KYB, validate contacts.',
    jobs: 'Enforcement and compliance',
    permissions: [
      'risk.bruteforce.read', 'risk.bruteforce.write', 'risk.bruteforce.unblock',
      'risk.blacklist.read', 'risk.blacklist.write', 'risk.keywords.read', 'risk.keywords.write',
      'reports.read',
      'domain.read', 'domain.epp.read', 'domain.bulk.lookup', 'domain.bulk.suspend',
      'customer.kyc.read', 'customer.kyc.decide', 'customer.contact.read', 'customer.contact.decide',
      'reseller.read', 'ops.mail.read', 'ops.bulk.console', 'export.run',
      'admin.audit.read', 'admin.job.read',
    ],
  },
  {
    id: 'tech_ops',
    name: 'Technical Operations',
    description: 'Queue health, errors, integrations and bulk data operations.',
    jobs: 'Platform operations',
    permissions: [
      'risk.bruteforce.read', 'risk.bruteforce.write', 'risk.bruteforce.unblock',
      'risk.blacklist.read', 'risk.blacklist.write', 'risk.batch.read', 'risk.batch.repair',
      'risk.batch.abandon', 'system.query.read', 'system.query.run', 'reports.read',
      'ops.task.read', 'ops.task.write', 'ops.task.purge', 'ops.mail.read',
      'ops.settings.read', 'ops.settings.write', 'ops.ratelimit.read', 'ops.ratelimit.write',
      'ops.bulk.console', 'domain.read', 'domain.write', 'domain.bulk.lookup', 'domain.bulk.sync',
      'domain.bulk.delete', 'domain.create_in_db', 'domain.transfer.read',
      'product.dns.read', 'product.dns.write', 'product.dns.bulk.delete',
      'product.license.read', 'product.license.write', 'product.license.migrate',
      'product.spamexperts.read', 'product.spamexperts.write', 'product.ssl.read',
      'catalog.provider.read', 'reseller.read', 'reseller.provider.read',
      'export.run', 'admin.job.read', 'admin.job.cancel', 'admin.audit.read',
    ],
  },
  {
    id: 'sales',
    name: 'Sales / Account Management',
    description: 'Reseller health, memberships and revenue segmentation.',
    jobs: 'Account management',
    permissions: [
      'reports.read', 'reports.sales.read', 'reports.finance.read',
      'reseller.read', 'reseller.write', 'reseller.approve', 'reseller.statistics.read',
      'reseller.membership.read', 'reseller.membership.write', 'reseller.notification.read',
      'domain.read', 'payment.read', 'catalog.promocode.read', 'catalog.promotion.read',
      'export.run', 'admin.job.read',
    ],
  },
  {
    id: 'auditor',
    name: 'Auditor (read-only)',
    description: 'Review activity without the ability to change anything.',
    jobs: 'Review and attest',
    permissions: [...READ_ONLY_ALL, 'admin.audit.read', 'export.run'],
  },
  {
    id: 'super_admin',
    name: 'Super Admin',
    description: 'Manage roles and permissions; run Tier 3 operations under elevation.',
    jobs: 'Governance',
    permissions: [...ALL_PERMISSIONS],
    system: true,
  },
]

export interface ResellerScope {
  /** null = unscoped (all resellers). Otherwise a whitelist of reseller ids. */
  resellerIds: number[] | null
  label: string
}

export interface Elevation {
  permission: string
  grantedAt: number
  expiresAt: number
  reason: string
  ticket: string
}

export interface AdminUser {
  id: string
  name: string
  email: string
  roles: string[]
  scope: ResellerScope
  idpGroups: string[]
  lastSeen: string
  status: 'active' | 'suspended'
}

/** Union of the permissions granted by a set of roles. */
export function unionPermissions(roleIds: string[], allRoles: Role[]): Set<string> {
  const out = new Set<string>()
  for (const rid of roleIds) {
    const role = allRoles.find((r) => r.id === rid)
    if (!role) continue
    for (const p of role.permissions) out.add(p)
  }
  return out
}

export function isElevationRequired(permission: string): boolean {
  return PERMISSION_META[permission]?.tier === 'T3'
}

export function tierOf(permission: string): Tier {
  return PERMISSION_META[permission]?.tier ?? 'T0'
}

export const ELEVATION_WINDOW_MINUTES = 60
export const REFUND_APPROVAL_THRESHOLD = 500

/**
 * Recording a payment credits a reseller balance without money necessarily
 * having arrived, so it carries the same shape of risk as a refund: above this
 * amount it becomes T3 and needs a second approver before the credit applies.
 */
export const PAYMENT_APPROVAL_THRESHOLD = 10_000
