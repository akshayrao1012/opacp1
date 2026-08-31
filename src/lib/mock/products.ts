import { Gen, WORDS, TLDS, personName, companyName } from '../rng'
import { materialized, synthetic, type Dataset } from '../table'
import { patchable, type Deletable } from './patch'
import { resellers } from './resellers'

// ---------------------------------------------------------------------------
// SSL
// ---------------------------------------------------------------------------

export interface SslOrder extends Deletable {
  id: string
  commonName: string
  product: string
  brand: 'Comodo' | 'Sectigo' | "Let's Encrypt" | 'DigiCert' | 'GeoTrust'
  resellerId: number
  company: string
  status: 'active' | 'pending_validation' | 'issued' | 'expired' | 'cancelled' | 'failed'
  validation: 'DV' | 'OV' | 'EV'
  orderedAt: string
  issuedAt: string | null
  expiresAt: string
  price: number
  years: number
  sans: number
  autoRenew: boolean
  csrPresent: boolean
}

let _ssl: Dataset<SslOrder> | null = null
export function sslOrders(): Dataset<SslOrder> {
  if (!_ssl) {
    const rds = resellers()
    const rows: SslOrder[] = Array.from({ length: 7412 }, (_, i) => {
      const g = new Gen('ssl', i)
      const r = rds.at((i * 31) % rds.total)
      const status = g.weighted<SslOrder['status']>([
        ['active', 58], ['issued', 12], ['pending_validation', 11], ['expired', 12], ['cancelled', 4], ['failed', 3],
      ])
      const brand = g.weighted<SslOrder['brand']>([
        ['Sectigo', 38], ['Comodo', 26], ["Let's Encrypt", 18], ['DigiCert', 12], ['GeoTrust', 6],
      ])
      const validation = g.weighted<SslOrder['validation']>([['DV', 72], ['OV', 21], ['EV', 7]])
      return {
        id: `SSL-${300000 + i}`,
        commonName: `${g.bool(0.3) ? '*.' : ''}${g.pick(WORDS)}${g.int(2, 99)}.${g.pick(TLDS)}`,
        product: `${brand} ${validation === 'DV' ? 'PositiveSSL' : validation === 'OV' ? 'InstantSSL Pro' : 'EV SSL'}${g.bool(0.2) ? ' Wildcard' : ''}`,
        brand,
        resellerId: r.id,
        company: r.company,
        status,
        validation,
        orderedAt: g.dayOffset(-1200, -1),
        issuedAt: status === 'pending_validation' || status === 'failed' ? null : g.dayOffset(-1190, -1),
        expiresAt: g.dayOffset(-120, 420),
        price: g.money(0, 890),
        years: g.weighted([[1, 82], [2, 14], [3, 4]]),
        sans: g.weighted([[0, 70], [2, 18], [5, 8], [25, 4]]),
        autoRenew: g.bool(0.58),
        csrPresent: g.bool(0.9),
      }
    })
    _ssl = patchable(materialized('ssl_orders', rows), (r) => r.id)
  }
  return _ssl
}

export const comodoAccount = {
  account: 'openprovider-reseller-01',
  apiUser: 'op_ssl_api',
  password: 'C0m0do!Reseller-2026#prod',
  lastRotatedAt: '2025-11-04 08:12:00',
  rotationImpact: [
    'All queued SSL issuance calls fail until the new password is deployed to the SSL worker.',
    'Pending DV validations must be restarted by the reseller.',
    'The credential is shared by the SSL panel — sslpanel.io sessions are invalidated.',
  ],
}

// ---------------------------------------------------------------------------
// SpamExperts — configurations, bundles, domains (4,590)
// ---------------------------------------------------------------------------

export interface SpamConfig extends Deletable {
  id: string
  name: string
  scope: 'global' | 'reseller' | 'bundle'
  resellerId: number | null
  company: string | null
  spamThreshold: number
  quarantineDays: number
  outboundEnabled: boolean
  archiveEnabled: boolean
  updatedAt: string
  updatedBy: string
}

export interface SpamBundle extends Deletable {
  id: string
  name: string
  mailboxes: number
  domainsIncluded: number
  price: number
  currency: string
  active: boolean
  resellersUsing: number
  createdAt: string
}

export interface SpamDomain extends Deletable {
  id: string
  domain: string
  resellerId: number
  company: string
  bundle: string
  status: 'active' | 'suspended' | 'pending'
  mailboxes: number
  inboundToday: number
  spamRatio: number
  destination: string
  addedAt: string
  outbound: boolean
}

let _spamConfigs: Dataset<SpamConfig> | null = null
export function spamConfigs(): Dataset<SpamConfig> {
  if (!_spamConfigs) {
    const rds = resellers()
    const rows: SpamConfig[] = Array.from({ length: 86 }, (_, i) => {
      const g = new Gen('spamcfg', i)
      const scope = i === 0 ? 'global' : g.weighted<SpamConfig['scope']>([['reseller', 70], ['bundle', 30]])
      const r = rds.at((i * 41) % rds.total)
      return {
        id: `SC-${100 + i}`,
        name: i === 0 ? 'Platform default' : `${scope === 'reseller' ? r.company : 'Bundle'} profile ${i}`,
        scope,
        resellerId: scope === 'reseller' ? r.id : null,
        company: scope === 'reseller' ? r.company : null,
        spamThreshold: g.money(3, 9, 1),
        quarantineDays: g.pick([7, 14, 30, 60]),
        outboundEnabled: g.bool(0.6),
        archiveEnabled: g.bool(0.35),
        updatedAt: g.dateTimeOffset(-4000, -2),
        updatedBy: g.pick(['t.ops', 'a.rao', 'system', 'n.bergstrom']),
      }
    })
    _spamConfigs = patchable(materialized('spam_configs', rows), (r) => r.id)
  }
  return _spamConfigs
}

let _spamBundles: Dataset<SpamBundle> | null = null
export function spamBundles(): Dataset<SpamBundle> {
  if (!_spamBundles) {
    const rows: SpamBundle[] = Array.from({ length: 42 }, (_, i) => {
      const g = new Gen('spambundle', i)
      return {
        id: `SB-${500 + i}`,
        name: `${g.pick(['Starter', 'Business', 'Pro', 'Agency', 'Enterprise'])} ${g.pick(['Filter', 'Filter+Archive', 'Outbound'])} ${g.int(1, 50)}`,
        mailboxes: g.pick([5, 10, 25, 50, 100, 250, 1000]),
        domainsIncluded: g.pick([1, 5, 10, 25, 100]),
        price: g.money(1.5, 240),
        currency: 'EUR',
        active: g.bool(0.8),
        resellersUsing: g.int(0, 640),
        createdAt: g.dayOffset(-2200, -30),
      }
    })
    _spamBundles = patchable(materialized('spam_bundles', rows), (r) => r.id)
  }
  return _spamBundles
}

let _spamDomains: Dataset<SpamDomain> | null = null
export function spamDomains(): Dataset<SpamDomain> {
  if (!_spamDomains) {
    const rds = resellers()
    const bundles = spamBundles()
    const rows: SpamDomain[] = Array.from({ length: 4590 }, (_, i) => {
      const g = new Gen('spamdomain', i)
      const r = rds.at((i * 17) % rds.total)
      const inbound = g.int(0, 48000)
      return {
        id: `SD-${20000 + i}`,
        domain: `${g.pick(WORDS)}${g.int(2, 400)}.${g.pick(TLDS)}`,
        resellerId: r.id,
        company: r.company,
        bundle: bundles.at(i % bundles.total).name,
        status: g.weighted([['active', 88], ['suspended', 7], ['pending', 5]]),
        mailboxes: g.int(1, 320),
        inboundToday: inbound,
        spamRatio: Math.round(g.float(0.02, 0.94) * 100) / 100,
        destination: `mail.${g.pick(WORDS)}.${g.pick(['com', 'net', 'nl'])}`,
        addedAt: g.dayOffset(-1600, -1),
        outbound: g.bool(0.3),
      }
    })
    _spamDomains = patchable(materialized('spam_domains', rows), (r) => r.id)
  }
  return _spamDomains
}

// ---------------------------------------------------------------------------
// Licenses — 108,216 records
// ---------------------------------------------------------------------------

export type LicenseProduct = 'Plesk' | 'Virtuozzo' | 'cPanel' | 'CloudLinux' | 'Acronis' | 'SolusVM'

export interface License extends Deletable {
  id: string
  key: string
  product: LicenseProduct
  edition: string
  resellerId: number
  company: string
  status: 'active' | 'suspended' | 'terminated' | 'pending'
  ipAddress: string
  activatedAt: string
  renewsAt: string
  billingCycle: 'monthly' | 'yearly'
  price: number
  seats: number
  migrationBatch: string | null
  vendorAccount: string
}

const LICENSE_COUNT = 108_216

let _licenses: Dataset<License> | null = null
export function licenses(): Dataset<License> {
  if (!_licenses) {
    const rds = resellers()
    _licenses = patchable(
      synthetic<License>('licenses', LICENSE_COUNT, (i) => {
        const g = new Gen('license', i)
        const r = rds.at((i * 13) % rds.total)
        const product = g.weighted<LicenseProduct>([
          ['Plesk', 44], ['cPanel', 22], ['Virtuozzo', 12], ['CloudLinux', 11], ['Acronis', 7], ['SolusVM', 4],
        ])
        const batch = g.bool(0.14) ? `MIG-${g.int(2024, 2026)}-${g.int(1, 42).toString().padStart(3, '0')}` : null
        return {
          id: `LIC-${1_000_000 + i}`,
          key: `${product.slice(0, 2).toUpperCase()}${g.int(1000, 9999)}-${g.int(1000, 9999)}-${g.int(1000, 9999)}-${g.int(1000, 9999)}`,
          product,
          edition: g.pick(['Web Admin', 'Web Pro', 'Web Host', 'Host Plus', 'Solo', 'Admin', 'VPS']),
          resellerId: r.id,
          company: r.company,
          status: g.weighted([['active', 78], ['suspended', 8], ['terminated', 11], ['pending', 3]]),
          ipAddress: `${g.int(37, 213)}.${g.int(0, 255)}.${g.int(0, 255)}.${g.int(1, 254)}`,
          activatedAt: g.dayOffset(-2400, -1),
          renewsAt: g.dayOffset(-40, 400),
          billingCycle: g.weighted([['monthly', 71], ['yearly', 29]]),
          price: g.money(1.2, 84),
          seats: g.weighted([[1, 80], [5, 12], [10, 5], [50, 3]]),
          migrationBatch: batch,
          vendorAccount: g.pick(['op-plesk-01', 'op-cpanel-02', 'op-virtuozzo-01', 'op-acronis-03']),
        }
      }),
      (r) => r.id,
    )
  }
  return _licenses
}

// ---------------------------------------------------------------------------
// DNS zones
// ---------------------------------------------------------------------------

export interface DnsZone extends Deletable {
  id: string
  name: string
  resellerId: number
  company: string
  type: 'master' | 'slave' | 'template'
  records: number
  dnssec: boolean
  updatedAt: string
  createdAt: string
  soaSerial: number
  status: 'active' | 'inactive' | 'error'
  provider: 'Openprovider DNS' | 'Reseller NS' | 'Cloudflare'
  orphaned: boolean
}

let _dns: Dataset<DnsZone> | null = null
export function dnsZones(): Dataset<DnsZone> {
  if (!_dns) {
    const rds = resellers()
    _dns = patchable(
      synthetic<DnsZone>('dns_zones', 61_480, (i) => {
        const g = new Gen('dns', i)
        const r = rds.at((i * 7) % rds.total)
        return {
          id: `DZ-${900000 + i}`,
          name: `${g.pick(WORDS)}${g.int(2, 900)}.${g.pick(TLDS)}`,
          resellerId: r.id,
          company: r.company,
          type: g.weighted([['master', 88], ['slave', 8], ['template', 4]]),
          records: g.int(2, 240),
          dnssec: g.bool(0.28),
          updatedAt: g.dateTimeOffset(-9000, -1),
          createdAt: g.dayOffset(-2600, -1),
          soaSerial: Number(`2026${g.int(10, 99)}${g.int(10, 99)}${g.int(10, 99)}`),
          status: g.weighted([['active', 90], ['inactive', 7], ['error', 3]]),
          provider: g.weighted([['Openprovider DNS', 82], ['Reseller NS', 13], ['Cloudflare', 5]]),
          orphaned: g.bool(0.06),
        }
      }),
      (r) => r.id,
    )
  }
  return _dns
}

export interface DnsRecord {
  name: string
  type: string
  ttl: number
  value: string
  prio?: number
}

export function dnsRecords(zone: string): DnsRecord[] {
  const g = new Gen('dnsrec', zone)
  const ip = `${g.int(37, 213)}.${g.int(0, 255)}.${g.int(0, 255)}.${g.int(1, 254)}`
  return [
    { name: '@', type: 'A', ttl: 3600, value: ip },
    { name: 'www', type: 'CNAME', ttl: 3600, value: `${zone}.` },
    { name: '@', type: 'MX', ttl: 3600, value: 'mx1.openprovider.nl.', prio: 10 },
    { name: '@', type: 'MX', ttl: 3600, value: 'mx2.openprovider.be.', prio: 20 },
    { name: '@', type: 'TXT', ttl: 3600, value: 'v=spf1 include:_spf.openprovider.nl ~all' },
    { name: '_dmarc', type: 'TXT', ttl: 3600, value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@' + zone },
  ]
}

// ---------------------------------------------------------------------------
// Virtual products
// ---------------------------------------------------------------------------

export interface VirtualProduct extends Deletable {
  id: string
  name: string
  sku: string
  category: 'hosting' | 'email' | 'security' | 'service' | 'addon'
  price: number
  currency: string
  billingCycle: 'once' | 'monthly' | 'yearly'
  active: boolean
  subscriptions: number
  createdBy: string
  createdAt: string
  description: string
}

let _virtual: Dataset<VirtualProduct> | null = null
export function virtualProducts(): Dataset<VirtualProduct> {
  if (!_virtual) {
    const rows: VirtualProduct[] = Array.from({ length: 96 }, (_, i) => {
      const g = new Gen('virtual', i)
      const cat = g.pick(['hosting', 'email', 'security', 'service', 'addon'] as const)
      const name = `${g.pick(['Managed', 'Basic', 'Premium', 'Pro', 'Business'])} ${g.pick(['Backup', 'Migration', 'Setup', 'Mailbox', 'Firewall', 'Monitoring', 'DNS Anycast', 'WHOIS Privacy'])}`
      return {
        id: `VP-${700 + i}`,
        name,
        sku: `${cat.slice(0, 3).toUpperCase()}-${g.int(1000, 9999)}`,
        category: cat,
        price: g.money(0, 499),
        currency: 'EUR',
        billingCycle: g.weighted([['monthly', 50], ['yearly', 30], ['once', 20]]),
        active: g.bool(0.76),
        subscriptions: g.int(0, 12400),
        createdBy: g.pick(['commercial.team', 'a.rao', 'system']),
        createdAt: g.dayOffset(-2000, -20),
        description: `${name} — billed ${g.pick(['per domain', 'per account', 'per mailbox', 'per incident'])}.`,
      }
    })
    _virtual = patchable(materialized('virtual_products', rows), (r) => r.id)
  }
  return _virtual
}

// ---------------------------------------------------------------------------
// Trademarks
// ---------------------------------------------------------------------------

export interface Trademark extends Deletable {
  id: string
  mark: string
  owner: string
  resellerId: number
  company: string
  jurisdiction: string
  registrationNumber: string
  tmchStatus: 'verified' | 'pending' | 'expired' | 'rejected'
  smdValidUntil: string
  claimsNotices: number
  sunriseEligible: boolean
  submittedAt: string
  labels: number
}

let _trademarks: Dataset<Trademark> | null = null
export function trademarks(): Dataset<Trademark> {
  if (!_trademarks) {
    const rds = resellers()
    const rows: Trademark[] = Array.from({ length: 384 }, (_, i) => {
      const g = new Gen('tm', i)
      const r = rds.at((i * 43) % rds.total)
      return {
        id: `TM-${8000 + i}`,
        mark: `${g.pick(WORDS).toUpperCase()}${g.bool(0.4) ? ' ' + g.pick(WORDS).toUpperCase() : ''}`,
        owner: g.bool(0.7) ? companyName(g) : personName(g),
        resellerId: r.id,
        company: r.company,
        jurisdiction: g.pick(['EUIPO', 'USPTO', 'WIPO', 'UKIPO', 'DPMA', 'INPI', 'BOIP']),
        registrationNumber: `${g.int(100000, 999999)}${g.pick(['A', 'B', 'C'])}`,
        tmchStatus: g.weighted([['verified', 66], ['pending', 18], ['expired', 12], ['rejected', 4]]),
        smdValidUntil: g.dayOffset(-100, 900),
        claimsNotices: g.int(0, 340),
        sunriseEligible: g.bool(0.5),
        submittedAt: g.dayOffset(-1500, -10),
        labels: g.int(1, 12),
      }
    })
    _trademarks = patchable(materialized('trademarks', rows), (r) => r.id)
  }
  return _trademarks
}

// ---------------------------------------------------------------------------
// License migrations — Licenses module, "Migrations" tab
// ---------------------------------------------------------------------------

export interface LicenseMigration extends Deletable {
  id: string
  batch: string
  source: 'Plesk' | 'Virtuozzo' | 'cPanel'
  target: string
  keys: number
  migrated: number
  failed: number
  status: 'planned' | 'awaiting_approval' | 'running' | 'completed' | 'failed' | 'rolled_back'
  startedBy: string
  startedAt: string
  finishedAt: string | null
  chunkSize: number
  comment: string
  ticket: string
  approver: string | null
}

let _migrations: Dataset<LicenseMigration> | null = null
export function licenseMigrations(): Dataset<LicenseMigration> {
  if (!_migrations) {
    const rows: LicenseMigration[] = Array.from({ length: 42 }, (_, i) => {
      const g = new Gen('licmig', i)
      const keys = g.int(20, 12000)
      const status = i === 0
        ? 'running'
        : i === 1
          ? 'awaiting_approval'
          : g.weighted<LicenseMigration['status']>([
              ['completed', 62], ['failed', 12], ['planned', 12], ['rolled_back', 6], ['running', 8],
            ])
      const failed = status === 'failed' ? g.int(1, Math.round(keys * 0.3)) : g.weighted([[0, 72], [g.int(1, 40), 28]])
      const migrated = status === 'completed' ? keys - failed : Math.round(keys * g.float(0, 0.85))
      const source = g.weighted<LicenseMigration['source']>([['Plesk', 62], ['Virtuozzo', 24], ['cPanel', 14]])
      return {
        id: `LM-${4000 + i}`,
        batch: `MIG-${g.int(2024, 2026)}-${String(g.int(1, 90)).padStart(3, '0')}`,
        source,
        target: g.pick(['op-plesk-01', 'op-plesk-02', 'op-virtuozzo-01', 'op-cpanel-02']),
        keys,
        migrated,
        failed,
        status,
        startedBy: g.pick(['n.bergstrom', 't.ops', 'a.rao', 'vendor.sync']),
        startedAt: g.dateTimeOffset(-6000, -10),
        finishedAt: status === 'completed' || status === 'failed' || status === 'rolled_back' ? g.dateTimeOffset(-5800, -4) : null,
        chunkSize: g.pick([100, 250, 500]),
        comment: g.pick([
          'Vendor account consolidation after the 2025 contract change.',
          'Moving keys off the deprecated Virtuozzo account.',
          'Reseller requested a dedicated vendor account.',
          'Wave 3 of the Plesk migration programme.',
        ]),
        ticket: `ZD-${g.int(440000, 449999)}`,
        approver: status === 'awaiting_approval' ? null : g.pick(['a.rao', 'h.vermeer', 'k.oosterhuis']),
      }
    })
    _migrations = patchable(materialized('license_migrations', rows), (r) => r.id)
  }
  return _migrations
}
