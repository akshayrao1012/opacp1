import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowUpRight, Clock, Download, ShieldCheck, TrendingUp } from 'lucide-react'
import { DataTable } from '../components/patterns/DataTable'
import { Module, PageHeader } from '../components/patterns/Page'
import { Badge, Button, Callout, Card, CardHeader, Progress, StatTile, StatusBadge, Tooltip } from '../components/ui'
import { money, num, pct, relative, shortDate } from '../lib/format'
import type { TableSpec } from '../lib/table'
import { kycQueueCounts } from '../lib/mock/customers'
import { transfers } from '../lib/mock/domains'
import { TASK_STATS } from '../lib/mock/ops'
import { notificationSettings } from '../lib/mock/resellers'
import {
  evReport, negativeBalances, postpaidDebt, providerStatistics, salesSummary,
  type DebtRow, type EvRow, type NegativeBalanceRow, type ProviderStatRow,
} from '../lib/mock/reports'

/** Shared header note: every report is a view over operational rows, not a separate truth. */
function Provenance({ source, to }: { source: string; to: string }) {
  return (
    <p className="text-2xs text-ink-400">
      Derived from <Link to={to} className="text-brand-700 hover:underline">{source}</Link> — the same rows the operational pages show, so a
      number here can always be drilled into.
    </p>
  )
}

// ─────────────────────────────────────────────────────── Support dashboard

export function SupportDashboard() {
  const kyc = useMemo(() => kycQueueCounts(), [])
  const queues = useMemo(() => {
    const tr = transfers()
    let ack = 0
    let stalled = 0
    let failed = 0
    for (let i = 0; i < tr.total; i++) {
      const t = tr.at(i)
      if (t._deleted) continue
      if (t.status === 'ack_required') ack++
      if (t.status === 'in_progress' && t.ageHours > 240) stalled++
      if (t.status === 'failed') failed++
    }
    const ns = notificationSettings()
    let webhookFailing = 0
    let webhookFailures = 0
    for (let i = 0; i < ns.total; i++) {
      const n = ns.at(i)
      if (n._deleted) continue
      if (n.failures24h > 0) webhookFailing++
      webhookFailures += n.failures24h
    }
    return { ack, stalled, failed, webhookFailing, webhookFailures }
  }, [])

  const rows = [
    { label: 'KYC cases in review', value: kyc.in_review, breach: kyc.breached, to: '/customers/identity-verification?tab=queue', owner: 'Abuse & Compliance' },
    { label: 'Transfers needing ACK', value: queues.ack, breach: 0, to: '/domains/transfers?tab=third_party', owner: 'Support Lead (L2)' },
    { label: 'Transfers stalled > 10 days', value: queues.stalled, breach: queues.stalled, to: '/domains/transfers?tab=third_party', owner: 'Support Lead (L2)' },
    { label: 'Failed transfers', value: queues.failed, breach: 0, to: '/domains/transfers?tab=third_party', owner: 'Support Lead (L2)' },
    { label: 'Resellers with failing webhooks', value: queues.webhookFailing, breach: 0, to: '/customers/resellers/notification-settings', owner: 'Technical Operations' },
    { label: 'Outdated task backlog', value: TASK_STATS.outdated, breach: TASK_STATS.outdated, to: '/system/tasks?tab=outdated', owner: 'Technical Operations' },
  ]

  return (
    <Module permissions={['reports.read']} what="the support dashboard">
      <PageHeader
        title="Support Dashboard"
        subtitle="What is waiting on a human right now, who owns it, and what has breached its service level."
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="KYC in review" value={num(kyc.in_review)} tone="warn" hint={`${num(kyc.breached)} past SLA`} icon={<ShieldCheck className="h-4 w-4" />} />
        <StatTile label="Transfers needing action" value={num(queues.ack + queues.stalled)} tone="warn" />
        <STile label="Webhook failures 24h" value={num(queues.webhookFailures)} tone={queues.webhookFailures > 500 ? 'danger' : 'neutral'} />
        <StatTile label="Outdated tasks" value={num(TASK_STATS.outdated)} tone="danger" hint="cleanup pending (Q9)" />
      </div>

      <Card>
        <CardHeader title="Open queues" subtitle="Each row links to the list it counts" icon={<Clock className="h-4 w-4" />} />
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2 text-left">Queue</th>
              <th className="px-4 py-2 text-right">Waiting</th>
              <th className="px-4 py-2 text-right">Breached</th>
              <th className="px-4 py-2 text-left">Owner</th>
              <th className="px-4 py-2 text-left">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-ink-100">
                <td className="px-4 py-2 font-medium text-ink-900">{r.label}</td>
                <td className="px-4 py-2 text-right tabular">{num(r.value)}</td>
                <td className="px-4 py-2 text-right tabular">
                  {r.breach ? <span className="font-medium text-brand-700">{num(r.breach)}</span> : '0'}
                </td>
                <td className="px-4 py-2 text-2xs text-ink-600">{r.owner}</td>
                <td className="px-4 py-2">
                  <Link to={r.to} className="text-2xs text-brand-700 hover:underline">View list →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top failure reasons (transfers)" subtitle="Last 30 days" />
          <div className="space-y-2 p-4">
            {[
              ['Invalid auth code', 34],
              ['Registry rejected: domain locked', 24],
              ['Losing registrar NACK', 18],
              ['Registrant email bounced', 14],
              ['Insufficient balance', 10],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-center gap-3">
                <span className="w-56 shrink-0 truncate text-xs text-ink-700">{label}</span>
                <Progress value={value as number} tone={(value as number) > 30 ? 'danger' : 'brand'} />
                <span className="w-10 shrink-0 text-right text-2xs tabular text-ink-600">{pct(value as number, 0)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Escalation guide" subtitle="Where a support agent hands over" />
          <ul className="divide-y divide-ink-100 text-xs">
            {[
              ['Domain will not transfer', 'Support Lead (L2) — check the auth code and the FOA state on domain detail'],
              ['Refund above €500', 'Finance Approver — the request goes to the approval queue automatically'],
              ['Suspected phishing', 'Abuse & Compliance — use the bulk abuse form, never the per-domain hold'],
              ['Reseller locked out', 'Technical Operations — check Risk & Abuse → Bruteforce before unblocking'],
              ['Bulk request stuck', 'Technical Operations — Risk & Abuse → Batch Cracker'],
            ].map(([situation, who]) => (
              <li key={situation} className="px-4 py-2">
                <p className="font-medium text-ink-900">{situation}</p>
                <p className="text-2xs text-ink-600">{who}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Provenance source="the operational queues" to="/system/tasks" />
    </Module>
  )
}

/** Small alias so the tile grid above reads evenly. */
function STile(props: Parameters<typeof StatTile>[0]) {
  return <StatTile {...props} />
}

// ─────────────────────────────────────────────────────── Sales dashboard

export function SalesDashboard() {
  const s = useMemo(() => salesSummary(), [])
  const maxRevenue = Math.max(...s.months.map((m) => m.revenue))

  return (
    <Module permissions={['reports.sales.read']} what="the sales dashboard">
      <PageHeader
        title="Sales Dashboard"
        subtitle="Revenue, segmentation and account health — the view the old ACP could only produce by exporting Resellers to a spreadsheet."
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="MRR" value={money(s.totals.mrr)} tone="success" icon={<TrendingUp className="h-4 w-4" />} />
        <StatTile label="Active resellers" value={num(s.totals.active)} hint={`of ${num(s.totals.resellers)}`} />
        <StatTile label="Domains under management" value={num(s.totals.domains)} />
        <StatTile label="Churn risk" value={num(s.totals.churnRisk)} tone="warn" hint="active, no login in 90 days" />
      </div>

      <Card>
        <CardHeader title="Revenue by month" subtitle="Last 12 months" />
        <div className="space-y-2 p-4">
          {s.months.map((m) => (
            <div key={m.month} className="flex items-center gap-3">
              <span className="w-20 shrink-0 font-mono text-2xs text-ink-600">{m.month}</span>
              <Progress value={(m.revenue / maxRevenue) * 100} />
              <span className="w-24 shrink-0 text-right text-2xs tabular text-ink-700">{money(m.revenue)}</span>
              <span className="w-28 shrink-0 text-right text-2xs tabular text-ink-500">+{m.newResellers} / −{m.churnedResellers}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Segments" subtitle="Where the revenue actually sits" />
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2 text-left">Segment</th>
                <th className="px-4 py-2 text-right">Resellers</th>
                <th className="px-4 py-2 text-right">Domains</th>
                <th className="px-4 py-2 text-right">Avg domains</th>
                <th className="px-4 py-2 text-right">MRR</th>
              </tr>
            </thead>
            <tbody>
              {s.segments.map((seg) => (
                <tr key={seg.segment} className="border-t border-ink-100">
                  <td className="px-4 py-2 font-medium capitalize text-ink-900">{seg.segment.replace('_', ' ')}</td>
                  <td className="px-4 py-2 text-right tabular">{num(seg.resellers)}</td>
                  <td className="px-4 py-2 text-right tabular">{num(seg.domains)}</td>
                  <td className="px-4 py-2 text-right tabular">{num(seg.avgDomains)}</td>
                  <td className="px-4 py-2 text-right tabular">{money(seg.mrr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardHeader title="Top resellers by MRR" subtitle="Top 15" actions={<Link to="/customers/resellers" className="text-2xs text-brand-700 hover:underline">All resellers</Link>} />
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2 text-left">Reseller</th>
                <th className="px-4 py-2 text-left">Plan</th>
                <th className="px-4 py-2 text-right">Domains</th>
                <th className="px-4 py-2 text-right">MRR</th>
              </tr>
            </thead>
            <tbody>
              {s.topResellers.map((r) => (
                <tr key={r.id} className="border-t border-ink-100 hover:bg-ink-50">
                  <td className="px-4 py-2">
                    <Link to={`/customers/resellers/${r.id}`} className="font-medium text-ink-900 hover:text-brand-700 hover:underline">{r.company}</Link>
                    <span className="block text-2xs text-ink-500">{r.manager}</span>
                  </td>
                  <td className="px-4 py-2"><Badge>{r.membership}</Badge></td>
                  <td className="px-4 py-2 text-right tabular">{num(r.domains)}</td>
                  <td className="px-4 py-2 text-right tabular">{money(r.mrr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <Provenance source="the reseller book" to="/customers/resellers" />
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Postpaid customer debt

const debtSpec: TableSpec<DebtRow> = {
  id: 'postpaid_debt',
  rowId: (d) => d.id,
  defaultSort: { key: 'outstanding', dir: 'desc' },
  search: (d) => `${d.resellerId} ${d.company} ${d.accountManager} ${d.country}`,
  columns: [
    { key: 'company', header: 'Reseller', render: (d) => <Link to={`/customers/resellers/${d.resellerId}`} className="font-medium hover:text-brand-700 hover:underline">{d.company}</Link> },
    { key: 'resellerId', header: 'ID', width: 90, mono: true, value: (d) => d.resellerId },
    { key: 'outstanding', header: 'Outstanding', width: 130, align: 'right', render: (d) => <span className="font-semibold text-brand-700">{money(d.outstanding, d.currency)}</span> },
    { key: 'creditLimit', header: 'Credit limit', width: 120, align: 'right', render: (d) => money(d.creditLimit, d.currency) },
    { key: 'utilisation', header: 'Utilisation', width: 150, sortable: false, value: (d) => d.outstanding / d.creditLimit, render: (d) => {
      const u = (d.outstanding / d.creditLimit) * 100
      return (
        <div className="flex items-center gap-2">
          <Progress value={Math.min(100, u)} tone={u > 100 ? 'danger' : u > 75 ? 'brand' : 'success'} />
          <span className="w-10 text-right text-2xs tabular text-ink-600">{pct(u, 0)}</span>
        </div>
      )
    } },
    { key: 'riskBand', header: 'Band', width: 110, render: (d) => (
      <Badge tone={d.riskBand === 'legal' ? 'danger' : d.riskBand === 'suspend' ? 'danger' : d.riskBand === 'chase' ? 'warn' : 'neutral'}>{d.riskBand}</Badge>
    ) },
    { key: 'oldestInvoiceDays', header: 'Oldest invoice', width: 130, align: 'right', render: (d) => `${d.oldestInvoiceDays} d` },
    { key: 'overdueInvoices', header: 'Overdue', width: 100, align: 'right' },
    { key: 'paymentTerm', header: 'Term', width: 100 },
    { key: 'membership', header: 'Plan', width: 110 },
    { key: 'accountManager', header: 'Account manager', width: 160 },
    { key: 'lastPaymentAt', header: 'Last payment', width: 130, render: (d) => relative(d.lastPaymentAt) },
    { key: 'country', header: 'Country', width: 130, optional: true },
    { key: 'monthlyRevenue', header: 'MRR', width: 110, align: 'right', optional: true, render: (d) => money(d.monthlyRevenue) },
  ],
  filters: [
    { key: 'riskBand', label: 'Risk band', type: 'multiselect', options: ['watch', 'chase', 'suspend', 'legal'].map((v) => ({ value: v, label: v })) },
    { key: 'paymentTerm', label: 'Payment term', type: 'select', options: [{ value: 'Net 14', label: 'Net 14' }, { value: 'Net 30', label: 'Net 30' }] },
    { key: 'outstanding', label: 'Outstanding', type: 'numberrange' },
    { key: 'oldestInvoiceDays', label: 'Oldest invoice (days)', type: 'numberrange' },
    { key: 'accountManager', label: 'Account manager', type: 'text' },
  ],
}

export function PostpaidDebtReport() {
  const ds = postpaidDebt()
  const totals = useMemo(() => {
    let total = 0
    let legal = 0
    let over90 = 0
    for (let i = 0; i < ds.total; i++) {
      const d = ds.at(i)
      total += d.outstanding
      if (d.riskBand === 'legal') legal++
      if (d.oldestInvoiceDays > 90) over90++
    }
    return { total, legal, over90 }
  }, [ds])

  return (
    <Module permissions={['reports.finance.read']} what="the debt report">
      <PageHeader
        title="Postpaid Customer Debt"
        subtitle="Resellers on Net 14 or Net 30 with money outstanding, banded by how collectable it still is."
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Total outstanding" value={money(totals.total)} tone="danger" />
        <StatTile label="Accounts in debt" value={num(ds.total)} />
        <StatTile label="Over 90 days" value={num(totals.over90)} tone="danger" hint="hand to Legal" />
        <StatTile label="Legal band" value={num(totals.legal)} tone="danger" />
      </div>
      <Callout tone="warn" icon={<AlertTriangle className="h-4 w-4" />} title="Bands are a suggestion, not an action">
        Nothing on this page suspends anybody. Suspension is a reseller action with its own confirmation, so the decision stays with a
        person who sees the account.
      </Callout>
      <DataTable spec={debtSpec} data={ds} permission="reports.finance.read" exportName="postpaid debt" />
      <Provenance source="reseller balances and payment terms" to="/customers/resellers" />
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Negative available balance

const negSpec: TableSpec<NegativeBalanceRow> = {
  id: 'negative_balances',
  rowId: (r) => r.id,
  defaultSort: { key: 'available', dir: 'asc' },
  search: (r) => `${r.resellerId} ${r.company}`,
  columns: [
    { key: 'company', header: 'Reseller', render: (r) => <Link to={`/customers/resellers/${r.resellerId}`} className="font-medium hover:text-brand-700 hover:underline">{r.company}</Link> },
    { key: 'resellerId', header: 'ID', width: 90, mono: true, value: (r) => r.resellerId },
    { key: 'balance', header: 'Balance', width: 120, align: 'right', render: (r) => money(r.balance, r.currency) },
    { key: 'reserved', header: 'Reserved', width: 120, align: 'right', render: (r) => money(r.reserved, r.currency) },
    { key: 'available', header: 'Available', width: 130, align: 'right', render: (r) => <span className="font-semibold text-brand-700">{money(r.available, r.currency)}</span> },
    { key: 'renewalsDue30d', header: 'Renewals 30d', width: 130, align: 'right', render: (r) => num(r.renewalsDue30d) },
    { key: 'renewalValue30d', header: 'Renewal value', width: 130, align: 'right', render: (r) => money(r.renewalValue30d) },
    { key: 'shortfall', header: 'Shortfall', width: 130, align: 'right', value: (r) => r.renewalValue30d + r.available, render: (r) => {
      const short = r.renewalValue30d + r.available
      return <span className={short < 0 ? 'font-medium text-brand-700' : 'text-emerald-700'}>{money(short)}</span>
    } },
    { key: 'suspendOnNegative', header: 'Auto-suspend', width: 130, render: (r) => (r.suspendOnNegative ? <Badge tone="danger">on</Badge> : <Badge>off</Badge>) },
    { key: 'autoRenewDomains', header: 'Auto-renew domains', width: 160, align: 'right', render: (r) => num(r.autoRenewDomains) },
    { key: 'paymentTerm', header: 'Term', width: 110 },
    { key: 'status', header: 'Status', width: 110, render: (r) => <StatusBadge status={r.status} /> },
    { key: 'lastLoginAt', header: 'Last login', width: 130, optional: true, render: (r) => relative(r.lastLoginAt) },
  ],
  filters: [
    { key: 'available', label: 'Available balance', type: 'numberrange' },
    { key: 'suspendOnNegative', label: 'Auto-suspend enabled', type: 'boolean' },
    { key: 'paymentTerm', label: 'Payment term', type: 'select', options: ['Prepaid', 'Net 14', 'Net 30', 'Direct debit'].map((v) => ({ value: v, label: v })) },
    { key: 'status', label: 'Reseller status', type: 'multiselect', options: ['active', 'suspended', 'pending', 'closed'].map((v) => ({ value: v, label: v })) },
    { key: 'renewalsDue30d', label: 'Renewals due (30d)', type: 'numberrange' },
  ],
}

export function NegativeBalanceReport() {
  const ds = negativeBalances()
  const totals = useMemo(() => {
    let available = 0
    let atRisk = 0
    let domains = 0
    for (let i = 0; i < ds.total; i++) {
      const r = ds.at(i)
      available += r.available
      if (r.renewalValue30d + r.available < 0) atRisk++
      domains += r.autoRenewDomains
    }
    return { available, atRisk, domains }
  }, [ds])

  return (
    <Module permissions={['reports.finance.read']} what="the balance report">
      <PageHeader
        title="Negative Available Balance"
        subtitle="Available balance is the balance minus what is already reserved for pending operations. When it goes negative, the next renewal fails."
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Total negative" value={money(totals.available)} tone="danger" />
        <StatTile label="Accounts" value={num(ds.total)} />
        <StatTile label="Cannot cover 30d renewals" value={num(totals.atRisk)} tone="danger" hint="domains will silently expire" />
        <StatTile label="Auto-renew domains exposed" value={num(totals.domains)} tone="warn" />
      </div>
      <Callout tone="danger" title="This is the report that prevents silent expiry">
        A reseller with a negative available balance and auto-renew on loses domains at expiry without anyone deciding to let them go. The
        shortfall column is the number worth chasing: available balance plus the value of the next 30 days of renewals.
      </Callout>
      <DataTable spec={negSpec} data={ds} permission="reports.finance.read" exportName="negative available balance" />
      <Provenance source="reseller balances and auto-renew settings" to="/customers/resellers" />
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Domain provider statistics

const providerStatSpec: TableSpec<ProviderStatRow> = {
  id: 'provider_statistics',
  rowId: (r) => r.id,
  defaultSort: { key: 'revenue', dir: 'desc' },
  search: (r) => `${r.provider} ${r.month}`,
  columns: [
    { key: 'provider', header: 'Provider', render: (r) => <Link to={`/domains/providers?q=${encodeURIComponent(r.provider)}`} className="font-medium hover:text-brand-700 hover:underline">{r.provider}</Link> },
    { key: 'month', header: 'Month', width: 110, mono: true },
    { key: 'registrations', header: 'Registrations', width: 130, align: 'right', render: (r) => num(r.registrations) },
    { key: 'renewals', header: 'Renewals', width: 110, align: 'right', render: (r) => num(r.renewals) },
    { key: 'transfers', header: 'Transfers', width: 110, align: 'right', render: (r) => num(r.transfers) },
    { key: 'deletions', header: 'Deletions', width: 110, align: 'right', render: (r) => num(r.deletions) },
    { key: 'revenue', header: 'Revenue', width: 130, align: 'right', render: (r) => money(r.revenue) },
    { key: 'resellers', header: 'Resellers', width: 110, align: 'right' },
    { key: 'avgFailureRate', header: 'Avg failure', width: 120, align: 'right', render: (r) => (
      <span className={r.avgFailureRate > 5 ? 'font-medium text-brand-700' : undefined}>{pct(r.avgFailureRate, 2)}</span>
    ) },
    { key: 'worstFailureRate', header: 'Worst failure', width: 130, align: 'right', render: (r) => (
      <Tooltip content="Highest failure rate any single reseller saw with this provider that month">
        <span className={r.worstFailureRate > 7 ? 'font-medium text-brand-700' : undefined}>{pct(r.worstFailureRate, 1)}</span>
      </Tooltip>
    ) },
  ],
  filters: [
    { key: 'provider', label: 'Provider', type: 'text' },
    { key: 'month', label: 'Month', type: 'text', placeholder: '2026-08' },
    { key: 'avgFailureRate', label: 'Average failure %', type: 'numberrange' },
    { key: 'revenue', label: 'Revenue', type: 'numberrange' },
  ],
}

export function ProviderStatisticsReport() {
  const ds = providerStatistics()
  return (
    <Module permissions={['reports.read']} what="provider statistics">
      <PageHeader
        title="Domain Provider Statistics"
        subtitle="Registry volume, revenue and failure rate per month — aggregated from the per-reseller figures rather than counted twice."
      />
      <DataTable spec={providerStatSpec} data={ds} permission="reports.read" exportName="provider statistics" />
      <Provenance source="per-reseller registry statistics" to="/domains/providers" />
    </Module>
  )
}

// ─────────────────────────────────────────────────────── EV report

const evSpec: TableSpec<EvRow> = {
  id: 'ev_report',
  rowId: (r) => r.id,
  defaultSort: { key: 'orderedAt', dir: 'desc' },
  search: (r) => `${r.id} ${r.commonName} ${r.organisation} ${r.incorporationNumber}`,
  columns: [
    { key: 'commonName', header: 'Common name', render: (r) => <span className="font-medium">{r.commonName}</span> },
    { key: 'id', header: 'Order', width: 120, mono: true },
    { key: 'organisation', header: 'Organisation', width: 200 },
    { key: 'orgValidation', header: 'Org validation', width: 160, render: (r) => (
      <Badge tone={r.orgValidation === 'approved' ? 'success' : r.orgValidation === 'rejected' ? 'danger' : 'warn'}>
        {r.orgValidation.replace(/_/g, ' ')}
      </Badge>
    ) },
    { key: 'status', header: 'Certificate', width: 150, render: (r) => <StatusBadge status={r.status} /> },
    { key: 'brand', header: 'Brand', width: 120 },
    { key: 'jurisdiction', header: 'Jurisdiction', width: 140 },
    { key: 'incorporationNumber', header: 'Incorporation no.', width: 150, mono: true },
    { key: 'price', header: 'Price', width: 110, align: 'right', render: (r) => money(r.price) },
    { key: 'orderedAt', header: 'Ordered', width: 120, render: (r) => shortDate(r.orderedAt) },
    { key: 'issuedAt', header: 'Issued', width: 120, render: (r) => (r.issuedAt ? shortDate(r.issuedAt) : '—') },
    { key: 'expiresAt', header: 'Expires', width: 120, render: (r) => (
      <span className={r.expiresAt < '2026-10-26' ? 'font-medium text-amber-700' : undefined}>{shortDate(r.expiresAt)}</span>
    ) },
    { key: 'validatedBy', header: 'Validated by', width: 150, optional: true, render: (r) => r.validatedBy ?? '—' },
    { key: 'company', header: 'Reseller', width: 190, optional: true, render: (r) => <Link to={`/customers/resellers/${r.resellerId}`} className="hover:text-brand-700 hover:underline">{r.company}</Link> },
  ],
  filters: [
    { key: 'orgValidation', label: 'Org validation', type: 'multiselect', options: ['approved', 'documents_pending', 'call_pending', 'rejected'].map((v) => ({ value: v, label: v.replace(/_/g, ' ') })) },
    { key: 'status', label: 'Certificate status', type: 'multiselect', options: ['active', 'issued', 'pending_validation', 'expired', 'failed', 'cancelled'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'brand', label: 'Brand', type: 'select', options: ['Sectigo', 'Comodo', 'DigiCert', 'GeoTrust'].map((v) => ({ value: v, label: v })) },
    { key: 'expiresAt', label: 'Expires', type: 'daterange' },
    { key: 'jurisdiction', label: 'Jurisdiction', type: 'text' },
  ],
}

export function EvReport() {
  const ds = evReport()
  const [note, setNote] = useState(true)
  const stats = useMemo(() => {
    let pending = 0
    let rejected = 0
    let value = 0
    for (let i = 0; i < ds.total; i++) {
      const r = ds.at(i)
      if (r.orgValidation === 'documents_pending' || r.orgValidation === 'call_pending') pending++
      if (r.orgValidation === 'rejected') rejected++
      value += r.price
    }
    return { pending, rejected, value }
  }, [ds])

  return (
    <Module permissions={['reports.read']} what="the EV report">
      <PageHeader
        title="EV Report"
        subtitle="Extended Validation certificates and where their organisation validation stands — the orders that need a human at the certificate authority."
        actions={
          <Button variant="secondary" onClick={() => setNote((v) => !v)}>
            <Download className="h-3.5 w-3.5" /> {note ? 'Hide' : 'Show'} guidance
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="EV certificates" value={num(ds.total)} icon={<ArrowUpRight className="h-4 w-4" />} />
        <StatTile label="Validation pending" value={num(stats.pending)} tone="warn" hint="documents or callback" />
        <StatTile label="Rejected" value={num(stats.rejected)} tone={stats.rejected ? 'danger' : 'success'} />
        <StatTile label="Order value" value={money(stats.value)} />
      </div>
      {note && (
        <Callout tone="info" title="Why EV gets its own report">
          EV is the only certificate class where the certificate authority validates the legal entity by hand: incorporation records plus a
          verified phone call. Those orders stall for weeks unless somebody watches them, which is what this list is for.
        </Callout>
      )}
      <DataTable spec={evSpec} data={ds} permission="reports.read" exportName="EV certificates" />
      <Provenance source="SSL orders" to="/products/ssl" />
    </Module>
  )
}
