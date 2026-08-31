import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, Check, CheckCircle2, ClipboardPaste, Download, FileUp, Play, RotateCcw,
  ShieldAlert, Sparkles, X,
} from 'lucide-react'
import { Module, PageHeader } from '../components/patterns/Page'
import { DestructiveDialog, ElevationGate, type DryRunResult } from '../components/patterns/Destructive'
import {
  Badge, Button, Callout, Card, CardHeader, Field, Input, Progress, Select, StatTile, Switch,
  Textarea, TierBadge, Tooltip,
} from '../components/ui'
import { BULK_OPERATIONS, operationById, type BulkOperation, type RowVerdict } from '../lib/bulk'
import { useCan, useHasBase, useStore } from '../lib/store'
import { cn, csvDownload, num, parseIdentifierList, pluralise } from '../lib/format'

type Step = 1 | 2 | 3 | 4 | 5

const STEP_LABELS = ['Input', 'Validate', 'Dry run', 'Confirm', 'Execute']

export function BulkConsole() {
  const [params, setParams] = useSearchParams()
  const opId = params.get('op') ?? BULK_OPERATIONS[0].id
  const op = operationById(opId) ?? BULK_OPERATIONS[0]

  const [input, setInput] = useState(params.get('input') ?? '')
  const [values, setValues] = useState<Record<string, string>>({})
  const [verdicts, setVerdicts] = useState<RowVerdict[] | null>(null)
  const [dry, setDry] = useState<DryRunResult | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ jobId: string; ok: number; failed: number; rows: RowVerdict[]; awaiting: string | null } | null>(null)

  const store = useStore()
  const canRun = useCan(op.permission)
  const hasBase = useHasBase(op.permission)

  // Reset the wizard whenever the operation changes.
  useEffect(() => {
    setValues(Object.fromEntries((op.extraFields ?? []).map((f) => [f.key, String(f.default ?? '')])))
    setVerdicts(null)
    setDry(null)
    setResult(null)
  }, [op])

  useEffect(() => {
    const incoming = params.get('input')
    if (incoming) setInput(incoming)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opId])

  const rows = useMemo(() => parseIdentifierList(input), [input])
  const missingRequired = (op.extraFields ?? []).filter((f) => f.required && !values[f.key]).map((f) => f.label)
  const criteria = op.inputMode === 'criteria' ? op.criteriaSummary?.(values) : undefined

  const okCount = verdicts?.filter((v) => v.ok).length ?? 0
  const warnCount = verdicts?.filter((v) => v.status === 'warning').length ?? 0
  const rejectedCount = verdicts?.filter((v) => !v.ok).length ?? 0

  const step: Step = result ? 5 : dry ? 4 : verdicts ? 3 : rows.length || criteria ? 2 : 1

  const runValidate = () => {
    setBusy(true)
    window.setTimeout(() => {
      setVerdicts(op.validate(rows, values))
      setDry(null)
      setBusy(false)
    }, 260)
  }

  const runDry = (): DryRunResult => {
    if (op.inputMode === 'criteria') {
      const c = op.criteriaSummary?.(values)
      const r: DryRunResult = {
        summary: c?.description ?? 'Criteria evaluated.',
        willChange: [{ label: 'Rows affected', count: c?.count ?? 0, tone: 'danger' }],
        notes: ['Rows are copied to cold storage before deletion.'],
      }
      setDry(r)
      return r
    }
    const list = verdicts ?? op.validate(rows, values)
    setVerdicts(list)
    const r: DryRunResult = {
      summary: `${op.label}: ${pluralise(list.filter((v) => v.ok).length, 'row')} would be processed, ${num(list.filter((v) => !v.ok).length)} rejected.`,
      willChange: [
        { label: 'Rows changed', count: list.filter((v) => v.ok).length, tone: op.tier === 'T3' ? 'danger' : 'neutral' },
        { label: 'Rows with warnings', count: list.filter((v) => v.status === 'warning').length, tone: 'warn' },
        { label: 'Rows unchanged', count: list.filter((v) => !v.ok).length },
      ],
      rejected: Object.entries(
        list.filter((v) => !v.ok).reduce<Record<string, number>>((acc, v) => {
          acc[v.message] = (acc[v.message] ?? 0) + 1
          return acc
        }, {}),
      ).map(([label, count]) => ({ label, count })),
      notes: [op.reversible, op.rollback ? `Rollback: ${op.rollback}` : 'No rollback path — this is irreversible.'],
    }
    setDry(r)
    return r
  }

  const execute = (ctx: { reason: string; ticket: string; approver: string | null }) => {
    const list = (verdicts ?? []).filter((v) => v.ok)
    const total = op.inputMode === 'criteria' ? criteria?.count ?? 0 : list.length
    const needsApproval = op.tier === 'T3'

    const job = store.createJob({
      kind: op.id,
      label: `${op.label} — ${num(total)} rows`,
      status: needsApproval ? 'awaiting_approval' : 'running',
      owner: '',
      total,
      dryRun: false,
      cancellable: true,
      resultCsv: null,
      reason: ctx.reason,
      ticket: ctx.ticket,
      approver: ctx.approver,
      tier: op.tier === 'T0' ? 'T1' : op.tier,
    })

    store.logAudit({
      action: op.permission,
      resource: 'bulk_job',
      resourceId: job.id,
      after: { operation: op.id, rows: total, values, awaitingApproval: needsApproval },
      reason: ctx.reason,
      ticket: ctx.ticket,
    })

    if (needsApproval) {
      store.addApproval({
        kind: 'bulk_job',
        label: `${op.label} — ${num(total)} rows`,
        requestedBy: 'you',
        requestedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        tier: 'T3',
        targetId: job.id,
        reason: ctx.reason,
        ticket: ctx.ticket,
        detail: [
          `Dry run completed: ${num(total)} rows would change, ${num(rejectedCount)} rejected.`,
          op.reversible,
          `Approver: ${ctx.approver}`,
        ],
      })
      setResult({ jobId: job.id, ok: 0, failed: 0, rows: list, awaiting: ctx.approver })
      return
    }

    // Non-T3: run immediately with progress.
    setBusy(true)
    let done = 0
    const tick = window.setInterval(() => {
      done = Math.min(list.length, done + Math.max(1, Math.ceil(list.length / 6)))
      store.advanceJob(job.id, { progress: Math.round((done / Math.max(1, list.length)) * 100), succeeded: done })
      if (done >= list.length) {
        window.clearInterval(tick)
        for (const v of list) {
          const eff = op.effect?.(v, values)
          if (!eff) continue
          if (eff.patch === null) store.softDelete(eff.datasetId, eff.rowId)
          else store.mutate(eff.datasetId, eff.rowId, eff.patch)
        }
        store.advanceJob(job.id, { status: 'completed', progress: 100, succeeded: list.length, cancellable: false, resultCsv: `${op.id}-results.csv` })
        setResult({ jobId: job.id, ok: list.length, failed: rejectedCount, rows: verdicts ?? [], awaiting: null })
        setBusy(false)
        store.addToast({ kind: 'success', title: `${op.label} completed`, body: `${pluralise(list.length, 'row')} processed. Result report available.`, href: '/system/jobs', hrefLabel: 'Job centre' })
      }
    }, 220)
  }

  const downloadReport = () => {
    const rowsOut = result?.rows ?? verdicts ?? []
    const csv = ['input,status,message,resolved_id', ...rowsOut.map((v) => `${v.input},${v.status},"${v.message}",${v.rowId ?? ''}`)].join('\n')
    csvDownload(`${op.id}-results.csv`, csv)
  }

  const reset = () => {
    setInput('')
    setVerdicts(null)
    setDry(null)
    setResult(null)
  }

  return (
    <Module permissions={['ops.bulk.console']} what="the bulk operations console">
      <PageHeader
        title="Bulk operations"
        subtitle="One console replaces Bulk Domain Form, Bulk Abuse form, Bulk DNS form, Delete reseller, Internal Transfer and both license migration pages. Same seven steps every time."
        meta={<Badge tone="neutral">{BULK_OPERATIONS.length} typed operations</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* operation picker */}
        <Card className="h-fit">
          <CardHeader title="Operation" subtitle="Grouped by what it acts on" />
          <div className="p-1.5">
            {Object.entries(
              BULK_OPERATIONS.reduce<Record<string, BulkOperation[]>>((acc, o) => {
                (acc[o.group] ??= []).push(o)
                return acc
              }, {}),
            ).map(([group, ops]) => (
              <div key={group} className="mb-1">
                <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-ink-400">{group}</p>
                {ops.map((o) => (
                  <OperationButton key={o.id} op={o} active={o.id === op.id} onSelect={() => { setParams({ op: o.id }, { replace: true }); reset() }} />
                ))}
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          {/* header + stepper */}
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {op.label} <TierBadge tier={op.tier} />
                </span>
              }
              subtitle={`Replaces: ${op.replaces}`}
              actions={<Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="h-3.5 w-3.5" /> Reset</Button>}
            />
            <div className="p-4">
              <ol className="grid gap-2 sm:grid-cols-5">
                {STEP_LABELS.map((s, i) => {
                  const n = (i + 1) as Step
                  const state = n < step ? 'done' : n === step ? 'active' : 'todo'
                  return (
                    <li key={s} className="space-y-1">
                      <div className={cn('h-1 rounded-full', state === 'done' ? 'bg-emerald-500' : state === 'active' ? 'bg-brand-600' : 'bg-ink-200')} />
                      <p className={cn('flex items-center gap-1 text-2xs', state === 'todo' ? 'text-ink-400' : 'text-ink-700')}>
                        {state === 'done' && <Check className="h-3 w-3 text-emerald-600" />}
                        {i + 1}. {s}
                      </p>
                    </li>
                  )
                })}
              </ol>
              <div className="mt-3 grid gap-2 border-t border-ink-100 pt-3 sm:grid-cols-2">
                <div>
                  <p className="text-2xs font-medium uppercase tracking-wide text-ink-400">Consequences</p>
                  <ul className="mt-1 space-y-0.5">
                    {op.consequences.map((c) => (
                      <li key={c} className="flex gap-1.5 text-2xs text-ink-600">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ink-400" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-2xs font-medium uppercase tracking-wide text-ink-400">Reversibility</p>
                  <p className="mt-1 text-2xs text-ink-600">{op.reversible}</p>
                  <p className="mt-1 text-2xs text-ink-500">{op.rollback ? `Rollback: ${op.rollback}` : 'No rollback path.'}</p>
                  <p className="mt-1 text-2xs text-ink-500">
                    Requires <code className="font-mono">{op.permission}</code>
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {!hasBase && (
            <Callout tone="info" title="You cannot run this operation">
              It requires <code className="font-mono">{op.permission}</code>, which none of your roles grant. You can still read the
              operation definition — that is deliberate, so people know what exists and who to ask.
            </Callout>
          )}

          {hasBase && op.tier === 'T3' && (
            <ElevationGate permission={op.permission} what={op.label.toLowerCase()}>
              <Callout tone="success" icon={<ShieldAlert className="h-4 w-4" />} title="Elevation active">
                You are elevated for <code className="font-mono">{op.permission}</code>. The window is time-boxed and announced.
              </Callout>
            </ElevationGate>
          )}

          {/* step 1/2 — input */}
          {!result && (
            <Card>
              <CardHeader title={op.inputMode === 'criteria' ? 'Criteria' : 'Input'} subtitle={op.inputHint} />
              <div className="space-y-3 p-4">
                {(op.extraFields ?? []).length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {op.extraFields!.map((f) => (
                      <Field key={f.key} label={f.label} required={f.required} hint={f.hint}>
                        {f.type === 'select' ? (
                          <Select value={values[f.key] ?? ''} onChange={(e) => { setValues({ ...values, [f.key]: e.target.value }); setVerdicts(null); setDry(null) }}>
                            {f.options?.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </Select>
                        ) : f.type === 'boolean' ? (
                          <Switch
                            checked={values[f.key] === 'true'}
                            onChange={(v) => setValues({ ...values, [f.key]: String(v) })}
                            label={values[f.key] === 'true' ? 'Yes' : 'No'}
                          />
                        ) : (
                          <Input
                            type={f.type === 'number' ? 'number' : 'text'}
                            value={values[f.key] ?? ''}
                            onChange={(e) => { setValues({ ...values, [f.key]: e.target.value }); setVerdicts(null); setDry(null) }}
                          />
                        )}
                      </Field>
                    ))}
                  </div>
                )}

                {op.inputMode === 'rows' ? (
                  <>
                    <Field label={op.inputLabel} required hint={`${num(rows.length)} rows parsed`}>
                      <Textarea
                        rows={8}
                        value={input}
                        onChange={(e) => { setInput(e.target.value); setVerdicts(null); setDry(null) }}
                        placeholder={op.placeholder}
                      />
                    </Field>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => { setInput(op.sample().join('\n')); setVerdicts(null); setDry(null) }}>
                        <Sparkles className="h-3.5 w-3.5" /> Load sample rows
                      </Button>
                      <Tooltip content="File upload accepts CSV or plain text, one identifier per line">
                        <Button size="sm" variant="secondary" disabled>
                          <FileUp className="h-3.5 w-3.5" /> Upload file
                        </Button>
                      </Tooltip>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigator.clipboard?.readText().then((t) => t && setInput(t)).catch(() => undefined)}
                      >
                        <ClipboardPaste className="h-3.5 w-3.5" /> Paste from clipboard
                      </Button>
                      <div className="ml-auto">
                        <Button
                          variant="primary"
                          loading={busy && !verdicts}
                          disabled={!rows.length || missingRequired.length > 0}
                          onClick={runValidate}
                        >
                          Validate {num(rows.length)} rows
                        </Button>
                      </div>
                    </div>
                    {missingRequired.length > 0 && (
                      <p className="text-2xs text-brand-700">Required first: {missingRequired.join(', ')}.</p>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <Callout tone="info" title="Criteria-based operation">
                      {criteria?.description}
                    </Callout>
                    <Button variant="primary" onClick={() => runDry()}>Evaluate criteria</Button>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* step 2 result — per-row verdicts */}
          {verdicts && !result && (
            <Card>
              <CardHeader
                title="Validation result"
                subtitle="Every row is reported before anything runs — the old forms accepted a blob and reported nothing"
                actions={<Button size="sm" variant="ghost" onClick={downloadReport}><Download className="h-3.5 w-3.5" /> Download</Button>}
              />
              <div className="p-4">
                <div className="mb-3 grid gap-2 sm:grid-cols-4">
                  <StatTile label="Rows" value={num(verdicts.length)} />
                  <StatTile label="Will process" value={num(okCount)} tone="success" />
                  <StatTile label="Warnings" value={num(warnCount)} tone={warnCount ? 'warn' : 'neutral'} />
                  <StatTile label="Rejected" value={num(rejectedCount)} tone={rejectedCount ? 'danger' : 'neutral'} />
                </div>
                <div className="max-h-72 overflow-y-auto scrollbar-thin rounded-lg border border-ink-200">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
                      <tr>
                        <th className="px-3 py-1.5 text-left">Input</th>
                        <th className="px-3 py-1.5 text-left">Result</th>
                        <th className="px-3 py-1.5 text-left">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verdicts.map((v, i) => (
                        <tr key={`${v.input}-${i}`} className="border-t border-ink-100">
                          <td className="px-3 py-1.5 font-mono text-xs">{v.input}</td>
                          <td className="px-3 py-1.5">
                            <Badge tone={v.status === 'ok' ? 'success' : v.status === 'warning' ? 'warn' : 'danger'}>
                              {v.status === 'ok' ? <Check className="h-2.5 w-2.5" /> : v.status === 'warning' ? <AlertTriangle className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                              {v.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-1.5 text-xs text-ink-600">{v.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button variant="secondary" onClick={() => setVerdicts(null)}>Back to input</Button>
                  <Button variant="primary" disabled={!okCount} onClick={() => runDry()}>
                    <Play className="h-3.5 w-3.5" /> Run dry run
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* step 3/4 — dry run + confirm */}
          {dry && !result && (
            <Card>
              <CardHeader title="Dry run" subtitle="Mandatory for Tier 3. Nothing has changed yet." />
              <div className="space-y-3 p-4">
                <p className="text-xs text-ink-700">{dry.summary}</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {dry.willChange.map((w) => (
                    <StatTile key={w.label} label={w.label} value={num(w.count)} tone={w.tone === 'danger' ? 'danger' : w.tone === 'warn' ? 'warn' : 'neutral'} />
                  ))}
                </div>
                {dry.rejected?.length ? (
                  <div>
                    <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-400">Rejections by cause</p>
                    <ul className="space-y-0.5">
                      {dry.rejected.map((r) => (
                        <li key={r.label} className="text-2xs text-ink-600">
                          <span className="font-medium tabular">{num(r.count)}</span> × {r.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="flex items-center justify-end gap-2">
                  <Button variant="secondary" onClick={() => setDry(null)}>Back</Button>
                  <Button variant="danger" disabled={!canRun} onClick={() => setConfirmOpen(true)}>
                    Continue to confirmation
                  </Button>
                </div>
                {!canRun && hasBase && (
                  <p className="text-right text-2xs text-ink-500">Request elevation above to unlock execution.</p>
                )}
              </div>
            </Card>
          )}

          {/* step 5 — execution + report */}
          {busy && !result && (
            <Card>
              <CardHeader title="Executing" subtitle="Progress is reported live; the job survives leaving this page" />
              <div className="space-y-2 p-4">
                <Progress value={60} />
                <p className="text-2xs text-ink-500">Processing rows in chunks…</p>
              </div>
            </Card>
          )}

          {result && (
            <Card>
              <CardHeader
                title={result.awaiting ? 'Queued — awaiting approval' : 'Completed'}
                subtitle={`Job ${result.jobId}`}
                icon={result.awaiting ? <ShieldAlert className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                actions={<Button size="sm" variant="secondary" onClick={downloadReport}><Download className="h-3.5 w-3.5" /> Result report</Button>}
              />
              <div className="space-y-3 p-4">
                {result.awaiting ? (
                  <Callout tone="warn" title={`${result.awaiting} must approve before anything runs`}>
                    The dry run, your reason and the ticket reference are attached to the job. Nothing has changed yet, and the approver
                    sees exactly what you saw.
                  </Callout>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <StatTile label="Processed" value={num(result.ok)} tone="success" />
                    <StatTile label="Rejected" value={num(result.failed)} tone={result.failed ? 'danger' : 'neutral'} />
                    <StatTile label="Job" value={result.jobId} />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={reset}>Run another</Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <DestructiveDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        spec={{
          title: op.label,
          description: `${op.replaces} → bulk console`,
          consequences: op.consequences,
          reversible: op.reversible,
          permission: op.permission,
          tier: op.tier,
          confirmValue: op.inputMode === 'criteria' ? op.id : String(okCount),
          confirmLabel:
            op.inputMode === 'criteria'
              ? `Type the operation id "${op.id}" to confirm`
              : `Type the number of rows (${okCount}) to confirm`,
          requiresDryRun: false,
          dryRun: () => dry ?? runDry(),
          cta: op.tier === 'T3' ? 'Request approval and queue' : 'Execute now',
          onExecute: ({ reason, ticket, approver }) => execute({ reason, ticket, approver }),
        }}
      />
    </Module>
  )
}

function OperationButton({ op, active, onSelect }: { op: BulkOperation; active: boolean; onSelect: () => void }) {
  const hasBase = useHasBase(op.permission)
  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
        active ? 'bg-brand-50' : 'hover:bg-ink-50',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-xs', active ? 'font-medium text-brand-900' : 'text-ink-800')}>{op.label}</span>
        <span className="block truncate text-2xs text-ink-500">{hasBase ? op.permission : 'no permission'}</span>
      </span>
      <TierBadge tier={op.tier} />
    </button>
  )
}
