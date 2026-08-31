/**
 * P1 — list / table contract.
 *
 * A table is declared once as a `TableSpec` and consumed by three things:
 * the DataTable component, the query engine (which stands in for the
 * server-side filter/sort the PRD requires above 10k rows), and the export job.
 *
 * Datasets come in two flavours so that the prototype can be honest about
 * scale without holding hundreds of thousands of objects in memory:
 *   - materialized: a real array (most modules)
 *   - synthetic:    a total plus a row factory, scanned per query
 */

import type { ReactNode } from 'react'

export interface Dataset<T> {
  id: string
  total: number
  at(index: number): T
  /** Present only for materialized datasets — used by mutations. */
  rows?: T[]
}

export function materialized<T>(id: string, rows: T[]): Dataset<T> {
  return { id, total: rows.length, at: (i) => rows[i], rows }
}

export function synthetic<T>(id: string, total: number, factory: (index: number) => T): Dataset<T> {
  return { id, total, at: factory }
}

/**
 * Presents two datasets as one. Used where rows created in this session must
 * appear alongside a synthetic set that cannot be appended to.
 */
export function concatDatasets<T>(id: string, head: Dataset<T>, tail: Dataset<T>): Dataset<T> {
  return {
    id,
    total: head.total + tail.total,
    at: (i) => (i < head.total ? head.at(i) : tail.at(i - head.total)),
  }
}

export type FilterType = 'text' | 'select' | 'multiselect' | 'daterange' | 'numberrange' | 'boolean'

export interface FilterOption {
  value: string
  label: string
}

export interface FilterDef<T = unknown> {
  key: string
  label: string
  type: FilterType
  options?: FilterOption[]
  placeholder?: string
  /** Custom predicate. Defaults to comparing against the column value. */
  test?: (row: T, value: FilterValue) => boolean
  /** Show in the collapsed filter bar rather than behind "More filters". */
  primary?: boolean
  hint?: string
}

export type FilterValue =
  | string
  | string[]
  | boolean
  | { from?: string; to?: string }
  | { min?: number; max?: number }
  | undefined

export interface Column<T> {
  key: string
  header: string
  /** Raw value — used for sorting, filtering and export. */
  value?: (row: T) => string | number | boolean | null | undefined
  render?: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  width?: number
  sortable?: boolean
  /** Hidden until the user enables it in the column picker. */
  optional?: boolean
  mono?: boolean
  /** Never offered for export (secrets). */
  noExport?: boolean
}

export interface TableSpec<T> {
  id: string
  columns: Column<T>[]
  filters?: FilterDef<T>[]
  /** Free-text omnisearch haystack for a row. */
  search?: (row: T) => string
  rowId: (row: T) => string
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
  defaultFilters?: Record<string, FilterValue>
  pageSizes?: number[]
  /** Rendered as the row link target. */
  href?: (row: T) => string
}

export interface Query {
  q: string
  filters: Record<string, FilterValue>
  sort?: { key: string; dir: 'asc' | 'desc' }
  page: number
  pageSize: number
}

export interface QueryResult<T> {
  rows: T[]
  matched: number
  total: number
  /** Simulated server time — surfaced in the footer against NFR-1. */
  ms: number
  scanned: number
  pages: number
}

export const DEFAULT_PAGE_SIZES = [25, 50, 100, 250]

function colValue<T>(spec: TableSpec<T>, row: T, key: string): unknown {
  const col = spec.columns.find((c) => c.key === key)
  if (col?.value) return col.value(row)
  return (row as Record<string, unknown>)[key]
}

function isEmpty(v: FilterValue): boolean {
  if (v === undefined || v === '' || v === null) return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.values(v).every((x) => x === undefined || x === '')
  return false
}

export function activeFilterCount(filters: Record<string, FilterValue>): number {
  return Object.values(filters).filter((v) => !isEmpty(v)).length
}

function matchFilter<T>(spec: TableSpec<T>, def: FilterDef<T>, row: T, value: FilterValue): boolean {
  if (isEmpty(value)) return true
  if (def.test) return def.test(row, value)
  const raw = colValue(spec, row, def.key)
  switch (def.type) {
    case 'text':
      return String(raw ?? '').toLowerCase().includes(String(value).toLowerCase())
    case 'select':
      return String(raw ?? '') === String(value)
    case 'multiselect':
      return (value as string[]).includes(String(raw ?? ''))
    case 'boolean':
      return Boolean(raw) === Boolean(value)
    case 'daterange': {
      const { from, to } = value as { from?: string; to?: string }
      const s = String(raw ?? '')
      if (from && s.slice(0, 10) < from) return false
      if (to && s.slice(0, 10) > to) return false
      return true
    }
    case 'numberrange': {
      const { min, max } = value as { min?: number; max?: number }
      const n = Number(raw ?? 0)
      if (min !== undefined && n < min) return false
      if (max !== undefined && n > max) return false
      return true
    }
    default:
      return true
  }
}

export function rowMatches<T>(spec: TableSpec<T>, row: T, query: Query): boolean {
  if (query.q) {
    const hay = spec.search ? spec.search(row) : spec.columns.map((c) => String(colValue(spec, row, c.key) ?? '')).join(' ')
    if (!hay.toLowerCase().includes(query.q.toLowerCase())) return false
  }
  for (const def of spec.filters ?? []) {
    if (!matchFilter(spec, def, row, query.filters[def.key])) return false
  }
  return true
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Stands in for the admin API. Scans the dataset, filters, sorts and slices.
 * Synthetic datasets are scanned without retaining rows, so a 466k-row table
 * costs one pass rather than 466k live objects.
 */
export function runQuery<T>(ds: Dataset<T>, spec: TableSpec<T>, query: Query): QueryResult<T> {
  const t0 = performance.now()
  const sort = query.sort ?? spec.defaultSort
  const from = (query.page - 1) * query.pageSize
  const to = from + query.pageSize

  let matched = 0
  let rows: T[] = []

  if (sort) {
    // Collect sort keys only; materialise just the requested page afterwards.
    const keys: { i: number; v: unknown }[] = []
    for (let i = 0; i < ds.total; i++) {
      const row = ds.at(i)
      if (!rowMatches(spec, row, query)) continue
      keys.push({ i, v: colValue(spec, row, sort.key) })
    }
    matched = keys.length
    const dir = sort.dir === 'desc' ? -1 : 1
    keys.sort((a, b) => compare(a.v, b.v) * dir || (a.i - b.i) * dir)
    rows = keys.slice(from, to).map((k) => ds.at(k.i))
  } else {
    for (let i = 0; i < ds.total; i++) {
      const row = ds.at(i)
      if (!rowMatches(spec, row, query)) continue
      if (matched >= from && matched < to) rows.push(row)
      matched++
    }
  }

  return {
    rows,
    matched,
    total: ds.total,
    ms: Math.round((performance.now() - t0) * 10) / 10,
    scanned: ds.total,
    pages: Math.max(1, Math.ceil(matched / query.pageSize)),
  }
}

/** Collect every matching row — used by exports (capped, and the cap is reported). */
export function collectMatches<T>(ds: Dataset<T>, spec: TableSpec<T>, query: Query, cap = 100_000): { rows: T[]; truncated: boolean } {
  const rows: T[] = []
  for (let i = 0; i < ds.total; i++) {
    const row = ds.at(i)
    if (!rowMatches(spec, row, query)) continue
    if (rows.length >= cap) return { rows, truncated: true }
    rows.push(row)
  }
  return { rows, truncated: false }
}

export function toCsv<T>(spec: TableSpec<T>, rows: T[], columnKeys: string[]): string {
  const cols = spec.columns.filter((c) => columnKeys.includes(c.key) && !c.noExport)
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = cols.map((c) => esc(c.header)).join(',')
  const body = rows.map((r) => cols.map((c) => esc(colValue(spec, r, c.key))).join(',')).join('\n')
  return `${head}\n${body}`
}

/** URL state, so filters and pagination are shareable — R-IA-4. */
export function queryToParams(query: Query, defaults: Query): URLSearchParams {
  const p = new URLSearchParams()
  if (query.q) p.set('q', query.q)
  if (query.page !== 1) p.set('page', String(query.page))
  if (query.pageSize !== defaults.pageSize) p.set('size', String(query.pageSize))
  if (query.sort && (query.sort.key !== defaults.sort?.key || query.sort.dir !== defaults.sort?.dir)) {
    p.set('sort', `${query.sort.key}:${query.sort.dir}`)
  }
  const f = Object.fromEntries(Object.entries(query.filters).filter(([, v]) => !isEmpty(v)))
  if (Object.keys(f).length) p.set('f', encodeURIComponent(JSON.stringify(f)))
  return p
}

export function paramsToQuery(p: URLSearchParams, defaults: Query): Query {
  const sortRaw = p.get('sort')
  let filters = defaults.filters
  const f = p.get('f')
  if (f) {
    try {
      filters = JSON.parse(decodeURIComponent(f))
    } catch {
      filters = defaults.filters
    }
  }
  return {
    q: p.get('q') ?? '',
    page: Number(p.get('page') ?? 1) || 1,
    pageSize: Number(p.get('size') ?? defaults.pageSize) || defaults.pageSize,
    sort: sortRaw
      ? { key: sortRaw.split(':')[0], dir: (sortRaw.split(':')[1] as 'asc' | 'desc') ?? 'asc' }
      : defaults.sort,
    filters,
  }
}
