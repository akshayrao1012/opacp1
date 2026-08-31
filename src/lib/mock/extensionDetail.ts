/**
 * The field set from the legacy "Extension - Details" screen, derived from the
 * extension's seed so it stays stable per TLD.
 */

import { Gen } from '../rng'
import { extensions, type Extension } from './catalog'

export type YesNo = 'yes' | 'no'

export interface ExtensionDetailRecord {
  // Main info
  tags: string[]
  showOnPublicSite: YesNo
  minOrderPeriod: number
  maxOrderPeriod: number
  minRenewPeriod: number | null
  maxRenewPeriod: number | null
  minDomainLength: number
  maxDomainLength: number
  status: 'ACT' | 'INA' | 'DEP'
  currentRouteId: number
  currentRouteLabel: string
  finalRouteId: number
  newGtld: YesNo
  premiumSupported: YesNo
  billingHandleSupported: YesNo
  wppSupported: YesNo
  whoisPrivacyByRegistry: YesNo
  idnSupported: YesNo
  dnssecSupported: YesNo
  restoreSupported: YesNo
  autoRenewSupported: YesNo
  // Transfer / trade / modify / quarantine
  transferPossible: YesNo
  transferCancelSupported: YesNo
  tradePossible: YesNo
  modifyOwnerAllowed: YesNo
  transferBilledAsRenew: YesNo
  lockingAllowed: YesNo
  renewalOffsetDays: number
  softQuarantineDays: number
  hardQuarantineDays: number
  localPresenceRequired: YesNo
  countryCodesAllowedForOwner: string[]
  foaStrategy: 'skip' | 'registry' | 'openprovider' | 'both'
  transferLockDays: number
  // Nameservers
  nameserversRequired: YesNo
  minNameservers: number
  maxNameservers: number
  glueRecordsSupported: YesNo
  ipv6Supported: YesNo
  nameserverUpdateSupported: YesNo
  dnssecMaxKeys: number
  // Registrant requirements
  registrantVerificationRequired: YesNo
  registrantVerificationDeadlineDays: number | null
  trusteeServiceAvailable: YesNo
  registryLockAvailable: YesNo
}

const TAG_POOL = ['tld', 'gtld', 'cctld', 'newgtld', 'popular_nl', 'popular_en', 'popular_es', 'popular_de', 'promo', 'restricted', 'brandable']

export function extensionDetail(e: Extension): ExtensionDetailRecord {
  const g = new Gen('extdetail', e.tld)
  const isCc = e.category === 'ccTLD'
  const tags = [
    'tld',
    isCc ? 'cctld' : e.category === 'newGTLD' ? 'newgtld' : 'gtld',
    ...g.some(TAG_POOL.filter((t) => t.startsWith('popular') || t === 'promo' || t === 'restricted' || t === 'brandable'), g.int(0, 3)),
  ]
  const soft = e.quarantineDays || g.pick([0, 30, 40])
  return {
    tags: [...new Set(tags)],
    showOnPublicSite: e.active ? g.weighted([['yes', 88], ['no', 12]]) : 'no',
    minOrderPeriod: e.minYears,
    maxOrderPeriod: e.maxYears,
    minRenewPeriod: g.bool(0.5) ? 1 : null,
    maxRenewPeriod: g.bool(0.5) ? e.maxYears : null,
    minDomainLength: g.weighted([[2, 60], [1, 15], [3, 25]]),
    maxDomainLength: 63,
    status: e.active ? 'ACT' : g.weighted([['INA', 70], ['DEP', 30]]),
    currentRouteId: g.int(4, 120),
    currentRouteLabel: `${e.registry} (.${e.tld}) [${g.weighted([['epp', 82], ['drs', 18]])}]`,
    finalRouteId: g.weighted([[0, 78], [g.int(4, 120), 22]]),
    newGtld: e.category === 'newGTLD' ? 'yes' : 'no',
    premiumSupported: e.premiumSupported ? 'yes' : 'no',
    billingHandleSupported: g.weighted([['no', 74], ['yes', 26]]),
    wppSupported: g.weighted([['yes', 62], ['no', 38]]),
    whoisPrivacyByRegistry: g.weighted([['no', 80], ['yes', 20]]),
    idnSupported: e.idnSupport ? 'yes' : 'no',
    dnssecSupported: e.dnssecSupport ? 'yes' : 'no',
    restoreSupported: g.weighted([['yes', 84], ['no', 16]]),
    autoRenewSupported: g.weighted([['yes', 92], ['no', 8]]),

    transferPossible: g.weighted([['yes', 90], ['no', 10]]),
    transferCancelSupported: g.weighted([['no', 70], ['yes', 30]]),
    tradePossible: isCc ? g.weighted([['yes', 55], ['no', 45]]) : 'no',
    modifyOwnerAllowed: g.weighted([['yes', 78], ['no', 22]]),
    transferBilledAsRenew: g.weighted([['no', 76], ['yes', 24]]),
    lockingAllowed: g.weighted([['yes', 82], ['no', 18]]),
    renewalOffsetDays: g.weighted([[0, 72], [g.int(1, 45), 28]]),
    softQuarantineDays: soft,
    hardQuarantineDays: g.weighted([[0, 46], [30, 34], [g.int(1, 40), 20]]),
    localPresenceRequired: isCc ? g.weighted([['no', 62], ['yes', 38]]) : 'no',
    countryCodesAllowedForOwner: isCc && g.bool(0.4) ? g.some(['NL', 'BE', 'DE', 'FR', 'ES', 'IT', 'EU'], g.int(1, 3)) : [],
    foaStrategy: g.weighted([['skip', 44], ['registry', 26], ['openprovider', 22], ['both', 8]]),
    transferLockDays: e.transferLockDays,

    nameserversRequired: g.weighted([['no', 64], ['yes', 36]]),
    minNameservers: g.weighted([[0, 40], [2, 60]]),
    maxNameservers: g.pick([6, 10, 13]),
    glueRecordsSupported: g.weighted([['yes', 70], ['no', 30]]),
    ipv6Supported: g.weighted([['yes', 88], ['no', 12]]),
    nameserverUpdateSupported: 'yes',
    dnssecMaxKeys: e.dnssecSupport ? g.pick([1, 2, 4, 8]) : 0,

    registrantVerificationRequired: e.registrantVerification ? 'yes' : 'no',
    registrantVerificationDeadlineDays: e.registrantVerification ? g.pick([7, 14, 15, 30]) : null,
    trusteeServiceAvailable: isCc ? g.weighted([['yes', 46], ['no', 54]]) : 'no',
    registryLockAvailable: g.weighted([['no', 72], ['yes', 28]]),
  }
}

export function findExtension(tld: string): Extension | undefined {
  const needle = tld.trim().toLowerCase().replace(/^\./, '')
  const ds = extensions()
  for (let i = 0; i < ds.total; i++) {
    const e = ds.at(i)
    if (e.tld === needle) return e
  }
  return undefined
}

export interface ExtensionRateRow {
  action: string
  period: string
  price: number
  cost: number
  currency: string
}

/** Price table per action and period, the way the catalogue is actually priced. */
export function extensionRates(e: Extension): ExtensionRateRow[] {
  const g = new Gen('extrates', e.tld)
  const rows: ExtensionRateRow[] = []
  const base: [string, number][] = [
    ['Create', e.createPrice],
    ['Renew', e.renewPrice],
    ['Transfer', e.transferPrice],
    ['Restore', e.restorePrice],
  ]
  for (const [action, price] of base) {
    const periods = action === 'Restore' ? [1] : [1, 2, 5, 10].filter((y) => y <= e.maxYears)
    for (const y of periods) {
      rows.push({
        action,
        period: `${y} year${y > 1 ? 's' : ''}`,
        price: Math.round(price * y * g.float(0.96, 1) * 100) / 100,
        cost: Math.round(price * y * g.float(0.6, 0.9) * 100) / 100,
        currency: e.currency,
      })
    }
  }
  return rows
}
