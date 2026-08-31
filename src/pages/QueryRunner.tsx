import { useMemo, useState } from 'react'
import { Database, Download, Lock, Play, Terminal } from 'lucide-react'
import { Module, PageHeader, TabBar, useTab } from '../components/patterns/Page'
import { T2Confirm } from '../components/patterns/Destructive'
import {
  Badge, Button, Card, CardHeader, Field, Input, Select, StatTile, TableSkeleton, Textarea,
  TierBadge, Tooltip,
} from '../components/ui'
import { useCan, useStore } from '../lib/store'
import { csvDownload, num } from '../lib/format'
import { domains } from '../lib/mock/domains'
import { resellers } from '../lib/mock/resellers'
import { licenses } from '../lib/mock/products'
import { tasks } from '../lib/mock/ops'
import { payments } from '../lib/mock/finance'

/**
 * Query Runner.
 *
 * The dangerous version of this tool is a free-text SQL box against production.
 * This one runs a catalogue of reviewed, parameterised, read-only queries: the
 * same answers, without a stray UPDATE. Raw SQL is a separate tab that states
 * plainly why it is not enabled.
 */

interface Param {
  key: string
  label: string
  type: 'text' | 'number' | 'select'
  options?: string[]
  default: string
  hint?: string
}

interface QueryDef {
  id: string
  name: string
  category: 'Domains' | 'Resellers' | 'Billing' | 'Platform'
  description: string
  sql: string
  params: Param[]
  costHint: string
  run: (p: Record<string, string>) => { columns: string[]; rows: (string | number)[][]; scanned: number }
}

const QUERIES: QueryDef[] = [
  {
    id: 'domains_expiring_no_autorenew',
    name: 'Domains expiring without auto-renew',
    category: 'Domains',
    description: 'Domains that expire inside the window and will not renew themselves — the list that turns into churn if nobody calls.',
    sql: `SELECT d.name, d.expires_at, d.reseller_id, r.company
FROM domains d JOIN resellers r ON r.id = d.reseller_id
WHERE d.auto_renew = false
  AND d.status = 'active'
  AND d.expires_at BETWEEN now() AND now() + :days * interval '1 day'
ORDER BY d.expires_at
LIMIT :limit`,
    params: [
      { key: 'days', label: 'Days ahead', type: 'number', default: '30' },
      { key: 'limit', label: 'Row limit', type: 'number', default: '100', hint: 'Hard-capped at 1,000 rows.' },
    ],
    costHint: 'Indexed on expires_at — cheap.',
    run: (p) => {
      const ds = domains()
      const limit = Math.min(1000, Number(p.limit) || 100)
      const days = Number(p.days) || 30
      const cutoff = new Date(Date.parse('2026-08-26') + days * 86400000).toISOString().slice(0, 10)
      const rows: (string | number)[][] = []
      let scanned = 0
      for (let i = 0; i < ds.total && rows.length < limit; i++) {
        const d = ds.at(i)
        scanned++
        if (d._deleted || d.autoRenew || d.status !== 'active') continue
        if (d.expiresAt < '2026-08-26' || d.expiresAt > cutoff) continue
        rows.push([d.name, d.expiresAt, d.resellerId, d.company])
      }
      return { columns: ['name', 'expires_at', 'reseller_id', 'company'], rows, scanned }
    },
  },
  {
    id: 'resellers_negative_balance',
    name: 'Resellers with a negative balance',
    category: 'Resellers',
    description: 'Balance below the threshold, with domain count and payment term, for a collections pass.',
    sql: `SELECT id, company, balance, currency, payment_term, domains
FROM resellers
WHERE balance < :threshold
ORDER BY balance ASC
LIMIT :limit`,
    params: [
      { key: 'threshold', label: 'Balance below', type: 'number', default: '0' },
      { key: 'limit', label: 'Row limit', type: 'number', default: '100' },
    ],
    costHint: 'Full scan of resellers — 4,182 rows.',
    run: (p) => {
      const ds = resellers()
      const limit = Math.min(1000, Number(p.limit) || 100)
      const threshold = Number(p.threshold) || 0
      const out: { row: (string | number)[]; balance: number }[] = []
      for (let i = 0; i < ds.total; i++) {
        const r = ds.at(i)
        if (r._deleted || r.balance >= threshold) continue
        out.push({ row: [r.id, r.company, r.balance, r.currency, r.paymentTerm, r.domains], balance: r.balance })
      }
      out.sort((a, b) => a.balance - b.balance)
      return {
        columns: ['id', 'company', 'balance', 'currency', 'payment_term', 'domains'],
        rows: out.slice(0, limit).map((o) => o.row),
        scanned: ds.total,
      }
    },
  },
  {
    id: 'failed_tasks_by_type',
    name: 'Failed tasks grouped by type',
    category: 'Platform',
    description: 'Which task types are failing, and how often, over the chosen age window.',
    sql: `SELECT type, count(*) AS failures, max(created_at) AS last_failure
FROM tasks
WHERE status = 'failed' AND age_days <= :age
GROUP BY type
ORDER BY failures DESC`,
    params: [{ key: 'age', label: 'Age in days', type: 'number', default: '30' }],
    costHint: 'Scans the task table — 465,980 rows. Expect a second.',
    run: (p) => {
      const ds = tasks()
      const age = Number(p.age) || 30
      const acc = new Map<string, { n: number; last: string }>()
      let scanned = 0
      for (let i = 0; i < ds.total; i++) {
        const t = ds.at(i)
        scanned++
        if (t.status !== 'failed' || t.ageDays > age) continue
        const cur = acc.get(t.type) ?? { n: 0, last: '' }
        cur.n++
        if (t.createdAt > cur.last) cur.last = t.createdAt
        acc.set(t.type, cur)
      }
      const rows = [...acc.entries()]
        .map(([type, v]) => [type, v.n, v.last] as (string | number)[])
        .sort((a, b) => Number(b[1]) - Number(a[1]))
      return { columns: ['type', 'failures', 'last_failure'], rows, scanned }
    },
  },
  {
    id: 'licenses_by_vendor_account',
    name: 'Licenses per vendor account',
    category: 'Platform',
    description: 'Active license count and monthly value per vendor account, for reconciling the vendor invoice.',
    sql: `SELECT vendor_account, product, count(*) AS keys, sum(price) AS monthly_value
FROM licenses
WHERE status = :status
GROUP BY vendor_account, product
ORDER BY keys DESC`,
    params: [
      { key: 'status', label: 'Status', type: 'select', options: ['active', 'suspended', 'terminated', 'pending'], default: 'active' },
    ],
    costHint: 'Scans 108,216 license rows.',
    run: (p) => {
      const ds = licenses()
      const status = p.status || 'active'
      const acc = new Map<string, { keys: number; value: number }>()
      for (let i = 0; i < ds.total; i++) {
        const l = ds.at(i)
        if (l._deleted || l.status !== status) continue
        const key = `${l.vendorAccount}|${l.product}`
        const cur = acc.get(key) ?? { keys: 0, value: 0 }
        cur.keys++
        cur.value += l.price
        acc.set(key, cur)
      }
      const rows = [...acc.entries()]
        .map(([k, v]) => {
          const [account, product] = k.split('|')
          return [account, product, v.keys, Math.round(v.value * 100) / 100] as (string | number)[]
        })
        .sort((a, b) => Number(b[2]) - Number(a[2]))
      return { columns: ['vendor_account', 'product', 'keys', 'monthly_value'], rows, scanned: ds.total }
    },
  },
  {
    id: 'chargebacks_by_psp',
    name: 'Chargebacks and failures by PSP',
    category: 'Billing',
    description: 'Payment failure and chargeback counts per provider, to spot a misbehaving payment route.',
    sql: `SELECT psp, status, count(*) AS payments, sum(amount) AS value
FROM payments
WHERE status IN ('failed','chargeback')
GROUP BY psp, status
ORDER BY value DESC`,
    params: [],
    costHint: 'Scans 41,260 payment rows.',
    run: () => {
      const ds = payments()
      const acc = new Map<string, { n: number; value: number }>()
      for (let i = 0; i < ds.total; i++) {
        const p = ds.at(i)
        if (p._deleted) continue
        if (p.status !== 'failed' && p.status !== 'chargeback') continue
        const key = `${p.psp}|${p.status}`
        const cur = acc.get(key) ?? { n: 0, value: 0 }
        cur.n++
        cur.value += p.amount
        acc.set(key, cur)
      }
      const rows = [...acc.entries()]
        .map(([k, v]) => {
          const [psp, status] = k.split('|')
          return [psp, status, v.n, Math.round(v.value * 100) / 100] as (string | number)[]
        })
        .sort((a, b) => Number(b[3]) - Number(a[3]))
      return { columns: ['psp', 'status', 'payments', 'value'], rows, scanned: ds.total }
    },
  },
]

export function QueryRunnerPage() {
  const [tab, setTab] = useTab('catalogue')
  const [selected, setSelected] = useState(QUERIES[0].id)
  const query = QUERIES.find((q) => q.id === selected)!
  const [params, setParams] = useState<Record<string, string>>(
    Object.fromEntries(query.params.map((p) => [p.key, p.default])),
  )
  const [result, setResult] = useState<{ columns: string[]; rows: (string | number)[][]; ms: number; scanned: number } | null>(null)
  const [running, setRunning] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const canRun = useCan('system.query.run')
  const canExport = useCan('system.query.export')
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)

  const grouped = useMemo(() => {
    const acc = new Map<string, QueryDef[]>()
    for (const q of QUERIES) acc.set(q.category, [...(acc.get(q.category) ?? []), q])
    return [...acc.entries()]
  }, [])

  const select = (id: string) => {
    const q = QUERIES.find((x) => x.id === id)!
    setSelected(id)
    setParams(Object.fromEntries(q.params.map((p) => [p.key, p.default])))
    setResult(null)
  }

  const run = () => {
    setRunning(true)
    const t0 = performance.now()
    window.setTimeout(() => {
      const r = query.run(params)
      setResult({ ...r, ms: Math.round(performance.now() - t0) })
      setRunning(false)
      logAudit({
        action: 'system.query.run',
        resource: 'query',
        resourceId: query.id,
        after: { params, rows: r.rows.length, scanned: r.scanned },
      })
    }, 30)
  }

  return (
    <Module permissions={['system.query.read']} what="the query runner">
      <PageHeader
        title="Query Runner"
        subtitle="A catalogue of reviewed, read-only queries with parameters — the answers people used to ask engineering for, without a free-text SQL box pointed at production."
        meta={<Badge tone="neutral">{QUERIES.length} approved queries</Badge>}
      />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'catalogue', label: 'Query catalogue', count: QUERIES.length },
          { id: 'raw', label: 'Raw SQL' },
        ]}
      />

      {tab === 'catalogue' && (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="h-fit">
            <CardHeader title="Queries" subtitle="Grouped by subject" />
            <div className="p-1.5">
              {grouped.map(([category, list]) => (
                <div key={category} className="mb-1">
                  <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-ink-400">{category}</p>
                  {list.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => select(q.id)}
                      className={`w-full rounded-lg px-2 py-1.5 text-left ${q.id === selected ? 'bg-brand-50' : 'hover:bg-ink-50'}`}
                    >
                      <span className={`block text-xs ${q.id === selected ? 'font-medium text-brand-900' : 'text-ink-800'}`}>{q.name}</span>
                      <span className="block text-2xs text-ink-500">{q.params.length} parameter(s)</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader
                title={query.name}
                subtitle={query.description}
                icon={<Database className="h-4 w-4" />}
                actions={<Tooltip content={query.costHint}><Badge tone="neutral">cost</Badge></Tooltip>}
              />
              <div className="space-y-3 p-4">
                <pre className="overflow-x-auto scrollbar-thin rounded-lg bg-ink-950 p-3 font-mono text-2xs leading-relaxed text-ink-100">
                  {query.sql}
                </pre>
                {query.params.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {query.params.map((p) => (
                      <Field key={p.key} label={p.label} hint={p.hint}>
                        {p.type === 'select' ? (
                          <Select value={params[p.key] ?? ''} onChange={(e) => setParams({ ...params, [p.key]: e.target.value })}>
                            {p.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                          </Select>
                        ) : (
                          <Input
                            type={p.type === 'number' ? 'number' : 'text'}
                            value={params[p.key] ?? ''}
                            onChange={(e) => setParams({ ...params, [p.key]: e.target.value })}
                          />
                        )}
                      </Field>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button variant="primary" loading={running} disabled={!canRun} onClick={run}>
                    <Play className="h-3.5 w-3.5" /> Run query
                  </Button>
                  {!canRun && <span className="text-2xs text-ink-500">Requires system.query.run.</span>}
                  <span className="ml-auto text-2xs text-ink-500">{query.costHint}</span>
                </div>
              </div>
            </Card>

            {(running || result) && (
              <Card>
                <CardHeader
                  title="Result"
                  subtitle={result ? `${num(result.rows.length)} rows · scanned ${num(result.scanned)} · ${result.ms} ms` : 'Running…'}
                  actions={
                    result ? (
                      <Button size="sm" variant="secondary" disabled={!canExport} onClick={() => setExportOpen(true)}>
                        <Download className="h-3.5 w-3.5" /> Export
                      </Button>
                    ) : undefined
                  }
                />
                {running ? (
                  <TableSkeleton rows={6} cols={4} />
                ) : result && result.rows.length === 0 ? (
                  <p className="px-4 py-10 text-center text-xs text-ink-500">No rows matched. The query ran successfully.</p>
                ) : result ? (
                  <div className="max-h-[460px] overflow-auto scrollbar-thin">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
                        <tr>
                          {result.columns.map((c) => (
                            <th key={c} className="px-4 py-2 text-left font-mono">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.slice(0, 500).map((row, i) => (
                          <tr key={i} className="border-t border-ink-100">
                            {row.map((cell, j) => (
                              <td key={j} className="px-4 py-1.5 font-mono text-xs text-ink-700">{String(cell)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {result && result.rows.length > 500 && (
                  <div className="border-t border-ink-100 px-4 py-2">
                    <p className="text-2xs text-ink-500">Showing the first 500 of {num(result.rows.length)} rows. Export for the rest.</p>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === 'raw' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Raw SQL" subtitle="Deliberately not enabled" icon={<Terminal className="h-4 w-4" />} />
            <div className="space-y-3 p-4">
              <Textarea rows={8} disabled value={'-- Free-text SQL against production is not available here.\n-- See the note beside this box.'} />
              <Button variant="secondary" disabled>
                <Lock className="h-3.5 w-3.5" /> Execute (disabled)
              </Button>
            </div>
          </Card>
          <Card>
            <CardHeader title="Why it is not a text box" />
            <div className="space-y-2 p-4 text-xs leading-relaxed text-ink-600">
              <p>
                A free-text SQL runner in an admin panel is a write primitive wearing a read costume: one missing <code className="font-mono">WHERE</code>{' '}
                clause and it is an incident, and nothing in the audit log tells you what the query was going to do beforehand.
              </p>
              <p>
                The catalogue on the other tab covers the questions this tool actually gets used for. Each entry is reviewed once, is
                parameterised so it cannot be reshaped at runtime, is capped at 1,000 rows, and records who ran it with which parameters.
              </p>
              <p className="text-ink-700">
                If a question is not in the catalogue, that is a request for a new catalogue entry — a small, reviewable change — rather
                than a reason to open the box.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge tone="neutral">read-only</Badge>
                <Badge tone="neutral">parameterised</Badge>
                <Badge tone="neutral">1,000-row cap</Badge>
                <Badge tone="neutral">audited</Badge>
                <span className="text-2xs text-ink-500">running is <TierBadge tier="T1" />, export is <TierBadge tier="T2" /></span>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Approved queries" value={QUERIES.length} />
        <StatTile label="Row cap" value="1,000" hint="per run, enforced server-side" />
        <StatTile label="Raw SQL" value="disabled" tone="success" hint="by design, not by oversight" />
      </div>

      <T2Confirm
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export query result"
        permission="system.query.export"
        cta="Export CSV"
        description={
          <>
            Exports {num(result?.rows.length ?? 0)} rows from <code className="font-mono">{query.id}</code>. Query exports often contain
            personal data, so the export itself is recorded with your reason and ticket.
          </>
        }
        onConfirm={({ reason, ticket }) => {
          if (result) {
            const csv = [result.columns.join(','), ...result.rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
            csvDownload(`${query.id}.csv`, csv)
          }
          logAudit({ action: 'system.query.export', resource: 'query_export', resourceId: query.id, after: { rows: result?.rows.length }, reason, ticket })
          addToast({ kind: 'success', title: 'Export ready', body: 'Recorded in the audit log with your reason and ticket.' })
          setExportOpen(false)
        }}
      />
    </Module>
  )
}
