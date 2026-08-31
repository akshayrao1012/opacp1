import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, CreditCard, Globe, Key, Mail, Search, ShieldCheck, Users } from 'lucide-react'
import { useStore } from '../../lib/store'
import { resellers } from '../../lib/mock/resellers'
import { domains } from '../../lib/mock/domains'
import { licenses } from '../../lib/mock/products'
import { payments } from '../../lib/mock/finance'
import { kycCases } from '../../lib/mock/customers'
import { cn, num } from '../../lib/format'
import { Kbd } from '../ui'

interface Hit {
  kind: string
  icon: React.ReactNode
  title: string
  subtitle: string
  to: string
}

const MAX_PER_KIND = 4

/** R-IA-2 — one box that resolves any identifier and routes to the entity. */
function resolve(raw: string): Hit[] {
  const q = raw.trim().toLowerCase()
  if (q.length < 2) return []
  const hits: Hit[] = []

  // Resellers — id, company, email, contact.
  const rds = resellers()
  for (let i = 0; i < rds.total && hits.length < MAX_PER_KIND; i++) {
    const r = rds.at(i)
    if (
      String(r.id).includes(q) ||
      r.company.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.contactName.toLowerCase().includes(q)
    ) {
      hits.push({
        kind: 'Reseller',
        icon: <Building2 className="h-3.5 w-3.5" />,
        title: `${r.id} — ${r.company}`,
        subtitle: `${r.contactName} · ${r.countryName} · ${num(r.domains)} domains`,
        to: `/customers/resellers/${r.id}`,
      })
    }
  }

  // Domains — bounded scan, enough to feel instant on a 249k table.
  const dds = domains()
  let dHits = 0
  const looksLikeDomain = /[a-z0-9-]+\.[a-z.]{2,}/.test(q)
  for (let i = 0; i < Math.min(dds.total, looksLikeDomain ? dds.total : 90_000) && dHits < MAX_PER_KIND; i++) {
    const d = dds.at(i)
    if (d._deleted) continue
    if (d.name.includes(q) || d.registrantHandle.toLowerCase() === q) {
      hits.push({
        kind: 'Domain',
        icon: <Globe className="h-3.5 w-3.5" />,
        title: d.name,
        subtitle: `${d.status} · ${d.company} · expires ${d.expiresAt}`,
        to: `/domains/${encodeURIComponent(d.name)}`,
      })
      dHits++
    }
  }

  // Payments by id / invoice number.
  if (/^(pay|inv)/i.test(q) || /^\d{4,}$/.test(q)) {
    const pds = payments()
    let n = 0
    for (let i = 0; i < pds.total && n < 3; i++) {
      const p = pds.at(i)
      if (p.id.toLowerCase().includes(q) || p.invoiceNumber.toLowerCase().includes(q)) {
        hits.push({
          kind: 'Payment',
          icon: <CreditCard className="h-3.5 w-3.5" />,
          title: `${p.id} — ${p.amount.toFixed(2)} ${p.currency}`,
          subtitle: `${p.status} · ${p.company} · ${p.invoiceNumber}`,
          to: `/billing/payments?q=${encodeURIComponent(p.id)}`,
        })
        n++
      }
    }
  }

  // License keys.
  if (/^[a-z]{2}\d|^lic-/i.test(q)) {
    const lds = licenses()
    let n = 0
    for (let i = 0; i < lds.total && n < 3; i++) {
      const l = lds.at(i)
      if (l.key.toLowerCase().includes(q) || l.id.toLowerCase().includes(q)) {
        hits.push({
          kind: 'License',
          icon: <Key className="h-3.5 w-3.5" />,
          title: l.key,
          subtitle: `${l.product} ${l.edition} · ${l.company}`,
          to: `/products/licenses?q=${encodeURIComponent(l.key)}`,
        })
        n++
      }
    }
  }

  // KYC cases / contact handles.
  if (/^(iv-|op-)/i.test(q)) {
    const kds = kycCases()
    let n = 0
    for (let i = 0; i < kds.total && n < 3; i++) {
      const c = kds.at(i)
      if (c.id.toLowerCase().includes(q)) {
        hits.push({
          kind: 'KYC case',
          icon: <ShieldCheck className="h-3.5 w-3.5" />,
          title: `${c.id} — ${c.subject}`,
          subtitle: `${c.type} · ${c.status} · ${c.resellerCompany}`,
          to: `/customers/identity-verification?q=${encodeURIComponent(c.id)}`,
        })
        n++
      }
    }
  }

  // Email address → mail log.
  if (q.includes('@')) {
    hits.push({
      kind: 'Mail',
      icon: <Mail className="h-3.5 w-3.5" />,
      title: `Search the mail log for "${raw.trim()}"`,
      subtitle: 'Platform Ops → Mail',
      to: `/system/mail?q=${encodeURIComponent(raw.trim())}`,
    })
    hits.push({
      kind: 'Customers',
      icon: <Users className="h-3.5 w-3.5" />,
      title: `Search contact validation for "${raw.trim()}"`,
      subtitle: 'Customers → Contact validation',
      to: `/customers/contact-validation?q=${encodeURIComponent(raw.trim())}`,
    })
  }

  return hits
}

export function Omnisearch() {
  const open = useStore((s) => s.omniOpen)
  const setOpen = useStore((s) => s.setOmniOpen)
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), 220)
    return () => window.clearTimeout(t)
  }, [value])

  useEffect(() => {
    if (open) {
      setValue('')
      setDebounced('')
      setActive(0)
      window.setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [open])

  const hits = useMemo(() => (debounced ? resolve(debounced) : []), [debounced])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if (!open) return
      if (e.key === 'Escape') setOpen(false)
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
      if (e.key === 'Enter' && hits[active]) {
        navigate(hits[active].to)
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, hits, active, navigate, setOpen])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/40 p-4 pt-[10vh] animate-fade-in" onClick={() => setOpen(false)}>
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-pop animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-ink-200 px-3.5 py-3">
          <Search className="h-4 w-4 shrink-0 text-ink-400" />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => { setValue(e.target.value); setActive(0) }}
            placeholder="Reseller ID, domain, contact handle, email, payment ID, license key…"
            className="w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto scrollbar-thin p-1.5">
          {!debounced && (
            <p className="px-2.5 py-6 text-center text-xs text-ink-500">
              One box for every identifier. Try a reseller ID, a domain name, <code className="font-mono">ZD</code>-style payment
              reference, or an email address.
            </p>
          )}
          {debounced && hits.length === 0 && (
            <p className="px-2.5 py-6 text-center text-xs text-ink-500">
              Nothing resolved for “{debounced}”. Identifier searches are exact-ish; try fewer characters.
            </p>
          )}
          {hits.map((h, i) => (
            <button
              key={`${h.kind}-${h.title}-${i}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => { navigate(h.to); setOpen(false) }}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left',
                i === active ? 'bg-brand-50' : 'hover:bg-ink-50',
              )}
            >
              <span className={cn('rounded-md p-1.5', i === active ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-500')}>{h.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink-900">{h.title}</span>
                <span className="block truncate text-2xs text-ink-500">{h.subtitle}</span>
              </span>
              <span className="shrink-0 text-2xs uppercase tracking-wide text-ink-400">{h.kind}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-ink-200 bg-ink-50 px-3 py-1.5 text-2xs text-ink-500">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> to move · <Kbd>enter</Kbd> to open
          </span>
          <span>Results are filtered by your permissions</span>
        </div>
      </div>
    </div>
  )
}
