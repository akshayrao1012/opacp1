import { Gen, NOW_MS, isoDateTime } from '../rng'
import type { AdminUser } from '../rbac'
import { resellerSample } from './resellers'

/**
 * Admin users. The first entry is the signed-in identity in the prototype;
 * the role switcher in the top bar lets you sign in as any of them to see how
 * navigation, actions and empty states change under RBAC.
 */
export function seedUsers(): AdminUser[] {
  const regional = resellerSample(9).map((r) => r.id)
  return [
    {
      id: 'u_arao',
      name: 'Akshay Rao',
      email: 'akshay.rao@procys.com',
      roles: ['super_admin'],
      scope: { resellerIds: null, label: 'All resellers' },
      idpGroups: ['okta-acp-superadmin', 'okta-product'],
      lastSeen: isoDateTime(NOW_MS - 60_000),
      status: 'active',
    },
    {
      id: 'u_ljansen',
      name: 'Lotte Jansen',
      email: 'lotte.jansen@openprovider.com',
      roles: ['support_l1'],
      scope: { resellerIds: null, label: 'All resellers' },
      idpGroups: ['okta-acp-support'],
      lastSeen: isoDateTime(NOW_MS - 8 * 60_000),
      status: 'active',
    },
    {
      id: 'u_mkowalski',
      name: 'Marek Kowalski',
      email: 'marek.kowalski@openprovider.com',
      roles: ['support_l2'],
      scope: { resellerIds: null, label: 'All resellers' },
      idpGroups: ['okta-acp-support', 'okta-acp-support-lead'],
      lastSeen: isoDateTime(NOW_MS - 26 * 60_000),
      status: 'active',
    },
    {
      id: 'u_fmoreau',
      name: 'Fabienne Moreau',
      email: 'fabienne.moreau@openprovider.com',
      roles: ['finance'],
      scope: { resellerIds: null, label: 'All resellers' },
      idpGroups: ['okta-acp-finance'],
      lastSeen: isoDateTime(NOW_MS - 42 * 60_000),
      status: 'active',
    },
    {
      id: 'u_hvermeer',
      name: 'Hugo Vermeer',
      email: 'hugo.vermeer@openprovider.com',
      roles: ['finance_approver'],
      scope: { resellerIds: null, label: 'All resellers' },
      idpGroups: ['okta-acp-finance', 'okta-acp-finance-approver'],
      lastSeen: isoDateTime(NOW_MS - 3 * 3600_000),
      status: 'active',
    },
    {
      id: 'u_mklein',
      name: 'Mira Klein',
      email: 'mira.klein@openprovider.com',
      roles: ['commercial'],
      scope: { resellerIds: null, label: 'All resellers' },
      idpGroups: ['okta-acp-marketing'],
      lastSeen: isoDateTime(NOW_MS - 5 * 3600_000),
      status: 'active',
    },
    {
      id: 'u_jokafor',
      name: 'Jide Okafor',
      email: 'jide.okafor@openprovider.com',
      roles: ['abuse_compliance'],
      scope: { resellerIds: null, label: 'All resellers' },
      idpGroups: ['okta-acp-abuse', 'okta-acp-compliance'],
      lastSeen: isoDateTime(NOW_MS - 12 * 60_000),
      status: 'active',
    },
    {
      id: 'u_nbergstrom',
      name: 'Nils Bergström',
      email: 'nils.bergstrom@openprovider.com',
      roles: ['tech_ops'],
      scope: { resellerIds: null, label: 'All resellers' },
      idpGroups: ['okta-acp-techops'],
      lastSeen: isoDateTime(NOW_MS - 2 * 60_000),
      status: 'active',
    },
    {
      id: 'u_ilammers',
      name: 'Iris Lammers',
      email: 'iris.lammers@openprovider.com',
      roles: ['sales'],
      scope: { resellerIds: null, label: 'All resellers' },
      idpGroups: ['okta-acp-sales'],
      lastSeen: isoDateTime(NOW_MS - 90 * 60_000),
      status: 'active',
    },
    {
      id: 'u_pdubois',
      name: 'Pierre Dubois',
      email: 'pierre.dubois@contractor.example',
      roles: ['support_l1'],
      scope: { resellerIds: regional, label: 'FR/BE book of business (9 resellers)' },
      idpGroups: ['okta-acp-contractor'],
      lastSeen: isoDateTime(NOW_MS - 4 * 3600_000),
      status: 'active',
    },
    {
      id: 'u_auditor',
      name: 'Sofia Marin',
      email: 'sofia.marin@openprovider.com',
      roles: ['auditor'],
      scope: { resellerIds: null, label: 'All resellers' },
      idpGroups: ['okta-acp-audit', 'okta-internal-audit'],
      lastSeen: isoDateTime(NOW_MS - 27 * 3600_000),
      status: 'active',
    },
    {
      id: 'u_dormant',
      name: 'Bram de Vries',
      email: 'bram.devries@openprovider.com',
      roles: ['support_l2'],
      scope: { resellerIds: null, label: 'All resellers' },
      idpGroups: [],
      lastSeen: isoDateTime(NOW_MS - 214 * 24 * 3600_000),
      status: 'suspended',
    },
  ]
}

// ---------------------------------------------------------------------------
// Audit log seed — P7
// ---------------------------------------------------------------------------

export interface AuditEntry {
  id: string
  at: string
  actor: string
  actorEmail: string
  role: string
  action: string
  tier: 'T0' | 'T1' | 'T2' | 'T3'
  resource: string
  resourceId: string
  outcome: 'success' | 'denied' | 'failed'
  before: string | null
  after: string | null
  reason: string | null
  ticket: string | null
  ip: string
  correlationId: string
  elevated: boolean
}

const SEED_ACTIONS: [string, AuditEntry['tier'], string][] = [
  ['payment.refund.create', 'T2', 'refund'],
  ['payment.refund.approve', 'T3', 'refund'],
  ['reseller.write', 'T1', 'reseller'],
  ['reseller.approve', 'T2', 'reseller'],
  ['domain.bulk.suspend', 'T3', 'bulk_job'],
  ['domain.bulk.delete', 'T3', 'bulk_job'],
  ['product.dns.bulk.delete', 'T3', 'bulk_job'],
  ['ops.settings.write', 'T2', 'custom_setting'],
  ['ops.ratelimit.write', 'T2', 'rate_limit'],
  ['customer.kyc.decide', 'T2', 'kyc_case'],
  ['customer.contact.decide', 'T2', 'contact_validation'],
  ['catalog.promocode.write', 'T1', 'promocode'],
  ['catalog.promotion.write', 'T2', 'promotion'],
  ['catalog.extension.write', 'T2', 'extension'],
  ['product.license.migrate', 'T3', 'bulk_job'],
  ['product.ssl.admin', 'T2', 'ssl_account'],
  ['admin.role.write', 'T2', 'role'],
  ['admin.user.write', 'T2', 'user'],
  ['reseller.delete', 'T3', 'reseller'],
  ['export.run', 'T1', 'export'],
  ['ops.task.purge', 'T3', 'task_batch'],
]

const ACTORS: [string, string, string][] = [
  ['Lotte Jansen', 'lotte.jansen@openprovider.com', 'Support Agent (L1)'],
  ['Marek Kowalski', 'marek.kowalski@openprovider.com', 'Support Lead (L2)'],
  ['Fabienne Moreau', 'fabienne.moreau@openprovider.com', 'Finance'],
  ['Hugo Vermeer', 'hugo.vermeer@openprovider.com', 'Finance Approver'],
  ['Mira Klein', 'mira.klein@openprovider.com', 'Commercial / Marketing'],
  ['Jide Okafor', 'jide.okafor@openprovider.com', 'Abuse & Compliance'],
  ['Nils Bergström', 'nils.bergstrom@openprovider.com', 'Technical Operations'],
  ['Iris Lammers', 'iris.lammers@openprovider.com', 'Sales / Account Management'],
  ['Akshay Rao', 'akshay.rao@procys.com', 'Super Admin'],
]

export function seedAudit(n = 640): AuditEntry[] {
  return Array.from({ length: n }, (_, i) => {
    const g = new Gen('audit', i)
    const [action, tier, resource] = g.pick(SEED_ACTIONS)
    const [actor, email, role] = g.pick(ACTORS)
    const outcome = g.weighted<AuditEntry['outcome']>([['success', 88], ['denied', 8], ['failed', 4]])
    const needsReason = tier === 'T2' || tier === 'T3'
    return {
      id: `AUD-${9_000_000 - i}`,
      at: g.dateTimeOffset(-1400, -1),
      actor,
      actorEmail: email,
      role,
      action,
      tier,
      resource,
      resourceId:
        resource === 'reseller' ? String(100000 + g.int(0, 4000) * 7)
        : resource === 'bulk_job' ? `JOB-${g.int(10000, 99999)}`
        : resource === 'refund' ? `RF-${g.int(50000, 50245)}`
        : `${resource.slice(0, 3).toUpperCase()}-${g.int(1000, 99999)}`,
      outcome,
      before: needsReason ? g.pick(['{"status":"active"}', '{"limit":60}', '{"value":"false"}', 'null']) : null,
      after: needsReason ? g.pick(['{"status":"suspended"}', '{"limit":600}', '{"value":"true"}', '{"status":"approved"}']) : null,
      reason: needsReason ? g.pick(['Customer request', 'Incident 4821 mitigation', 'Compliance decision', 'Duplicate charge', 'Registry escalation']) : null,
      ticket: needsReason ? `ZD-${g.int(400000, 499999)}` : null,
      ip: `${g.int(31, 213)}.${g.int(0, 255)}.${g.int(0, 255)}.${g.int(1, 254)}`,
      correlationId: `cor_${g.int(1e9, 9e9).toString(36)}`,
      elevated: tier === 'T3' && outcome === 'success',
    }
  }).sort((a, b) => (a.at < b.at ? 1 : -1))
}

// ---------------------------------------------------------------------------
// Job centre seed — P6
// ---------------------------------------------------------------------------

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'awaiting_approval'

export interface JobRow {
  id: string
  kind: string
  label: string
  status: JobStatus
  progress: number
  owner: string
  startedAt: string
  finishedAt: string | null
  total: number
  succeeded: number
  failed: number
  dryRun: boolean
  cancellable: boolean
  resultCsv: string | null
  reason: string | null
  ticket: string | null
  approver: string | null
  tier: 'T1' | 'T2' | 'T3'
}

const JOB_KINDS: [string, string, 'T1' | 'T2' | 'T3'][] = [
  ['domain_bulk_delete', 'Bulk delete domains from database', 'T3'],
  ['domain_bulk_suspend', 'Bulk abuse suspension', 'T3'],
  ['dns_bulk_delete', 'Bulk delete DNS zones', 'T3'],
  ['license_migration', 'License migration (Plesk → Plesk)', 'T3'],
  ['internal_transfer', 'Bulk internal transfer', 'T3'],
  ['reseller_delete', 'Delete reseller (GDPR erasure)', 'T3'],
  ['domain_bulk_lookup', 'Bulk domain lookup', 'T1'],
  ['domain_bulk_sync', 'Bulk sync domain dates', 'T2'],
  ['export', 'Export — Licenses (filtered)', 'T1'],
  ['export', 'Export — Task manager (failed, 30d)', 'T1'],
  ['task_purge', 'Purge outdated tasks', 'T3'],
]

export function seedJobs(n = 46): JobRow[] {
  return Array.from({ length: n }, (_, i) => {
    const g = new Gen('job', i)
    const [kind, label, tier] = g.pick(JOB_KINDS)
    const status = i === 0
      ? 'running'
      : i === 1
        ? 'awaiting_approval'
        : g.weighted<JobStatus>([['completed', 62], ['failed', 14], ['cancelled', 6], ['queued', 8], ['running', 10]])
    const total = g.int(1, 24000)
    const failed = status === 'failed' ? g.int(1, Math.max(1, Math.round(total * 0.4))) : g.weighted([[0, 70], [g.int(1, 30), 30]])
    const done = status === 'completed' ? total - failed : Math.round(total * g.float(0.05, 0.9))
    return {
      id: `JOB-${40000 + i}`,
      kind,
      label,
      status,
      progress: status === 'completed' ? 100 : status === 'queued' ? 0 : Math.round((done / total) * 100),
      owner: g.pick(['n.bergstrom', 'm.kowalski', 'j.okafor', 'f.moreau', 'a.rao', 'system.scheduler']),
      startedAt: g.dateTimeOffset(-900, -1),
      finishedAt: status === 'completed' || status === 'failed' || status === 'cancelled' ? g.dateTimeOffset(-880, -1) : null,
      total,
      succeeded: done,
      failed,
      dryRun: tier === 'T3' ? g.bool(0.45) : g.bool(0.1),
      cancellable: status === 'running' || status === 'queued',
      resultCsv: status === 'completed' || status === 'failed' ? `${kind}-${40000 + i}-results.csv` : null,
      reason: tier === 'T1' ? null : g.pick(['Abuse report NL-2026-8841', 'Incident 4821 cleanup', 'Customer request', 'Registry mandated deletion', 'Migration wave 3']),
      ticket: tier === 'T1' ? null : `ZD-${g.int(400000, 499999)}`,
      approver: tier === 'T3' && status !== 'awaiting_approval' ? g.pick(['h.vermeer', 'a.rao', 'k.oosterhuis']) : null,
      tier,
    }
  }).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
}
