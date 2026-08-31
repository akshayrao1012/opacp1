import { useMemo, useState } from 'react'
import {
  Check, Download, Eye, ShieldAlert, ShieldCheck, Square, SquareCheck, StopCircle, UserPlus, Users,
} from 'lucide-react'
import { DataTable } from '../components/patterns/DataTable'
import { Module, PageHeader, TabBar, useTab } from '../components/patterns/Page'
import { ElevationButton, ReasonTicketFields } from '../components/patterns/Destructive'
import {
  Badge, Button, Callout, Card, CardHeader, Checkbox, DefinitionList, Drawer, Field,
  Input, Progress, SearchInput, Select, StatTile, StatusBadge, TierBadge, Tooltip,
} from '../components/ui'
import { useCan, useCurrentUser, useStore } from '../lib/store'
import { materialized, type TableSpec } from '../lib/table'
import {
  ALL_PERMISSIONS, ELEVATION_REQUIRED, PERMISSION_CATALOG, PERMISSION_META, TIERS,
  unionPermissions, type AdminUser, type Role, type Tier,
} from '../lib/rbac'
import type { AuditEntry, JobRow } from '../lib/mock/admin'
import { cn, dateTime, initials, num, relative } from '../lib/format'
import { resellerSample } from '../lib/mock/resellers'

// ─────────────────────────────────────────────────────── Users

export function UsersPage({ hideHeader }: { hideHeader?: boolean } = {}) {
  const users = useStore((s) => s.users)
  const roles = useStore((s) => s.roles)
  const setUserRoles = useStore((s) => s.setUserRoles)
  const setUserScope = useStore((s) => s.setUserScope)
  const signInAs = useStore((s) => s.signInAs)
  const canWrite = useCan('admin.user.write')
  const [edit, setEdit] = useState<AdminUser | null>(null)
  const [draftRoles, setDraftRoles] = useState<string[]>([])
  const [scoped, setScoped] = useState(false)
  const [query, setQuery] = useState('')
  const addUser = useStore((s) => s.addUser)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', roles: [] as string[], idpGroups: '', scoped: false, reason: '', ticket: '' })

  const emailTaken = users.some((u) => u.email.toLowerCase() === form.email.trim().toLowerCase())
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())
  const newUserPermissions = useMemo(() => unionPermissions(form.roles, roles), [form.roles, roles])
  const addReady =
    form.name.trim().length > 1 &&
    emailValid &&
    !emailTaken &&
    form.roles.length > 0 &&
    form.reason.trim().length >= 8 &&
    /^ZD-\d{6}$/.test(form.ticket)

  const resetForm = () =>
    setForm({ name: '', email: '', roles: [], idpGroups: '', scoped: false, reason: '', ticket: '' })

  const filtered = users.filter(
    (u) => !query || u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase()),
  )

  const openEdit = (u: AdminUser) => {
    setEdit(u)
    setDraftRoles(u.roles)
    setScoped(Boolean(u.scope.resellerIds))
  }

  const draftPermissions = useMemo(() => unionPermissions(draftRoles, roles), [draftRoles, roles])

  return (
    <Module permissions={['admin.user.read']} what="user administration">
      {!hideHeader && (
        <PageHeader
          title="Users"
          subtitle="Who holds which role, what scope they are limited to, and which IdP group put them there."
  
        />
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Users" value={num(users.length)} icon={<Users className="h-4 w-4" />} />
        <StatTile label="Scoped users" value={num(users.filter((u) => u.scope.resellerIds).length)} hint="regional teams, contractors" />
        <StatTile label="Suspended" value={num(users.filter((u) => u.status === 'suspended').length)} tone="warn" />
        <StatTile label="Roles defined" value={num(roles.length)} />
      </div>

      <Card>
        <CardHeader
          title="All users"
          subtitle="Sign in as any of them to see the ACP under that role"
          actions={
            <>
              <SearchInput value={query} onChange={setQuery} placeholder="Search users" className="w-52" />
              <Button variant="primary" disabled={!canWrite} onClick={() => { resetForm(); setAddOpen(true) }}>
                <UserPlus className="h-3.5 w-3.5" /> Add user
              </Button>
            </>
          }
        />
        <div className="divide-y divide-ink-100">
          {filtered.map((u) => {
            const perms = unionPermissions(u.roles, roles)
            const t3 = [...perms].filter((p) => PERMISSION_META[p]?.tier === 'T3')
            return (
              <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-200 text-2xs font-semibold text-ink-700">
                  {initials(u.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
                    {u.name}
                    {u.status === 'suspended' && <Badge tone="danger">suspended</Badge>}
                    {u.scope.resellerIds && <Badge tone="info">scoped</Badge>}
                  </p>
                  <p className="text-2xs text-ink-500">
                    {u.email} · last seen {relative(u.lastSeen)} · {u.scope.label}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r} tone="neutral">{roles.find((x) => x.id === r)?.name ?? r}</Badge>
                    ))}
                    {u.idpGroups.map((g) => (
                      <Badge key={g} tone="info">{g}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-right text-2xs text-ink-500">
                    {num(perms.size)} permissions
                    {t3.length > 0 && <span className="block text-brand-700">{t3.length} need elevation</span>}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => signInAs(u.id)}>
                    <Eye className="h-3.5 w-3.5" /> View as
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!canWrite} onClick={() => openEdit(u)}>
                    Edit access
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Callout tone="info" title="Provisioning follows the identity provider (R-RBAC-7)">
        Role assignment should be derivable from IdP groups — <code className="font-mono">okta-acp-finance</code> grants Finance. Which
        provider backs ACP login is open decision Q3, so this prototype shows both the group and the resolved role.
      </Callout>

      <Drawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        width="lg"
        title="Add user"
        subtitle="Prototype affordance — in production, accounts arrive from the identity provider"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!addReady}
              onClick={() => {
                addUser({
                  name: form.name,
                  email: form.email,
                  roles: form.roles,
                  idpGroups: form.idpGroups.split(',').map((g) => g.trim()).filter(Boolean),
                  scope: form.scoped
                    ? { resellerIds: resellerSample(9).map((r) => r.id), label: 'Scoped book of business (9 resellers)' }
                    : { resellerIds: null, label: 'All resellers' },
                  reason: form.reason.trim(),
                  ticket: form.ticket,
                })
                setAddOpen(false)
                resetForm()
              }}
            >
              Create user
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Callout tone="info" title="What this does and does not do">
            The user appears in this list and in the account switcher immediately, so you can see the ACP through their roles. It sends no
            invitation and creates no credential — real provisioning is derived from IdP groups (R-RBAC-7), which is open decision Q3.
          </Callout>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Anna Bakker" />
            </Field>
            <Field
              label="Email"
              required
              error={form.email && !emailValid ? 'Enter a valid email address.' : emailTaken ? 'A user with this email already exists.' : null}
            >
              <Input
                type="email"
                value={form.email}
                invalid={Boolean(form.email) && (!emailValid || emailTaken)}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="anna.bakker@openprovider.com"
              />
            </Field>
            <Field
              label="IdP groups"
              className="sm:col-span-2"
              hint="Comma separated. Where roles would be derived from in production, e.g. okta-acp-finance."
            >
              <Input value={form.idpGroups} onChange={(e) => setForm({ ...form, idpGroups: e.target.value })} placeholder="okta-acp-support" />
            </Field>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Roles <span className="text-brand-600">*</span>
            </h4>
            <div className="space-y-1.5">
              {roles.map((r) => (
                <label
                  key={r.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2',
                    form.roles.includes(r.id) ? 'border-brand-300 bg-brand-50' : 'border-ink-200 hover:bg-ink-50',
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-3.5 w-3.5 accent-brand-600"
                    checked={form.roles.includes(r.id)}
                    onChange={(e) =>
                      setForm({ ...form, roles: e.target.checked ? [...form.roles, r.id] : form.roles.filter((x) => x !== r.id) })
                    }
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-ink-900">{r.name}</span>
                    <span className="block text-2xs text-ink-500">{r.description}</span>
                    <span className="block text-2xs text-ink-400">{r.permissions.length} permissions</span>
                  </span>
                </label>
              ))}
            </div>
            {form.roles.length === 0 && (
              <p className="mt-1.5 text-2xs text-ink-500">Pick at least one role — a user with no role can sign in and see nothing.</p>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Reseller scope (R-RBAC-4)</h4>
            <Checkbox
              label="Limit this user to a subset of resellers"
              hint="For regional teams, contractors and partner-managed accounts."
              checked={form.scoped}
              onChange={(e) => setForm({ ...form, scoped: e.target.checked })}
            />
          </div>

          {form.roles.length > 0 && (
            <EffectivePermissions permissions={newUserPermissions} title="What this person would be able to do" />
          )}

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Why (T2 — audited)</h4>
            <ReasonTicketFields
              reason={form.reason}
              ticket={form.ticket}
              onReason={(v) => setForm({ ...form, reason: v })}
              onTicket={(v) => setForm({ ...form, ticket: v })}
              reasonPlaceholder="New starter on the Support team — access request approved by their lead."
            />
          </div>
        </div>
      </Drawer>

      <Drawer
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        width="lg"
        title={edit ? `Access for ${edit.name}` : ''}
        subtitle="Roles, scope, and the effective-permissions preview"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (edit) {
                  setUserRoles(edit.id, draftRoles)
                  if (scoped !== Boolean(edit.scope.resellerIds)) {
                    const ids = scoped ? resellerSample(9).map((r) => r.id) : null
                    setUserScope(edit.id, ids, scoped ? `Scoped book of business (${ids?.length} resellers)` : 'All resellers')
                  }
                }
                setEdit(null)
              }}
            >
              Save access
            </Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-5">
            <DefinitionList
              items={[
                { label: 'Email', value: edit.email },
                { label: 'Status', value: <StatusBadge status={edit.status} /> },
                { label: 'IdP groups', value: edit.idpGroups.join(', ') || '—' },
                { label: 'Last seen', value: relative(edit.lastSeen) },
              ]}
            />

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Roles</h4>
              <div className="space-y-1.5">
                {roles.map((r) => (
                  <label
                    key={r.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2',
                      draftRoles.includes(r.id) ? 'border-brand-300 bg-brand-50' : 'border-ink-200 hover:bg-ink-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-3.5 w-3.5 accent-brand-600"
                      checked={draftRoles.includes(r.id)}
                      onChange={(e) => setDraftRoles((prev) => (e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id)))}
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-ink-900">{r.name}</span>
                      <span className="block text-2xs text-ink-500">{r.description}</span>
                      <span className="block text-2xs text-ink-400">{r.permissions.length} permissions</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Reseller scope (R-RBAC-4)</h4>
              <Checkbox
                label="Limit this user to a subset of resellers"
                hint="For regional teams, contractors and partner-managed accounts."
                checked={scoped}
                onChange={(e) => setScoped(e.target.checked)}
              />
              {scoped && (
                <p className="mt-1.5 text-2xs text-ink-500">
                  Everything outside the scope is invisible: lists filter it out and direct links return the no-permission state.
                </p>
              )}
            </div>

            <EffectivePermissions permissions={draftPermissions} title="What this person could actually do" />
          </div>
        )}
      </Drawer>
    </Module>
  )
}

function EffectivePermissions({ permissions, title }: { permissions: Set<string>; title: string }) {
  const byTier = useMemo(() => {
    const acc: Record<Tier, string[]> = { T0: [], T1: [], T2: [], T3: [] }
    for (const p of permissions) acc[PERMISSION_META[p]?.tier ?? 'T0'].push(p)
    return acc
  }, [permissions])

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{title}</h4>
      <div className="space-y-2">
        {(['T3', 'T2', 'T1', 'T0'] as Tier[]).map((tier) => (
          <div key={tier} className="rounded-lg border border-ink-200 p-2.5">
            <div className="mb-1.5 flex items-center gap-2">
              <TierBadge tier={tier} />
              <span className="text-2xs text-ink-600">{TIERS[tier].label}</span>
              <span className="ml-auto text-2xs tabular text-ink-500">{byTier[tier].length}</span>
            </div>
            {byTier[tier].length === 0 ? (
              <p className="text-2xs text-ink-400">None</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {byTier[tier].map((p) => (
                  <Tooltip key={p} content={PERMISSION_META[p]?.label}>
                    <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-2xs text-ink-700">{p}</code>
                  </Tooltip>
                ))}
              </div>
            )}
            {tier === 'T3' && byTier.T3.length > 0 && (
              <p className="mt-1.5 text-2xs text-amber-700">
                Held only during a time-boxed elevation window, never permanently.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────── Roles & permissions

export function RolesPage() {
  const roles = useStore((s) => s.roles)
  const users = useStore((s) => s.users)
  const saveRole = useStore((s) => s.saveRole)
  const canWrite = useCan('admin.role.write')
  const [tab, setTab] = useTab('roles')
  const [selected, setSelected] = useState<string>(roles[0].id)
  const [draft, setDraft] = useState<Role | null>(null)
  const [previewUser, setPreviewUser] = useState(users[1]?.id ?? users[0].id)

  const role = roles.find((r) => r.id === selected) ?? roles[0]
  const editing = draft?.id === role.id ? draft : null
  const permissions = new Set(editing?.permissions ?? role.permissions)
  const holders = users.filter((u) => u.roles.includes(role.id))

  const toggle = (permission: string) => {
    const base = editing ?? { ...role }
    const next = base.permissions.includes(permission)
      ? base.permissions.filter((p) => p !== permission)
      : [...base.permissions, permission]
    setDraft({ ...base, permissions: next })
  }

  const previewPermissions = useMemo(() => {
    const u = users.find((x) => x.id === previewUser)
    return u ? unionPermissions(u.roles, roles) : new Set<string>()
  }, [previewUser, users, roles])

  return (
    <Module permissions={['admin.user.read', 'admin.role.write']} what="roles and permissions">
      <PageHeader
        title="Roles & permissions"
        subtitle="Access is enforced, not documented. This is where the spreadsheet column becomes a permission."
        meta={
          <>
            <Badge tone="neutral">{num(ALL_PERMISSIONS.length)} permissions</Badge>
            <Badge tone="danger">{num(ELEVATION_REQUIRED.length)} require elevation</Badge>
          </>
        }
      />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'roles', label: 'Roles', count: roles.length },
          { id: 'matrix', label: 'Permissions', count: ALL_PERMISSIONS.length },
          { id: 'users', label: 'Users', count: users.length },
          { id: 'preview', label: 'Effective access' },
        ]}
      />

      {tab === 'roles' && (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Card className="h-fit">
            <CardHeader title="Roles" />
            <div className="p-1.5">
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className={cn('w-full rounded-lg px-2 py-1.5 text-left', r.id === selected ? 'bg-brand-50' : 'hover:bg-ink-50')}
                >
                  <span className={cn('block text-xs', r.id === selected ? 'font-medium text-brand-900' : 'text-ink-800')}>{r.name}</span>
                  <span className="block text-2xs text-ink-500">{r.permissions.length} permissions</span>
                </button>
              ))}
            </div>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader
                title={role.name}
                subtitle={role.description}
                actions={
                  <div className="flex items-center gap-2">
                    {role.system && <Badge tone="purple">system role</Badge>}
                    <Badge tone="neutral">{holders.length} holders</Badge>
                    {editing && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Discard</Button>
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={!canWrite}
                          onClick={() => {
                            saveRole(editing)
                            setDraft(null)
                          }}
                        >
                          Save role
                        </Button>
                      </>
                    )}
                  </div>
                }
              />
              <div className="p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-2xs text-ink-500">
                  <span>Holders:</span>
                  {holders.length === 0 ? <span>none</span> : holders.map((h) => <Badge key={h.id}>{h.name}</Badge>)}
                </div>
                {PERMISSION_CATALOG.map((group) => (
                  <div key={group.group} className="mb-3">
                    <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-400">{group.group}</p>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {group.permissions.map((p) => {
                        const on = permissions.has(p.id)
                        return (
                          <button
                            key={p.id}
                            disabled={!canWrite || role.system}
                            onClick={() => toggle(p.id)}
                            className={cn(
                              'flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors',
                              on ? 'border-brand-200 bg-brand-50/60' : 'border-ink-200 hover:bg-ink-50',
                              (!canWrite || role.system) && 'cursor-not-allowed opacity-70',
                            )}
                          >
                            {on ? <SquareCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" /> : <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-300" />}
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5">
                                <code className="font-mono text-2xs text-ink-800">{p.id}</code>
                                <TierBadge tier={p.tier} />
                              </span>
                              <span className="block text-2xs text-ink-500">{p.label}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {role.system && (
                  <Callout tone="info" title="System role">
                    Super Admin holds every permission by definition. Tier 3 permissions still require elevation for its holders.
                  </Callout>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'users' && <UsersPage hideHeader />}

      {tab === 'matrix' && (
        <Card>
          <CardHeader title="Permission catalogue" subtitle="Every permission, its tier, and the controls that tier implies" />
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-2 text-left">Permission</th>
                  <th className="px-4 py-2 text-left">Group</th>
                  <th className="px-4 py-2 text-left">Tier</th>
                  <th className="px-4 py-2 text-left">Required controls</th>
                  <th className="px-4 py-2 text-left">Roles holding it</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSION_CATALOG.flatMap((g) =>
                  g.permissions.map((p) => (
                    <tr key={p.id} className="border-t border-ink-100">
                      <td className="px-4 py-2">
                        <code className="font-mono text-xs text-ink-900">{p.id}</code>
                        <span className="block text-2xs text-ink-500">{p.label}</span>
                      </td>
                      <td className="px-4 py-2 text-xs">{g.group}</td>
                      <td className="px-4 py-2"><TierBadge tier={p.tier} /></td>
                      <td className="px-4 py-2 text-2xs text-ink-600">{TIERS[p.tier].controls.join(' · ')}</td>
                      <td className="px-4 py-2">
                        <span className="flex flex-wrap gap-1">
                          {roles.filter((r) => r.permissions.includes(p.id)).map((r) => (
                            <Badge key={r.id}>{r.name}</Badge>
                          ))}
                        </span>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'preview' && (
        <Card>
          <CardHeader
            title="Effective permissions"
            subtitle="R-RBAC-6 — answer “what can this person actually do?” without reading role definitions"
            actions={
              <Select value={previewUser} onChange={(e) => setPreviewUser(e.target.value)} className="w-64">
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            }
          />
          <div className="p-4">
            <EffectivePermissions permissions={previewPermissions} title={`${users.find((u) => u.id === previewUser)?.name} can do`} />
          </div>
        </Card>
      )}
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Audit log

const auditSpec: TableSpec<AuditEntry> = {
  id: 'audit',
  rowId: (a) => a.id,
  defaultSort: { key: 'at', dir: 'desc' },
  search: (a) => `${a.id} ${a.actor} ${a.actorEmail} ${a.action} ${a.resource} ${a.resourceId} ${a.reason ?? ''} ${a.ticket ?? ''} ${a.correlationId}`,
  columns: [
    { key: 'at', header: 'When', width: 160, render: (a) => <Tooltip content={relative(a.at)}><span>{dateTime(a.at)}</span></Tooltip> },
    { key: 'actor', header: 'Actor', width: 160, render: (a) => <span className="font-medium">{a.actor}</span> },
    { key: 'role', header: 'Role in effect', width: 190 },
    { key: 'action', header: 'Action', width: 200, mono: true },
    { key: 'tier', header: 'Tier', width: 70, render: (a) => <TierBadge tier={a.tier} /> },
    { key: 'resource', header: 'Resource', width: 140 },
    { key: 'resourceId', header: 'Resource ID', width: 140, mono: true },
    { key: 'outcome', header: 'Outcome', width: 100, render: (a) => <StatusBadge status={a.outcome === 'success' ? 'completed' : a.outcome === 'denied' ? 'rejected' : 'failed'} /> },
    { key: 'elevated', header: 'Elevated', width: 90, render: (a) => (a.elevated ? <Badge tone="warn">yes</Badge> : '—') },
    { key: 'reason', header: 'Reason', width: 220, render: (a) => a.reason ?? '—' },
    { key: 'ticket', header: 'Ticket', width: 110, render: (a) => a.ticket ?? '—' },
    { key: 'before', header: 'Before', width: 180, mono: true, optional: true, render: (a) => a.before ?? '—' },
    { key: 'after', header: 'After', width: 180, mono: true, optional: true, render: (a) => a.after ?? '—' },
    { key: 'ip', header: 'Source IP', width: 130, mono: true, optional: true },
    { key: 'correlationId', header: 'Correlation', width: 130, mono: true, optional: true },
  ],
  filters: [
    { key: 'tier', label: 'Tier', type: 'multiselect', options: ['T0', 'T1', 'T2', 'T3'].map((v) => ({ value: v, label: v })) },
    { key: 'outcome', label: 'Outcome', type: 'multiselect', options: ['success', 'denied', 'failed'].map((v) => ({ value: v, label: v })) },
    { key: 'action', label: 'Action', type: 'text', placeholder: 'payment.refund' },
    { key: 'actor', label: 'Actor', type: 'text' },
    { key: 'resource', label: 'Resource', type: 'text' },
    { key: 'elevated', label: 'Under elevation', type: 'boolean' },
    { key: 'at', label: 'When', type: 'daterange' },
    { key: 'ticket', label: 'Ticket', type: 'text' },
  ],
}

export function AuditPage() {
  const audit = useStore((s) => s.audit)
  const ds = useMemo(() => materialized('audit', audit), [audit])
  const [entry, setEntry] = useState<AuditEntry | null>(null)

  const stats = useMemo(() => {
    const t3 = audit.filter((a) => a.tier === 'T3').length
    const denied = audit.filter((a) => a.outcome === 'denied').length
    const elevated = audit.filter((a) => a.elevated).length
    return { t3, denied, elevated }
  }, [audit])

  return (
    <Module permissions={['admin.audit.read']} what="the audit log">
      <PageHeader
        title="Audit log"
        subtitle="Actor, role in effect, timestamp, action, resource, before/after, reason, ticket and source IP — for every state-changing action."
        meta={<Badge tone="neutral">{num(ds.total)} entries</Badge>}
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Entries" value={num(ds.total)} />
        <StatTile label="Tier 3 actions" value={num(stats.t3)} tone="danger" />
        <StatTile label="Under elevation" value={num(stats.elevated)} tone="warn" />
        <StatTile label="Denied attempts" value={num(stats.denied)} hint="permission checks that fired" />
      </div>
      <Callout tone="info" title="Retention is an open decision (Q6)">
        Records are immutable and exportable. The retention period is blocked on Legal — NFR-3 cannot be closed until it is set.
      </Callout>
      <DataTable
        spec={auditSpec}
        data={ds}
        permission="admin.audit.read"
        exportName="audit log"
        onRowClick={(row) => setEntry(row)}
      />
      <Drawer open={Boolean(entry)} onClose={() => setEntry(null)} title={entry?.action ?? ''} subtitle={entry ? `${entry.id} · ${dateTime(entry.at)}` : ''}>
        {entry && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <TierBadge tier={entry.tier} />
              <StatusBadge status={entry.outcome === 'success' ? 'completed' : entry.outcome === 'denied' ? 'rejected' : 'failed'} />
              {entry.elevated && <Badge tone="warn"><ShieldAlert className="h-2.5 w-2.5" /> elevated</Badge>}
            </div>
            <DefinitionList
              items={[
                { label: 'Actor', value: `${entry.actor} (${entry.actorEmail})` },
                { label: 'Role in effect', value: entry.role },
                { label: 'Resource', value: `${entry.resource} · ${entry.resourceId}` },
                { label: 'Source IP', value: entry.ip },
                { label: 'Reason', value: entry.reason ?? '—', span: true },
                { label: 'Ticket', value: entry.ticket ?? '—' },
                { label: 'Correlation ID', value: <code className="font-mono text-xs">{entry.correlationId}</code> },
              ]}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-400">Before</p>
                <pre className="overflow-x-auto rounded-lg bg-ink-950 p-2.5 font-mono text-2xs text-ink-100">{entry.before ?? 'null'}</pre>
              </div>
              <div>
                <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-400">After</p>
                <pre className="overflow-x-auto rounded-lg bg-ink-950 p-2.5 font-mono text-2xs text-ink-100">{entry.after ?? 'null'}</pre>
              </div>
            </div>
            <p className="text-2xs text-ink-500">
              Audit records are append-only. Correcting a mistake means a new entry, never an edit to this one.
            </p>
          </div>
        )}
      </Drawer>
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Job centre

const jobSpec: TableSpec<JobRow> = {
  id: 'jobs',
  rowId: (j) => j.id,
  defaultSort: { key: 'startedAt', dir: 'desc' },
  search: (j) => `${j.id} ${j.label} ${j.owner} ${j.kind} ${j.ticket ?? ''}`,
  columns: [
    { key: 'id', header: 'Job', width: 130, mono: true },
    { key: 'label', header: 'Operation', render: (j) => <span className="font-medium">{j.label}</span> },
    { key: 'tier', header: 'Tier', width: 70, render: (j) => <TierBadge tier={j.tier} /> },
    { key: 'status', header: 'Status', width: 150, render: (j) => <StatusBadge status={j.status} /> },
    { key: 'progress', header: 'Progress', width: 160, render: (j) => (
      <div className="flex items-center gap-2">
        <Progress value={j.progress} tone={j.status === 'failed' ? 'danger' : j.status === 'completed' ? 'success' : 'brand'} />
        <span className="w-8 text-right text-2xs tabular text-ink-500">{j.progress}%</span>
      </div>
    ) },
    { key: 'total', header: 'Rows', width: 90, align: 'right', render: (j) => num(j.total) },
    { key: 'failed', header: 'Failed', width: 90, align: 'right', render: (j) => (j.failed ? <span className="font-medium text-brand-700">{num(j.failed)}</span> : '0') },
    { key: 'dryRun', header: 'Dry run', width: 90, render: (j) => (j.dryRun ? <Badge tone="info">dry run</Badge> : '—') },
    { key: 'owner', header: 'Owner', width: 140 },
    { key: 'approver', header: 'Approver', width: 140, render: (j) => j.approver ?? '—' },
    { key: 'ticket', header: 'Ticket', width: 110, render: (j) => j.ticket ?? '—' },
    { key: 'startedAt', header: 'Started', width: 150, render: (j) => relative(j.startedAt) },
    { key: 'reason', header: 'Reason', optional: true, render: (j) => j.reason ?? '—' },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['queued', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'tier', label: 'Tier', type: 'multiselect', options: ['T1', 'T2', 'T3'].map((v) => ({ value: v, label: v })) },
    { key: 'kind', label: 'Kind', type: 'text', placeholder: 'bulk_delete' },
    { key: 'owner', label: 'Owner', type: 'text' },
    { key: 'dryRun', label: 'Dry run', type: 'boolean' },
    { key: 'startedAt', label: 'Started', type: 'daterange' },
  ],
}

export function JobsPage() {
  const jobs = useStore((s) => s.jobs)
  const cancelJob = useStore((s) => s.cancelJob)
  const addToast = useStore((s) => s.addToast)
  const canCancel = useCan('admin.job.cancel')
  const ds = useMemo(() => materialized('jobs', jobs), [jobs])

  const stats = useMemo(() => ({
    running: jobs.filter((j) => j.status === 'running').length,
    awaiting: jobs.filter((j) => j.status === 'awaiting_approval').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  }), [jobs])

  return (
    <Module permissions={['admin.job.read']} what="the job centre">
      <PageHeader
        title="Job centre"
        subtitle="Anything that can exceed a few seconds is a job with an ID: bulk operations, exports, migrations."
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Running" value={num(stats.running)} tone="warn" />
        <StatTile label="Awaiting approval" value={num(stats.awaiting)} tone="danger" hint="Tier 3, blocked on a second approver" />
        <StatTile label="Failed" value={num(stats.failed)} tone={stats.failed ? 'danger' : 'neutral'} />
        <StatTile label="Total jobs" value={num(jobs.length)} />
      </div>
      <DataTable
        spec={jobSpec}
        data={ds}
        permission="admin.job.read"
        exportName="jobs"
        rowActions={(row) => (
          <div className="flex items-center gap-1">
            {row.resultCsv && (
              <Tooltip content="Per-row result report">
                <Button size="sm" variant="ghost" onClick={() => addToast({ kind: 'info', title: `Downloading ${row.resultCsv}` })}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </Tooltip>
            )}
            {row.cancellable && (
              <Tooltip content="Cancel this job">
                <Button size="sm" variant="ghost" disabled={!canCancel} onClick={() => cancelJob(row.id)}>
                  <StopCircle className="h-3.5 w-3.5" />
                </Button>
              </Tooltip>
            )}
          </div>
        )}
      />
      <ApprovalsPanel />
    </Module>
  )
}

function ApprovalsPanel() {
  const approvals = useStore((s) => s.approvals)
  const resolveApproval = useStore((s) => s.resolveApproval)
  const addToast = useStore((s) => s.addToast)
  const canApprove = useCan('payment.refund.approve')
  const user = useCurrentUser()
  const [note, setNote] = useState('')

  if (!approvals.length) return null

  return (
    <Card>
      <CardHeader
        title="Pending approvals"
        subtitle="Tier 3 operations wait here until a named approver signs off"
        icon={<ShieldCheck className="h-4 w-4" />}
        actions={<Badge tone="danger">{approvals.length}</Badge>}
      />
      <div className="divide-y divide-ink-100">
        {approvals.map((a) => (
          <div key={a.id} className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-ink-900">{a.label}</p>
                <p className="text-2xs text-ink-500">
                  {a.requestedBy} · {relative(a.requestedAt)} · {a.ticket} · target {a.targetId}
                </p>
              </div>
              <Badge tone="danger">T3</Badge>
            </div>
            <p className="text-xs text-ink-700">{a.reason}</p>
            <ul className="space-y-0.5">
              {a.detail.map((d) => (
                <li key={d} className="text-2xs text-ink-600">· {d}</li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Approver note (required)" className="max-w-xs" />
              <Button
                size="sm"
                variant="primary"
                disabled={!canApprove || note.trim().length < 6}
                onClick={() => {
                  resolveApproval(a.id, 'approved', note.trim())
                  addToast({ kind: 'success', title: 'Approved', body: `${a.label} released for execution by ${user.name}.` })
                  setNote('')
                }}
              >
                <Check className="h-3.5 w-3.5" /> Approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canApprove || note.trim().length < 6}
                onClick={() => {
                  resolveApproval(a.id, 'rejected', note.trim())
                  addToast({ kind: 'info', title: 'Rejected', body: 'Requester notified; nothing was changed.' })
                  setNote('')
                }}
              >
                Reject
              </Button>
              {!canApprove && (
                <span className="flex items-center gap-2 text-2xs text-ink-500">
                  Approval requires elevation. <ElevationButton permission="payment.refund.approve" size="sm" />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

