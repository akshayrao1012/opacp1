import { useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCanAny, useStore } from '../../lib/store'
import { NoPermission, Tab, Tabs } from '../ui'
import { cn } from '../../lib/format'

export function PageHeader({
  title, subtitle, actions, meta, children,
}: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-ink-900">{title}</h1>
          {subtitle && <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-ink-500">{subtitle}</p>}
          {meta && <div className="mt-1.5 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

/**
 * Module wrapper. Enforces the read permission (the UI half of R-RBAC-2) and
 * renders the no-permission state rather than a blank page or a redirect.
 */
export function Module({
  permissions, what, children, className,
}: { permissions: string[]; what?: string; children: ReactNode; className?: string }) {
  const allowed = useCanAny(permissions)
  if (permissions.length && !allowed) return <NoPermission permission={permissions[0]} what={what} />
  return <div className={cn('space-y-4', className)}>{children}</div>
}

/** Tabs whose state lives in the URL, so every tab is linkable (R-IA-4). */
export function useTab(defaultTab: string, key = 'tab'): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams()
  const value = params.get(key) ?? defaultTab
  const set = (v: string) => {
    const next = new URLSearchParams(params)
    next.set(key, v)
    // A tab change resets table state — different tab, different table.
    for (const k of ['q', 'page', 'sort', 'f', 'size']) next.delete(k)
    setParams(next, { replace: true })
  }
  return [value, set]
}

export function TabBar({
  tabs, value, onChange,
}: { tabs: { id: string; label: string; count?: number }[]; value: string; onChange: (v: string) => void }) {
  return (
    <Tabs value={value} onChange={onChange}>
      {tabs.map((t) => (
        <Tab key={t.id} id={t.id} count={t.count}>
          {t.label}
        </Tab>
      ))}
    </Tabs>
  )
}

/** Records a T0 access event, matching "read is logged" in the tier table. */
export function useAccessLog(resource: string, resourceId = '—') {
  const logAudit = useStore((s) => s.logAudit)
  const userId = useStore((s) => s.currentUserId)
  useEffect(() => {
    logAudit({ action: `${resource}.read`, resource, resourceId, outcome: 'success' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, resourceId, userId])
}
