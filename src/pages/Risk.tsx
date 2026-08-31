import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, Ban, Check, Plus, RefreshCw, Split, Unlock, X,
} from 'lucide-react'
import { DataTable, ScaleNote } from '../components/patterns/DataTable'
import { Module, PageHeader, TabBar, useTab } from '../components/patterns/Page'
import { DetailRow, FieldGroup } from '../components/patterns/DetailRow'
import { DangerZone, T2Confirm } from '../components/patterns/Destructive'
import {
  Badge, Button, Callout, Card, CardHeader, Checkbox, Drawer, Field, Input, Progress, Select,
  StatTile, StatusBadge, Switch, Textarea, Tooltip,
} from '../components/ui'
import { useCan, useStore } from '../lib/store'
import { num, relative, shortDate } from '../lib/format'
import type { TableSpec } from '../lib/table'
import { COUNTRIES } from '../lib/rng'
import {
  bannedKeywords, bruteforceChanges, bruteforceEvents, bruteforceRules, ipBlacklist, keywordHits,
  stuckBatches, type BannedKeyword, type BlacklistEntry, type BruteforceEvent, type BruteforceRule,
  type StuckBatch,
} from '../lib/mock/risk'

const TARGET_OPTIONS = [
  { value: 'reseller_login', label: 'Reseller login' },
  { value: 'api_auth', label: 'API auth' },
  { value: 'password_reset', label: 'Password reset' },
  { value: 'domain_authcode', label: 'Domain auth code' },
  { value: 'customer_portal', label: 'Customer portal' },
]

// ─────────────────────────────────────────────────────── Bruteforce

const eventSpec: TableSpec<BruteforceEvent> = {
  id: 'bruteforce_events',
  rowId: (e) => e.id,
  defaultSort: { key: 'attempts', dir: 'desc' },
  search: (e) => `${e.ip} ${e.username} ${e.company ?? ''} ${e.asn} ${e.target}`,
  columns: [
    { key: 'ip', header: 'IP', width: 140, mono: true, render: (e) => <span className="font-medium">{e.ip}</span> },
    { key: 'country', header: 'Country', width: 90 },
    { key: 'target', header: 'Target', width: 150, render: (e) => <Badge>{e.target.replace(/_/g, ' ')}</Badge> },
    { key: 'attempts', header: 'Attempts', width: 100, align: 'right', render: (e) => (
      <span className={e.attempts > 200 ? 'font-semibold text-brand-700' : e.attempts > 20 ? 'text-amber-700' : undefined}>{num(e.attempts)}</span>
    ) },
    { key: 'distinctAccounts', header: 'Accounts', width: 100, align: 'right', render: (e) => (
      <Tooltip content={e.distinctAccounts > 9 ? 'Many accounts from one IP — credential stuffing rather than a forgotten password' : 'Single account'}>
        <span className={e.distinctAccounts > 9 ? 'font-medium text-brand-700' : undefined}>{num(e.distinctAccounts)}</span>
      </Tooltip>
    ) },
    { key: 'status', header: 'Status', width: 120, render: (e) => <StatusBadge status={e.status === 'monitoring' ? 'pending' : e.status === 'blocked' ? 'suspended' : e.status === 'allowlisted' ? 'active' : 'expired'} /> },
    { key: 'username', header: 'Account targeted', width: 220 },
    { key: 'company', header: 'Reseller', width: 180, render: (e) => e.company ? <Link to={`/customers/resellers/${e.resellerId}`} className="hover:text-brand-700 hover:underline">{e.company}</Link> : <span className="text-ink-400">unknown</span> },
    { key: 'asn', header: 'ASN', width: 170, optional: true },
    { key: 'userAgent', header: 'User agent', width: 220, optional: true },
    { key: 'lastSeenAt', header: 'Last seen', width: 130, render: (e) => relative(e.lastSeenAt) },
    { key: 'blockedUntil', header: 'Blocked until', width: 150, render: (e) => (e.blockedUntil ? relative(e.blockedUntil) : '—') },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['monitoring', 'blocked', 'expired', 'allowlisted'].map((v) => ({ value: v, label: v })) },
    { key: 'target', label: 'Target', type: 'multiselect', options: TARGET_OPTIONS },
    { key: 'attempts', label: 'Attempts', type: 'numberrange' },
    { key: 'distinctAccounts', label: 'Distinct accounts', type: 'numberrange', hint: 'More than a handful means credential stuffing.' },
    { key: 'country', label: 'Country', type: 'select', options: COUNTRIES.map(([c, n]) => ({ value: c, label: n })) },
    { key: 'lastSeenAt', label: 'Last seen', type: 'daterange' },
  ],
}

const ruleSpec: TableSpec<BruteforceRule> = {
  id: 'bruteforce_rules',
  rowId: (r) => r.id,
  defaultSort: { key: 'target', dir: 'asc' },
  search: (r) => `${r.target} ${r.scopeTarget}`,
  columns: [
    { key: 'target', header: 'Target', width: 170, render: (r) => <span className="font-medium">{r.target.replace(/_/g, ' ')}</span> },
    { key: 'scope', header: 'Scope', width: 110, render: (r) => <Badge tone={r.scope === 'global' ? 'purple' : r.scope === 'plan' ? 'info' : 'neutral'}>{r.scope}</Badge> },
    { key: 'scopeTarget', header: 'Applies to', width: 220 },
    { key: 'enabled', header: 'Enabled', width: 100, render: (r) => (r.enabled ? <Badge tone="success">on</Badge> : <Badge tone="danger">off</Badge>) },
    { key: 'thresholdAttempts', header: 'Threshold', width: 110, align: 'right' },
    { key: 'windowMinutes', header: 'Window', width: 100, align: 'right', render: (r) => `${r.windowMinutes} min` },
    { key: 'lockoutMinutes', header: 'Lockout', width: 100, align: 'right', render: (r) => `${r.lockoutMinutes} min` },
    { key: 'captchaAfter', header: 'CAPTCHA after', width: 130, align: 'right', render: (r) => (r.captchaAfter ? r.captchaAfter : <span className="text-ink-400">off</span>) },
    { key: 'blocked24h', header: 'Blocked 24h', width: 120, align: 'right', render: (r) => num(r.blocked24h) },
    { key: 'updatedBy', header: 'Updated by', width: 150 },
    { key: 'updatedAt', header: 'Updated', width: 130, render: (r) => relative(r.updatedAt) },
  ],
  filters: [
    { key: 'target', label: 'Target', type: 'multiselect', options: TARGET_OPTIONS },
    { key: 'scope', label: 'Scope', type: 'multiselect', options: ['global', 'plan', 'reseller'].map((v) => ({ value: v, label: v })) },
    { key: 'enabled', label: 'Enabled', type: 'boolean' },
  ],
}

export function BruteforcePage() {
  const [tab, setTab] = useTab('overview')
  const events = bruteforceEvents()
  const rules = bruteforceRules()
  const changes = useMemo(() => bruteforceChanges(), [])
  const canUnblock = useCan('risk.bruteforce.unblock')
  const canWrite = useCan('risk.bruteforce.write')
  const mutate = useStore((s) => s.mutate)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)
  const [unblock, setUnblock] = useState<BruteforceEvent | null>(null)
  const [ruleEdit, setRuleEdit] = useState<BruteforceRule | null>(null)
  const [draft, setDraft] = useState({ enabled: true, threshold: '', lockout: '', captcha: '' })
  const [confirmRule, setConfirmRule] = useState(false)

  const stats = useMemo(() => {
    let blocked = 0
    let monitoring = 0
    let stuffing = 0
    for (let i = 0; i < events.total; i++) {
      const e = events.at(i)
      if (e._deleted) continue
      if (e.status === 'blocked') blocked++
      if (e.status === 'monitoring') monitoring++
      if (e.distinctAccounts > 9) stuffing++
    }
    return { blocked, monitoring, stuffing }
  }, [events])

  const weakened = changes.filter((c) => c.riskNote).length

  return (
    <Module permissions={['risk.bruteforce.read']} what="bruteforce protection">
      <PageHeader
        title="Bruteforce"
        subtitle="Authentication attacks against reseller logins, the API and password reset — what is happening, what protection is switched on, and what was changed recently."
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Currently blocked" value={num(stats.blocked)} tone="danger" icon={<Ban className="h-4 w-4" />} />
        <StatTile label="Under monitoring" value={num(stats.monitoring)} tone="warn" />
        <StatTile label="Credential stuffing" value={num(stats.stuffing)} tone="danger" hint="one IP, many accounts" />
        <StatTile label="Protection weakened" value={num(weakened)} tone={weakened ? 'warn' : 'success'} hint="recent changes to review" />
      </div>

      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'activation', label: 'Activation', count: rules.total },
          { id: 'changes', label: 'Last-minute changes', count: changes.length },
        ]}
      />

      {tab === 'overview' && (
        <>
          <ScaleNote total={events.total} />
          <DataTable
            key="bf"
            spec={eventSpec}
            data={events}
            permission="risk.bruteforce.read"
            exportName="bruteforce attempts"
            rowActions={(row) =>
              row.status === 'blocked' ? (
                <Button size="sm" variant="ghost" disabled={!canUnblock} onClick={() => setUnblock(row)}>
                  <Unlock className="h-3.5 w-3.5" /> Unblock
                </Button>
              ) : null
            }
            bulkActions={[
              {
                label: 'Add to IP blacklist',
                permission: 'risk.blacklist.write',
                tier: 'T2',
                onRun: (rows) => {
                  logAudit({ action: 'risk.blacklist.write', resource: 'ip_blacklist', resourceId: `${rows.length} IPs`, after: { added: rows.map((r) => r.ip) }, reason: 'Escalated from bruteforce overview', ticket: 'ZD-448600' })
                  addToast({ kind: 'success', title: `${rows.length} IPs blacklisted`, body: 'Visible under Risk & Abuse → IP Blacklist.', href: '/risk/ip-blacklist', hrefLabel: 'IP Blacklist' })
                },
              },
            ]}
          />
        </>
      )}

      {tab === 'activation' && (
        <>
          <Callout tone="info" title="Most specific scope wins">
            A reseller rule overrides its plan, and a plan rule overrides the platform default — the same hierarchy as rate limits. Turning
            protection off for a scope is a T2 change with a reason, because it is exactly what an attacker would want done.
          </Callout>
          <DataTable
            key="bfr"
            spec={ruleSpec}
            data={rules}
            permission="risk.bruteforce.read"
            exportName="bruteforce rules"
            rowActions={(row) => (
              <Button
                size="sm"
                variant="ghost"
                disabled={!canWrite}
                onClick={() => {
                  setRuleEdit(row)
                  setDraft({ enabled: row.enabled, threshold: String(row.thresholdAttempts), lockout: String(row.lockoutMinutes), captcha: String(row.captchaAfter) })
                }}
              >
                Edit
              </Button>
            )}
          />
        </>
      )}

      {tab === 'changes' && (
        <>
          {weakened > 0 && (
            <Callout tone="warn" icon={<AlertTriangle className="h-4 w-4" />} title={`${weakened} recent changes weakened protection`}>
              Raising a threshold, disabling a rule or switching CAPTCHA off are the changes worth a second look — they are marked below.
              Each one links to its audit entry with the actor, reason and ticket.
            </Callout>
          )}
          <Card>
            <CardHeader
              title="Last-minute changes"
              subtitle="Recent edits to bruteforce protection, newest first"
              actions={<Link to="/system/audit?f=%7B%22action%22%3A%22risk.bruteforce%22%7D" className="text-2xs text-brand-700 hover:underline">Open in audit log</Link>}
            />
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-4 py-2 text-left">When</th>
                    <th className="px-4 py-2 text-left">Actor</th>
                    <th className="px-4 py-2 text-left">Scope</th>
                    <th className="px-4 py-2 text-left">Change</th>
                    <th className="px-4 py-2 text-left">Reason</th>
                    <th className="px-4 py-2 text-left">Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.id} className={c.riskNote ? 'border-t border-ink-100 bg-amber-50/50' : 'border-t border-ink-100'}>
                      <td className="px-4 py-2 text-xs">{c.at}</td>
                      <td className="px-4 py-2 text-xs">
                        <span className="font-medium text-ink-900">{c.actor}</span>
                        <span className="block text-2xs text-ink-500">{c.role}</span>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {c.scopeTarget}
                        <span className="block text-2xs text-ink-500">{c.target.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <code className="font-mono text-2xs">{c.field}</code>{' '}
                        <span className="text-ink-500">{c.before}</span> → <span className="font-medium">{c.after}</span>
                        {c.riskNote && <span className="mt-0.5 block text-2xs text-amber-800">{c.riskNote}</span>}
                      </td>
                      <td className="px-4 py-2 text-2xs text-ink-600">{c.reason}</td>
                      <td className="px-4 py-2 font-mono text-2xs">{c.ticket}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {unblock && (
        <T2Confirm
          open
          onClose={() => setUnblock(null)}
          title={`Unblock ${unblock.ip}`}
          permission="risk.bruteforce.unblock"
          cta="Unblock now"
          description={
            <>
              {unblock.ip} made {num(unblock.attempts)} attempts against {unblock.distinctAccounts} account(s) on{' '}
              {unblock.target.replace(/_/g, ' ')}. Unblocking lets it authenticate again immediately — do this only when you know the
              traffic is the reseller&apos;s own integration.
            </>
          }
          onConfirm={({ reason, ticket }) => {
            mutate('bruteforce_events', unblock.id, { status: 'allowlisted', blockedUntil: null })
            logAudit({ action: 'risk.bruteforce.unblock', resource: 'bruteforce_event', resourceId: unblock.id, before: { status: 'blocked' }, after: { status: 'allowlisted' }, reason, ticket })
            addToast({ kind: 'success', title: `${unblock.ip} unblocked` })
            setUnblock(null)
          }}
        />
      )}

      <Drawer
        open={Boolean(ruleEdit)}
        onClose={() => setRuleEdit(null)}
        title={ruleEdit ? `${ruleEdit.target.replace(/_/g, ' ')} — ${ruleEdit.scopeTarget}` : ''}
        subtitle="Bruteforce protection"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRuleEdit(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => setConfirmRule(true)}>Review change</Button>
          </>
        }
      >
        {ruleEdit && (
          <div className="space-y-4">
            <FieldGroup title="Current">
              <DetailRow label="Scope" value={`${ruleEdit.scope} · ${ruleEdit.scopeTarget}`} />
              <DetailRow label="Threshold" value={`${ruleEdit.thresholdAttempts} attempts / ${ruleEdit.windowMinutes} min`} />
              <DetailRow label="Lockout" value={`${ruleEdit.lockoutMinutes} min`} />
              <DetailRow label="CAPTCHA after" value={ruleEdit.captchaAfter || 'off'} />
              <DetailRow label="Blocked in 24h" value={num(ruleEdit.blocked24h)} />
              <DetailRow label="Notify" value={ruleEdit.notifyReseller ? ruleEdit.notifyChannel : 'no notification'} />
            </FieldGroup>
            <div className="space-y-3">
              <Field label="Protection enabled">
                <Switch checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} label={draft.enabled ? 'Enabled' : 'Disabled'} />
              </Field>
              <Field label="Threshold attempts" required>
                <Input type="number" value={draft.threshold} onChange={(e) => setDraft({ ...draft, threshold: e.target.value })} />
              </Field>
              <Field label="Lockout minutes" required>
                <Input type="number" value={draft.lockout} onChange={(e) => setDraft({ ...draft, lockout: e.target.value })} />
              </Field>
              <Field label="CAPTCHA after attempts" hint="0 disables the CAPTCHA step.">
                <Input type="number" value={draft.captcha} onChange={(e) => setDraft({ ...draft, captcha: e.target.value })} />
              </Field>
            </div>
            {(!draft.enabled || Number(draft.threshold) > ruleEdit.thresholdAttempts * 5) && (
              <Callout tone="danger" title="This weakens protection">
                {!draft.enabled
                  ? 'Disabling protection means failed authentication is never rate-limited for this scope.'
                  : 'The new threshold is far above the current one, so an attacker gets many more attempts before being stopped.'}{' '}
                It will be flagged on the Last-minute changes tab.
              </Callout>
            )}
          </div>
        )}
      </Drawer>

      <T2Confirm
        open={confirmRule}
        onClose={() => setConfirmRule(false)}
        title="Change bruteforce protection"
        permission="risk.bruteforce.write"
        cta="Apply change"
        description={
          ruleEdit ? (
            <>
              {ruleEdit.target.replace(/_/g, ' ')} for {ruleEdit.scopeTarget}: threshold {ruleEdit.thresholdAttempts} →{' '}
              {draft.threshold}, lockout {ruleEdit.lockoutMinutes} → {draft.lockout} min, protection{' '}
              {draft.enabled ? 'enabled' : 'disabled'}.
            </>
          ) : null
        }
        onConfirm={({ reason, ticket }) => {
          if (ruleEdit) {
            mutate('bruteforce_rules', ruleEdit.id, {
              enabled: draft.enabled,
              thresholdAttempts: Number(draft.threshold),
              lockoutMinutes: Number(draft.lockout),
              captchaAfter: Number(draft.captcha),
              updatedBy: 'you',
              updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
            })
            logAudit({
              action: 'risk.bruteforce.write',
              resource: 'bruteforce_rule',
              resourceId: ruleEdit.id,
              before: { enabled: ruleEdit.enabled, threshold: ruleEdit.thresholdAttempts },
              after: { enabled: draft.enabled, threshold: Number(draft.threshold) },
              reason,
              ticket,
            })
            addToast({ kind: 'success', title: 'Protection updated', body: 'Recorded on the Last-minute changes tab.' })
          }
          setConfirmRule(false)
          setRuleEdit(null)
        }}
      />
    </Module>
  )
}

// ─────────────────────────────────────────────────────── IP blacklist

const blacklistSpec: TableSpec<BlacklistEntry> = {
  id: 'ip_blacklist',
  rowId: (b) => b.id,
  defaultSort: { key: 'hits24h', dir: 'desc' },
  search: (b) => `${b.cidr} ${b.reason} ${b.asn} ${b.addedBy} ${b.ticket}`,
  columns: [
    { key: 'cidr', header: 'IP / range', width: 170, mono: true, render: (b) => <span className="font-medium">{b.cidr}</span> },
    { key: 'category', header: 'Category', width: 130, render: (b) => <Badge tone={b.category === 'fraud' ? 'danger' : b.category === 'bruteforce' ? 'warn' : 'neutral'}>{b.category}</Badge> },
    { key: 'scope', header: 'Scope', width: 140, render: (b) => <Badge>{b.scope.replace('_', ' ')}</Badge> },
    { key: 'country', header: 'Country', width: 90 },
    { key: 'asn', header: 'ASN', width: 170 },
    { key: 'hits24h', header: 'Hits 24h', width: 100, align: 'right', render: (b) => (b.hits24h ? <span className="font-medium text-brand-700">{num(b.hits24h)}</span> : '0') },
    { key: 'hitsTotal', header: 'Hits total', width: 110, align: 'right', render: (b) => num(b.hitsTotal) },
    { key: 'reason', header: 'Reason', width: 300 },
    { key: 'expiresAt', header: 'Expires', width: 140, render: (b) => (b.permanent ? <Badge tone="danger">permanent</Badge> : relative(b.expiresAt)) },
    { key: 'addedBy', header: 'Added by', width: 150 },
    { key: 'addedAt', header: 'Added', width: 130, render: (b) => relative(b.addedAt) },
    { key: 'ticket', header: 'Ticket', width: 110, mono: true, optional: true },
  ],
  filters: [
    { key: 'category', label: 'Category', type: 'multiselect', options: ['bruteforce', 'fraud', 'abuse', 'scraping', 'manual'].map((v) => ({ value: v, label: v })) },
    { key: 'scope', label: 'Scope', type: 'multiselect', options: ['platform', 'api', 'control_panel', 'reseller'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'permanent', label: 'Permanent', type: 'boolean' },
    { key: 'hits24h', label: 'Hits (24h)', type: 'numberrange' },
    { key: 'country', label: 'Country', type: 'select', options: COUNTRIES.map(([c, n]) => ({ value: c, label: n })) },
    { key: 'addedAt', label: 'Added', type: 'daterange' },
  ],
}

export function IpBlacklistPage() {
  const ds = ipBlacklist()
  const canWrite = useCan('risk.blacklist.write')
  const [addOpen, setAddOpen] = useState(false)
  const [remove, setRemove] = useState<BlacklistEntry | null>(null)
  const [form, setForm] = useState({ cidr: '', scope: 'platform', category: 'bruteforce', permanent: false, expires: '' })
  const [confirmAdd, setConfirmAdd] = useState(false)
  const softDelete = useStore((s) => s.softDelete)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)

  const stats = useMemo(() => {
    let permanent = 0
    let hits = 0
    let ranges = 0
    for (let i = 0; i < ds.total; i++) {
      const b = ds.at(i)
      if (b._deleted) continue
      if (b.permanent) permanent++
      hits += b.hits24h
      if (b.cidr.includes('/')) ranges++
    }
    return { permanent, hits, ranges }
  }, [ds])

  return (
    <Module permissions={['risk.blacklist.read']} what="the IP blacklist">
      <PageHeader
        title="IP Blacklist"
        subtitle="Blocked addresses and ranges, with the reason and ticket that put them there — so an entry can be judged years later."
        actions={
          <Button variant="primary" disabled={!canWrite} onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add entry
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Entries" value={num(ds.total)} />
        <StatTile label="Permanent" value={num(stats.permanent)} tone="warn" hint="never expire — review periodically" />
        <StatTile label="Ranges (CIDR)" value={num(stats.ranges)} hint="wider blast radius than single IPs" />
        <StatTile label="Blocked requests 24h" value={num(stats.hits)} />
      </div>
      <Callout tone="warn" title="A range is not a free action">
        A /16 blocks 65,536 addresses. Where a reseller shares a hosting provider with an attacker, blocking the range takes the reseller
        offline too — which is why every entry records who added it and why.
      </Callout>
      <DataTable
        spec={blacklistSpec}
        data={ds}
        permission="risk.blacklist.read"
        exportName="IP blacklist"
        rowActions={(row) => (
          <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => setRemove(row)}>
            <X className="h-3.5 w-3.5" /> Remove
          </Button>
        )}
      />

      <Drawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add blacklist entry"
        subtitle="T2 — reason and ticket required"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(form.cidr)}
              onClick={() => setConfirmAdd(true)}
            >
              Review entry
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="IP address or CIDR range" required hint="e.g. 185.42.19.7 or 185.42.19.0/24">
            <Input value={form.cidr} onChange={(e) => setForm({ ...form, cidr: e.target.value })} placeholder="185.42.19.0/24" />
          </Field>
          <Field label="Scope" required>
            <Select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
              <option value="platform">All traffic</option>
              <option value="api">API only</option>
              <option value="control_panel">Control panel only</option>
            </Select>
          </Field>
          <Field label="Category" required>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {['bruteforce', 'fraud', 'abuse', 'scraping', 'manual'].map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Checkbox
            label="Permanent block"
            hint="Leave off and set an expiry — permanent entries accumulate and nobody dares remove them."
            checked={form.permanent}
            onChange={(e) => setForm({ ...form, permanent: e.target.checked })}
          />
          {!form.permanent && (
            <Field label="Expires" required>
              <Input type="date" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} />
            </Field>
          )}
          {form.cidr.includes('/') && Number(form.cidr.split('/')[1]) < 24 && (
            <Callout tone="danger" title="Wide range">
              /{form.cidr.split('/')[1]} covers {num(Math.pow(2, 32 - Number(form.cidr.split('/')[1])))} addresses. Confirm no reseller
              traffic originates there.
            </Callout>
          )}
        </div>
      </Drawer>

      <T2Confirm
        open={confirmAdd}
        onClose={() => setConfirmAdd(false)}
        title={`Blacklist ${form.cidr}`}
        permission="risk.blacklist.write"
        cta="Add to blacklist"
        description={<>Blocks {form.cidr} on {form.scope.replace('_', ' ')}{form.permanent ? ' permanently' : ` until ${form.expires || 'the chosen date'}`}. Legitimate traffic from that address stops immediately.</>}
        onConfirm={({ reason, ticket }) => {
          logAudit({ action: 'risk.blacklist.write', resource: 'ip_blacklist', resourceId: form.cidr, after: { scope: form.scope, category: form.category, permanent: form.permanent }, reason, ticket })
          addToast({ kind: 'success', title: `${form.cidr} blacklisted` })
          setConfirmAdd(false)
          setAddOpen(false)
          setForm({ cidr: '', scope: 'platform', category: 'bruteforce', permanent: false, expires: '' })
        }}
      />

      {remove && (
        <T2Confirm
          open
          onClose={() => setRemove(null)}
          title={`Remove ${remove.cidr} from the blacklist`}
          permission="risk.blacklist.write"
          cta="Remove entry"
          description={
            <>
              Added by {remove.addedBy} {relative(remove.addedAt)} because: {remove.reason}. It has blocked {num(remove.hitsTotal)}{' '}
              requests, {num(remove.hits24h)} in the last 24 hours. Removing it lets that traffic through again.
            </>
          }
          onConfirm={({ reason, ticket }) => {
            softDelete('ip_blacklist', remove.id)
            logAudit({ action: 'risk.blacklist.write', resource: 'ip_blacklist', resourceId: remove.id, before: { blocked: true }, after: { blocked: false }, reason, ticket })
            addToast({ kind: 'success', title: `${remove.cidr} removed` })
            setRemove(null)
          }}
        />
      )}
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Banned keywords

const keywordSpec: TableSpec<BannedKeyword> = {
  id: 'banned_keywords',
  rowId: (k) => k.id,
  defaultSort: { key: 'hits30d', dir: 'desc' },
  search: (k) => `${k.keyword} ${k.category} ${k.note}`,
  columns: [
    { key: 'keyword', header: 'Keyword', width: 190, mono: true, render: (k) => <span className="font-medium">{k.keyword}</span> },
    { key: 'matchType', header: 'Match', width: 110, render: (k) => <Badge>{k.matchType}</Badge> },
    { key: 'appliesTo', header: 'Applies to', width: 150, render: (k) => k.appliesTo.replace(/_/g, ' ') },
    { key: 'action', header: 'Action', width: 150, render: (k) => (
      <Badge tone={k.action === 'block' ? 'danger' : k.action === 'flag_for_review' ? 'warn' : 'neutral'}>{k.action.replace(/_/g, ' ')}</Badge>
    ) },
    { key: 'category', header: 'Category', width: 120 },
    { key: 'hits30d', header: 'Hits 30d', width: 100, align: 'right', render: (k) => num(k.hits30d) },
    { key: 'blocked30d', header: 'Blocked 30d', width: 120, align: 'right', render: (k) => num(k.blocked30d) },
    { key: 'falsePositives30d', header: 'False positives', width: 130, align: 'right', render: (k) => (
      k.falsePositives30d ? <span className="font-medium text-amber-700">{num(k.falsePositives30d)}</span> : '0'
    ) },
    { key: 'active', header: 'Active', width: 90, render: (k) => (k.active ? <Badge tone="success">on</Badge> : <Badge>off</Badge>) },
    { key: 'addedBy', header: 'Added by', width: 130, optional: true },
    { key: 'lastHitAt', header: 'Last hit', width: 130, render: (k) => (k.lastHitAt ? relative(k.lastHitAt) : '—') },
  ],
  filters: [
    { key: 'category', label: 'Category', type: 'multiselect', options: ['trademark', 'adult', 'pharma', 'financial', 'malware', 'sanctions', 'internal'].map((v) => ({ value: v, label: v })) },
    { key: 'action', label: 'Action', type: 'multiselect', options: ['block', 'flag_for_review', 'notify_only'].map((v) => ({ value: v, label: v.replace(/_/g, ' ') })) },
    { key: 'matchType', label: 'Match type', type: 'select', options: ['exact', 'substring', 'regex'].map((v) => ({ value: v, label: v })) },
    { key: 'active', label: 'Active', type: 'boolean' },
    { key: 'falsePositives30d', label: 'False positives', type: 'numberrange' },
  ],
}

export function BannedKeywordsPage() {
  const ds = bannedKeywords()
  const canWrite = useCan('risk.keywords.write')
  const [open, setOpen] = useState<BannedKeyword | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)
  const hits = useMemo(() => (open ? keywordHits(open.keyword) : []), [open])

  const totals = useMemo(() => {
    let blocked = 0
    let fp = 0
    for (let i = 0; i < ds.total; i++) {
      const k = ds.at(i)
      if (k._deleted) continue
      blocked += k.blocked30d
      fp += k.falsePositives30d
    }
    return { blocked, fp }
  }, [ds])

  return (
    <Module permissions={['risk.keywords.read']} what="banned keywords">
      <PageHeader
        title="Banned Keywords"
        subtitle="Terms that block or flag a registration. Each rule shows what it caught and how often it was wrong, because a keyword nobody measures becomes a silent outage for legitimate customers."
        actions={
          <Button variant="primary" disabled={!canWrite} onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add keyword
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Rules" value={num(ds.total)} />
        <StatTile label="Blocked in 30 days" value={num(totals.blocked)} tone="warn" />
        <StatTile label="False positives" value={num(totals.fp)} tone={totals.fp ? 'danger' : 'success'} hint="legitimate names refused" />
      </div>
      <DataTable
        spec={keywordSpec}
        data={ds}
        permission="risk.keywords.read"
        exportName="banned keywords"
        onRowClick={(row) => setOpen(row)}
        rowActions={(row) => (
          <Button size="sm" variant="ghost" onClick={() => setOpen(row)}>Hits</Button>
        )}
      />

      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title={open?.keyword ?? ''} subtitle="Recent matches" width="md">
        {open && (
          <div className="space-y-4">
            <FieldGroup title="Rule">
              <DetailRow label="Match type" value={open.matchType} />
              <DetailRow label="Applies to" value={open.appliesTo.replace(/_/g, ' ')} />
              <DetailRow label="Action" value={open.action.replace(/_/g, ' ')} />
              <DetailRow label="Category" value={open.category} />
              <DetailRow label="Case sensitive" value={open.caseSensitive ? 'Yes' : 'No'} />
              <DetailRow label="Added" value={`${open.addedBy} · ${shortDate(open.addedAt)}`} />
              <DetailRow label="Note" value={open.note} />
            </FieldGroup>
            {open.falsePositives30d > 0 && (
              <Callout tone="warn" title={`${open.falsePositives30d} false positives in 30 days`}>
                Consider moving this rule from block to flag-for-review, or tightening the match type from substring to exact.
              </Callout>
            )}
            <Card>
              <CardHeader title="Recent hits" subtitle={`${hits.length} most recent`} />
              <ul className="divide-y divide-ink-100">
                {hits.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-ink-800">{h.candidate}</p>
                      <p className="text-2xs text-ink-500">reseller {h.resellerId} · {relative(h.at)}</p>
                    </div>
                    <Badge tone={h.outcome === 'blocked' ? 'danger' : h.outcome === 'pending_review' ? 'warn' : 'success'}>
                      {h.outcome.replace(/_/g, ' ')}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </Drawer>

      <Drawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add banned keyword"
        subtitle="T2 — blocks registrations for every reseller"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                logAudit({ action: 'risk.keywords.write', resource: 'banned_keyword', resourceId: 'new', after: { created: true }, reason: 'Added from Banned Keywords', ticket: 'ZD-448700' })
                addToast({ kind: 'success', title: 'Keyword added', body: 'Applies to new registrations from now on; existing domains are unaffected.' })
                setAddOpen(false)
              }}
            >
              Add keyword
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Keyword or pattern" required><Input placeholder="paypa1" /></Field>
          <Field label="Match type" required>
            <Select><option>substring</option><option>exact</option><option>regex</option></Select>
          </Field>
          <Field label="Applies to" required>
            <Select><option>domain_name</option><option>company_name</option><option>contact_name</option><option>email</option><option>all</option></Select>
          </Field>
          <Field label="Action" required hint="Start with flag-for-review unless the term is unambiguous.">
            <Select><option>flag_for_review</option><option>block</option><option>notify_only</option></Select>
          </Field>
          <Field label="Category" required>
            <Select>{['trademark', 'adult', 'pharma', 'financial', 'malware', 'sanctions', 'internal'].map((c) => <option key={c}>{c}</option>)}</Select>
          </Field>
          <Field label="Note" hint="Why this exists — the next person needs it."><Textarea rows={2} className="font-sans text-sm" /></Field>
        </div>
      </Drawer>
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Batch cracker

const batchSpec: TableSpec<StuckBatch> = {
  id: 'stuck_batches',
  rowId: (b) => b.id,
  defaultSort: { key: 'stuckSince', dir: 'asc' },
  search: (b) => `${b.id} ${b.kind} ${b.company} ${b.lastError} ${b.provider}`,
  columns: [
    { key: 'id', header: 'Batch', width: 120, mono: true, render: (b) => <span className="font-medium">{b.id}</span> },
    { key: 'kind', header: 'Kind', width: 200, mono: true },
    { key: 'stage', header: 'Stuck in', width: 140, render: (b) => <Badge tone="warn">{b.stage.replace(/_/g, ' ')}</Badge> },
    { key: 'company', header: 'Reseller', width: 190, render: (b) => <Link to={`/customers/resellers/${b.resellerId}`} className="hover:text-brand-700 hover:underline">{b.company}</Link> },
    { key: 'progress', header: 'Progress', width: 170, sortable: false, render: (b) => (
      <div className="flex items-center gap-2">
        <Progress value={(b.processed / Math.max(1, b.rows)) * 100} tone={b.failed ? 'danger' : 'brand'} />
        <span className="w-24 text-right text-2xs tabular text-ink-500">{num(b.processed)}/{num(b.rows)}</span>
      </div>
    ) },
    { key: 'failed', header: 'Failed', width: 90, align: 'right', render: (b) => (b.failed ? <span className="font-medium text-brand-700">{num(b.failed)}</span> : '0') },
    { key: 'chunkSize', header: 'Chunk', width: 90, align: 'right' },
    { key: 'retries', header: 'Retries', width: 90, align: 'right' },
    { key: 'blocking', header: 'Blocking', width: 100, render: (b) => (b.blocking ? <Badge tone="danger">queue</Badge> : '—') },
    { key: 'lastError', header: 'Last error', width: 320 },
    { key: 'stuckSince', header: 'Stuck since', width: 140, render: (b) => relative(b.stuckSince) },
    { key: 'provider', header: 'Provider', width: 120, optional: true },
  ],
  filters: [
    { key: 'stage', label: 'Stage', type: 'multiselect', options: ['parsing', 'validating', 'registry_calls', 'invoicing', 'finalising'].map((v) => ({ value: v, label: v.replace(/_/g, ' ') })) },
    { key: 'blocking', label: 'Blocking the queue', type: 'boolean' },
    { key: 'failed', label: 'Failed rows', type: 'numberrange' },
    { key: 'provider', label: 'Provider', type: 'select', options: ['SIDN', 'DENIC', 'Verisign', 'EURid', 'Nominet', 'Plesk', 'cPanel'].map((v) => ({ value: v, label: v })) },
  ],
}

export function BatchCrackerPage() {
  const ds = stuckBatches()
  const [selected, setSelected] = useState<StuckBatch | null>(null)
  const [action, setAction] = useState<null | 'split' | 'replay' | 'resume'>(null)
  const canRepair = useCan('risk.batch.repair')
  const mutate = useStore((s) => s.mutate)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)
  const createJob = useStore((s) => s.createJob)
  const [chunk, setChunk] = useState('50')

  const stats = useMemo(() => {
    let blocking = 0
    let rows = 0
    let failed = 0
    for (let i = 0; i < ds.total; i++) {
      const b = ds.at(i)
      if (b._deleted) continue
      if (b.blocking) blocking++
      rows += b.rows - b.processed
      failed += b.failed
    }
    return { blocking, rows, failed }
  }, [ds])

  const COPY = {
    split: {
      title: 'Split into smaller chunks',
      body: `Re-queues the unprocessed rows in chunks of ${chunk} instead of ${selected?.chunkSize}. Smaller chunks survive registry timeouts, at the cost of more round trips.`,
      cta: 'Split and re-queue',
    },
    replay: {
      title: 'Replay failed rows only',
      body: `Re-runs the ${num(selected?.failed ?? 0)} failed rows and leaves everything already processed alone. Safe to run more than once — rows are idempotent by batch id.`,
      cta: 'Replay failed rows',
    },
    resume: {
      title: 'Resume from the last committed chunk',
      body: 'Picks up where the worker died. Rows still marked "processing" are released first, so nothing is submitted to the registry twice.',
      cta: 'Resume batch',
    },
  }

  return (
    <Module permissions={['risk.batch.read']} what="the batch cracker">
      <PageHeader
        title="Batch Cracker"
        subtitle="Bulk batches that stopped making progress — split them into smaller chunks, replay just the failed rows, or resume where the worker died."
      />
      <Callout tone="info" title="What this tool assumes">
        A stuck batch is one whose worker stopped committing chunks: a registry timeout, a rate limit, or a row that poisons its chunk.
        The three repairs below are non-destructive; abandoning a batch is the only Tier 3 action here.
      </Callout>
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Stuck batches" value={num(ds.total)} tone="warn" />
        <StatTile label="Blocking the queue" value={num(stats.blocking)} tone="danger" hint="holding up other work" />
        <StatTile label="Rows waiting" value={num(stats.rows)} />
        <StatTile label="Failed rows" value={num(stats.failed)} tone={stats.failed ? 'danger' : 'success'} />
      </div>
      <DataTable
        spec={batchSpec}
        data={ds}
        permission="risk.batch.read"
        exportName="stuck batches"
        onRowClick={(row) => setSelected(row)}
        rowActions={(row) => (
          <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>Inspect</Button>
        )}
      />

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        width="lg"
        title={selected ? `${selected.id} — ${selected.kind}` : ''}
        subtitle={selected ? `${selected.company} · stuck ${relative(selected.stuckSince)}` : ''}
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <StatTile label="Rows" value={num(selected.rows)} />
              <StatTile label="Processed" value={num(selected.processed)} tone="success" />
              <StatTile label="Failed" value={num(selected.failed)} tone={selected.failed ? 'danger' : 'neutral'} />
            </div>
            <FieldGroup title="Batch">
              <DetailRow label="Kind" value={<code className="font-mono text-2xs">{selected.kind}</code>} />
              <DetailRow label="Stage" value={selected.stage.replace(/_/g, ' ')} />
              <DetailRow label="Chunk size" value={selected.chunkSize} />
              <DetailRow label="Retries" value={selected.retries} />
              <DetailRow label="Provider" value={selected.provider} />
              <DetailRow label="Submitted" value={relative(selected.submittedAt)} />
              <DetailRow label="Blocking the queue" value={selected.blocking ? 'Yes' : 'No'} />
            </FieldGroup>
            <Callout tone="danger" title="Last error">
              <code className="font-mono text-2xs">{selected.lastError}</code>
            </Callout>

            <Card>
              <CardHeader title="Repairs" subtitle="Non-destructive — T2 with a reason and ticket" />
              <div className="space-y-3 p-4">
                <Field label="New chunk size" hint="Used by the split repair.">
                  <Input type="number" value={chunk} onChange={(e) => setChunk(e.target.value)} className="max-w-[140px]" />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={!canRepair} onClick={() => setAction('split')}>
                    <Split className="h-3.5 w-3.5" /> Split into chunks of {chunk}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!canRepair || !selected.failed} onClick={() => setAction('replay')}>
                    <RefreshCw className="h-3.5 w-3.5" /> Replay {num(selected.failed)} failed rows
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!canRepair} onClick={() => setAction('resume')}>
                    <Check className="h-3.5 w-3.5" /> Resume from last chunk
                  </Button>
                </div>
              </div>
            </Card>

            <DangerZone
              title="Danger zone — this batch"
              items={[
                {
                  title: 'Abandon batch',
                  description: 'Stops the batch and discards its unprocessed rows.',
                  consequences: [
                    `${num(selected.rows - selected.processed)} unprocessed rows are discarded and never submitted.`,
                    'Rows already processed stay processed — the batch ends half-applied.',
                    'The reseller sees a partially completed bulk request and must re-submit the remainder.',
                  ],
                  reversible: 'The row list is kept in the job report, so the remainder can be re-submitted as a new batch.',
                  permission: 'risk.batch.abandon',
                  tier: 'T3',
                  confirmValue: selected.id,
                  cta: 'Abandon batch',
                  dryRun: () => ({
                    summary: `${selected.id} would be abandoned in stage ${selected.stage}.`,
                    willChange: [
                      { label: 'Rows discarded', count: selected.rows - selected.processed, tone: 'danger' },
                      { label: 'Rows already applied', count: selected.processed, tone: 'warn' },
                      { label: 'Rows failed', count: selected.failed, tone: 'warn' },
                    ],
                    notes: ['The remainder is written to the job report so it can be re-submitted.'],
                  }),
                  onExecute: ({ reason, ticket }) => {
                    logAudit({ action: 'risk.batch.abandon', resource: 'stuck_batch', resourceId: selected.id, after: { abandoned: true, discarded: selected.rows - selected.processed }, reason, ticket })
                    addToast({ kind: 'warn', title: `${selected.id} abandoned`, body: 'Remainder written to the job report.' })
                    setSelected(null)
                  },
                },
              ]}
            />
          </div>
        )}
      </Drawer>

      {action && selected && (
        <T2Confirm
          open
          onClose={() => setAction(null)}
          title={COPY[action].title}
          permission="risk.batch.repair"
          cta={COPY[action].cta}
          description={<>{COPY[action].body}</>}
          onConfirm={({ reason, ticket }) => {
            const job = createJob({
              kind: `batch_${action}`,
              label: `${COPY[action].title} — ${selected.id}`,
              status: 'running',
              owner: '',
              total: action === 'replay' ? selected.failed : selected.rows - selected.processed,
              dryRun: false,
              cancellable: true,
              resultCsv: null,
              reason,
              ticket,
              approver: null,
              tier: 'T2',
            })
            if (action === 'split') mutate('stuck_batches', selected.id, { chunkSize: Number(chunk), retries: selected.retries + 1 })
            logAudit({ action: 'risk.batch.repair', resource: 'stuck_batch', resourceId: selected.id, after: { repair: action, job: job.id }, reason, ticket })
            addToast({ kind: 'success', title: COPY[action].title, body: `${job.id} queued — follow it in the job centre.`, href: '/system/jobs', hrefLabel: 'Job centre' })
            setAction(null)
          }}
        />
      )}
    </Module>
  )
}
