/**
 * Review feedback widget.
 *
 * Two ways in, because reviewers work in two ways. Some read a screen, spot a
 * problem and want to say so about the page; others are mid-sentence when they
 * notice the wrong word. So selecting text anywhere in the page raises a small
 * "Add feedback" pill next to the selection, and the captured words travel into
 * the note as a quote. The floating button covers everything else.
 *
 * The widget needs no permission: anyone reviewing the prototype can file a
 * note. Reading the collected set is a different matter — that lives behind
 * `system.feedback.read` in System → Feedback.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Highlighter, MessageSquarePlus, Quote, X } from 'lucide-react'
import { crumbsFor } from '../../lib/nav'
import { useCurrentUser, useStore } from '../../lib/store'
import {
  FEEDBACK_KINDS, FEEDBACK_SEVERITIES, OPEN_STATUSES, kindLabel, severityMeta, statusLabel,
  type FeedbackKind, type FeedbackSeverity,
} from '../../lib/feedback'
import { cn, relative } from '../../lib/format'
import { Badge, Button, Drawer, EmptyState, Field, Input, Select, Textarea, Tooltip } from '../ui'

/** A selection worth quoting: long enough to mean something, short enough to store. */
const MIN_SELECTION = 3
const MAX_SELECTION = 600

export function FeedbackWidget() {
  const location = useLocation()
  const composer = useStore((s) => s.feedbackComposer)
  const open = useStore((s) => s.openFeedbackComposer)
  const close = useStore((s) => s.closeFeedbackComposer)
  const feedback = useStore((s) => s.feedback)

  const onThisPage = useMemo(
    () => feedback.filter((f) => f.path === location.pathname),
    [feedback, location.pathname],
  )
  const openCount = onThisPage.filter((f) => OPEN_STATUSES.includes(f.status)).length

  return (
    <>
      <SelectionPill onPick={(text) => open(text)} />

      {/*
        * Below the drawer and modal layer (z-50) on purpose. A launcher that
        * floats above an open dialog puts its icon over the dialog's own
        * footer buttons and eats the click on the primary action.
        */}
      <div className="fixed bottom-4 right-4 z-40 print:hidden">
        <Tooltip content={openCount ? `${openCount} open note(s) on this page` : 'Give feedback on this page'}>
          <button
            type="button"
            onClick={() => open()}
            aria-label="Give feedback"
            className={cn(
              'flex items-center gap-2 rounded-full border border-brand-700 bg-brand-600 px-3.5 py-2.5 text-xs font-medium text-white',
              'shadow-pop transition-transform hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
              'focus-visible:outline-brand-600 active:scale-[0.97]',
            )}
          >
            <MessageSquarePlus className="h-4 w-4" />
            Feedback
            {onThisPage.length > 0 && (
              <span className="rounded-full bg-white/20 px-1.5 py-px tabular">{onThisPage.length}</span>
            )}
          </button>
        </Tooltip>
      </div>

      <FeedbackComposer
        open={composer.open}
        highlight={composer.highlight}
        onClose={close}
        path={location.pathname}
      />
    </>
  )
}

// ─────────────────────────────────────────────── highlight → feedback

/**
 * Watches for a text selection and offers to quote it. Anchored to the
 * selection rectangle rather than the pointer, so it does not jump around
 * while the reviewer adjusts the range.
 */
function SelectionPill({ onPick }: { onPick: (text: string) => void }) {
  const [sel, setSel] = useState<{ text: string; top: number; left: number } | null>(null)
  const pillRef = useRef<HTMLDivElement>(null)

  const read = useCallback(() => {
    const s = window.getSelection()
    if (!s || s.isCollapsed || s.rangeCount === 0) return setSel(null)
    const text = s.toString().trim()
    if (text.length < MIN_SELECTION) return setSel(null)
    const range = s.getRangeAt(0)
    // Ignore selections inside our own UI, and inside inputs where the user is
    // probably just editing text.
    const node = range.commonAncestorContainer
    const el = (node.nodeType === 1 ? node : node.parentElement) as HTMLElement | null
    if (!el || el.closest('[data-feedback-ui]') || el.closest('input, textarea, [role=dialog]')) return setSel(null)
    const rect = range.getBoundingClientRect()
    if (!rect.width && !rect.height) return setSel(null)
    setSel({
      text: text.slice(0, MAX_SELECTION),
      top: Math.max(8, rect.top - 38),
      left: Math.min(Math.max(8, rect.left), window.innerWidth - 190),
    })
  }, [])

  useEffect(() => {
    const onUp = (e: MouseEvent) => {
      // A click on the pill itself must not clear the selection first.
      if (pillRef.current?.contains(e.target as Node)) return
      window.setTimeout(read, 0)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSel(null)
    }
    document.addEventListener('mouseup', onUp)
    document.addEventListener('keydown', onKey)
    // Scrolling moves the anchor out from under the pill — drop it rather than
    // chase it, since the selection itself survives.
    const onScroll = () => setSel(null)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [read])

  if (!sel) return null
  return (
    <div
      ref={pillRef}
      data-feedback-ui
      style={{ top: sel.top, left: sel.left }}
      className="fixed z-[45] print:hidden"
    >
      <button
        type="button"
        onClick={() => {
          onPick(sel.text)
          setSel(null)
          window.getSelection()?.removeAllRanges()
        }}
        className="flex items-center gap-1.5 rounded-full border border-ink-800 bg-ink-900 px-3 py-1.5 text-2xs font-medium text-white shadow-pop hover:bg-ink-800"
      >
        <Highlighter className="h-3 w-3" />
        Add feedback on this
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────── composer

function FeedbackComposer({
  open, onClose, highlight, path,
}: { open: boolean; onClose: () => void; highlight?: string; path: string }) {
  const addFeedback = useStore((s) => s.addFeedback)
  const addToast = useStore((s) => s.addToast)
  const feedback = useStore((s) => s.feedback)
  const user = useCurrentUser()

  const [kind, setKind] = useState<FeedbackKind>('ux')
  const [severity, setSeverity] = useState<FeedbackSeverity>('minor')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [quote, setQuote] = useState<string | undefined>(undefined)
  const [touched, setTouched] = useState(false)

  const pageLabel = useMemo(
    () => crumbsFor(path).map((c) => c.label).join(' → '),
    [path],
  )
  const onThisPage = useMemo(() => feedback.filter((f) => f.path === path), [feedback, path])

  // Reset on each open so the previous note never bleeds into the next one.
  useEffect(() => {
    if (!open) return
    setKind('ux')
    setSeverity('minor')
    setTitle('')
    setBody('')
    setQuote(highlight)
    setTouched(false)
  }, [open, highlight])

  const titleValid = title.trim().length >= 5
  const ready = titleValid

  const submit = () => {
    setTouched(true)
    if (!ready) return
    const item = addFeedback({ kind, severity, title, body, highlight: quote, path, pageLabel })
    addToast({
      kind: 'success',
      title: `${item.id} recorded`,
      body: 'Visible to the prototype owner in System → Feedback.',
      href: '/system/feedback',
      hrefLabel: 'View feedback',
    })
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Give feedback"
      subtitle={`${pageLabel} · as ${user.name}`}
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!ready}>
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Submit feedback
          </Button>
        </>
      }
    >
      <div data-feedback-ui className="space-y-4">
        {quote ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-amber-800">
                <Quote className="h-3 w-3" /> Highlighted on the page
              </p>
              <button
                type="button"
                onClick={() => setQuote(undefined)}
                className="text-amber-700 hover:text-amber-900"
                aria-label="Remove the highlighted quote"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <blockquote className="mt-1.5 border-l-2 border-amber-400 pl-2.5 text-xs italic leading-relaxed text-ink-800">
              {quote}
            </blockquote>
          </div>
        ) : (
          <p className="rounded-lg bg-ink-50 px-3 py-2 text-2xs leading-relaxed text-ink-600">
            Tip: select any text on the page first and a <strong>Add feedback on this</strong> pill appears — the words you
            highlighted are quoted into the note, so nobody has to guess which label you meant.
          </p>
        )}

        <Field label="Summary" required error={touched && !titleValid ? 'Give it at least five characters — this is the line a triager reads.' : null}>
          <Input
            autoFocus
            value={title}
            invalid={touched && !titleValid}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Reseller ID should accept a company name too"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type" required hint={FEEDBACK_KINDS.find((k) => k.value === kind)?.hint}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)}>
              {FEEDBACK_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </Field>
          <Field label="Severity" required hint="How much it matters if nothing changes.">
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as FeedbackSeverity)}>
              {FEEDBACK_SEVERITIES.map((sv) => <option key={sv.value} value={sv.value}>{sv.label}</option>)}
            </Select>
          </Field>
        </div>

        <Field label="Detail" hint="What you expected, and what happened instead. Optional, but it saves a round trip.">
          <Textarea
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Support agents know the company name, not the numeric ID. Looking it up first means leaving this screen."
          />
        </Field>

        <div className="rounded-lg bg-ink-50 px-3 py-2 text-2xs text-ink-600">
          Captured automatically: page <code className="font-mono">{path}</code>, your identity and roles in effect, and the
          viewport size. A layout complaint is hard to reproduce without them.
        </div>

        {onThisPage.length > 0 && (
          <div>
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-500">
              Already raised on this page ({onThisPage.length})
            </p>
            <ul className="space-y-1.5">
              {onThisPage.slice(0, 6).map((f) => (
                <li key={f.id} className="rounded-lg border border-ink-200 bg-white p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xs text-ink-500">{f.id}</span>
                    <Badge tone={severityMeta(f.severity).tone}>{severityMeta(f.severity).label}</Badge>
                    <Badge tone="neutral">{kindLabel(f.kind)}</Badge>
                    <span className="ml-auto text-2xs text-ink-400">{statusLabel(f.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-800">{f.title}</p>
                  <p className="mt-0.5 text-2xs text-ink-500">{f.author} · {relative(f.createdAt)}</p>
                </li>
              ))}
            </ul>
            {onThisPage.length > 6 && (
              <p className="mt-1.5 text-2xs text-ink-500">+ {onThisPage.length - 6} more, in System → Feedback.</p>
            )}
          </div>
        )}

        {onThisPage.length === 0 && (
          <EmptyState
            compact
            icon={<MessageSquarePlus className="h-5 w-5" />}
            title="No feedback on this page yet"
            body="Yours will be the first."
          />
        )}
      </div>
    </Drawer>
  )
}

/** Small inline affordance for pages that want to invite feedback explicitly. */
export function FeedbackLink({ label = 'Give feedback on this page' }: { label?: string }) {
  const open = useStore((s) => s.openFeedbackComposer)
  return (
    <Button variant="ghost" size="sm" onClick={() => open()}>
      <MessageSquarePlus className="h-3.5 w-3.5" />
      {label}
    </Button>
  )
}
