import { Gen, WORDS, TLDS } from '../rng'
import { materialized, synthetic, type Dataset } from '../table'
import { patchable, type Deletable } from './patch'
import { resellers, MEMBERSHIPS } from './resellers'

// ---------------------------------------------------------------------------
// Task manager — 465,980 entries, 182,003 outdated
// ---------------------------------------------------------------------------

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'outdated' | 'cancelled'

export interface Task extends Deletable {
  id: string
  type: string
  status: TaskStatus
  resellerId: number
  subject: string
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  attempts: number
  durationMs: number | null
  error: string | null
  worker: string
  priority: 'low' | 'normal' | 'high'
  outdated: boolean
  ageDays: number
}

export const TASK_TYPES = [
  'domain.register', 'domain.renew', 'domain.transfer', 'domain.delete', 'domain.update_ns',
  'dns.zone.create', 'dns.zone.update', 'ssl.order', 'ssl.reissue', 'license.provision',
  'invoice.generate', 'mail.send', 'spamexperts.provision', 'registry.poll', 'contact.update',
]

export const TASK_ERRORS = [
  'Registry timeout after 30s', 'EPP 2201 authorization error', 'Insufficient reseller balance',
  'Contact handle invalid', 'Duplicate request', 'Downstream 502 from provider',
  'DNSSEC key mismatch', 'Rate limit exceeded at registry',
]

const TASK_COUNT = 465_980
const OUTDATED_COUNT = 182_003
/** Outdated rows are the oldest ones, so the ratio matches the inventory exactly. */
const OUTDATED_CUTOFF = OUTDATED_COUNT

let _tasks: Dataset<Task> | null = null
export function tasks(): Dataset<Task> {
  if (!_tasks) {
    const rds = resellers()
    _tasks = patchable(
      synthetic<Task>('tasks', TASK_COUNT, (i) => {
        const g = new Gen('task', i)
        const outdated = i < OUTDATED_CUTOFF
        const r = rds.at((i * 11) % rds.total)
        const status: TaskStatus = outdated
          ? 'outdated'
          : g.weighted<TaskStatus>([['completed', 78], ['failed', 9], ['queued', 7], ['running', 4], ['cancelled', 2]])
        const ageDays = outdated ? g.int(200, 1800) : g.int(0, 190)
        const failed = status === 'failed'
        return {
          id: `TSK-${3_000_000 + i}`,
          type: g.pick(TASK_TYPES),
          status,
          resellerId: r.id,
          subject: g.bool(0.7) ? `${g.pick(WORDS)}${g.int(2, 900)}.${g.pick(TLDS)}` : `reseller:${r.id}`,
          createdAt: g.dateTimeOffset(-ageDays * 24 - 6, -ageDays * 24),
          startedAt: status === 'queued' ? null : g.dateTimeOffset(-ageDays * 24 - 5, -ageDays * 24),
          finishedAt: status === 'completed' || status === 'failed' || status === 'outdated' ? g.dateTimeOffset(-ageDays * 24 - 4, -ageDays * 24) : null,
          attempts: failed ? g.int(2, 8) : 1,
          durationMs: status === 'queued' ? null : g.int(40, 92000),
          error: failed ? g.pick(TASK_ERRORS) : null,
          worker: `worker-${g.int(1, 24).toString().padStart(2, '0')}`,
          priority: g.weighted([['normal', 78], ['high', 14], ['low', 8]]),
          outdated,
          ageDays,
        }
      }),
      (r) => r.id,
    )
  }
  return _tasks
}

export const TASK_STATS = {
  total: TASK_COUNT,
  outdated: OUTDATED_COUNT,
}

// ---------------------------------------------------------------------------
// Mail — overview + verification tabs, export requested in the inventory
// ---------------------------------------------------------------------------

export interface MailMessage extends Deletable {
  id: string
  subject: string
  template: string
  toAddress: string
  resellerId: number
  type: 'transactional' | 'notification' | 'invoice' | 'marketing' | 'system'
  status: 'sent' | 'delivered' | 'bounced' | 'deferred' | 'spam' | 'opened'
  sentAt: string
  provider: 'Mailjet' | 'SES' | 'SMTP relay'
  opens: number
  clicks: number
  bounceReason: string | null
  sizeKb: number
}

let _mail: Dataset<MailMessage> | null = null
export function mailMessages(): Dataset<MailMessage> {
  if (!_mail) {
    const rds = resellers()
    _mail = patchable(
      synthetic<MailMessage>('mail', 96_400, (i) => {
        const g = new Gen('mail', i)
        const r = rds.at((i * 19) % rds.total)
        const status = g.weighted<MailMessage['status']>([
          ['delivered', 58], ['opened', 22], ['sent', 8], ['bounced', 6], ['deferred', 4], ['spam', 2],
        ])
        const template = g.pick([
          'domain_expiry_notice', 'invoice_created', 'payment_receipt', 'transfer_started',
          'password_reset', 'kyc_request', 'abuse_notice', 'welcome_reseller', 'ssl_issued',
        ])
        return {
          id: `MSG-${5_000_000 + i}`,
          subject: template.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
          template,
          toAddress: `${g.pick(['admin', 'billing', 'info', 'owner'])}@${g.pick(WORDS)}${g.int(2, 400)}.${g.pick(TLDS)}`,
          resellerId: r.id,
          type: g.weighted([['transactional', 46], ['notification', 30], ['invoice', 16], ['system', 6], ['marketing', 2]]),
          status,
          sentAt: g.dateTimeOffset(-8000, -1),
          provider: g.weighted([['Mailjet', 62], ['SES', 30], ['SMTP relay', 8]]),
          opens: status === 'opened' ? g.int(1, 12) : 0,
          clicks: status === 'opened' ? g.int(0, 5) : 0,
          bounceReason: status === 'bounced' ? g.pick(['550 mailbox unavailable', '553 relay denied', 'DNS lookup failed', 'Mailbox full']) : null,
          sizeKb: g.int(4, 320),
        }
      }),
      (r) => r.id,
    )
  }
  return _mail
}

export interface MailVerification extends Deletable {
  id: string
  email: string
  resellerId: number
  handle: string
  purpose: 'registrant_verification' | 'reseller_signup' | 'contact_change' | 'abuse_contact'
  status: 'verified' | 'pending' | 'expired' | 'bounced'
  requestedAt: string
  verifiedAt: string | null
  remindersSent: number
  expiresAt: string
  registry: string
  suspensionRisk: boolean
}

let _mailVerif: Dataset<MailVerification> | null = null
export function mailVerifications(): Dataset<MailVerification> {
  if (!_mailVerif) {
    const rds = resellers()
    _mailVerif = patchable(
      synthetic<MailVerification>('mail_verifications', 18_240, (i) => {
        const g = new Gen('mailverif', i)
        const r = rds.at((i * 23) % rds.total)
        const status = g.weighted<MailVerification['status']>([
          ['verified', 64], ['pending', 22], ['expired', 9], ['bounced', 5],
        ])
        return {
          id: `MV-${700000 + i}`,
          email: `${g.pick(['owner', 'admin', 'contact'])}@${g.pick(WORDS)}${g.int(2, 300)}.${g.pick(TLDS)}`,
          resellerId: r.id,
          handle: `OP-${g.int(100000, 999999)}`,
          purpose: g.weighted([['registrant_verification', 58], ['reseller_signup', 18], ['contact_change', 16], ['abuse_contact', 8]]),
          status,
          requestedAt: g.dateTimeOffset(-4000, -1),
          verifiedAt: status === 'verified' ? g.dateTimeOffset(-3900, -1) : null,
          remindersSent: g.int(0, 4),
          expiresAt: g.dayOffset(-40, 20),
          registry: g.pick(['ICANN', 'SIDN', 'Nominet', 'EURid', 'DENIC']),
          suspensionRisk: status === 'pending' || status === 'expired',
        }
      }),
      (r) => r.id,
    )
  }
  return _mailVerif
}

// ---------------------------------------------------------------------------
// Custom settings — feature-flag surface with effective scope
// ---------------------------------------------------------------------------

export interface CustomSetting extends Deletable {
  id: string
  key: string
  valueType: 'boolean' | 'number' | 'string' | 'json'
  value: string
  scope: 'global' | 'membership' | 'reseller'
  scopeTarget: string
  description: string
  affectsResellers: number
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
  deletedBy: string | null
  reason: string
  overridesGlobal: boolean
  risk: 'low' | 'medium' | 'high'
}

const SETTING_KEYS = [
  'allow_bulk_transfer', 'max_domains_per_request', 'enable_fastcheckout', 'dnssec_default_on',
  'auto_renew_default', 'trustee_service_enabled', 'whois_privacy_default', 'invoice_pdf_v2',
  'api_rate_limit_override', 'suspend_on_negative_balance', 'kyc_required_threshold',
  'allow_premium_registration', 'transfer_auto_ack', 'legacy_epp_gateway', 'quarantine_restore_ui',
  'sepa_dd_enabled', 'dns_templates_v2', 'ssl_auto_reissue', 'abuse_autosuspend',
]

let _settings: Dataset<CustomSetting> | null = null
export function customSettings(): Dataset<CustomSetting> {
  if (!_settings) {
    const rds = resellers()
    const rows: CustomSetting[] = []
    SETTING_KEYS.forEach((key, ki) => {
      const g = new Gen('setting', key)
      const type = g.weighted<CustomSetting['valueType']>([['boolean', 58], ['number', 24], ['string', 12], ['json', 6]])
      const mk = (scope: CustomSetting['scope'], target: string, idx: number, affects: number): CustomSetting => {
        const gg = new Gen('setting', key, scope, target)
        return {
          id: `CS-${ki * 100 + idx}`,
          key,
          valueType: type,
          value:
            type === 'boolean' ? String(gg.bool(0.5))
            : type === 'number' ? String(gg.int(1, 5000))
            : type === 'json' ? '{"mode":"' + gg.pick(['strict', 'lenient']) + '","retries":' + gg.int(1, 5) + '}'
            : gg.pick(['default', 'v2', 'legacy', 'beta']),
          scope,
          scopeTarget: target,
          description: `${key.replace(/_/g, ' ')} — ${gg.pick(['feature flag', 'operational limit', 'billing behaviour', 'compliance control'])}.`,
          affectsResellers: affects,
          createdBy: gg.pick(['t.ops', 'a.rao', 'platform.migration', 'system']),
          createdAt: gg.dayOffset(-1800, -30),
          updatedBy: gg.pick(['t.ops', 'a.rao', 'n.bergstrom']),
          updatedAt: gg.dateTimeOffset(-6000, -2),
          deletedBy: null,
          reason: gg.pick(['Incident 4821 mitigation', 'Enterprise contract requirement', 'Gradual rollout', 'Legacy compatibility', 'Fraud control']),
          overridesGlobal: scope !== 'global',
          risk: gg.weighted([['low', 50], ['medium', 34], ['high', 16]]),
        }
      }
      rows.push(mk('global', 'All resellers', 0, 4182))
      const g2 = new Gen('setting-scope', key)
      if (g2.bool(0.55)) {
        const plan = g2.pick([...MEMBERSHIPS])
        rows.push(mk('membership', plan, 1, g2.int(80, 1400)))
      }
      for (let j = 0; j < g2.int(0, 3); j++) {
        const r = rds.at((ki * 97 + j * 13) % rds.total)
        rows.push(mk('reseller', `${r.id} — ${r.company}`, 2 + j, 1))
      }
    })
    _settings = patchable(materialized('custom_settings', rows), (r) => r.id)
  }
  return _settings
}

// ---------------------------------------------------------------------------
// Rate limits — tier / reseller / global override hierarchy
// ---------------------------------------------------------------------------

export interface RateLimit extends Deletable {
  id: string
  endpoint: string
  scope: 'global' | 'plan' | 'reseller'
  scopeTarget: string
  limit: number
  window: '1s' | '1m' | '1h' | '1d'
  burst: number
  effective: boolean
  overriddenBy: string | null
  usagePeak24h: number
  throttled24h: number
  updatedBy: string
  updatedAt: string
}

const ENDPOINTS = [
  'POST /v1beta/domains', 'GET /v1beta/domains', 'POST /v1beta/domains/transfer',
  'POST /v1beta/dns/zones', 'GET /v1beta/dns/zones', 'POST /v1beta/ssl/orders',
  'GET /v1beta/customers', 'POST /v1beta/customers', 'GET /v1beta/invoices',
  'POST /v1beta/licenses', 'GET /v1beta/reports/*',
]

let _rateLimits: Dataset<RateLimit> | null = null
export function rateLimits(): Dataset<RateLimit> {
  if (!_rateLimits) {
    const rds = resellers()
    const rows: RateLimit[] = []
    ENDPOINTS.forEach((endpoint, ei) => {
      const g = new Gen('ratelimit', endpoint)
      const base = g.pick([10, 30, 60, 120, 600])
      rows.push({
        id: `RL-${ei}-g`,
        endpoint,
        scope: 'global',
        scopeTarget: 'Platform default',
        limit: base,
        window: g.pick(['1s', '1m', '1h']),
        burst: base * 2,
        effective: true,
        overriddenBy: null,
        usagePeak24h: g.int(1, base * 3),
        throttled24h: g.int(0, 4200),
        updatedBy: 'platform.default',
        updatedAt: g.dateTimeOffset(-9000, -100),
      })
      MEMBERSHIPS.forEach((plan, pi) => {
        if (!g.bool(0.5)) return
        const mult = 1 + pi * 0.6
        rows.push({
          id: `RL-${ei}-p${pi}`,
          endpoint,
          scope: 'plan',
          scopeTarget: plan,
          limit: Math.round(base * mult),
          window: '1m',
          burst: Math.round(base * mult * 2),
          effective: true,
          overriddenBy: null,
          usagePeak24h: g.int(1, Math.round(base * mult * 2)),
          throttled24h: g.int(0, 900),
          updatedBy: g.pick(['t.ops', 'a.rao']),
          updatedAt: g.dateTimeOffset(-7000, -40),
        })
      })
      for (let j = 0; j < g.int(0, 2); j++) {
        const r = rds.at((ei * 53 + j * 7) % rds.total)
        rows.push({
          id: `RL-${ei}-r${j}`,
          endpoint,
          scope: 'reseller',
          scopeTarget: `${r.id} — ${r.company}`,
          limit: base * g.int(2, 20),
          window: '1m',
          burst: base * 40,
          effective: true,
          overriddenBy: null,
          usagePeak24h: g.int(1, base * 30),
          throttled24h: g.int(0, 300),
          updatedBy: g.pick(['t.ops', 'incident.4821']),
          updatedAt: g.dateTimeOffset(-3000, -5),
        })
      }
    })
    // Mark shadowed rows: a more specific scope wins.
    for (const row of rows) {
      if (row.scope === 'global' && rows.some((o) => o.endpoint === row.endpoint && o.scope !== 'global')) {
        row.overriddenBy = rows.filter((o) => o.endpoint === row.endpoint && o.scope !== 'global').map((o) => o.scopeTarget).join(', ')
      }
    }
    _rateLimits = patchable(materialized('rate_limits', rows), (r) => r.id)
  }
  return _rateLimits
}

/**
 * One-pass health summary over the task table, cached for the session. The
 * dashboard needs these five numbers and must not scan 466k rows per render.
 */
export interface TaskHealth {
  queued: number
  running: number
  failed30d: number
  failedTotal: number
  outdated: number
  topFailures: { type: string; count: number }[]
}

let _taskHealth: TaskHealth | null = null
export function taskHealth(): TaskHealth {
  if (_taskHealth) return _taskHealth
  const ds = tasks()
  let queued = 0
  let running = 0
  let failed30d = 0
  let failedTotal = 0
  let outdated = 0
  const byType = new Map<string, number>()
  for (let i = 0; i < ds.total; i++) {
    const t = ds.at(i)
    if (t._deleted) continue
    if (t.status === 'queued') queued++
    else if (t.status === 'running') running++
    else if (t.status === 'outdated') outdated++
    else if (t.status === 'failed') {
      failedTotal++
      if (t.ageDays <= 30) {
        failed30d++
        byType.set(t.type, (byType.get(t.type) ?? 0) + 1)
      }
    }
  }
  _taskHealth = {
    queued,
    running,
    failed30d,
    failedTotal,
    outdated,
    topFailures: [...byType.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  }
  return _taskHealth
}
