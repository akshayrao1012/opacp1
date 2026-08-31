import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react'
import { useStore } from '../../lib/store'
import type { AuditEntry } from '../../lib/mock/admin'
import { Gen } from '../../lib/rng'
import { Badge, Button, EmptyState, TierBadge } from '../ui'
import { cn, dateTime, relative } from '../../lib/format'

const ENTITY_EVENTS: Record<string, [string, AuditEntry['tier']][]> = {
  reseller: [
    ['reseller.write', 'T1'], ['reseller.membership.write', 'T2'], ['payment.read', 'T0'],
    ['reseller.notification.write', 'T2'], ['reseller.approve', 'T2'], ['ops.settings.write', 'T2'],
  ],
  domain: [
    ['domain.write', 'T1'], ['domain.transfer.write', 'T2'], ['domain.epp.read', 'T0'],
    ['domain.bulk.suspend', 'T3'], ['product.dns.write', 'T1'],
  ],
  payment: [['payment.read', 'T0'], ['payment.refund.create', 'T2'], ['payment.refund.approve', 'T3']],
  license: [['product.license.write', 'T1'], ['product.license.migrate', 'T3']],
  kyc_case: [['customer.kyc.read', 'T0'], ['customer.kyc.decide', 'T2']],
}

/**
 * P7 — the entity half of the audit story. Live entries written this session
 * are merged with a deterministic history so the timeline is never empty.
 */
export function ActivityTimeline({
  resource, resourceId, limit = 8, showAllLink = true,
}: { resource: string; resourceId: string; limit?: number; showAllLink?: boolean }) {
  const audit = useStore((s) => s.audit)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const history = useMemo<AuditEntry[]>(() => {
    const template = ENTITY_EVENTS[resource] ?? [[`${resource}.read`, 'T0']]
    const g = new Gen('timeline', resource, resourceId)
    return Array.from({ length: 7 }, (_, i) => {
      const [action, tier] = g.pick(template)
      const needsReason = tier === 'T2' || tier === 'T3'
      return {
        id: `AUD-H-${resourceId}-${i}`,
        at: g.dateTimeOffset(-2400, -2),
        actor: g.pick(['Lotte Jansen', 'Marek Kowalski', 'Fabienne Moreau', 'Nils Bergström', 'Iris Lammers', 'system']),
        actorEmail: 'user@openprovider.com',
        role: g.pick(['Support Agent (L1)', 'Support Lead (L2)', 'Finance', 'Technical Operations', 'Sales / Account Management']),
        action,
        tier,
        resource,
        resourceId,
        outcome: g.weighted<AuditEntry['outcome']>([['success', 92], ['denied', 5], ['failed', 3]]),
        before: needsReason ? '{"status":"active"}' : null,
        after: needsReason ? '{"status":"updated"}' : null,
        reason: needsReason ? g.pick(['Customer request', 'Abuse report NL-2026-8841', 'Billing correction', 'Registry escalation']) : null,
        ticket: needsReason ? `ZD-${g.int(400000, 499999)}` : null,
        ip: `${g.int(31, 213)}.${g.int(0, 255)}.${g.int(0, 255)}.${g.int(1, 254)}`,
        correlationId: `cor_${g.int(1e9, 9e9).toString(36)}`,
        elevated: tier === 'T3',
      }
    }).sort((a, b) => (a.at < b.at ? 1 : -1))
  }, [resource, resourceId])

  const live = audit.filter((a) => a.resourceId === resourceId)
  const all = [...live, ...history].sort((a, b) => (a.at < b.at ? 1 : -1))
  const shown = showAll ? all : all.slice(0, limit)

  if (!all.length) {
    return <EmptyState compact icon={<Activity className="h-4 w-4" />} title="No recorded activity" body="Every state-changing action on this record will appear here." />
  }

  return (
    <div className="space-y-1">
      <ol className="relative space-y-0.5 pl-4">
        <span className="absolute bottom-2 left-[5px] top-2 w-px bg-ink-200" aria-hidden />
        {shown.map((e) => {
          const open = expanded === e.id
          return (
            <li key={e.id} className="relative">
              <span
                className={cn(
                  'absolute -left-[11px] top-[11px] h-2 w-2 rounded-full ring-2 ring-white',
                  e.outcome === 'denied' ? 'bg-brand-600' : e.tier === 'T3' ? 'bg-brand-700' : e.tier === 'T2' ? 'bg-amber-500' : 'bg-ink-300',
                )}
              />
              <button
                onClick={() => setExpanded(open ? null : e.id)}
                className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-ink-50"
              >
                {open ? <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-ink-400" /> : <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-ink-400" />}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <code className="font-mono text-xs text-ink-800">{e.action}</code>
                    <TierBadge tier={e.tier} />
                    {e.outcome !== 'success' && <Badge tone="danger">{e.outcome}</Badge>}
                    {e.elevated && (
                      <Badge tone="warn">
                        <ShieldAlert className="h-2.5 w-2.5" /> elevated
                      </Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block text-2xs text-ink-500">
                    {e.actor} · {e.role} · {relative(e.at)}
                  </span>
                </span>
              </button>
              {open && (
                <dl className="ml-7 mb-2 grid gap-x-4 gap-y-1 rounded-lg border border-ink-150 bg-ink-50 p-2.5 text-2xs sm:grid-cols-2" style={{ borderColor: '#e6e9ee' }}>
                  <Row label="When" value={dateTime(e.at)} />
                  <Row label="Actor" value={`${e.actor} (${e.actorEmail})`} />
                  <Row label="Role in effect" value={e.role} />
                  <Row label="Source IP" value={e.ip} />
                  {e.reason && <Row label="Reason" value={e.reason} />}
                  {e.ticket && <Row label="Ticket" value={e.ticket} />}
                  {e.before && <Row label="Before" value={<code className="font-mono">{e.before}</code>} />}
                  {e.after && <Row label="After" value={<code className="font-mono">{e.after}</code>} />}
                  <Row label="Correlation ID" value={<code className="font-mono">{e.correlationId}</code>} />
                </dl>
              )}
            </li>
          )
        })}
      </ol>
      <div className="flex items-center gap-2 pl-1">
        {all.length > limit && (
          <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show less' : `Show ${all.length - limit} more`}
          </Button>
        )}
        {showAllLink && (
          <Link to={`/system/audit?q=${encodeURIComponent(resourceId)}`} className="text-2xs text-brand-700 hover:underline">
            Open in audit log
          </Link>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="break-words text-ink-700">{value}</dd>
    </div>
  )
}
