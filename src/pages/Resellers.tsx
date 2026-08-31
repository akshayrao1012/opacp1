import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowUpRight, Building2, CheckCircle2, Globe, KeyRound, Mail, Trash2, UserCheck, XCircle,
} from 'lucide-react'
import { DataTable, ScaleNote } from '../components/patterns/DataTable'
import { EntityDetail, RelatedList } from '../components/patterns/EntityDetail'
import { Module, PageHeader, TabBar, useTab } from '../components/patterns/Page'
import { ActivityTimeline } from '../components/patterns/Activity'
import { DangerZone, T2Confirm } from '../components/patterns/Destructive'
import {
  Badge, Button, Callout, Card, CardHeader, DefinitionList, Drawer, Field, Input, Modal,
  Progress, SecretValue, Select, StatTile, StatusBadge, Tooltip,
} from '../components/ui'
import { useCan, useStore } from '../lib/store'
import { money, num, pct, relative, shortDate } from '../lib/format'
import type { TableSpec } from '../lib/table'
import {
  ACCOUNT_MANAGERS, MEMBERSHIPS, PREMIUM_MEMBERSHIPS, PROVIDER_NAMES, findReseller, membershipSubscriptions,
  notificationSettings, pendingResellers, providerMappings, resellerContacts, resellerStats,
  resellers, type Membership, type MembershipSubscription, type NotificationSetting, type PendingReseller,
  type ProviderMapping, type Reseller, type ResellerStat,
} from '../lib/mock/resellers'
import { domainsOfReseller } from '../lib/mock/domains'
import { customersOfReseller } from '../lib/mock/customers'
import { COUNTRIES } from '../lib/rng'

// ─────────────────────────────────────────────────────── Overview & search

const resellerSpec: TableSpec<Reseller> = {
  id: 'resellers',
  rowId: (r) => String(r.id),
  href: (r) => `/customers/resellers/${r.id}`,
  defaultSort: { key: 'id', dir: 'asc' },
  pageSizes: [25, 50, 100, 250],
  search: (r) => `${r.id} ${r.company} ${r.contactName} ${r.email} ${r.vat} ${r.countryName}`,
  columns: [
    { key: 'id', header: 'ID', width: 90, mono: true, value: (r) => r.id },
    { key: 'company', header: 'Company', render: (r) => <span className="font-medium text-ink-900">{r.company}</span> },
    { key: 'status', header: 'Status', width: 110, render: (r) => <StatusBadge status={r.status} /> },
    { key: 'segment', header: 'Segment', width: 110, render: (r) => <span className="capitalize">{r.segment.replace('_', ' ')}</span> },
    { key: 'membership', header: 'Membership', width: 110 },
    { key: 'countryName', header: 'Country', width: 130 },
    { key: 'domains', header: 'Domains', width: 90, align: 'right', render: (r) => num(r.domains) },
    { key: 'balance', header: 'Balance', width: 110, align: 'right', render: (r) => (
      <span className={r.balance < 0 ? 'font-medium text-brand-700' : undefined}>{money(r.balance, r.currency)}</span>
    ) },
    { key: 'monthlyRevenue', header: 'MRR', width: 100, align: 'right', optional: true, render: (r) => money(r.monthlyRevenue) },
    { key: 'kyc', header: 'KYC', width: 100, render: (r) => <StatusBadge status={r.kyc} /> },
    { key: 'accountManager', header: 'Account manager', width: 150, optional: true },
    { key: 'lastLoginAt', header: 'Last login', width: 120, render: (r) => <Tooltip content={r.lastLoginAt}><span>{relative(r.lastLoginAt)}</span></Tooltip> },
    { key: 'createdAt', header: 'Created', width: 110, optional: true, render: (r) => shortDate(r.createdAt) },
    { key: 'contactName', header: 'Contact', width: 150, optional: true },
    { key: 'email', header: 'Email', width: 200, optional: true },
    { key: 'twoFactor', header: '2FA', width: 70, optional: true, render: (r) => (r.twoFactor ? 'Yes' : 'No') },
    { key: 'riskScore', header: 'Risk', width: 80, align: 'right', optional: true },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['active', 'suspended', 'pending', 'closed'].map((v) => ({ value: v, label: v })) },
    { key: 'segment', label: 'Segment', type: 'multiselect', options: ['enterprise', 'mid_market', 'smb', 'individual'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'membership', label: 'Membership', type: 'multiselect', options: MEMBERSHIPS.map((m) => ({ value: m, label: m })) },
    { key: 'country', label: 'Country', type: 'select', options: COUNTRIES.map(([c, n]) => ({ value: c, label: n })) },
    { key: 'kyc', label: 'KYC status', type: 'multiselect', options: ['verified', 'pending', 'failed', 'not_started'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'accountManager', label: 'Account manager', type: 'select', options: ACCOUNT_MANAGERS.map((a) => ({ value: a, label: a })) },
    { key: 'balance', label: 'Balance', type: 'numberrange', hint: 'Negative balances first: set max to 0.' },
    { key: 'domains', label: 'Domain count', type: 'numberrange' },
    { key: 'createdAt', label: 'Created', type: 'daterange' },
    { key: 'twoFactor', label: 'Two-factor enabled', type: 'boolean' },
  ],
}

export function ResellersOverview() {
  const [addOpen, setAddOpen] = useState(false)
  const ds = resellers()
  const stats = useMemo(() => {
    let active = 0
    let negative = 0
    let pending = 0
    let domains = 0
    for (let i = 0; i < ds.total; i++) {
      const r = ds.at(i)
      if (r._deleted) continue
      if (r.status === 'active') active++
      if (r.status === 'pending') pending++
      if (r.balance < 0) negative++
      domains += r.domains
    }
    return { active, negative, pending, domains }
  }, [ds])

  return (
    <Module permissions={['reseller.read']} what="the reseller overview">
      <PageHeader
        title="Resellers"
        subtitle="Extended search is gone: what used to be a hidden toggle with different criteria is now saved-view segmentation on one table."
        meta={<Badge tone="neutral">Replaces Resellers → Overview · Extended search</Badge>}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Active resellers" value={num(stats.active)} hint={`of ${num(ds.total)} accounts`} icon={<Building2 className="h-4 w-4" />} />
        <StatTile label="Domains under management" value={num(stats.domains)} hint="sum across all resellers" icon={<Globe className="h-4 w-4" />} />
        <StatTile label="Negative balance" value={num(stats.negative)} tone="danger" hint="saved view available" />
        <StatTile label="Pending onboarding" value={num(stats.pending)} tone="warn" hint="see New & pending" />
      </div>
      <DataTable
        spec={resellerSpec}
        data={ds}
        permission="reseller.read"
        exportName="resellers"
        create={{ label: 'New reseller', permission: 'reseller.write', onClick: () => setAddOpen(true) }}
      />
      <Drawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="New reseller"
        subtitle="P3 — create flows open as a drawer from the list, never as a separate navigation entry."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setAddOpen(false)}>Create reseller</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company name" required><Input placeholder="Nordcloud Hosting B.V." /></Field>
          <Field label="Contact name" required><Input placeholder="Anna Bakker" /></Field>
          <Field label="Email" required><Input type="email" placeholder="anna@nordcloud.nl" /></Field>
          <Field label="Country" required>
            <Select>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</Select>
          </Field>
          <Field label="Membership"><Select>{MEMBERSHIPS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
          <Field label="Payment term"><Select><option>Prepaid</option><option>Net 14</option><option>Net 30</option></Select></Field>
          <Field label="VAT number" className="sm:col-span-2" hint="Validated against VIES before the account is activated."><Input placeholder="NL123456789B01" /></Field>
        </div>
      </Drawer>
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Reseller detail (P2)

export function ResellerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const dataVersion = useStore((s) => s.dataVersion)
  const reseller = useMemo(() => findReseller(Number(id)), [id, dataVersion])
  const [tab, setTab] = useTab('profile')
  const [membershipOpen, setMembershipOpen] = useState(false)
  const [newPlan, setNewPlan] = useState<string>('Supreme')
  const mutate = useStore((s) => s.mutate)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)
  const createJob = useStore((s) => s.createJob)
  const addApproval = useStore((s) => s.addApproval)
  const canReveal = useCan('reseller.notification.read')

  if (!reseller) {
    return (
      <Module permissions={['reseller.read']}>
        <Callout tone="warn" title="Reseller not found">
          No reseller with ID {id}. It may have been erased under GDPR — check the audit log.
        </Callout>
      </Module>
    )
  }

  const contacts = resellerContacts(reseller.id)
  const domains = domainsOfReseller(reseller.id, 25)
  const customers = customersOfReseller(reseller.id, 5)

  return (
    <Module permissions={['reseller.read']}>
      <EntityDetail
        backTo="/resellers"
        backLabel="All resellers"
        identifier={reseller.id}
        title={reseller.company}
        status={
          <>
            <StatusBadge status={reseller.status} />
            <Badge tone="info">{reseller.membership}</Badge>
            <Badge tone={reseller.kyc === 'verified' ? 'success' : 'warn'}>KYC {reseller.kyc.replace('_', ' ')}</Badge>
            {reseller.riskScore > 70 && <Badge tone="danger">risk {reseller.riskScore}</Badge>}
          </>
        }
        keyFacts={[
          { label: 'Domains', value: num(reseller.domains) },
          { label: 'Balance', value: <span className={reseller.balance < 0 ? 'text-brand-700' : undefined}>{money(reseller.balance, reseller.currency)}</span> },
          { label: 'MRR', value: money(reseller.monthlyRevenue) },
          { label: 'Account manager', value: reseller.accountManager },
          { label: 'Last login', value: relative(reseller.lastLoginAt) },
        ]}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(`/domains?f=${encodeURIComponent(JSON.stringify({ resellerId: String(reseller.id) }))}`)}>
              <Globe className="h-3.5 w-3.5" /> Domains
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/billing/payments?q=${reseller.id}`)}>
              Payments
            </Button>
            <Button variant="primary" onClick={() => setMembershipOpen(true)}>
              Change membership
            </Button>
          </>
        }
        alerts={
          reseller.balance < 0 ? (
            <Callout tone="warn" title="Negative balance">
              {money(reseller.balance, reseller.currency)} outstanding. Auto-renewals will fail until the balance is settled, and
              <code className="mx-1 font-mono">suspend_on_negative_balance</code> is enabled for this membership tier.
            </Callout>
          ) : undefined
        }
        tabs={
          <TabBar
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'profile', label: 'Profile' },
              { id: 'domains', label: 'Domains', count: domains.length },
              { id: 'billing', label: 'Billing' },
              { id: 'notifications', label: 'Notifications' },
              { id: 'settings', label: 'Settings' },
            ]}
          />
        }
        resource="reseller"
        resourceId={String(reseller.id)}
        related={
          <>
            <RelatedList
              title="Domains"
              subtitle={`${num(reseller.domains)} under management`}
              items={domains.map((d) => ({
                key: d.name,
                primary: d.name,
                secondary: `${d.status} · expires ${d.expiresAt}`,
                to: `/domains/${encodeURIComponent(d.name)}`,
              }))}
              footer={<Link to={`/domains?f=${encodeURIComponent(JSON.stringify({ resellerId: String(reseller.id) }))}`} className="text-brand-700 hover:underline">See all domains →</Link>}
            />
            <RelatedList
              title="Customers"
              items={customers.map((c) => ({
                key: c.handle,
                primary: c.name,
                secondary: `${c.handle} · ${c.country} · ${num(c.domains)} domains`,
              }))}
            />
          </>
        }
      >
        {tab === 'profile' && (
          <>
            <Card>
              <CardHeader title="Account" subtitle="Identity, billing and compliance facts" />
              <div className="p-4">
                <DefinitionList
                  columns={3}
                  items={[
                    { label: 'Contact', value: reseller.contactName },
                    { label: 'Email', value: reseller.email },
                    { label: 'Phone', value: reseller.phone },
                    { label: 'Country', value: `${reseller.countryName} (${reseller.country})` },
                    { label: 'VAT', value: <code className="font-mono text-xs">{reseller.vat}</code> },
                    { label: 'Language', value: reseller.language },
                    { label: 'Payment term', value: reseller.paymentTerm },
                    { label: 'Two-factor', value: reseller.twoFactor ? 'Enabled' : 'Not enabled' },
                    { label: 'Created', value: shortDate(reseller.createdAt) },
                    { label: 'Segment', value: <span className="capitalize">{reseller.segment.replace('_', ' ')}</span> },
                    { label: 'Currency', value: reseller.currency },
                    { label: 'Tags', value: reseller.tags.length ? <span className="flex flex-wrap gap-1">{reseller.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span> : '—' },
                  ]}
                />
              </div>
            </Card>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile label="Risk score" value={reseller.riskScore} tone={reseller.riskScore > 70 ? 'danger' : reseller.riskScore > 40 ? 'warn' : 'success'} hint="fraud + abuse signals" />
              <StatTile label="Open abuse cases" value={reseller.riskScore > 70 ? 3 : 0} tone={reseller.riskScore > 70 ? 'danger' : 'neutral'} />
              <StatTile label="API calls (24h)" value={num(reseller.domains * 4 + 120)} hint="rate limits apply per plan" />
            </div>
          </>
        )}

        {tab === 'profile' && (
          <Card>
            <CardHeader
              title="Contacts"
              subtitle="These five roles are what a GDPR erasure anonymises — the old Delete reseller form never showed them."
            />
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-left">Handle</th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Phone</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.role} className="border-t border-ink-100">
                    <td className="px-4 py-2 font-medium capitalize text-ink-900">{c.role}</td>
                    <td className="px-4 py-2 font-mono text-xs">{c.handle}</td>
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="px-4 py-2">{c.email}</td>
                    <td className="px-4 py-2">{c.phone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {tab === 'notifications' && (
          <Card>
            <CardHeader title="Notification settings" subtitle="API key and signature secret follow the P8 secrets pattern" />
            <div className="space-y-4 p-4">
              <SecretValue
                value={`op_live_${reseller.id}_9fk2la8sd7`}
                masked={`op_live_••••••••••••${String(reseller.id).slice(-3)}`}
                canReveal={canReveal}
                onReveal={() => logAudit({ action: 'reseller.notification.read', resource: 'reseller_api_key', resourceId: String(reseller.id), reason: 'Support investigation' })}
                hint="API key — revealing is audited against this reseller."
              />
              <SecretValue
                value={`whsec_${reseller.id}_a71bd9ff0`}
                masked="whsec_••••••••••••••••"
                canReveal={canReveal}
                onReveal={() => logAudit({ action: 'reseller.notification.read', resource: 'reseller_signature_secret', resourceId: String(reseller.id) })}
                hint="Webhook signature secret."
              />
              <Callout tone="info" title="Rotation impact">
                Rotating either value breaks the reseller&apos;s integration until they redeploy. The rotate action states this before it runs
                and is a T2 write.
              </Callout>
            </div>
          </Card>
        )}

        {tab === 'domains' && (
          <Card>
            <CardHeader
              title="Domains"
              subtitle={`${num(reseller.domains)} under management — first ${domains.length} shown`}
              actions={
                <Link
                  to={`/domains?f=${encodeURIComponent(JSON.stringify({ resellerId: String(reseller.id) }))}`}
                  className="text-2xs text-brand-700 hover:underline"
                >
                  Open the full list
                </Link>
              }
            />
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-2 text-left">Domain</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Expires</th>
                  <th className="px-4 py-2 text-left">Auto-renew</th>
                  <th className="px-4 py-2 text-left">Registry</th>
                </tr>
              </thead>
              <tbody>
                {domains.map((d) => (
                  <tr key={d.name} className="border-t border-ink-100 hover:bg-ink-50">
                    <td className="px-4 py-2">
                      <Link to={`/domains/${encodeURIComponent(d.name)}`} className="font-medium text-ink-900 hover:text-brand-700 hover:underline">
                        {d.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2"><StatusBadge status={d.status} /></td>
                    <td className="px-4 py-2 text-xs">{shortDate(d.expiresAt)}</td>
                    <td className="px-4 py-2 text-xs">{d.autoRenew ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-2 text-xs">{d.provider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {tab === 'billing' && (
          <Card>
            <CardHeader title="Membership history" subtitle="Created-by, deleted-by and reason are surfaced consistently" />
            <div className="p-4">
              <DefinitionList
                items={[
                  { label: 'Current plan', value: reseller.membership },
                  { label: 'Billing', value: reseller.paymentTerm },
                  { label: 'Renews', value: shortDate(reseller.createdAt) },
                  { label: 'Plan rate limits', value: <Link to="/ops/rate-limits" className="text-brand-700 hover:underline">See effective limits →</Link> },
                ]}
              />
            </div>
          </Card>
        )}

        {tab === 'settings' && (
          <Card>
            <CardHeader title="Activity" subtitle="Actor, role in effect, before/after, reason, ticket, IP" />
            <div className="p-3">
              <ActivityTimeline resource="reseller" resourceId={String(reseller.id)} limit={12} />
            </div>
          </Card>
        )}

        {tab === 'settings' && (
          <DangerZone
            items={[
              {
                title: 'Suspend reseller',
                description: 'Blocks sign-in and API access. Domains keep resolving and renewals continue.',
                consequences: [
                  'The reseller cannot sign in or call the API.',
                  'Automatic renewals continue — suspension is not a billing stop.',
                  'Their customers are unaffected.',
                ],
                reversible: 'Fully reversible — un-suspend restores access immediately.',
                permission: 'reseller.write',
                tier: 'T2',
                confirmValue: String(reseller.id),
                confirmLabel: `Type the reseller ID (${reseller.id}) to confirm`,
                cta: 'Suspend reseller',
                onExecute: ({ reason, ticket }) => {
                  mutate('resellers', String(reseller.id), { status: 'suspended' })
                  logAudit({ action: 'reseller.write', resource: 'reseller', resourceId: String(reseller.id), before: { status: reseller.status }, after: { status: 'suspended' }, reason, ticket })
                },
              },
              {
                title: 'Delete reseller',
                description:
                  'GDPR erasure. Anonymises all five contact roles, deletes every linked customer and deactivates remaining contacts.',
                consequences: [
                  `Anonymises the admin, technical, billing, abuse and sales contacts of ${reseller.company}.`,
                  `Deletes ${customers.length} linked customer records permanently.`,
                  `${num(reseller.domains)} domains lose their managing reseller and must be re-assigned first.`,
                  'Revokes API credentials and webhook secrets immediately.',
                  'Invoices are retained for tax purposes; personal data on them is redacted.',
                ],
                reversible: 'Irreversible. Signed off as a GDPR erasure procedure (NFR-6).',
                permission: 'reseller.delete',
                tier: 'T3',
                confirmValue: reseller.company,
                confirmLabel: `Type the company name "${reseller.company}" to confirm`,
                cta: 'Delete reseller',
                dryRun: () => ({
                  summary: `Erasure plan for reseller ${reseller.id} — ${reseller.company}.`,
                  willChange: [
                    { label: 'Contacts anonymised', count: contacts.length, tone: 'danger' },
                    { label: 'Customers deleted', count: customers.length, tone: 'danger' },
                    { label: 'Domains orphaned', count: reseller.domains, tone: 'warn' },
                    { label: 'API credentials revoked', count: 2, tone: 'warn' },
                    { label: 'Invoices retained (redacted)', count: 34 },
                  ],
                  rejected: reseller.balance > 0 ? [{ label: 'blocking issue: positive balance must be refunded first', count: 1 }] : [],
                  notes: [
                    'The old form accepted a comma-separated list of IDs and showed nothing but a warning sentence.',
                    'Legal sign-off reference is captured on the job record.',
                  ],
                }),
                onExecute: ({ reason, ticket, approver }) => {
                  const job = createJob({
                    kind: 'reseller_delete',
                    label: `Delete reseller ${reseller.id} — ${reseller.company}`,
                    status: 'awaiting_approval',
                    owner: '',
                    total: 1,
                    dryRun: false,
                    cancellable: true,
                    resultCsv: null,
                    reason,
                    ticket,
                    approver,
                    tier: 'T3',
                  })
                  addApproval({
                    kind: 'reseller_delete',
                    label: `Delete reseller ${reseller.id} — ${reseller.company}`,
                    requestedBy: 'you',
                    requestedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
                    tier: 'T3',
                    targetId: String(reseller.id),
                    reason,
                    ticket,
                    detail: [
                      `Job ${job.id} is queued and will not run until ${approver} approves.`,
                      `${contacts.length} contacts anonymised, ${customers.length} customers deleted.`,
                    ],
                  })
                  logAudit({ action: 'reseller.delete', resource: 'reseller', resourceId: String(reseller.id), outcome: 'success', after: { queued: job.id, awaiting: approver }, reason, ticket })
                },
              },
            ]}
          />
        )}
      </EntityDetail>

      <T2Confirm
        open={membershipOpen}
        onClose={() => setMembershipOpen(false)}
        title="Change membership"
        permission="reseller.membership.write"
        description={
          <div className="space-y-3">
            <p>
              Changing the membership plan changes pricing, rate limits and promotion eligibility for {reseller.company} from the next
              billing cycle. Current plan: <strong>{reseller.membership}</strong>.
            </p>
            <Field label="New plan" required>
              <Select value={newPlan} onChange={(e) => setNewPlan(e.target.value)}>
                {MEMBERSHIPS.filter((m) => m !== reseller.membership).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </Field>
            {PREMIUM_MEMBERSHIPS.includes(newPlan as Membership) && (
              <p className="text-ink-600">
                {newPlan} includes whois privacy and the higher API rate limits — check the reseller is not already paying for WPP
                separately.
              </p>
            )}
          </div>
        }
        onConfirm={({ reason, ticket }) => {
          mutate('resellers', String(reseller.id), { membership: newPlan })
          logAudit({ action: 'reseller.membership.write', resource: 'reseller', resourceId: String(reseller.id), before: { membership: reseller.membership }, after: { membership: newPlan }, reason, ticket })
          addToast({ kind: 'success', title: `Membership changed to ${newPlan}`, body: 'Audit entry written with reason and ticket.' })
        }}
      />
    </Module>
  )
}

// ─────────────────────────────────────────────────────── New & pending

const pendingSpec: TableSpec<PendingReseller> = {
  id: 'pending_resellers',
  rowId: (r) => String(r.id),
  defaultSort: { key: 'registeredAt', dir: 'desc' },
  search: (r) => `${r.id} ${r.company} ${r.contactName} ${r.email}`,
  columns: [
    { key: 'id', header: 'ID', width: 90, mono: true, value: (r) => r.id },
    { key: 'company', header: 'Company' },
    { key: 'contactName', header: 'Contact', width: 150 },
    { key: 'email', header: 'Email', width: 220 },
    { key: 'country', header: 'Country', width: 80 },
    { key: 'source', header: 'Source', width: 100, render: (r) => <Badge>{r.source}</Badge> },
    { key: 'kyc', header: 'KYC', width: 120, render: (r) => <StatusBadge status={r.kyc} /> },
    { key: 'emailVerified', header: 'Email verified', width: 120, render: (r) => (r.emailVerified ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-brand-600" />) },
    { key: 'riskFlags', header: 'Risk flags', render: (r) => r.riskFlags.length ? <span className="flex flex-wrap gap-1">{r.riskFlags.map((f) => <Badge key={f} tone="warn">{f}</Badge>)}</span> : <span className="text-ink-400">none</span> },
    { key: 'assignee', header: 'Assignee', width: 130 },
    { key: 'registeredAt', header: 'Registered', width: 120, render: (r) => relative(r.registeredAt) },
  ],
  filters: [
    { key: 'queue', label: 'Queue', type: 'select', options: [{ value: 'awaiting_review', label: 'Awaiting review' }, { value: 'awaiting_kyc', label: 'Awaiting KYC' }] },
    { key: 'kyc', label: 'KYC status', type: 'multiselect', options: ['not_started', 'pending', 'verified', 'failed'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'source', label: 'Source', type: 'multiselect', options: ['website', 'api', 'sales', 'partner'].map((v) => ({ value: v, label: v })) },
    { key: 'emailVerified', label: 'Email verified', type: 'boolean' },
    { key: 'assignee', label: 'Assignee', type: 'select', options: ['Unassigned', 'Iris Lammers', 'Paul Renard', 'Ayşe Demir'].map((v) => ({ value: v, label: v })) },
  ],
}

export function ResellersNewPending() {
  const [tab, setTab] = useTab('awaiting_review')
  const ds = pendingResellers()
  const mutate = useStore((s) => s.mutate)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)
  const canApprove = useCan('reseller.approve')
  const [decision, setDecision] = useState<{ row: PendingReseller; kind: 'approve' | 'reject' } | null>(null)

  const counts = useMemo(() => {
    let review = 0
    let kyc = 0
    for (let i = 0; i < ds.total; i++) {
      const r = ds.at(i)
      if (r._deleted) continue
      r.queue === 'awaiting_review' ? review++ : kyc++
    }
    return { review, kyc }
  }, [ds])

  const spec: TableSpec<PendingReseller> = {
    ...pendingSpec,
    id: `pending_resellers_${tab}`,
    defaultFilters: { queue: tab },
  }

  return (
    <Module permissions={['reseller.read']} what="the onboarding queue">
      <PageHeader
        title="New & pending resellers"
        subtitle="Two disconnected tables on the old Show new page become tabs of one onboarding queue, with the decision captured as an audited T2 action."
      />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'awaiting_review', label: 'Awaiting review', count: counts.review },
          { id: 'awaiting_kyc', label: 'Awaiting KYC', count: counts.kyc },
        ]}
      />
      <DataTable
        key={tab}
        spec={spec}
        data={ds}
        permission="reseller.read"
        exportName="pending resellers"
        rowActions={(row) => (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="secondary" disabled={!canApprove} onClick={() => setDecision({ row, kind: 'approve' })}>
              <UserCheck className="h-3.5 w-3.5" /> Approve
            </Button>
            <Button size="sm" variant="ghost" disabled={!canApprove} onClick={() => setDecision({ row, kind: 'reject' })}>
              Reject
            </Button>
          </div>
        )}
      />
      {decision && (
        <T2Confirm
          open
          onClose={() => setDecision(null)}
          title={decision.kind === 'approve' ? `Approve ${decision.row.company}` : `Reject ${decision.row.company}`}
          permission="reseller.approve"
          description={
            decision.kind === 'approve'
              ? <>Activates the account, sends credentials and starts the trial membership. Risk flags: {decision.row.riskFlags.join(', ') || 'none'}.</>
              : <>Rejects the application. The applicant is notified with the reason you enter below.</>
          }
          cta={decision.kind === 'approve' ? 'Approve reseller' : 'Reject application'}
          onConfirm={({ reason, ticket }) => {
            mutate('pending_resellers', String(decision.row.id), { queue: decision.kind === 'approve' ? 'awaiting_review' : 'awaiting_kyc', _deleted: true })
            logAudit({
              action: 'reseller.approve',
              resource: 'reseller',
              resourceId: String(decision.row.id),
              outcome: decision.kind === 'approve' ? 'success' : 'denied',
              after: { decision: decision.kind },
              reason,
              ticket,
            })
            addToast({ kind: 'success', title: `${decision.row.company} ${decision.kind === 'approve' ? 'approved' : 'rejected'}` })
            setDecision(null)
          }}
        />
      )}
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Notification settings

const notifSpec: TableSpec<NotificationSetting> = {
  id: 'notification_settings',
  rowId: (r) => r.id,
  defaultSort: { key: 'failures24h', dir: 'desc' },
  search: (r) => `${r.resellerId} ${r.company} ${r.event} ${r.endpoint}`,
  columns: [
    { key: 'company', header: 'Reseller', render: (r) => <Link to={`/customers/resellers/${r.resellerId}`} className="hover:text-brand-700 hover:underline">{r.company}</Link> },
    { key: 'resellerId', header: 'ID', width: 90, mono: true, value: (r) => r.resellerId },
    { key: 'event', header: 'Event', width: 170, mono: true },
    { key: 'channel', header: 'Channel', width: 100, render: (r) => <Badge>{r.channel}</Badge> },
    { key: 'endpoint', header: 'Endpoint', optional: true, render: (r) => <span className="font-mono text-2xs text-ink-500">{r.endpoint}</span> },
    { key: 'apiKey', header: 'API key', width: 150, noExport: true, render: () => <span className="font-mono text-2xs text-ink-400">••••••••••••</span> },
    { key: 'signatureSecret', header: 'Signature secret', width: 150, noExport: true, render: () => <span className="font-mono text-2xs text-ink-400">••••••••••••</span> },
    { key: 'active', header: 'Active', width: 80, render: (r) => (r.active ? <Badge tone="success">on</Badge> : <Badge>off</Badge>) },
    { key: 'lastStatus', header: 'Last delivery', width: 120, render: (r) => <StatusBadge status={r.lastStatus} /> },
    { key: 'failures24h', header: 'Failures 24h', width: 110, align: 'right', render: (r) => (r.failures24h ? <span className="font-medium text-brand-700">{num(r.failures24h)}</span> : '0') },
    { key: 'lastDeliveryAt', header: 'Last attempt', width: 130, render: (r) => relative(r.lastDeliveryAt) },
  ],
  filters: [
    { key: 'event', label: 'Event', type: 'select', options: ['domain.registered', 'domain.expired', 'domain.transferred', 'domain.renewed', 'ssl.issued', 'invoice.created', 'payment.received', 'abuse.reported', 'kyc.decision'].map((v) => ({ value: v, label: v })) },
    { key: 'channel', label: 'Channel', type: 'multiselect', options: ['webhook', 'email', 'both'].map((v) => ({ value: v, label: v })) },
    { key: 'lastStatus', label: 'Last delivery', type: 'multiselect', options: ['ok', 'failed', 'retrying'].map((v) => ({ value: v, label: v })) },
    { key: 'active', label: 'Active', type: 'boolean' },
    { key: 'failures24h', label: 'Failures (24h)', type: 'numberrange' },
  ],
}

export function ResellerNotificationSettings() {
  const ds = notificationSettings()
  const [secret, setSecret] = useState<NotificationSetting | null>(null)
  const canReveal = useCan('reseller.notification.write')
  const logAudit = useStore((s) => s.logAudit)

  return (
    <Module permissions={['reseller.notification.read']} what="reseller notification settings">
      <PageHeader
        title="Notification settings"
        subtitle="API keys and signature secrets are masked in the table and revealed only through an audited action (P8)."
      />
      <DataTable
        spec={notifSpec}
        data={ds}
        permission="reseller.notification.read"
        exportName="notification settings"
        rowActions={(row) => (
          <Button size="sm" variant="ghost" onClick={() => setSecret(row)}>
            <KeyRound className="h-3.5 w-3.5" /> Credentials
          </Button>
        )}
      />
      <Drawer
        open={Boolean(secret)}
        onClose={() => setSecret(null)}
        title={secret ? `${secret.company} — ${secret.event}` : ''}
        subtitle="Webhook credentials"
      >
        {secret && (
          <div className="space-y-4">
            <DefinitionList
              items={[
                { label: 'Reseller', value: <Link to={`/customers/resellers/${secret.resellerId}`} className="text-brand-700 hover:underline">{secret.resellerId}</Link> },
                { label: 'Channel', value: secret.channel },
                { label: 'Endpoint', value: <code className="font-mono text-xs">{secret.endpoint}</code>, span: true },
                { label: 'Last delivery', value: `${secret.lastStatus} · ${relative(secret.lastDeliveryAt)}` },
                { label: 'Failures (24h)', value: num(secret.failures24h) },
              ]}
            />
            <SecretValue
              value={secret.apiKey}
              masked={`op_live_••••••••${secret.apiKey.slice(-4)}`}
              canReveal={canReveal}
              onReveal={() => logAudit({ action: 'reseller.notification.write', resource: 'reseller_api_key', resourceId: secret.id, reason: 'Revealed from notification settings' })}
            />
            <SecretValue
              value={secret.signatureSecret}
              masked={`whsec_••••••••${secret.signatureSecret.slice(-4)}`}
              canReveal={canReveal}
              onReveal={() => logAudit({ action: 'reseller.notification.write', resource: 'reseller_signature_secret', resourceId: secret.id })}
            />
            {secret.failures24h > 100 && (
              <Callout tone="danger" title={`${num(secret.failures24h)} delivery failures in 24 hours`}>
                The endpoint has been failing since {relative(secret.lastDeliveryAt)}. Deliveries are retried with backoff for 72 hours,
                then dropped.
              </Callout>
            )}
          </div>
        )}
      </Drawer>
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Provider mappings

const mappingSpec: TableSpec<ProviderMapping> = {
  id: 'provider_mappings',
  rowId: (r) => r.id,
  defaultSort: { key: 'status', dir: 'asc' },
  search: (r) => `${r.resellerId} ${r.company} ${r.provider} ${r.registryLogin}`,
  columns: [
    { key: 'company', header: 'Reseller', render: (r) => <Link to={`/customers/resellers/${r.resellerId}`} className="hover:text-brand-700 hover:underline">{r.company}</Link> },
    { key: 'provider', header: 'Provider', width: 150 },
    { key: 'registryLogin', header: 'Registry login', width: 200, mono: true },
    { key: 'registryPassword', header: 'Password', width: 130, noExport: true, render: () => <span className="font-mono text-2xs text-ink-400">••••••••</span> },
    { key: 'status', header: 'Status', width: 120, render: (r) => <StatusBadge status={r.status} /> },
    { key: 'tlds', header: 'TLDs', render: (r) => <span className="flex flex-wrap gap-1">{r.tlds.map((t) => <Badge key={t}>.{t}</Badge>)}</span> },
    { key: 'credentialAge', header: 'Credential age', width: 130, align: 'right', render: (r) => (
      <span className={r.credentialAge > 365 ? 'font-medium text-amber-700' : undefined}>{num(r.credentialAge)} d</span>
    ) },
    { key: 'lastCheckedAt', header: 'Last checked', width: 130, render: (r) => relative(r.lastCheckedAt) },
  ],
  filters: [
    { key: 'provider', label: 'Provider', type: 'select', options: PROVIDER_NAMES.map((p) => ({ value: p, label: p })) },
    { key: 'status', label: 'Status', type: 'multiselect', options: ['connected', 'auth_failed', 'disabled'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'credentialAge', label: 'Credential age (days)', type: 'numberrange', hint: 'Over 365 days is flagged.' },
  ],
}

export function ResellerProviderMappings({ hideHeader }: { hideHeader?: boolean } = {}) {
  const ds = providerMappings()
  const [edit, setEdit] = useState<ProviderMapping | null>(null)
  const [password, setPassword] = useState('')
  const canWrite = useCan('reseller.provider.write')
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)

  return (
    <Module permissions={['reseller.provider.read']} what="provider mappings">
      {!hideHeader && (
        <PageHeader
          title="Provider mappings"
          subtitle="Registry credentials per reseller. The old form collected registry passwords in an ordinary text field; here they are write-only, never rendered, and rotation is audited."
        />
      )}
      <Callout tone="info" title="Credentials are write-only">
        Passwords can be set or rotated but never read back — not by support, not by Super Admins. Auth failures are surfaced as status
        instead of requiring someone to read the secret.
      </Callout>
      <DataTable
        spec={mappingSpec}
        data={ds}
        permission="reseller.provider.read"
        exportName="provider mappings"
        rowActions={(row) => (
          <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => { setEdit(row); setPassword('') }}>
            Rotate credential
          </Button>
        )}
      />
      <Modal
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title={edit ? `Rotate ${edit.provider} credential` : ''}
        subtitle="T2 — sensitive write. Reason and ticket are recorded."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={password.length < 10}
              onClick={() => {
                if (edit) {
                  logAudit({ action: 'reseller.provider.write', resource: 'provider_mapping', resourceId: edit.id, after: { rotated: true }, reason: 'Credential rotation', ticket: 'ZD-448200' })
                  addToast({ kind: 'success', title: 'Credential rotated', body: 'The new value is stored write-only and verified against the registry.' })
                }
                setEdit(null)
              }}
            >
              Rotate and verify
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Callout tone="warn" title="Downstream impact">
            All queued registry operations for {edit?.provider} on this reseller pause until the new credential verifies. Expect up to
            5 minutes of delayed registrations.
          </Callout>
          <Field label="New registry password" required hint="Minimum 10 characters. Stored write-only.">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Memberships

const membershipSpec: TableSpec<MembershipSubscription> = {
  id: 'memberships',
  rowId: (r) => r.id,
  defaultSort: { key: 'renewsAt', dir: 'asc' },
  search: (r) => `${r.id} ${r.resellerId} ${r.company} ${r.plan}`,
  columns: [
    { key: 'id', header: 'Subscription', width: 120, mono: true },
    { key: 'company', header: 'Reseller', render: (r) => <Link to={`/customers/resellers/${r.resellerId}`} className="hover:text-brand-700 hover:underline">{r.company}</Link> },
    { key: 'plan', header: 'Plan', width: 110, render: (r) => <Badge tone={PREMIUM_MEMBERSHIPS.includes(r.plan as Membership) ? 'purple' : 'neutral'}>{r.plan}</Badge> },
    { key: 'status', header: 'Status', width: 110, render: (r) => <StatusBadge status={r.status} /> },
    { key: 'price', header: 'Price', width: 100, align: 'right', render: (r) => money(r.price) },
    { key: 'billingCycle', header: 'Cycle', width: 90 },
    { key: 'startedAt', header: 'Started', width: 110, render: (r) => shortDate(r.startedAt) },
    { key: 'renewsAt', header: 'Renews', width: 110, render: (r) => shortDate(r.renewsAt) },
    { key: 'autoRenew', header: 'Auto-renew', width: 100, render: (r) => (r.autoRenew ? 'Yes' : 'No') },
    { key: 'createdBy', header: 'Created by', width: 130, optional: true },
    { key: 'deletedBy', header: 'Deleted by', width: 130, optional: true, render: (r) => r.deletedBy ?? '—' },
    { key: 'reason', header: 'Reason', optional: true, render: (r) => r.reason ?? '—' },
  ],
  filters: [
    { key: 'plan', label: 'Plan', type: 'multiselect', options: MEMBERSHIPS.map((m) => ({ value: m, label: m })) },
    { key: 'status', label: 'Status', type: 'multiselect', options: ['active', 'trial', 'expired', 'cancelled'].map((v) => ({ value: v, label: v })) },
    { key: 'billingCycle', label: 'Billing cycle', type: 'select', options: [{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }] },
    { key: 'renewsAt', label: 'Renews', type: 'daterange' },
    { key: 'price', label: 'Price', type: 'numberrange' },
    { key: 'autoRenew', label: 'Auto-renew', type: 'boolean' },
  ],
}

export function ResellerMemberships({ hideHeader }: { hideHeader?: boolean } = {}) {
  const ds = membershipSubscriptions()
  return (
    <Module permissions={['reseller.membership.read']} what="membership subscriptions">
      {!hideHeader && (
        <PageHeader
          title="Memberships"
          subtitle="18,160 subscriptions. The old page paged 100 at a time with no saved filters; this one filters and sorts server-side and exports what you are looking at."
          meta={<Badge tone="neutral">{num(ds.total)} records</Badge>}
        />
      )}
      <ScaleNote total={ds.total} />
      <DataTable spec={membershipSpec} data={ds} permission="reseller.membership.read" exportName="memberships" />
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Statistics

const statSpec: TableSpec<ResellerStat> = {
  id: 'reseller_stats',
  rowId: (r) => r.id,
  defaultSort: { key: 'revenue', dir: 'desc' },
  search: (r) => `${r.resellerId} ${r.company} ${r.provider} ${r.month}`,
  columns: [
    { key: 'company', header: 'Reseller', render: (r) => <Link to={`/customers/resellers/${r.resellerId}`} className="hover:text-brand-700 hover:underline">{r.company}</Link> },
    { key: 'month', header: 'Month', width: 100, mono: true },
    { key: 'provider', header: 'Provider', width: 140 },
    { key: 'registrations', header: 'Registrations', width: 120, align: 'right', render: (r) => num(r.registrations) },
    { key: 'renewals', header: 'Renewals', width: 100, align: 'right', render: (r) => num(r.renewals) },
    { key: 'transfers', header: 'Transfers', width: 100, align: 'right', render: (r) => num(r.transfers) },
    { key: 'deletions', header: 'Deletions', width: 100, align: 'right', render: (r) => num(r.deletions) },
    { key: 'revenue', header: 'Revenue', width: 110, align: 'right', render: (r) => money(r.revenue) },
    { key: 'failureRate', header: 'Failure rate', width: 120, align: 'right', render: (r) => (
      <span className={r.failureRate > 5 ? 'font-medium text-brand-700' : undefined}>{pct(r.failureRate, 1)}</span>
    ) },
  ],
  filters: [
    { key: 'provider', label: 'Provider', type: 'select', options: PROVIDER_NAMES.map((p) => ({ value: p, label: p })) },
    { key: 'month', label: 'Month', type: 'text', placeholder: '2026-08' },
    { key: 'revenue', label: 'Revenue', type: 'numberrange' },
    { key: 'failureRate', label: 'Failure rate %', type: 'numberrange' },
  ],
}

export function ResellerStatistics() {
  const ds = resellerStats()
  const totals = useMemo(() => {
    let revenue = 0
    let regs = 0
    let fails = 0
    for (let i = 0; i < ds.total; i++) {
      const s = ds.at(i)
      revenue += s.revenue
      regs += s.registrations
      fails += s.failureRate
    }
    return { revenue, regs, avgFail: fails / Math.max(1, ds.total) }
  }, [ds])

  return (
    <Module permissions={['reseller.statistics.read']} what="reseller statistics">
      <PageHeader title="Statistics" subtitle="Registry activity per reseller and month, for revenue segmentation and provider health." />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Revenue (12 months)" value={money(totals.revenue)} icon={<ArrowUpRight className="h-4 w-4" />} />
        <StatTile label="Registrations" value={num(totals.regs)} />
        <StatTile label="Average failure rate" value={pct(totals.avgFail, 2)} tone={totals.avgFail > 5 ? 'warn' : 'success'} />
      </div>
      <DataTable spec={statSpec} data={ds} permission="reseller.statistics.read" exportName="reseller statistics" />
      <Card>
        <CardHeader title="Provider failure rates" subtitle="Highest failure rate per provider across the last 12 months" icon={<AlertTriangle className="h-4 w-4" />} />
        <div className="space-y-2 p-4">
          {PROVIDER_NAMES.slice(0, 6).map((p, i) => {
            const value = 9 - i * 1.3
            return (
              <div key={p} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-xs text-ink-700">{p}</span>
                <Progress value={value * 10} tone={value > 5 ? 'danger' : 'brand'} />
                <span className="w-12 shrink-0 text-right text-2xs tabular text-ink-600">{pct(value, 1)}</span>
              </div>
            )
          })}
        </div>
      </Card>
    </Module>
  )
}

export function resellerIcons() {
  return { Mail, Trash2 }
}
