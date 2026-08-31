import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Building2, CheckCircle2, Clock, CreditCard,
  Globe, ListChecks, Server, ShieldAlert, ShieldCheck, Sparkles, Target, TrendingUp, Users,
} from 'lucide-react'
import { PageHeader } from '../components/patterns/Page'
import { ActivityTimeline } from '../components/patterns/Activity'
import { Badge, Button, Callout, Card, CardHeader, Progress, StatTile, StatusBadge } from '../components/ui'
import { useCan, useCurrentUser, useStore } from '../lib/store'
import { money, num, pct, relative } from '../lib/format'
import { focusFor, tasksFor, widgetsFor, type WidgetId } from '../lib/dashboards'
import { contactValidations, kycQueueCounts } from '../lib/mock/customers'
import { transfers } from '../lib/mock/domains'
import { TASK_STATS, taskHealth } from '../lib/mock/ops'
import { financeHealth } from '../lib/mock/finance'
import { riskHealth } from '../lib/mock/risk'
import { notificationSettings, pendingResellers } from '../lib/mock/resellers'
import { negativeBalances, postpaidDebt, salesSummary } from '../lib/mock/reports'
import { promocodes, promotions } from '../lib/mock/catalog'

/** A dashboard section: title, optional link out, and its body. */
function Section({
  title, subtitle, icon, to, toLabel, children, span,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  to?: string
  toLabel?: string
  children: ReactNode
  span?: boolean
}) {
  return (
    <Card className={span ? 'lg:col-span-2' : undefined}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        actions={to ? <Link to={to} className="text-2xs text-brand-700 hover:underline">{toLabel ?? 'Open'} →</Link> : undefined}
      />
      <div className="p-4">{children}</div>
    </Card>
  )
}

interface Tile {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'neutral' | 'success' | 'warn' | 'danger'
  to?: string
}

function Tiles({ items }: { items: Tile[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((t) =>
        t.to ? (
          <Link key={t.label} to={t.to} className="block">
            <StatTile label={t.label} value={t.value} hint={t.hint} tone={t.tone} />
          </Link>
        ) : (
          <StatTile key={t.label} label={t.label} value={t.value} hint={t.hint} tone={t.tone} />
        ),
      )}
    </div>
  )
}

export function Home() {
  const user = useCurrentUser()
  const roles = useStore((s) => s.roles)
  const approvals = useStore((s) => s.approvals)
  const jobs = useStore((s) => s.jobs)
  const audit = useStore((s) => s.audit)
  const elevations = useStore((s) => s.elevations)

  const roleNames = user.roles.map((r) => roles.find((x) => x.id === r)?.name ?? r)
  const widgets = useMemo(() => new Set<WidgetId>(widgetsFor(user.roles)), [user.roles])
  const focus = useMemo(() => focusFor(user.roles), [user.roles])
  const quickTasks = useMemo(() => tasksFor(user.roles), [user.roles])
  const has = (w: WidgetId) => widgets.has(w)

  // Relevance decides what appears; permission still decides what may be read.
  const canReadPayments = useCan('payment.read')
  const canReadInvoices = useCan('finance.invoice.read')
  const canReadKyc = useCan('customer.kyc.read')
  const canReadContacts = useCan('customer.contact.read')
  const canReadTransfers = useCan('domain.transfer.read')
  const canReadResellers = useCan('reseller.read')
  const canReadTasks = useCan('ops.task.read')
  const canReadRisk = useCan('risk.bruteforce.read')
  const canReadBatches = useCan('risk.batch.read')
  const canReadJobs = useCan('admin.job.read')
  const canReadAudit = useCan('admin.audit.read')
  const canReadSales = useCan('reports.sales.read')
  const canReadFinanceReports = useCan('reports.finance.read')
  const canReadPromos = useCan('catalog.promotion.read')
  const canReadNotifications = useCan('reseller.notification.read')

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Good morning, ${user.name.split(' ')[0]}`}
        subtitle="This dashboard is composed from the roles you hold — another role sees different sections, not the same page with holes in it."
        meta={
          <>
            {roleNames.map((r) => (
              <Badge key={r} tone="brand">{r}</Badge>
            ))}
            <Badge tone="info">{user.scope.label}</Badge>
          </>
        }
        actions={
          <Button variant="secondary" onClick={() => useStore.getState().setOmniOpen(true)}>
            <Sparkles className="h-3.5 w-3.5" /> Search anything (⌘K)
          </Button>
        }
      />

      {has('focus') && (
        <Card className="border-brand-200 bg-brand-50/40">
          <div className="flex flex-wrap items-start gap-3 p-4">
            <span className="rounded-lg bg-brand-100 p-2 text-brand-700">
              <Target className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-900">Your focus</p>
              <ul className="mt-1 space-y-0.5">
                {focus.map((f) => (
                  <li key={f} className="text-sm text-ink-800">{f}</li>
                ))}
              </ul>
              {user.roles.length > 1 && (
                <p className="mt-1.5 text-2xs text-ink-500">
                  You hold {user.roles.length} roles, so this page is the union of their dashboards.
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {has('my_queue_support') && (
        <SupportQueue canKyc={canReadKyc} canTransfers={canReadTransfers} canResellers={canReadResellers} />
      )}
      {has('money_waiting') && canReadPayments && <MoneyWaiting />}
      {has('risk_summary') && canReadRisk && <RiskSummary />}
      {has('queue_health') && canReadTasks && <QueueHealth />}
      {has('sales_summary') && canReadSales && <SalesSummary />}

      <div className="grid gap-4 lg:grid-cols-2">
        {has('approvals') && <ApprovalsWidget approvals={approvals} />}
        {has('kyc_queue') && canReadKyc && <KycWidget />}
        {has('contact_validation_queue') && canReadContacts && <ContactValidationWidget />}
        {has('transfers_attention') && canReadTransfers && <TransfersWidget />}
        {has('onboarding_queue') && canReadResellers && <OnboardingWidget />}
        {has('invoice_health') && canReadInvoices && <InvoiceWidget />}
        {has('debt_and_balances') && canReadFinanceReports && <DebtWidget />}
        {has('abuse_enforcement') && canReadRisk && <AbuseWidget />}
        {has('stuck_batches') && canReadBatches && <BatchWidget />}
        {has('catalog_activity') && canReadPromos && <CatalogWidget />}
        {has('top_resellers') && canReadSales && <TopResellersWidget />}
        {has('webhook_failures') && canReadNotifications && <WebhookWidget />}
        {has('platform_health') && <PlatformHealthWidget />}
        {has('running_jobs') && canReadJobs && <JobsWidget jobs={jobs} />}
        {has('audit_t3') && canReadAudit && <AuditWidget audit={audit} />}
        {has('elevations') && canReadAudit && <ElevationsWidget audit={audit} live={elevations.length} />}
        {has('common_tasks') && quickTasks.length > 0 && <TasksWidget tasks={quickTasks} />}
        {has('my_activity') && <MyActivityWidget userId={user.id} />}
      </div>

      <Callout tone="info" icon={<Users className="h-4 w-4" />} title="This is a prototype with synthetic data">
        Switch identity in the top-right menu to see another role&apos;s dashboard. Nothing here talks to production; data is generated
        deterministically and the reset in the account menu puts it back.
      </Callout>
    </div>
  )
}

// ─────────────────────────────────────────────────────── section widgets

function SupportQueue({ canKyc, canTransfers, canResellers }: { canKyc: boolean; canTransfers: boolean; canResellers: boolean }) {
  const data = useMemo(() => {
    const kyc = canKyc ? kycQueueCounts() : { in_review: 0, breached: 0, awaiting_documents: 0, escalated: 0 }
    let ack = 0
    let stalled = 0
    if (canTransfers) {
      const tr = transfers()
      for (let i = 0; i < tr.total; i++) {
        const t = tr.at(i)
        if (t._deleted) continue
        if (t.status === 'ack_required') ack++
        if (t.status === 'in_progress' && t.ageHours > 240) stalled++
      }
    }
    let onboarding = 0
    if (canResellers) {
      const pr = pendingResellers()
      for (let i = 0; i < pr.total; i++) if (!pr.at(i)._deleted) onboarding++
    }
    return { kyc, ack, stalled, onboarding }
  }, [canKyc, canTransfers, canResellers])

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">My queue</h2>
      <Tiles
        items={[
          { label: 'Transfers needing ACK', value: num(data.ack), tone: data.ack ? 'warn' : 'success', to: '/domains/transfers', hint: 'registry waiting on us' },
          { label: 'Transfers stalled', value: num(data.stalled), tone: data.stalled ? 'danger' : 'success', to: '/domains/transfers', hint: 'over 10 days in progress' },
          { label: 'KYC in review', value: num(data.kyc.in_review), tone: data.kyc.breached ? 'danger' : 'neutral', to: '/customers/identity-verification', hint: `${num(data.kyc.breached)} past SLA` },
          { label: 'Resellers onboarding', value: num(data.onboarding), to: '/customers/resellers/new-pending', hint: 'awaiting review or KYC' },
        ]}
      />
    </section>
  )
}

function MoneyWaiting() {
  const fin = useMemo(() => financeHealth(), [])
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Money waiting on a decision</h2>
      <Tiles
        items={[
          { label: 'Refunds awaiting approval', value: num(fin.refundsAwaiting), tone: fin.refundsAwaiting ? 'warn' : 'success', hint: money(fin.refundsAwaitingValue), to: '/billing/payments?tab=refunds' },
          { label: 'Invoices overdue', value: num(fin.invoicesOverdue), tone: fin.invoicesOverdue ? 'danger' : 'success', hint: money(fin.invoicesOverdueValue), to: '/billing/invoices' },
          { label: 'Payments failed', value: num(fin.failed), tone: fin.failed ? 'warn' : 'success', hint: `${num(fin.chargebacks)} chargebacks`, to: '/billing/payments' },
          { label: 'Payments pending', value: num(fin.pending), hint: 'not yet settled', to: '/billing/payments' },
        ]}
      />
    </section>
  )
}

function RiskSummary() {
  const risk = useMemo(() => riskHealth(), [])
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Risk right now</h2>
      <Tiles
        items={[
          { label: 'IPs currently blocked', value: num(risk.blocked), tone: 'danger', to: '/risk/bruteforce' },
          { label: 'Credential stuffing', value: num(risk.credentialStuffing), tone: risk.credentialStuffing ? 'danger' : 'success', hint: 'one IP, many accounts', to: '/risk/bruteforce' },
          { label: 'Blacklist hits 24h', value: num(risk.blacklistHits24h), hint: `${num(risk.blacklistEntries)} entries`, to: '/risk/ip-blacklist' },
          { label: 'Protection weakened', value: num(risk.protectionWeakened), tone: risk.protectionWeakened ? 'warn' : 'success', hint: 'changes to review', to: '/risk/bruteforce?tab=changes' },
        ]}
      />
    </section>
  )
}

function QueueHealth() {
  const th = useMemo(() => taskHealth(), [])
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Queue health</h2>
      <Tiles
        items={[
          { label: 'Queued', value: num(th.queued), hint: `${num(th.running)} running`, to: '/system/tasks' },
          { label: 'Failed (30 days)', value: num(th.failed30d), tone: th.failed30d ? 'danger' : 'success', to: '/system/tasks?tab=errors' },
          { label: 'Outdated backlog', value: num(th.outdated), tone: 'warn', hint: `${pct((th.outdated / TASK_STATS.total) * 100, 0)} of the table`, to: '/system/tasks?tab=outdated' },
          { label: 'Failed all time', value: num(th.failedTotal), to: '/system/tasks?tab=errors' },
        ]}
      />
      {th.topFailures.length > 0 && (
        <Card>
          <CardHeader title="Top failure types" subtitle="Last 30 days" icon={<AlertTriangle className="h-4 w-4" />} />
          <div className="space-y-2 p-4">
            {th.topFailures.map((f) => (
              <div key={f.type} className="flex items-center gap-3">
                <code className="w-48 shrink-0 truncate font-mono text-2xs text-ink-700">{f.type}</code>
                <Progress value={(f.count / th.topFailures[0].count) * 100} tone="danger" />
                <span className="w-16 shrink-0 text-right text-2xs tabular text-ink-600">{num(f.count)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </section>
  )
}

function SalesSummary() {
  const s = useMemo(() => salesSummary(), [])
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Book of business</h2>
      <Tiles
        items={[
          { label: 'MRR', value: money(s.totals.mrr), tone: 'success', to: '/reports/sales' },
          { label: 'Active resellers', value: num(s.totals.active), hint: `of ${num(s.totals.resellers)}`, to: '/customers/resellers' },
          { label: 'Domains under management', value: num(s.totals.domains), to: '/domains' },
          { label: 'Churn risk', value: num(s.totals.churnRisk), tone: 'warn', hint: 'no login in 90 days', to: '/reports/sales' },
        ]}
      />
    </section>
  )
}

function ApprovalsWidget({ approvals }: { approvals: ReturnType<typeof useStore.getState>['approvals'] }) {
  return (
    <Section
      title="Waiting on an approver"
      subtitle={approvals.length ? `${approvals.length} Tier 3 request(s)` : 'Nothing waiting'}
      icon={<ShieldAlert className="h-4 w-4 text-amber-600" />}
      to="/system/jobs"
      toLabel="Job centre"
    >
      {approvals.length === 0 ? (
        <p className="text-xs text-ink-500">No Tier 3 operation is blocked on a second approver.</p>
      ) : (
        <ul className="space-y-2">
          {approvals.slice(0, 4).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-2 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-ink-900">{a.label}</p>
                <p className="text-2xs text-ink-500">{a.requestedBy} · {relative(a.requestedAt)} · {a.ticket}</p>
              </div>
              <div className="flex items-center gap-2">
                {a.amount && <span className="text-xs font-semibold tabular text-ink-900">{money(a.amount)}</span>}
                <Link
                  to={a.kind === 'refund' ? '/billing/payments?tab=refunds' : '/system/jobs'}
                  className="text-2xs text-brand-700 hover:underline"
                >
                  Review
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function KycWidget() {
  const kyc = useMemo(() => kycQueueCounts(), [])
  return (
    <Section
      title="Identity verification"
      subtitle="KYC / KYB decision queue"
      icon={<ShieldCheck className="h-4 w-4" />}
      to="/customers/identity-verification"
    >
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="In review" value={num(kyc.in_review)} tone="warn" />
        <StatTile label="Past SLA" value={num(kyc.breached)} tone={kyc.breached ? 'danger' : 'success'} />
        <StatTile label="Awaiting documents" value={num(kyc.awaiting_documents)} />
        <StatTile label="Escalated" value={num(kyc.escalated)} tone={kyc.escalated ? 'danger' : 'neutral'} />
      </div>
    </Section>
  )
}

function ContactValidationWidget() {
  const counts = useMemo(() => {
    const ds = contactValidations()
    let pending = 0
    let locked = 0
    for (let i = 0; i < ds.total; i++) {
      const c = ds.at(i)
      if (c._deleted) continue
      if (c.status === 'pending') pending++
      if (c.status === 'locked') locked++
    }
    return { pending, locked }
  }, [])
  return (
    <Section title="Contact validation" subtitle="Nominet registrant checks" icon={<Users className="h-4 w-4" />} to="/customers/contact-validation">
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Pending" value={num(counts.pending)} tone="warn" />
        <StatTile label="Locked" value={num(counts.locked)} tone="danger" hint="registrant cannot modify" />
      </div>
    </Section>
  )
}

function TransfersWidget() {
  const rows = useMemo(() => {
    const ds = transfers()
    const out: { id: string; domain: string; status: string; age: number }[] = []
    for (let i = 0; i < ds.total && out.length < 5; i++) {
      const t = ds.at(i)
      if (t._deleted) continue
      if (t.status !== 'ack_required' && !(t.status === 'in_progress' && t.ageHours > 240)) continue
      out.push({ id: t.id, domain: t.domain, status: t.status, age: t.ageHours })
    }
    return out
  }, [])
  return (
    <Section title="Transfers needing action" subtitle="ACK required or stalled" icon={<Globe className="h-4 w-4" />} to="/domains/transfers">
      {rows.length === 0 ? (
        <p className="text-xs text-ink-500">Nothing waiting.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <Link to={`/domains/${encodeURIComponent(r.domain)}`} className="min-w-0 truncate text-xs text-ink-800 hover:text-brand-700 hover:underline">
                {r.domain}
              </Link>
              <span className="flex shrink-0 items-center gap-2">
                <StatusBadge status={r.status} />
                <span className="text-2xs tabular text-ink-500">{num(r.age)}h</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function OnboardingWidget() {
  const counts = useMemo(() => {
    const ds = pendingResellers()
    let review = 0
    let kyc = 0
    let flagged = 0
    for (let i = 0; i < ds.total; i++) {
      const r = ds.at(i)
      if (r._deleted) continue
      r.queue === 'awaiting_review' ? review++ : kyc++
      if (r.riskFlags.length) flagged++
    }
    return { review, kyc, flagged }
  }, [])
  return (
    <Section title="Onboarding" subtitle="New reseller applications" icon={<Building2 className="h-4 w-4" />} to="/customers/resellers/new-pending">
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Awaiting review" value={num(counts.review)} tone="warn" />
        <StatTile label="Awaiting KYC" value={num(counts.kyc)} />
        <StatTile label="Risk flagged" value={num(counts.flagged)} tone={counts.flagged ? 'danger' : 'success'} />
      </div>
    </Section>
  )
}

function InvoiceWidget() {
  const fin = useMemo(() => financeHealth(), [])
  return (
    <Section title="Invoices" subtitle="Register totals" icon={<CreditCard className="h-4 w-4" />} to="/billing/invoices">
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Outstanding" value={money(fin.invoicesOutstanding)} tone="warn" />
        <StatTile label="Overdue" value={num(fin.invoicesOverdue)} tone={fin.invoicesOverdue ? 'danger' : 'success'} hint={money(fin.invoicesOverdueValue)} />
      </div>
      <p className="mt-2 text-2xs text-ink-500">Invoices are produced by the billing pipeline; this is the read model.</p>
    </Section>
  )
}

function DebtWidget() {
  const data = useMemo(() => {
    const debt = postpaidDebt()
    let total = 0
    let legal = 0
    for (let i = 0; i < debt.total; i++) {
      const d = debt.at(i)
      total += d.outstanding
      if (d.riskBand === 'legal') legal++
    }
    const neg = negativeBalances()
    let atRisk = 0
    for (let i = 0; i < neg.total; i++) {
      const r = neg.at(i)
      if (r.renewalValue30d + r.available < 0) atRisk++
    }
    return { total, legal, accounts: debt.total, negative: neg.total, atRisk }
  }, [])
  return (
    <Section title="Debt and balances" subtitle="Who to chase, and what breaks if nobody does" icon={<TrendingUp className="h-4 w-4" />} to="/reports/postpaid-debt">
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Postpaid debt" value={money(data.total)} tone="danger" hint={`${num(data.accounts)} accounts`} />
        <StatTile label="Legal band" value={num(data.legal)} tone={data.legal ? 'danger' : 'success'} />
        <StatTile label="Negative available" value={num(data.negative)} tone="warn" />
        <StatTile label="Cannot cover renewals" value={num(data.atRisk)} tone={data.atRisk ? 'danger' : 'success'} hint="domains will expire" />
      </div>
    </Section>
  )
}

function AbuseWidget() {
  const risk = useMemo(() => riskHealth(), [])
  return (
    <Section title="Enforcement" subtitle="Keyword and blacklist effect" icon={<ShieldAlert className="h-4 w-4" />} to="/risk/banned-keywords">
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Blocked by keyword (30d)" value={num(risk.keywordsBlocked30d)} tone="warn" />
        <StatTile label="False positives" value={num(risk.keywordFalsePositives)} tone={risk.keywordFalsePositives ? 'danger' : 'success'} hint="legitimate names refused" />
      </div>
      <p className="mt-2 text-2xs text-ink-500">
        Bulk enforcement goes through <Link to="/risk/bulk-abuse" className="text-brand-700 hover:underline">the abuse form</Link>, never
        domain by domain.
      </p>
    </Section>
  )
}

function BatchWidget() {
  const risk = useMemo(() => riskHealth(), [])
  return (
    <Section title="Stuck batches" subtitle="Bulk work that stopped progressing" icon={<Server className="h-4 w-4" />} to="/risk/batch-cracker">
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Stuck" value={num(risk.stuckBatches)} tone={risk.stuckBatches ? 'warn' : 'success'} />
        <StatTile label="Blocking the queue" value={num(risk.batchesBlockingQueue)} tone={risk.batchesBlockingQueue ? 'danger' : 'success'} />
      </div>
    </Section>
  )
}

function CatalogWidget() {
  const data = useMemo(() => {
    const pr = promotions()
    let live = 0
    let scheduled = 0
    for (let i = 0; i < pr.total; i++) {
      const p = pr.at(i)
      if (p._deleted) continue
      if (p.status === 'live') live++
      if (p.status === 'scheduled') scheduled++
    }
    const pc = promocodes()
    let active = 0
    let exhausted = 0
    for (let i = 0; i < pc.total; i++) {
      const c = pc.at(i)
      if (c._deleted) continue
      if (c.status === 'active') active++
      if (c.status === 'exhausted') exhausted++
    }
    return { live, scheduled, active, exhausted }
  }, [])
  return (
    <Section title="Campaigns" subtitle="Promotions and codes in market" icon={<BarChart3 className="h-4 w-4" />} to="/billing/promotions">
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Promotions live" value={num(data.live)} tone="success" hint={`${num(data.scheduled)} scheduled`} />
        <StatTile label="Promocodes active" value={num(data.active)} hint={`${num(data.exhausted)} exhausted`} />
      </div>
    </Section>
  )
}

function TopResellersWidget() {
  const s = useMemo(() => salesSummary(), [])
  return (
    <Section title="Top resellers" subtitle="By monthly revenue" icon={<Building2 className="h-4 w-4" />} to="/reports/sales">
      <ul className="space-y-1.5">
        {s.topResellers.slice(0, 5).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2">
            <Link to={`/customers/resellers/${r.id}`} className="min-w-0 truncate text-xs text-ink-800 hover:text-brand-700 hover:underline">
              {r.company}
            </Link>
            <span className="flex shrink-0 items-center gap-2">
              <Badge>{r.membership}</Badge>
              <span className="text-2xs tabular text-ink-600">{money(r.mrr)}</span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function WebhookWidget() {
  const data = useMemo(() => {
    const ds = notificationSettings()
    let failing = 0
    let failures = 0
    for (let i = 0; i < ds.total; i++) {
      const n = ds.at(i)
      if (n._deleted) continue
      if (n.failures24h > 0) failing++
      failures += n.failures24h
    }
    return { failing, failures }
  }, [])
  return (
    <Section
      title="Webhook delivery"
      subtitle="Resellers not receiving notifications"
      icon={<Activity className="h-4 w-4" />}
      to="/customers/resellers/notification-settings"
    >
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Endpoints failing" value={num(data.failing)} tone={data.failing ? 'warn' : 'success'} />
        <StatTile label="Failures 24h" value={num(data.failures)} tone={data.failures > 500 ? 'danger' : 'neutral'} />
      </div>
      <p className="mt-2 text-2xs text-ink-500">A silent webhook is a support ticket that has not been filed yet.</p>
    </Section>
  )
}

const HEALTH_ROWS: [string, string, number, 'success' | 'warn'][] = [
  ['Registry success (24h)', '98.4%', 98, 'success'],
  ['Mail delivery (24h)', '94.1%', 94, 'success'],
  ['p95 list load', '0.9s', 60, 'success'],
  ['Webhook failures (24h)', '1,284', 22, 'warn'],
]

function PlatformHealthWidget() {
  return (
    <Section title="Platform health" subtitle="Illustrative figures in this prototype" icon={<Server className="h-4 w-4" />}>
      <div className="space-y-2">
        {HEALTH_ROWS.map(([label, value, progress, tone]) => (
          <div key={label}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-ink-700">{label}</span>
              <span className={`text-sm font-semibold tabular ${tone === 'warn' ? 'text-amber-700' : 'text-emerald-700'}`}>{value}</span>
            </div>
            <div className="mt-1">
              <Progress value={progress} tone={tone === 'warn' ? 'brand' : 'success'} />
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function JobsWidget({ jobs }: { jobs: ReturnType<typeof useStore.getState>['jobs'] }) {
  const running = jobs.filter((j) => j.status === 'running' || j.status === 'awaiting_approval').slice(0, 4)
  return (
    <Section title="Running jobs" subtitle="Bulk operations, exports and migrations" icon={<ListChecks className="h-4 w-4" />} to="/system/jobs">
      {running.length === 0 ? (
        <p className="text-xs text-ink-500">Nothing running.</p>
      ) : (
        <ul className="space-y-2.5">
          {running.map((j) => (
            <li key={j.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-xs font-medium text-ink-900">{j.label}</p>
                <span className="flex shrink-0 items-center gap-1.5">
                  <StatusBadge status={j.status} />
                  <Badge tone={j.tier === 'T3' ? 'danger' : 'neutral'}>{j.tier}</Badge>
                </span>
              </div>
              <div className="mt-1">
                <Progress value={j.progress} tone={j.status === 'awaiting_approval' ? 'danger' : 'brand'} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function AuditWidget({ audit }: { audit: ReturnType<typeof useStore.getState>['audit'] }) {
  const t3 = audit.filter((a) => a.tier === 'T3').slice(0, 6)
  const denied = audit.filter((a) => a.outcome === 'denied').length
  return (
    <Section
      title="Recent Tier 3 activity"
      subtitle={`${num(denied)} denied attempts in the log`}
      icon={<ShieldAlert className="h-4 w-4" />}
      to="/system/audit?f=%7B%22tier%22%3A%5B%22T3%22%5D%7D"
      toLabel="Audit log"
    >
      <ul className="space-y-1.5">
        {t3.map((a) => (
          <li key={a.id} className="flex items-baseline justify-between gap-2">
            <code className="min-w-0 truncate font-mono text-2xs text-ink-800">{a.action}</code>
            <span className="shrink-0 text-2xs text-ink-500">{a.actor.split(' ')[0]} · {relative(a.at)}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function ElevationsWidget({ audit, live }: { audit: ReturnType<typeof useStore.getState>['audit']; live: number }) {
  const elevated = audit.filter((a) => a.elevated).length
  const grants = audit.filter((a) => a.action === 'admin.elevation.grant').length
  return (
    <Section title="Elevation" subtitle="Tier 3 access is never held permanently" icon={<Clock className="h-4 w-4" />} to="/system/audit">
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Active now" value={num(live)} tone={live ? 'warn' : 'success'} />
        <StatTile label="Grants logged" value={num(grants)} />
        <StatTile label="Under elevation" value={num(elevated)} />
      </div>
    </Section>
  )
}

function TasksWidget({ tasks }: { tasks: { label: string; to: string; hint: string }[] }) {
  return (
    <Section title="Common tasks" subtitle="Where this role usually starts" icon={<ArrowRight className="h-4 w-4" />} span>
      <div className="grid gap-2 sm:grid-cols-2">
        {tasks.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="flex items-start gap-2 rounded-lg border border-ink-200 px-3 py-2 hover:border-ink-300 hover:bg-ink-50"
          >
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-ink-900">{t.label}</span>
              <span className="block text-2xs text-ink-500">{t.hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </Section>
  )
}

function MyActivityWidget({ userId }: { userId: string }) {
  return (
    <Section title="My recent activity" subtitle="What you have done in this session" icon={<Clock className="h-4 w-4" />}>
      <ActivityTimeline resource="reseller" resourceId={userId} limit={5} showAllLink={false} />
    </Section>
  )
}
