import { Gen, COUNTRIES, WORDS, TLDS } from '../rng'
import { materialized, synthetic, type Dataset } from '../table'
import { patchable, type Deletable } from './patch'
import { resellers, MEMBERSHIPS } from './resellers'

// ---------------------------------------------------------------------------
// Bruteforce — attack attempts, protection settings, and recent changes
// ---------------------------------------------------------------------------

export type BruteforceTarget = 'reseller_login' | 'api_auth' | 'password_reset' | 'domain_authcode' | 'customer_portal'

export interface BruteforceEvent extends Deletable {
  id: string
  ip: string
  country: string
  target: BruteforceTarget
  resellerId: number | null
  company: string | null
  username: string
  attempts: number
  windowMinutes: number
  status: 'monitoring' | 'blocked' | 'expired' | 'allowlisted'
  firstSeenAt: string
  lastSeenAt: string
  blockedUntil: string | null
  userAgent: string
  distinctAccounts: number
  asn: string
}

const AGENTS = [
  'python-requests/2.31', 'curl/8.4.0', 'Mozilla/5.0 (Windows NT 10.0)', 'Go-http-client/2.0',
  'openprovider-php-sdk/3.1', 'Mozilla/5.0 (X11; Linux x86_64)',
]
const ASNS = ['AS14061 DigitalOcean', 'AS16509 Amazon', 'AS45090 Tencent', 'AS9009 M247', 'AS24940 Hetzner', 'AS4134 Chinanet']

let _bruteforce: Dataset<BruteforceEvent> | null = null
export function bruteforceEvents(): Dataset<BruteforceEvent> {
  if (!_bruteforce) {
    const rds = resellers()
    _bruteforce = patchable(
      synthetic<BruteforceEvent>('bruteforce_events', 14_820, (i) => {
        const g = new Gen('bruteforce', i)
        const target = g.weighted<BruteforceTarget>([
          ['api_auth', 38], ['reseller_login', 30], ['password_reset', 14], ['customer_portal', 12], ['domain_authcode', 6],
        ])
        const attempts = g.weighted([[g.int(5, 20), 52], [g.int(21, 200), 34], [g.int(201, 4200), 14]])
        const status = attempts > 200
          ? g.weighted<BruteforceEvent['status']>([['blocked', 78], ['expired', 20], ['allowlisted', 2]])
          : g.weighted<BruteforceEvent['status']>([['monitoring', 58], ['blocked', 18], ['expired', 24]])
        const known = g.bool(0.55)
        const r = rds.at((i * 17) % rds.total)
        const age = g.int(1, 900)
        return {
          id: `BF-${400000 + i}`,
          ip: `${g.int(5, 213)}.${g.int(0, 255)}.${g.int(0, 255)}.${g.int(1, 254)}`,
          country: g.pick(COUNTRIES)[0],
          target,
          resellerId: known ? r.id : null,
          company: known ? r.company : null,
          username: known ? r.email : `${g.pick(WORDS)}${g.int(1, 99)}@${g.pick(['gmail.com', 'mail.ru', 'proton.me'])}`,
          attempts,
          windowMinutes: g.pick([5, 15, 60]),
          status,
          firstSeenAt: g.dateTimeOffset(-age - 4, -age),
          lastSeenAt: g.dateTimeOffset(-Math.max(1, age - 3), -1),
          blockedUntil: status === 'blocked' ? g.dateTimeOffset(1, 48) : null,
          userAgent: g.pick(AGENTS),
          distinctAccounts: g.weighted([[1, 62], [g.int(2, 9), 26], [g.int(10, 240), 12]]),
          asn: g.pick(ASNS),
        }
      }),
      (r) => r.id,
    )
  }
  return _bruteforce
}

/** Protection settings — the "Activation" tab. */
export interface BruteforceRule extends Deletable {
  id: string
  target: BruteforceTarget
  scope: 'global' | 'plan' | 'reseller'
  scopeTarget: string
  enabled: boolean
  thresholdAttempts: number
  windowMinutes: number
  lockoutMinutes: number
  notifyReseller: boolean
  notifyChannel: string
  captchaAfter: number
  updatedBy: string
  updatedAt: string
  blocked24h: number
}

const TARGETS: BruteforceTarget[] = ['reseller_login', 'api_auth', 'password_reset', 'domain_authcode', 'customer_portal']

let _bruteforceRules: Dataset<BruteforceRule> | null = null
export function bruteforceRules(): Dataset<BruteforceRule> {
  if (!_bruteforceRules) {
    const rds = resellers()
    const rows: BruteforceRule[] = []
    TARGETS.forEach((target, ti) => {
      const g = new Gen('bfrule', target)
      rows.push({
        id: `BFR-${ti}-g`,
        target,
        scope: 'global',
        scopeTarget: 'Platform default',
        enabled: true,
        thresholdAttempts: g.pick([5, 10, 20]),
        windowMinutes: g.pick([5, 15, 60]),
        lockoutMinutes: g.pick([15, 30, 60, 1440]),
        notifyReseller: g.bool(0.7),
        notifyChannel: '#security-alerts',
        captchaAfter: g.pick([3, 5, 10]),
        updatedBy: 'platform.default',
        updatedAt: g.dateTimeOffset(-9000, -200),
        blocked24h: g.int(0, 840),
      })
      MEMBERSHIPS.forEach((plan, pi) => {
        if (!g.bool(0.35)) return
        rows.push({
          id: `BFR-${ti}-p${pi}`,
          target,
          scope: 'plan',
          scopeTarget: plan,
          enabled: g.bool(0.9),
          thresholdAttempts: g.pick([10, 20, 50, 100]),
          windowMinutes: g.pick([5, 15, 60]),
          lockoutMinutes: g.pick([15, 30, 60]),
          notifyReseller: g.bool(0.8),
          notifyChannel: '#security-alerts',
          captchaAfter: g.pick([5, 10, 20]),
          updatedBy: g.pick(['t.ops', 'security.team']),
          updatedAt: g.dateTimeOffset(-6000, -40),
          blocked24h: g.int(0, 120),
        })
      })
      for (let j = 0; j < g.int(0, 2); j++) {
        const r = rds.at((ti * 61 + j * 13) % rds.total)
        rows.push({
          id: `BFR-${ti}-r${j}`,
          target,
          scope: 'reseller',
          scopeTarget: `${r.id} — ${r.company}`,
          enabled: g.bool(0.85),
          thresholdAttempts: g.pick([50, 100, 500]),
          windowMinutes: 60,
          lockoutMinutes: g.pick([5, 15]),
          notifyReseller: true,
          notifyChannel: r.email,
          captchaAfter: 0,
          updatedBy: g.pick(['security.team', 'incident.4821']),
          updatedAt: g.dateTimeOffset(-2000, -5),
          blocked24h: g.int(0, 40),
        })
      }
    })
    _bruteforceRules = patchable(materialized('bruteforce_rules', rows), (r) => r.id)
  }
  return _bruteforceRules
}

/** "Last-minute changes" — recent edits to protection, newest first. */
export interface BruteforceChange {
  id: string
  at: string
  actor: string
  role: string
  target: BruteforceTarget
  scopeTarget: string
  field: string
  before: string
  after: string
  reason: string
  ticket: string
  riskNote: string | null
}

const CHANGE_FIELDS: [string, string, string][] = [
  ['thresholdAttempts', '10', '500'],
  ['enabled', 'true', 'false'],
  ['lockoutMinutes', '60', '5'],
  ['captchaAfter', '5', '0'],
  ['windowMinutes', '15', '60'],
  ['notifyReseller', 'true', 'false'],
]

export function bruteforceChanges(n = 42): BruteforceChange[] {
  return Array.from({ length: n }, (_, i) => {
    const g = new Gen('bfchange', i)
    const [field, before, after] = g.pick(CHANGE_FIELDS)
    const weakening = (field === 'enabled' && after === 'false') || (field === 'thresholdAttempts' && Number(after) > Number(before)) || (field === 'captchaAfter' && after === '0')
    return {
      id: `BFC-${9000 - i}`,
      at: g.dateTimeOffset(-1200, -1),
      actor: g.pick(['t.ops', 'security.team', 'n.bergstrom', 'a.rao', 'incident.4821']),
      role: g.pick(['Technical Operations', 'Super Admin', 'Abuse & Compliance']),
      target: g.pick(TARGETS),
      scopeTarget: g.pick(['Platform default', 'Supreme', 'Expert', '100341 — Lumoworks Ltd', '104882 — Nordcloud B.V.']),
      field,
      before,
      after,
      reason: g.pick([
        'Reseller integration was locking itself out during a migration.',
        'Incident 4821 — credential stuffing from a single ASN.',
        'Load test scheduled with the reseller.',
        'Reverting a temporary relaxation.',
      ]),
      ticket: `ZD-${g.int(440000, 449999)}`,
      riskNote: weakening ? 'Weakens protection — review whether it was reverted.' : null,
    }
  }).sort((a, b) => (a.at < b.at ? 1 : -1))
}

// ---------------------------------------------------------------------------
// IP blacklist
// ---------------------------------------------------------------------------

export interface BlacklistEntry extends Deletable {
  id: string
  cidr: string
  country: string
  asn: string
  scope: 'platform' | 'api' | 'control_panel' | 'reseller'
  scopeTarget: string
  reason: string
  category: 'bruteforce' | 'fraud' | 'abuse' | 'scraping' | 'manual'
  addedBy: string
  addedAt: string
  expiresAt: string | null
  hits24h: number
  hitsTotal: number
  permanent: boolean
  ticket: string
}

let _blacklist: Dataset<BlacklistEntry> | null = null
export function ipBlacklist(): Dataset<BlacklistEntry> {
  if (!_blacklist) {
    const rows: BlacklistEntry[] = Array.from({ length: 486 }, (_, i) => {
      const g = new Gen('blacklist', i)
      const permanent = g.bool(0.3)
      const isRange = g.bool(0.35)
      return {
        id: `BL-${5000 + i}`,
        cidr: isRange
          ? `${g.int(5, 213)}.${g.int(0, 255)}.${g.int(0, 255)}.0/${g.pick([24, 22, 20, 16])}`
          : `${g.int(5, 213)}.${g.int(0, 255)}.${g.int(0, 255)}.${g.int(1, 254)}`,
        country: g.pick(COUNTRIES)[0],
        asn: g.pick(ASNS),
        scope: g.weighted([['platform', 46], ['api', 30], ['control_panel', 18], ['reseller', 6]]),
        scopeTarget: g.weighted([['All traffic', 60], ['API only', 22], ['Control panel only', 12], ['Single reseller', 6]]),
        reason: g.pick([
          'Credential stuffing — 4,200 failed logins in 10 minutes',
          'Fraudulent registrations paid with stolen cards',
          'Phishing sites hosted on registered domains',
          'Whois scraping at 40 req/s',
          'Manual block requested by the abuse desk',
        ]),
        category: g.weighted([['bruteforce', 40], ['fraud', 24], ['abuse', 18], ['scraping', 12], ['manual', 6]]),
        addedBy: g.pick(['security.team', 'j.okafor', 'n.bergstrom', 'auto.bruteforce', 'a.rao']),
        addedAt: g.dateTimeOffset(-9000, -2),
        expiresAt: permanent ? null : g.dateTimeOffset(-40, 700),
        hits24h: g.weighted([[0, 44], [g.int(1, 200), 40], [g.int(201, 24000), 16]]),
        hitsTotal: g.int(1, 480000),
        permanent,
        ticket: `ZD-${g.int(440000, 449999)}`,
      }
    })
    _blacklist = patchable(materialized('ip_blacklist', rows), (r) => r.id)
  }
  return _blacklist
}

// ---------------------------------------------------------------------------
// Banned keywords
// ---------------------------------------------------------------------------

export interface BannedKeyword extends Deletable {
  id: string
  keyword: string
  matchType: 'exact' | 'substring' | 'regex'
  appliesTo: 'domain_name' | 'contact_name' | 'company_name' | 'email' | 'all'
  action: 'block' | 'flag_for_review' | 'notify_only'
  category: 'trademark' | 'adult' | 'pharma' | 'financial' | 'malware' | 'sanctions' | 'internal'
  caseSensitive: boolean
  hits30d: number
  blocked30d: number
  falsePositives30d: number
  addedBy: string
  addedAt: string
  lastHitAt: string | null
  active: boolean
  note: string
}

const KEYWORDS: [string, BannedKeyword['category']][] = [
  ['paypa1', 'trademark'], ['app1e', 'trademark'], ['micros0ft', 'trademark'], ['ing-bank', 'financial'],
  ['rabobank-secure', 'financial'], ['bitcoin-wallet', 'financial'], ['free-vbucks', 'malware'],
  ['crypto-airdrop', 'financial'], ['pharmacy-cheap', 'pharma'], ['viagra', 'pharma'],
  ['casino-bonus', 'adult'], ['adult-cam', 'adult'], ['ransom', 'malware'], ['botnet', 'malware'],
  ['sanctioned-entity', 'sanctions'], ['openprovider-support', 'internal'], ['op-billing', 'internal'],
  ['dhl-tracking', 'trademark'], ['postnl-pakket', 'trademark'], ['ideal-payment', 'financial'],
]

let _keywords: Dataset<BannedKeyword> | null = null
export function bannedKeywords(): Dataset<BannedKeyword> {
  if (!_keywords) {
    const rows: BannedKeyword[] = KEYWORDS.flatMap(([keyword, category], i) => {
      const g = new Gen('keyword', keyword)
      const hits = g.int(0, 4200)
      const action = g.weighted<BannedKeyword['action']>([['block', 48], ['flag_for_review', 38], ['notify_only', 14]])
      return [{
        id: `KW-${700 + i}`,
        keyword,
        matchType: g.weighted<BannedKeyword['matchType']>([['substring', 58], ['exact', 30], ['regex', 12]]),
        appliesTo: g.weighted<BannedKeyword['appliesTo']>([['domain_name', 62], ['company_name', 14], ['contact_name', 10], ['email', 8], ['all', 6]]),
        action,
        category,
        caseSensitive: g.bool(0.15),
        hits30d: hits,
        blocked30d: action === 'block' ? hits : Math.round(hits * g.float(0, 0.3)),
        falsePositives30d: g.weighted([[0, 62], [g.int(1, 40), 38]]),
        addedBy: g.pick(['legal.team', 'j.okafor', 'security.team', 'a.rao']),
        addedAt: g.dayOffset(-1600, -10),
        lastHitAt: hits ? g.dateTimeOffset(-700, -1) : null,
        active: g.bool(0.92),
        note: g.pick([
          'Typosquat of a protected brand — TMCH notice on file.',
          'Requested by Legal after a takedown request.',
          'High false-positive rate; kept on review rather than block.',
          'Matches campaign observed by the abuse desk.',
        ]),
      }]
    })
    _keywords = patchable(materialized('banned_keywords', rows), (r) => r.id)
  }
  return _keywords
}

/** Recent keyword hits, for the drawer on a keyword. */
export interface KeywordHit {
  id: string
  at: string
  candidate: string
  resellerId: number
  outcome: 'blocked' | 'allowed_after_review' | 'pending_review'
}

export function keywordHits(keyword: string, n = 8): KeywordHit[] {
  const rds = resellers()
  return Array.from({ length: n }, (_, i) => {
    const g = new Gen('kwhit', keyword, i)
    const r = rds.at((i * 37) % rds.total)
    return {
      id: `KH-${g.int(100000, 999999)}`,
      at: g.dateTimeOffset(-800, -1),
      candidate: `${keyword}${g.bool(0.5) ? '-' : ''}${g.pick(WORDS)}.${g.pick(TLDS)}`,
      resellerId: r.id,
      outcome: g.weighted<KeywordHit['outcome']>([['blocked', 62], ['allowed_after_review', 22], ['pending_review', 16]]),
    }
  }).sort((a, b) => (a.at < b.at ? 1 : -1))
}

// ---------------------------------------------------------------------------
// Batch cracker — stuck bulk batches that need splitting or replaying
// ---------------------------------------------------------------------------

export interface StuckBatch extends Deletable {
  id: string
  kind: string
  resellerId: number
  company: string
  submittedAt: string
  stuckSince: string
  stage: 'parsing' | 'validating' | 'registry_calls' | 'invoicing' | 'finalising'
  rows: number
  processed: number
  failed: number
  chunkSize: number
  lastError: string
  retries: number
  blocking: boolean
  provider: string
}

const BATCH_KINDS = [
  'domain.register.batch', 'domain.renew.batch', 'domain.transfer.batch', 'dns.zone.import',
  'license.migration', 'contact.update.batch', 'invoice.generate.batch',
]
const BATCH_ERRORS = [
  'Registry connection reset after chunk 3 of 42',
  'Vendor API returned 429 for the whole chunk',
  'Worker died mid-chunk; rows left in "processing"',
  'Row 1,284 has an invalid contact handle and blocks the chunk',
  'Deadlock on the domain table during invoicing',
  'Chunk exceeded the 30s registry timeout',
]

let _stuckBatches: Dataset<StuckBatch> | null = null
export function stuckBatches(): Dataset<StuckBatch> {
  if (!_stuckBatches) {
    const rds = resellers()
    const rows: StuckBatch[] = Array.from({ length: 64 }, (_, i) => {
      const g = new Gen('batch', i)
      const r = rds.at((i * 29) % rds.total)
      const total = g.int(40, 24000)
      const processed = Math.round(total * g.float(0.02, 0.85))
      return {
        id: `BAT-${30000 + i}`,
        kind: g.pick(BATCH_KINDS),
        resellerId: r.id,
        company: r.company,
        submittedAt: g.dateTimeOffset(-400, -20),
        stuckSince: g.dateTimeOffset(-380, -2),
        stage: g.weighted([['registry_calls', 44], ['validating', 20], ['invoicing', 16], ['parsing', 12], ['finalising', 8]]),
        rows: total,
        processed,
        failed: g.int(0, Math.max(1, Math.round((total - processed) * 0.2))),
        chunkSize: g.pick([50, 100, 250, 500]),
        lastError: g.pick(BATCH_ERRORS),
        retries: g.int(0, 6),
        blocking: g.bool(0.35),
        provider: g.pick(['SIDN', 'DENIC', 'Verisign', 'EURid', 'Nominet', 'Plesk', 'cPanel']),
      }
    })
    _stuckBatches = patchable(materialized('stuck_batches', rows), (r) => r.id)
  }
  return _stuckBatches
}

/** One-pass risk summary, cached for the session. */
export interface RiskHealth {
  blocked: number
  monitoring: number
  credentialStuffing: number
  blacklistEntries: number
  blacklistHits24h: number
  keywordsBlocked30d: number
  keywordFalsePositives: number
  stuckBatches: number
  batchesBlockingQueue: number
  protectionWeakened: number
}

let _riskHealth: RiskHealth | null = null
export function riskHealth(): RiskHealth {
  if (_riskHealth) return _riskHealth
  const bf = bruteforceEvents()
  let blocked = 0
  let monitoring = 0
  let credentialStuffing = 0
  for (let i = 0; i < bf.total; i++) {
    const e = bf.at(i)
    if (e._deleted) continue
    if (e.status === 'blocked') blocked++
    if (e.status === 'monitoring') monitoring++
    if (e.distinctAccounts > 9) credentialStuffing++
  }

  const bl = ipBlacklist()
  let blacklistHits24h = 0
  for (let i = 0; i < bl.total; i++) {
    const e = bl.at(i)
    if (!e._deleted) blacklistHits24h += e.hits24h
  }

  const kw = bannedKeywords()
  let keywordsBlocked30d = 0
  let keywordFalsePositives = 0
  for (let i = 0; i < kw.total; i++) {
    const k = kw.at(i)
    if (k._deleted) continue
    keywordsBlocked30d += k.blocked30d
    keywordFalsePositives += k.falsePositives30d
  }

  const sb = stuckBatches()
  let batchesBlockingQueue = 0
  for (let i = 0; i < sb.total; i++) if (!sb.at(i)._deleted && sb.at(i).blocking) batchesBlockingQueue++

  _riskHealth = {
    blocked,
    monitoring,
    credentialStuffing,
    blacklistEntries: bl.total,
    blacklistHits24h,
    keywordsBlocked30d,
    keywordFalsePositives,
    stuckBatches: sb.total,
    batchesBlockingQueue,
    protectionWeakened: bruteforceChanges().filter((c) => c.riskNote).length,
  }
  return _riskHealth
}
