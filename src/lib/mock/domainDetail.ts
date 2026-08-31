/**
 * The full field set from the legacy Domain-Details screen.
 *
 * Deliberately kept out of the 249k-row list factory: list rows stay lean so
 * table scans are cheap, and the detail record is derived from the same seed on
 * demand, so it is stable for a given domain.
 */

import { Gen, personName } from '../rng'
import { eppLookup, type Domain } from './domains'

export interface NameserverRow {
  name: string
  ip: string
  ipv6: string
}

export interface DomainMutation {
  id: string
  action: string
  at: string
  by: string
  detail: string
}

export interface DomainInvoiceLine {
  id: string
  at: string
  trx: string
  status: 'open' | 'completed' | 'cancelled' | 'refunded'
  gross: number
  cost: number
  qty: number
  currency: string
  refund: number
}

export interface AbuseReport {
  id: string
  at: string
  reporter: string
  category: string
  action: string
  status: 'notified' | 'held' | 'deleted' | 'dismissed' | 'awaiting_response'
  message: string
}

export type YesNo = 'yes' | 'no'

export interface DomainDetailRecord {
  // Dates — the legacy screen showed six, several of them rendered as a bare "0".
  orderDate: string
  activeDate: string | null
  renewalDate: string | null
  expirationAtRegistry: string
  expirationDate: string | null
  // Pending registry operation.
  action: 'none' | 'transfer' | 'register' | 'renew' | 'delete' | 'restore'
  actionStatus: string
  actionStatusExpiresAt: string | null
  controllerClass: string
  currentProvider: string
  providerCode: string
  privateComment: string
  deletionReasons: string
  isDeleted: YesNo
  statusCode: string
  autoRenewSetting: 'default' | 'on' | 'off'
  resellerAutoRenew: 'on' | 'off'
  lockedStatus: 'on' | 'off'
  wppEnabled: 'on' | 'off'
  consentForPublishing: YesNo
  authorizationCode: string
  emailVerified: YesNo
  phoneVerified: YesNo
  ownerContactVerified: YesNo
  // Contacts.
  ownerName: string
  ownerHandle: string
  adminHandle: string
  adminName: string
  techHandle: string
  techName: string
  ownerVerificationStatus: string
  identityVerificationState: 'not_started' | 'in_progress' | 'verified' | 'failed'
  // Flags.
  isBlocked: YesNo
  isAbusive: YesNo
  isClientHoldEnabled: YesNo
  isParked: YesNo
  isLockedTransferProhibited: YesNo
  usesDomicile: YesNo
  // DNS.
  nameserverGroup: string
  dnssecEnabled: YesNo
  hasActiveSectigoZone: YesNo
  // Abuse counters.
  abuseNotifyCount: number
  abuseHoldCount: number
  abuseDeleteCount: number
}

const ACTION_STATUSES: Record<string, string[]> = {
  transfer: ['foa1Pending', 'foa1Expired', 'ackPending', 'registryPending', 'completed'],
  register: ['registryPending', 'completed', 'failed'],
  renew: ['invoicePending', 'registryPending', 'completed'],
  delete: ['quarantine', 'registryPending', 'completed'],
  restore: ['invoicePending', 'registryPending', 'completed'],
  none: ['—'],
}

/** Matches the legacy "Current provider" format: name (scope) [protocol] [id]. */
const PROVIDER_META: Record<string, [string, string, number]> = {
  SIDN: ['.nl', 'epp', 12],
  DENIC: ['.de', 'epp', 31],
  Verisign: ['.com, .net', 'epp', 4],
  EURid: ['.eu', 'epp', 22],
  AFNIC: ['.fr, .re, .pm', 'epp', 45],
  Nominet: ['.uk, .co.uk', 'epp', 17],
  'DNS Belgium': ['.be', 'epp', 26],
  PIR: ['.org', 'epp', 9],
  'Red.es': ['.es', 'epp', 51],
  'Registro.it': ['.it', 'epp', 38],
  'Google Registry': ['.dev, .app', 'epp', 71],
  'GMO Registry': ['.shop', 'epp', 66],
  Radix: ['.online, .site, .store', 'epp', 58],
  'Aruba PEC': ['.cloud', 'epp', 63],
  'Identity Digital': ['newGTLD (.info, .live, .life, etc)', 'epp', 61],
  CentralNic: ['ccTLD domains (.ru, .xn--p1ai, etc)', 'drs', 88],
}

function providerLabel(provider: string): string {
  const meta = PROVIDER_META[provider]
  return meta ? `${provider} (${meta[0]}) [${meta[1]}] [${meta[2]}]` : `${provider} [epp]`
}

/** Internal controller class, keyed off the TLD family as in the legacy ACP. */
function controllerClass(tld: string): string {
  if (tld === 'co.uk') return 'Uk'
  if (tld === 'eu') return 'Eu'
  if (tld.length === 2) return tld.charAt(0).toUpperCase() + tld.slice(1)
  return 'Gtld'
}

const PRIVATE_COMMENTS = [
  'Reseller asked us not to auto-renew — see ZD-441902.',
  'Registrant data disputed; do not push updates to the registry.',
  'Migrated from a legacy provider in 2024-06; watch the expiry date.',
  'High-value client. Escalate anything to the account manager first.',
]

export function domainDetail(d: Domain): DomainDetailRecord {
  const g = new Gen('domaindetail', d.id)
  const action: DomainDetailRecord['action'] =
    d.status === 'pending_transfer'
      ? 'transfer'
      : g.weighted<DomainDetailRecord['action']>([
          ['none', 62], ['renew', 14], ['transfer', 10], ['register', 8], ['delete', 4], ['restore', 2],
        ])
  const statuses = ACTION_STATUSES[action] ?? ['—']
  const held = d.status === 'clientHold'
  const abusive = d.abuseReports > 0
  return {
    orderDate: g.dateTimeOffset(-3600 * 24, -3400 * 24),
    activeDate: g.bool(0.86) ? `${d.createdAt} 01:00:00` : null,
    renewalDate: g.bool(0.55) ? g.dayOffset(-30, 340) : null,
    expirationAtRegistry: `${d.expiresAt} 16:22:00`,
    expirationDate: g.bool(0.7) ? d.expiresAt : null,
    action,
    actionStatus: g.pick(statuses),
    actionStatusExpiresAt: action === 'none' ? null : g.dayOffset(-20, 40),
    controllerClass: controllerClass(d.tld),
    currentProvider: providerLabel(d.provider),
    providerCode: String(g.int(4, 120)),
    privateComment: g.bool(0.28) ? g.pick(PRIVATE_COMMENTS) : '',
    deletionReasons:
      d.status === 'expired' || d.status === 'quarantine'
        ? g.pick(['Expired — not renewed by the reseller', 'Insufficient balance at renewal', 'Registrant requested deletion'])
        : '',
    isDeleted: 'no',
    statusCode: held
      ? 'HLD'
      : d.status === 'expired'
        ? 'EXP'
        : d.status === 'quarantine'
          ? 'QUA'
          : d.status === 'pending_transfer'
            ? 'TRF'
            : g.weighted([['ACT', 88], ['FAI', 12]]),
    autoRenewSetting: d.autoRenew ? g.weighted<'default' | 'on'>([['default', 70], ['on', 30]]) : 'off',
    resellerAutoRenew: g.weighted([['on', 62], ['off', 38]]),
    lockedStatus: d.transferLock ? 'on' : 'off',
    wppEnabled: g.weighted([['off', 74], ['on', 26]]),
    consentForPublishing: g.weighted([['no', 58], ['yes', 42]]),
    authorizationCode: eppLookup(d.name).authInfo,
    emailVerified: g.weighted([['yes', 78], ['no', 22]]),
    phoneVerified: g.weighted([['no', 68], ['yes', 32]]),
    ownerContactVerified: g.weighted([['no', 56], ['yes', 44]]),
    ownerName: d.registrantName || personName(g),
    ownerHandle: d.registrantHandle,
    adminHandle: `OP-${g.int(100000, 999999)}`,
    adminName: personName(g),
    techHandle: `OP-${g.int(100000, 999999)}`,
    techName: personName(g),
    ownerVerificationStatus: g.pick(['No action', 'Awaiting registrant reply', 'Verified 2026-04-11', 'Reminder 2 sent']),
    identityVerificationState: g.weighted([['not_started', 52], ['in_progress', 18], ['verified', 24], ['failed', 6]]),
    isBlocked: g.weighted([['no', 94], ['yes', 6]]),
    isAbusive: abusive ? 'yes' : 'no',
    isClientHoldEnabled: held ? 'yes' : 'no',
    isParked: g.weighted([['no', 90], ['yes', 10]]),
    isLockedTransferProhibited: d.transferLock ? 'yes' : 'no',
    usesDomicile: g.weighted([['no', 88], ['yes', 12]]),
    nameserverGroup: g.bool(0.6) ? d.name : g.pick(['openprovider-default', 'reseller-group-01', 'cloudflare-ns', '—']),
    dnssecEnabled: d.dnssec ? 'yes' : 'no',
    hasActiveSectigoZone: g.weighted([['no', 82], ['yes', 18]]),
    abuseNotifyCount: abusive ? g.int(1, 6) : 0,
    abuseHoldCount: held ? g.int(1, 3) : 0,
    abuseDeleteCount: 0,
  }
}

export function parseNameservers(raw: string): NameserverRow[] {
  return raw
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
    .map((host) => {
      const g = new Gen('ns', host)
      const glue = !host.includes('openprovider')
      return {
        name: host,
        ip: glue && g.bool(0.5) ? `${g.int(37, 213)}.${g.int(0, 255)}.${g.int(0, 255)}.${g.int(1, 254)}` : '',
        ipv6: glue && g.bool(0.2) ? `2a02:${g.int(1000, 9999)}:${g.int(10, 99)}::${g.int(1, 99)}` : '',
      }
    })
}

const MUTATION_ACTIONS = [
  'nameservers.update', 'contact.update', 'autorenew.change', 'transfer.request', 'transfer.ack',
  'renew.registry', 'authcode.regenerate', 'dnssec.enable', 'clienthold.apply', 'clienthold.remove',
  'invoice.complete', 'domain.restore',
]

export function domainMutations(d: Domain): DomainMutation[] {
  const g = new Gen('mutations', d.id)
  const n = g.weighted([[0, 22], [g.int(1, 4), 48], [g.int(5, 14), 30]])
  return Array.from({ length: n }, (_, i) => {
    const gg = new Gen('mutation', d.id, i)
    return {
      id: String(52_000_000 + gg.int(1, 999_999)),
      action: gg.pick(MUTATION_ACTIONS),
      at: gg.dateTimeOffset(-9000, -2),
      by: gg.weighted([['system', 40], ['reseller-api', 32], ['m.kowalski', 12], ['n.bergstrom', 10], ['a.rao', 6]]),
      detail: gg.pick(['via reseller API v1beta', 'via ACP', 'registry-initiated', 'scheduled job']),
    }
  }).sort((a, b) => (a.at < b.at ? 1 : -1))
}

export function domainInvoiceLines(d: Domain): DomainInvoiceLine[] {
  const g = new Gen('invlines', d.id)
  const n = g.weighted([[1, 46], [2, 30], [g.int(3, 6), 24]])
  return Array.from({ length: n }, (_, i) => {
    const gg = new Gen('invline', d.id, i)
    const gross = gg.money(3, 240)
    const status = gg.weighted<DomainInvoiceLine['status']>([
      ['completed', 58], ['open', 18], ['cancelled', 16], ['refunded', 8],
    ])
    return {
      id: String(52_500_000 + gg.int(1, 999_999)),
      at: gg.dateTimeOffset(-9000, -4),
      trx: gg.pick(['REGISTER', 'RENEW', 'TRANSFER', 'RESTORE', 'PREMIUM']),
      status,
      gross,
      cost: Math.round(gross * gg.float(0.55, 0.92) * 100) / 100,
      qty: 1,
      currency: gg.weighted([['EUR', 74], ['USD', 14], ['RUB', 12]]),
      refund: status === 'refunded' ? gross : 0,
    }
  }).sort((a, b) => (a.at < b.at ? 1 : -1))
}

const ABUSE_MESSAGES = [
  'Credential-harvesting page imitating a Dutch bank on /login.',
  'Domain resolves to a host serving a malicious installer.',
  'High-volume spam originating from the mail host.',
  'Reported by the trademark holder with TMCH evidence attached.',
]

export function domainAbuseReports(d: Domain): AbuseReport[] {
  if (d.abuseReports === 0) return []
  return Array.from({ length: d.abuseReports }, (_, i) => {
    const gg = new Gen('abusereport', d.id, i)
    return {
      id: `AB-${gg.int(100000, 999999)}`,
      at: gg.dateTimeOffset(-4000, -3),
      reporter: gg.pick(['SIDN abuse desk', 'Netcraft', 'Spamhaus', 'anti-phishing@bank.example', 'Registrant complaint', 'Internal scan']),
      category: gg.pick(['Phishing', 'Malware distribution', 'Spam source', 'Trademark infringement', 'Botnet C2']),
      action: gg.pick(['Notified reseller', 'Parked domain', 'Applied clientHold', 'Dismissed — false positive']),
      status: gg.weighted<AbuseReport['status']>([
        ['notified', 40], ['held', 22], ['dismissed', 20], ['awaiting_response', 18],
      ]),
      message: gg.pick(ABUSE_MESSAGES),
    }
  }).sort((a, b) => (a.at < b.at ? 1 : -1))
}

export const ABUSE_NOTIFY_OPTIONS = [
  'Reseller default settings',
  'Notify reseller and registrant',
  'Notify reseller only',
  'Do not notify',
]

export const ABUSE_ACTIONS = [
  'Common case (park domain after 5 days / default reseller settings)',
  'Park domain immediately',
  'Apply clientHold immediately',
  'Without any action (record the report only)',
]

export const ABUSE_CATEGORIES = ['Phishing', 'Malware distribution', 'Spam source', 'Trademark infringement', 'Botnet C2', 'Other']
