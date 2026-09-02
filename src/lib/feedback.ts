/**
 * Prototype review feedback.
 *
 * A reviewer walking the prototype needs to say "this bit is wrong" at the
 * moment they see it, against the thing they are looking at — not in a
 * separate document that loses the context. So feedback is captured in place:
 * the widget records the route, the page label and, when the reviewer has
 * selected text, the exact words they highlighted.
 *
 * This is the one dataset that outlives a reload. Everything else in the
 * prototype resets on purpose so demos start from a known state (see
 * `store.ts`), but review notes are the reviewer's own work — losing them to a
 * refresh would make the widget worse than a notepad.
 */

export type FeedbackKind = 'bug' | 'ux' | 'copy' | 'data' | 'idea' | 'question'
export type FeedbackSeverity = 'blocker' | 'major' | 'minor' | 'nice'
export type FeedbackStatus = 'open' | 'triaged' | 'accepted' | 'wont_do' | 'resolved'

export const FEEDBACK_KINDS: { value: FeedbackKind; label: string; hint: string }[] = [
  { value: 'bug', label: 'Bug — something is broken', hint: 'It errors, hangs, or does the wrong thing.' },
  { value: 'ux', label: 'UX — the flow is wrong', hint: 'It works, but not the way the job works.' },
  { value: 'copy', label: 'Copy — wording or label', hint: 'Wrong term, unclear sentence, typo.' },
  { value: 'data', label: 'Data — values look wrong', hint: 'A field, total or status that does not match reality.' },
  { value: 'idea', label: 'Idea — something missing', hint: 'A capability the screen should have.' },
  { value: 'question', label: 'Question — needs a decision', hint: 'Cannot be answered from the prototype alone.' },
]

export const FEEDBACK_SEVERITIES: { value: FeedbackSeverity; label: string; tone: 'danger' | 'warn' | 'info' | 'neutral' }[] = [
  { value: 'blocker', label: 'Blocker', tone: 'danger' },
  { value: 'major', label: 'Major', tone: 'warn' },
  { value: 'minor', label: 'Minor', tone: 'info' },
  { value: 'nice', label: 'Nice to have', tone: 'neutral' },
]

export const FEEDBACK_STATUSES: { value: FeedbackStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'triaged', label: 'Triaged' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'wont_do', label: "Won't do" },
  { value: 'resolved', label: 'Resolved' },
]

/** Statuses that still need someone to look at them. */
export const OPEN_STATUSES: FeedbackStatus[] = ['open', 'triaged']

export interface FeedbackNote {
  at: string
  author: string
  body: string
}

export interface Feedback {
  id: string
  createdAt: string
  /** Who was signed in when it was raised — the prototype has no separate login. */
  author: string
  authorEmail: string
  /** Roles in effect at capture time: feedback often depends on what the reviewer could see. */
  role: string
  kind: FeedbackKind
  severity: FeedbackSeverity
  status: FeedbackStatus
  title: string
  body: string
  /** The text the reviewer highlighted on the page, verbatim. */
  highlight?: string
  /** Where it was raised, so a triager can go straight back to it. */
  path: string
  pageLabel: string
  /** Width×height — a layout complaint means little without it. */
  viewport: string
  notes: FeedbackNote[]
}

export function kindLabel(k: FeedbackKind): string {
  return FEEDBACK_KINDS.find((x) => x.value === k)?.label.split(' — ')[0] ?? k
}

export function severityMeta(s: FeedbackSeverity) {
  return FEEDBACK_SEVERITIES.find((x) => x.value === s) ?? FEEDBACK_SEVERITIES[2]
}

export function statusLabel(s: FeedbackStatus): string {
  return FEEDBACK_STATUSES.find((x) => x.value === s)?.label ?? s
}

/** Severity order for sorting — worst first. */
export const SEVERITY_RANK: Record<FeedbackSeverity, number> = { blocker: 0, major: 1, minor: 2, nice: 3 }

// ── persistence ─────────────────────────────────────────────────────────────

const KEY = 'acp.feedback.v1'

export function loadFeedback(): Feedback[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Feedback[]) : []
  } catch {
    return []
  }
}

export function saveFeedback(items: Feedback[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* private mode or quota — feedback stays for this session only */
  }
}

/** Next sequential ID, stable across reloads because it reads the stored set. */
export function nextFeedbackId(items: Feedback[]): string {
  const highest = items.reduce((max, f) => {
    const n = Number(f.id.replace(/^FB-/, ''))
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  return `FB-${String(highest + 1).padStart(3, '0')}`
}
