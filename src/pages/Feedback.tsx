/**
 * System → Feedback.
 *
 * Everything the widget collected, in one place, for the person who owns the
 * prototype. Read is `system.feedback.read`; changing a status or annotating a
 * note is `system.feedback.triage`, which keeps a reviewer from quietly closing
 * their own complaint.
 *
 * Triage is the point of this screen, so the table leads with severity and the
 * drawer puts the reviewer's own words — including whatever they highlighted —
 * above the metadata.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, MessageSquare, Quote, Trash2 } from 'lucide-react'
import { Module, PageHeader } from '../components/patterns/Page'
import { DataTable } from '../components/patterns/DataTable'
import {
  Badge, Button, Callout, Card, CardHeader, DefinitionList, Drawer, EmptyState, Field, Select,
  StatTile, Textarea,
} from '../components/ui'
import { materialized, type TableSpec } from '../lib/table'
import { useCan, useStore } from '../lib/store'
import {
  FEEDBACK_KINDS, FEEDBACK_SEVERITIES, FEEDBACK_STATUSES, OPEN_STATUSES, SEVERITY_RANK,
  kindLabel, severityMeta, statusLabel, type Feedback, type FeedbackStatus,
} from '../lib/feedback'
import { cn, dateTime, num, relative } from '../lib/format'

const spec: TableSpec<Feedback> = {
  id: 'feedback',
  rowId: (f) => f.id,
  defaultSort: { key: 'severity', dir: 'asc' },
  search: (f) => `${f.id} ${f.title} ${f.body} ${f.highlight ?? ''} ${f.author} ${f.path} ${f.pageLabel}`,
  columns: [
    { key: 'id', header: 'ID', width: 84, mono: true },
    {
      key: 'severity',
      header: 'Severity',
      width: 104,
      value: (f) => SEVERITY_RANK[f.severity],
      render: (f) => <Badge tone={severityMeta(f.severity).tone}>{severityMeta(f.severity).label}</Badge>,
    },
    { key: 'kind', header: 'Type', width: 92, value: (f) => f.kind, render: (f) => <Badge tone="neutral">{kindLabel(f.kind)}</Badge> },
    {
      key: 'title',
      header: 'Feedback',
      render: (f) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{f.title}</p>
          {f.highlight && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-2xs italic text-ink-500">
              <Quote className="h-2.5 w-2.5 shrink-0" />
              {f.highlight}
            </p>
          )}
        </div>
      ),
    },
    { key: 'pageLabel', header: 'Page', width: 200, value: (f) => f.pageLabel, render: (f) => <span className="text-2xs text-ink-600">{f.pageLabel}</span> },
    {
      key: 'status',
      header: 'Status',
      width: 108,
      value: (f) => f.status,
      render: (f) => (
        <Badge tone={f.status === 'resolved' ? 'success' : f.status === 'wont_do' ? 'neutral' : f.status === 'accepted' ? 'info' : 'warn'}>
          {statusLabel(f.status)}
        </Badge>
      ),
    },
    { key: 'author', header: 'Raised by', width: 150, value: (f) => f.author },
    { key: 'role', header: 'Role in effect', width: 180, value: (f) => f.role, optional: true },
    { key: 'createdAt', header: 'Raised', width: 120, value: (f) => f.createdAt, render: (f) => <span className="text-2xs text-ink-600">{relative(f.createdAt)}</span> },
    { key: 'viewport', header: 'Viewport', width: 110, value: (f) => f.viewport, optional: true, mono: true },
    { key: 'path', header: 'Route', width: 220, value: (f) => f.path, optional: true, mono: true },
    { key: 'notes', header: 'Notes', width: 74, align: 'right', value: (f) => f.notes.length, optional: true },
  ],
  filters: [
    { key: 'severity', label: 'Severity', type: 'multiselect', primary: true, options: FEEDBACK_SEVERITIES.map((s) => ({ value: s.value, label: s.label })) },
    { key: 'status', label: 'Status', type: 'multiselect', primary: true, options: FEEDBACK_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
    { key: 'kind', label: 'Type', type: 'multiselect', primary: true, options: FEEDBACK_KINDS.map((k) => ({ value: k.value, label: kindLabel(k.value) })) },
    { key: 'author', label: 'Raised by', type: 'text', placeholder: 'Name or email' },
    { key: 'pageLabel', label: 'Page', type: 'text', placeholder: 'e.g. Billing → Payments' },
  ],
}

export function FeedbackPage() {
  const feedback = useStore((s) => s.feedback)
  const [selected, setSelected] = useState<Feedback | null>(null)
  const canTriage = useCan('system.feedback.triage')

  const ds = useMemo(() => materialized('feedback', feedback), [feedback])

  const stats = useMemo(() => {
    const open = feedback.filter((f) => OPEN_STATUSES.includes(f.status)).length
    const blockers = feedback.filter((f) => f.severity === 'blocker' && OPEN_STATUSES.includes(f.status)).length
    const pages = new Set(feedback.map((f) => f.path)).size
    const reviewers = new Set(feedback.map((f) => f.authorEmail)).size
    return { open, blockers, pages, reviewers }
  }, [feedback])

  // Which screens attracted the most comment — usually the ones to look at first.
  const hotspots = useMemo(() => {
    const byPage = new Map<string, { label: string; path: string; count: number; open: number }>()
    for (const f of feedback) {
      const row = byPage.get(f.path) ?? { label: f.pageLabel, path: f.path, count: 0, open: 0 }
      row.count += 1
      if (OPEN_STATUSES.includes(f.status)) row.open += 1
      byPage.set(f.path, row)
    }
    return [...byPage.values()].sort((a, b) => b.count - a.count).slice(0, 6)
  }, [feedback])

  // Keep the open drawer in step with edits made through it.
  const live = selected ? feedback.find((f) => f.id === selected.id) ?? null : null

  return (
    <Module permissions={['system.feedback.read']} what="review feedback">
      <PageHeader
        title="Feedback"
        subtitle="Everything reviewers raised from the feedback widget, with the page they were on and the text they highlighted. Prototype-only: these notes live in the reviewer's browser, not in a backend."
        meta={<Badge tone="neutral">{num(ds.total)} note{ds.total === 1 ? '' : 's'}</Badge>}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Total notes" value={num(feedback.length)} />
        <StatTile label="Still open" value={num(stats.open)} tone={stats.open ? 'warn' : undefined} hint="open or triaged" />
        <StatTile label="Open blockers" value={num(stats.blockers)} tone={stats.blockers ? 'danger' : undefined} />
        <StatTile label="Pages commented on" value={num(stats.pages)} hint={`${stats.reviewers} reviewer${stats.reviewers === 1 ? '' : 's'}`} />
      </div>

      {feedback.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MessageSquare className="h-6 w-6" />}
            title="No feedback yet"
            body={
              <>
                Reviewers file notes with the <strong>Feedback</strong> button in the bottom-right of every page, or by
                selecting text and choosing <strong>Add feedback on this</strong>. Notes appear here as soon as they are
                submitted.
              </>
            }
          />
        </Card>
      ) : (
        <>
          {hotspots.length > 1 && (
            <Card>
              <CardHeader title="Where the feedback is landing" subtitle="Most-commented pages first — a cluster usually means one underlying problem." />
              <div className="grid gap-2 p-4 pt-0 sm:grid-cols-2 lg:grid-cols-3">
                {hotspots.map((h) => (
                  <Link
                    key={h.path}
                    to={h.path}
                    className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 px-3 py-2 hover:border-brand-300 hover:bg-brand-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-ink-900">{h.label}</p>
                      <p className="truncate font-mono text-2xs text-ink-500">{h.path}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {h.open > 0 && <Badge tone="warn">{h.open} open</Badge>}
                      <Badge tone="neutral">{h.count}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          <DataTable
            spec={spec}
            data={ds}
            permission="system.feedback.read"
            exportName="review feedback"
            onRowClick={(row) => setSelected(row)}
            note="Feedback is stored per browser. Clearing site data clears it, and another reviewer's notes are not visible here."
          />
        </>
      )}

      <FeedbackDrawer item={live} onClose={() => setSelected(null)} canTriage={canTriage} />
    </Module>
  )
}

function FeedbackDrawer({
  item, onClose, canTriage,
}: { item: Feedback | null; onClose: () => void; canTriage: boolean }) {
  const setStatus = useStore((s) => s.setFeedbackStatus)
  const addNote = useStore((s) => s.addFeedbackNote)
  const remove = useStore((s) => s.deleteFeedback)
  const addToast = useStore((s) => s.addToast)
  const [note, setNote] = useState('')
  const [next, setNext] = useState<FeedbackStatus | ''>('')

  const apply = () => {
    if (!item || !next) return
    setStatus(item.id, next, note)
    addToast({ kind: 'success', title: `${item.id} → ${statusLabel(next)}`, body: note ? 'Note added.' : undefined })
    setNote('')
    setNext('')
  }

  return (
    <Drawer
      open={Boolean(item)}
      onClose={onClose}
      title={item?.title ?? ''}
      subtitle={item ? `${item.id} · ${dateTime(item.createdAt)}` : ''}
      width="lg"
      footer={
        item && canTriage ? (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                remove(item.id)
                addToast({ kind: 'info', title: `${item.id} deleted` })
                onClose()
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={apply} disabled={!next}>Apply status</Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>Close</Button>
        )
      }
    >
      {item && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={severityMeta(item.severity).tone}>{severityMeta(item.severity).label}</Badge>
            <Badge tone="neutral">{kindLabel(item.kind)}</Badge>
            <Badge tone={item.status === 'resolved' ? 'success' : item.status === 'wont_do' ? 'neutral' : 'warn'}>
              {statusLabel(item.status)}
            </Badge>
            <Link
              to={item.path}
              onClick={onClose}
              className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
            >
              Open the page <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {item.highlight && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-amber-800">
                <Quote className="h-3 w-3" /> Highlighted by the reviewer
              </p>
              <blockquote className="mt-1.5 border-l-2 border-amber-400 pl-2.5 text-sm italic leading-relaxed text-ink-800">
                {item.highlight}
              </blockquote>
            </div>
          )}

          {item.body ? (
            <div>
              <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-500">Detail</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{item.body}</p>
            </div>
          ) : (
            <p className="text-xs italic text-ink-500">No detail given — the summary is all there is.</p>
          )}

          <DefinitionList
            items={[
              { label: 'Raised by', value: `${item.author} (${item.authorEmail})` },
              { label: 'Roles in effect', value: item.role || '—' },
              { label: 'Page', value: item.pageLabel },
              { label: 'Route', value: <code className="font-mono text-xs">{item.path}</code> },
              { label: 'Viewport', value: item.viewport },
              { label: 'Raised', value: `${dateTime(item.createdAt)} (${relative(item.createdAt)})` },
            ]}
          />

          {item.notes.length > 0 && (
            <div>
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-500">Triage notes</p>
              <ul className="space-y-1.5">
                {item.notes.map((n, i) => (
                  <li key={i} className="rounded-lg border border-ink-200 bg-ink-50 p-2.5">
                    <p className="text-xs text-ink-800">{n.body}</p>
                    <p className="mt-0.5 text-2xs text-ink-500">{n.author} · {relative(n.at)}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canTriage ? (
            <div className="space-y-3 rounded-lg border border-ink-200 p-3">
              <p className="text-xs font-semibold text-ink-800">Triage</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Move to status" hint="Recorded in the audit log.">
                  <Select value={next} onChange={(e) => setNext(e.target.value as FeedbackStatus)}>
                    <option value="">Leave as {statusLabel(item.status)}</option>
                    {FEEDBACK_STATUSES.filter((s) => s.value !== item.status).map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Note" className="sm:col-span-2" hint="Optional. Attached to the item, and to the status change if you make one.">
                  <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Agreed — the reseller field will accept a company name and resolve to an ID." />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!note.trim()}
                  onClick={() => {
                    addNote(item.id, note)
                    setNote('')
                  }}
                >
                  Add note only
                </Button>
              </div>
            </div>
          ) : (
            <Callout tone="info" title="Read-only">
              Changing a status needs <code className="font-mono">system.feedback.triage</code>. You can read the note and open
              the page it refers to.
            </Callout>
          )}

          <p className={cn('text-2xs text-ink-400')}>
            Prototype scope: feedback is kept in this browser's local storage. A production version would post to a real
            store so several reviewers' notes converge in one queue.
          </p>
        </div>
      )}
    </Drawer>
  )
}
