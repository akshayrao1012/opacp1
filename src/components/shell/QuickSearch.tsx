import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Globe, Building2, User, Tag } from 'lucide-react'
import { useCan, useStore } from '../../lib/store'
import { cn } from '../../lib/format'
import { Tooltip } from '../ui'
import { findDomain, findDomainByName } from '../../lib/mock/domains'
import { findReseller, resellers } from '../../lib/mock/resellers'
import { contactValidations } from '../../lib/mock/customers'
import { kycCases } from '../../lib/mock/customers'
import { extensions } from '../../lib/mock/catalog'

/**
 * The persistent quick-jump bar from the legacy ACP: four typed fields that go
 * straight to a record. It complements omnisearch rather than repeating it —
 * omnisearch guesses what you pasted, these four say what you meant, which is
 * faster when you already know you are holding a reseller ID.
 *
 * Fields you cannot use are hidden, like every other permissioned affordance.
 */

type Resolver = (value: string) => { to: string; note?: string } | { error: string }

const resolveDomain: Resolver = (raw) => {
  const v = raw.trim().toLowerCase()
  if (/^\d+$/.test(v)) {
    const d = findDomain(Number(v))
    if (d) return { to: `/domains/${encodeURIComponent(d.name)}`, note: `Domain ID ${v} → ${d.name}` }
    return { error: `No domain with ID ${v}.` }
  }
  const name = v.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!name.includes('.')) return { error: 'Enter a domain name or a numeric domain ID.' }
  const d = findDomainByName(name)
  if (d) return { to: `/domains/${encodeURIComponent(d.name)}` }
  return { to: `/domains?q=${encodeURIComponent(name)}`, note: `${name} is not in the database — searching instead.` }
}

const resolveReseller: Resolver = (raw) => {
  const v = raw.trim()
  if (/^\d+$/.test(v)) {
    const r = findReseller(Number(v))
    if (r) return { to: `/customers/resellers/${r.id}`, note: `${r.id} → ${r.company}` }
    return { error: `No reseller with ID ${v}.` }
  }
  // Company name: jump straight through on an exact single match, else search.
  const ds = resellers()
  const needle = v.toLowerCase()
  const hits: number[] = []
  for (let i = 0; i < ds.total && hits.length < 2; i++) {
    const r = ds.at(i)
    if (r._deleted) continue
    if (r.company.toLowerCase().includes(needle)) hits.push(r.id)
  }
  if (hits.length === 1) return { to: `/customers/resellers/${hits[0]}` }
  return { to: `/resellers?q=${encodeURIComponent(v)}` }
}

const resolveHandle: Resolver = (raw) => {
  const v = raw.trim()
  if (!v) return { error: 'Enter a contact handle, e.g. OP-482913.' }
  const needle = v.toLowerCase()

  const cv = contactValidations()
  for (let i = 0; i < cv.total; i++) {
    const c = cv.at(i)
    if (c._deleted) continue
    if (c.handle.toLowerCase() === needle || c.email.toLowerCase() === needle) {
      return { to: `/customers/contact-validation?q=${encodeURIComponent(c.handle)}`, note: `${c.handle} — ${c.name}` }
    }
  }

  const kyc = kycCases()
  for (let i = 0; i < kyc.total; i++) {
    const c = kyc.at(i)
    if (c._deleted) continue
    if (c.id.toLowerCase() === needle) {
      return { to: `/customers/identity-verification?q=${encodeURIComponent(c.id)}`, note: `${c.id} — ${c.subject}` }
    }
  }

  return {
    to: `/customers/contact-validation?q=${encodeURIComponent(v)}`,
    note: `No exact match for ${v} — searching contact validation.`,
  }
}

const resolveTld: Resolver = (raw) => {
  const v = raw.trim().toLowerCase().replace(/^\./, '')
  if (!v) return { error: 'Enter a TLD, e.g. com or co.uk.' }
  const ds = extensions()
  for (let i = 0; i < ds.total; i++) {
    const e = ds.at(i)
    if (e._deleted) continue
    if (e.tld === v) return { to: `/products/extensions/${encodeURIComponent(v)}`, note: `.${v} — ${e.registry}` }
  }
  return { error: `.${v} is not in the extension catalogue.` }
}

interface QuickField {
  key: string
  label: string
  placeholder: string
  width: string
  icon: React.ReactNode
  permission: string
  shortcut: string
  hint: string
  resolve: Resolver
}

const FIELDS: QuickField[] = [
  {
    key: 'domain',
    label: 'DomainID/Name',
    placeholder: 'name or ID',
    width: 'w-40',
    icon: <Globe className="h-3 w-3" />,
    permission: 'domain.read',
    shortcut: 'alt+d',
    hint: 'Numeric ID or domain name. Opens the domain detail screen.',
    resolve: resolveDomain,
  },
  {
    key: 'reseller',
    label: 'ResellerID/Company',
    placeholder: 'ID or company',
    width: 'w-40',
    icon: <Building2 className="h-3 w-3" />,
    permission: 'reseller.read',
    shortcut: 'alt+r',
    hint: 'Numeric ID opens the reseller. A company name opens it when there is one match, otherwise searches.',
    resolve: resolveReseller,
  },
  {
    key: 'handle',
    label: 'User (handle)',
    placeholder: 'OP-482913',
    width: 'w-32',
    icon: <User className="h-3 w-3" />,
    permission: 'customer.contact.read',
    shortcut: 'alt+u',
    hint: 'Contact handle, email address, or an IV- identity case reference.',
    resolve: resolveHandle,
  },
  {
    key: 'tld',
    label: 'Go to Tld',
    placeholder: 'com',
    width: 'w-20',
    icon: <Tag className="h-3 w-3" />,
    permission: 'catalog.extension.read',
    shortcut: 'alt+t',
    hint: 'Opens the Extension details screen: policies, routing, quarantine and pricing.',
    resolve: resolveTld,
  },
]

export function QuickSearch() {
  const navigate = useNavigate()
  const addToast = useStore((s) => s.addToast)
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const refs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return
      const field = FIELDS.find((f) => f.shortcut === `alt+${e.key.toLowerCase()}`)
      if (field) {
        e.preventDefault()
        refs.current[field.key]?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = (field: QuickField) => {
    const value = values[field.key] ?? ''
    if (!value.trim()) return
    setBusy(field.key)
    // Resolution scans the mock datasets, so yield a frame to keep the input responsive.
    window.setTimeout(() => {
      const result = field.resolve(value)
      setBusy(null)
      if ('error' in result) {
        addToast({ kind: 'error', title: `${field.label}: not found`, body: result.error })
        return
      }
      if (result.note) addToast({ kind: 'info', title: field.label, body: result.note })
      setValues((v) => ({ ...v, [field.key]: '' }))
      navigate(result.to)
    }, 0)
  }

  const allowed: Record<string, boolean> = {
    domain: useCan('domain.read'),
    reseller: useCan('reseller.read'),
    handle: useCan('customer.contact.read'),
    tld: useCan('catalog.extension.read'),
  }
  const visible = FIELDS.filter((f) => allowed[f.key])
  if (!visible.length) return null

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto scrollbar-thin py-1">
      <span className="shrink-0 text-2xs font-semibold uppercase tracking-wide text-ink-500">Quick jump</span>
      {visible.map((f) => (
        <div key={f.key} className="flex shrink-0 items-center gap-1.5">
          <Tooltip content={`${f.hint} (${f.shortcut})`}>
            <label htmlFor={`quick-${f.key}`} className="flex cursor-help items-center gap-1 text-2xs font-medium text-ink-600">
              <span className="text-ink-400">{f.icon}</span>
              {f.label}
            </label>
          </Tooltip>
          <div className="relative">
            <input
              id={`quick-${f.key}`}
              ref={(el) => { refs.current[f.key] = el }}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit(f)
                if (e.key === 'Escape') setValues((v) => ({ ...v, [f.key]: '' }))
              }}
              placeholder={f.placeholder}
              aria-label={f.label}
              className={cn(
                'h-7 rounded-md border border-ink-300 bg-white pl-2 pr-6 text-xs text-ink-900 placeholder:text-ink-400',
                'hover:border-ink-400 focus:border-brand-500',
                f.width,
              )}
            />
            <button
              onClick={() => submit(f)}
              disabled={!((values[f.key] ?? '').trim()) || busy === f.key}
              aria-label={`Go to ${f.label}`}
              className="absolute right-0.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-brand-700 disabled:opacity-30"
            >
              <ArrowRight className={cn('h-3 w-3', busy === f.key && 'animate-pulse')} />
            </button>
          </div>
        </div>
      ))}

    </div>
  )
}
