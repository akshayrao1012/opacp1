import { create } from 'zustand'
import {
  DEFAULT_ROLES, ELEVATION_WINDOW_MINUTES, PERMISSION_META, isElevationRequired,
  unionPermissions, PAYMENT_APPROVAL_THRESHOLD, type AdminUser, type Elevation, type ResellerScope,
  type Role,
} from './rbac'
import { seedAudit, seedJobs, seedUsers, type AuditEntry, type JobRow } from './mock/admin'
import { markRemoved, patchRow, resetPatches } from './mock/patch'
import { findReseller } from './mock/resellers'
import type { Payment } from './mock/finance'
import { isoDateTime } from './rng'
import type { FilterValue } from './table'

export interface Toast {
  id: string
  title: string
  body?: string
  kind: 'success' | 'error' | 'info' | 'warn'
  correlationId?: string
  href?: string
  hrefLabel?: string
}

export interface SavedView {
  id: string
  tableId: string
  name: string
  shared: boolean
  owner: string
  query: { q: string; filters: Record<string, FilterValue>; sort?: { key: string; dir: 'asc' | 'desc' }; pageSize: number }
  builtIn?: boolean
}

export interface AuditInput {
  action: string
  resource: string
  resourceId: string
  outcome?: AuditEntry['outcome']
  before?: unknown
  after?: unknown
  reason?: string | null
  ticket?: string | null
}

export interface PendingApproval {
  id: string
  kind: 'refund' | 'bulk_job' | 'reseller_delete' | 'payment'
  label: string
  amount?: number
  requestedBy: string
  requestedAt: string
  tier: 'T3'
  targetId: string
  reason: string
  ticket: string
  detail: string[]
  /** Enough context for the approver's decision to actually apply the change. */
  payload?: { resellerId?: number; amount?: number; paymentId?: string }
}

interface State {
  // ── session ──────────────────────────────────────────────────────────────
  users: AdminUser[]
  roles: Role[]
  currentUserId: string
  elevations: Elevation[]
  /** Payments recorded in this session — shown above the seeded set. */
  manualPayments: Payment[]
  /** Bumped whenever mock data is mutated so tables re-query. */
  dataVersion: number

  // ── governance ───────────────────────────────────────────────────────────
  audit: AuditEntry[]
  jobs: JobRow[]
  approvals: PendingApproval[]
  savedViews: SavedView[]
  toasts: Toast[]

  // ── ui ───────────────────────────────────────────────────────────────────
  navCollapsed: boolean
  omniOpen: boolean
  density: 'comfortable' | 'compact'

  // ── actions ──────────────────────────────────────────────────────────────
  signInAs: (userId: string) => void
  setNavCollapsed: (v: boolean) => void
  setOmniOpen: (v: boolean) => void
  setDensity: (d: 'comfortable' | 'compact') => void

  can: (permission: string) => boolean
  hasBase: (permission: string) => boolean
  elevationFor: (permission: string) => Elevation | undefined
  requestElevation: (permission: string, reason: string, ticket: string) => void
  dropElevation: (permission: string) => void

  logAudit: (input: AuditInput) => AuditEntry
  addToast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void

  saveRole: (role: Role) => void
  deleteRole: (roleId: string) => void
  setUserRoles: (userId: string, roles: string[]) => void
  setUserScope: (userId: string, resellerIds: number[] | null, label: string) => void
  /** Prototype affordance — real provisioning is IdP-driven (R-RBAC-7, open decision Q3). */
  addUser: (input: {
    name: string
    email: string
    roles: string[]
    idpGroups: string[]
    scope: ResellerScope
    reason: string
    ticket: string
  }) => AdminUser

  saveView: (view: Omit<SavedView, 'id'>) => void
  deleteView: (id: string) => void

  createJob: (job: Omit<JobRow, 'id' | 'progress' | 'succeeded' | 'failed' | 'finishedAt' | 'startedAt'> & { progress?: number }) => JobRow
  advanceJob: (id: string, patch: Partial<JobRow>) => void
  cancelJob: (id: string) => void

  createPayment: (input: {
    resellerId: number
    company: string
    amount: number
    currency: 'EUR' | 'USD' | 'GBP'
    type: string
    method: Payment['method']
    description: string
    reference: string
    reason: string
    ticket: string
  }) => { payment: Payment; awaitingApproval: boolean }

  addApproval: (a: Omit<PendingApproval, 'id'>) => PendingApproval
  resolveApproval: (id: string, decision: 'approved' | 'rejected', note: string) => void

  mutate: (datasetId: string, rowId: string, patch: Record<string, unknown>) => void
  softDelete: (datasetId: string, rowId: string) => void
  resetData: () => void
}

/**
 * Session preferences survive a reload so a shared link opens under the same
 * identity. Data mutations and the audit log deliberately do not — the
 * prototype should always start from a known state.
 */
const PREFS_KEY = 'acp.session'
interface Prefs {
  currentUserId: string
  density: 'comfortable' | 'compact'
  navCollapsed: boolean
}
function loadPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
  } catch {
    return {}
  }
}
function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* private mode — preferences stay per-session */
  }
}

/** Applies a credit to a reseller balance through the patch layer. */
function creditReseller(get: () => State, resellerId: number, amount: number) {
  const r = findReseller(resellerId)
  if (!r) return
  patchRow('resellers', String(resellerId), { balance: Math.round((r.balance + amount) * 100) / 100 })
  void get
}

let seq = 0
const uid = (p: string) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`

const BUILT_IN_VIEWS: SavedView[] = [
  {
    id: 'v_domains_expiring', tableId: 'domains', name: 'Expiring in 30 days', shared: true, owner: 'system', builtIn: true,
    query: { q: '', filters: { status: ['active'], expiresAt: { from: '2026-08-26', to: '2026-09-25' } }, sort: { key: 'expiresAt', dir: 'asc' }, pageSize: 50 },
  },
  {
    id: 'v_domains_premium', tableId: 'domains', name: 'Premium domains', shared: true, owner: 'system', builtIn: true,
    query: { q: '', filters: { premium: true }, sort: { key: 'premiumPrice', dir: 'desc' }, pageSize: 50 },
  },
  {
    id: 'v_domains_hold', tableId: 'domains', name: 'On clientHold', shared: true, owner: 'system', builtIn: true,
    query: { q: '', filters: { status: ['clientHold'] }, sort: { key: 'name', dir: 'asc' }, pageSize: 50 },
  },
  {
    id: 'v_resellers_churn', tableId: 'resellers', name: 'Churn risk — enterprise', shared: true, owner: 'system', builtIn: true,
    query: { q: '', filters: { segment: ['enterprise'], status: ['active'] }, sort: { key: 'lastLoginAt', dir: 'asc' }, pageSize: 25 },
  },
  {
    id: 'v_resellers_negative', tableId: 'resellers', name: 'Negative balance', shared: true, owner: 'system', builtIn: true,
    query: { q: '', filters: { balance: { max: 0 } }, sort: { key: 'balance', dir: 'asc' }, pageSize: 25 },
  },
  {
    id: 'v_tasks_failed', tableId: 'tasks', name: 'Failed — last 30 days', shared: true, owner: 'system', builtIn: true,
    query: { q: '', filters: { status: ['failed'], ageDays: { max: 30 } }, sort: { key: 'createdAt', dir: 'desc' }, pageSize: 50 },
  },
  {
    id: 'v_tasks_outdated', tableId: 'tasks', name: 'Outdated backlog', shared: true, owner: 'system', builtIn: true,
    query: { q: '', filters: { status: ['outdated'] }, sort: { key: 'ageDays', dir: 'desc' }, pageSize: 50 },
  },
  {
    id: 'v_licenses_migration', tableId: 'licenses', name: 'In a migration batch', shared: true, owner: 'system', builtIn: true,
    query: { q: '', filters: { hasBatch: true }, sort: { key: 'migrationBatch', dir: 'asc' }, pageSize: 100 },
  },
  {
    id: 'v_refunds_queue', tableId: 'refunds', name: 'Awaiting my approval', shared: true, owner: 'system', builtIn: true,
    query: { q: '', filters: { status: ['awaiting_approval'] }, sort: { key: 'amount', dir: 'desc' }, pageSize: 25 },
  },
]

const SEED_APPROVALS: PendingApproval[] = [
  {
    id: 'ap_1',
    kind: 'refund',
    label: 'Refund RF-50012 — Nordcloud Hosting B.V.',
    amount: 4820.4,
    requestedBy: 'f.moreau',
    requestedAt: isoDateTime(Date.parse('2026-08-26T07:22:00Z')),
    tier: 'T3',
    targetId: 'RF-50012',
    reason: 'Duplicate SEPA direct debit collected twice for invoice INV-2026-104882.',
    ticket: 'ZD-448120',
    detail: [
      'Amount 4,820.40 EUR is above the 500 EUR approver threshold.',
      'Beneficiary IBAN differs from the IBAN on the original payment.',
      'Zendesk ticket ZD-448120 verified — status: pending customer.',
    ],
  },
  {
    id: 'ap_2',
    kind: 'bulk_job',
    label: 'Bulk abuse suspension — 1,284 domains',
    requestedBy: 'j.okafor',
    requestedAt: isoDateTime(Date.parse('2026-08-26T08:05:00Z')),
    tier: 'T3',
    targetId: 'JOB-40001',
    reason: 'Phishing campaign NL-2026-8841 confirmed by SIDN abuse desk.',
    ticket: 'ZD-448377',
    detail: [
      'Dry run completed: 1,284 domains would move to clientHold, 12 rows rejected.',
      '9 domains belong to 2 enterprise resellers — account managers notified.',
      'Operation is reversible: clientHold can be removed by the same console.',
    ],
  },
  {
    id: 'ap_3',
    kind: 'reseller_delete',
    label: 'Delete reseller 100341 — Lumoworks Ltd',
    requestedBy: 'm.kowalski',
    requestedAt: isoDateTime(Date.parse('2026-08-25T15:40:00Z')),
    tier: 'T3',
    targetId: '100341',
    reason: 'GDPR erasure request received 2026-08-18, verified by Legal.',
    ticket: 'ZD-447901',
    detail: [
      'Irreversible: anonymises admin, technical, billing, abuse and sales contacts.',
      'Deletes 3 linked customers and deactivates 5 contacts.',
      'GDPR erasure procedure signed off by Legal (NFR-6).',
    ],
  },
]

const prefs = loadPrefs()
const seededUsers = seedUsers()

export const useStore = create<State>((set, get) => ({
  users: seededUsers,
  roles: DEFAULT_ROLES,
  manualPayments: [],
  currentUserId: seededUsers.some((u) => u.id === prefs.currentUserId) ? prefs.currentUserId! : 'u_arao',
  elevations: [],
  dataVersion: 0,

  audit: seedAudit(),
  jobs: seedJobs(),
  approvals: SEED_APPROVALS,
  savedViews: BUILT_IN_VIEWS,
  toasts: [],

  navCollapsed: prefs.navCollapsed ?? false,
  omniOpen: false,
  density: prefs.density ?? 'comfortable',

  signInAs: (userId) => {
    const u = get().users.find((x) => x.id === userId)
    set({ currentUserId: userId, elevations: [] })
    savePrefs({ currentUserId: userId, density: get().density, navCollapsed: get().navCollapsed })
    if (u) get().addToast({ kind: 'info', title: `Signed in as ${u.name}`, body: u.roles.map((r) => get().roles.find((x) => x.id === r)?.name ?? r).join(', ') })
  },
  setNavCollapsed: (v) => {
    set({ navCollapsed: v })
    savePrefs({ currentUserId: get().currentUserId, density: get().density, navCollapsed: v })
  },
  setOmniOpen: (v) => set({ omniOpen: v }),
  setDensity: (d) => {
    set({ density: d })
    savePrefs({ currentUserId: get().currentUserId, density: d, navCollapsed: get().navCollapsed })
  },

  hasBase: (permission) => {
    const s = get()
    const u = s.users.find((x) => x.id === s.currentUserId)
    if (!u) return false
    return unionPermissions(u.roles, s.roles).has(permission)
  },

  elevationFor: (permission) => {
    const now = Date.now()
    return get().elevations.find((e) => e.permission === permission && e.expiresAt > now)
  },

  /** R-RBAC-2: the UI mirrors the server check; T3 also requires live elevation. */
  can: (permission) => {
    const s = get()
    if (!s.hasBase(permission)) return false
    if (!isElevationRequired(permission)) return true
    return Boolean(s.elevationFor(permission))
  },

  requestElevation: (permission, reason, ticket) => {
    const now = Date.now()
    const elevation: Elevation = {
      permission,
      grantedAt: now,
      expiresAt: now + ELEVATION_WINDOW_MINUTES * 60_000,
      reason,
      ticket,
    }
    set({ elevations: [...get().elevations.filter((e) => e.permission !== permission), elevation] })
    get().logAudit({
      action: 'admin.elevation.grant',
      resource: 'elevation',
      resourceId: permission,
      reason,
      ticket,
      after: { expiresInMinutes: ELEVATION_WINDOW_MINUTES },
    })
    get().addToast({
      kind: 'warn',
      title: `Elevated for ${ELEVATION_WINDOW_MINUTES} minutes`,
      body: `${PERMISSION_META[permission]?.label ?? permission}. Announced to #acp-elevations.`,
    })
  },

  dropElevation: (permission) => {
    set({ elevations: get().elevations.filter((e) => e.permission !== permission) })
    get().logAudit({ action: 'admin.elevation.drop', resource: 'elevation', resourceId: permission })
  },

  logAudit: (input) => {
    const s = get()
    const u = s.users.find((x) => x.id === s.currentUserId)
    const tier = PERMISSION_META[input.action]?.tier ?? 'T1'
    const entry: AuditEntry = {
      id: uid('AUD').toUpperCase(),
      at: isoDateTime(Date.now()),
      actor: u?.name ?? 'unknown',
      actorEmail: u?.email ?? '—',
      role: (u?.roles ?? []).map((r) => s.roles.find((x) => x.id === r)?.name ?? r).join(', '),
      action: input.action,
      tier,
      resource: input.resource,
      resourceId: input.resourceId,
      outcome: input.outcome ?? 'success',
      before: input.before === undefined ? null : JSON.stringify(input.before),
      after: input.after === undefined ? null : JSON.stringify(input.after),
      reason: input.reason ?? null,
      ticket: input.ticket ?? null,
      ip: '10.24.8.19',
      correlationId: `cor_${Math.random().toString(36).slice(2, 10)}`,
      elevated: Boolean(s.elevationFor(input.action)),
    }
    set({ audit: [entry, ...s.audit] })
    return entry
  },

  addToast: (t) => {
    const toast = { ...t, id: uid('t') }
    set({ toasts: [...get().toasts, toast] })
    window.setTimeout(() => get().dismissToast(toast.id), t.kind === 'error' ? 9000 : 5200)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  saveRole: (role) => {
    const exists = get().roles.some((r) => r.id === role.id)
    set({ roles: exists ? get().roles.map((r) => (r.id === role.id ? role : r)) : [...get().roles, role] })
    get().logAudit({
      action: 'admin.role.write',
      resource: 'role',
      resourceId: role.id,
      after: { permissions: role.permissions.length },
      reason: 'Role definition updated in Admin & Governance',
    })
  },
  deleteRole: (roleId) => {
    set({ roles: get().roles.filter((r) => r.id !== roleId) })
    get().logAudit({ action: 'admin.role.write', resource: 'role', resourceId: roleId, after: { deleted: true } })
  },
  setUserRoles: (userId, roles) => {
    const before = get().users.find((u) => u.id === userId)?.roles
    set({ users: get().users.map((u) => (u.id === userId ? { ...u, roles } : u)) })
    get().logAudit({ action: 'admin.user.write', resource: 'user', resourceId: userId, before, after: roles, reason: 'Role assignment changed' })
  },
  setUserScope: (userId, resellerIds, label) => {
    set({ users: get().users.map((u) => (u.id === userId ? { ...u, scope: { resellerIds, label } } : u)) })
    get().logAudit({ action: 'admin.user.write', resource: 'user', resourceId: userId, after: { scope: label }, reason: 'Reseller scope changed' })
  },

  addUser: (input) => {
    const user: AdminUser = {
      id: uid('u'),
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      roles: input.roles,
      scope: input.scope,
      idpGroups: input.idpGroups,
      lastSeen: isoDateTime(Date.now()),
      status: 'active',
    }
    set({ users: [...get().users, user] })
    get().logAudit({
      action: 'admin.user.write',
      resource: 'user',
      resourceId: user.id,
      after: { created: true, email: user.email, roles: user.roles, scope: user.scope.label },
      reason: input.reason,
      ticket: input.ticket,
    })
    get().addToast({
      kind: 'success',
      title: `${user.name} added`,
      body: 'Prototype only — no invitation is sent. Switch to them from the account menu to see their view.',
    })
    return user
  },

  saveView: (view) => {
    const v: SavedView = { ...view, id: uid('v') }
    set({ savedViews: [...get().savedViews, v] })
    get().addToast({ kind: 'success', title: `Saved view "${v.name}"`, body: v.shared ? 'Shared with everyone who can see this table.' : 'Private to you.' })
  },
  deleteView: (id) => set({ savedViews: get().savedViews.filter((v) => v.id !== id || v.builtIn) }),

  createJob: (job) => {
    const s = get()
    const u = s.users.find((x) => x.id === s.currentUserId)
    const row: JobRow = {
      id: uid('JOB').toUpperCase(),
      progress: job.progress ?? 0,
      succeeded: 0,
      failed: 0,
      startedAt: isoDateTime(Date.now()),
      finishedAt: null,
      ...job,
      owner: job.owner || (u?.email.split('@')[0] ?? 'unknown'),
    }
    set({ jobs: [row, ...s.jobs] })
    return row
  },
  advanceJob: (id, patch) => set({ jobs: get().jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) }),
  cancelJob: (id) => {
    set({
      jobs: get().jobs.map((j) =>
        j.id === id ? { ...j, status: 'cancelled', cancellable: false, finishedAt: isoDateTime(Date.now()) } : j,
      ),
    })
    get().logAudit({ action: 'admin.job.cancel', resource: 'job', resourceId: id, reason: 'Cancelled from Job centre' })
  },

  createPayment: (input) => {
    const s = get()
    const u = s.users.find((x) => x.id === s.currentUserId)
    const awaitingApproval = input.amount > PAYMENT_APPROVAL_THRESHOLD
    const id = `PAY-M${Date.now().toString(36).toUpperCase()}`
    const now = isoDateTime(Date.now())
    const payment: Payment = {
      id,
      resellerId: input.resellerId,
      company: input.company,
      amount: input.amount,
      currency: input.currency,
      method: input.method,
      // Nothing is booked until an approver signs off above the threshold.
      status: awaitingApproval ? 'pending' : 'paid',
      createdAt: now,
      settledAt: awaitingApproval ? null : now,
      invoiceNumber: input.reference || '—',
      psp: 'Bank',
      pspReference: input.reference || 'manual entry',
      refundedAmount: 0,
      description: input.description || `Manual ${input.type} entry`,
      countryCode: '—',
    }
    set({ manualPayments: [payment, ...s.manualPayments] })

    if (awaitingApproval) {
      get().addApproval({
        kind: 'payment',
        label: `Recorded payment ${id} — ${input.company}`,
        amount: input.amount,
        requestedBy: u?.email.split('@')[0] ?? 'unknown',
        requestedAt: now,
        tier: 'T3',
        targetId: id,
        reason: input.reason,
        ticket: input.ticket,
        detail: [
          `${input.amount.toFixed(2)} ${input.currency} is above the ${PAYMENT_APPROVAL_THRESHOLD} approval threshold.`,
          `Type ${input.type} via ${input.method}; reference ${input.reference || 'none given'}.`,
          'The reseller balance is not credited until this is approved.',
        ],
        payload: { resellerId: input.resellerId, amount: input.amount, paymentId: id },
      })
    } else {
      // Below threshold the credit applies immediately.
      creditReseller(get, input.resellerId, input.amount)
    }

    get().logAudit({
      action: 'payment.create',
      resource: 'payment',
      resourceId: id,
      after: {
        resellerId: input.resellerId,
        amount: input.amount,
        currency: input.currency,
        type: input.type,
        method: input.method,
        awaitingApproval,
      },
      reason: input.reason,
      ticket: input.ticket,
    })
    set({ dataVersion: get().dataVersion + 1 })
    return { payment, awaitingApproval }
  },

  addApproval: (a) => {
    const row: PendingApproval = { ...a, id: uid('ap') }
    set({ approvals: [row, ...get().approvals] })
    return row
  },
  resolveApproval: (id, decision, note) => {
    const a = get().approvals.find((x) => x.id === id)
    set({ approvals: get().approvals.filter((x) => x.id !== id) })
    if (a?.kind === 'payment' && a.payload?.paymentId) {
      // An approved payment is what actually moves the balance.
      set({
        manualPayments: get().manualPayments.map((p) =>
          p.id === a.payload?.paymentId
            ? { ...p, status: decision === 'approved' ? 'paid' : 'failed', settledAt: decision === 'approved' ? isoDateTime(Date.now()) : null }
            : p,
        ),
      })
      if (decision === 'approved' && a.payload.resellerId && a.payload.amount) {
        creditReseller(get, a.payload.resellerId, a.payload.amount)
      }
      set({ dataVersion: get().dataVersion + 1 })
    }
    if (a) {
      get().logAudit({
        action: a.kind === 'refund' ? 'payment.refund.approve' : 'admin.elevation.grant',
        resource: a.kind,
        resourceId: a.targetId,
        outcome: decision === 'approved' ? 'success' : 'denied',
        after: { decision },
        reason: note || a.reason,
        ticket: a.ticket,
      })
    }
  },

  mutate: (datasetId, rowId, patch) => {
    patchRow(datasetId, rowId, patch)
    set({ dataVersion: get().dataVersion + 1 })
  },
  softDelete: (datasetId, rowId) => {
    markRemoved(datasetId, rowId)
    set({ dataVersion: get().dataVersion + 1 })
  },
  resetData: () => {
    resetPatches()
    set({ dataVersion: get().dataVersion + 1 })
  },
}))

// ── convenience hooks ──────────────────────────────────────────────────────

export function useCurrentUser(): AdminUser {
  const users = useStore((s) => s.users)
  const id = useStore((s) => s.currentUserId)
  return users.find((u) => u.id === id) ?? users[0]
}

/** Re-evaluates when roles, identity or elevations change. */
export function useCan(permission?: string): boolean {
  const can = useStore((s) => s.can)
  useStore((s) => s.currentUserId)
  useStore((s) => s.elevations)
  useStore((s) => s.roles)
  if (!permission) return true
  return can(permission)
}

export function useCanAny(permissions: string[]): boolean {
  const can = useStore((s) => s.can)
  const hasBase = useStore((s) => s.hasBase)
  useStore((s) => s.currentUserId)
  useStore((s) => s.elevations)
  return permissions.some((p) => can(p) || hasBase(p))
}

/** Base permission — true even when elevation has not been requested yet. */
export function useHasBase(permission?: string): boolean {
  const hasBase = useStore((s) => s.hasBase)
  useStore((s) => s.currentUserId)
  useStore((s) => s.roles)
  if (!permission) return true
  return hasBase(permission)
}

export function useEffectivePermissions(userId?: string): Set<string> {
  const users = useStore((s) => s.users)
  const roles = useStore((s) => s.roles)
  const currentId = useStore((s) => s.currentUserId)
  const u = users.find((x) => x.id === (userId ?? currentId))
  return u ? unionPermissions(u.roles, roles) : new Set<string>()
}
