import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3, CheckCircle2, ChevronDown, ChevronRight, CreditCard, Globe, Home, LayoutDashboard,
  Package, PanelLeftClose, PanelLeftOpen, RotateCcw, Search, Settings, ShieldAlert, Timer, Users,
  X, XCircle, Info, AlertTriangle, Rows3, FileText,
} from 'lucide-react'
import { COVERAGE_ITEM, NAV, crumbsFor, type NavGroup } from '../../lib/nav'
import { useCanAny, useCurrentUser, useStore } from '../../lib/store'
import { PERMISSION_META } from '../../lib/rbac'
import { kycQueueCounts } from '../../lib/mock/customers'
import { cn, initials, num } from '../../lib/format'
import { Badge, Button, Tooltip } from '../ui'
import { Omnisearch } from './Omnisearch'
import { QuickSearch } from './QuickSearch'

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Home, LayoutDashboard, Users, Globe, Package, CreditCard, ShieldAlert, BarChart3, Settings,
}

export function AppShell() {
  const collapsed = useStore((s) => s.navCollapsed)
  const setCollapsed = useStore((s) => s.setNavCollapsed)
  const location = useLocation()

  return (
    <div className="flex h-full">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <ElevationBanner />
        <main className="flex-1 overflow-y-auto scrollbar-thin bg-ink-50">
          <div className="mx-auto w-full max-w-[1680px] px-4 py-4 sm:px-6 sm:py-5">
            <Breadcrumbs key={location.pathname} />
            <Outlet />
          </div>
        </main>
      </div>
      <Omnisearch />
      <Toasts />
    </div>
  )
}

// ───────────────────────────────────────────────────────────── sidebar

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-ink-200 bg-white transition-[width] duration-200',
        collapsed ? 'w-[62px]' : 'w-[248px]',
      )}
    >
      <Link
        to="/"
        className={cn(
          'flex items-center gap-2.5 border-b border-ink-200 px-3 hover:bg-ink-50',
          collapsed ? 'h-14 justify-center' : 'h-14',
        )}
        title="Openprovider Admin Control Panel"
      >
        {collapsed ? (
          // The wordmark is unreadable at rail width, so the collapsed rail keeps
          // the monogram in the brand red.
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-600 text-xs font-bold text-white">OP</span>
        ) : (
          <span className="min-w-0">
            <img src="/openprovider-logo.png" alt="Openprovider" className="h-[30px] w-auto" />
            <span className="mt-0.5 block text-2xs tracking-wide text-ink-500">Admin Control Panel</span>
          </span>
        )}
      </Link>

      <nav className="flex-1 space-y-0.5 overflow-y-auto scrollbar-thin p-2">
        {NAV.map((group) => (
          <NavGroupBlock key={group.id} group={group} collapsed={collapsed} />
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-ink-200 p-2">
        <NavLink
          to={COVERAGE_ITEM.to}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors',
              isActive ? 'bg-brand-50 font-medium text-brand-800' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800',
              collapsed && 'justify-center px-0',
            )
          }
          title="PRD coverage — how this prototype maps onto the document"
        >
          <FileText className="h-4 w-4 shrink-0" />
          {!collapsed && 'PRD coverage'}
        </NavLink>
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-500 hover:bg-ink-100 hover:text-ink-800"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  )
}

function NavGroupBlock({ group, collapsed }: { group: NavGroup; collapsed: boolean }) {
  const location = useLocation()
  const Icon = ICONS[group.icon] ?? LayoutDashboard
  const items = group.items
  const active = items.some((i) => location.pathname === i.to || (i.to !== '/' && location.pathname.startsWith(i.to)))
  const [open, setOpen] = useState(active)
  useEffect(() => {
    if (active) setOpen(true)
  }, [active])

  // R-IA-3: a group whose every item is hidden by permission disappears entirely.
  const anyVisible = useGroupVisible(group)
  if (!anyVisible) return null

  if (group.id === 'home') {
    return (
      <NavLink
        to="/"
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors',
            isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-100',
            collapsed && 'justify-center px-0',
          )
        }
        title="Dashboard"
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && 'Home'}
      </NavLink>
    )
  }

  if (collapsed) {
    return (
      <Tooltip content={group.label}>
        <NavLink
          to={items[0].to}
          className={cn(
            'flex h-9 w-full items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100',
            active && 'bg-brand-50 text-brand-700',
          )}
        >
          <Icon className="h-4 w-4" />
        </NavLink>
      </Tooltip>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors',
          active ? 'text-brand-800' : 'text-ink-700 hover:bg-ink-100',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        {group.adminOnly && <span className="rounded bg-ink-100 px-1 py-px text-2xs font-normal text-ink-500">admin</span>}
        {open ? <ChevronDown className="h-3.5 w-3.5 text-ink-400" /> : <ChevronRight className="h-3.5 w-3.5 text-ink-400" />}
      </button>
      {open && (
        <ul className="mb-1 ml-[22px] space-y-px border-l border-ink-150 pl-2" style={{ borderColor: '#e6e9ee' }}>
          {items.map((item) => (
            <NavItemRow key={item.to} to={item.to} label={item.label} permissions={item.permissions} badge={item.badge} />
          ))}
        </ul>
      )}
    </div>
  )
}

function useGroupVisible(group: NavGroup): boolean {
  const perms = group.items.flatMap((i) => i.permissions)
  const anyOpen = group.items.some((i) => i.permissions.length === 0)
  const allowed = useCanAny(perms)
  return anyOpen || allowed
}

function NavItemRow({
  to, label, permissions, badge,
}: { to: string; label: string; permissions: string[]; badge?: 'approvals' | 'kyc' | 'jobs' | 'abuse' }) {
  const allowed = useCanAny(permissions)
  const approvals = useStore((s) => s.approvals.length)
  const jobs = useStore((s) => s.jobs.filter((j) => j.status === 'running' || j.status === 'awaiting_approval').length)
  const kyc = useMemo(() => (badge === 'kyc' ? kycQueueCounts().in_review : 0), [badge])
  const abuse = useStore((s) => s.approvals.filter((a) => a.kind === 'bulk_job').length)
  if (permissions.length && !allowed) return null
  const count = badge === 'approvals' ? approvals : badge === 'jobs' ? jobs : badge === 'kyc' ? kyc : badge === 'abuse' ? abuse : 0
  return (
    <li>
      <NavLink
        to={to}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
            isActive ? 'bg-brand-50 font-medium text-brand-800' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
          )
        }
      >
        <span className="flex-1 truncate">{label}</span>
        {count > 0 && <Badge tone={badge === 'approvals' || badge === 'abuse' ? 'danger' : 'info'}>{count > 99 ? '99+' : count}</Badge>}
      </NavLink>
    </li>
  )
}

// ───────────────────────────────────────────────────────────── top bar

function TopBar() {
  const setOmniOpen = useStore((s) => s.setOmniOpen)
  const density = useStore((s) => s.density)
  const setDensity = useStore((s) => s.setDensity)
  const resetData = useStore((s) => s.resetData)
  const user = useCurrentUser()
  const roles = useStore((s) => s.roles)
  const users = useStore((s) => s.users)
  const signInAs = useStore((s) => s.signInAs)
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const roleNames = user.roles.map((r) => roles.find((x) => x.id === r)?.name ?? r).join(', ')

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ink-200 bg-white px-4">
      <QuickSearch />

      <div className="flex shrink-0 items-center gap-2 border-l border-ink-200 pl-3">
        <Tooltip content="Search anything — reseller, domain, payment, license, handle (⌘K)">
          <Button size="icon" variant="ghost" onClick={() => setOmniOpen(true)} aria-label="Open omnisearch">
            <Search className="h-4 w-4" />
          </Button>
        </Tooltip>
        <div className="relative" ref={ref}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-ink-100"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-ink-800 text-2xs font-semibold text-white">
              {initials(user.name)}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-xs font-medium leading-tight text-ink-900">{user.name}</span>
              <span className="block max-w-[180px] truncate text-2xs leading-tight text-ink-500">{roleNames}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 z-40 mt-1 w-80 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop">
              <div className="border-b border-ink-100 px-3 py-2.5">
                <p className="text-xs font-semibold text-ink-900">{user.name}</p>
                <p className="text-2xs text-ink-500">{user.email}</p>
                <p className="mt-1 text-2xs text-ink-500">
                  Scope: <span className="text-ink-700">{user.scope.label}</span>
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {user.idpGroups.map((g) => (
                    <Badge key={g} tone="info">{g}</Badge>
                  ))}
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto scrollbar-thin p-1.5">
                <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-ink-400">
                  Sign in as — see the ACP through another role
                </p>
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { signInAs(u.id); setMenuOpen(false) }}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-ink-50',
                      u.id === user.id && 'bg-brand-50',
                    )}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-200 text-2xs font-semibold text-ink-700">
                      {initials(u.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs text-ink-900">{u.name}</span>
                      <span className="block truncate text-2xs text-ink-500">
                        {u.roles.map((r) => roles.find((x) => x.id === r)?.name ?? r).join(', ')}
                        {u.scope.resellerIds && ' · scoped'}
                        {u.status === 'suspended' && ' · suspended'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="space-y-0.5 border-t border-ink-100 p-1.5">
                <button
                  onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-700 hover:bg-ink-50"
                >
                  <Rows3 className="h-3.5 w-3.5 text-ink-400" />
                  Row density
                  <span className="ml-auto text-2xs text-ink-500">{density}</span>
                </button>
                <button
                  onClick={() => { resetData(); setMenuOpen(false) }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-700 hover:bg-ink-50"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-ink-400" />
                  Reset prototype data
                </button>
              </div>
              <div className="border-t border-ink-100 px-3 py-2">
                <Link to="/admin/users" className="text-2xs text-brand-700 hover:underline" onClick={() => setMenuOpen(false)}>
                  Manage users, roles and permissions
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function ElevationBanner() {
  const elevations = useStore((s) => s.elevations)
  const dropElevation = useStore((s) => s.dropElevation)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!elevations.length) return
    const t = window.setInterval(() => setTick((v) => v + 1), 1000)
    return () => window.clearInterval(t)
  }, [elevations.length])

  const live = elevations.filter((e) => e.expiresAt > Date.now())
  if (!live.length) return null

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2">
      <ShieldAlert className="h-4 w-4 shrink-0 text-amber-700" />
      <p className="text-xs font-medium text-amber-900">
        Elevated access active — announced to #acp-elevations
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {live.map((e) => {
          const left = Math.max(0, Math.round((e.expiresAt - Date.now()) / 1000))
          const mm = Math.floor(left / 60)
          const ss = String(left % 60).padStart(2, '0')
          return (
            <span key={e.permission} className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-2 py-0.5 text-2xs text-amber-900">
              <Timer className="h-3 w-3" />
              <code className="font-mono">{e.permission}</code>
              <span className="tabular font-medium">{mm}:{ss}</span>
              <button onClick={() => dropElevation(e.permission)} aria-label={`Drop elevation for ${e.permission}`}>
                <X className="h-3 w-3 hover:text-brand-700" />
              </button>
            </span>
          )
        })}
      </div>
      <span className="ml-auto hidden text-2xs text-amber-800 sm:block">
        {PERMISSION_META[live[0].permission]?.label}
      </span>
    </div>
  )
}

function Breadcrumbs() {
  const location = useLocation()
  const crumbs = crumbsFor(location.pathname)
  if (crumbs.length <= 1 && location.pathname === '/') return null
  return (
    <nav className="mb-3 flex flex-wrap items-center gap-1 text-2xs text-ink-500" aria-label="Breadcrumb">
      <Link to="/" className="hover:text-brand-700">ACP</Link>
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-ink-300" />
          {c.to && i < crumbs.length - 1 ? (
            <Link to={c.to} className="hover:text-brand-700">{c.label}</Link>
          ) : (
            <span className={cn(i === crumbs.length - 1 && 'font-medium text-ink-700')}>{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

// ───────────────────────────────────────────────────────────── toasts

function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  const ICON = {
    success: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
    error: <XCircle className="h-4 w-4 text-brand-700" />,
    warn: <AlertTriangle className="h-4 w-4 text-amber-600" />,
    info: <Info className="h-4 w-4 text-sky-600" />,
  }
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex gap-2.5 rounded-xl border border-ink-200 bg-white p-3 shadow-pop animate-scale-in"
        >
          <span className="mt-px shrink-0">{ICON[t.kind]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-ink-900">{t.title}</p>
            {t.body && <p className="mt-0.5 text-2xs leading-relaxed text-ink-600">{t.body}</p>}
            {t.href && (
              <Link to={t.href} className="mt-1 inline-block text-2xs font-medium text-brand-700 hover:underline" onClick={() => dismiss(t.id)}>
                {t.hrefLabel ?? 'Open'} →
              </Link>
            )}
            {t.correlationId && <p className="mt-1 font-mono text-2xs text-ink-400">{t.correlationId}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X className="h-3.5 w-3.5 text-ink-400 hover:text-ink-700" />
          </button>
        </div>
      ))}
    </div>
  )
}

export function NotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="text-sm font-semibold text-ink-900">This page does not exist</p>
      <p className="mt-1 text-xs text-ink-500">
        The old ACP shipped 404s in production navigation — <code className="font-mono">Licenses → Change Owner</code> and{' '}
        <code className="font-mono">Resellers → Disabled modify domain</code>. Those entries are retired, not linked.
      </p>
      <p className="mt-3">
        <Link to="/" className="text-xs font-medium text-brand-700 hover:underline">Back to the dashboard</Link>
      </p>
      <p className="mt-6 text-2xs text-ink-400">{num(0)} dead links in this navigation.</p>
    </div>
  )
}
