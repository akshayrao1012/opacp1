import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Lock, Play, Search, ShieldAlert, Terminal, Unlock } from 'lucide-react'
import { DataTable, ScaleNote } from '../components/patterns/DataTable'
import { Module, PageHeader, TabBar, useTab } from '../components/patterns/Page'
import { ElevationGate } from '../components/patterns/Destructive'
import {
  Badge, Button, Callout, Card, CardHeader, Checkbox, CopyButton, DefinitionList, Field, Input,
  Select, StatTile, StatusBadge, Switch, Textarea, Tooltip,
} from '../components/ui'
import { useCan, useStore } from '../lib/store'
import { money, num, parseIdentifierList, relative, shortDate } from '../lib/format'
import type { TableSpec } from '../lib/table'
import { TLDS } from '../lib/rng'
import {
  domainNotifications, domains, eppLookup, findDomainByName, transfers, NOTIFICATION_TYPES,
  REGISTRY_BY_TLD, type Domain, type DomainNotification, type Transfer,
} from '../lib/mock/domains'

const REGISTRIES = [...new Set([...Object.values(REGISTRY_BY_TLD), 'CentralNic'])].sort()
import { resellerOptions } from '../lib/mock/catalog'

const DOMAIN_STATUSES = ['active', 'expired', 'quarantine', 'clientHold', 'pending_transfer']

const domainSpec: TableSpec<Domain> = {
  id: 'domains',
  rowId: (d) => String(d.id),
  href: (d) => `/domains/${encodeURIComponent(d.name)}`,
  defaultSort: { key: 'expiresAt', dir: 'asc' },
  pageSizes: [25, 50, 100, 250],
  search: (d) => `${d.name} ${d.company} ${d.registrantHandle} ${d.registrantName} ${d.id}`,
  columns: [
    { key: 'name', header: 'Domain', render: (d) => <span className="font-medium">{d.name}</span> },
    { key: 'status', header: 'Status', width: 130, render: (d) => <StatusBadge status={d.status} /> },
    { key: 'company', header: 'Reseller', width: 200, render: (d) => <Link to={`/customers/resellers/${d.resellerId}`} className="hover:text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>{d.company}</Link> },
    { key: 'expiresAt', header: 'Expires', width: 110, render: (d) => (
      <Tooltip content={`Created ${d.createdAt}`}>
        <span className={d.expiresAt < '2026-09-26' ? 'font-medium text-amber-700' : undefined}>{shortDate(d.expiresAt)}</span>
      </Tooltip>
    ) },
    { key: 'autoRenew', header: 'Auto-renew', width: 100, render: (d) => (d.autoRenew ? 'Yes' : 'No') },
    { key: 'premium', header: 'Premium', width: 110, render: (d) => (d.premium ? <Badge tone="purple">{money(d.premiumPrice ?? 0)}</Badge> : '—') },
    { key: 'provider', header: 'Registry', width: 130 },
    { key: 'tld', header: 'TLD', width: 80, render: (d) => `.${d.tld}` },
    { key: 'transferLock', header: 'Lock', width: 70, render: (d) => (d.transferLock ? <Lock className="h-3.5 w-3.5 text-ink-400" /> : <Unlock className="h-3.5 w-3.5 text-amber-600" />) },
    { key: 'dnssec', header: 'DNSSEC', width: 90, optional: true, render: (d) => (d.dnssec ? 'Yes' : 'No') },
    { key: 'abuseReports', header: 'Abuse', width: 80, align: 'right', render: (d) => (d.abuseReports ? <span className="font-medium text-brand-700">{d.abuseReports}</span> : '0') },
    { key: 'registrantName', header: 'Registrant', width: 160, optional: true },
    { key: 'registrantHandle', header: 'Handle', width: 120, mono: true, optional: true },
    { key: 'createdAt', header: 'Created', width: 110, optional: true, render: (d) => shortDate(d.createdAt) },
    { key: 'nameservers', header: 'Nameservers', optional: true, render: (d) => <span className="font-mono text-2xs text-ink-500">{d.nameservers}</span> },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: DOMAIN_STATUSES.map((v) => ({ value: v, label: v })) },
    { key: 'tld', label: 'TLD', type: 'multiselect', options: TLDS.map((t) => ({ value: t, label: `.${t}` })) },
    { key: 'resellerId', label: 'Reseller ID', type: 'text', placeholder: '100341' },
    { key: 'expiresAt', label: 'Expires', type: 'daterange' },
    { key: 'createdAt', label: 'Created', type: 'daterange' },
    { key: 'premium', label: 'Premium', type: 'boolean', hint: 'The old separate Premium page is this filter.' },
    { key: 'autoRenew', label: 'Auto-renew', type: 'boolean' },
    { key: 'dnssec', label: 'DNSSEC', type: 'boolean' },
    { key: 'transferLock', label: 'Transfer lock', type: 'boolean' },
    { key: 'abuseReports', label: 'Abuse reports', type: 'numberrange' },
    { key: 'provider', label: 'Registry', type: 'select', options: REGISTRIES.map((v) => ({ value: v, label: v })) },
  ],
}

export function DomainsOverview() {
  const navigate = useNavigate()
  const ds = domains()
  const mutate = useStore((s) => s.mutate)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)

  return (
    <Module permissions={['domain.read']} what="the domain overview">
      <PageHeader
        title="Domains"
        subtitle="One table with saved views. Premium is a filter, not a separate page; bulk actions hand off to the governed bulk console instead of a parallel form."
        meta={<Badge tone="neutral">{num(ds.total)} records</Badge>}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/domains/domain-info')}>
              <Terminal className="h-3.5 w-3.5" /> EPP lookup
            </Button>
            <Button variant="secondary" onClick={() => navigate('/system/bulk?op=domain_lookup')}>
              Bulk operations
            </Button>
          </>
        }
      />
      <ScaleNote total={ds.total} />
      <DataTable
        spec={domainSpec}
        data={ds}
        permission="domain.read"
        exportName="domains"
        bulkActions={[
          {
            label: 'Suspend (abuse)',
            permission: 'domain.bulk.suspend',
            tier: 'T3',
            danger: true,
            onRun: (rows) => navigate(`/system/bulk?op=domain_abuse&input=${encodeURIComponent(rows.map((r) => r.name).join('\n'))}`),
          },
          {
            label: 'Delete from database',
            permission: 'domain.bulk.delete',
            tier: 'T3',
            danger: true,
            onRun: (rows) => navigate(`/system/bulk?op=domain_delete&input=${encodeURIComponent(rows.map((r) => r.name).join('\n'))}`),
          },
          {
            label: 'Internal transfer',
            permission: 'domain.bulk.internal_transfer',
            tier: 'T3',
            onRun: (rows) => navigate(`/system/bulk?op=internal_transfer&input=${encodeURIComponent(rows.map((r) => r.name).join('\n'))}`),
          },
          {
            label: 'Toggle auto-renew',
            permission: 'domain.write',
            tier: 'T1',
            onRun: (rows) => {
              for (const r of rows) mutate('domains', String(r.id), { autoRenew: !r.autoRenew })
              logAudit({ action: 'domain.write', resource: 'domain', resourceId: `${rows.length} domains`, after: { autoRenew: 'toggled' } })
              addToast({ kind: 'success', title: `Auto-renew toggled on ${rows.length} domains`, body: 'T1 — audited, no approval needed.' })
            },
          },
        ]}
        note={
          <Callout tone="info" title="Bulk actions are routed, not duplicated">
            Selecting rows and choosing a Tier 3 action opens the bulk console pre-filled with your selection, so the dry run, typed
            confirmation and approver flow apply exactly once, in one place.
          </Callout>
        }
      />
    </Module>
  )
}

export function PremiumDomainsTable() {
  const navigate = useNavigate()
  const spec: TableSpec<Domain> = {
    ...domainSpec,
    id: 'domains_premium',
    defaultFilters: { premium: true },
    defaultSort: { key: 'premiumPrice', dir: 'desc' },
  }
  return (
    <DataTable
      spec={spec}
      data={domains()}
      permission="domain.read"
      exportName="premium domains"
      bulkActions={[
        {
          label: 'Internal transfer',
          permission: 'domain.bulk.internal_transfer',
          tier: 'T3',
          onRun: (rows) => navigate(`/system/bulk?op=internal_transfer&input=${encodeURIComponent(rows.map((r) => r.name).join('\n'))}`),
        },
      ]}
      note={
        <Callout tone="warn" title="Premium domains carry the commercial risk">
          Registry pricing is per name and can be hundreds of euros a year. A bulk action here costs real money, so the premium column is
          pinned and every row shows its price.
        </Callout>
      }
    />
  )
}

// ─────────────────────────────────────────────────────── Transfers

const transferSpec: TableSpec<Transfer> = {
  id: 'transfers',
  rowId: (t) => t.id,
  defaultSort: { key: 'requestedAt', dir: 'desc' },
  search: (t) => `${t.id} ${t.domain} ${t.fromCompany} ${t.toCompany} ${t.registry}`,
  columns: [
    { key: 'domain', header: 'Domain', render: (t) => <Link to={`/domains/${encodeURIComponent(t.domain)}`} className="font-medium hover:text-brand-700 hover:underline">{t.domain}</Link> },
    { key: 'id', header: 'Transfer', width: 110, mono: true },
    { key: 'kind', header: 'Type', width: 140, render: (t) => <Badge tone={t.kind === 'internal' ? 'info' : 'neutral'}>{t.kind.replace(/_/g, ' ')}</Badge> },
    { key: 'status', header: 'Status', width: 130, render: (t) => <StatusBadge status={t.status} /> },
    { key: 'fromCompany', header: 'From', width: 180 },
    { key: 'toCompany', header: 'To', width: 180 },
    { key: 'registry', header: 'Registry', width: 110 },
    { key: 'attempts', header: 'Attempts', width: 90, align: 'right' },
    { key: 'ageHours', header: 'Age', width: 90, align: 'right', render: (t) => `${num(t.ageHours)}h` },
    { key: 'failureReason', header: 'Failure reason', render: (t) => t.failureReason ?? '—' },
    { key: 'authCodeValid', header: 'Auth code', width: 100, optional: true, render: (t) => (t.authCodeValid ? 'valid' : 'invalid') },
    { key: 'requestedAt', header: 'Requested', width: 130, render: (t) => relative(t.requestedAt) },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['pending', 'ack_required', 'in_progress', 'completed', 'failed', 'cancelled'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'registry', label: 'Registry', type: 'select', options: REGISTRIES.map((v) => ({ value: v, label: v })) },
    { key: 'ageHours', label: 'Age (hours)', type: 'numberrange' },
    { key: 'requestedAt', label: 'Requested', type: 'daterange' },
    { key: 'authCodeValid', label: 'Auth code valid', type: 'boolean' },
  ],
}

export function DomainTransfers() {
  const [tab, setTab] = useTab('third_party')
  const ds = transfers()
  const navigate = useNavigate()
  const canAct = useCan('domain.transfer.write')

  const counts = useMemo(() => {
    let third = 0
    let internal = 0
    let grouped = new Set<number>()
    for (let i = 0; i < ds.total; i++) {
      const t = ds.at(i)
      if (t._deleted) continue
      if (t.kind === 'internal') internal++
      else {
        third++
        grouped.add(t.toResellerId)
      }
    }
    return { third, internal, resellers: grouped.size }
  }, [ds])

  const spec: TableSpec<Transfer> = {
    ...transferSpec,
    id: `transfers_${tab}`,
    defaultFilters:
      tab === 'internal'
        ? { kind: 'internal' }
        : tab === 'grouped'
          ? { kind_not_internal: true }
          : { kind_not_internal: true },
    filters: [
      ...(transferSpec.filters ?? []),
      { key: 'kind', label: 'Type', type: 'select', options: [{ value: 'third_party_in', label: 'Third party in' }, { value: 'third_party_out', label: 'Third party out' }, { value: 'internal', label: 'Internal' }] },
      { key: 'kind_not_internal', label: 'Third-party only', type: 'boolean', test: (t, v) => (v ? t.kind !== 'internal' : true) },
    ],
  }

  return (
    <Module permissions={['domain.transfer.read']} what="transfers">
      <PageHeader
        title="Transfers"
        subtitle="3rdPTS transfers, its grouped-by-reseller variant and internal transfers were three navigation entries. They are three tabs of one module."
      />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'third_party', label: 'Third party', count: counts.third },
          { id: 'grouped', label: 'By reseller', count: counts.resellers },
          { id: 'internal', label: 'Internal', count: counts.internal },
        ]}
      />
      {tab === 'grouped' ? (
        <GroupedTransfers ds={ds} />
      ) : (
        <DataTable
          key={tab}
          spec={spec}
          data={ds}
          permission="domain.transfer.read"
          exportName="transfers"
          rowActions={(row) =>
            row.status === 'ack_required' ? (
              <Button size="sm" variant="secondary" disabled={!canAct} onClick={() => undefined}>
                Acknowledge
              </Button>
            ) : null
          }
          toolbar={
            tab === 'internal' ? (
              <Button variant="secondary" onClick={() => navigate('/system/bulk?op=internal_transfer')}>
                Bulk internal transfer
              </Button>
            ) : undefined
          }
        />
      )}
    </Module>
  )
}

function GroupedTransfers({ ds }: { ds: ReturnType<typeof transfers> }) {
  const groups = useMemo(() => {
    const map = new Map<string, { company: string; id: number; total: number; failed: number; pending: number }>()
    for (let i = 0; i < ds.total; i++) {
      const t = ds.at(i)
      if (t._deleted || t.kind === 'internal') continue
      const key = String(t.toResellerId)
      const g = map.get(key) ?? { company: t.toCompany, id: t.toResellerId, total: 0, failed: 0, pending: 0 }
      g.total++
      if (t.status === 'failed') g.failed++
      if (t.status === 'pending' || t.status === 'ack_required' || t.status === 'in_progress') g.pending++
      map.set(key, g)
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 40)
  }, [ds])

  return (
    <Card>
      <CardHeader title="Transfers grouped by reseller" subtitle="Top 40 by volume — the old page had no way to sort or drill down" />
      <table className="w-full text-sm">
        <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
          <tr>
            <th className="px-4 py-2 text-left">Reseller</th>
            <th className="px-4 py-2 text-right">Transfers</th>
            <th className="px-4 py-2 text-right">In progress</th>
            <th className="px-4 py-2 text-right">Failed</th>
            <th className="px-4 py-2 text-right">Failure rate</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id} className="border-t border-ink-100 hover:bg-ink-50">
              <td className="px-4 py-2">
                <Link to={`/customers/resellers/${g.id}`} className="font-medium text-ink-900 hover:text-brand-700 hover:underline">{g.company}</Link>
                <span className="ml-2 font-mono text-2xs text-ink-400">{g.id}</span>
              </td>
              <td className="px-4 py-2 text-right tabular">{num(g.total)}</td>
              <td className="px-4 py-2 text-right tabular">{num(g.pending)}</td>
              <td className="px-4 py-2 text-right tabular">{num(g.failed)}</td>
              <td className="px-4 py-2 text-right tabular">
                <span className={g.failed / g.total > 0.15 ? 'font-medium text-brand-700' : undefined}>
                  {((g.failed / g.total) * 100).toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

// ─────────────────────────────────────────────────────── Domain notifications

const notifSpec: TableSpec<DomainNotification> = {
  id: 'domain_notifications',
  rowId: (n) => n.id,
  defaultSort: { key: 'scheduledAt', dir: 'desc' },
  search: (n) => `${n.domain} ${n.company} ${n.recipient} ${n.type}`,
  columns: [
    { key: 'domain', header: 'Domain', render: (n) => <Link to={`/domains/${encodeURIComponent(n.domain)}`} className="font-medium hover:text-brand-700 hover:underline">{n.domain}</Link> },
    { key: 'type', header: 'Type', width: 190, mono: true },
    { key: 'status', header: 'Status', width: 120, render: (n) => <StatusBadge status={n.status} /> },
    { key: 'channel', header: 'Channel', width: 100, render: (n) => <Badge>{n.channel}</Badge> },
    { key: 'recipient', header: 'Recipient', width: 220 },
    { key: 'company', header: 'Reseller', width: 180, optional: true },
    { key: 'scheduledAt', header: 'Scheduled', width: 150, render: (n) => relative(n.scheduledAt) },
    { key: 'sentAt', header: 'Sent', width: 150, render: (n) => (n.sentAt ? relative(n.sentAt) : '—') },
    { key: 'attempts', header: 'Attempts', width: 90, align: 'right' },
    { key: 'template', header: 'Template', width: 170, optional: true, mono: true },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['scheduled', 'sent', 'failed', 'suppressed'].map((v) => ({ value: v, label: v })) },
    { key: 'type', label: 'Type', type: 'select', options: NOTIFICATION_TYPES.map((t) => ({ value: t, label: t })) },
    { key: 'channel', label: 'Channel', type: 'select', options: [{ value: 'email', label: 'Email' }, { value: 'webhook', label: 'Webhook' }] },
    { key: 'scheduledAt', label: 'Scheduled', type: 'daterange' },
  ],
}

export function DomainNotificationsPage() {
  const ds = domainNotifications()
  return (
    <Module permissions={['domain.notification.read']} what="domain notifications">
      <PageHeader title="Domain notifications" subtitle="Expiry, transfer and verification notices, with delivery outcome per row." />
      <ScaleNote total={ds.total} />
      <DataTable spec={notifSpec} data={ds} permission="domain.notification.read" exportName="domain notifications" />
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Domain info (EPP)

export function DomainInfo() {
  const [params, setParams] = useSearchParams()
  const initial = params.get('domain') ?? ''
  const [value, setValue] = useState(initial)
  const [submitted, setSubmitted] = useState(initial)

  return (
    <Module permissions={['domain.epp.read']} what="EPP domain info">
      <PageHeader
        title="Domain info (EPP)"
        subtitle="The registry response rendered as structured fields, with the raw payload one toggle away — instead of a wall of JSON."
      />
      <Card>
        <div className="flex flex-wrap items-end gap-2 p-4">
          <Field label="Domain name" className="min-w-[280px] flex-1">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setSubmitted(value.trim())
                  setParams({ domain: value.trim() }, { replace: true })
                }
              }}
              placeholder="atlas42.com"
            />
          </Field>
          <Button
            variant="primary"
            onClick={() => {
              setSubmitted(value.trim())
              setParams({ domain: value.trim() }, { replace: true })
            }}
            disabled={!value.trim()}
          >
            <Search className="h-3.5 w-3.5" /> Look up
          </Button>
        </div>
      </Card>
      {submitted ? <EppPanel domain={submitted} /> : (
        <Card className="p-10">
          <p className="text-center text-xs text-ink-500">
            Enter a domain to query its registry directly. This is a live EPP call — it is logged as a T0 read against the domain.
          </p>
        </Card>
      )}
    </Module>
  )
}

function EppPanel({ domain }: { domain: string }) {
  const epp = useMemo(() => eppLookup(domain), [domain])
  const [raw, setRaw] = useState(false)
  const [authShown, setAuthShown] = useState(false)
  const logAudit = useStore((s) => s.logAudit)

  return (
    <Card>
      <CardHeader
        title={epp.domain}
        subtitle={`${epp.registry} · EPP ${epp.code} ${epp.message} · ${epp.latencyMs} ms`}
        actions={
          <div className="flex items-center gap-2">
            <Switch checked={raw} onChange={setRaw} label="Raw JSON" />
            <CopyButton value={epp.raw} label="Copy" />
          </div>
        }
      />
      {raw ? (
        <pre className="max-h-[520px] overflow-auto scrollbar-thin bg-ink-950 p-4 font-mono text-2xs leading-relaxed text-ink-100">
          {epp.raw.replace(epp.authInfo, authShown ? epp.authInfo : '«masked»')}
        </pre>
      ) : (
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap gap-1.5">
            {epp.statuses.map((s) => (
              <Badge key={s} tone={s === 'clientHold' ? 'danger' : s === 'pendingTransfer' ? 'warn' : 'success'}>{s}</Badge>
            ))}
          </div>
          <DefinitionList
            columns={3}
            items={[
              { label: 'ROID', value: <code className="font-mono text-xs">{epp.roid}</code> },
              { label: 'Created', value: shortDate(epp.created) },
              { label: 'Updated', value: shortDate(epp.updated) },
              { label: 'Expires', value: shortDate(epp.expires) },
              { label: 'Registrant', value: <code className="font-mono text-xs">{epp.registrant}</code> },
              { label: 'Admin', value: <code className="font-mono text-xs">{epp.admin}</code> },
              { label: 'Tech', value: <code className="font-mono text-xs">{epp.tech}</code> },
              { label: 'Billing', value: <code className="font-mono text-xs">{epp.billing}</code> },
              { label: 'Transfer lock', value: epp.transferLock ? 'On' : 'Off' },
            ]}
          />
          <div>
            <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-400">Nameservers</p>
            <ul className="space-y-1">
              {epp.nameservers.map((ns) => (
                <li key={ns.host} className="flex items-center gap-2 text-xs">
                  <code className="font-mono text-ink-800">{ns.host}</code>
                  <span className="text-ink-400">{ns.ipv4}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-400">DNSSEC</p>
            {epp.dnssec.length === 0 ? (
              <p className="text-xs text-ink-500">Not signed.</p>
            ) : (
              epp.dnssec.map((d) => (
                <p key={d.keyTag} className="font-mono text-2xs text-ink-700">
                  keyTag {d.keyTag} · alg {d.algorithm} · {d.digest.slice(0, 40)}…
                </p>
              ))
            )}
          </div>
          <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-ink-500">
              <ShieldAlert className="h-3.5 w-3.5" /> Auth info (transfer code)
            </p>
            <div className="flex items-center gap-2">
              <code className="rounded border border-ink-200 bg-white px-2 py-1 font-mono text-xs">
                {authShown ? epp.authInfo : '••••••••••••'}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (!authShown) logAudit({ action: 'domain.epp.read', resource: 'domain_authinfo', resourceId: epp.domain, reason: 'Auth info revealed for transfer support' })
                  setAuthShown((v) => !v)
                }}
              >
                {authShown ? 'Hide' : 'Reveal'}
              </Button>
            </div>
            <p className="mt-1 text-2xs text-ink-500">Revealing the transfer code is audited — it is the credential that moves a domain.</p>
          </div>
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────── Create in database

export function DomainCreateInDatabase() {
  const [input, setInput] = useState('')
  const [reseller, setReseller] = useState('')
  const [ns, setNs] = useState('ns1.openprovider.nl, ns2.openprovider.be')
  const [years, setYears] = useState('1')
  const [expires, setExpires] = useState('2027-08-26')
  const [testDone, setTestDone] = useState<{ rows: number; ok: number; rejected: number } | null>(null)
  const [ack, setAck] = useState(false)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)
  const createJob = useStore((s) => s.createJob)
  const advanceJob = useStore((s) => s.advanceJob)
  const rows = parseIdentifierList(input)
  const options = useMemo(() => resellerOptions(), [])

  const runTest = () => {
    const ok = rows.filter((r) => /^[a-z0-9-]+\.[a-z.]{2,}$/i.test(r) && !findDomainByName(r)).length
    setTestDone({ rows: rows.length, ok, rejected: rows.length - ok })
  }

  return (
    <Module permissions={['domain.create_in_db']} what="create in database">
      <PageHeader
        title="Create in database"
        subtitle="Registers domains in the Openprovider database without touching the registry — for domains already registered elsewhere. Test mode was optional; here it is mandatory."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title="Domains" subtitle="One per line. Each row is validated before anything is written." />
          <div className="space-y-3 p-4">
            <Field label="Domain names" required hint={`${rows.length} rows parsed`}>
              <Textarea rows={8} value={input} onChange={(e) => { setInput(e.target.value); setTestDone(null) }} placeholder={'atlas-new.com\nbeacon-new.nl'} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Reseller" required>
                <Select value={reseller} onChange={(e) => setReseller(e.target.value)}>
                  <option value="">Select a reseller…</option>
                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="Registration period">
                <Select value={years} onChange={(e) => setYears(e.target.value)}>
                  {[1, 2, 3, 5, 10].map((y) => <option key={y} value={y}>{y} year(s)</option>)}
                </Select>
              </Field>
              <Field label="Expiry date" required hint="Must match the registry — it drives renewal billing.">
                <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
              </Field>
              <Field label="Nameservers">
                <Input value={ns} onChange={(e) => setNs(e.target.value)} />
              </Field>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Mandatory test run" subtitle="Step 1 of 2" />
            <div className="space-y-3 p-4">
              {!testDone && (
                <p className="text-xs text-ink-600">
                  The old form offered a test mode as a checkbox that was easy to skip. Here the write button stays locked until the test
                  has run against the current input.
                </p>
              )}
              {testDone && (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <StatTile label="Rows" value={testDone.rows} />
                    <StatTile label="Would create" value={testDone.ok} tone="success" />
                    <StatTile label="Rejected" value={testDone.rejected} tone={testDone.rejected ? 'danger' : 'neutral'} />
                  </div>
                  {testDone.rejected > 0 && (
                    <Callout tone="warn" title="Rejected rows">
                      Rows are rejected when the name is malformed or the domain already exists in the database. Nothing is written for
                      those rows.
                    </Callout>
                  )}
                </div>
              )}
              <Button variant="secondary" disabled={!rows.length || !reseller} onClick={runTest}>
                <Play className="h-3.5 w-3.5" /> Run test
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Write to database" subtitle="Step 2 of 2 — T2" />
            <div className="space-y-3 p-4">
              <Checkbox
                label="I confirm these domains are registered at the registry and the expiry dates are correct."
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              <Button
                variant="primary"
                className="w-full"
                disabled={!testDone || !testDone.ok || !ack}
                onClick={() => {
                  const job = createJob({
                    kind: 'domain_create_in_db',
                    label: `Create ${testDone?.ok} domains in database`,
                    status: 'running',
                    owner: '',
                    total: testDone?.ok ?? 0,
                    dryRun: false,
                    cancellable: true,
                    resultCsv: null,
                    reason: 'Import of externally registered domains',
                    ticket: 'ZD-448301',
                    approver: null,
                    tier: 'T2',
                  })
                  logAudit({ action: 'domain.create_in_db', resource: 'domain_batch', resourceId: job.id, after: { created: testDone?.ok }, reason: 'Import of externally registered domains', ticket: 'ZD-448301' })
                  window.setTimeout(() => {
                    advanceJob(job.id, { status: 'completed', progress: 100, succeeded: testDone?.ok ?? 0, cancellable: false, resultCsv: 'create-in-db-results.csv' })
                    addToast({ kind: 'success', title: `${testDone?.ok} domains created`, body: 'Per-row result report available in the job centre.', href: '/system/jobs', hrefLabel: 'Job centre' })
                  }, 1200)
                  setInput('')
                  setTestDone(null)
                  setAck(false)
                }}
              >
                Create {testDone?.ok ?? 0} domains
              </Button>
              <p className="text-2xs text-ink-500">
                Runs as a job with a per-row result report. Rows that fail do not block the rest.
              </p>
            </div>
          </Card>

          <ElevationGate permission="domain.bulk.delete" what="delete domains in bulk">
            <Callout tone="success" title="Bulk delete available">
              You currently hold elevation for bulk domain deletion.
            </Callout>
          </ElevationGate>
        </div>
      </div>
    </Module>
  )
}

