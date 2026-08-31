import { Gen } from '../rng'
import { materialized, type Dataset } from '../table'
import { patchable, type Deletable } from './patch'
import { PREMIUM_MEMBERSHIPS, resellers, type Membership } from './resellers'

// ---------------------------------------------------------------------------
// Reseller WPP subscriptions — Billing → Subscriptions
//
// WPP (whois privacy protection) is sold per domain, so the subscription sits
// on the reseller and bills against the domains that have it switched on.
// ---------------------------------------------------------------------------

export interface WppSubscription extends Deletable {
  id: string
  resellerId: number
  company: string
  status: 'active' | 'suspended' | 'cancelled' | 'trial'
  domainsCovered: number
  domainsEligible: number
  pricePerDomain: number
  currency: string
  billingCycle: 'monthly' | 'yearly'
  monthlyValue: number
  startedAt: string
  renewsAt: string
  autoRenew: boolean
  includedInPlan: boolean
  registryPrivacyUsed: number
  optOutRequests: number
  createdBy: string
  cancelledReason: string | null
}

let _wpp: Dataset<WppSubscription> | null = null
export function wppSubscriptions(): Dataset<WppSubscription> {
  if (!_wpp) {
    const ds = resellers()
    const rows: WppSubscription[] = []
    for (let i = 0; i < ds.total; i += 3) {
      const r = ds.at(i)
      if (r._deleted) continue
      const g = new Gen('wpp', r.id)
      if (!g.bool(0.55)) continue
      const status = g.weighted<WppSubscription['status']>([
        ['active', 72], ['trial', 8], ['suspended', 8], ['cancelled', 12],
      ])
      const eligible = Math.max(1, Math.round(r.domains * g.float(0.5, 1)))
      const covered = status === 'cancelled' ? 0 : Math.round(eligible * g.float(0.05, 0.85))
      const price = g.money(0.4, 3.2)
      rows.push({
        id: `WPP-${r.id}`,
        resellerId: r.id,
        company: r.company,
        status,
        domainsCovered: covered,
        domainsEligible: eligible,
        pricePerDomain: price,
        currency: r.currency,
        billingCycle: g.weighted([['monthly', 64], ['yearly', 36]]),
        monthlyValue: Math.round(covered * price * 100) / 100,
        startedAt: g.dayOffset(-1500, -20),
        renewsAt: g.dayOffset(-30, 360),
        autoRenew: status === 'active' && g.bool(0.88),
        includedInPlan: PREMIUM_MEMBERSHIPS.includes(r.membership as Membership),
        registryPrivacyUsed: Math.round(covered * g.float(0, 0.3)),
        optOutRequests: g.weighted([[0, 78], [g.int(1, 24), 22]]),
        createdBy: g.pick(['self-service', 'sales', 'api', 'i.lammers']),
        cancelledReason: status === 'cancelled'
          ? g.pick(['Moved to registry-provided privacy', 'Price objection', 'GDPR redaction made it redundant', 'Reseller churned'])
          : null,
      })
    }
    _wpp = patchable(materialized('wpp_subscriptions', rows), (r) => r.id)
  }
  return _wpp
}

// ---------------------------------------------------------------------------
// Promocode generation batches — Billing → Promocodes, "Generate" action
// ---------------------------------------------------------------------------

export interface PromocodeBatch extends Deletable {
  id: string
  prefix: string
  type: 'Standard' | 'FastCheckout'
  codes: number
  redeemed: number
  discount: string
  campaign: string
  validUntil: string
  createdBy: string
  createdAt: string
  singleUse: boolean
  exportedAt: string | null
}

let _batches: Dataset<PromocodeBatch> | null = null
export function promocodeBatches(): Dataset<PromocodeBatch> {
  if (!_batches) {
    const rows: PromocodeBatch[] = Array.from({ length: 38 }, (_, i) => {
      const g = new Gen('pcbatch', i)
      const codes = g.pick([50, 100, 500, 1000, 5000])
      return {
        id: `PCB-${900 + i}`,
        prefix: g.pick(['WHD26', 'PARTNER', 'WINBACK', 'EVENT', 'BLACKFRI', 'MIGRATE']),
        type: g.weighted([['Standard', 64], ['FastCheckout', 36]]),
        codes,
        redeemed: Math.round(codes * g.float(0, 0.8)),
        discount: g.pick(['10%', '20%', '€5 fixed', '€10 fixed', 'first year free']),
        campaign: g.pick(['WHD 2026 booth', 'Plesk partner push', 'Q2 winback', 'Cloudfest', 'Reseller referral']),
        validUntil: g.dayOffset(-90, 300),
        createdBy: g.pick(['marketing.team', 'm.klein', 'a.rao']),
        createdAt: g.dayOffset(-400, -3),
        singleUse: g.bool(0.7),
        exportedAt: g.bool(0.8) ? g.dateTimeOffset(-400, -2) : null,
      }
    })
    _batches = patchable(materialized('promocode_batches', rows), (r) => r.id)
  }
  return _batches
}
