/**
 * Report datasets. Everything here is derived from the operational datasets
 * rather than invented separately, so a number on a report can be traced to the
 * rows behind it — which is the whole point of a report in an admin tool.
 */

import { Gen, isoDate, NOW_MS } from '../rng'
import { materialized, type Dataset } from '../table'
import type { Deletable } from './patch'
import { resellers, type Reseller } from './resellers'
import { sslOrders } from './products'
import { resellerStats } from './resellers'

// ---------------------------------------------------------------------------
// Postpaid customer debt
// ---------------------------------------------------------------------------

export interface DebtRow extends Deletable {
  id: string
  resellerId: number
  company: string
  country: string
  paymentTerm: string
  membership: string
  outstanding: number
  currency: string
  creditLimit: number
  overdueInvoices: number
  oldestInvoiceDays: number
  lastPaymentAt: string
  accountManager: string
  riskBand: 'watch' | 'chase' | 'suspend' | 'legal'
  monthlyRevenue: number
}

function riskBand(days: number, ratio: number): DebtRow['riskBand'] {
  if (days > 90 || ratio > 1.5) return 'legal'
  if (days > 60 || ratio > 1) return 'suspend'
  if (days > 30) return 'chase'
  return 'watch'
}

let _debt: Dataset<DebtRow> | null = null
export function postpaidDebt(): Dataset<DebtRow> {
  if (!_debt) {
    const ds = resellers()
    const rows: DebtRow[] = []
    for (let i = 0; i < ds.total; i++) {
      const r = ds.at(i)
      if (r._deleted) continue
      // Postpaid only, and only where money is actually owed.
      if (r.paymentTerm !== 'Net 14' && r.paymentTerm !== 'Net 30') continue
      if (r.balance >= 0) continue
      const g = new Gen('debt', r.id)
      const outstanding = Math.round(Math.abs(r.balance) * 100) / 100
      const creditLimit = Math.max(250, Math.round(r.monthlyRevenue * g.float(1, 4)))
      const days = g.int(3, 140)
      rows.push({
        id: `DEBT-${r.id}`,
        resellerId: r.id,
        company: r.company,
        country: r.countryName,
        paymentTerm: r.paymentTerm,
        membership: r.membership,
        outstanding,
        currency: r.currency,
        creditLimit,
        overdueInvoices: g.int(1, 9),
        oldestInvoiceDays: days,
        lastPaymentAt: g.dayOffset(-180, -3),
        accountManager: r.accountManager,
        riskBand: riskBand(days, outstanding / creditLimit),
        monthlyRevenue: r.monthlyRevenue,
      })
    }
    _debt = materialized('postpaid_debt', rows.sort((a, b) => b.outstanding - a.outstanding))
  }
  return _debt
}

// ---------------------------------------------------------------------------
// Negative available balance
// ---------------------------------------------------------------------------

export interface NegativeBalanceRow extends Deletable {
  id: string
  resellerId: number
  company: string
  balance: number
  reserved: number
  available: number
  currency: string
  paymentTerm: string
  autoRenewDomains: number
  renewalsDue30d: number
  renewalValue30d: number
  suspendOnNegative: boolean
  status: string
  lastLoginAt: string
}

let _negative: Dataset<NegativeBalanceRow> | null = null
export function negativeBalances(): Dataset<NegativeBalanceRow> {
  if (!_negative) {
    const ds = resellers()
    const rows: NegativeBalanceRow[] = []
    for (let i = 0; i < ds.total; i++) {
      const r = ds.at(i)
      if (r._deleted) continue
      const g = new Gen('negbal', r.id)
      const reserved = Math.round(r.domains * g.float(0.05, 0.6) * 100) / 100
      const available = Math.round((r.balance - reserved) * 100) / 100
      if (available >= 0) continue
      const renewals = Math.max(1, Math.round(r.domains * g.float(0.01, 0.09)))
      rows.push({
        id: `NEG-${r.id}`,
        resellerId: r.id,
        company: r.company,
        balance: r.balance,
        reserved,
        available,
        currency: r.currency,
        paymentTerm: r.paymentTerm,
        autoRenewDomains: Math.round(r.domains * g.float(0.4, 0.9)),
        renewalsDue30d: renewals,
        renewalValue30d: Math.round(renewals * g.float(6, 24) * 100) / 100,
        suspendOnNegative: g.bool(0.45),
        status: r.status,
        lastLoginAt: r.lastLoginAt,
      })
    }
    _negative = materialized('negative_balances', rows.sort((a, b) => a.available - b.available))
  }
  return _negative
}

// ---------------------------------------------------------------------------
// Domain provider statistics — aggregated from the per-reseller stats
// ---------------------------------------------------------------------------

export interface ProviderStatRow extends Deletable {
  id: string
  provider: string
  month: string
  registrations: number
  renewals: number
  transfers: number
  deletions: number
  revenue: number
  resellers: number
  avgFailureRate: number
  worstFailureRate: number
}

let _providerStats: Dataset<ProviderStatRow> | null = null
export function providerStatistics(): Dataset<ProviderStatRow> {
  if (!_providerStats) {
    const src = resellerStats()
    const acc = new Map<string, ProviderStatRow & { _fails: number[] }>()
    for (let i = 0; i < src.total; i++) {
      const s = src.at(i)
      const key = `${s.provider}|${s.month}`
      let row = acc.get(key)
      if (!row) {
        row = {
          id: `PS-${key}`,
          provider: s.provider,
          month: s.month,
          registrations: 0,
          renewals: 0,
          transfers: 0,
          deletions: 0,
          revenue: 0,
          resellers: 0,
          avgFailureRate: 0,
          worstFailureRate: 0,
          _fails: [],
        }
        acc.set(key, row)
      }
      row.registrations += s.registrations
      row.renewals += s.renewals
      row.transfers += s.transfers
      row.deletions += s.deletions
      row.revenue += s.revenue
      row.resellers += 1
      row._fails.push(s.failureRate)
      row.worstFailureRate = Math.max(row.worstFailureRate, s.failureRate)
    }
    const rows = [...acc.values()].map((r) => {
      const avg = r._fails.reduce((a, b) => a + b, 0) / Math.max(1, r._fails.length)
      const { _fails, ...rest } = r
      void _fails
      return { ...rest, revenue: Math.round(rest.revenue * 100) / 100, avgFailureRate: Math.round(avg * 100) / 100 }
    })
    _providerStats = materialized('provider_statistics', rows.sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : b.revenue - a.revenue)))
  }
  return _providerStats
}

// ---------------------------------------------------------------------------
// EV report — Extended Validation certificates and their org validation state
// ---------------------------------------------------------------------------

export interface EvRow extends Deletable {
  id: string
  commonName: string
  organisation: string
  resellerId: number
  company: string
  brand: string
  status: string
  orgValidation: 'approved' | 'documents_pending' | 'call_pending' | 'rejected'
  validatedBy: string | null
  orderedAt: string
  issuedAt: string | null
  expiresAt: string
  price: number
  years: number
  jurisdiction: string
  incorporationNumber: string
}

let _ev: Dataset<EvRow> | null = null
export function evReport(): Dataset<EvRow> {
  if (!_ev) {
    const ds = sslOrders()
    const rows: EvRow[] = []
    for (let i = 0; i < ds.total; i++) {
      const s = ds.at(i)
      if (s._deleted || s.validation !== 'EV') continue
      const g = new Gen('ev', s.id)
      const pending = s.status === 'pending_validation'
      rows.push({
        id: s.id,
        commonName: s.commonName,
        organisation: s.company,
        resellerId: s.resellerId,
        company: s.company,
        brand: s.brand,
        status: s.status,
        orgValidation: pending
          ? g.weighted<EvRow['orgValidation']>([['documents_pending', 52], ['call_pending', 40], ['rejected', 8]])
          : s.status === 'failed'
            ? 'rejected'
            : 'approved',
        validatedBy: pending ? null : g.pick(['sectigo.validation', 'digicert.validation', 'j.okafor']),
        orderedAt: s.orderedAt,
        issuedAt: s.issuedAt,
        expiresAt: s.expiresAt,
        price: s.price,
        years: s.years,
        jurisdiction: g.pick(['NL Amsterdam', 'DE Berlin', 'FR Paris', 'GB London', 'ES Madrid', 'US Delaware']),
        incorporationNumber: `${g.int(10000000, 99999999)}`,
      })
    }
    _ev = materialized('ev_report', rows)
  }
  return _ev
}

// ---------------------------------------------------------------------------
// Sales dashboard aggregates
// ---------------------------------------------------------------------------

export interface SalesMonth {
  month: string
  newResellers: number
  revenue: number
  mrr: number
  churnedResellers: number
}

export interface SegmentRow {
  segment: Reseller['segment']
  resellers: number
  domains: number
  mrr: number
  avgDomains: number
}

export interface SalesSummary {
  months: SalesMonth[]
  segments: SegmentRow[]
  topResellers: { id: number; company: string; mrr: number; domains: number; membership: string; manager: string }[]
  totals: { resellers: number; active: number; domains: number; mrr: number; churnRisk: number }
}

let _sales: SalesSummary | null = null
export function salesSummary(): SalesSummary {
  if (_sales) return _sales
  const ds = resellers()
  const segAcc = new Map<Reseller['segment'], SegmentRow>()
  const top: SalesSummary['topResellers'] = []
  let active = 0
  let domains = 0
  let mrr = 0
  let churnRisk = 0

  for (let i = 0; i < ds.total; i++) {
    const r = ds.at(i)
    if (r._deleted) continue
    if (r.status === 'active') active++
    domains += r.domains
    mrr += r.monthlyRevenue
    if (r.status === 'active' && r.lastLoginAt < '2026-06-01') churnRisk++
    const seg = segAcc.get(r.segment) ?? { segment: r.segment, resellers: 0, domains: 0, mrr: 0, avgDomains: 0 }
    seg.resellers++
    seg.domains += r.domains
    seg.mrr += r.monthlyRevenue
    segAcc.set(r.segment, seg)
    top.push({ id: r.id, company: r.company, mrr: r.monthlyRevenue, domains: r.domains, membership: r.membership, manager: r.accountManager })
  }

  const segments = [...segAcc.values()].map((s) => ({
    ...s,
    mrr: Math.round(s.mrr * 100) / 100,
    avgDomains: Math.round(s.domains / Math.max(1, s.resellers)),
  })).sort((a, b) => b.mrr - a.mrr)

  const months: SalesMonth[] = Array.from({ length: 12 }, (_, i) => {
    const month = isoDate(NOW_MS - i * 30 * 86400000).slice(0, 7)
    const g = new Gen('salesmonth', month)
    return {
      month,
      newResellers: g.int(40, 180),
      revenue: Math.round(mrr * g.float(0.85, 1.1) * 100) / 100,
      mrr: Math.round(mrr * g.float(0.9, 1.05) * 100) / 100,
      churnedResellers: g.int(8, 60),
    }
  })

  _sales = {
    months,
    segments,
    topResellers: top.sort((a, b) => b.mrr - a.mrr).slice(0, 15),
    totals: { resellers: ds.total, active, domains, mrr: Math.round(mrr * 100) / 100, churnRisk },
  }
  return _sales
}
