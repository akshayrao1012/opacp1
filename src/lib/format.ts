import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const nf = new Intl.NumberFormat('en-GB')
export function num(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return nf.format(n)
}

export function money(n: number | null | undefined, currency = 'EUR'): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)
}

export function pct(n: number, dp = 0): string {
  return `${n.toFixed(dp)}%`
}

/** Humanises the enum-ish strings used throughout the mock data. */
export function label(v: string | null | undefined): string {
  if (!v) return '—'
  return v.replace(/[_.]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export function relative(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return '—'
  const t = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (Number.isNaN(t)) return iso
  const diff = nowMs - t
  const abs = Math.abs(diff)
  const units: [number, string][] = [
    [60_000, 'min'], [3_600_000, 'h'], [86_400_000, 'd'], [2_592_000_000, 'mo'], [31_536_000_000, 'y'],
  ]
  if (abs < 60_000) return 'just now'
  let out = ''
  for (let i = units.length - 1; i >= 0; i--) {
    const [ms, u] = units[i]
    if (abs >= ms) {
      out = `${Math.round(abs / ms)}${u}`
      break
    }
  }
  return diff >= 0 ? `${out} ago` : `in ${out}`
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso.slice(0, 10)
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso.slice(0, 16).replace('T', ' ')
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function mask(value: string, keep = 3): string {
  if (value.length <= keep) return '•'.repeat(8)
  return `${'•'.repeat(Math.min(22, Math.max(6, value.length - keep)))}${value.slice(-keep)}`
}

export function csvDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function parseIdentifierList(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return `${num(n)} ${n === 1 ? one : many}`
}
