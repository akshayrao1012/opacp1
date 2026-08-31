import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, Download, Flag, Gauge, RefreshCw, Trash2 } from 'lucide-react'
import { DataTable, ScaleNote } from '../components/patterns/DataTable'
import { Module, PageHeader, TabBar, useTab } from '../components/patterns/Page'
import { T2Confirm } from '../components/patterns/Destructive'
import {
  Badge, Button, Callout, DefinitionList, Drawer, Field, Input, Progress,
  Select, StatTile, StatusBadge, Switch, Textarea, Tooltip,
} from '../components/ui'
import { useCan, useStore } from '../lib/store'
import { num, pct, relative, dateTime, shortDate } from '../lib/format'
import type { TableSpec } from '../lib/table'
import { MEMBERSHIPS } from '../lib/mock/resellers'
import {
  customSettings, mailMessages, mailVerifications, rateLimits, tasks, TASK_STATS, TASK_TYPES,
  type CustomSetting, type MailMessage, type MailVerification, type RateLimit, type Task,
} from '../lib/mock/ops'

// ─────────────────────────────────────────────────────── Task manager

const taskSpec: TableSpec<Task> = {
  id: 'tasks',
  rowId: (t) => t.id,
  defaultSort: { key: 'createdAt', dir: 'desc' },
  pageSizes: [25, 50, 100, 250],
  search: (t) => `${t.id} ${t.type} ${t.subject} ${t.resellerId} ${t.error ?? ''}`,
  columns: [
    { key: 'id', header: 'Task', width: 140, mono: true },
    { key: 'type', header: 'Type', width: 180, mono: true, render: (t) => <span className="font-medium text-ink-900">{t.type}</span> },
    { key: 'status', header: 'Status', width: 110, render: (t) => <StatusBadge status={t.status} /> },
    { key: 'subject', header: 'Subject', width: 200 },
    { key: 'resellerId', header: 'Reseller', width: 100, mono: true, render: (t) => <Link to={`/customers/resellers/${t.resellerId}`} className="hover:text-brand-700 hover:underline">{t.resellerId}</Link> },
    { key: 'attempts', header: 'Attempts', width: 90, align: 'right' },
    { key: 'durationMs', header: 'Duration', width: 100, align: 'right', render: (t) => (t.durationMs ? `${(t.durationMs / 1000).toFixed(1)}s` : '—') },
    { key: 'error', header: 'Error', render: (t) => t.error ?? '—' },
    { key: 'worker', header: 'Worker', width: 110, optional: true },
    { key: 'priority', header: 'Priority', width: 90, optional: true },
    { key: 'ageDays', header: 'Age', width: 80, align: 'right', render: (t) => `${num(t.ageDays)}d` },
    { key: 'createdAt', header: 'Created', width: 160, render: (t) => dateTime(t.createdAt) },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['queued', 'running', 'completed', 'failed', 'outdated', 'cancelled'].map((v) => ({ value: v, label: v })) },
    { key: 'type', label: 'Type', type: 'select', options: TASK_TYPES.map((t) => ({ value: t, label: t })) },
    { key: 'ageDays', label: 'Age (days)', type: 'numberrange' },
    { key: 'attempts', label: 'Attempts', type: 'numberrange' },
    { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'normal', 'high'].map((v) => ({ value: v, label: v })) },
    { key: 'resellerId', label: 'Reseller ID', type: 'text' },
    { key: 'worker', label: 'Worker', type: 'text', placeholder: 'worker-04' },
  ],
}

export function TasksPage() {
  const [tab, setTab] = useTab('live')
  const ds = tasks()
  const navigate = useNavigate()
  const canPurge = useCan('ops.task.purge')
  const canWrite = useCan('ops.task.write')
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)

  const spec: TableSpec<Task> = {
    ...taskSpec,
    id: `tasks_${tab}`,
    defaultFilters:
      tab === 'live' ? { status: ['queued', 'running', 'completed'] }
      : tab === 'errors' ? { status: ['failed'] }
      : { status: ['outdated'] },
  }

  return (
    <Module permissions={['ops.task.read']} what="the task manager">
      <PageHeader
        title="Task manager"
        subtitle="465,980 entries, of which 182,003 are outdated. Overview and Errors were separate navigation entries; the backlog now has a name, a size and a cleanup path."
        actions={
          <Button variant="secondary" disabled={!canPurge} onClick={() => navigate('/system/bulk?op=task_purge')}>
            <Trash2 className="h-3.5 w-3.5" /> Purge outdated
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Total entries" value={num(TASK_STATS.total)} />
        <StatTile label="Outdated" value={num(TASK_STATS.outdated)} tone="warn" hint={`${pct((TASK_STATS.outdated / TASK_STATS.total) * 100, 1)} of the table`} />
        <StatTile label="Failed (30d)" value={num(24_180)} tone="danger" hint="see Errors tab" />
        <StatTile label="Queue depth" value={num(3_942)} hint="queued + running" />
      </div>

      <Callout tone="warn" icon={<AlertTriangle className="h-4 w-4" />} title="Open decision Q9 — the outdated backlog">
        182,003 rows marked outdated make every query slower and hide the failures that matter. The purge operation writes rows to cold
        storage for 90 days first, so it is recoverable — but it is still Tier 3 and needs a second approver.
      </Callout>

      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'live', label: 'Live queue' },
          { id: 'errors', label: 'Errors' },
          { id: 'outdated', label: 'Outdated backlog' },
        ]}
      />
      <ScaleNote total={ds.total} />
      <DataTable
        key={tab}
        spec={spec}
        data={ds}
        permission="ops.task.read"
        exportName="tasks"
        bulkActions={[
          {
            label: 'Retry',
            permission: 'ops.task.write',
            tier: 'T1',
            onRun: (rows) => {
              logAudit({ action: 'ops.task.write', resource: 'task_batch', resourceId: `${rows.length} tasks`, after: { retried: rows.length } })
              addToast({ kind: 'success', title: `${rows.length} tasks re-queued` })
            },
          },
          {
            label: 'Cancel',
            permission: 'ops.task.write',
            tier: 'T1',
            onRun: (rows) => {
              logAudit({ action: 'ops.task.write', resource: 'task_batch', resourceId: `${rows.length} tasks`, after: { cancelled: rows.length } })
              addToast({ kind: 'info', title: `${rows.length} tasks cancelled` })
            },
          },
        ]}
        rowActions={(row) =>
          row.status === 'failed' ? (
            <Tooltip content="Retry this task">
              <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => addToast({ kind: 'success', title: `${row.id} re-queued` })}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          ) : null
        }
      />
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Mail

const mailSpec: TableSpec<MailMessage> = {
  id: 'mail',
  rowId: (m) => m.id,
  defaultSort: { key: 'sentAt', dir: 'desc' },
  search: (m) => `${m.id} ${m.subject} ${m.toAddress} ${m.template} ${m.resellerId}`,
  columns: [
    { key: 'sentAt', header: 'Sent', width: 160, render: (m) => dateTime(m.sentAt) },
    { key: 'subject', header: 'Subject', render: (m) => <span className="font-medium">{m.subject}</span> },
    { key: 'toAddress', header: 'To', width: 240 },
    { key: 'status', header: 'Status', width: 110, render: (m) => <StatusBadge status={m.status} /> },
    { key: 'type', header: 'Type', width: 120, render: (m) => <Badge>{m.type}</Badge> },
    { key: 'template', header: 'Template', width: 190, mono: true },
    { key: 'provider', header: 'Provider', width: 110 },
    { key: 'resellerId', header: 'Reseller', width: 100, mono: true, render: (m) => <Link to={`/customers/resellers/${m.resellerId}`} className="hover:text-brand-700 hover:underline">{m.resellerId}</Link> },
    { key: 'opens', header: 'Opens', width: 80, align: 'right' },
    { key: 'bounceReason', header: 'Bounce reason', render: (m) => m.bounceReason ?? '—' },
    { key: 'sizeKb', header: 'Size', width: 80, align: 'right', optional: true, render: (m) => `${m.sizeKb} KB` },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['delivered', 'opened', 'sent', 'bounced', 'deferred', 'spam'].map((v) => ({ value: v, label: v })) },
    { key: 'type', label: 'Type', type: 'multiselect', options: ['transactional', 'notification', 'invoice', 'system', 'marketing'].map((v) => ({ value: v, label: v })) },
    { key: 'template', label: 'Template', type: 'text' },
    { key: 'provider', label: 'Provider', type: 'select', options: ['Mailjet', 'SES', 'SMTP relay'].map((v) => ({ value: v, label: v })) },
    { key: 'sentAt', label: 'Sent', type: 'daterange' },
    { key: 'resellerId', label: 'Reseller ID', type: 'text' },
  ],
}

const verificationSpec: TableSpec<MailVerification> = {
  id: 'mail_verifications',
  rowId: (v) => v.id,
  defaultSort: { key: 'requestedAt', dir: 'desc' },
  search: (v) => `${v.id} ${v.email} ${v.handle} ${v.resellerId}`,
  columns: [
    { key: 'email', header: 'Email', render: (v) => <span className="font-medium">{v.email}</span> },
    { key: 'handle', header: 'Handle', width: 120, mono: true },
    { key: 'purpose', header: 'Purpose', width: 200, render: (v) => <Badge>{v.purpose.replace(/_/g, ' ')}</Badge> },
    { key: 'status', header: 'Status', width: 110, render: (v) => <StatusBadge status={v.status} /> },
    { key: 'registry', header: 'Registry', width: 100 },
    { key: 'suspensionRisk', header: 'Suspension risk', width: 130, render: (v) => (v.suspensionRisk ? <Badge tone="danger">at risk</Badge> : '—') },
    { key: 'remindersSent', header: 'Reminders', width: 100, align: 'right' },
    { key: 'expiresAt', header: 'Expires', width: 110, render: (v) => shortDate(v.expiresAt) },
    { key: 'requestedAt', header: 'Requested', width: 140, render: (v) => relative(v.requestedAt) },
    { key: 'verifiedAt', header: 'Verified', width: 140, optional: true, render: (v) => (v.verifiedAt ? relative(v.verifiedAt) : '—') },
    { key: 'resellerId', header: 'Reseller', width: 100, mono: true, optional: true },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['verified', 'pending', 'expired', 'bounced'].map((v) => ({ value: v, label: v })) },
    { key: 'purpose', label: 'Purpose', type: 'select', options: ['registrant_verification', 'reseller_signup', 'contact_change', 'abuse_contact'].map((v) => ({ value: v, label: v.replace(/_/g, ' ') })) },
    { key: 'suspensionRisk', label: 'Suspension risk', type: 'boolean' },
    { key: 'registry', label: 'Registry', type: 'select', options: ['ICANN', 'SIDN', 'Nominet', 'EURid', 'DENIC'].map((v) => ({ value: v, label: v })) },
    { key: 'requestedAt', label: 'Requested', type: 'daterange' },
  ],
}

export function MailPage() {
  const [tab, setTab] = useTab('overview')
  const mailDs = mailMessages()
  const verifDs = mailVerifications()

  return (
    <Module permissions={['ops.mail.read']} what="the mail log">
      <PageHeader
        title="Mail"
        subtitle="Overview and Verification are tabs, as the inventory itself asked for. Export exists — it was requested on this page and no page in the old ACP had it."
      />
      <Callout tone="success" icon={<Download className="h-4 w-4" />} title="Table download, as requested in the inventory">
        Both tabs export to CSV honouring the active filters, as an async job above 10,000 rows.
      </Callout>
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview', count: mailDs.total },
          { id: 'verification', label: 'Verification', count: verifDs.total },
        ]}
      />
      {tab === 'overview' ? (
        <>
          <ScaleNote total={mailDs.total} />
          <DataTable key="m" spec={mailSpec} data={mailDs} permission="ops.mail.read" exportName="mail log" />
        </>
      ) : (
        <DataTable key="v" spec={verificationSpec} data={verifDs} permission="ops.mail.read" exportName="mail verifications" />
      )}
      <p className="text-2xs text-ink-400">Mail is read-only in the ACP, as recorded in the inventory&apos;s Access column.</p>
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Custom settings

const settingSpec: TableSpec<CustomSetting> = {
  id: 'custom_settings',
  rowId: (s) => s.id,
  defaultSort: { key: 'key', dir: 'asc' },
  search: (s) => `${s.key} ${s.scopeTarget} ${s.description} ${s.reason}`,
  columns: [
    { key: 'key', header: 'Setting', width: 220, mono: true, render: (s) => <span className="font-medium text-ink-900">{s.key}</span> },
    { key: 'scope', header: 'Scope', width: 110, render: (s) => <Badge tone={s.scope === 'global' ? 'purple' : s.scope === 'membership' ? 'info' : 'neutral'}>{s.scope}</Badge> },
    { key: 'scopeTarget', header: 'Applies to', width: 220 },
    { key: 'value', header: 'Value', width: 150, mono: true },
    { key: 'valueType', header: 'Type', width: 90 },
    { key: 'risk', header: 'Risk', width: 90, render: (s) => <Badge tone={s.risk === 'high' ? 'danger' : s.risk === 'medium' ? 'warn' : 'neutral'}>{s.risk}</Badge> },
    { key: 'affectsResellers', header: 'Resellers affected', width: 140, align: 'right', render: (s) => num(s.affectsResellers) },
    { key: 'overridesGlobal', header: 'Overrides global', width: 130, render: (s) => (s.overridesGlobal ? 'Yes' : '—') },
    { key: 'reason', header: 'Reason', width: 220 },
    { key: 'updatedBy', header: 'Updated by', width: 140 },
    { key: 'updatedAt', header: 'Updated', width: 130, render: (s) => relative(s.updatedAt) },
    { key: 'createdBy', header: 'Created by', width: 140, optional: true },
    { key: 'createdAt', header: 'Created', width: 110, optional: true, render: (s) => shortDate(s.createdAt) },
  ],
  filters: [
    { key: 'scope', label: 'Scope', type: 'multiselect', options: ['global', 'membership', 'reseller'].map((v) => ({ value: v, label: v })) },
    { key: 'risk', label: 'Risk', type: 'multiselect', options: ['low', 'medium', 'high'].map((v) => ({ value: v, label: v })) },
    { key: 'valueType', label: 'Value type', type: 'select', options: ['boolean', 'number', 'string', 'json'].map((v) => ({ value: v, label: v })) },
    { key: 'key', label: 'Setting key', type: 'text' },
    { key: 'overridesGlobal', label: 'Overrides global', type: 'boolean' },
    { key: 'affectsResellers', label: 'Resellers affected', type: 'numberrange' },
  ],
}

export function CustomSettingsPage() {
  const ds = customSettings()
  const [edit, setEdit] = useState<CustomSetting | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [value, setValue] = useState('')
  const [confirm, setConfirm] = useState(false)
  const mutate = useStore((s) => s.mutate)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)
  const canWrite = useCan('ops.settings.write')

  const highRisk = useMemo(() => {
    let n = 0
    for (let i = 0; i < ds.total; i++) if (!ds.at(i)._deleted && ds.at(i).risk === 'high') n++
    return n
  }, [ds])

  return (
    <Module permissions={['ops.settings.read']} what="custom settings">
      <PageHeader
        title="Custom settings"
        subtitle="Treated as what it is: the platform's feature-flag surface. Each row shows its scope, what it overrides, and how many resellers it affects."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Settings" value={num(ds.total)} icon={<Flag className="h-4 w-4" />} />
        <StatTile label="High risk" value={num(highRisk)} tone="danger" hint="changing these affects billing or compliance" />
        <StatTile label="Scopes" value="global · membership · reseller" />
      </div>
      <Callout tone="info" title="Effective value resolution">
        The most specific scope wins: reseller overrides membership, membership overrides global. A row that is shadowed says so, so you
        never change a value that has no effect.
      </Callout>
      <DataTable
        spec={settingSpec}
        data={ds}
        permission="ops.settings.read"
        exportName="custom settings"
        create={{ label: 'New setting', permission: 'ops.settings.write', onClick: () => setNewOpen(true) }}
        rowActions={(row) => (
          <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => { setEdit(row); setValue(row.value) }}>
            Edit value
          </Button>
        )}
      />

      <Drawer
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title={edit?.key ?? ''}
        subtitle={`${edit?.scope} · ${edit?.scopeTarget}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button variant="primary" disabled={value === edit?.value} onClick={() => setConfirm(true)}>Review change</Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-4">
            <DefinitionList
              items={[
                { label: 'Description', value: edit.description, span: true },
                { label: 'Type', value: edit.valueType },
                { label: 'Risk', value: edit.risk },
                { label: 'Resellers affected', value: num(edit.affectsResellers) },
                { label: 'Overrides global', value: edit.overridesGlobal ? 'Yes' : 'No' },
                { label: 'Created by', value: `${edit.createdBy} · ${shortDate(edit.createdAt)}` },
                { label: 'Last updated', value: `${edit.updatedBy} · ${relative(edit.updatedAt)}` },
                { label: 'Recorded reason', value: edit.reason, span: true },
              ]}
            />
            {edit.valueType === 'boolean' ? (
              <Field label="Value" required>
                <Switch checked={value === 'true'} onChange={(v) => setValue(String(v))} label={value === 'true' ? 'Enabled' : 'Disabled'} />
              </Field>
            ) : edit.valueType === 'json' ? (
              <Field label="Value (JSON)" required>
                <Textarea rows={4} value={value} onChange={(e) => setValue(e.target.value)} />
              </Field>
            ) : (
              <Field label="Value" required>
                <Input value={value} onChange={(e) => setValue(e.target.value)} />
              </Field>
            )}
            {edit.risk === 'high' && (
              <Callout tone="danger" title="High-risk setting">
                Changing this affects {num(edit.affectsResellers)} resellers immediately. There is no scheduled rollout — the change is
                live as soon as it is saved.
              </Callout>
            )}
          </div>
        )}
      </Drawer>

      <T2Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Change ${edit?.key}`}
        permission="ops.settings.write"
        cta="Apply change"
        description={
          <>
            <code className="font-mono">{edit?.key}</code> for {edit?.scopeTarget}: <code className="font-mono">{edit?.value}</code> →{' '}
            <code className="font-mono">{value}</code>. Affects {num(edit?.affectsResellers ?? 0)} resellers.
          </>
        }
        onConfirm={({ reason, ticket }) => {
          if (edit) {
            mutate('custom_settings', edit.id, { value, updatedBy: 'you', updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '), reason })
            logAudit({ action: 'ops.settings.write', resource: 'custom_setting', resourceId: edit.id, before: { value: edit.value }, after: { value }, reason, ticket })
            addToast({ kind: 'success', title: `${edit.key} updated`, body: `Now ${value} for ${edit.scopeTarget}.` })
          }
          setConfirm(false)
          setEdit(null)
        }}
      />

      <Drawer
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New custom setting"
        subtitle="Create is a drawer on the list — the old ACP had a separate navigation entry for it"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setNewOpen(false); addToast({ kind: 'success', title: 'Setting created' }) }}>Create setting</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Key" required className="sm:col-span-2"><Input placeholder="allow_bulk_transfer" /></Field>
          <Field label="Value type" required><Select><option>boolean</option><option>number</option><option>string</option><option>json</option></Select></Field>
          <Field label="Value" required><Input /></Field>
          <Field label="Scope" required><Select><option>global</option><option>membership</option><option>reseller</option></Select></Field>
          <Field label="Scope target" hint="Membership plan or reseller ID."><Select><option>All resellers</option>{MEMBERSHIPS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
          <Field label="Risk" required><Select><option>low</option><option>medium</option><option>high</option></Select></Field>
          <Field label="Reason" required className="sm:col-span-2" hint="Recorded permanently against the setting."><Textarea rows={2} className="font-sans text-sm" /></Field>
        </div>
      </Drawer>
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Rate limits

const rateSpec: TableSpec<RateLimit> = {
  id: 'rate_limits',
  rowId: (r) => r.id,
  defaultSort: { key: 'endpoint', dir: 'asc' },
  search: (r) => `${r.endpoint} ${r.scopeTarget}`,
  columns: [
    { key: 'endpoint', header: 'Endpoint', width: 240, mono: true, render: (r) => <span className="font-medium text-ink-900">{r.endpoint}</span> },
    { key: 'scope', header: 'Scope', width: 110, render: (r) => <Badge tone={r.scope === 'global' ? 'purple' : r.scope === 'plan' ? 'info' : 'neutral'}>{r.scope}</Badge> },
    { key: 'scopeTarget', header: 'Applies to', width: 230 },
    { key: 'limit', header: 'Limit', width: 100, align: 'right', render: (r) => num(r.limit) },
    { key: 'window', header: 'Window', width: 90 },
    { key: 'burst', header: 'Burst', width: 90, align: 'right', render: (r) => num(r.burst) },
    { key: 'usagePeak24h', header: 'Peak 24h', width: 110, align: 'right', render: (r) => (
      <span className={r.usagePeak24h > r.limit * 0.9 ? 'font-medium text-amber-700' : undefined}>{num(r.usagePeak24h)}</span>
    ) },
    { key: 'throttled24h', header: 'Throttled 24h', width: 130, align: 'right', render: (r) => (r.throttled24h ? <span className="font-medium text-brand-700">{num(r.throttled24h)}</span> : '0') },
    { key: 'overriddenBy', header: 'Shadowed by', render: (r) => r.overriddenBy ? <Tooltip content="A more specific scope wins, so this row has no effect for those targets"><span className="text-2xs text-amber-700">{r.overriddenBy}</span></Tooltip> : '—' },
    { key: 'updatedBy', header: 'Updated by', width: 140, optional: true },
    { key: 'updatedAt', header: 'Updated', width: 130, optional: true, render: (r) => relative(r.updatedAt) },
  ],
  filters: [
    { key: 'scope', label: 'Scope', type: 'multiselect', options: ['global', 'plan', 'reseller'].map((v) => ({ value: v, label: v })) },
    { key: 'endpoint', label: 'Endpoint', type: 'text', placeholder: '/domains' },
    { key: 'window', label: 'Window', type: 'select', options: ['1s', '1m', '1h', '1d'].map((v) => ({ value: v, label: v })) },
    { key: 'throttled24h', label: 'Throttled (24h)', type: 'numberrange' },
  ],
}

export function RateLimitsPage({ hideHeader }: { hideHeader?: boolean } = {}) {
  const ds = rateLimits()
  const [edit, setEdit] = useState<RateLimit | null>(null)
  const [limit, setLimit] = useState('')
  const [confirm, setConfirm] = useState(false)
  const canWrite = useCan('ops.ratelimit.write')
  const mutate = useStore((s) => s.mutate)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)

  const throttled = useMemo(() => {
    let n = 0
    for (let i = 0; i < ds.total; i++) n += ds.at(i).throttled24h
    return n
  }, [ds])

  return (
    <Module permissions={['ops.ratelimit.read']} what="rate limits">
      {!hideHeader && (
        <PageHeader
          title="Rate limits"
          subtitle="Membership plan rate limits move here from the Membership Plans page, where they had nothing to do with subscriptions. The override hierarchy is now visible."
        />
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Rules" value={num(ds.total)} icon={<Gauge className="h-4 w-4" />} />
        <StatTile label="Throttled requests (24h)" value={num(throttled)} tone={throttled > 5000 ? 'warn' : 'neutral'} />
        <StatTile label="Hierarchy" value="reseller → plan → global" hint="most specific wins" />
      </div>
      <DataTable
        spec={rateSpec}
        data={ds}
        permission="ops.ratelimit.read"
        exportName="rate limits"
        rowActions={(row) => (
          <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => { setEdit(row); setLimit(String(row.limit)) }}>
            Edit limit
          </Button>
        )}
      />
      <T2Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Change limit for ${edit?.endpoint}`}
        permission="ops.ratelimit.write"
        cta="Apply limit"
        description={
          <>
            {edit?.scope} scope ({edit?.scopeTarget}): {num(edit?.limit ?? 0)} → {num(Number(limit))} per {edit?.window}. Raising a limit
            can move load onto registry integrations.
          </>
        }
        onConfirm={({ reason, ticket }) => {
          if (edit) {
            mutate('rate_limits', edit.id, { limit: Number(limit), updatedBy: 'you', updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') })
            logAudit({ action: 'ops.ratelimit.write', resource: 'rate_limit', resourceId: edit.id, before: { limit: edit.limit }, after: { limit: Number(limit) }, reason, ticket })
            addToast({ kind: 'success', title: 'Rate limit updated' })
          }
          setConfirm(false)
          setEdit(null)
        }}
      />
      <Drawer
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title={edit?.endpoint ?? ''}
        subtitle={`${edit?.scope} · ${edit?.scopeTarget}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button variant="primary" disabled={!limit || limit === String(edit?.limit)} onClick={() => setConfirm(true)}>Review change</Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-4">
            <DefinitionList
              items={[
                { label: 'Current limit', value: `${num(edit.limit)} / ${edit.window}` },
                { label: 'Burst', value: num(edit.burst) },
                { label: 'Peak usage 24h', value: num(edit.usagePeak24h) },
                { label: 'Throttled 24h', value: num(edit.throttled24h) },
              ]}
            />
            <div>
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-400">Headroom</p>
              <Progress value={(edit.usagePeak24h / Math.max(1, edit.limit)) * 100} tone={edit.usagePeak24h > edit.limit * 0.9 ? 'danger' : 'brand'} />
              <p className="mt-1 text-2xs text-ink-500">
                Peak was {pct((edit.usagePeak24h / Math.max(1, edit.limit)) * 100, 0)} of the limit.
              </p>
            </div>
            <Field label="New limit" required hint={`Requests per ${edit.window}.`}>
              <Input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} />
            </Field>
            {edit.overriddenBy && (
              <Callout tone="warn" title="This rule is shadowed">
                More specific rules exist for {edit.overriddenBy}. Changing this row will not affect those targets.
              </Callout>
            )}
          </div>
        )}
      </Drawer>
    </Module>
  )
}
