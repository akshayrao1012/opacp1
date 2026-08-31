/**
 * Modules that are a tab strip over two existing surfaces. Keeping them here
 * rather than duplicating the tables means Billing → Payments and Finance →
 * Refunds are literally the same component, so they cannot drift apart.
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ExternalLink, KeyRound, Plus, RefreshCw } from 'lucide-react'
import { DataTable, ScaleNote } from '../components/patterns/DataTable'
import { Module, PageHeader, TabBar, useTab } from '../components/patterns/Page'
import { DetailRow, FieldGroup } from '../components/patterns/DetailRow'
import { T2Confirm } from '../components/patterns/Destructive'
import {
  Badge, Button, Callout, Card, CardHeader, Progress, StatTile, StatusBadge, Tooltip,
} from '../components/ui'
import { useCan, useStore } from '../lib/store'
import { money, num, relative, shortDate } from '../lib/format'
import type { TableSpec } from '../lib/table'
import { PaymentsPage, RefundsPage } from './Finance'
import { ResellerMemberships, ResellerProviderMappings } from './Resellers'
import { RateLimitsPage } from './Ops'
import { DomainProvidersPage } from './Catalog'
import { PromocodeBatchesTable, PromocodeGenerator } from './Billing'
import { PromocodesPage } from './Catalog'
import { LicensesTable, SslTable } from './Products'
import { PremiumDomainsTable } from './Domains'
import { comodoAccount, licenseMigrations, type LicenseMigration } from '../lib/mock/products'
import { REFUND_APPROVAL_THRESHOLD } from '../lib/rbac'

// ─────────────────────────────────────────────────── Billing → Payments (+ Refunds)

export function BillingPayments() {
  const [tab, setTab] = useTab('payments')
  const approvals = useStore((s) => s.approvals.filter((a) => a.kind === 'refund').length)

  return (
    <Module permissions={['payment.read']} what="payments">
      <PageHeader
        title="Payments"
        subtitle="Money in and money back out. Refunds sit next to the payments they reverse, because that is the only way to check one against the other."
      />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'payments', label: 'Payments' },
          { id: 'refunds', label: 'Refunds', count: approvals || undefined },
        ]}
      />
      {tab === 'payments' ? <PaymentsPage hideHeader /> : <RefundsPage hideHeader />}
      {tab === 'refunds' && (
        <p className="text-2xs text-ink-400">
          Refunds above {money(REFUND_APPROVAL_THRESHOLD)} need a second approver, and a payout to a different IBAN always does.
        </p>
      )}
    </Module>
  )
}

// ─────────────────────────────────────────── Customers → Membership Plans

export function MembershipPlansPage() {
  const [tab, setTab] = useTab('subscriptions')
  return (
    <Module permissions={['reseller.membership.read', 'ops.ratelimit.read']} what="membership plans">
      <PageHeader
        title="Membership Plans"
        subtitle="Subscriptions and the API rate limits each plan grants. The old ACP kept these on one page for the wrong reason — they share a plan, not a purpose — so they are tabs here rather than one long list."
      />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'subscriptions', label: 'Subscriptions' },
          { id: 'rate-limits', label: 'Rate Limits' },
        ]}
      />
      {tab === 'subscriptions' ? <ResellerMemberships hideHeader /> : <RateLimitsPage hideHeader />}
    </Module>
  )
}

// ─────────────────────────────────────────────── Domains → Providers

export function DomainProvidersModule() {
  const [tab, setTab] = useTab('providers')
  return (
    <Module permissions={['catalog.provider.read', 'reseller.provider.read']} what="domain providers">
      <PageHeader
        title="Providers"
        subtitle="The registry list and the per-reseller credentials that talk to it. Credentials stay write-only — they can be rotated, never read back."
      />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'providers', label: 'Providers' },
          { id: 'reseller-mapping', label: 'Reseller mapping' },
        ]}
      />
      {tab === 'providers' ? <DomainProvidersPage hideHeader /> : <ResellerProviderMappings hideHeader />}
    </Module>
  )
}

// ─────────────────────────────────────────────── Billing → Promocodes

export function PromocodesModule() {
  const [tab, setTab] = useTab('manager')
  const [genOpen, setGenOpen] = useState(false)
  const canWrite = useCan('catalog.promocode.write')

  return (
    <Module permissions={['catalog.promocode.read']} what="promocodes">
      <PageHeader
        title="Promocodes"
        subtitle="Promocode Manager and Fast Checkout Promocodes were two pages with two conventions. One module, one create flow, a type per tab — plus batch generation."
        actions={
          <Button variant="primary" disabled={!canWrite} onClick={() => setGenOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Generate
          </Button>
        }
      />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'manager', label: 'Manager' },
          { id: 'fast-checkout', label: 'Fast Checkout' },
          { id: 'batches', label: 'Batches' },
        ]}
      />
      {tab === 'batches' ? (
        <PromocodeBatchesTable />
      ) : (
        <PromocodesPage hideHeader forceType={tab === 'fast-checkout' ? 'FastCheckout' : 'Standard'} />
      )}
      <PromocodeGenerator open={genOpen} onClose={() => setGenOpen(false)} />
    </Module>
  )
}

// ─────────────────────────────────────────────── Products → SSL (Certificates · SSL Panel)

export function SslModule() {
  const [tab, setTab] = useTab('certificates')
  const [resetOpen, setResetOpen] = useState(false)
  const canAdmin = useCan('product.ssl.admin')
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)

  return (
    <Module permissions={['product.ssl.read']} what="SSL">
      <PageHeader
        title="SSL"
        subtitle="Certificate orders, and the external SSL Panel that issues them."
        actions={
          <Button variant="secondary" disabled={!canAdmin} onClick={() => setResetOpen(true)}>
            <KeyRound className="h-3.5 w-3.5" /> Reset Comodo password
          </Button>
        }
      />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'certificates', label: 'Certificates' },
          { id: 'panel', label: 'SSL Panel' },
        ]}
      />

      {tab === 'certificates' && <SslTable />}

      {tab === 'panel' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="sslpanel.io" subtitle="External tool — opens in a new tab" icon={<ExternalLink className="h-4 w-4" />} />
            <div className="space-y-3 p-4">
              <Callout tone="warn" title="This is not part of the ACP">
                The SSL Panel is a separate product on its own domain, with its own login and its own audit trail. The legacy ACP listed it
                as a navigation entry, so it looked like a page and behaved like a redirect. Here it is a labelled hand-off: you can see
                what it is and what account it uses before you leave.
              </Callout>
              <FieldGroup title="Connection">
                <DetailRow label="URL" value={<code className="font-mono text-xs">https://sslpanel.io</code>} />
                <DetailRow label="Account" value={comodoAccount.account} />
                <DetailRow label="API user" value={comodoAccount.apiUser} />
                <DetailRow label="Credential last rotated" value={`${shortDate(comodoAccount.lastRotatedAt)} (${relative(comodoAccount.lastRotatedAt)})`} />
                <DetailRow label="Shared credential" value="Yes — the ACP worker and the panel use the same account" />
              </FieldGroup>
              <Button
                variant="secondary"
                onClick={() => {
                  logAudit({ action: 'product.ssl.read', resource: 'ssl_panel', resourceId: 'sslpanel.io', reason: 'Opened the external SSL panel' })
                  window.open('https://sslpanel.io', '_blank', 'noopener,noreferrer')
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open SSL Panel
              </Button>
              <p className="text-2xs text-ink-500">
                Leaving the ACP is recorded, so an action taken in the panel can at least be tied to the person who went there.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="What the panel does that this module does not" />
            <ul className="divide-y divide-ink-100 text-xs">
              {[
                ['Issue and re-issue certificates', 'Certificate signing needs the CSR and the private key exchange, which stays in the panel.'],
                ['Complete domain validation', 'DV email and DNS challenges are driven from the panel.'],
                ['EV organisation validation', 'The callback with the certificate authority happens there; the status arrives back here.'],
                ['Download issued certificates', 'The bundle is fetched from the panel, never stored in the ACP.'],
              ].map(([what, why]) => (
                <li key={what} className="px-4 py-2">
                  <p className="font-medium text-ink-900">{what}</p>
                  <p className="text-2xs text-ink-600">{why}</p>
                </li>
              ))}
            </ul>
            <div className="border-t border-ink-100 px-4 py-2">
              <p className="text-2xs text-ink-500">
                Whether the panel is absorbed into the ACP is open decision Q7. Until it is decided, this tab is honest about the boundary
                rather than pretending there isn&apos;t one.
              </p>
            </div>
          </Card>
        </div>
      )}

      <T2Confirm
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset Comodo reseller password"
        permission="product.ssl.admin"
        cta="Reset password"
        description={
          <div className="space-y-2">
            <p>The old button did this with no indication of impact. Here is what happens:</p>
            <ul className="ml-4 list-disc space-y-0.5">
              {comodoAccount.rotationImpact.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
            <p className="text-ink-500">
              Account <code className="font-mono">{comodoAccount.account}</code> · last rotated {relative(comodoAccount.lastRotatedAt)}.
            </p>
          </div>
        }
        onConfirm={({ reason, ticket }) => {
          logAudit({ action: 'product.ssl.admin', resource: 'ssl_account', resourceId: comodoAccount.account, after: { passwordRotated: true }, reason, ticket })
          addToast({ kind: 'success', title: 'Comodo password rotated', body: 'SSL worker credentials updated; pending validations restarted.' })
        }}
      />
    </Module>
  )
}

// ─────────────────────────────────────────────── Products → Licenses (Licenses · Migrations)

const migrationSpec: TableSpec<LicenseMigration> = {
  id: 'license_migrations',
  rowId: (m) => m.id,
  defaultSort: { key: 'startedAt', dir: 'desc' },
  search: (m) => `${m.id} ${m.batch} ${m.source} ${m.target} ${m.comment} ${m.ticket}`,
  columns: [
    { key: 'batch', header: 'Batch', width: 150, mono: true, render: (m) => <span className="font-medium">{m.batch}</span> },
    { key: 'source', header: 'Source', width: 110, render: (m) => <Badge>{m.source}</Badge> },
    { key: 'target', header: 'Target account', width: 160, mono: true },
    { key: 'status', header: 'Status', width: 150, render: (m) => <StatusBadge status={m.status === 'rolled_back' ? 'cancelled' : m.status} /> },
    { key: 'progress', header: 'Progress', width: 170, sortable: false, render: (m) => (
      <div className="flex items-center gap-2">
        <Progress value={(m.migrated / Math.max(1, m.keys)) * 100} tone={m.failed ? 'danger' : m.status === 'completed' ? 'success' : 'brand'} />
        <span className="w-24 text-right text-2xs tabular text-ink-500">{num(m.migrated)}/{num(m.keys)}</span>
      </div>
    ) },
    { key: 'failed', header: 'Failed', width: 90, align: 'right', render: (m) => (m.failed ? <span className="font-medium text-brand-700">{num(m.failed)}</span> : '0') },
    { key: 'chunkSize', header: 'Chunk', width: 90, align: 'right' },
    { key: 'startedBy', header: 'Started by', width: 140 },
    { key: 'approver', header: 'Approver', width: 140, render: (m) => m.approver ?? <Badge tone="warn">awaiting</Badge> },
    { key: 'ticket', header: 'Ticket', width: 110, mono: true },
    { key: 'startedAt', header: 'Started', width: 130, render: (m) => relative(m.startedAt) },
    { key: 'comment', header: 'Comment', optional: true },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['planned', 'awaiting_approval', 'running', 'completed', 'failed', 'rolled_back'].map((v) => ({ value: v, label: v.replace(/_/g, ' ') })) },
    { key: 'source', label: 'Source', type: 'select', options: ['Plesk', 'Virtuozzo', 'cPanel'].map((v) => ({ value: v, label: v })) },
    { key: 'target', label: 'Target account', type: 'text' },
    { key: 'failed', label: 'Failed keys', type: 'numberrange' },
  ],
}

export function LicensesModule() {
  const [tab, setTab] = useTab('licenses')
  const navigate = useNavigate()
  const migrations = licenseMigrations()

  const stats = useMemo(() => {
    let awaiting = 0
    let failedKeys = 0
    let migrated = 0
    for (let i = 0; i < migrations.total; i++) {
      const m = migrations.at(i)
      if (m._deleted) continue
      if (m.status === 'awaiting_approval') awaiting++
      failedKeys += m.failed
      migrated += m.migrated
    }
    return { awaiting, failedKeys, migrated }
  }, [migrations])

  return (
    <Module permissions={['product.license.read']} what="licenses">
      <PageHeader
        title="Licenses"
        subtitle="108,216 keys, and the migration batches that move them between vendor accounts. Both legacy migration pages became one wizard."
        actions={
          <Button variant="secondary" onClick={() => navigate('/system/bulk?op=license_migration')}>
            <RefreshCw className="h-3.5 w-3.5" /> Migration wizard
          </Button>
        }
      />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'licenses', label: 'Licenses' },
          { id: 'migrations', label: 'Migrations', count: migrations.total },
        ]}
      />
      {tab === 'licenses' ? (
        <LicensesTable />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <StatTile label="Migration batches" value={num(migrations.total)} />
            <StatTile label="Awaiting approval" value={num(stats.awaiting)} tone={stats.awaiting ? 'warn' : 'neutral'} hint="T3 — needs a second approver" />
            <StatTile label="Keys migrated" value={num(stats.migrated)} tone="success" />
            <StatTile label="Failed keys" value={num(stats.failedKeys)} tone={stats.failedKeys ? 'danger' : 'success'} />
          </div>
          <Callout tone="info" title="Migration is Tier 3">
            Re-issuing a key deactivates the old one at the vendor, and a server whose key is deactivated locks its hosting panel within 24
            hours. Every batch therefore runs through the bulk console: dry run, typed confirmation, second approver, per-key result report.
          </Callout>
          <DataTable
            spec={migrationSpec}
            data={migrations}
            permission="product.license.read"
            exportName="license migrations"
            rowActions={() => (
              <Tooltip content="Open the key mapping report for this batch">
                <Button size="sm" variant="ghost" onClick={() => navigate('/system/jobs')}>Report</Button>
              </Tooltip>
            )}
          />
        </>
      )}
    </Module>
  )
}

// ─────────────────────────────────────────────── Domains → Premium

export function PremiumDomainsPage() {
  return (
    <Module permissions={['domain.read']} what="premium domains">
      <PageHeader
        title="Premium Domains"
        subtitle="Domains the registry prices individually. They are the same records as All Domains, filtered — but they carry commercial risk the flat list hides, so they get their own entry."
        meta={<Badge tone="purple">registry-priced</Badge>}
      />
      <ScaleNote total={248930} />
      <PremiumDomainsTable />
      <p className="text-2xs text-ink-400">
        Same table, same saved views: this is <Link to="/domains?f=%7B%22premium%22%3Atrue%7D" className="text-brand-700 hover:underline">All Domains with the premium filter</Link>.
      </p>
    </Module>
  )
}
