import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, ShieldOff, Sparkles, Wand2 } from 'lucide-react'
import { DataTable } from '../components/patterns/DataTable'
import { Module, PageHeader } from '../components/patterns/Page'
import { T2Confirm } from '../components/patterns/Destructive'
import {
  Badge, Button, Callout, Card, CardHeader, Checkbox, Drawer, Field, Input, Progress, Select,
  StatTile, StatusBadge,
} from '../components/ui'
import { useCan, useStore } from '../lib/store'
import { csvDownload, money, num, pct, relative, shortDate } from '../lib/format'
import type { TableSpec } from '../lib/table'
import { promocodeBatches, wppSubscriptions, type PromocodeBatch, type WppSubscription } from '../lib/mock/billing'

// ─────────────────────────────────────────────────────── Subscriptions (Reseller WPP)

const wppSpec: TableSpec<WppSubscription> = {
  id: 'wpp_subscriptions',
  rowId: (w) => w.id,
  defaultSort: { key: 'monthlyValue', dir: 'desc' },
  search: (w) => `${w.resellerId} ${w.company}`,
  columns: [
    { key: 'company', header: 'Reseller', render: (w) => <Link to={`/customers/resellers/${w.resellerId}`} className="font-medium hover:text-brand-700 hover:underline">{w.company}</Link> },
    { key: 'resellerId', header: 'ID', width: 90, mono: true, value: (w) => w.resellerId },
    { key: 'status', header: 'Status', width: 110, render: (w) => <StatusBadge status={w.status} /> },
    { key: 'domainsCovered', header: 'Covered', width: 110, align: 'right', render: (w) => num(w.domainsCovered) },
    { key: 'domainsEligible', header: 'Eligible', width: 110, align: 'right', render: (w) => num(w.domainsEligible) },
    { key: 'attach', header: 'Attach rate', width: 150, sortable: false, value: (w) => w.domainsCovered / Math.max(1, w.domainsEligible), render: (w) => {
      const rate = (w.domainsCovered / Math.max(1, w.domainsEligible)) * 100
      return (
        <div className="flex items-center gap-2">
          <Progress value={rate} tone={rate > 50 ? 'success' : 'brand'} />
          <span className="w-10 text-right text-2xs tabular text-ink-600">{pct(rate, 0)}</span>
        </div>
      )
    } },
    { key: 'pricePerDomain', header: 'Price / domain', width: 130, align: 'right', render: (w) => money(w.pricePerDomain, w.currency) },
    { key: 'monthlyValue', header: 'Monthly value', width: 130, align: 'right', render: (w) => money(w.monthlyValue, w.currency) },
    { key: 'billingCycle', header: 'Cycle', width: 100 },
    { key: 'includedInPlan', header: 'In plan', width: 100, render: (w) => (w.includedInPlan ? <Badge tone="purple">included</Badge> : '—') },
    { key: 'registryPrivacyUsed', header: 'Registry privacy', width: 140, align: 'right', render: (w) => num(w.registryPrivacyUsed) },
    { key: 'optOutRequests', header: 'Opt-outs', width: 100, align: 'right', render: (w) => (w.optOutRequests ? <span className="text-amber-700">{num(w.optOutRequests)}</span> : '0') },
    { key: 'renewsAt', header: 'Renews', width: 110, render: (w) => shortDate(w.renewsAt) },
    { key: 'autoRenew', header: 'Auto-renew', width: 110, optional: true, render: (w) => (w.autoRenew ? 'Yes' : 'No') },
    { key: 'cancelledReason', header: 'Cancelled reason', optional: true, render: (w) => w.cancelledReason ?? '—' },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['active', 'trial', 'suspended', 'cancelled'].map((v) => ({ value: v, label: v })) },
    { key: 'billingCycle', label: 'Cycle', type: 'select', options: [{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }] },
    { key: 'includedInPlan', label: 'Included in plan', type: 'boolean' },
    { key: 'monthlyValue', label: 'Monthly value', type: 'numberrange' },
    { key: 'optOutRequests', label: 'Opt-out requests', type: 'numberrange' },
    { key: 'autoRenew', label: 'Auto-renew', type: 'boolean' },
  ],
}

export function WppSubscriptionsPage() {
  const ds = wppSubscriptions()
  const totals = useMemo(() => {
    let mrr = 0
    let covered = 0
    let eligible = 0
    let optOuts = 0
    for (let i = 0; i < ds.total; i++) {
      const w = ds.at(i)
      if (w._deleted) continue
      if (w.status === 'active' || w.status === 'trial') mrr += w.monthlyValue
      covered += w.domainsCovered
      eligible += w.domainsEligible
      optOuts += w.optOutRequests
    }
    return { mrr, covered, eligible, optOuts }
  }, [ds])

  return (
    <Module permissions={['reseller.membership.read']} what="WPP subscriptions">
      <PageHeader
        title="Subscriptions"
        subtitle="Reseller WPP — whois privacy sold per domain. Attach rate is the number that matters: eligible domains where privacy is actually switched on."
        meta={<Badge tone="neutral">Reseller WPP</Badge>}
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="WPP revenue / month" value={money(totals.mrr)} tone="success" />
        <StatTile label="Domains covered" value={num(totals.covered)} hint={`of ${num(totals.eligible)} eligible`} />
        <StatTile label="Attach rate" value={pct((totals.covered / Math.max(1, totals.eligible)) * 100, 1)} />
        <StatTile label="Opt-out requests" value={num(totals.optOuts)} tone={totals.optOuts ? 'warn' : 'neutral'} hint="registrants asking to be published" />
      </div>
      <Callout tone="info" icon={<ShieldOff className="h-4 w-4" />} title="Where registry privacy overlaps">
        Some registries redact whois themselves, which makes a paid WPP subscription redundant for those domains. The registry-privacy
        column counts them, and it is the first thing to check when a reseller disputes a WPP invoice.
      </Callout>
      <DataTable spec={wppSpec} data={ds} permission="reseller.membership.read" exportName="WPP subscriptions" />
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Promocode batches (Generate)

const batchSpec: TableSpec<PromocodeBatch> = {
  id: 'promocode_batches',
  rowId: (b) => b.id,
  defaultSort: { key: 'createdAt', dir: 'desc' },
  search: (b) => `${b.prefix} ${b.campaign} ${b.discount}`,
  columns: [
    { key: 'prefix', header: 'Prefix', width: 130, mono: true, render: (b) => <span className="font-medium">{b.prefix}</span> },
    { key: 'type', header: 'Type', width: 130, render: (b) => <Badge tone={b.type === 'FastCheckout' ? 'purple' : 'neutral'}>{b.type}</Badge> },
    { key: 'codes', header: 'Codes', width: 100, align: 'right', render: (b) => num(b.codes) },
    { key: 'redeemed', header: 'Redeemed', width: 150, sortable: false, render: (b) => (
      <div className="flex items-center gap-2">
        <Progress value={(b.redeemed / Math.max(1, b.codes)) * 100} />
        <span className="w-16 text-right text-2xs tabular text-ink-500">{num(b.redeemed)}</span>
      </div>
    ) },
    { key: 'discount', header: 'Discount', width: 130 },
    { key: 'campaign', header: 'Campaign', width: 190 },
    { key: 'singleUse', header: 'Single use', width: 110, render: (b) => (b.singleUse ? 'Yes' : 'No') },
    { key: 'validUntil', header: 'Valid until', width: 120, render: (b) => shortDate(b.validUntil) },
    { key: 'createdBy', header: 'Created by', width: 150 },
    { key: 'createdAt', header: 'Created', width: 120, render: (b) => shortDate(b.createdAt) },
    { key: 'exportedAt', header: 'Exported', width: 130, render: (b) => (b.exportedAt ? relative(b.exportedAt) : <Badge tone="warn">never</Badge>) },
  ],
  filters: [
    { key: 'type', label: 'Type', type: 'select', options: [{ value: 'Standard', label: 'Standard' }, { value: 'FastCheckout', label: 'FastCheckout' }] },
    { key: 'campaign', label: 'Campaign', type: 'text' },
    { key: 'singleUse', label: 'Single use', type: 'boolean' },
    { key: 'codes', label: 'Codes', type: 'numberrange' },
  ],
}

export function PromocodeGenerator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ prefix: '', count: '100', type: 'Standard', discount: '10', kind: 'percentage', singleUse: true, validUntil: '', campaign: '' })
  const [confirm, setConfirm] = useState(false)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)
  const createJob = useStore((s) => s.createJob)
  const count = Math.min(20000, Number(form.count) || 0)
  const ready = /^[A-Z0-9]{3,12}$/.test(form.prefix) && count > 0 && Boolean(form.validUntil)

  const sample = useMemo(
    () => Array.from({ length: 4 }, (_, i) => `${form.prefix || 'PREFIX'}-${(1000 + i * 137).toString(36).toUpperCase()}${(i * 991).toString(36).toUpperCase()}`),
    [form.prefix],
  )

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width="md"
        title="Generate promocodes"
        subtitle="Creates a batch of unique codes and hands you the CSV"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!ready} onClick={() => setConfirm(true)}>
              <Wand2 className="h-3.5 w-3.5" /> Generate {num(count)} codes
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Prefix" required hint="3–12 characters, uppercase. Appears at the start of every code.">
            <Input value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase() })} placeholder="WHD26" />
          </Field>
          <Field label="Number of codes" required hint="Up to 20,000 per batch.">
            <Input type="number" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type" required>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option>Standard</option>
                <option>FastCheckout</option>
              </Select>
            </Field>
            <Field label="Discount kind">
              <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="percentage">percentage</option>
                <option value="fixed">fixed amount</option>
              </Select>
            </Field>
            <Field label={form.kind === 'percentage' ? 'Discount %' : 'Discount amount (EUR)'} required>
              <Input type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
            </Field>
            <Field label="Valid until" required>
              <Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
            </Field>
          </div>
          <Field label="Campaign" hint="Used to report redemption per campaign.">
            <Input value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} placeholder="WHD 2026 booth" />
          </Field>
          <Checkbox
            label="Single use per code"
            hint="Off means one code can be redeemed repeatedly — only for controlled audiences."
            checked={form.singleUse}
            onChange={(e) => setForm({ ...form, singleUse: e.target.checked })}
          />
          <Card>
            <CardHeader title="Preview" subtitle="First four codes of the batch" icon={<Sparkles className="h-4 w-4" />} />
            <ul className="space-y-1 p-4 font-mono text-xs text-ink-700">
              {sample.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </Card>
          {!form.singleUse && count > 500 && (
            <Callout tone="warn" title="Multi-use codes at volume">
              {num(count)} codes that each work repeatedly is a large discount surface. Consider single use, or a smaller batch.
            </Callout>
          )}
        </div>
      </Drawer>

      <T2Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Generate ${num(count)} promocodes`}
        permission="catalog.promocode.write"
        cta="Generate batch"
        description={
          <>
            {num(count)} {form.type} codes with prefix <code className="font-mono">{form.prefix}</code>, {form.discount}
            {form.kind === 'percentage' ? '%' : ' EUR'} off, valid until {form.validUntil}. The CSV downloads once and is not stored — treat
            it as the only copy.
          </>
        }
        onConfirm={({ reason, ticket }) => {
          const job = createJob({
            kind: 'promocode_generate',
            label: `Generate ${num(count)} promocodes (${form.prefix})`,
            status: 'running',
            owner: '',
            total: count,
            dryRun: false,
            cancellable: false,
            resultCsv: null,
            reason,
            ticket,
            approver: null,
            tier: 'T1',
          })
          logAudit({ action: 'catalog.promocode.write', resource: 'promocode_batch', resourceId: job.id, after: { prefix: form.prefix, count, type: form.type }, reason, ticket })
          const csv = ['code,type,discount,valid_until,campaign',
            ...Array.from({ length: Math.min(count, 5000) }, (_, i) =>
              `${form.prefix}-${(i * 7919 + 100000).toString(36).toUpperCase()},${form.type},${form.discount}${form.kind === 'percentage' ? '%' : ' EUR'},${form.validUntil},${form.campaign}`)].join('\n')
          csvDownload(`promocodes-${form.prefix.toLowerCase()}.csv`, csv)
          addToast({ kind: 'success', title: `${num(count)} codes generated`, body: 'CSV downloaded. The batch is listed under Promocodes → Batches.', href: '/system/jobs', hrefLabel: 'Job centre' })
          setConfirm(false)
          onClose()
        }}
      />
    </>
  )
}

export function PromocodeBatchesTable() {
  const ds = promocodeBatches()
  const canWrite = useCan('catalog.promocode.write')
  const addToast = useStore((s) => s.addToast)
  return (
    <>
      <Callout tone="info" title="Batches are generated once">
        Codes are handed over as a CSV at generation time and never shown again in full — a batch that was never exported (flagged in the
        last column) is a batch nobody can use.
      </Callout>
      <DataTable
        spec={batchSpec}
        data={ds}
        permission="catalog.promocode.read"
        exportName="promocode batches"
        rowActions={(row) => (
          <Button
            size="sm"
            variant="ghost"
            disabled={!canWrite}
            onClick={() => addToast({ kind: 'info', title: `Re-export ${row.prefix}`, body: 'Re-exporting a batch is audited; unredeemed codes only.' })}
          >
            <Download className="h-3.5 w-3.5" /> Re-export
          </Button>
        )}
      />
    </>
  )
}
