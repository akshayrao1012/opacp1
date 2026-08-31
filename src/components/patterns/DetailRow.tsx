import type { ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { useCan } from '../../lib/store'
import { Card, CardHeader, Tooltip } from '../ui'

/**
 * A label/value row with an optional inline edit affordance — the shape the
 * legacy detail screens used (label, value, "Edit ✎"), except the pencil is
 * permission-checked and opens the tier-appropriate confirmation.
 */
export function DetailRow({
  label, value, onEdit, permission, hint,
}: { label: string; value: ReactNode; onEdit?: () => void; permission?: string; hint?: string }) {
  const can = useCan(permission)
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink-100 py-1.5 last:border-0">
      <dt className="shrink-0 text-xs text-ink-500">
        {label}
        {hint && <span className="ml-1 text-2xs text-ink-400">{hint}</span>}
      </dt>
      <dd className="flex min-w-0 items-baseline gap-1.5 text-right text-xs text-ink-900">
        <span className="min-w-0 break-words">{value}</span>
        {onEdit && (
          <Tooltip content={can ? 'Edit' : 'You do not have permission to edit this'}>
            <button
              onClick={onEdit}
              disabled={!can}
              className="shrink-0 rounded p-0.5 text-ink-400 hover:bg-ink-100 hover:text-brand-700 disabled:opacity-40"
              aria-label={`Edit ${label}`}
            >
              <Pencil className="h-3 w-3" />
            </button>
          </Tooltip>
        )}
      </dd>
    </div>
  )
}

export function YesNoValue({ v }: { v: 'yes' | 'no' | boolean }) {
  const yes = v === true || v === 'yes'
  return yes ? <span className="font-medium text-brand-700">Yes</span> : <span className="text-ink-600">No</span>
}

export function FieldGroup({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <dl className="px-4 py-2">{children}</dl>
    </Card>
  )
}
