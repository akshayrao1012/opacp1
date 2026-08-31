import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, History } from 'lucide-react'
import { ActivityTimeline } from './Activity'
import { Card, CardHeader } from '../ui'
import { cn } from '../../lib/format'

export interface KeyFact {
  label: string
  value: ReactNode
}

/**
 * P2 — entity detail. One header shape, one tab strip, a related-records rail
 * and an activity timeline on every entity. Reseller detail set this pattern;
 * Domain, Payment, License and KYC case inherit it unchanged.
 */
export function EntityDetail({
  backTo, backLabel, identifier, title, status, keyFacts, actions, tabs, children, related, resource, resourceId, alerts,
}: {
  backTo: string
  backLabel: string
  identifier: ReactNode
  title: ReactNode
  status?: ReactNode
  keyFacts: KeyFact[]
  actions?: ReactNode
  tabs?: ReactNode
  children: ReactNode
  related?: ReactNode
  resource: string
  resourceId: string
  alerts?: ReactNode
}) {
  return (
    <div className="space-y-4">
      <Link to={backTo} className="inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-brand-700">
        <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
      </Link>

      <header className="space-y-3 rounded-xl border border-ink-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-2xs text-ink-600">{identifier}</code>
              {status}
            </div>
            <h1 className="truncate text-lg font-semibold tracking-tight text-ink-900">{title}</h1>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>

        <dl className="grid gap-x-6 gap-y-2 border-t border-ink-100 pt-3 sm:grid-cols-3 lg:grid-cols-5">
          {keyFacts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-2xs font-medium uppercase tracking-wide text-ink-400">{f.label}</dt>
              <dd className="mt-0.5 truncate text-sm text-ink-800">{f.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      {alerts}
      {tabs}

      <div className={cn('grid gap-4', related ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : 'grid-cols-1')}>
        <div className="min-w-0 space-y-4">{children}</div>
        {related && (
          <aside className="space-y-4">
            {related}
            <Card>
              <CardHeader title="Activity" subtitle="Every state-changing action" icon={<History className="h-4 w-4" />} />
              <div className="p-2">
                <ActivityTimeline resource={resource} resourceId={resourceId} limit={6} />
              </div>
            </Card>
          </aside>
        )}
      </div>
    </div>
  )
}

export function RelatedList({
  title, subtitle, items, footer, empty,
}: {
  title: string
  subtitle?: string
  items: { key: string; primary: ReactNode; secondary?: ReactNode; to?: string; trailing?: ReactNode }[]
  footer?: ReactNode
  empty?: string
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <ul className="divide-y divide-ink-100">
        {items.length === 0 && <li className="px-4 py-6 text-center text-xs text-ink-500">{empty ?? 'Nothing related'}</li>}
        {items.map((it) => {
          const body = (
            <div className="flex items-center justify-between gap-2 px-4 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-ink-800">{it.primary}</p>
                {it.secondary && <p className="truncate text-2xs text-ink-500">{it.secondary}</p>}
              </div>
              {it.trailing}
            </div>
          )
          return (
            <li key={it.key} className="hover:bg-ink-50">
              {it.to ? <Link to={it.to}>{body}</Link> : body}
            </li>
          )
        })}
      </ul>
      {footer && <div className="border-t border-ink-100 px-4 py-2 text-2xs">{footer}</div>}
    </Card>
  )
}
