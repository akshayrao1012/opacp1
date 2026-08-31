import {
  createContext, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle, Check, ChevronDown, Copy, Eye, EyeOff, Info, Loader2, Lock, Search, X,
} from 'lucide-react'
import { cn } from '../../lib/format'

// ───────────────────────────────────────────────────────────── Button

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline' | 'link'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm disabled:bg-ink-200 disabled:text-ink-400 disabled:shadow-none',
  secondary: 'bg-white text-ink-800 border border-ink-200 hover:bg-ink-50 hover:border-ink-300 active:bg-ink-100 shadow-sm disabled:text-ink-300 disabled:bg-ink-50',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:text-ink-300',
  danger: 'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 shadow-sm disabled:bg-ink-200 disabled:text-ink-400',
  'danger-outline': 'bg-white text-brand-700 border border-brand-300 hover:bg-brand-50 hover:border-brand-400 disabled:text-ink-300 disabled:border-ink-200',
  link: 'text-brand-700 hover:text-brand-800 hover:underline underline-offset-2 p-0 h-auto',
}
const BTN_SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[0.95rem] gap-2 rounded-lg',
  icon: 'h-8 w-8 rounded-lg',
}

export function Button({
  variant = 'secondary', size = 'md', loading, className, children, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors disabled:cursor-not-allowed',
        BTN_VARIANT[variant],
        BTN_SIZE[size],
        className,
      )}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  )
}

// ───────────────────────────────────────────────────────────── Badge / Pill

type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'info' | 'brand' | 'purple'

const TONE: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-brand-50 text-brand-800 ring-brand-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  brand: 'bg-brand-600 text-white ring-brand-700',
  purple: 'bg-violet-50 text-violet-800 ring-violet-200',
}

export function Badge({
  tone = 'neutral', className, children, dot,
}: { tone?: Tone; className?: string; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset', TONE[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  )
}

const STATUS_TONE: Record<string, Tone> = {
  active: 'success', paid: 'success', completed: 'success', verified: 'success', approved: 'success',
  connected: 'success', operational: 'success', delivered: 'success', synced: 'success', issued: 'success',
  live: 'success', ok: 'success', sent: 'success', opened: 'success',
  pending: 'warn', queued: 'warn', in_review: 'warn', awaiting_approval: 'warn', awaiting_documents: 'warn',
  pending_validation: 'warn', pending_transfer: 'warn', in_progress: 'info', running: 'info', processing: 'info',
  retrying: 'warn', deferred: 'warn', scheduled: 'info', trial: 'info', draft: 'neutral', collecting: 'info',
  generating: 'info', validating: 'info', sending: 'info', degraded: 'warn', maintenance: 'warn',
  ack_required: 'warn', escalated: 'purple', locked: 'warn', quarantine: 'warn', outdated: 'neutral',
  failed: 'danger', error: 'danger', down: 'danger', bounced: 'danger', chargeback: 'danger',
  suspended: 'danger', clientHold: 'danger', rejected: 'danger', terminated: 'danger', expired: 'neutral',
  cancelled: 'neutral', closed: 'neutral', inactive: 'neutral', deleted: 'neutral', spam: 'danger',
  refunded: 'purple', partially_refunded: 'purple', exhausted: 'neutral', disabled: 'neutral',
  auth_failed: 'danger', not_started: 'neutral', suppressed: 'neutral', slave: 'info', master: 'neutral',
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral'
  return (
    <Badge tone={tone} dot className={className}>
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}

export function TierBadge({ tier }: { tier: 'T0' | 'T1' | 'T2' | 'T3' }) {
  const tone: Tone = tier === 'T3' ? 'danger' : tier === 'T2' ? 'warn' : tier === 'T1' ? 'info' : 'neutral'
  return <Badge tone={tone}>{tier}</Badge>
}

// ───────────────────────────────────────────────────────────── Card

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-ink-200 bg-white shadow-card', className)}>{children}</div>
}

export function CardHeader({
  title, subtitle, actions, icon, className,
}: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-ink-150 px-4 py-3', className)} style={{ borderColor: '#e6e9ee' }}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-ink-400">{icon}</span>}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">{children}</h4>
      {hint && <span className="text-xs text-ink-400">{hint}</span>}
    </div>
  )
}

// ───────────────────────────────────────────────────────────── Form fields (P3)

export function Field({
  label: text, hint, error, required, children, htmlFor, className,
}: { label: string; hint?: ReactNode; error?: string | null; required?: boolean; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-xs font-medium text-ink-700">
        {text}
        {required && <span className="text-brand-600">*</span>}
      </label>
      {children}
      {error ? (
        <p className="flex items-start gap-1 text-xs text-brand-700">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  )
}

const CONTROL =
  'w-full rounded-lg border bg-white px-2.5 py-1.5 text-sm text-ink-900 placeholder:text-ink-400 transition-colors disabled:bg-ink-50 disabled:text-ink-400'

export function Input({ className, invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...props} className={cn(CONTROL, invalid ? 'border-brand-400' : 'border-ink-200 hover:border-ink-300', className)} />
}

export function Textarea({ className, invalid, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      {...props}
      className={cn(CONTROL, 'font-mono text-xs leading-relaxed', invalid ? 'border-brand-400' : 'border-ink-200 hover:border-ink-300', className)}
    />
  )
}

export function Select({
  className, invalid, children, ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(CONTROL, 'appearance-none pr-8', invalid ? 'border-brand-400' : 'border-ink-200 hover:border-ink-300', className)}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
    </div>
  )
}

export function Checkbox({
  label: text, hint, className, ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: string }) {
  const id = useId()
  return (
    <div className={cn('flex items-start gap-2', className)}>
      <input
        id={id}
        type="checkbox"
        {...props}
        className="mt-0.5 h-3.5 w-3.5 rounded border-ink-300 text-brand-600 accent-brand-600"
      />
      <label htmlFor={id} className="text-sm text-ink-700">
        {text}
        {hint && <span className="block text-xs text-ink-500">{hint}</span>}
      </label>
    </div>
  )
}

export function Switch({
  checked, onChange, label: text, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('inline-flex items-center gap-2 text-sm', disabled && 'opacity-50')}
    >
      <span
        className={cn(
          'relative h-4.5 w-8 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand-600' : 'bg-ink-300',
        )}
        style={{ height: 18, width: 32 }}
      >
        <span
          className={cn('absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all', checked ? 'left-4' : 'left-0.5')}
        />
      </span>
      {text && <span className="text-ink-700">{text}</span>}
    </button>
  )
}

export function SearchInput({
  value, onChange, placeholder = 'Search', className, autoFocus,
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(CONTROL, 'border-ink-200 pl-8 hover:border-ink-300')}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────── Modal / Drawer

export function Modal({
  open, onClose, title, subtitle, children, footer, width = 'md', tone,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg' | 'xl'
  tone?: 'danger'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[width]
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 pt-[8vh] animate-fade-in">
      <div className={cn('w-full overflow-hidden rounded-xl bg-white shadow-pop animate-scale-in', w)} role="dialog" aria-modal>
        <div className={cn('flex items-start justify-between gap-4 border-b px-5 py-3.5', tone === 'danger' ? 'border-brand-200 bg-brand-50' : 'border-ink-200')}>
          <div>
            <h2 className={cn('text-sm font-semibold', tone === 'danger' ? 'text-brand-900' : 'text-ink-900')}>{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-600">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[68vh] overflow-y-auto scrollbar-thin px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-ink-200 bg-ink-50 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({
  open, onClose, title, subtitle, children, footer, width = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[width]
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-ink-950/40 animate-fade-in">
      <div className={cn('flex h-full w-full flex-col bg-white shadow-pop animate-slide-in-right', w)} role="dialog" aria-modal>
        <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-600">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-ink-200 bg-ink-50 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ───────────────────────────────────────────────────────────── Tabs

interface TabsCtx {
  value: string
  set: (v: string) => void
}
const TabsContext = createContext<TabsCtx | null>(null)

export function Tabs({
  value, onChange, children, className,
}: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <TabsContext.Provider value={{ value, set: onChange }}>
      <div className={cn('flex items-center gap-0.5 border-b border-ink-200', className)} role="tablist">
        {children}
      </div>
    </TabsContext.Provider>
  )
}

export function Tab({ id, children, count }: { id: string; children: ReactNode; count?: number }) {
  const ctx = useContext(TabsContext)!
  const active = ctx.value === id
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => ctx.set(id)}
      className={cn(
        '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
        active ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800',
      )}
    >
      {children}
      {count !== undefined && (
        <span className={cn('rounded-full px-1.5 py-px text-2xs tabular', active ? 'bg-brand-100 text-brand-800' : 'bg-ink-100 text-ink-600')}>
          {count}
        </span>
      )}
    </button>
  )
}

// ───────────────────────────────────────────────────────────── States (P9)

export function EmptyState({
  icon, title, body, action, compact,
}: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-1.5 py-8' : 'gap-2 py-16')}>
      {icon && <div className="mb-1 rounded-full bg-ink-100 p-2.5 text-ink-400">{icon}</div>}
      <p className="text-sm font-medium text-ink-800">{title}</p>
      {body && <p className="max-w-md text-xs leading-relaxed text-ink-500">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function NoPermission({ permission, what }: { permission: string; what?: string }) {
  return (
    <Card className="mx-auto my-10 max-w-lg p-6">
      <div className="flex gap-3">
        <div className="rounded-lg bg-ink-100 p-2 text-ink-500">
          <Lock className="h-4 w-4" />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink-900">You do not have access to {what ?? 'this page'}</h3>
          <p className="text-xs leading-relaxed text-ink-600">
            This view requires <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-2xs">{permission}</code>. Navigation hides
            what you cannot open, so you have most likely followed a shared link. The check is enforced server-side — hiding the item is
            only an affordance.
          </p>
          <p className="text-xs text-ink-500">
            Ask a Super Admin to add the permission to one of your roles, or request time-boxed elevation if this is a Tier 3 action.
          </p>
        </div>
      </div>
    </Card>
  )
}

export function ErrorState({ correlationId, message, onRetry }: { correlationId: string; message?: string; onRetry?: () => void }) {
  return (
    <Card className="mx-auto my-10 max-w-lg p-6">
      <div className="flex gap-3">
        <div className="rounded-lg bg-brand-50 p-2 text-brand-700">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink-900">Something went wrong</h3>
          <p className="text-xs text-ink-600">{message ?? 'The request failed. Nothing was changed.'}</p>
          <p className="text-xs text-ink-500">
            Correlation ID <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-2xs">{correlationId}</code> — quote this to support.
          </p>
          {onRetry && (
            <Button size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-px">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 px-3 py-2.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-3.5', c === 0 ? 'w-40' : c === cols - 1 ? 'w-16' : 'w-24')} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ───────────────────────────────────────────────────────────── Misc

export function Progress({ value, tone = 'brand', className }: { value: number; tone?: 'brand' | 'success' | 'danger'; className?: string }) {
  const bg = { brand: 'bg-brand-600', success: 'bg-emerald-600', danger: 'bg-brand-700' }[tone]
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-ink-150 bg-ink-100', className)}>
      <div className={cn('h-full rounded-full transition-all', bg)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

export function StatTile({
  label: text, value, delta, tone, hint, icon, onClick,
}: {
  label: string
  value: ReactNode
  delta?: string
  tone?: 'neutral' | 'success' | 'warn' | 'danger'
  hint?: string
  icon?: ReactNode
  onClick?: () => void
}) {
  const accent = { neutral: 'text-ink-900', success: 'text-emerald-700', warn: 'text-amber-700', danger: 'text-brand-700' }[tone ?? 'neutral']
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex w-full flex-col gap-1 rounded-xl border border-ink-200 bg-white p-3.5 text-left shadow-card transition-colors',
        onClick && 'hover:border-ink-300 hover:bg-ink-50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-500">{text}</span>
        {icon && <span className="text-ink-300">{icon}</span>}
      </div>
      <span className={cn('text-xl font-semibold tabular', accent)}>{value}</span>
      {(delta || hint) && (
        <span className="text-2xs text-ink-500">
          {delta && <span className="mr-1 font-medium">{delta}</span>}
          {hint}
        </span>
      )}
    </button>
  )
}

export function CopyButton({ value, label: text }: { value: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(value)
        setDone(true)
        window.setTimeout(() => setDone(false), 1400)
      }}
      className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-2xs text-ink-500 hover:bg-ink-100 hover:text-ink-800"
      title={`Copy ${text ?? 'value'}`}
    >
      {done ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      {text}
    </button>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-ink-200 bg-ink-50 px-1.5 py-px font-mono text-2xs text-ink-500">{children}</kbd>
  )
}

export function Callout({
  tone = 'info', title, children, icon,
}: { tone?: 'info' | 'warn' | 'danger' | 'success'; title?: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  const styles = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-brand-200 bg-brand-50 text-brand-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone]
  const defaultIcon = tone === 'info' ? <Info className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />
  return (
    <div className={cn('flex gap-2.5 rounded-lg border p-3 text-xs leading-relaxed', styles)}>
      <span className="mt-px shrink-0 opacity-80">{icon ?? defaultIcon}</span>
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  )
}

export function DefinitionList({
  items, columns = 2, className,
}: { items: { label: string; value: ReactNode; span?: boolean }[]; columns?: 1 | 2 | 3; className?: string }) {
  const grid = { 1: 'grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }[columns]
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', grid, className)}>
      {items.map((it, i) => (
        <div key={i} className={cn('min-w-0', it.span && 'sm:col-span-full')}>
          <dt className="text-2xs font-medium uppercase tracking-wide text-ink-400">{it.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink-800">{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** P8 — masked by default, reveal is an explicit, permissioned, audited action. */
export function SecretValue({
  value, masked, canReveal, onReveal, hint,
}: { value: string; masked?: string; canReveal: boolean; onReveal: () => void; hint?: string }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-ink-200 bg-ink-50 px-2 py-1 font-mono text-xs text-ink-800">
          {shown ? value : masked ?? '•'.repeat(28)}
        </code>
        {shown ? (
          <Button size="sm" variant="secondary" onClick={() => setShown(false)}>
            <EyeOff className="h-3.5 w-3.5" /> Hide
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={!canReveal}
            title={canReveal ? 'Reveal — this is audited' : 'You do not have permission to reveal this'}
            onClick={() => {
              onReveal()
              setShown(true)
            }}
          >
            <Eye className="h-3.5 w-3.5" /> Reveal
          </Button>
        )}
        {shown && <CopyButton value={value} />}
      </div>
      <p className="text-2xs text-ink-500">{hint ?? 'Masked by default. Every reveal is written to the audit log.'}</p>
    </div>
  )
}

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 w-max max-w-xs -translate-x-1/2 rounded-md bg-ink-900 px-2 py-1 text-2xs leading-snug text-white shadow-pop">
          {content}
        </span>
      )}
    </span>
  )
}
