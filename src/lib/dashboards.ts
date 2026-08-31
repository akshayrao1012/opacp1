/**
 * Role-aware dashboard composition (PRD §6.2, Home: "role-aware dashboard").
 *
 * Hiding tiles by permission is not the same as a dashboard built for the job.
 * A Support agent opening the ACP wants their queue and a way to look things up;
 * Finance wants money waiting on a decision; Technical Operations wants the
 * queue and what is stuck. So each role declares the widgets it cares about,
 * and a user holding several roles gets the union, rendered in one fixed order
 * so the page is still predictable.
 *
 * Every widget is permission-checked as well — this list decides what is
 * *relevant*, never what is *allowed*.
 */

export type WidgetId =
  | 'focus'
  | 'my_queue_support'
  | 'transfers_attention'
  | 'onboarding_queue'
  | 'kyc_queue'
  | 'contact_validation_queue'
  | 'webhook_failures'
  | 'money_waiting'
  | 'invoice_health'
  | 'debt_and_balances'
  | 'approvals'
  | 'sales_summary'
  | 'top_resellers'
  | 'catalog_activity'
  | 'risk_summary'
  | 'abuse_enforcement'
  | 'queue_health'
  | 'stuck_batches'
  | 'platform_health'
  | 'running_jobs'
  | 'audit_t3'
  | 'elevations'
  | 'common_tasks'
  | 'my_activity'

/** Render order, applied after the union so multi-role users get a stable page. */
export const WIDGET_ORDER: WidgetId[] = [
  'focus',
  'my_queue_support',
  'money_waiting',
  'risk_summary',
  'queue_health',
  'sales_summary',
  'approvals',
  'kyc_queue',
  'contact_validation_queue',
  'transfers_attention',
  'onboarding_queue',
  'invoice_health',
  'debt_and_balances',
  'abuse_enforcement',
  'stuck_batches',
  'catalog_activity',
  'top_resellers',
  'webhook_failures',
  'platform_health',
  'running_jobs',
  'audit_t3',
  'elevations',
  'common_tasks',
  'my_activity',
]

export interface RoleDashboard {
  /** One line describing what this role opens the ACP to do. */
  focus: string
  widgets: WidgetId[]
}

export const ROLE_DASHBOARDS: Record<string, RoleDashboard> = {
  support_l1: {
    focus: 'Look something up, explain what happened, escalate what you cannot fix.',
    widgets: [
      'focus', 'my_queue_support', 'transfers_attention', 'kyc_queue', 'webhook_failures',
      'common_tasks', 'my_activity',
    ],
  },
  support_l2: {
    focus: 'Fix what L1 escalates — transfers, DNS, corrective actions.',
    widgets: [
      'focus', 'my_queue_support', 'transfers_attention', 'queue_health', 'stuck_batches',
      'running_jobs', 'common_tasks', 'my_activity',
    ],
  },
  finance: {
    focus: 'Reconcile what came in, chase what has not, refund what should go back.',
    widgets: [
      'focus', 'money_waiting', 'invoice_health', 'debt_and_balances', 'running_jobs',
      'common_tasks', 'my_activity',
    ],
  },
  finance_approver: {
    focus: 'Decide on the money that is waiting for a second pair of eyes.',
    widgets: [
      'focus', 'approvals', 'money_waiting', 'invoice_health', 'debt_and_balances',
      'audit_t3', 'common_tasks', 'my_activity',
    ],
  },
  commercial: {
    focus: 'Pricing, promotions and campaign codes — and whether they are landing.',
    widgets: ['focus', 'catalog_activity', 'sales_summary', 'top_resellers', 'common_tasks', 'my_activity'],
  },
  abuse_compliance: {
    focus: 'Work the compliance queues and enforce against what is confirmed abusive.',
    widgets: [
      'focus', 'kyc_queue', 'contact_validation_queue', 'risk_summary', 'abuse_enforcement',
      'common_tasks', 'my_activity',
    ],
  },
  tech_ops: {
    focus: 'Keep the queue moving and the integrations healthy.',
    widgets: [
      'focus', 'queue_health', 'stuck_batches', 'platform_health', 'risk_summary',
      'running_jobs', 'common_tasks', 'my_activity',
    ],
  },
  sales: {
    focus: 'Grow the book: onboarding, memberships, and accounts at risk.',
    widgets: [
      'focus', 'sales_summary', 'top_resellers', 'onboarding_queue', 'debt_and_balances',
      'common_tasks', 'my_activity',
    ],
  },
  auditor: {
    focus: 'Review what was done, by whom, under which role — and change nothing.',
    widgets: ['focus', 'audit_t3', 'elevations', 'approvals', 'platform_health', 'common_tasks', 'my_activity'],
  },
  super_admin: {
    focus: 'Everything, which is why the tiers and the audit log exist.',
    widgets: [
      'focus', 'approvals', 'money_waiting', 'risk_summary', 'queue_health', 'kyc_queue',
      'sales_summary', 'platform_health', 'running_jobs', 'audit_t3', 'elevations', 'common_tasks',
      'my_activity',
    ],
  },
}

const FALLBACK: RoleDashboard = {
  focus: 'No role grants you a dashboard yet — ask a Super Admin for access.',
  widgets: ['focus', 'my_activity'],
}

/** Union of the widgets for a set of roles, in the canonical order. */
export function widgetsFor(roleIds: string[]): WidgetId[] {
  const wanted = new Set<WidgetId>()
  for (const id of roleIds) {
    for (const w of (ROLE_DASHBOARDS[id] ?? FALLBACK).widgets) wanted.add(w)
  }
  if (wanted.size === 0) for (const w of FALLBACK.widgets) wanted.add(w)
  return WIDGET_ORDER.filter((w) => wanted.has(w))
}

/** The focus lines for the roles a user holds. */
export function focusFor(roleIds: string[]): string[] {
  const lines = roleIds.map((id) => ROLE_DASHBOARDS[id]?.focus).filter(Boolean) as string[]
  return lines.length ? lines : [FALLBACK.focus]
}

/** Per-role shortcuts, so the dashboard is a starting point and not just numbers. */
export const ROLE_TASKS: Record<string, { label: string; to: string; hint: string }[]> = {
  support_l1: [
    { label: 'Look up a domain', to: '/domains/domain-info', hint: 'EPP info straight from the registry' },
    { label: 'Find a reseller', to: '/customers/resellers', hint: 'Or use the quick-jump bar above' },
    { label: 'Check the mail log', to: '/system/mail', hint: 'Did the customer get the email?' },
    { label: 'Payments', to: '/billing/payments', hint: 'What was charged and when' },
  ],
  support_l2: [
    { label: 'Transfers needing action', to: '/domains/transfers', hint: 'ACK required and stalled' },
    { label: 'Create in database', to: '/domains/create-in-database', hint: 'Externally registered domains' },
    { label: 'Bulk operations', to: '/system/bulk', hint: 'Dry run first, always' },
    { label: 'DNS zones', to: '/products/dns-zones', hint: 'Zone and record fixes' },
  ],
  finance: [
    { label: 'Record a payment', to: '/billing/payments', hint: 'Bank transfers and corrections' },
    { label: 'Invoices', to: '/billing/invoices', hint: 'Read-only register' },
    { label: 'Postpaid debt', to: '/reports/postpaid-debt', hint: 'Who to chase' },
  ],
  finance_approver: [
    { label: 'Refund queue', to: '/billing/payments?tab=refunds', hint: 'Above threshold needs you' },
    { label: 'Job centre', to: '/system/jobs', hint: 'Tier 3 work waiting on sign-off' },
    { label: 'Audit log', to: '/system/audit', hint: 'What was approved, by whom' },
  ],
  commercial: [
    { label: 'Promotions', to: '/billing/promotions', hint: 'Live and scheduled' },
    { label: 'Generate promocodes', to: '/billing/promocodes?tab=batches', hint: 'Batch with a CSV' },
    { label: 'Extensions', to: '/products/extensions', hint: 'TLD pricing and policy' },
    { label: 'Sales dashboard', to: '/reports/sales', hint: 'Where revenue sits' },
  ],
  abuse_compliance: [
    { label: 'Identity verification', to: '/customers/identity-verification', hint: 'KYC / KYB queue' },
    { label: 'Bulk abuse form', to: '/risk/bulk-abuse', hint: 'Enforce on a confirmed campaign' },
    { label: 'Banned keywords', to: '/risk/banned-keywords', hint: 'And their false positives' },
    { label: 'IP blacklist', to: '/risk/ip-blacklist', hint: 'Blocks and their reasons' },
  ],
  tech_ops: [
    { label: 'Task manager', to: '/system/tasks', hint: 'Queue, errors, backlog' },
    { label: 'Batch cracker', to: '/risk/batch-cracker', hint: 'Split, replay, resume' },
    { label: 'Custom settings', to: '/system/custom-settings', hint: 'Feature flags by scope' },
    { label: 'Query runner', to: '/system/query-runner', hint: 'Approved read-only queries' },
  ],
  sales: [
    { label: 'New & pending resellers', to: '/customers/resellers/new-pending', hint: 'Onboarding queue' },
    { label: 'Membership plans', to: '/customers/membership-plans', hint: 'Subscriptions and limits' },
    { label: 'Sales dashboard', to: '/reports/sales', hint: 'Segments and top accounts' },
    { label: 'Negative balances', to: '/reports/negative-balance', hint: 'Renewals about to fail' },
  ],
  auditor: [
    { label: 'Audit log', to: '/system/audit', hint: 'Every state-changing action' },
    { label: 'Roles & permissions', to: '/system/roles', hint: 'Who can do what' },
    { label: 'Job centre', to: '/system/jobs', hint: 'Tier 3 history' },
  ],
  super_admin: [
    { label: 'Roles & permissions', to: '/system/roles', hint: 'The access model itself' },
    { label: 'Audit log', to: '/system/audit', hint: 'Tier 3 first' },
    { label: 'Bulk operations', to: '/system/bulk', hint: 'Nine typed operations' },
    { label: 'PRD coverage', to: '/coverage', hint: 'How this maps onto the document' },
  ],
}

export function tasksFor(roleIds: string[]): { label: string; to: string; hint: string }[] {
  const seen = new Set<string>()
  const out: { label: string; to: string; hint: string }[] = []
  for (const id of roleIds) {
    for (const t of ROLE_TASKS[id] ?? []) {
      if (seen.has(t.to)) continue
      seen.add(t.to)
      out.push(t)
    }
  }
  return out.slice(0, 8)
}
