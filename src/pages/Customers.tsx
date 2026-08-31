import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, FileText, Lock, ShieldCheck, Unlock, X } from 'lucide-react'
import { DataTable } from '../components/patterns/DataTable'
import { Module, PageHeader, TabBar, useTab } from '../components/patterns/Page'
import { ActivityTimeline } from '../components/patterns/Activity'
import { T2Confirm } from '../components/patterns/Destructive'
import {
  Badge, Button, Card, CardHeader, DefinitionList, Drawer, EmptyState, Progress,
  StatTile, StatusBadge, Tooltip,
} from '../components/ui'
import { useCan, useStore } from '../lib/store'
import { num, relative, shortDate } from '../lib/format'
import type { TableSpec } from '../lib/table'
import { COUNTRIES } from '../lib/rng'
import {
  contactValidations, kycCases, kycQueueCounts, type ContactValidation, type KycCase,
} from '../lib/mock/customers'

// ─────────────────────────────────────────────────────── Contact validation

const contactSpec: TableSpec<ContactValidation> = {
  id: 'contact_validations',
  rowId: (c) => c.id,
  defaultSort: { key: 'submittedAt', dir: 'desc' },
  search: (c) => `${c.id} ${c.handle} ${c.name} ${c.company} ${c.email} ${c.resellerCompany}`,
  columns: [
    { key: 'handle', header: 'Handle', width: 120, mono: true },
    { key: 'name', header: 'Registrant', render: (c) => <span className="font-medium">{c.name}</span> },
    { key: 'company', header: 'Company', width: 180 },
    { key: 'email', header: 'Email', width: 220 },
    { key: 'country', header: 'Country', width: 90 },
    { key: 'status', header: 'Status', width: 110, render: (c) => <StatusBadge status={c.status} /> },
    { key: 'domains', header: 'Domains', width: 90, align: 'right', render: (c) => num(c.domains) },
    { key: 'emailVerified', header: 'Email ✓', width: 90, render: (c) => (c.emailVerified ? 'Yes' : 'No') },
    { key: 'addressVerified', header: 'Address ✓', width: 100, render: (c) => (c.addressVerified ? 'Yes' : 'No') },
    { key: 'resellerCompany', header: 'Reseller', width: 190, render: (c) => <Link to={`/customers/resellers/${c.resellerId}`} className="hover:text-brand-700 hover:underline">{c.resellerCompany}</Link> },
    { key: 'submittedAt', header: 'Submitted', width: 130, render: (c) => relative(c.submittedAt) },
    { key: 'decidedBy', header: 'Decided by', width: 130, optional: true, render: (c) => c.decidedBy ?? '—' },
    { key: 'reason', header: 'Reason', optional: true, render: (c) => c.reason ?? '—' },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['pending', 'approved', 'locked', 'rejected'].map((v) => ({ value: v, label: v })) },
    { key: 'country', label: 'Country', type: 'select', options: COUNTRIES.map(([c, n]) => ({ value: c, label: n })) },
    { key: 'emailVerified', label: 'Email verified', type: 'boolean' },
    { key: 'addressVerified', label: 'Address verified', type: 'boolean' },
    { key: 'submittedAt', label: 'Submitted', type: 'daterange' },
    { key: 'domains', label: 'Domain count', type: 'numberrange' },
  ],
}

type ContactDecision = 'approve' | 'lock' | 'unlock'

export function ContactValidationPage() {
  const ds = contactValidations()
  const [decision, setDecision] = useState<{ row: ContactValidation; kind: ContactDecision } | null>(null)
  const canDecide = useCan('customer.contact.decide')
  const mutate = useStore((s) => s.mutate)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)

  const counts = useMemo(() => {
    const c = { pending: 0, locked: 0, approved: 0 }
    for (let i = 0; i < ds.total; i++) {
      const r = ds.at(i)
      if (r._deleted) continue
      if (r.status === 'pending') c.pending++
      if (r.status === 'locked') c.locked++
      if (r.status === 'approved') c.approved++
    }
    return c
  }, [ds])

  return (
    <Module permissions={['customer.contact.read']} what="contact validation">
      <PageHeader
        title="Contact validation"
        subtitle="Nominet registrant validation. Lock, approve and unlock were unlabelled buttons; they are now audited T2 decisions that require a reason."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Pending validation" value={num(counts.pending)} tone="warn" />
        <StatTile label="Locked" value={num(counts.locked)} tone="danger" hint="registrant cannot modify" />
        <StatTile label="Approved" value={num(counts.approved)} tone="success" />
      </div>
      <DataTable
        spec={contactSpec}
        data={ds}
        permission="customer.contact.read"
        exportName="contact validations"
        rowActions={(row) => (
          <div className="flex items-center gap-1">
            {row.status !== 'approved' && (
              <Tooltip content="Approve — T2, reason required">
                <Button size="sm" variant="ghost" disabled={!canDecide} onClick={() => setDecision({ row, kind: 'approve' })}>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                </Button>
              </Tooltip>
            )}
            {row.status !== 'locked' ? (
              <Tooltip content="Lock — blocks registrant changes">
                <Button size="sm" variant="ghost" disabled={!canDecide} onClick={() => setDecision({ row, kind: 'lock' })}>
                  <Lock className="h-3.5 w-3.5" />
                </Button>
              </Tooltip>
            ) : (
              <Tooltip content="Unlock">
                <Button size="sm" variant="ghost" disabled={!canDecide} onClick={() => setDecision({ row, kind: 'unlock' })}>
                  <Unlock className="h-3.5 w-3.5" />
                </Button>
              </Tooltip>
            )}
          </div>
        )}
      />
      {decision && (
        <T2Confirm
          open
          onClose={() => setDecision(null)}
          title={`${decision.kind === 'approve' ? 'Approve' : decision.kind === 'lock' ? 'Lock' : 'Unlock'} ${decision.row.name}`}
          permission="customer.contact.decide"
          description={
            decision.kind === 'lock' ? (
              <>Locking blocks the registrant from modifying their own data and flags {num(decision.row.domains)} domains at Nominet.</>
            ) : decision.kind === 'unlock' ? (
              <>Unlocking restores the registrant&apos;s ability to modify their data.</>
            ) : (
              <>Approving marks the registrant as validated for Nominet across {num(decision.row.domains)} domains.</>
            )
          }
          cta={decision.kind === 'approve' ? 'Approve registrant' : decision.kind === 'lock' ? 'Lock registrant' : 'Unlock registrant'}
          onConfirm={({ reason, ticket }) => {
            const status = decision.kind === 'approve' ? 'approved' : decision.kind === 'lock' ? 'locked' : 'pending'
            mutate('contact_validations', decision.row.id, { status, decidedBy: 'you', decidedAt: new Date().toISOString().slice(0, 19).replace('T', ' '), reason })
            logAudit({ action: 'customer.contact.decide', resource: 'contact_validation', resourceId: decision.row.id, before: { status: decision.row.status }, after: { status }, reason, ticket })
            addToast({ kind: 'success', title: `${decision.row.name} — ${status}` })
            setDecision(null)
          }}
        />
      )}
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Identity verification

const kycSpec: TableSpec<KycCase> = {
  id: 'kyc_cases',
  rowId: (c) => c.id,
  defaultSort: { key: 'slaHoursLeft', dir: 'asc' },
  search: (c) => `${c.id} ${c.subject} ${c.resellerCompany} ${c.country} ${c.riskFlags.join(' ')}`,
  columns: [
    { key: 'id', header: 'Case', width: 110, mono: true },
    { key: 'subject', header: 'Subject', render: (c) => <span className="font-medium">{c.subject}</span> },
    { key: 'type', header: 'Type', width: 80, render: (c) => <Badge tone={c.type === 'KYB' ? 'purple' : 'info'}>{c.type}</Badge> },
    { key: 'status', header: 'Status', width: 150, render: (c) => <StatusBadge status={c.status} /> },
    { key: 'riskScore', header: 'Risk', width: 90, align: 'right', render: (c) => (
      <span className={c.riskScore > 70 ? 'font-semibold text-brand-700' : c.riskScore > 40 ? 'text-amber-700' : undefined}>{c.riskScore}</span>
    ) },
    { key: 'slaHoursLeft', header: 'SLA', width: 100, align: 'right', render: (c) => (
      c.slaHoursLeft < 0
        ? <Badge tone="danger">{Math.abs(c.slaHoursLeft)}h over</Badge>
        : c.slaHoursLeft === 0 ? '—' : <span className={c.slaHoursLeft < 8 ? 'text-amber-700' : undefined}>{c.slaHoursLeft}h</span>
    ) },
    { key: 'riskFlags', header: 'Flags', render: (c) => c.riskFlags.length ? <span className="flex flex-wrap gap-1">{c.riskFlags.slice(0, 3).map((f) => <Badge key={f} tone="warn">{f}</Badge>)}</span> : <span className="text-ink-400">none</span> },
    { key: 'resellerCompany', header: 'Reseller', width: 180, render: (c) => <Link to={`/customers/resellers/${c.resellerId}`} className="hover:text-brand-700 hover:underline">{c.resellerCompany}</Link> },
    { key: 'country', header: 'Country', width: 80 },
    { key: 'assignee', header: 'Assignee', width: 120 },
    { key: 'provider', header: 'Provider', width: 100, optional: true },
    { key: 'submittedAt', header: 'Submitted', width: 130, render: (c) => relative(c.submittedAt) },
    { key: 'decidedBy', header: 'Decided by', width: 120, optional: true, render: (c) => c.decidedBy ?? '—' },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['awaiting_documents', 'in_review', 'escalated', 'approved', 'failed'].map((v) => ({ value: v, label: v.replace(/_/g, ' ') })) },
    { key: 'type', label: 'Type', type: 'select', options: [{ value: 'KYC', label: 'KYC (individual)' }, { value: 'KYB', label: 'KYB (business)' }] },
    { key: 'riskScore', label: 'Risk score', type: 'numberrange' },
    { key: 'country', label: 'Country', type: 'select', options: COUNTRIES.map(([c, n]) => ({ value: c, label: n })) },
    { key: 'assignee', label: 'Assignee', type: 'select', options: ['Unassigned', 'j.okafor', 'm.silva', 'a.rao'].map((v) => ({ value: v, label: v })) },
    { key: 'provider', label: 'Provider', type: 'select', options: ['Sumsub', 'Onfido', 'Manual'].map((v) => ({ value: v, label: v })) },
    { key: 'breached', label: 'SLA breached', type: 'boolean', test: (c, v) => (v ? c.slaHoursLeft < 0 : c.slaHoursLeft >= 0) },
  ],
}

const QUEUE_TABS = [
  { id: 'queue', label: 'My queue', filters: { status: ['in_review', 'escalated'] } },
  { id: 'documents', label: 'Awaiting documents', filters: { status: ['awaiting_documents'] } },
  { id: 'breached', label: 'SLA breached', filters: { breached: true } },
  { id: 'all', label: 'All cases', filters: {} },
]

export function IdentityVerificationPage() {
  const ds = kycCases()
  const [tab, setTab] = useTab('queue')
  const [params] = useSearchParams()
  const [open, setOpen] = useState<KycCase | null>(null)
  const counts = useMemo(() => kycQueueCounts(), [])
  const dataVersion = useStore((s) => s.dataVersion)

  const tabDef = QUEUE_TABS.find((t) => t.id === tab) ?? QUEUE_TABS[0]
  const spec: TableSpec<KycCase> = {
    ...kycSpec,
    id: `kyc_cases_${tab}`,
    defaultFilters: params.get('q') ? {} : tabDef.filters,
  }

  return (
    <Module permissions={['customer.kyc.read']} what="identity verification">
      <PageHeader
        title="Identity verification (KYC/KYB)"
        subtitle="Queue-first: the work is a decision queue with an SLA, not a table you page through. Spelling fixed from “Identity Verifiction”."
        meta={<Badge tone="neutral">{num(ds.total)} cases</Badge>}
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="In review" value={num(counts.in_review)} tone="warn" />
        <StatTile label="Awaiting documents" value={num(counts.awaiting_documents)} />
        <StatTile label="Escalated" value={num(counts.escalated)} tone="danger" />
        <StatTile label="SLA breached" value={num(counts.breached)} tone="danger" hint="decide these first" />
      </div>
      <TabBar value={tab} onChange={setTab} tabs={QUEUE_TABS.map((t) => ({ id: t.id, label: t.label }))} />
      <DataTable
        key={tab + dataVersion}
        spec={spec}
        data={ds}
        permission="customer.kyc.read"
        exportName="identity verification cases"
        onRowClick={(row) => setOpen(row)}
        rowActions={(row) => (
          <Button size="sm" variant="ghost" onClick={() => setOpen(row)}>
            Review
          </Button>
        )}
      />
      <KycReviewDrawer case_={open} onClose={() => setOpen(null)} />
    </Module>
  )
}

function KycReviewDrawer({ case_, onClose }: { case_: KycCase | null; onClose: () => void }) {
  const [decision, setDecision] = useState<'approve' | 'fail' | null>(null)
  const canDecide = useCan('customer.kyc.decide')
  const mutate = useStore((s) => s.mutate)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)
  const [docIndex, setDocIndex] = useState(0)

  if (!case_) return null
  const doc = case_.documents[docIndex]

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        width="lg"
        title={`${case_.id} — ${case_.subject}`}
        subtitle={`${case_.type} · ${case_.provider} · risk ${case_.riskScore}`}
        footer={
          <>
            <div className="mr-auto text-2xs text-ink-500">
              {case_.slaHoursLeft < 0 ? `SLA breached by ${Math.abs(case_.slaHoursLeft)}h` : `${case_.slaHoursLeft}h left in SLA`}
            </div>
            <Button variant="secondary" disabled={!canDecide} onClick={() => setDecision('fail')}>
              <X className="h-3.5 w-3.5" /> Fail case
            </Button>
            <Button variant="primary" disabled={!canDecide} onClick={() => setDecision('approve')}>
              <Check className="h-3.5 w-3.5" /> Approve
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={case_.status} />
            <Badge tone={case_.type === 'KYB' ? 'purple' : 'info'}>{case_.type}</Badge>
            {case_.riskFlags.map((f) => (
              <Badge key={f} tone="warn">{f}</Badge>
            ))}
          </div>

          <DefinitionList
            items={[
              { label: 'Reseller', value: <Link to={`/customers/resellers/${case_.resellerId}`} className="text-brand-700 hover:underline">{case_.resellerCompany}</Link> },
              { label: 'Country', value: case_.country },
              { label: 'Submitted', value: `${shortDate(case_.submittedAt)} (${relative(case_.submittedAt)})` },
              { label: 'Attempts', value: case_.attempts },
              { label: 'Assignee', value: case_.assignee },
              { label: 'Provider', value: case_.provider },
            ]}
          />

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Documents</h4>
              <span className="text-2xs text-ink-500">{case_.documents.length} uploaded</span>
            </div>
            {case_.documents.length === 0 ? (
              <EmptyState compact icon={<FileText className="h-4 w-4" />} title="No documents uploaded" body="The case is waiting on the reseller." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                <ul className="space-y-1">
                  {case_.documents.map((d, i) => (
                    <li key={d.id}>
                      <button
                        onClick={() => setDocIndex(i)}
                        className={`w-full rounded-lg border px-2 py-1.5 text-left text-2xs ${i === docIndex ? 'border-brand-300 bg-brand-50 text-brand-900' : 'border-ink-200 hover:bg-ink-50'}`}
                      >
                        <span className="block font-medium">{d.kind}</span>
                        <span className="block text-ink-500">{d.pages} page(s)</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="rounded-lg border border-ink-200">
                  <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50 px-3 py-2">
                    <span className="font-mono text-2xs text-ink-700">{doc.filename}</span>
                    <span className="text-2xs text-ink-500">uploaded {relative(doc.uploadedAt)}</span>
                  </div>
                  <div className="grid h-44 place-items-center bg-[repeating-linear-gradient(45deg,#f7f8f9,#f7f8f9_10px,#eef0f3_10px,#eef0f3_20px)] text-2xs text-ink-500">
                    Document viewer — {doc.kind}
                  </div>
                  <ul className="divide-y divide-ink-100">
                    {doc.checks.map((c) => (
                      <li key={c.label} className="flex items-center justify-between px-3 py-1.5 text-2xs">
                        <span className="text-ink-700">{c.label}</span>
                        <Badge tone={c.result === 'pass' ? 'success' : c.result === 'warn' ? 'warn' : 'danger'}>{c.result}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Risk</h4>
            <Progress value={case_.riskScore} tone={case_.riskScore > 70 ? 'danger' : 'brand'} />
            <p className="mt-1 text-2xs text-ink-500">
              Score {case_.riskScore}/100. Decisions stay human — the PRD excludes automating this judgement.
            </p>
          </div>

          <Card>
            <CardHeader title="Case activity" icon={<ShieldCheck className="h-4 w-4" />} />
            <div className="p-2">
              <ActivityTimeline resource="kyc_case" resourceId={case_.id} limit={5} showAllLink={false} />
            </div>
          </Card>
        </div>
      </Drawer>

      {decision && (
        <T2Confirm
          open
          onClose={() => setDecision(null)}
          title={decision === 'approve' ? `Approve ${case_.subject}` : `Fail ${case_.subject}`}
          permission="customer.kyc.decide"
          description={
            decision === 'approve' ? (
              <>Marks the identity as verified. The reseller can register regulated TLDs and the account limit is lifted.</>
            ) : (
              <>Fails the case. The reseller is notified and can re-submit documents once. Registration of regulated TLDs stays blocked.</>
            )
          }
          cta={decision === 'approve' ? 'Approve case' : 'Fail case'}
          onConfirm={({ reason, ticket }) => {
            mutate('kyc_cases', case_.id, {
              status: decision === 'approve' ? 'approved' : 'failed',
              decidedBy: 'you',
              decidedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
              reason,
              slaHoursLeft: 0,
            })
            logAudit({ action: 'customer.kyc.decide', resource: 'kyc_case', resourceId: case_.id, before: { status: case_.status }, after: { status: decision === 'approve' ? 'approved' : 'failed' }, reason, ticket })
            addToast({ kind: 'success', title: `${case_.id} ${decision === 'approve' ? 'approved' : 'failed'}`, body: 'Decision, reason and ticket recorded in the audit log.' })
            setDecision(null)
            onClose()
          }}
        />
      )}
    </>
  )
}
