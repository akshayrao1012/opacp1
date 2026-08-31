import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Copy, Info, Plus } from 'lucide-react'
import { DataTable } from '../components/patterns/DataTable'
import { Module, PageHeader, TabBar, useTab } from '../components/patterns/Page'
import { T2Confirm } from '../components/patterns/Destructive'
import {
  Badge, Button, Callout, Card, CardHeader, Checkbox, DefinitionList, Drawer, Field, Input,
  Progress, Select, StatTile, StatusBadge, Textarea, Tooltip,
} from '../components/ui'
import { useCan, useCurrentUser, useStore } from '../lib/store'
import { money, num, pct, relative, shortDate } from '../lib/format'
import type { TableSpec } from '../lib/table'
import { TLDS } from '../lib/rng'
import {
  domainProviders, extensions, promocodes, promotions,
  type DomainProvider, type Extension, type Promocode, type Promotion,
} from '../lib/mock/catalog'

// ─────────────────────────────────────────────────────── Extensions

const extensionSpec: TableSpec<Extension> = {
  id: 'extensions',
  rowId: (e) => e.id,
  href: (e) => `/products/extensions/${e.tld}`,
  defaultSort: { key: 'domains', dir: 'desc' },
  search: (e) => `${e.tld} ${e.registry} ${e.category}`,
  columns: [
    { key: 'tld', header: 'TLD', width: 130, render: (e) => <span className="font-medium">.{e.tld}</span> },
    { key: 'category', header: 'Category', width: 110, render: (e) => <Badge>{e.category}</Badge> },
    { key: 'registry', header: 'Registry', width: 160 },
    { key: 'active', header: 'Active', width: 90, render: (e) => (e.active ? <Badge tone="success">yes</Badge> : <Badge tone="danger">no</Badge>) },
    { key: 'createPrice', header: 'Create', width: 100, align: 'right', render: (e) => money(e.createPrice) },
    { key: 'renewPrice', header: 'Renew', width: 100, align: 'right', render: (e) => money(e.renewPrice) },
    { key: 'transferPrice', header: 'Transfer', width: 100, align: 'right', render: (e) => money(e.transferPrice) },
    { key: 'restorePrice', header: 'Restore', width: 100, align: 'right', optional: true, render: (e) => money(e.restorePrice) },
    { key: 'domains', header: 'Domains', width: 110, align: 'right', render: (e) => num(e.domains) },
    { key: 'maxYears', header: 'Max years', width: 100, align: 'right' },
    { key: 'registrantVerification', header: 'Verification', width: 120, render: (e) => (e.registrantVerification ? 'Required' : '—') },
    { key: 'dnssecSupport', header: 'DNSSEC', width: 90, optional: true, render: (e) => (e.dnssecSupport ? 'Yes' : 'No') },
    { key: 'idnSupport', header: 'IDN', width: 80, optional: true, render: (e) => (e.idnSupport ? 'Yes' : 'No') },
    { key: 'quarantineDays', header: 'Quarantine', width: 110, align: 'right', optional: true, render: (e) => `${e.quarantineDays} d` },
    { key: 'updatedBy', header: 'Updated by', width: 140, optional: true },
    { key: 'updatedAt', header: 'Updated', width: 130, optional: true, render: (e) => relative(e.updatedAt) },
  ],
  filters: [
    { key: 'category', label: 'Category', type: 'multiselect', options: ['gTLD', 'ccTLD', 'newGTLD', 'sTLD'].map((v) => ({ value: v, label: v })) },
    { key: 'active', label: 'Active', type: 'boolean' },
    { key: 'registrantVerification', label: 'Registrant verification', type: 'boolean' },
    { key: 'dnssecSupport', label: 'DNSSEC support', type: 'boolean' },
    { key: 'createPrice', label: 'Create price', type: 'numberrange' },
    { key: 'domains', label: 'Domains under management', type: 'numberrange' },
  ],
}

export function ExtensionsPage() {
  const ds = extensions()
  const [open, setOpen] = useState(false)
  const [cloneFrom, setCloneFrom] = useState('')

  return (
    <Module permissions={['catalog.extension.read']} what="extensions">
      <PageHeader
        title="Extensions"
        subtitle="TLD catalogue and pricing. “Create new” was a separate navigation entry; it is a drawer here, and it keeps clone-from-existing."
        meta={<Badge tone="neutral">{num(ds.total)} extensions</Badge>}
      />
      <DataTable
        spec={extensionSpec}
        data={ds}
        permission="catalog.extension.read"
        exportName="extensions"
        create={{ label: 'New extension', permission: 'catalog.extension.write', onClick: () => setOpen(true) }}
      />
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New extension"
        subtitle="T2 — pricing changes affect every reseller"
        width="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>Create extension</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Clone pricing from an existing extension" hint="Copies every price and policy field, which you then adjust.">
            <Select value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)}>
              <option value="">Start from scratch</option>
              {TLDS.map((t) => <option key={t} value={t}>.{t}</option>)}
            </Select>
          </Field>
          {cloneFrom && (
            <Callout tone="info" title={`Cloned from .${cloneFrom}`}>
              Prices, transfer lock, quarantine period and verification requirements were copied. Review each field before saving.
            </Callout>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="TLD" required><Input placeholder="hosting" /></Field>
            <Field label="Registry" required><Input placeholder="CentralNic" /></Field>
            <Field label="Create price (EUR)" required><Input type="number" step="0.01" /></Field>
            <Field label="Renew price (EUR)" required><Input type="number" step="0.01" /></Field>
            <Field label="Transfer price (EUR)" required><Input type="number" step="0.01" /></Field>
            <Field label="Restore price (EUR)"><Input type="number" step="0.01" /></Field>
            <Field label="Max registration years"><Select>{[1, 2, 5, 10].map((y) => <option key={y}>{y}</option>)}</Select></Field>
            <Field label="Quarantine days"><Input type="number" defaultValue={30} /></Field>
          </div>
          <div className="space-y-2">
            <Checkbox label="DNSSEC supported" defaultChecked />
            <Checkbox label="IDN supported" />
            <Checkbox label="Registrant verification required" />
            <Checkbox label="Premium domains supported" />
          </div>
        </div>
      </Drawer>
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Promotions

const promotionSpec: TableSpec<Promotion> = {
  id: 'promotions',
  rowId: (p) => p.id,
  defaultSort: { key: 'startsAt', dir: 'desc' },
  search: (p) => `${p.id} ${p.name} ${p.tld} ${p.segment}`,
  columns: [
    { key: 'name', header: 'Promotion', render: (p) => <span className="font-medium">{p.name}</span> },
    { key: 'tld', header: 'TLD', width: 90, render: (p) => `.${p.tld}` },
    { key: 'action', header: 'Action', width: 100, render: (p) => <Badge>{p.action}</Badge> },
    { key: 'status', header: 'Status', width: 110, render: (p) => <StatusBadge status={p.status} /> },
    { key: 'discountValue', header: 'Discount', width: 110, align: 'right', render: (p) => (p.discountType === 'percentage' ? pct(p.discountValue, 0) : money(p.discountValue)) },
    { key: 'years', header: 'Years', width: 80, align: 'right', render: (p) => p.years ?? '—' },
    { key: 'startsAt', header: 'Starts', width: 110, render: (p) => shortDate(p.startsAt) },
    { key: 'endsAt', header: 'Ends', width: 110, render: (p) => shortDate(p.endsAt) },
    { key: 'segment', header: 'Segment', width: 170 },
    { key: 'used', header: 'Used', width: 100, align: 'right', render: (p) => num(p.used) },
    { key: 'budgetCap', header: 'Budget cap', width: 130, align: 'right', render: (p) => (p.budgetCap ? money(p.budgetCap) : 'uncapped') },
    { key: 'createdBy', header: 'Created by', width: 140, optional: true },
    { key: 'approvedBy', header: 'Approved by', width: 140, optional: true, render: (p) => p.approvedBy ?? '—' },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['draft', 'scheduled', 'live', 'ended'].map((v) => ({ value: v, label: v })) },
    { key: 'action', label: 'Action', type: 'multiselect', options: ['create', 'renew', 'transfer'].map((v) => ({ value: v, label: v })) },
    { key: 'tld', label: 'TLD', type: 'multiselect', options: TLDS.map((t) => ({ value: t, label: `.${t}` })) },
    { key: 'startsAt', label: 'Starts', type: 'daterange' },
    { key: 'discountValue', label: 'Discount value', type: 'numberrange' },
  ],
}

export function PromotionsPage() {
  const ds = promotions()
  const [tab, setTab] = useTab('standard')
  const [open, setOpen] = useState(false)

  const counts = useMemo(() => {
    let standard = 0
    let multiyear = 0
    for (let i = 0; i < ds.total; i++) {
      const p = ds.at(i)
      if (p._deleted) continue
      p.kind === 'multiyear' ? multiyear++ : standard++
    }
    return { standard, multiyear }
  }, [ds])

  const spec: TableSpec<Promotion> = {
    ...promotionSpec,
    id: `promotions_${tab}`,
    defaultFilters: { kind: tab },
    filters: [
      ...(promotionSpec.filters ?? []),
      { key: 'kind', label: 'Kind', type: 'select', options: [{ value: 'standard', label: 'Standard' }, { value: 'multiyear', label: 'Multiyear' }] },
    ],
  }

  return (
    <Module permissions={['catalog.promotion.read']} what="promotions">
      <PageHeader
        title="Promotions"
        subtitle="The second tab was labelled “Multilayer” and meant multiyear, with a personal username hardcoded as a field prefill. Both are fixed."
      />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'standard', label: 'Standard', count: counts.standard },
          { id: 'multiyear', label: 'Multiyear', count: counts.multiyear },
        ]}
      />
      {tab === 'multiyear' && (
        <Callout tone="success" title="Renamed from “Multilayer”">
          The old page prefilled the ID field with one engineer&apos;s username. The field now defaults to empty, validates against real
          reseller and promotion IDs, and shows a preview of what the promotion would apply to before you save.
        </Callout>
      )}
      <DataTable
        key={tab}
        spec={spec}
        data={ds}
        permission="catalog.promotion.read"
        exportName="promotions"
        create={{ label: 'New promotion', permission: 'catalog.promotion.write', onClick: () => setOpen(true) }}
      />
      <PromotionDrawer open={open} kind={tab as 'standard' | 'multiyear'} onClose={() => setOpen(false)} />
    </Module>
  )
}

function PromotionDrawer({ open, kind, onClose }: { open: boolean; kind: 'standard' | 'multiyear'; onClose: () => void }) {
  const user = useCurrentUser()
  const [targetId, setTargetId] = useState('')
  const [tld, setTld] = useState('com')
  const [discount, setDiscount] = useState('20')
  const [years, setYears] = useState('3')
  const [confirm, setConfirm] = useState(false)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)
  const valid = /^\d{6}$/.test(targetId) || targetId === ''

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width="md"
        title={kind === 'multiyear' ? 'New multiyear promotion' : 'New promotion'}
        subtitle="T2 — pricing change, requires reason and ticket"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!valid} onClick={() => setConfirm(true)}>Review and save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="TLD" required>
              <Select value={tld} onChange={(e) => setTld(e.target.value)}>
                {TLDS.map((t) => <option key={t} value={t}>.{t}</option>)}
              </Select>
            </Field>
            <Field label="Action" required>
              <Select><option>create</option><option>renew</option><option>transfer</option></Select>
            </Field>
            <Field label="Discount (%)" required>
              <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </Field>
            {kind === 'multiyear' && (
              <Field label="Registration years" required hint="Multiyear promotions only apply at this exact period.">
                <Select value={years} onChange={(e) => setYears(e.target.value)}>
                  {[2, 3, 5, 10].map((y) => <option key={y} value={y}>{y} years</option>)}
                </Select>
              </Field>
            )}
            <Field
              label="Reseller or promotion ID"
              hint={`Empty means all resellers. Signed in as ${user.email.split('@')[0]} — nothing is prefilled from your account.`}
              error={valid ? null : 'Must be a six-digit ID.'}
            >
              <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="100341" invalid={!valid} />
            </Field>
            <Field label="Budget cap (EUR)" hint="Optional. The promotion stops when the cap is reached.">
              <Input type="number" placeholder="uncapped" />
            </Field>
            <Field label="Starts" required><Input type="date" defaultValue="2026-09-01" /></Field>
            <Field label="Ends" required><Input type="date" defaultValue="2026-12-31" /></Field>
          </div>

          <Card>
            <CardHeader title="Validation preview" subtitle="What this promotion would apply to today" icon={<Info className="h-4 w-4" />} />
            <div className="space-y-2 p-4">
              <DefinitionList
                items={[
                  { label: 'Matching resellers', value: targetId ? '1' : '4,182' },
                  { label: 'Eligible registrations / month', value: num(kind === 'multiyear' ? 340 : 12480) },
                  { label: 'Estimated discount cost', value: money(kind === 'multiyear' ? 4200 : 68400) },
                  { label: 'Overlapping promotions', value: '1 — .com launch 2026' },
                ]}
              />
              <Callout tone="warn" title="Overlap detected">
                A live promotion already covers .{tld} create. The larger discount wins at checkout, so this one may never apply.
              </Callout>
            </div>
          </Card>
        </div>
      </Drawer>
      <T2Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Save promotion"
        permission="catalog.promotion.write"
        cta="Save promotion"
        description={<>Creates a {discount}% {kind === 'multiyear' ? `${years}-year ` : ''}discount on .{tld}. Pricing changes are recorded with your reason and ticket.</>}
        onConfirm={({ reason, ticket }) => {
          logAudit({ action: 'catalog.promotion.write', resource: 'promotion', resourceId: `new .${tld}`, after: { discount, tld, years: kind === 'multiyear' ? years : null }, reason, ticket })
          addToast({ kind: 'success', title: 'Promotion saved', body: 'Scheduled — it goes live on the start date.' })
          setConfirm(false)
          onClose()
        }}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────── Promocodes

const promocodeSpec: TableSpec<Promocode> = {
  id: 'promocodes',
  rowId: (p) => p.id,
  defaultSort: { key: 'createdAt', dir: 'desc' },
  search: (p) => `${p.code} ${p.description} ${p.campaign} ${p.appliesTo}`,
  columns: [
    { key: 'code', header: 'Code', width: 160, mono: true, render: (p) => <span className="font-medium">{p.code}</span> },
    { key: 'type', header: 'Type', width: 130, render: (p) => <Badge tone={p.type === 'FastCheckout' ? 'purple' : 'neutral'}>{p.type}</Badge> },
    { key: 'description', header: 'Description', width: 200 },
    { key: 'status', header: 'Status', width: 110, render: (p) => <StatusBadge status={p.status} /> },
    { key: 'discountValue', header: 'Discount', width: 110, align: 'right', render: (p) => (p.discountType === 'percentage' ? pct(p.discountValue, 0) : money(p.discountValue)) },
    { key: 'appliesTo', header: 'Applies to', width: 150 },
    { key: 'redemptions', header: 'Redemptions', width: 150, render: (p) => (
      <div className="flex items-center gap-2">
        <Progress value={p.maxRedemptions ? (p.redemptions / p.maxRedemptions) * 100 : 0} />
        <span className="w-24 text-right text-2xs tabular text-ink-500">
          {num(p.redemptions)}{p.maxRedemptions ? ` / ${num(p.maxRedemptions)}` : ''}
        </span>
      </div>
    ) },
    { key: 'validUntil', header: 'Valid until', width: 110, render: (p) => shortDate(p.validUntil) },
    { key: 'campaign', header: 'Campaign', width: 150, optional: true },
    { key: 'perResellerLimit', header: 'Per reseller', width: 110, align: 'right', optional: true, render: (p) => p.perResellerLimit ?? '∞' },
    { key: 'createdBy', header: 'Created by', width: 140, optional: true },
  ],
  filters: [
    { key: 'type', label: 'Type', type: 'select', options: [{ value: 'Standard', label: 'Standard' }, { value: 'FastCheckout', label: 'FastCheckout' }] },
    { key: 'status', label: 'Status', type: 'multiselect', options: ['active', 'expired', 'exhausted', 'disabled'].map((v) => ({ value: v, label: v })) },
    { key: 'campaign', label: 'Campaign', type: 'select', options: ['Q1 growth', 'Q2 winback', 'Always-on', 'Partner: Plesk', 'Event: WHD'].map((v) => ({ value: v, label: v })) },
    { key: 'validUntil', label: 'Valid until', type: 'daterange' },
    { key: 'redemptions', label: 'Redemptions', type: 'numberrange' },
  ],
}

export function PromocodesPage({ hideHeader, forceType }: { hideHeader?: boolean; forceType?: 'Standard' | 'FastCheckout' } = {}) {
  const ds = promocodes()
  const [tab, setTab] = useTab('all')
  const [open, setOpen] = useState(false)
  const canWrite = useCan('catalog.promocode.write')
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)

  const counts = useMemo(() => {
    let standard = 0
    let fast = 0
    let active = 0
    for (let i = 0; i < ds.total; i++) {
      const p = ds.at(i)
      if (p._deleted) continue
      p.type === 'FastCheckout' ? fast++ : standard++
      if (p.status === 'active') active++
    }
    return { standard, fast, active }
  }, [ds])

  const activeType = forceType ?? (tab === 'fast' ? 'FastCheckout' : tab === 'standard' ? 'Standard' : undefined)
  const spec: TableSpec<Promocode> = {
    ...promocodeSpec,
    id: `promocodes_${forceType ?? tab}`,
    defaultFilters: activeType ? { type: activeType } : {},
  }

  return (
    <Module permissions={['catalog.promocode.read']} what="promocodes">
      {!hideHeader && (
        <PageHeader
          title="Promocodes"
          subtitle="Promocode Manager and Fast Checkout Promocodes were two pages with two conventions — one of them put “create” in a table header link. One module, one create flow, a type field."
        />
      )}
      {!forceType && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Active codes" value={num(counts.active)} tone="success" />
          <StatTile label="Standard" value={num(counts.standard)} />
          <StatTile label="FastCheckout" value={num(counts.fast)} />
        </div>
      )}
      {!forceType && (
        <TabBar
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'all', label: 'All codes', count: ds.total },
            { id: 'standard', label: 'Standard', count: counts.standard },
            { id: 'fast', label: 'FastCheckout', count: counts.fast },
          ]}
        />
      )}
      <DataTable
        key={tab}
        spec={spec}
        data={ds}
        permission="catalog.promocode.read"
        exportName="promocodes"
        create={{ label: 'New promocode', permission: 'catalog.promocode.write', onClick: () => setOpen(true) }}
        rowActions={(row) => (
          <Tooltip content="Duplicate as a new code">
            <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => {
              logAudit({ action: 'catalog.promocode.write', resource: 'promocode', resourceId: row.id, after: { duplicatedFrom: row.code } })
              addToast({ kind: 'success', title: `Duplicated ${row.code}`, body: 'Opened as a draft — adjust the code and validity before enabling.' })
            }}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        )}
      />
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New promocode"
        subtitle="T1 — audited, no approval required"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                logAudit({ action: 'catalog.promocode.write', resource: 'promocode', resourceId: 'new', after: { created: true } })
                addToast({ kind: 'success', title: 'Promocode created' })
                setOpen(false)
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Create code
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code" required hint="Uppercase, no spaces."><Input placeholder="OPWELCOME26" /></Field>
          <Field label="Type" required><Select><option>Standard</option><option>FastCheckout</option></Select></Field>
          <Field label="Discount type"><Select><option>percentage</option><option>fixed</option></Select></Field>
          <Field label="Value" required><Input type="number" step="0.01" /></Field>
          <Field label="Applies to"><Select><option>All TLDs</option><option>.com</option><option>SSL products</option><option>Memberships</option></Select></Field>
          <Field label="Campaign"><Input placeholder="Q3 growth" /></Field>
          <Field label="Valid from" required><Input type="date" /></Field>
          <Field label="Valid until" required><Input type="date" /></Field>
          <Field label="Max redemptions" hint="Empty = unlimited."><Input type="number" /></Field>
          <Field label="Per-reseller limit"><Input type="number" placeholder="1" /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} className="font-sans text-sm" /></Field>
        </div>
      </Drawer>
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Domain providers

const providerSpec: TableSpec<DomainProvider> = {
  id: 'domain_providers',
  rowId: (p) => p.id,
  defaultSort: { key: 'domains', dir: 'desc' },
  search: (p) => `${p.name} ${p.endpoint} ${p.type}`,
  columns: [
    { key: 'name', header: 'Provider', render: (p) => <span className="font-medium">{p.name}</span> },
    { key: 'type', header: 'Type', width: 150, render: (p) => <Badge>{p.type.replace('_', ' ')}</Badge> },
    { key: 'status', header: 'Status', width: 120, render: (p) => <StatusBadge status={p.status} /> },
    { key: 'protocol', header: 'Protocol', width: 100 },
    { key: 'tlds', header: 'TLDs', width: 80, align: 'right' },
    { key: 'domains', header: 'Domains', width: 110, align: 'right', render: (p) => num(p.domains) },
    { key: 'successRate24h', header: 'Success 24h', width: 120, align: 'right', render: (p) => (
      <span className={p.successRate24h < 95 ? 'font-medium text-brand-700' : undefined}>{pct(p.successRate24h, 2)}</span>
    ) },
    { key: 'slaResponseMs', header: 'p95 latency', width: 110, align: 'right', render: (p) => `${num(p.slaResponseMs)} ms` },
    { key: 'credentialsExpireAt', header: 'Credentials expire', width: 150, render: (p) => (
      <span className={p.credentialsExpireAt < '2026-10-26' ? 'font-medium text-amber-700' : undefined}>{shortDate(p.credentialsExpireAt)}</span>
    ) },
    { key: 'ipWhitelisted', header: 'IP allowlist', width: 110, optional: true, render: (p) => (p.ipWhitelisted ? 'Yes' : 'No') },
    { key: 'endpoint', header: 'Endpoint', width: 240, mono: true, optional: true },
    { key: 'lastIncidentAt', header: 'Last incident', width: 130, optional: true, render: (p) => relative(p.lastIncidentAt) },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['operational', 'degraded', 'maintenance', 'down'].map((v) => ({ value: v, label: v })) },
    { key: 'type', label: 'Type', type: 'select', options: ['registry', 'registrar_partner', 'reseller_channel'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'protocol', label: 'Protocol', type: 'select', options: ['EPP', 'REST', 'legacy'].map((v) => ({ value: v, label: v })) },
    { key: 'successRate24h', label: 'Success rate %', type: 'numberrange' },
    { key: 'credentialsExpireAt', label: 'Credentials expire', type: 'daterange' },
  ],
}

export function DomainProvidersPage({ hideHeader }: { hideHeader?: boolean } = {}) {
  const ds = domainProviders()
  const degraded = useMemo(() => {
    let n = 0
    for (let i = 0; i < ds.total; i++) {
      const p = ds.at(i)
      if (p.status === 'degraded' || p.status === 'down') n++
    }
    return n
  }, [ds])

  return (
    <Module permissions={['catalog.provider.read']} what="domain providers">
      {!hideHeader && (
        <PageHeader
          title="Domain providers"
          subtitle="Registry reference list with live health. Per-reseller credentials live under Resellers → Provider mappings, where they belong."
        />
      )}
      {degraded > 0 && (
        <Callout tone="warn" icon={<AlertTriangle className="h-4 w-4" />} title={`${degraded} providers degraded or down`}>
          Registrations and transfers for their TLDs will queue in Task manager rather than fail outright.
        </Callout>
      )}
      <DataTable spec={providerSpec} data={ds} permission="catalog.provider.read" exportName="domain providers" />
      <p className="text-2xs text-ink-400">
        Reseller-specific mappings and their (write-only) credentials:{' '}
        <Link to="/customers/resellers/provider-mappings" className="text-brand-700 hover:underline">Resellers → Provider mappings</Link>
      </p>
    </Module>
  )
}

