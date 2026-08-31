import { useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowRight, Check, Lock, ShieldAlert, Timer } from 'lucide-react'
import { ELEVATION_WINDOW_MINUTES, PERMISSION_META, TIERS, type Tier } from '../../lib/rbac'
import { useCan, useHasBase, useStore } from '../../lib/store'
import { Badge, Button, Callout, Checkbox, Field, Input, Modal, Select, Textarea, TierBadge } from '../ui'
import { cn } from '../../lib/format'

const TICKET_RE = /^ZD-\d{6}$/

export interface DestructiveSpec {
  /** Short imperative name, e.g. "Delete reseller". */
  title: string
  description: string
  /** Plain-language statement of what happens, in order. */
  consequences: string[]
  reversible: string
  permission: string
  tier: Tier
  /** The exact string the operator must type. */
  confirmValue: string
  confirmLabel?: string
  /** T3 requires a dry run before the confirm button unlocks. */
  requiresDryRun?: boolean
  dryRun?: () => Promise<DryRunResult> | DryRunResult
  approvers?: string[]
  onExecute: (ctx: { reason: string; ticket: string; approver: string | null; dryRun: DryRunResult | null }) => void
  cta?: string
}

export interface DryRunResult {
  summary: string
  willChange: { label: string; count: number; tone?: 'danger' | 'warn' | 'neutral' }[]
  rejected?: { label: string; count: number }[]
  notes?: string[]
}

export const DEFAULT_APPROVERS = [
  'h.vermeer — Finance Approver',
  'k.oosterhuis — Finance Approver',
  'a.rao — Super Admin',
  'n.bergstrom — Technical Operations lead',
]

/** P5 — the danger zone. Visually separated, never adjacent to read-only content. */
export function DangerZone({ items, title = 'Danger zone' }: { items: DestructiveSpec[]; title?: string }) {
  return (
    <section className="overflow-hidden rounded-xl border border-brand-200 bg-white">
      <header className="flex items-center gap-2 border-b border-brand-200 bg-brand-50 px-4 py-2.5">
        <AlertTriangle className="h-4 w-4 text-brand-700" />
        <h3 className="text-sm font-semibold text-brand-900">{title}</h3>
      </header>
      <div className="divide-y divide-ink-100">
        {items.map((item) => (
          <DangerRow key={item.title} spec={item} />
        ))}
      </div>
    </section>
  )
}

function DangerRow({ spec }: { spec: DestructiveSpec }) {
  const [open, setOpen] = useState(false)
  const hasBase = useHasBase(spec.permission)
  const can = useCan(spec.permission)
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 max-w-xl space-y-1">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-ink-900">{spec.title}</h4>
          <TierBadge tier={spec.tier} />
        </div>
        <p className="text-xs leading-relaxed text-ink-600">{spec.description}</p>
        <p className="text-2xs text-ink-500">
          Requires <code className="font-mono">{spec.permission}</code>
          {spec.tier === 'T3' && ' · dry run, typed confirmation and a second approver'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {!hasBase ? (
          <Badge tone="neutral">
            <Lock className="h-2.5 w-2.5" /> no permission
          </Badge>
        ) : !can ? (
          <ElevationButton permission={spec.permission} />
        ) : null}
        <Button variant="danger" disabled={!can} onClick={() => setOpen(true)}>
          {spec.cta ?? spec.title}
        </Button>
      </div>
      <DestructiveDialog spec={spec} open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

export function DestructiveDialog({
  spec, open, onClose,
}: { spec: DestructiveSpec; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [ticket, setTicket] = useState('')
  const [typed, setTyped] = useState('')
  const [approver, setApprover] = useState('')
  const [ack, setAck] = useState(false)
  const [dry, setDry] = useState<DryRunResult | null>(null)
  const [dryLoading, setDryLoading] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const addToast = useStore((s) => s.addToast)

  const needsDry = spec.tier === 'T3' && spec.requiresDryRun !== false && Boolean(spec.dryRun)
  const needsApprover = spec.tier === 'T3'
  const ticketError = touched.ticket && !TICKET_RE.test(ticket) ? 'Enter a Zendesk reference in the form ZD-123456 — it is validated against Zendesk.' : null
  const reasonError = touched.reason && reason.trim().length < 12 ? 'Give a reason of at least 12 characters. It is written to the audit log.' : null
  const confirmOk = typed === spec.confirmValue

  const ready =
    !reasonError && reason.trim().length >= 12 &&
    TICKET_RE.test(ticket) &&
    confirmOk && ack &&
    (!needsDry || Boolean(dry)) &&
    (!needsApprover || Boolean(approver))

  const reset = () => {
    setReason(''); setTicket(''); setTyped(''); setApprover(''); setAck(false); setDry(null); setTouched({})
  }

  const runDry = async () => {
    if (!spec.dryRun) return
    setDryLoading(true)
    const result = await spec.dryRun()
    setDry(result)
    setDryLoading(false)
  }

  return (
    <Modal
      open={open}
      onClose={() => { onClose(); reset() }}
      title={spec.title}
      subtitle={`${spec.tier} — ${TIERS[spec.tier].label}. ${TIERS[spec.tier].controls.join(' · ')}`}
      tone="danger"
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => { onClose(); reset() }}>Cancel</Button>
          <Button
            variant="danger"
            disabled={!ready}
            onClick={() => {
              spec.onExecute({ reason: reason.trim(), ticket, approver: approver || null, dryRun: dry })
              addToast({
                kind: needsApprover ? 'warn' : 'success',
                title: needsApprover ? 'Sent for second-approver sign-off' : `${spec.title} executed`,
                body: needsApprover ? `${approver} must approve before anything changes. Tracked in the job centre.` : 'Recorded in the audit log with reason and ticket reference.',
                href: needsApprover ? '/system/jobs' : undefined,
                hrefLabel: needsApprover ? 'Job centre' : undefined,
              })
              onClose()
              reset()
            }}
          >
            {needsApprover ? 'Request approval and queue' : spec.cta ?? 'Execute'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Callout tone="danger" title="What this does">
          <ol className="ml-3 list-decimal space-y-0.5">
            {spec.consequences.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          <p className="mt-1.5 font-medium">Reversibility: {spec.reversible}</p>
        </Callout>

        {needsDry && (
          <div className="rounded-lg border border-ink-200">
            <div className="flex items-center justify-between gap-2 border-b border-ink-200 bg-ink-50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink-800">Step 1 — mandatory dry run</span>
                {dry && (
                  <Badge tone="success">
                    <Check className="h-2.5 w-2.5" /> completed
                  </Badge>
                )}
              </div>
              <Button size="sm" variant="secondary" loading={dryLoading} onClick={runDry}>
                {dry ? 'Run again' : 'Run dry run'}
              </Button>
            </div>
            <div className="p-3">
              {!dry && !dryLoading && (
                <p className="text-xs text-ink-500">
                  The dry run shows exactly what would change. The confirm button stays locked until it has been run.
                </p>
              )}
              {dry && (
                <div className="space-y-2">
                  <p className="text-xs text-ink-700">{dry.summary}</p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {dry.willChange.map((w) => (
                      <div key={w.label} className="flex items-center justify-between gap-2 rounded-md border border-ink-150 bg-ink-50 px-2.5 py-1.5" style={{ borderColor: '#e6e9ee' }}>
                        <span className="text-xs text-ink-700">{w.label}</span>
                        <span className={cn('tabular text-sm font-semibold', w.tone === 'danger' ? 'text-brand-700' : w.tone === 'warn' ? 'text-amber-700' : 'text-ink-900')}>
                          {w.count.toLocaleString('en-GB')}
                        </span>
                      </div>
                    ))}
                  </div>
                  {dry.rejected?.length ? (
                    <ul className="space-y-0.5 text-2xs text-ink-500">
                      {dry.rejected.map((r) => (
                        <li key={r.label}>
                          {r.count.toLocaleString('en-GB')} × {r.label}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {dry.notes?.map((n) => (
                    <p key={n} className="text-2xs text-ink-500">
                      {n}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Reason" required error={reasonError} className="sm:col-span-2">
            <Textarea
              rows={2}
              value={reason}
              onBlur={() => setTouched((t) => ({ ...t, reason: true }))}
              onChange={(e) => setReason(e.target.value)}
              invalid={Boolean(reasonError)}
              placeholder="Why is this being done? Written verbatim to the audit log."
              className="font-sans text-sm"
            />
          </Field>
          <Field label="Zendesk ticket" required error={ticketError} hint="Validated against Zendesk before the action runs.">
            <Input
              value={ticket}
              onBlur={() => setTouched((t) => ({ ...t, ticket: true }))}
              onChange={(e) => setTicket(e.target.value.toUpperCase())}
              invalid={Boolean(ticketError)}
              placeholder="ZD-448120"
            />
          </Field>
          {needsApprover && (
            <Field label="Second approver" required hint="Notified immediately; nothing runs before they sign off.">
              <Select value={approver} onChange={(e) => setApprover(e.target.value)}>
                <option value="">Select an approver…</option>
                {(spec.approvers ?? DEFAULT_APPROVERS).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field
            label={spec.confirmLabel ?? `Type "${spec.confirmValue}" to confirm`}
            required
            className="sm:col-span-2"
            error={typed && !confirmOk ? 'Does not match.' : null}
          >
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              invalid={Boolean(typed) && !confirmOk}
              placeholder={spec.confirmValue}
              className="font-mono"
            />
          </Field>
        </div>

        <Checkbox
          label="I understand the consequences listed above and that this action is audited."
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
        />
      </div>
    </Modal>
  )
}

/** R-RBAC-5 — request time-boxed elevation for a T3 permission. */
export function ElevationButton({ permission, size = 'md' }: { permission: string; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [ticket, setTicket] = useState('')
  const requestElevation = useStore((s) => s.requestElevation)
  const meta = PERMISSION_META[permission]
  const ok = reason.trim().length >= 12 && TICKET_RE.test(ticket)
  return (
    <>
      <Button size={size} variant="danger-outline" onClick={() => setOpen(true)}>
        <ShieldAlert className="h-3.5 w-3.5" /> Request elevation
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Request time-boxed elevation"
        subtitle={`${permission} — ${meta?.label ?? 'Tier 3 permission'}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!ok}
              onClick={() => {
                requestElevation(permission, reason.trim(), ticket)
                setOpen(false)
                setReason('')
                setTicket('')
              }}
            >
              Elevate for {ELEVATION_WINDOW_MINUTES} minutes
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Callout tone="warn" icon={<Timer className="h-4 w-4" />} title="Tier 3 permissions are never held permanently">
            Elevation lasts {ELEVATION_WINDOW_MINUTES} minutes, is written to the audit log, and is announced to
            <code className="mx-1 font-mono">#acp-elevations</code>. It drops automatically — nothing to remember to switch off.
          </Callout>
          <Field label="Reason" required hint="At least 12 characters.">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="font-sans text-sm" placeholder="Abuse escalation NL-2026-8841 requires bulk suspension of 1,284 domains." />
          </Field>
          <Field label="Zendesk ticket" required>
            <Input value={ticket} onChange={(e) => setTicket(e.target.value.toUpperCase())} placeholder="ZD-448377" />
          </Field>
        </div>
      </Modal>
    </>
  )
}

/** Wraps an action that needs elevation, showing the gate rather than a dead button. */
export function ElevationGate({
  permission, children, what,
}: { permission: string; children: ReactNode; what?: string }) {
  const hasBase = useHasBase(permission)
  const can = useCan(permission)
  if (can) return <>{children}</>
  if (!hasBase) {
    return (
      <Callout tone="info" icon={<Lock className="h-4 w-4" />} title={`You cannot ${what ?? 'run this operation'}`}>
        It requires <code className="font-mono">{permission}</code>, which none of your roles grant.
      </Callout>
    )
  }
  return (
    <Callout tone="warn" icon={<ShieldAlert className="h-4 w-4" />} title="Elevation required">
      <p>
        {what ?? 'This operation'} is Tier 3. Your role grants <code className="font-mono">{permission}</code>, but it is only active
        during a time-boxed elevation window.
      </p>
      <div className="mt-2">
        <ElevationButton permission={permission} size="sm" />
      </div>
    </Callout>
  )
}

/** Shared reason + ticket capture for T2 actions. */
export function ReasonTicketFields({
  reason, ticket, onReason, onTicket, reasonPlaceholder, disabled,
}: {
  reason: string
  ticket: string
  onReason: (v: string) => void
  onTicket: (v: string) => void
  reasonPlaceholder?: string
  disabled?: boolean
}) {
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const ticketError = touched.ticket && ticket && !TICKET_RE.test(ticket) ? 'Format must be ZD-123456.' : null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Reason" required className="sm:col-span-2" error={touched.reason && reason.trim().length < 8 ? 'Required — written to the audit log.' : null}>
        <Textarea
          rows={2}
          disabled={disabled}
          value={reason}
          onBlur={() => setTouched((t) => ({ ...t, reason: true }))}
          onChange={(e) => onReason(e.target.value)}
          className="font-sans text-sm"
          placeholder={reasonPlaceholder ?? 'Why is this change being made?'}
        />
      </Field>
      <Field label="Zendesk ticket" required error={ticketError} hint="T2 actions require a ticket reference.">
        <Input
          disabled={disabled}
          value={ticket}
          onBlur={() => setTouched((t) => ({ ...t, ticket: true }))}
          onChange={(e) => onTicket(e.target.value.toUpperCase())}
          invalid={Boolean(ticketError)}
          placeholder="ZD-448120"
        />
      </Field>
    </div>
  )
}

export function isValidTicket(t: string) {
  return TICKET_RE.test(t)
}

export function T2Confirm({
  open, onClose, title, description, permission, onConfirm, cta = 'Apply change',
}: {
  open: boolean
  onClose: () => void
  title: string
  description: ReactNode
  permission: string
  onConfirm: (ctx: { reason: string; ticket: string }) => void
  cta?: string
}) {
  const [reason, setReason] = useState('')
  const [ticket, setTicket] = useState('')
  const ready = reason.trim().length >= 8 && TICKET_RE.test(ticket)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={`T2 — sensitive write. Requires ${permission}, a reason and a ticket reference.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => {
              onConfirm({ reason: reason.trim(), ticket })
              setReason('')
              setTicket('')
              onClose()
            }}
          >
            {cta} <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-xs leading-relaxed text-ink-600">{description}</div>
        <ReasonTicketFields reason={reason} ticket={ticket} onReason={setReason} onTicket={setTicket} />
      </div>
    </Modal>
  )
}
