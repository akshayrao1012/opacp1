import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowDown, ArrowUp, Bookmark, ChevronLeft, ChevronRight, Columns3, Download, Filter,
  Inbox, Plus, RotateCcw, Save, SlidersHorizontal, X,
} from 'lucide-react'
import {
  activeFilterCount, collectMatches, paramsToQuery, queryToParams, runQuery, toCsv,
  type Dataset, type FilterDef, type FilterValue, type Query, type QueryResult, type TableSpec,
} from '../../lib/table'
import { useCan, useStore, type SavedView } from '../../lib/store'
import { cn, csvDownload, num, pluralise } from '../../lib/format'
import {
  Badge, Button, Callout, Checkbox, EmptyState, Field, Input, Modal, Select, TableSkeleton, Tooltip,
} from '../ui'

export interface BulkAction<T> {
  label: string
  permission?: string
  tier?: 'T1' | 'T2' | 'T3'
  danger?: boolean
  onRun: (rows: T[], ids: string[]) => void
}

export interface DataTableProps<T> {
  spec: TableSpec<T>
  data: Dataset<T>
  /** Permission required to read the table; the caller normally guards too. */
  permission?: string
  exportName?: string
  bulkActions?: BulkAction<T>[]
  rowActions?: (row: T) => React.ReactNode
  create?: { label: string; permission?: string; onClick: () => void }
  toolbar?: React.ReactNode
  /** Sync filter/sort/page into the URL — R-IA-4. Off for embedded tables. */
  urlState?: boolean
  emptyTitle?: string
  emptyBody?: string
  onRowClick?: (row: T) => void
  compactHeight?: boolean
  note?: React.ReactNode
}

interface Deletableish {
  _deleted?: boolean
}

const LATENCY_BASE = 60

export function DataTable<T extends object>({
  spec, data, permission, exportName, bulkActions = [], rowActions, create, toolbar,
  urlState = true, emptyTitle, emptyBody, onRowClick, compactHeight, note,
}: DataTableProps<T>) {
  const [params, setParams] = useSearchParams()
  const density = useStore((s) => s.density)
  const dataVersion = useStore((s) => s.dataVersion)
  const savedViews = useStore((s) => s.savedViews)
  const saveView = useStore((s) => s.saveView)
  const deleteView = useStore((s) => s.deleteView)
  const createJob = useStore((s) => s.createJob)
  const advanceJob = useStore((s) => s.advanceJob)
  const addToast = useStore((s) => s.addToast)
  const logAudit = useStore((s) => s.logAudit)
  const canExport = useCan('export.run')

  const defaults: Query = useMemo(
    () => ({
      q: '',
      filters: spec.defaultFilters ?? {},
      sort: spec.defaultSort,
      page: 1,
      pageSize: (spec.pageSizes ?? [25, 50, 100, 250])[0],
    }),
    [spec],
  )

  const [localQuery, setLocalQuery] = useState<Query>(defaults)
  const query = urlState ? paramsToQuery(params, defaults) : localQuery

  const setQuery = (next: Partial<Query>, resetPage = true) => {
    const merged: Query = { ...query, ...next, page: resetPage && next.page === undefined ? 1 : next.page ?? query.page }
    if (urlState) {
      const p = queryToParams(merged, defaults)
      // Preserve unrelated params (e.g. the active tab).
      for (const [k, v] of params.entries()) if (!['q', 'page', 'size', 'sort', 'f'].includes(k)) p.set(k, v)
      setParams(p, { replace: true })
    } else {
      setLocalQuery(merged)
    }
  }

  // ── visible columns, persisted per table ─────────────────────────────────
  const storageKey = `acp.cols.${spec.id}`
  const [visible, setVisible] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed: string[] = JSON.parse(raw)
        const valid = parsed.filter((k) => spec.columns.some((c) => c.key === k))
        if (valid.length) return valid
      }
    } catch { /* fall through to defaults */ }
    return spec.columns.filter((c) => !c.optional).map((c) => c.key)
  })
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(visible))
    } catch { /* storage unavailable — column choice is per-session then */ }
  }, [storageKey, visible])

  const cols = spec.columns.filter((c) => visible.includes(c.key))

  // ── query execution (simulated server round-trip) ────────────────────────
  const [result, setResult] = useState<QueryResult<T> | null>(null)
  const [loading, setLoading] = useState(true)
  const queryKey = JSON.stringify(query) + dataVersion + spec.id

  useEffect(() => {
    setLoading(true)
    const latency = LATENCY_BASE + Math.min(240, data.total / 4000)
    const t = window.setTimeout(() => {
      const filtered: Query = { ...query, filters: { ...query.filters } }
      setResult(runQuery(data, spec, filtered))
      setLoading(false)
    }, latency)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey])

  // ── selection ────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => setSelected(new Set()), [queryKey])
  const pageRows = (result?.rows ?? []).filter((r) => !(r as Deletableish)._deleted)
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(spec.rowId(r)))

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // ── views / filters / export UI state ────────────────────────────────────
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [colsOpen, setColsOpen] = useState(false)
  const [viewsOpen, setViewsOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [viewName, setViewName] = useState('')
  const [viewShared, setViewShared] = useState(true)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setColsOpen(false)
        setViewsOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const views = savedViews.filter((v) => v.tableId === spec.id)
  const applyView = (v: SavedView) => {
    setQuery({ q: v.query.q, filters: v.query.filters, sort: v.query.sort, pageSize: v.query.pageSize, page: 1 })
    setViewsOpen(false)
    addToast({ kind: 'info', title: `View "${v.name}" applied` })
  }

  const activeCount = activeFilterCount(query.filters) + (query.q ? 1 : 0)

  const runExport = () => {
    const job = createJob({
      kind: 'export',
      label: `Export — ${exportName ?? spec.id}${activeCount ? ' (filtered)' : ''}`,
      status: 'running',
      owner: '',
      total: result?.matched ?? 0,
      dryRun: false,
      cancellable: true,
      resultCsv: null,
      reason: null,
      ticket: null,
      approver: null,
      tier: 'T1',
    })
    logAudit({
      action: 'export.run',
      resource: 'export',
      resourceId: job.id,
      after: { table: spec.id, matched: result?.matched, filters: query.filters, q: query.q },
    })
    addToast({
      kind: 'info',
      title: 'Export queued',
      body: `${job.id} — ${pluralise(result?.matched ?? 0, 'row')}. Large exports run as a job.`,
      href: '/system/jobs',
      hrefLabel: 'Job centre',
    })
    window.setTimeout(() => {
      const { rows, truncated } = collectMatches(data, spec, query)
      const csv = toCsv(spec, rows.filter((r) => !(r as Deletableish)._deleted), visible)
      advanceJob(job.id, {
        status: 'completed',
        progress: 100,
        succeeded: rows.length,
        cancellable: false,
        resultCsv: `${spec.id}-export.csv`,
      })
      csvDownload(`${spec.id}-export.csv`, csv)
      addToast({
        kind: 'success',
        title: `Export ready — ${pluralise(rows.length, 'row')}`,
        body: truncated ? 'Capped at 100,000 rows (NFR-2). Narrow the filter for the rest.' : 'Filters and column choice were applied.',
      })
    }, 900)
  }

  const rowH = density === 'compact' ? 'h-8' : 'h-11'
  const cellPad = density === 'compact' ? 'px-2.5 py-1' : 'px-3 py-2'

  return (
    <div className="space-y-2.5">
      {/* ── toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Input
            value={query.q}
            onChange={(e) => setQuery({ q: e.target.value })}
            placeholder={`Search ${exportName ?? 'records'}…`}
            className="pl-8"
          />
          <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
        </div>

        {(spec.filters?.length ?? 0) > 0 && (
          <Button variant={filtersOpen || activeCount ? 'primary' : 'secondary'} onClick={() => setFiltersOpen((v) => !v)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeCount > 0 && (
              <span className="rounded-full bg-white/25 px-1.5 text-2xs tabular">{activeCount}</span>
            )}
          </Button>
        )}

        <div className="relative" ref={popRef}>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => { setViewsOpen((v) => !v); setColsOpen(false) }}>
              <Bookmark className="h-3.5 w-3.5" />
              Views
              <span className="text-2xs text-ink-400">{views.length}</span>
            </Button>
            <Button variant="secondary" onClick={() => { setColsOpen((v) => !v); setViewsOpen(false) }}>
              <Columns3 className="h-3.5 w-3.5" />
              Columns
            </Button>
          </div>

          {viewsOpen && (
            <div className="absolute right-0 z-30 mt-1 w-80 rounded-xl border border-ink-200 bg-white p-1.5 shadow-pop">
              <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-ink-400">Saved views</p>
              {views.length === 0 && <p className="px-2 py-2 text-xs text-ink-500">No saved views for this table yet.</p>}
              {views.map((v) => (
                <div key={v.id} className="group flex items-center gap-1 rounded-lg px-1 hover:bg-ink-50">
                  <button onClick={() => applyView(v)} className="flex-1 truncate px-1.5 py-1.5 text-left text-xs text-ink-800">
                    {v.name}
                    <span className="ml-1.5 text-2xs text-ink-400">{v.shared ? 'shared' : 'private'}</span>
                  </button>
                  {!v.builtIn && (
                    <button
                      onClick={() => deleteView(v.id)}
                      className="opacity-0 group-hover:opacity-100"
                      aria-label={`Delete view ${v.name}`}
                    >
                      <X className="h-3.5 w-3.5 text-ink-400 hover:text-brand-700" />
                    </button>
                  )}
                </div>
              ))}
              <div className="mt-1 border-t border-ink-150 pt-1" style={{ borderColor: '#e6e9ee' }}>
                <button
                  onClick={() => { setSaveOpen(true); setViewsOpen(false); setViewName('') }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink-700 hover:bg-ink-50"
                >
                  <Save className="h-3.5 w-3.5" /> Save current filters as a view
                </button>
              </div>
            </div>
          )}

          {colsOpen && (
            <div className="absolute right-0 z-30 mt-1 max-h-80 w-72 overflow-y-auto scrollbar-thin rounded-xl border border-ink-200 bg-white p-2 shadow-pop">
              <p className="px-1 pb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-400">Columns</p>
              {spec.columns.map((c) => (
                <div key={c.key} className="px-1 py-0.5">
                  <Checkbox
                    label={c.header}
                    checked={visible.includes(c.key)}
                    onChange={(e) =>
                      setVisible((prev) =>
                        e.target.checked ? [...spec.columns.map((x) => x.key).filter((k) => prev.includes(k) || k === c.key)] : prev.filter((k) => k !== c.key),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {toolbar}

        {canExport && (
          <Tooltip content="CSV honours active filters and column choice. Runs as a job above 10k rows.">
            <Button variant="secondary" onClick={runExport} disabled={!result?.matched}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </Tooltip>
        )}

        {create && <CreateButton create={create} />}
      </div>

      {/* ── filter panel ───────────────────────────────────────────────── */}
      {filtersOpen && (spec.filters?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-ink-200 bg-white p-3 shadow-card">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {spec.filters!.map((f) => (
              <FilterControl
                key={f.key}
                def={f as FilterDef}
                value={query.filters[f.key]}
                onChange={(v) => setQuery({ filters: { ...query.filters, [f.key]: v } })}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-2.5">
            <p className="text-2xs text-ink-500">
              Filters are applied server-side and encoded in the URL — the link you share reproduces this exact view.
            </p>
            <Button size="sm" variant="ghost" onClick={() => setQuery({ filters: spec.defaultFilters ?? {}, q: '' })}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
          </div>
        </div>
      )}

      {/* ── active filter chips ────────────────────────────────────────── */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {query.q && (
            <Chip label={`search: ${query.q}`} onClear={() => setQuery({ q: '' })} />
          )}
          {Object.entries(query.filters).map(([k, v]) => {
            const def = spec.filters?.find((f) => f.key === k)
            if (!def || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return null
            const text = Array.isArray(v)
              ? v.join(', ')
              : typeof v === 'object'
                ? Object.entries(v).filter(([, x]) => x !== undefined && x !== '').map(([kk, x]) => `${kk} ${x}`).join(' · ')
                : String(v)
            if (!text) return null
            return (
              <Chip
                key={k}
                label={`${def.label}: ${text}`}
                onClear={() => setQuery({ filters: { ...query.filters, [k]: undefined } })}
              />
            )
          })}
        </div>
      )}

      {note}

      {/* ── bulk action bar ────────────────────────────────────────────── */}
      {selected.size > 0 && bulkActions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2">
          <span className="text-xs font-medium text-brand-900">{pluralise(selected.size, 'row')} selected</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {bulkActions.map((a) => (
              <BulkActionButton
                key={a.label}
                action={a}
                onRun={() => {
                  const rows = pageRows.filter((r) => selected.has(spec.rowId(r)))
                  a.onRun(rows, [...selected])
                }}
              />
            ))}
          </div>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-2xs text-brand-800 hover:underline">
            Clear selection
          </button>
        </div>
      )}

      {/* ── table ──────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-card">
        <div className={cn('overflow-auto scrollbar-thin', compactHeight ? 'max-h-[420px]' : 'max-h-[calc(100vh-320px)]')}>
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-ink-50/95 backdrop-blur">
              <tr className="border-b border-ink-200 text-left">
                {bulkActions.length > 0 && (
                  <th className="w-8 px-3">
                    <input
                      type="checkbox"
                      aria-label="Select all rows on this page"
                      checked={allOnPage}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = new Set(prev)
                          for (const r of pageRows) e.target.checked ? next.add(spec.rowId(r)) : next.delete(spec.rowId(r))
                          return next
                        })
                      }
                      className="h-3.5 w-3.5 rounded border-ink-300 accent-brand-600"
                    />
                  </th>
                )}
                {cols.map((c, ci) => {
                  const sorted = (query.sort ?? spec.defaultSort)?.key === c.key
                  const dir = (query.sort ?? spec.defaultSort)?.dir
                  return (
                    <th
                      key={c.key}
                      style={{ width: c.width }}
                      className={cn(
                        'whitespace-nowrap px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-ink-500',
                        c.align === 'right' && 'text-right',
                        c.align === 'center' && 'text-center',
                        ci === 0 && 'sticky left-0 z-10 bg-ink-50/95',
                      )}
                    >
                      {c.sortable === false ? (
                        c.header
                      ) : (
                        <button
                          className="inline-flex items-center gap-1 hover:text-ink-800"
                          onClick={() =>
                            setQuery({ sort: { key: c.key, dir: sorted && dir === 'asc' ? 'desc' : 'asc' } }, false)
                          }
                        >
                          {c.header}
                          {sorted && (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                        </button>
                      )}
                    </th>
                  )
                })}
                {rowActions && <th className="w-10 px-3" />}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={cols.length + 2}>
                    <TableSkeleton cols={Math.min(7, cols.length)} />
                  </td>
                </tr>
              )}
              {!loading && pageRows.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 2}>
                    <EmptyState
                      icon={<Inbox className="h-5 w-5" />}
                      title={emptyTitle ?? (activeCount ? 'No rows match these filters' : 'Nothing here yet')}
                      body={
                        emptyBody ??
                        (activeCount
                          ? 'Loosen a filter, or reset to the default view. The table loads data immediately — you never need to search first.'
                          : undefined)
                      }
                      action={
                        activeCount ? (
                          <Button size="sm" variant="secondary" onClick={() => setQuery({ filters: spec.defaultFilters ?? {}, q: '' })}>
                            <RotateCcw className="h-3.5 w-3.5" /> Reset filters
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              )}
              {!loading &&
                pageRows.map((row) => {
                  const id = spec.rowId(row)
                  const href = spec.href?.(row)
                  return (
                    <tr
                      key={id}
                      className={cn(
                        'group border-b border-ink-100 last:border-0 hover:bg-brand-50/40',
                        selected.has(id) && 'bg-brand-50/60',
                        (href || onRowClick) && 'cursor-pointer',
                        rowH,
                      )}
                      onClick={() => onRowClick?.(row)}
                    >
                      {bulkActions.length > 0 && (
                        <td className="px-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${id}`}
                            checked={selected.has(id)}
                            onChange={() => toggleRow(id)}
                            className="h-3.5 w-3.5 rounded border-ink-300 accent-brand-600"
                          />
                        </td>
                      )}
                      {cols.map((c, ci) => {
                        const content = c.render ? c.render(row) : String(c.value ? c.value(row) ?? '—' : (row as Record<string, unknown>)[c.key] ?? '—')
                        const first = ci === 0
                        return (
                          <td
                            key={c.key}
                            className={cn(
                              cellPad,
                              'align-middle text-ink-700',
                              c.align === 'right' && 'text-right tabular',
                              c.align === 'center' && 'text-center',
                              c.mono && 'font-mono text-xs',
                              first && 'sticky left-0 z-[1] bg-white font-medium text-ink-900 group-hover:bg-[#fef7f8]',
                            )}
                          >
                            {first && href ? (
                              <Link to={href} className="hover:text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                                {content}
                              </Link>
                            ) : (
                              content
                            )}
                          </td>
                        )
                      })}
                      {rowActions && (
                        <td className="px-2 text-right" onClick={(e) => e.stopPropagation()}>
                          {rowActions(row)}
                        </td>
                      )}
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        {/* ── footer / pagination ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 bg-ink-50/60 px-3 py-2">
          <div className="flex items-center gap-2 text-2xs text-ink-500">
            {result && !loading ? (
              <>
                <span className="tabular">
                  {result.matched === 0 ? '0' : `${num((query.page - 1) * query.pageSize + 1)}–${num(Math.min(query.page * query.pageSize, result.matched))}`}
                  {' of '}
                  {num(result.matched)}
                </span>
                {result.matched !== result.total && <span>· {num(result.total)} total</span>}
                <Badge tone={result.ms < 1500 ? 'success' : 'warn'}>{result.ms} ms</Badge>
                <span className="hidden sm:inline">· server-side filter &amp; sort over {num(result.scanned)} rows</span>
              </>
            ) : (
              <span>Loading…</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={String(query.pageSize)}
              onChange={(e) => setQuery({ pageSize: Number(e.target.value) })}
              className="h-7 w-auto py-0 text-xs"
            >
              {(spec.pageSizes ?? [25, 50, 100, 250]).map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </Select>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                disabled={query.page <= 1}
                onClick={() => setQuery({ page: query.page - 1 }, false)}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="tabular text-2xs text-ink-600">
                {num(query.page)} / {num(result?.pages ?? 1)}
              </span>
              <Button
                size="icon"
                variant="ghost"
                disabled={!result || query.page >= result.pages}
                onClick={() => setQuery({ page: query.page + 1 }, false)}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {permission && (
        <p className="text-2xs text-ink-400">
          Read access enforced by <code className="font-mono">{permission}</code>. Actions are checked independently per row.
        </p>
      )}

      {/* ── save view modal ───────────────────────────────────────────── */}
      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save view"
        subtitle="Stores the current search, filters, sort and page size."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!viewName.trim()}
              onClick={() => {
                saveView({
                  tableId: spec.id,
                  name: viewName.trim(),
                  shared: viewShared,
                  owner: 'me',
                  query: { q: query.q, filters: query.filters, sort: query.sort, pageSize: query.pageSize },
                })
                setSaveOpen(false)
              }}
            >
              Save view
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="View name" required htmlFor="view-name">
            <Input id="view-name" value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="e.g. Expiring .nl domains" />
          </Field>
          <Checkbox
            label="Share with everyone who can see this table"
            hint="Shared views appear for all users with the read permission."
            checked={viewShared}
            onChange={(e) => setViewShared(e.target.checked)}
          />
        </div>
      </Modal>
    </div>
  )
}

function CreateButton({ create }: { create: { label: string; permission?: string; onClick: () => void } }) {
  const can = useCan(create.permission)
  if (!can) return null
  return (
    <Button variant="primary" onClick={create.onClick}>
      <Plus className="h-3.5 w-3.5" /> {create.label}
    </Button>
  )
}

function BulkActionButton<T>({ action, onRun }: { action: BulkAction<T>; onRun: () => void }) {
  const can = useCan(action.permission)
  const hasBase = useStore((s) => (action.permission ? s.hasBase(action.permission) : true))
  if (!hasBase) return null
  return (
    <Tooltip
      content={
        can
          ? action.tier
            ? `${action.tier} — controls apply before anything runs`
            : undefined
          : 'Requires elevation — request it from the top bar'
      }
    >
      <Button size="sm" variant={action.danger ? 'danger' : 'secondary'} onClick={onRun} disabled={!can}>
        {action.label}
        {action.tier && <span className="ml-1 text-2xs opacity-70">{action.tier}</span>}
      </Button>
    </Tooltip>
  )
}

function Chip({ label: text, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex max-w-xs items-center gap-1 rounded-full border border-ink-200 bg-white px-2 py-0.5 text-2xs text-ink-700">
      <span className="truncate">{text}</span>
      <button onClick={onClear} aria-label={`Remove filter ${text}`}>
        <X className="h-3 w-3 text-ink-400 hover:text-brand-700" />
      </button>
    </span>
  )
}

function FilterControl({
  def, value, onChange,
}: { def: FilterDef; value: FilterValue; onChange: (v: FilterValue) => void }) {
  if (def.type === 'text') {
    return (
      <Field label={def.label} hint={def.hint}>
        <Input value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={def.placeholder} />
      </Field>
    )
  }
  if (def.type === 'select') {
    return (
      <Field label={def.label} hint={def.hint}>
        <Select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">Any</option>
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    )
  }
  if (def.type === 'multiselect') {
    const arr = (value as string[]) ?? []
    return (
      <Field label={def.label} hint={def.hint}>
        <div className="flex flex-wrap gap-1">
          {def.options?.map((o) => {
            const on = arr.includes(o.value)
            return (
              <button
                key={o.value}
                onClick={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-2xs transition-colors',
                  on ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300',
                )}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      </Field>
    )
  }
  if (def.type === 'boolean') {
    return (
      <Field label={def.label} hint={def.hint}>
        <Select
          value={value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'true')}
        >
          <option value="">Any</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </Select>
      </Field>
    )
  }
  if (def.type === 'daterange') {
    const v = (value as { from?: string; to?: string }) ?? {}
    return (
      <Field label={def.label} hint={def.hint}>
        <div className="flex items-center gap-1.5">
          <Input type="date" value={v.from ?? ''} onChange={(e) => onChange({ ...v, from: e.target.value || undefined })} />
          <span className="text-2xs text-ink-400">to</span>
          <Input type="date" value={v.to ?? ''} onChange={(e) => onChange({ ...v, to: e.target.value || undefined })} />
        </div>
      </Field>
    )
  }
  const v = (value as { min?: number; max?: number }) ?? {}
  return (
    <Field label={def.label} hint={def.hint}>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          placeholder="min"
          value={v.min ?? ''}
          onChange={(e) => onChange({ ...v, min: e.target.value === '' ? undefined : Number(e.target.value) })}
        />
        <span className="text-2xs text-ink-400">to</span>
        <Input
          type="number"
          placeholder="max"
          value={v.max ?? ''}
          onChange={(e) => onChange({ ...v, max: e.target.value === '' ? undefined : Number(e.target.value) })}
        />
      </div>
    </Field>
  )
}

export function ScaleNote({ total }: { total: number }) {
  if (total < 50_000) return null
  return (
    <Callout tone="info" title={`${num(total)} records`}>
      Filtering, sorting and pagination all run server-side (NFR-1). Exports above 10,000 rows are handed to the job centre rather than
      blocking the page.
    </Callout>
  )
}
