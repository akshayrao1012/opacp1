import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Module, PageHeader, TabBar, useTab } from '../components/patterns/Page'
import { Badge, Callout, Card, CardHeader, SearchInput, StatTile } from '../components/ui'
import { cn, num } from '../lib/format'

type Disposition = 'Rebuild' | 'Merge' | 'Retire' | 'Fix' | 'Elevate' | 'New'

interface Row {
  n: number
  page: string
  location: string
  to?: string
  disposition: Disposition[]
  notes?: string
}

/** PRD §7 — every page in the supplied inventory, with its new home. */
const ROWS: Row[] = [
  { n: 1, page: 'Delete reseller', location: 'Platform Ops → Bulk operations', to: '/system/bulk?op=reseller_delete', disposition: ['Elevate'], notes: 'T3. Dry run, typed confirm, second approver, GDPR sign-off' },
  { n: 2, page: 'Promocode Manager', location: 'Catalog → Promocodes', to: '/billing/promocodes?tab=standard', disposition: ['Merge'], notes: 'Unified module, type = Standard' },
  { n: 3, page: 'Fast Checkout Promocodes', location: 'Catalog → Promocodes', to: '/billing/promocodes?tab=fast', disposition: ['Merge'], notes: 'Same module, type = FastCheckout' },
  { n: 4, page: 'Twinfield → Overview', location: '— retired', disposition: ['Retire'], notes: 'Removed at product request. Note this departs from PRD §7 row 4, which specified a rebuild with masked tokens' },
  { n: 5, page: 'Mail → Overview', location: 'Platform Ops → Mail (tab)', to: '/system/mail?tab=overview', disposition: ['Merge'], notes: 'Export added — explicitly requested in the inventory' },
  { n: 6, page: 'Mail → Verification', location: 'Platform Ops → Mail (tab)', to: '/system/mail?tab=verification', disposition: ['Merge'], notes: 'Export added' },
  { n: 7, page: '3rdPTS transfers', location: 'Domains → Transfers (tab)', to: '/domains/transfers?tab=third_party', disposition: ['Merge'] },
  { n: 8, page: '3rdPTS transfers → Grouped by resellers', location: 'Domains → Transfers (tab)', to: '/domains/transfers?tab=grouped', disposition: ['Merge'] },
  { n: 9, page: 'Domain Providers → Providers', location: 'Catalog → Domain providers', to: '/domains/providers', disposition: ['Rebuild'], notes: 'Reference list with live health' },
  { n: 10, page: 'Domain Providers → Resellers', location: 'Resellers → Provider mappings', to: '/domains/providers?tab=reseller-mapping', disposition: ['Rebuild'], notes: 'Credentials are write-only (P8)' },
  { n: 11, page: 'Domain Providers → Statistic', location: 'Resellers → Statistics', to: '/customers/resellers/statistics', disposition: ['Rebuild'] },
  { n: 12, page: 'Membership Plans → Subscriptions', location: 'Resellers → Memberships', to: '/customers/resellers/memberships', disposition: ['Rebuild'], notes: '18,160 records — P1 at scale' },
  { n: 13, page: 'Membership Plans → Plan Rate Limits', location: 'Platform Ops → Rate limits', to: '/customers/membership-plans?tab=rate-limits', disposition: ['Rebuild'], notes: 'Override hierarchy made visible' },
  { n: 14, page: 'Trademark Manager', location: 'Products → Trademarks', to: '/domains/trademarks', disposition: ['Rebuild'] },
  { n: 15, page: 'Task Manager → Overview', location: 'Platform Ops → Task manager (tab)', to: '/system/tasks?tab=live', disposition: ['Merge'], notes: '465,980 entries, 182,003 outdated — cleanup story included' },
  { n: 16, page: 'Task Manager → Errors', location: 'Platform Ops → Task manager (tab)', to: '/system/tasks?tab=errors', disposition: ['Merge'] },
  { n: 17, page: 'Payments → Overview', location: 'Finance → Payments', to: '/billing/payments', disposition: ['Rebuild'] },
  { n: 18, page: 'Payments → Refund', location: 'Finance → Refunds', to: '/billing/payments?tab=refunds', disposition: ['Elevate'], notes: 'T2 → T3 above threshold. Ticket validated; approver queue' },
  { n: 19, page: 'Custom Settings → Overview', location: 'Platform Ops → Custom settings', to: '/system/custom-settings', disposition: ['Rebuild'], notes: 'Feature-flag surface with effective scope' },
  { n: 20, page: 'Custom Settings → Create new', location: 'Platform Ops → Custom settings', to: '/system/custom-settings', disposition: ['Merge'], notes: 'Drawer on the list' },
  { n: 21, page: 'Promotions → Overview', location: 'Catalog → Promotions', to: '/billing/promotions?tab=standard', disposition: ['Rebuild'] },
  { n: 22, page: 'Promotions → Multilayer', location: 'Catalog → Promotions (tab)', to: '/billing/promotions?tab=multiyear', disposition: ['Fix'], notes: 'Renamed Multiyear; hardcoded username removed; validation preview added' },
  { n: 23, page: 'Virtual Product', location: 'Products → Virtual products', to: '/products/virtual-products', disposition: ['Rebuild'] },
  { n: 24, page: 'Invoice Reports → Overview', location: 'Billing → Invoices', to: '/billing/invoices', disposition: ['Rebuild'], notes: 'Read-only invoice register: filters, VAT scheme, dunning, per-invoice lines and PDF' },
  { n: 25, page: 'Invoice Reports → Create invoice', location: '— retired', disposition: ['Retire'], notes: 'Invoice generation is not an ACP capability: the run belongs to the billing pipeline. Invoices are read-only here' },
  { n: 26, page: 'DNS Zones → Overview', location: 'Products → DNS zones', to: '/products/dns-zones', disposition: ['Rebuild'] },
  { n: 27, page: 'DNS Zones → Bulk DNS form', location: 'Platform Ops → Bulk operations', to: '/system/bulk?op=dns_zone_delete', disposition: ['Elevate'], notes: 'T3. Zone deletion previously had no guardrail at all' },
  { n: 28, page: 'SSL → Overview', location: 'Products → SSL', to: '/products/ssl', disposition: ['Rebuild'], notes: 'Reset Comodo password is T2 with an impact statement' },
  { n: 29, page: 'SSL → SSL Panel', location: 'Products → SSL (tab)', to: '/products/ssl?tab=panel', disposition: ['Rebuild'], notes: 'Kept as a labelled hand-off tab: what it is, which account, what it does that the ACP cannot. Pending Q7' },
  { n: 30, page: 'Extensions → Overview', location: 'Catalog → Extensions', to: '/products/extensions', disposition: ['Rebuild'] },
  { n: 31, page: 'Extensions → Create new', location: 'Catalog → Extensions', to: '/products/extensions', disposition: ['Merge'], notes: 'Drawer; keeps clone-from-existing' },
  { n: 30.1, page: 'Extension - Details (per-TLD screen)', location: 'Catalog → extension detail', to: '/products/extensions/com', disposition: ['Rebuild'], notes: 'Full legacy field set across 5 tabs; reachable from the Go to Tld quick-jump field' },
  { n: 32, page: 'SpamExperts → Configurations', location: 'Products → SpamExperts (tab)', to: '/products/spamexperts?tab=configurations', disposition: ['Rebuild'] },
  { n: 33, page: 'SpamExperts → Bundles', location: 'Products → SpamExperts (tab)', to: '/products/spamexperts?tab=bundles', disposition: ['Rebuild'] },
  { n: 34, page: 'SpamExperts → Domains', location: 'Products → SpamExperts (tab)', to: '/products/spamexperts?tab=domains', disposition: ['Rebuild'], notes: '4,590 records' },
  { n: 35, page: 'Licenses → Overview', location: 'Products → Licenses', to: '/products/licenses', disposition: ['Rebuild'], notes: '108,216 records — P1 at scale is mandatory' },
  { n: 36, page: 'Licenses → Migration (new, Plesk)', location: 'Platform Ops → Bulk operations', to: '/system/bulk?op=license_migration', disposition: ['Merge', 'Elevate'], notes: 'Single migration wizard, T3' },
  { n: 37, page: 'Licenses → Migration (import)', location: 'Platform Ops → Bulk operations', to: '/system/bulk?op=license_migration', disposition: ['Merge', 'Elevate'], notes: 'Same wizard, source = Plesk / Virtuozzo' },
  { n: 38, page: 'Licenses → Change Owner', location: '— retired', disposition: ['Retire'], notes: 'Returned 404. Capability confirmation pending Q8' },
  { n: 39, page: 'Customers → Contact Validation', location: 'Customers → Contact validation', to: '/customers/contact-validation', disposition: ['Rebuild'], notes: 'Lock/Approve/Unlock are audited T2 actions' },
  { n: 40, page: 'Customers → Identity Verification (KYC/KYB)', location: 'Customers → Identity verification', to: '/customers/identity-verification', disposition: ['Rebuild'], notes: 'Queue-first, document viewer, spelling fixed' },
  { n: 41, page: 'Domains → Overview', location: 'Domains → Overview', to: '/domains', disposition: ['Rebuild'] },
  { n: 42, page: 'Domains → Premium', location: 'Domains → Overview (filter)', to: '/domains?f=%7B%22premium%22%3Atrue%7D', disposition: ['Merge'], notes: 'A saved view, not a separate page' },
  { n: 43, page: 'Domains → Create in Database', location: 'Domains → Create in database', to: '/domains/create-in-database', disposition: ['Elevate'], notes: 'Test mode kept and made mandatory' },
  { n: 44, page: 'Domains → Internal Transfer', location: 'Platform Ops → Bulk operations', to: '/system/bulk?op=internal_transfer', disposition: ['Merge', 'Elevate'], notes: 'Test mode mandatory' },
  { n: 45, page: 'Domains → Notifications', location: 'Domains → Notifications', to: '/domains/notifications', disposition: ['Rebuild'] },
  { n: 46, page: 'Domains → Domain info', location: 'Domains → Domain info', to: '/domains/domain-info', disposition: ['Rebuild'], notes: 'Structured EPP fields with a raw-JSON toggle' },
  { n: 46.1, page: 'Domain - Details (per-domain screen)', location: 'Domains → domain detail', to: '/domains/atlasindigo.dev', disposition: ['Rebuild'], notes: '~40 fields and 12 action buttons regrouped into 8 tabs; deletes are T3 with dry run + approver, restores T2' },
  { n: 47, page: 'Domains → Bulk Domain Form', location: 'Platform Ops → Bulk operations', to: '/system/bulk?op=domain_delete', disposition: ['Merge', 'Elevate'], notes: 'T3 for delete; T1 for lookup' },
  { n: 48, page: 'Domains → Bulk Abuse form', location: 'Platform Ops → Bulk operations', to: '/system/bulk?op=domain_abuse', disposition: ['Merge', 'Elevate'], notes: 'T3. Spelling fixed. Ticket reference mandatory' },
  { n: 49, page: 'Resellers → Overview', location: 'Resellers → Overview', to: '/customers/resellers', disposition: ['Rebuild'], notes: 'Extended search became saved-view segmentation' },
  { n: 50, page: 'Resellers → Show new', location: 'Resellers → New & pending', to: '/customers/resellers/new-pending', disposition: ['Rebuild'], notes: 'Two tables became tabs of an onboarding queue' },
  { n: 51, page: 'Resellers → Disabled modify domain', location: '— retired', disposition: ['Retire'], notes: 'Returned 404' },
  { n: 52, page: 'Resellers → Notification Settings', location: 'Resellers → Notification settings', to: '/customers/resellers/notification-settings', disposition: ['Rebuild'], notes: 'API key and signature secret use P8' },
  { n: 53, page: '—', location: 'Home dashboard', to: '/', disposition: ['New'], notes: 'Role-aware landing' },
  { n: 54, page: '—', location: 'System', to: '/system/roles', disposition: ['New'], notes: 'Roles, permissions, users, audit log, job centre, query runner' },
  { n: 55, page: '—', location: 'Risk & Abuse → Bruteforce', to: '/risk/bruteforce', disposition: ['New'], notes: 'Attempts · Activation · Last-minute changes' },
  { n: 56, page: '—', location: 'Risk & Abuse → IP Blacklist', to: '/risk/ip-blacklist', disposition: ['New'] },
  { n: 57, page: '—', location: 'Risk & Abuse → Banned Keywords', to: '/risk/banned-keywords', disposition: ['New'], notes: 'Measures its own false positives' },
  { n: 58, page: '—', location: 'Risk & Abuse → Batch Cracker', to: '/risk/batch-cracker', disposition: ['New'], notes: 'Split / replay / resume stuck batches; abandon is T3' },
  { n: 59, page: '—', location: 'Reports (6 modules)', to: '/reports/support', disposition: ['New'], notes: 'Support · Sales · Postpaid debt · Negative balance · Provider statistics · EV' },
  { n: 60, page: '—', location: 'System → Query Runner', to: '/system/query-runner', disposition: ['New'], notes: 'Approved parameterised queries; raw SQL deliberately disabled' },
  { n: 61, page: '—', location: 'Billing → Subscriptions', to: '/billing/subscriptions', disposition: ['New'], notes: 'Reseller WPP attach rate and revenue' },
  { n: 62, page: '—', location: 'System → Feedback', to: '/system/feedback', disposition: ['New'], notes: 'Prototype-only: in-page review widget (highlight text to quote it); the collected notes are readable by Super Admin' },
]

const TONE: Record<Disposition, 'neutral' | 'info' | 'warn' | 'danger' | 'success' | 'purple'> = {
  Rebuild: 'info',
  Merge: 'neutral',
  Retire: 'warn',
  Fix: 'success',
  Elevate: 'danger',
  New: 'purple',
}

const PATTERNS = [
  ['P1 — List / table', 'Server-side filter, sort and pagination. Saved views, column picker, density, sticky header, URL state, CSV export as a job.', 'Every list module'],
  ['P2 — Entity detail', 'Header with identifier, status and key facts; tabbed body; related-records rail; activity timeline.', 'Reseller, Domain, KYC case'],
  ['P3 — Form', 'Inline validation on blur, field-level errors, required marking, no destructive submit without confirmation. Create opens as a drawer.', 'All create and edit flows'],
  ['P4 — Bulk operation', 'Input → validate per row → mandatory dry run → confirm → async job → result report → rollback path.', 'Platform Ops → Bulk operations'],
  ['P5 — Destructive action', 'Danger zone, plain-language consequences, typed confirmation, reason and ticket, second approver for T3.', 'Reseller delete, domain suspend, zone delete'],
  ['P6 — Async job', 'Everything slow becomes a job with an ID, progress, owner and downloadable result.', 'Job centre, exports, bulk operations, migrations'],
  ['P7 — Audit and activity', 'Immutable record of actor, role, before/after, reason, ticket and IP. Surfaced per entity and globally.', 'Audit log + every entity timeline'],
  ['P8 — Secrets', 'Masked by default, revealed by an audited permissioned action, impact stated before rotation.', 'Notification settings, provider mappings, EPP auth info'],
  ['P9 — States', 'Defined empty, loading, error and no-permission states. Errors carry a correlation ID.', 'Every view'],
  ['P10 — Foundation', 'Openprovider brand (#CC1F3A), WCAG 2.1 AA targets, keyboard navigation, ⌘K omnisearch, responsive to tablet.', 'App shell'],
]

const OPEN_DECISIONS = [
  ['Q1', 'Re-skin the existing ACP or build a new front end against a dedicated admin API?', 'Akshay + Engineering'],
  ['Q2', 'Is there an existing internal design system to build on?', 'Design'],
  ['Q3', 'Which identity provider backs ACP login, and can roles derive from IdP groups?', 'IT / Security'],
  ['Q4', 'Which ACP sections exist beyond "Overviews"?', 'Akshay'],
  ['Q5', 'Can the backend filter and sort the 100k+ tables, or is a read model needed?', 'Engineering'],
  ['Q6', 'Audit log retention period and legal requirements', 'Legal / Compliance'],
  ['Q7', 'Does sslpanel.io get absorbed into the ACP?', 'Product'],
  ['Q8', 'Is Licenses → Change Owner still needed?', 'Product + Support'],
  ['Q9', 'Cleanup plan for 182,003 outdated tasks', 'Engineering'],
  ['Q10', 'Who are the named approvers for T3 operations and refunds above threshold?', 'Finance + Ops leadership'],
]

export function CoveragePage() {
  const [tab, setTab] = useTab('pages')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Disposition | 'all'>('all')

  const counts = useMemo(() => {
    const c: Record<string, number> = { Rebuild: 0, Merge: 0, Retire: 0, Fix: 0, Elevate: 0, New: 0 }
    for (const r of ROWS) for (const d of r.disposition) c[d]++
    return c
  }, [])

  const filtered = ROWS.filter(
    (r) =>
      (filter === 'all' || r.disposition.includes(filter)) &&
      (!query ||
        `${r.page} ${r.location} ${r.notes ?? ''}`.toLowerCase().includes(query.toLowerCase())),
  )

  return (
    <Module permissions={[]}>
      <PageHeader
        title="PRD coverage"
        subtitle="Every page in the supplied inventory, where it lives now, and which canonical pattern it inherits. This page exists so the prototype can be reviewed against the document rather than from memory."
      />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Rebuild" value={counts.Rebuild} onClick={() => setFilter('Rebuild')} />
        <StatTile label="Merge" value={counts.Merge} onClick={() => setFilter('Merge')} />
        <StatTile label="Retire" value={counts.Retire} tone="warn" onClick={() => setFilter('Retire')} />
        <StatTile label="Fix" value={counts.Fix} tone="success" onClick={() => setFilter('Fix')} />
        <StatTile label="Elevate" value={counts.Elevate} tone="danger" onClick={() => setFilter('Elevate')} />
        <StatTile label="New" value={counts.New} onClick={() => setFilter('New')} />
      </div>

      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'pages', label: 'Page disposition', count: ROWS.length },
          { id: 'patterns', label: 'Patterns', count: PATTERNS.length },
          { id: 'decisions', label: 'Open decisions', count: OPEN_DECISIONS.length },
        ]}
      />

      {tab === 'pages' && (
        <Card>
          <CardHeader
            title="Page disposition map"
            subtitle={`${filtered.length} of ${ROWS.length} rows`}
            actions={
              <div className="flex items-center gap-2">
                {filter !== 'all' && (
                  <button onClick={() => setFilter('all')} className="text-2xs text-brand-700 hover:underline">
                    Clear filter
                  </button>
                )}
                <SearchInput value={query} onChange={setQuery} placeholder="Search pages" className="w-56" />
              </div>
            }
          />
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-3 py-2 text-right">#</th>
                  <th className="px-3 py-2 text-left">Current page</th>
                  <th className="px-3 py-2 text-left">New location</th>
                  <th className="px-3 py-2 text-left">Disposition</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.n} className="border-t border-ink-100 hover:bg-ink-50">
                    <td className="px-3 py-2 text-right tabular text-2xs text-ink-400">{r.n}</td>
                    <td className="px-3 py-2 font-medium text-ink-900">{r.page}</td>
                    <td className="px-3 py-2">
                      {r.to ? (
                        <Link to={r.to} className="text-brand-700 hover:underline">{r.location}</Link>
                      ) : (
                        <span className="text-ink-500">{r.location}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap gap-1">
                        {r.disposition.map((d) => (
                          <Badge key={d} tone={TONE[d]}>{d}</Badge>
                        ))}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-2xs text-ink-600">{r.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'patterns' && (
        <div className="grid gap-3 lg:grid-cols-2">
          {PATTERNS.map(([name, description, where]) => (
            <Card key={name} className="p-4">
              <h3 className="text-sm font-semibold text-ink-900">{name}</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-600">{description}</p>
              <p className="mt-2 text-2xs text-ink-400">Applied in: {where}</p>
            </Card>
          ))}
        </div>
      )}

      {tab === 'decisions' && (
        <>
          <Callout tone="warn" title="These block parts of the build">
            The prototype takes a position where it can (masked secrets, mandatory dry runs, retired dead pages) and marks the rest
            visibly rather than guessing silently.
          </Callout>
          <Card>
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-left">Question</th>
                  <th className="px-4 py-2 text-left">Owner</th>
                </tr>
              </thead>
              <tbody>
                {OPEN_DECISIONS.map(([id, q, owner]) => (
                  <tr key={id} className="border-t border-ink-100">
                    <td className="px-4 py-2 font-mono text-2xs text-ink-500">{id}</td>
                    <td className="px-4 py-2 text-ink-800">{q}</td>
                    <td className="px-4 py-2 text-2xs text-ink-600">{owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <p className={cn('text-2xs text-ink-400')}>
        Summary: {num(counts.Rebuild)} rebuild · {num(counts.Merge)} merge · {num(counts.Retire)} retire · {num(counts.Elevate)} elevated
        · {num(counts.New)} new modules.
      </p>
    </Module>
  )
}
