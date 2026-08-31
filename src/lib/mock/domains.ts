import { Gen, TLDS, WORDS, personName } from '../rng'
import { materialized, synthetic, type Dataset } from '../table'
import { patchable, type Deletable } from './patch'
import { resellers } from './resellers'

export type DomainStatus = 'active' | 'expired' | 'quarantine' | 'clientHold' | 'pending_transfer' | 'deleted'

export interface Domain extends Deletable {
  id: number
  name: string
  tld: string
  resellerId: number
  company: string
  status: DomainStatus
  createdAt: string
  expiresAt: string
  autoRenew: boolean
  premium: boolean
  premiumPrice: number | null
  registrantHandle: string
  registrantName: string
  nameservers: string
  dnssec: boolean
  transferLock: boolean
  provider: string
  abuseReports: number
  suspended: boolean
  years: number
}

/** Which registry actually runs each TLD — a .dev domain is never at SIDN. */
export const REGISTRY_BY_TLD: Record<string, string> = {
  nl: 'SIDN',
  de: 'DENIC',
  fr: 'AFNIC',
  be: 'DNS Belgium',
  eu: 'EURid',
  'co.uk': 'Nominet',
  com: 'Verisign',
  net: 'Verisign',
  org: 'PIR',
  info: 'Identity Digital',
  biz: 'Identity Digital',
  es: 'Red.es',
  it: 'Registro.it',
  io: 'Identity Digital',
  dev: 'Google Registry',
  app: 'Google Registry',
  shop: 'GMO Registry',
  online: 'Radix',
  cloud: 'Aruba PEC',
  agency: 'Identity Digital',
}

export function registryFor(tld: string): string {
  return REGISTRY_BY_TLD[tld] ?? 'CentralNic'
}

const DOMAIN_COUNT = 248_930

function makeDomain(i: number): Domain {
  const g = new Gen('domain', i)
  const rds = resellers()
  const r = rds.at((i * 37) % rds.total)
  const style = i % 3
  const base =
    style === 0 ? `${g.pick(WORDS)}${g.int(2, 999)}`
    : style === 1 ? `${g.pick(WORDS)}-${g.pick(WORDS)}`
    : `${g.pick(WORDS)}${g.pick(WORDS)}`
  const tld = g.pick(TLDS)
  const premium = g.bool(0.018)
  const status = g.weighted<DomainStatus>([
    ['active', 86], ['expired', 5], ['quarantine', 3], ['clientHold', 2], ['pending_transfer', 4],
  ])
  const name = `${base}.${tld}`
  const registrantName = personName(g)
  return {
    id: 5_000_000 + i,
    name,
    tld,
    resellerId: r.id,
    company: r.company,
    status,
    createdAt: g.dayOffset(-3600, -2),
    expiresAt: g.dayOffset(-90, 1090),
    autoRenew: g.bool(0.74),
    premium,
    premiumPrice: premium ? g.money(180, 24000) : null,
    registrantHandle: `OP-${g.int(100000, 999999)}`,
    registrantName,
    nameservers: g.bool(0.6) ? 'ns1.openprovider.nl, ns2.openprovider.be' : `ns1.${r.company.split(' ')[0].toLowerCase()}.com, ns2.${r.company.split(' ')[0].toLowerCase()}.com`,
    dnssec: g.bool(0.31),
    transferLock: g.bool(0.66),
    provider: registryFor(tld),
    abuseReports: g.weighted([[0, 92], [1, 5], [2, 2], [7, 1]]),
    suspended: status === 'clientHold',
    years: g.weighted([[1, 78], [2, 12], [3, 6], [5, 3], [10, 1]]),
  }
}

let _domains: Dataset<Domain> | null = null
export function domains(): Dataset<Domain> {
  if (!_domains) _domains = patchable(synthetic('domains', DOMAIN_COUNT, makeDomain), (d) => String(d.id))
  return _domains
}

export function findDomainByName(name: string): Domain | undefined {
  const ds = domains()
  const needle = name.trim().toLowerCase()
  for (let i = 0; i < ds.total; i++) {
    const d = ds.at(i)
    if (d.name === needle) return d
  }
  return undefined
}

export function findDomain(id: number): Domain | undefined {
  const ds = domains()
  const i = id - 5_000_000
  if (i >= 0 && i < ds.total) return ds.at(i)
  return undefined
}

export function domainsOfReseller(resellerId: number, limit = 25): Domain[] {
  const ds = domains()
  const out: Domain[] = []
  for (let i = 0; i < ds.total && out.length < limit; i++) {
    const d = ds.at(i)
    if (d.resellerId === resellerId) out.push(d)
  }
  return out
}

// ---------------------------------------------------------------------------
// Transfers — 3rdPTS + internal, one module with tabs
// ---------------------------------------------------------------------------

export type TransferKind = 'third_party_in' | 'third_party_out' | 'internal'
export type TransferStatus = 'pending' | 'ack_required' | 'in_progress' | 'completed' | 'failed' | 'cancelled'

export interface Transfer extends Deletable {
  id: string
  domain: string
  kind: TransferKind
  status: TransferStatus
  fromResellerId: number
  fromCompany: string
  toResellerId: number
  toCompany: string
  requestedAt: string
  updatedAt: string
  authCodeValid: boolean
  registry: string
  attempts: number
  failureReason: string | null
  ageHours: number
}

const TRANSFER_FAILURES = [
  'Invalid auth code', 'Registry rejected: domain locked', 'Registrant email bounced',
  'Losing registrar NACK', 'Domain within 60 days of registration', 'Insufficient balance',
]

let _transfers: Dataset<Transfer> | null = null
export function transfers(): Dataset<Transfer> {
  if (!_transfers) {
    const rds = resellers()
    const rows: Transfer[] = Array.from({ length: 6420 }, (_, i) => {
      const g = new Gen('transfer', i)
      const from = rds.at((i * 11) % rds.total)
      const to = rds.at((i * 29 + 5) % rds.total)
      const kind = g.weighted<TransferKind>([['third_party_in', 52], ['third_party_out', 23], ['internal', 25]])
      const status = g.weighted<TransferStatus>([
        ['completed', 46], ['in_progress', 18], ['pending', 14], ['ack_required', 9], ['failed', 10], ['cancelled', 3],
      ])
      const age = g.int(1, 900)
      const tld = g.pick(TLDS)
      return {
        id: `TR-${700000 + i}`,
        domain: `${g.pick(WORDS)}${g.int(2, 400)}.${tld}`,
        kind,
        status,
        fromResellerId: from.id,
        fromCompany: from.company,
        toResellerId: to.id,
        toCompany: to.company,
        requestedAt: g.dateTimeOffset(-age, -age + 1),
        updatedAt: g.dateTimeOffset(-Math.max(1, age - 40), -1),
        authCodeValid: status !== 'failed' || g.bool(0.4),
        registry: registryFor(tld),
        attempts: g.int(1, 5),
        failureReason: status === 'failed' ? g.pick(TRANSFER_FAILURES) : null,
        ageHours: age,
      }
    })
    _transfers = patchable(materialized('transfers', rows), (r) => r.id)
  }
  return _transfers
}

// ---------------------------------------------------------------------------
// Domain notifications
// ---------------------------------------------------------------------------

export interface DomainNotification extends Deletable {
  id: string
  domain: string
  resellerId: number
  company: string
  type: string
  channel: 'email' | 'webhook'
  scheduledAt: string
  sentAt: string | null
  status: 'scheduled' | 'sent' | 'failed' | 'suppressed'
  recipient: string
  template: string
  attempts: number
}

export const NOTIFICATION_TYPES = [
  'expiry_60d', 'expiry_30d', 'expiry_7d', 'expiry_1d', 'quarantine_start',
  'transfer_away', 'renewal_failed', 'dnssec_broken', 'registrant_verification',
]

let _domainNotifications: Dataset<DomainNotification> | null = null
export function domainNotifications(): Dataset<DomainNotification> {
  if (!_domainNotifications) {
    const dds = domains()
    _domainNotifications = patchable(
      synthetic<DomainNotification>('domain_notifications', 42_800, (i) => {
        const g = new Gen('dnotif', i)
        const d = dds.at((i * 53) % dds.total)
        const status = g.weighted<DomainNotification['status']>([
          ['sent', 74], ['scheduled', 15], ['failed', 7], ['suppressed', 4],
        ])
        return {
          id: `DN-${800000 + i}`,
          domain: d.name,
          resellerId: d.resellerId,
          company: d.company,
          type: g.pick(NOTIFICATION_TYPES),
          channel: g.weighted([['email', 78], ['webhook', 22]]),
          scheduledAt: g.dateTimeOffset(-1200, 400),
          sentAt: status === 'sent' ? g.dateTimeOffset(-1200, -1) : null,
          status,
          recipient: `${g.pick(['admin', 'owner', 'billing'])}@${d.name}`,
          template: g.pick(['notify_expiry_v3', 'notify_expiry_v2', 'notify_transfer_v1', 'notify_dnssec_v1']),
          attempts: status === 'failed' ? g.int(2, 6) : 1,
        }
      }),
      (r) => r.id,
    )
  }
  return _domainNotifications
}

// ---------------------------------------------------------------------------
// EPP domain info — Domains → Domain info
// ---------------------------------------------------------------------------

export interface EppResponse {
  domain: string
  code: number
  message: string
  registry: string
  roid: string
  statuses: string[]
  registrant: string
  admin: string
  tech: string
  billing: string
  nameservers: { host: string; ipv4?: string }[]
  created: string
  updated: string
  expires: string
  transferLock: boolean
  dnssec: { keyTag: number; algorithm: number; digest: string }[]
  authInfo: string
  raw: string
  latencyMs: number
}

export function eppLookup(domainName: string): EppResponse {
  const g = new Gen('epp', domainName.toLowerCase())
  const known = findDomainByName(domainName)
  const statuses = known
    ? [
        known.status === 'clientHold' ? 'clientHold' : 'ok',
        ...(known.transferLock ? ['clientTransferProhibited'] : []),
        ...(known.status === 'pending_transfer' ? ['pendingTransfer'] : []),
      ]
    : ['ok', 'clientTransferProhibited']
  const ns = (known?.nameservers ?? 'ns1.openprovider.nl, ns2.openprovider.be')
    .split(',')
    .map((h) => ({ host: h.trim(), ipv4: `${g.int(37, 213)}.${g.int(0, 255)}.${g.int(0, 255)}.${g.int(1, 254)}` }))
  const resp = {
    domain: domainName.toLowerCase(),
    code: 1000,
    message: 'Command completed successfully',
    registry: known?.provider ?? 'CentralNic',
    roid: `D${g.int(10000000, 99999999)}-OP`,
    statuses,
    registrant: known?.registrantHandle ?? `OP-${g.int(100000, 999999)}`,
    admin: `OP-${g.int(100000, 999999)}`,
    tech: `OP-${g.int(100000, 999999)}`,
    billing: `OP-${g.int(100000, 999999)}`,
    nameservers: ns,
    created: known?.createdAt ?? g.dayOffset(-2000, -100),
    updated: g.dayOffset(-200, -1),
    expires: known?.expiresAt ?? g.dayOffset(30, 700),
    transferLock: known?.transferLock ?? true,
    dnssec: known?.dnssec
      ? [{ keyTag: g.int(1000, 65000), algorithm: 13, digest: g.int(1e15, 9e15).toString(16).repeat(2) }]
      : [],
    authInfo: `${g.pick(['Kx', 'Zq', 'Vp'])}${g.int(100000, 999999)}#${g.pick(['aa', 'bz', 'qr'])}`,
    latencyMs: g.int(84, 940),
  }
  return { ...resp, raw: JSON.stringify({ epp: { response: resp } }, null, 2) }
}
