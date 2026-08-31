import { Gen, TLDS, COUNTRIES } from '../rng'
import { materialized, type Dataset } from '../table'
import { patchable, type Deletable } from './patch'
import { PROVIDER_NAMES, resellerSample } from './resellers'
import { REGISTRY_BY_TLD, registryFor } from './domains'

// ---------------------------------------------------------------------------
// Extensions (TLDs)
// ---------------------------------------------------------------------------

export interface Extension extends Deletable {
  id: string
  tld: string
  registry: string
  category: 'gTLD' | 'ccTLD' | 'newGTLD' | 'sTLD'
  active: boolean
  createPrice: number
  renewPrice: number
  transferPrice: number
  restorePrice: number
  currency: string
  minYears: number
  maxYears: number
  idnSupport: boolean
  dnssecSupport: boolean
  transferLockDays: number
  quarantineDays: number
  registrantVerification: boolean
  premiumSupported: boolean
  updatedAt: string
  updatedBy: string
  domains: number
}

const EXTRA_TLDS = [
  'agency', 'amsterdam', 'bar', 'bike', 'blog', 'cafe', 'capital', 'care', 'casa', 'chat',
  'church', 'city', 'club', 'coach', 'coffee', 'company', 'design', 'digital', 'direct',
  'email', 'energy', 'estate', 'events', 'expert', 'farm', 'finance', 'fit', 'fun', 'gallery',
  'garden', 'gift', 'gmbh', 'group', 'guide', 'health', 'holiday', 'house', 'immo', 'jetzt',
  'kitchen', 'land', 'life', 'live', 'love', 'ltd', 'market', 'media', 'mobi', 'money',
  'nrw', 'one', 'photo', 'pizza', 'plus', 'pro', 'run', 'sale', 'school', 'services',
  'shopping', 'show', 'site', 'social', 'space', 'store', 'studio', 'style', 'systems',
  'tax', 'team', 'tech', 'today', 'tools', 'tours', 'town', 'toys', 'trade', 'training',
  'travel', 'vet', 'video', 'villas', 'vision', 'watch', 'website', 'wiki', 'wine', 'work',
  'works', 'world', 'xyz', 'zone',
]

let _extensions: Dataset<Extension> | null = null
export function extensions(): Dataset<Extension> {
  if (!_extensions) {
    const cc = COUNTRIES.map(([c]) => c.toLowerCase())
    const all = [...new Set([...TLDS, ...EXTRA_TLDS, ...cc])]
    const rows: Extension[] = all.map((tld, i) => {
      const g = new Gen('extension', tld)
      // The TLDs Openprovider actually leads with are never inactive, and their
      // registry is a fact, not a coin flip.
      const major = tld in REGISTRY_BY_TLD
      const category: Extension['category'] =
        tld.length === 2 ? 'ccTLD'
        : ['com', 'net', 'org', 'info', 'biz'].includes(tld) ? 'gTLD'
        : ['travel', 'mobi', 'pro'].includes(tld) ? 'sTLD'
        : 'newGTLD'
      const create = g.money(2.4, 96)
      return {
        id: `EXT-${1000 + i}`,
        tld,
        registry: registryFor(tld),
        category,
        active: major ? true : g.bool(0.9),
        createPrice: create,
        renewPrice: Math.round(create * g.float(0.9, 1.35) * 100) / 100,
        transferPrice: Math.round(create * g.float(0.7, 1.1) * 100) / 100,
        restorePrice: Math.round(create * g.float(2, 8) * 100) / 100,
        currency: 'EUR',
        minYears: 1,
        maxYears: g.pick([1, 2, 5, 10]),
        idnSupport: g.bool(0.6),
        dnssecSupport: major ? true : g.bool(0.75),
        transferLockDays: g.pick([0, 5, 60]),
        quarantineDays: g.pick([0, 30, 40, 75]),
        registrantVerification: g.bool(0.25),
        premiumSupported: major ? true : g.bool(0.4),
        updatedAt: g.dateTimeOffset(-9000, -10),
        updatedBy: g.pick(['commercial.team', 'a.rao', 'pricing.import', 'system']),
        domains: g.int(0, 184000),
      }
    })
    _extensions = patchable(materialized('extensions', rows), (r) => r.id)
  }
  return _extensions
}

// ---------------------------------------------------------------------------
// Promotions — including the multiyear tab (was mislabelled "Multilayer")
// ---------------------------------------------------------------------------

export interface Promotion extends Deletable {
  id: string
  name: string
  kind: 'standard' | 'multiyear'
  tld: string
  action: 'create' | 'renew' | 'transfer'
  discountType: 'percentage' | 'fixed_price'
  discountValue: number
  years: number | null
  startsAt: string
  endsAt: string
  status: 'scheduled' | 'live' | 'ended' | 'draft'
  budgetCap: number | null
  used: number
  segment: string
  createdBy: string
  createdAt: string
  approvedBy: string | null
}

let _promotions: Dataset<Promotion> | null = null
export function promotions(): Dataset<Promotion> {
  if (!_promotions) {
    const rows: Promotion[] = Array.from({ length: 212 }, (_, i) => {
      const g = new Gen('promotion', i)
      const kind = g.weighted<'standard' | 'multiyear'>([['standard', 68], ['multiyear', 32]])
      const status = g.weighted<Promotion['status']>([['ended', 48], ['live', 26], ['scheduled', 18], ['draft', 8]])
      const tld = g.pick(TLDS)
      return {
        id: `PRM-${3000 + i}`,
        name: `${tld.toUpperCase()} ${kind === 'multiyear' ? 'multiyear' : g.pick(['launch', 'seasonal', 'winback', 'volume'])} ${g.int(2025, 2026)}`,
        kind,
        tld,
        action: g.weighted([['create', 62], ['renew', 24], ['transfer', 14]]),
        discountType: g.weighted([['percentage', 55], ['fixed_price', 45]]),
        discountValue: g.money(1, 60),
        years: kind === 'multiyear' ? g.pick([2, 3, 5, 10]) : null,
        startsAt: g.dayOffset(-600, 120),
        endsAt: g.dayOffset(-400, 400),
        status,
        budgetCap: g.bool(0.4) ? g.int(2000, 250000) : null,
        used: g.int(0, 42000),
        segment: g.pick(['All resellers', 'Supreme', 'New resellers', 'Expert + Supreme', 'DE market']),
        createdBy: g.pick(['commercial.team', 'a.rao', 'm.klein']),
        createdAt: g.dayOffset(-700, -5),
        approvedBy: status === 'draft' ? null : g.pick(['h.vermeer', 'commercial.lead']),
      }
    })
    _promotions = patchable(materialized('promotions', rows), (r) => r.id)
  }
  return _promotions
}

// ---------------------------------------------------------------------------
// Promocodes — Standard + FastCheckout in one module
// ---------------------------------------------------------------------------

export interface Promocode extends Deletable {
  id: string
  code: string
  type: 'Standard' | 'FastCheckout'
  description: string
  discountType: 'percentage' | 'fixed'
  discountValue: number
  currency: string
  appliesTo: string
  status: 'active' | 'expired' | 'exhausted' | 'disabled'
  validFrom: string
  validUntil: string
  maxRedemptions: number | null
  redemptions: number
  perResellerLimit: number | null
  createdBy: string
  createdAt: string
  campaign: string
}

let _promocodes: Dataset<Promocode> | null = null
export function promocodes(): Dataset<Promocode> {
  if (!_promocodes) {
    const rows: Promocode[] = Array.from({ length: 468 }, (_, i) => {
      const g = new Gen('promocode', i)
      const type = g.weighted<'Standard' | 'FastCheckout'>([['Standard', 62], ['FastCheckout', 38]])
      const max = g.bool(0.6) ? g.int(50, 20000) : null
      const redemptions = max ? g.int(0, max) : g.int(0, 4200)
      const status: Promocode['status'] =
        max && redemptions >= max ? 'exhausted' : g.weighted([['active', 60], ['expired', 28], ['disabled', 12]])
      return {
        id: `PC-${6000 + i}`,
        code: `${type === 'FastCheckout' ? 'FC' : 'OP'}${g.pick(['SAVE', 'WELCOME', 'SUMMER', 'BLACK', 'GROW', 'MIGRATE'])}${g.int(10, 99)}`,
        type,
        description: g.pick(['First domain discount', 'Migration incentive', 'Black Friday', 'Partner campaign', 'Winback offer', 'Event giveaway']),
        discountType: g.weighted([['percentage', 58], ['fixed', 42]]),
        discountValue: g.money(1, 40),
        currency: 'EUR',
        appliesTo: g.pick(['All TLDs', '.com', '.nl + .be', 'SSL products', 'Memberships', 'First order only']),
        status,
        validFrom: g.dayOffset(-500, 30),
        validUntil: g.dayOffset(-200, 300),
        maxRedemptions: max,
        redemptions,
        perResellerLimit: g.bool(0.5) ? g.pick([1, 3, 5]) : null,
        createdBy: g.pick(['marketing.team', 'a.rao', 'm.klein', 'partner.api']),
        createdAt: g.dayOffset(-600, -2),
        campaign: g.pick(['Q1 growth', 'Q2 winback', 'Always-on', 'Partner: Plesk', 'Event: WHD']),
      }
    })
    _promocodes = patchable(materialized('promocodes', rows), (r) => r.id)
  }
  return _promocodes
}

// ---------------------------------------------------------------------------
// Domain providers (registry reference list)
// ---------------------------------------------------------------------------

export interface DomainProvider extends Deletable {
  id: string
  name: string
  type: 'registry' | 'registrar_partner' | 'reseller_channel'
  protocol: 'EPP' | 'REST' | 'legacy'
  status: 'operational' | 'degraded' | 'maintenance' | 'down'
  tlds: number
  domains: number
  endpoint: string
  contactEmail: string
  slaResponseMs: number
  successRate24h: number
  lastIncidentAt: string
  credentialsExpireAt: string
  ipWhitelisted: boolean
}

let _providers: Dataset<DomainProvider> | null = null
export function domainProviders(): Dataset<DomainProvider> {
  if (!_providers) {
    const rows: DomainProvider[] = PROVIDER_NAMES.concat([
      'Registry.NZ', 'ZA Central Registry', 'NIC.br', 'JPRS', 'CNNIC', 'Neustar', 'GoDaddy Registry',
      'Radix', 'Donuts', 'MMX', 'Uniregistry', 'Nic.fr Partner',
    ]).map((name, i) => {
      const g = new Gen('provider', name)
      return {
        id: `DP-${200 + i}`,
        name,
        type: g.weighted([['registry', 74], ['registrar_partner', 18], ['reseller_channel', 8]]),
        protocol: g.weighted([['EPP', 80], ['REST', 14], ['legacy', 6]]),
        status: g.weighted([['operational', 84], ['degraded', 9], ['maintenance', 5], ['down', 2]]),
        tlds: g.int(1, 240),
        domains: g.int(120, 940000),
        endpoint: `epp.${name.toLowerCase().replace(/\W/g, '')}.net:700`,
        contactEmail: `registrar-support@${name.toLowerCase().replace(/\W/g, '')}.net`,
        slaResponseMs: g.int(80, 2400),
        successRate24h: Math.round(g.float(88, 100) * 100) / 100,
        lastIncidentAt: g.dayOffset(-400, -1),
        credentialsExpireAt: g.dayOffset(-30, 600),
        ipWhitelisted: g.bool(0.85),
      }
    })
    _providers = patchable(materialized('domain_providers', rows), (r) => r.id)
  }
  return _providers
}

export const providerOptions = () => PROVIDER_NAMES.map((p) => ({ value: p, label: p }))
export const resellerOptions = () => resellerSample(40).map((r) => ({ value: String(r.id), label: `${r.id} — ${r.company}` }))
