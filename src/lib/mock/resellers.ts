import { Gen, companyName, personName, COUNTRIES, isoDate, NOW_MS } from '../rng'
import { materialized, synthetic, type Dataset } from '../table'
import { patchable, type Deletable } from './patch'

export type ResellerStatus = 'active' | 'suspended' | 'pending' | 'closed'

export interface Reseller extends Deletable {
  id: number
  company: string
  contactName: string
  email: string
  phone: string
  country: string
  countryName: string
  status: ResellerStatus
  membership: string
  balance: number
  currency: 'EUR' | 'USD' | 'GBP'
  domains: number
  createdAt: string
  lastLoginAt: string
  kyc: 'verified' | 'pending' | 'failed' | 'not_started'
  accountManager: string
  vat: string
  language: string
  paymentTerm: string
  twoFactor: boolean
  riskScore: number
  segment: 'enterprise' | 'mid_market' | 'smb' | 'individual'
  monthlyRevenue: number
  tags: string[]
}

/**
 * Reseller membership plans, ascending by tier — Basic is the entry plan and
 * Supreme the top one. Order matters: plan rate limits and bruteforce
 * thresholds scale by index, and the top plans carry included extras.
 */
export const MEMBERSHIPS = ['Basic', 'Professional', 'Expert', 'Supreme'] as const

export type Membership = (typeof MEMBERSHIPS)[number]

/** The plans that carry premium entitlements (included WPP, higher limits). */
export const PREMIUM_MEMBERSHIPS: Membership[] = ['Expert', 'Supreme']

export const ACCOUNT_MANAGERS = [
  'Iris Lammers', 'Tomás Duarte', 'Nils Bergström', 'Ayşe Demir', 'Paul Renard', 'Unassigned',
]

const RESELLER_COUNT = 4182

function makeReseller(i: number): Reseller {
  const g = new Gen('reseller', i)
  const id = 100000 + i * 7 + (i % 3)
  const company = companyName(g)
  const contactName = personName(g)
  const [cc, cname] = g.pick(COUNTRIES)
  const status = g.weighted<ResellerStatus>([
    ['active', 82], ['suspended', 6], ['pending', 7], ['closed', 5],
  ])
  const segment = g.weighted<Reseller['segment']>([
    ['smb', 55], ['mid_market', 25], ['individual', 14], ['enterprise', 6],
  ])
  const domains =
    segment === 'enterprise' ? g.int(4000, 90000)
    : segment === 'mid_market' ? g.int(400, 4000)
    : segment === 'smb' ? g.int(10, 400)
    : g.int(1, 12)
  const slug = company.split(' ')[0].toLowerCase()
  return {
    id,
    company,
    contactName,
    email: `${contactName.split(' ')[0].toLowerCase()}@${slug}.com`,
    phone: `+${g.int(31, 49)} ${g.int(10, 99)} ${g.int(1000000, 9999999)}`,
    country: cc,
    countryName: cname,
    status,
    membership: segment === 'enterprise' ? g.pick(['Expert', 'Supreme']) : g.pick([...MEMBERSHIPS]),
    balance: g.money(-2400, 48000),
    currency: g.weighted([['EUR', 80], ['USD', 12], ['GBP', 8]]),
    domains,
    createdAt: g.dayOffset(-3200, -20),
    lastLoginAt: status === 'active' ? g.dateTimeOffset(-720, -1) : g.dateTimeOffset(-9000, -800),
    kyc: g.weighted([['verified', 70], ['pending', 12], ['not_started', 13], ['failed', 5]]),
    accountManager: segment === 'smb' || segment === 'individual' ? 'Unassigned' : g.pick(ACCOUNT_MANAGERS),
    vat: `${cc}${g.int(100000000, 999999999)}B01`,
    language: g.pick(['en', 'nl', 'de', 'fr', 'es', 'it']),
    paymentTerm: g.pick(['Prepaid', 'Net 14', 'Net 30', 'Direct debit']),
    twoFactor: g.bool(0.62),
    riskScore: g.int(0, 100),
    segment,
    monthlyRevenue: Math.round(domains * g.float(0.6, 3.4) * 100) / 100,
    tags: g.some(['reseller-api', 'fastcheckout', 'dns-only', 'ssl-heavy', 'trademark', 'churn-risk', 'vip'], g.int(0, 3)),
  }
}

let _resellers: Dataset<Reseller> | null = null
export function resellers(): Dataset<Reseller> {
  if (!_resellers) {
    const rows = Array.from({ length: RESELLER_COUNT }, (_, i) => makeReseller(i))
    _resellers = patchable(materialized('resellers', rows), (r) => String(r.id))
  }
  return _resellers
}

export function findReseller(id: number): Reseller | undefined {
  const ds = resellers()
  for (let i = 0; i < ds.total; i++) {
    const r = ds.at(i)
    if (r.id === id) return r
  }
  return undefined
}

/** A small stable sample, for pickers and dashboards. */
export function resellerSample(n = 40): Reseller[] {
  const ds = resellers()
  return Array.from({ length: n }, (_, i) => ds.at(i * 13 % ds.total))
}

// ---------------------------------------------------------------------------
// Reseller contacts (what `Delete reseller` anonymises)
// ---------------------------------------------------------------------------

export type ContactRole = 'admin' | 'technical' | 'billing' | 'abuse' | 'sales'
export const CONTACT_ROLES: ContactRole[] = ['admin', 'technical', 'billing', 'abuse', 'sales']

export interface ResellerContact {
  handle: string
  role: ContactRole
  name: string
  email: string
  phone: string
  anonymised: boolean
}

export function resellerContacts(resellerId: number): ResellerContact[] {
  return CONTACT_ROLES.map((role) => {
    const g = new Gen('contact', resellerId, role)
    const name = personName(g)
    return {
      handle: `OP-${g.int(100000, 999999)}`,
      role,
      name,
      email: `${role}@${name.split(' ')[1].toLowerCase().replace(/[^a-z]/g, '')}.com`,
      phone: `+${g.int(31, 49)} ${g.int(600000000, 699999999)}`,
      anonymised: false,
    }
  })
}

// ---------------------------------------------------------------------------
// New & pending resellers — Resellers → Show new
// ---------------------------------------------------------------------------

export interface PendingReseller extends Deletable {
  id: number
  company: string
  contactName: string
  email: string
  country: string
  registeredAt: string
  source: 'website' | 'api' | 'sales' | 'partner'
  kyc: 'not_started' | 'pending' | 'verified' | 'failed'
  emailVerified: boolean
  riskFlags: string[]
  queue: 'awaiting_review' | 'awaiting_kyc'
  assignee: string
}

let _pending: Dataset<PendingReseller> | null = null
export function pendingResellers(): Dataset<PendingReseller> {
  if (!_pending) {
    const rows: PendingReseller[] = Array.from({ length: 148 }, (_, i) => {
      const g = new Gen('pending', i)
      const company = companyName(g)
      const contactName = personName(g)
      const [cc] = g.pick(COUNTRIES)
      const kyc = g.weighted<PendingReseller['kyc']>([['not_started', 40], ['pending', 35], ['verified', 20], ['failed', 5]])
      return {
        id: 900000 + i * 3,
        company,
        contactName,
        email: `${contactName.split(' ')[0].toLowerCase()}@${company.split(' ')[0].toLowerCase()}.com`,
        country: cc,
        registeredAt: g.dateTimeOffset(-1400, -1),
        source: g.weighted([['website', 60], ['api', 18], ['sales', 15], ['partner', 7]]),
        kyc,
        emailVerified: g.bool(0.78),
        riskFlags: g.some(['disposable-email', 'vpn-signup', 'name-mismatch', 'sanctions-hit', 'duplicate-vat'], g.weighted([[0, 70], [1, 22], [2, 8]])),
        queue: kyc === 'verified' ? 'awaiting_review' : 'awaiting_kyc',
        assignee: g.weighted([['Unassigned', 60], ['Iris Lammers', 15], ['Paul Renard', 15], ['Ayşe Demir', 10]]),
      }
    })
    _pending = patchable(materialized('pending_resellers', rows), (r) => String(r.id))
  }
  return _pending
}

// ---------------------------------------------------------------------------
// Notification settings — Resellers → Notification Settings (P8 secrets)
// ---------------------------------------------------------------------------

export interface NotificationSetting extends Deletable {
  id: string
  resellerId: number
  company: string
  event: string
  channel: 'webhook' | 'email' | 'both'
  endpoint: string
  apiKey: string
  signatureSecret: string
  active: boolean
  lastDeliveryAt: string
  lastStatus: 'ok' | 'failed' | 'retrying'
  failures24h: number
}

export const NOTIFICATION_EVENTS = [
  'domain.registered', 'domain.expired', 'domain.transferred', 'domain.renewed',
  'ssl.issued', 'invoice.created', 'payment.received', 'abuse.reported', 'kyc.decision',
]

let _notif: Dataset<NotificationSetting> | null = null
export function notificationSettings(): Dataset<NotificationSetting> {
  if (!_notif) {
    const sample = resellerSample(120)
    const rows: NotificationSetting[] = []
    sample.forEach((r, ri) => {
      const g = new Gen('notif', r.id)
      for (const event of g.some(NOTIFICATION_EVENTS, g.int(1, 4))) {
        const gg = new Gen('notif', r.id, event)
        const ok = gg.bool(0.8)
        rows.push({
          id: `NS-${r.id}-${event}`,
          resellerId: r.id,
          company: r.company,
          event,
          channel: gg.weighted([['webhook', 60], ['email', 25], ['both', 15]]),
          endpoint: `https://hooks.${r.company.split(' ')[0].toLowerCase()}.com/openprovider/${event.replace('.', '-')}`,
          apiKey: `op_live_${gg.int(100000000, 999999999).toString(36)}${gg.int(100000, 999999).toString(36)}`,
          signatureSecret: `whsec_${gg.int(100000000, 999999999).toString(36)}${gg.int(1000000, 9999999).toString(36)}`,
          active: gg.bool(0.88),
          lastDeliveryAt: gg.dateTimeOffset(-200, -1),
          lastStatus: ok ? 'ok' : gg.bool(0.5) ? 'failed' : 'retrying',
          failures24h: ok ? 0 : gg.int(1, 340),
        })
        if (ri > 118) break
      }
    })
    _notif = patchable(materialized('notification_settings', rows), (r) => r.id)
  }
  return _notif
}

// ---------------------------------------------------------------------------
// Membership subscriptions — 18,160 records
// ---------------------------------------------------------------------------

export interface MembershipSubscription extends Deletable {
  id: string
  resellerId: number
  company: string
  plan: string
  status: 'active' | 'cancelled' | 'expired' | 'trial'
  startedAt: string
  renewsAt: string
  price: number
  currency: string
  billingCycle: 'monthly' | 'yearly'
  autoRenew: boolean
  createdBy: string
  deletedBy: string | null
  reason: string | null
}

const MEMBERSHIP_COUNT = 18160

let _memberships: Dataset<MembershipSubscription> | null = null
export function membershipSubscriptions(): Dataset<MembershipSubscription> {
  if (!_memberships) {
    const rds = resellers()
    _memberships = patchable(
      synthetic<MembershipSubscription>('memberships', MEMBERSHIP_COUNT, (i) => {
        const g = new Gen('membership', i)
        const r = rds.at(i % rds.total)
        const plan = g.pick([...MEMBERSHIPS])
        const status = g.weighted<MembershipSubscription['status']>([
          ['active', 68], ['expired', 15], ['cancelled', 12], ['trial', 5],
        ])
        const cycle = g.weighted<'monthly' | 'yearly'>([['yearly', 62], ['monthly', 38]])
        const deleted = status === 'cancelled'
        return {
          id: `MS-${200000 + i}`,
          resellerId: r.id,
          company: r.company,
          plan,
          status,
          startedAt: g.dayOffset(-1500, -10),
          renewsAt: g.dayOffset(-60, 400),
          price: plan === 'Basic' ? 0 : g.money(19, 1490),
          currency: 'EUR',
          billingCycle: cycle,
          autoRenew: status === 'active' && g.bool(0.85),
          createdBy: g.pick(['system', 'iris.lammers', 'paul.renard', 'self-service', 'api']),
          deletedBy: deleted ? g.pick(['iris.lammers', 'system', 'p.renard']) : null,
          reason: deleted ? g.pick(['Downgrade requested', 'Non-payment', 'Duplicate subscription', 'Migrated to Enterprise']) : null,
        }
      }),
      (r) => r.id,
    )
  }
  return _memberships
}

// ---------------------------------------------------------------------------
// Provider mappings — Domain Providers → Resellers (credentials, P8)
// ---------------------------------------------------------------------------

export interface ProviderMapping extends Deletable {
  id: string
  resellerId: number
  company: string
  provider: string
  registryLogin: string
  registryPassword: string
  status: 'connected' | 'auth_failed' | 'disabled'
  tlds: string[]
  lastCheckedAt: string
  credentialAge: number
}

export const PROVIDER_NAMES = [
  'SIDN', 'DENIC', 'AFNIC', 'Nominet', 'EURid', 'Verisign', 'PIR', 'CentralNic',
  'DNS Belgium', 'NIC.at', 'Registro.it', 'DK Hostmaster', 'CIRA', 'auDA', 'Identity Digital',
]

let _mappings: Dataset<ProviderMapping> | null = null
export function providerMappings(): Dataset<ProviderMapping> {
  if (!_mappings) {
    const rows: ProviderMapping[] = []
    resellerSample(90).forEach((r) => {
      const g = new Gen('mapping', r.id)
      for (const provider of g.some(PROVIDER_NAMES, g.int(1, 4))) {
        const gg = new Gen('mapping', r.id, provider)
        rows.push({
          id: `PM-${r.id}-${provider.replace(/\W/g, '')}`,
          resellerId: r.id,
          company: r.company,
          provider,
          registryLogin: `${provider.toLowerCase().replace(/\W/g, '')}-${r.id}`,
          registryPassword: `${gg.pick(['Rk', 'Zm', 'Qp', 'Vt'])}${gg.int(100000, 999999)}!${gg.pick(['aX', 'bQ', 'zR'])}`,
          status: gg.weighted([['connected', 80], ['auth_failed', 12], ['disabled', 8]]),
          tlds: gg.some(['nl', 'de', 'fr', 'co.uk', 'eu', 'com', 'be', 'at', 'it', 'dk'], gg.int(1, 3)),
          lastCheckedAt: gg.dateTimeOffset(-72, -1),
          credentialAge: gg.int(3, 1400),
        })
      }
    })
    _mappings = patchable(materialized('provider_mappings', rows), (r) => r.id)
  }
  return _mappings
}

// ---------------------------------------------------------------------------
// Reseller statistics — Domain Providers → Statistic
// ---------------------------------------------------------------------------

export interface ResellerStat {
  id: string
  resellerId: number
  company: string
  provider: string
  month: string
  registrations: number
  renewals: number
  transfers: number
  deletions: number
  revenue: number
  failureRate: number
}

let _stats: Dataset<ResellerStat> | null = null
export function resellerStats(): Dataset<ResellerStat> {
  if (!_stats) {
    const rows: ResellerStat[] = []
    const months = Array.from({ length: 12 }, (_, m) => isoDate(NOW_MS - m * 30 * 86400000).slice(0, 7))
    resellerSample(60).forEach((r) => {
      const g = new Gen('stat', r.id)
      const provider = g.pick(PROVIDER_NAMES)
      months.forEach((month) => {
        const gg = new Gen('stat', r.id, month)
        const regs = gg.int(0, Math.max(4, Math.round(r.domains / 10)))
        rows.push({
          id: `ST-${r.id}-${month}`,
          resellerId: r.id,
          company: r.company,
          provider,
          month,
          registrations: regs,
          renewals: gg.int(0, Math.max(4, Math.round(r.domains / 8))),
          transfers: gg.int(0, 40),
          deletions: gg.int(0, 30),
          revenue: Math.round(regs * gg.float(6, 24) * 100) / 100,
          failureRate: Math.round(gg.float(0, 9) * 10) / 10,
        })
      })
    })
    _stats = materialized('reseller_stats', rows)
  }
  return _stats
}
