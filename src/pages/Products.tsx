import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DataTable, ScaleNote } from '../components/patterns/DataTable'
import { Module, PageHeader, TabBar, useTab } from '../components/patterns/Page'
import { DangerZone } from '../components/patterns/Destructive'
import {
  Badge, Button, Callout, Card, CardHeader, DefinitionList, Drawer, Field, Input,
  Select, StatTile, StatusBadge, Switch, Textarea,
} from '../components/ui'
import { money, num, pct, relative, shortDate } from '../lib/format'
import type { TableSpec } from '../lib/table'
import {
  dnsRecords, dnsZones, licenses, spamBundles, spamConfigs, spamDomains,
  sslOrders, trademarks, virtualProducts,
  type DnsZone, type License, type SpamBundle, type SpamConfig, type SpamDomain, type SslOrder,
  type Trademark, type VirtualProduct,
} from '../lib/mock/products'

// ─────────────────────────────────────────────────────── SSL

const sslSpec: TableSpec<SslOrder> = {
  id: 'ssl_orders',
  rowId: (s) => s.id,
  defaultSort: { key: 'orderedAt', dir: 'desc' },
  search: (s) => `${s.id} ${s.commonName} ${s.product} ${s.company}`,
  columns: [
    { key: 'commonName', header: 'Common name', render: (s) => <span className="font-medium">{s.commonName}</span> },
    { key: 'id', header: 'Order', width: 110, mono: true },
    { key: 'product', header: 'Product', width: 220 },
    { key: 'validation', header: 'Validation', width: 100, render: (s) => <Badge tone={s.validation === 'EV' ? 'purple' : s.validation === 'OV' ? 'info' : 'neutral'}>{s.validation}</Badge> },
    { key: 'status', header: 'Status', width: 150, render: (s) => <StatusBadge status={s.status} /> },
    { key: 'company', header: 'Reseller', width: 190, render: (s) => <Link to={`/customers/resellers/${s.resellerId}`} className="hover:text-brand-700 hover:underline">{s.company}</Link> },
    { key: 'expiresAt', header: 'Expires', width: 110, render: (s) => shortDate(s.expiresAt) },
    { key: 'price', header: 'Price', width: 100, align: 'right', render: (s) => money(s.price) },
    { key: 'sans', header: 'SANs', width: 80, align: 'right' },
    { key: 'autoRenew', header: 'Auto-renew', width: 100, optional: true, render: (s) => (s.autoRenew ? 'Yes' : 'No') },
    { key: 'brand', header: 'Brand', width: 130, optional: true },
    { key: 'orderedAt', header: 'Ordered', width: 110, optional: true, render: (s) => shortDate(s.orderedAt) },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['active', 'issued', 'pending_validation', 'expired', 'cancelled', 'failed'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'brand', label: 'Brand', type: 'select', options: ['Sectigo', 'Comodo', "Let's Encrypt", 'DigiCert', 'GeoTrust'].map((v) => ({ value: v, label: v })) },
    { key: 'validation', label: 'Validation', type: 'multiselect', options: ['DV', 'OV', 'EV'].map((v) => ({ value: v, label: v })) },
    { key: 'expiresAt', label: 'Expires', type: 'daterange' },
    { key: 'autoRenew', label: 'Auto-renew', type: 'boolean' },
  ],
}

export function SslTable() {
  const ds = sslOrders()
  return <DataTable spec={sslSpec} data={ds} permission="product.ssl.read" exportName="SSL orders" />
}

// ─────────────────────────────────────────────────────── SpamExperts

const spamDomainSpec: TableSpec<SpamDomain> = {
  id: 'spam_domains',
  rowId: (r) => r.id,
  defaultSort: { key: 'inboundToday', dir: 'desc' },
  search: (r) => `${r.domain} ${r.company} ${r.bundle} ${r.destination}`,
  columns: [
    { key: 'domain', header: 'Domain', render: (r) => <span className="font-medium">{r.domain}</span> },
    { key: 'status', header: 'Status', width: 110, render: (r) => <StatusBadge status={r.status} /> },
    { key: 'company', header: 'Reseller', width: 190, render: (r) => <Link to={`/customers/resellers/${r.resellerId}`} className="hover:text-brand-700 hover:underline">{r.company}</Link> },
    { key: 'bundle', header: 'Bundle', width: 200 },
    { key: 'mailboxes', header: 'Mailboxes', width: 100, align: 'right', render: (r) => num(r.mailboxes) },
    { key: 'inboundToday', header: 'Inbound today', width: 120, align: 'right', render: (r) => num(r.inboundToday) },
    { key: 'spamRatio', header: 'Spam ratio', width: 110, align: 'right', render: (r) => (
      <span className={r.spamRatio > 0.8 ? 'font-medium text-brand-700' : undefined}>{pct(r.spamRatio * 100, 0)}</span>
    ) },
    { key: 'destination', header: 'Destination', width: 200, mono: true },
    { key: 'outbound', header: 'Outbound', width: 100, render: (r) => (r.outbound ? 'Yes' : 'No') },
    { key: 'addedAt', header: 'Added', width: 110, optional: true, render: (r) => shortDate(r.addedAt) },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['active', 'suspended', 'pending'].map((v) => ({ value: v, label: v })) },
    { key: 'outbound', label: 'Outbound enabled', type: 'boolean' },
    { key: 'spamRatio', label: 'Spam ratio', type: 'numberrange', hint: '0–1. Above 0.8 is flagged.' },
    { key: 'mailboxes', label: 'Mailboxes', type: 'numberrange' },
  ],
}

const spamConfigSpec: TableSpec<SpamConfig> = {
  id: 'spam_configs',
  rowId: (r) => r.id,
  defaultSort: { key: 'scope', dir: 'asc' },
  search: (r) => `${r.name} ${r.company ?? ''} ${r.scope}`,
  columns: [
    { key: 'name', header: 'Configuration', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'scope', header: 'Scope', width: 110, render: (r) => <Badge tone={r.scope === 'global' ? 'purple' : 'neutral'}>{r.scope}</Badge> },
    { key: 'company', header: 'Reseller', width: 200, render: (r) => r.company ?? '—' },
    { key: 'spamThreshold', header: 'Threshold', width: 110, align: 'right' },
    { key: 'quarantineDays', header: 'Quarantine', width: 110, align: 'right', render: (r) => `${r.quarantineDays} d` },
    { key: 'outboundEnabled', header: 'Outbound', width: 100, render: (r) => (r.outboundEnabled ? 'On' : 'Off') },
    { key: 'archiveEnabled', header: 'Archiving', width: 100, render: (r) => (r.archiveEnabled ? 'On' : 'Off') },
    { key: 'updatedBy', header: 'Updated by', width: 130 },
    { key: 'updatedAt', header: 'Updated', width: 130, render: (r) => relative(r.updatedAt) },
  ],
  filters: [
    { key: 'scope', label: 'Scope', type: 'select', options: ['global', 'reseller', 'bundle'].map((v) => ({ value: v, label: v })) },
    { key: 'outboundEnabled', label: 'Outbound', type: 'boolean' },
    { key: 'archiveEnabled', label: 'Archiving', type: 'boolean' },
  ],
}

const spamBundleSpec: TableSpec<SpamBundle> = {
  id: 'spam_bundles',
  rowId: (r) => r.id,
  defaultSort: { key: 'resellersUsing', dir: 'desc' },
  search: (r) => r.name,
  columns: [
    { key: 'name', header: 'Bundle', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'mailboxes', header: 'Mailboxes', width: 110, align: 'right', render: (r) => num(r.mailboxes) },
    { key: 'domainsIncluded', header: 'Domains', width: 100, align: 'right' },
    { key: 'price', header: 'Price', width: 100, align: 'right', render: (r) => money(r.price) },
    { key: 'active', header: 'Active', width: 90, render: (r) => (r.active ? <Badge tone="success">yes</Badge> : <Badge>no</Badge>) },
    { key: 'resellersUsing', header: 'Resellers using', width: 130, align: 'right', render: (r) => num(r.resellersUsing) },
    { key: 'createdAt', header: 'Created', width: 110, render: (r) => shortDate(r.createdAt) },
  ],
  filters: [
    { key: 'active', label: 'Active', type: 'boolean' },
    { key: 'price', label: 'Price', type: 'numberrange' },
  ],
}

export function SpamExpertsPage() {
  const [tab, setTab] = useTab('domains')
  const domainsDs = spamDomains()
  const configsDs = spamConfigs()
  const bundlesDs = spamBundles()

  return (
    <Module permissions={['product.spamexperts.read']} what="SpamExperts">
      <PageHeader
        title="SpamExperts"
        subtitle="Configurations, bundles and domains were three navigation entries with three different table conventions. One module, three tabs, one convention."
      />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'domains', label: 'Domains', count: domainsDs.total },
          { id: 'bundles', label: 'Bundles', count: bundlesDs.total },
          { id: 'configurations', label: 'Configurations', count: configsDs.total },
        ]}
      />
      {tab === 'domains' && <DataTable key="d" spec={spamDomainSpec} data={domainsDs} permission="product.spamexperts.read" exportName="SpamExperts domains" />}
      {tab === 'bundles' && <DataTable key="b" spec={spamBundleSpec} data={bundlesDs} permission="product.spamexperts.read" exportName="SpamExperts bundles" />}
      {tab === 'configurations' && <DataTable key="c" spec={spamConfigSpec} data={configsDs} permission="product.spamexperts.read" exportName="SpamExperts configurations" />}
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Licenses

const licenseSpec: TableSpec<License> = {
  id: 'licenses',
  rowId: (l) => l.id,
  defaultSort: { key: 'renewsAt', dir: 'asc' },
  pageSizes: [25, 50, 100, 250],
  search: (l) => `${l.id} ${l.key} ${l.product} ${l.company} ${l.ipAddress} ${l.migrationBatch ?? ''}`,
  columns: [
    { key: 'key', header: 'License key', width: 200, mono: true, render: (l) => <span className="font-medium">{l.key}</span> },
    { key: 'product', header: 'Product', width: 120, render: (l) => <Badge>{l.product}</Badge> },
    { key: 'edition', header: 'Edition', width: 120 },
    { key: 'status', header: 'Status', width: 110, render: (l) => <StatusBadge status={l.status} /> },
    { key: 'company', header: 'Reseller', width: 190, render: (l) => <Link to={`/customers/resellers/${l.resellerId}`} className="hover:text-brand-700 hover:underline">{l.company}</Link> },
    { key: 'ipAddress', header: 'IP', width: 130, mono: true },
    { key: 'renewsAt', header: 'Renews', width: 110, render: (l) => shortDate(l.renewsAt) },
    { key: 'price', header: 'Price', width: 90, align: 'right', render: (l) => money(l.price) },
    { key: 'billingCycle', header: 'Cycle', width: 90 },
    { key: 'seats', header: 'Seats', width: 80, align: 'right' },
    { key: 'migrationBatch', header: 'Migration batch', width: 150, render: (l) => l.migrationBatch ?? '—' },
    { key: 'vendorAccount', header: 'Vendor account', width: 140, optional: true },
    { key: 'activatedAt', header: 'Activated', width: 110, optional: true, render: (l) => shortDate(l.activatedAt) },
  ],
  filters: [
    { key: 'product', label: 'Product', type: 'multiselect', options: ['Plesk', 'cPanel', 'Virtuozzo', 'CloudLinux', 'Acronis', 'SolusVM'].map((v) => ({ value: v, label: v })) },
    { key: 'status', label: 'Status', type: 'multiselect', options: ['active', 'suspended', 'terminated', 'pending'].map((v) => ({ value: v, label: v })) },
    { key: 'billingCycle', label: 'Billing cycle', type: 'select', options: [{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }] },
    { key: 'renewsAt', label: 'Renews', type: 'daterange' },
    { key: 'hasBatch', label: 'In a migration batch', type: 'boolean', test: (l, v) => (v ? Boolean(l.migrationBatch) : !l.migrationBatch) },
    { key: 'vendorAccount', label: 'Vendor account', type: 'select', options: ['op-plesk-01', 'op-cpanel-02', 'op-virtuozzo-01', 'op-acronis-03'].map((v) => ({ value: v, label: v })) },
    { key: 'ipAddress', label: 'IP address', type: 'text', placeholder: '185.' },
  ],
}

export function LicensesTable() {
  const ds = licenses()
  const navigate = useNavigate()
  return (
    <>
      <ScaleNote total={ds.total} />
      <Callout tone="info" title="Change Owner was a 404">
        <code className="font-mono">Licenses → Change Owner</code> returned 404 in the old ACP and is retired here pending Q8. Ownership
        changes go through the migration wizard, which is audited.
      </Callout>
      <DataTable
        spec={licenseSpec}
        data={ds}
        permission="product.license.read"
        exportName="licenses"
        bulkActions={[
          {
            label: 'Migrate keys',
            permission: 'product.license.migrate',
            tier: 'T3',
            onRun: (rows) => navigate(`/system/bulk?op=license_migration&input=${encodeURIComponent(rows.map((r) => r.key).join('\n'))}`),
          },
        ]}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────── DNS zones

const dnsSpec: TableSpec<DnsZone> = {
  id: 'dns_zones',
  rowId: (z) => z.id,
  defaultSort: { key: 'updatedAt', dir: 'desc' },
  search: (z) => `${z.name} ${z.company} ${z.id}`,
  columns: [
    { key: 'name', header: 'Zone', render: (z) => <span className="font-medium">{z.name}</span> },
    { key: 'type', header: 'Type', width: 100, render: (z) => <Badge>{z.type}</Badge> },
    { key: 'status', header: 'Status', width: 100, render: (z) => <StatusBadge status={z.status} /> },
    { key: 'company', header: 'Reseller', width: 190, render: (z) => <Link to={`/customers/resellers/${z.resellerId}`} className="hover:text-brand-700 hover:underline">{z.company}</Link> },
    { key: 'records', header: 'Records', width: 90, align: 'right', render: (z) => num(z.records) },
    { key: 'dnssec', header: 'DNSSEC', width: 90, render: (z) => (z.dnssec ? 'Signed' : '—') },
    { key: 'provider', header: 'Provider', width: 170 },
    { key: 'orphaned', header: 'Orphaned', width: 100, render: (z) => (z.orphaned ? <Badge tone="warn">orphaned</Badge> : '—') },
    { key: 'soaSerial', header: 'SOA serial', width: 130, mono: true, optional: true },
    { key: 'updatedAt', header: 'Updated', width: 130, render: (z) => relative(z.updatedAt) },
  ],
  filters: [
    { key: 'type', label: 'Type', type: 'multiselect', options: ['master', 'slave', 'template'].map((v) => ({ value: v, label: v })) },
    { key: 'status', label: 'Status', type: 'multiselect', options: ['active', 'inactive', 'error'].map((v) => ({ value: v, label: v })) },
    { key: 'dnssec', label: 'DNSSEC', type: 'boolean' },
    { key: 'orphaned', label: 'Orphaned', type: 'boolean', hint: 'No active domain points at this zone.' },
    { key: 'records', label: 'Record count', type: 'numberrange' },
    { key: 'provider', label: 'Provider', type: 'select', options: ['Openprovider DNS', 'Reseller NS', 'Cloudflare'].map((v) => ({ value: v, label: v })) },
  ],
}

export function DnsZonesPage() {
  const ds = dnsZones()
  const navigate = useNavigate()
  const [zone, setZone] = useState<DnsZone | null>(null)

  return (
    <Module permissions={['product.dns.read']} what="DNS zones">
      <PageHeader
        title="DNS zones"
        subtitle="Bulk zone deletion used to sit on this page with no guardrail whatsoever. It is now a Tier 3 operation in the bulk console."
        meta={<Badge tone="neutral">{num(ds.total)} zones</Badge>}
      />
      <ScaleNote total={ds.total} />
      <DataTable
        spec={dnsSpec}
        data={ds}
        permission="product.dns.read"
        exportName="DNS zones"
        onRowClick={(z) => setZone(z)}
        bulkActions={[
          {
            label: 'Delete zones',
            permission: 'product.dns.bulk.delete',
            tier: 'T3',
            danger: true,
            onRun: (rows) => navigate(`/system/bulk?op=dns_zone_delete&input=${encodeURIComponent(rows.map((r) => r.name).join('\n'))}`),
          },
        ]}
      />
      <Drawer open={Boolean(zone)} onClose={() => setZone(null)} title={zone?.name ?? ''} subtitle="Zone records" width="lg">
        {zone && (
          <div className="space-y-4">
            <DefinitionList
              items={[
                { label: 'Reseller', value: <Link to={`/customers/resellers/${zone.resellerId}`} className="text-brand-700 hover:underline">{zone.company}</Link> },
                { label: 'Type', value: zone.type },
                { label: 'Records', value: num(zone.records) },
                { label: 'DNSSEC', value: zone.dnssec ? 'Signed' : 'Not signed' },
                { label: 'SOA serial', value: <code className="font-mono text-xs">{zone.soaSerial}</code> },
                { label: 'Updated', value: relative(zone.updatedAt) },
              ]}
            />
            <Card>
              <CardHeader title="Records" subtitle="First page of the zone file" />
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-right">TTL</th>
                    <th className="px-4 py-2 text-left">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {dnsRecords(zone.name).map((r, i) => (
                    <tr key={i} className="border-t border-ink-100">
                      <td className="px-4 py-2 font-mono text-xs">{r.name}</td>
                      <td className="px-4 py-2"><Badge>{r.type}</Badge></td>
                      <td className="px-4 py-2 text-right tabular">{r.ttl}</td>
                      <td className="px-4 py-2 font-mono text-xs text-ink-600">{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <DangerZone
              title="Danger zone — this zone"
              items={[
                {
                  title: 'Delete zone',
                  description: 'Removes the zone and every record in it.',
                  consequences: [
                    `${zone.name} stops resolving once caches expire.`,
                    'Mail for the zone stops being delivered.',
                    `${num(zone.records)} records are removed.`,
                  ],
                  reversible: 'The zone file is captured in the job report and can be re-imported.',
                  permission: 'product.dns.bulk.delete',
                  tier: 'T3',
                  confirmValue: zone.name,
                  cta: 'Delete zone',
                  dryRun: () => ({
                    summary: `${zone.name} would be deleted from Openprovider DNS.`,
                    willChange: [
                      { label: 'Zones deleted', count: 1, tone: 'danger' },
                      { label: 'Records deleted', count: zone.records, tone: 'danger' },
                      { label: 'Domains affected', count: zone.orphaned ? 0 : 1, tone: 'warn' },
                    ],
                  }),
                  onExecute: () => setZone(null),
                },
              ]}
            />
          </div>
        )}
      </Drawer>
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Virtual products

const virtualSpec: TableSpec<VirtualProduct> = {
  id: 'virtual_products',
  rowId: (v) => v.id,
  defaultSort: { key: 'subscriptions', dir: 'desc' },
  search: (v) => `${v.name} ${v.sku} ${v.category}`,
  columns: [
    { key: 'name', header: 'Product', render: (v) => <span className="font-medium">{v.name}</span> },
    { key: 'sku', header: 'SKU', width: 120, mono: true },
    { key: 'category', header: 'Category', width: 110, render: (v) => <Badge>{v.category}</Badge> },
    { key: 'price', header: 'Price', width: 100, align: 'right', render: (v) => money(v.price) },
    { key: 'billingCycle', header: 'Cycle', width: 90 },
    { key: 'active', header: 'Active', width: 90, render: (v) => (v.active ? <Badge tone="success">yes</Badge> : <Badge>no</Badge>) },
    { key: 'subscriptions', header: 'Subscriptions', width: 130, align: 'right', render: (v) => num(v.subscriptions) },
    { key: 'createdBy', header: 'Created by', width: 140, optional: true },
    { key: 'createdAt', header: 'Created', width: 110, optional: true, render: (v) => shortDate(v.createdAt) },
    { key: 'description', header: 'Description', optional: true },
  ],
  filters: [
    { key: 'category', label: 'Category', type: 'multiselect', options: ['hosting', 'email', 'security', 'service', 'addon'].map((v) => ({ value: v, label: v })) },
    { key: 'active', label: 'Active', type: 'boolean' },
    { key: 'billingCycle', label: 'Cycle', type: 'select', options: ['once', 'monthly', 'yearly'].map((v) => ({ value: v, label: v })) },
    { key: 'price', label: 'Price', type: 'numberrange' },
  ],
}

export function VirtualProductsPage() {
  const ds = virtualProducts()
  const [open, setOpen] = useState(false)
  return (
    <Module permissions={['product.virtual.read']} what="virtual products">
      <PageHeader title="Virtual products" subtitle="Non-domain SKUs sold through the platform." />
      <DataTable
        spec={virtualSpec}
        data={ds}
        permission="product.virtual.read"
        exportName="virtual products"
        create={{ label: 'New product', permission: 'product.virtual.write', onClick: () => setOpen(true) }}
      />
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New virtual product"
        subtitle="Create flows are drawers on the list page (P3)"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>Create product</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required><Input placeholder="Managed Backup" /></Field>
          <Field label="SKU" required><Input placeholder="HOS-4821" /></Field>
          <Field label="Category" required>
            <Select>{['hosting', 'email', 'security', 'service', 'addon'].map((c) => <option key={c}>{c}</option>)}</Select>
          </Field>
          <Field label="Billing cycle"><Select><option>monthly</option><option>yearly</option><option>once</option></Select></Field>
          <Field label="Price (EUR)" required><Input type="number" step="0.01" /></Field>
          <Field label="Active"><Switch checked onChange={() => undefined} label="Available to resellers" /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea rows={3} className="font-sans text-sm" /></Field>
        </div>
      </Drawer>
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Trademarks

const trademarkSpec: TableSpec<Trademark> = {
  id: 'trademarks',
  rowId: (t) => t.id,
  defaultSort: { key: 'smdValidUntil', dir: 'asc' },
  search: (t) => `${t.mark} ${t.owner} ${t.registrationNumber} ${t.company}`,
  columns: [
    { key: 'mark', header: 'Mark', render: (t) => <span className="font-medium">{t.mark}</span> },
    { key: 'owner', header: 'Owner', width: 220 },
    { key: 'jurisdiction', header: 'Jurisdiction', width: 120, render: (t) => <Badge>{t.jurisdiction}</Badge> },
    { key: 'registrationNumber', header: 'Registration', width: 130, mono: true },
    { key: 'tmchStatus', header: 'TMCH', width: 110, render: (t) => <StatusBadge status={t.tmchStatus} /> },
    { key: 'smdValidUntil', header: 'SMD valid until', width: 140, render: (t) => (
      <span className={t.smdValidUntil < '2026-09-26' ? 'font-medium text-amber-700' : undefined}>{shortDate(t.smdValidUntil)}</span>
    ) },
    { key: 'labels', header: 'Labels', width: 90, align: 'right' },
    { key: 'claimsNotices', header: 'Claims notices', width: 130, align: 'right', render: (t) => num(t.claimsNotices) },
    { key: 'sunriseEligible', header: 'Sunrise', width: 100, render: (t) => (t.sunriseEligible ? 'Yes' : 'No') },
    { key: 'company', header: 'Reseller', width: 190, optional: true, render: (t) => <Link to={`/customers/resellers/${t.resellerId}`} className="hover:text-brand-700 hover:underline">{t.company}</Link> },
  ],
  filters: [
    { key: 'tmchStatus', label: 'TMCH status', type: 'multiselect', options: ['verified', 'pending', 'expired', 'rejected'].map((v) => ({ value: v, label: v })) },
    { key: 'jurisdiction', label: 'Jurisdiction', type: 'select', options: ['EUIPO', 'USPTO', 'WIPO', 'UKIPO', 'DPMA', 'INPI', 'BOIP'].map((v) => ({ value: v, label: v })) },
    { key: 'smdValidUntil', label: 'SMD valid until', type: 'daterange' },
    { key: 'sunriseEligible', label: 'Sunrise eligible', type: 'boolean' },
  ],
}

export function TrademarksPage() {
  const ds = trademarks()
  const expiring = useMemo(() => {
    let n = 0
    for (let i = 0; i < ds.total; i++) {
      const t = ds.at(i)
      if (!t._deleted && t.smdValidUntil < '2026-10-26' && t.tmchStatus === 'verified') n++
    }
    return n
  }, [ds])

  return (
    <Module permissions={['product.trademark.read']} what="trademarks">
      <PageHeader title="Trademarks" subtitle="TMCH marks, SMD validity and claims notices." />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Registered marks" value={num(ds.total)} />
        <StatTile label="SMD expiring in 60 days" value={num(expiring)} tone={expiring ? 'warn' : 'neutral'} />
        <StatTile label="Sunrise eligible" value={num(Math.round(ds.total * 0.5))} />
      </div>
      <DataTable spec={trademarkSpec} data={ds} permission="product.trademark.read" exportName="trademarks" />
    </Module>
  )
}

