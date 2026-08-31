import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Download, FileText, ShieldAlert, XCircle } from 'lucide-react'
import { DataTable, ScaleNote } from '../components/patterns/DataTable'
import { Module, PageHeader, TabBar, useTab } from '../components/patterns/Page'
import { ElevationGate, ReasonTicketFields } from '../components/patterns/Destructive'
import {
  Badge, Button, Callout, Card, CardHeader, DefinitionList, Drawer, Field, Input, Modal,
  Select, StatTile, StatusBadge, Textarea, Tooltip,
} from '../components/ui'
import { useCan, useCurrentUser, useStore } from '../lib/store'
import { cn, money, num, relative, shortDate } from '../lib/format'
import { concatDatasets, materialized, type TableSpec } from '../lib/table'
import { PAYMENT_APPROVAL_THRESHOLD, REFUND_APPROVAL_THRESHOLD } from '../lib/rbac'
import { findReseller } from '../lib/mock/resellers'
import {
  invoiceLines, invoices, payments, refunds, REFUND_REASONS,
  type Invoice, type Payment, type Refund,
} from '../lib/mock/finance'

// ─────────────────────────────────────────────────────── Payments

const paymentSpec: TableSpec<Payment> = {
  id: 'payments',
  rowId: (p) => p.id,
  defaultSort: { key: 'createdAt', dir: 'desc' },
  search: (p) => `${p.id} ${p.invoiceNumber} ${p.company} ${p.pspReference} ${p.resellerId}`,
  columns: [
    { key: 'id', header: 'Payment', width: 130, mono: true, render: (p) => <span className="font-medium">{p.id}</span> },
    { key: 'createdAt', header: 'Created', width: 150, render: (p) => <Tooltip content={p.createdAt}><span>{relative(p.createdAt)}</span></Tooltip> },
    { key: 'company', header: 'Reseller', width: 200, render: (p) => <Link to={`/customers/resellers/${p.resellerId}`} className="hover:text-brand-700 hover:underline">{p.company}</Link> },
    { key: 'amount', header: 'Amount', width: 120, align: 'right', render: (p) => money(p.amount, p.currency) },
    { key: 'status', header: 'Status', width: 140, render: (p) => <StatusBadge status={p.status} /> },
    { key: 'method', header: 'Method', width: 130, render: (p) => <Badge>{p.method.replace('_', ' ')}</Badge> },
    { key: 'psp', header: 'PSP', width: 90 },
    { key: 'invoiceNumber', header: 'Invoice', width: 150, mono: true },
    { key: 'refundedAmount', header: 'Refunded', width: 110, align: 'right', render: (p) => (p.refundedAmount ? money(p.refundedAmount, p.currency) : '—') },
    { key: 'description', header: 'Description', optional: true },
    { key: 'pspReference', header: 'PSP reference', width: 150, mono: true, optional: true },
    { key: 'settledAt', header: 'Settled', width: 150, optional: true, render: (p) => (p.settledAt ? relative(p.settledAt) : '—') },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['paid', 'pending', 'failed', 'refunded', 'partially_refunded', 'chargeback'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'method', label: 'Method', type: 'multiselect', options: ['ideal', 'creditcard', 'sepa_dd', 'banktransfer', 'paypal', 'account_credit'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'psp', label: 'PSP', type: 'select', options: ['Adyen', 'Mollie', 'PayPal', 'Bank'].map((v) => ({ value: v, label: v })) },
    { key: 'amount', label: 'Amount', type: 'numberrange' },
    { key: 'createdAt', label: 'Created', type: 'daterange' },
    { key: 'resellerId', label: 'Reseller ID', type: 'text' },
  ],
}

export function PaymentsPage({ hideHeader }: { hideHeader?: boolean } = {}) {
  const manual = useStore((s) => s.manualPayments)
  const dataVersion = useStore((s) => s.dataVersion)
  // Payments recorded in this session sit above the seeded set rather than
  // being lost because the seeded table cannot be appended to.
  const ds = useMemo(
    () => (manual.length ? concatDatasets('payments', materialized('payments_manual', manual), payments()) : payments()),
    [manual, dataVersion],
  )
  const [refundFor, setRefundFor] = useState<Payment | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const canRefund = useCan('payment.refund.create')
  const canCreate = useCan('payment.create')

  return (
    <Module permissions={['payment.read']} what="payments">
      {!hideHeader && (
        <PageHeader
          title="Payments"
          subtitle="Search-first is gone: the table loads with the last 30 days and you filter down from there."
          meta={<Badge tone="neutral">{num(ds.total)} payments</Badge>}
        />
      )}
      <ScaleNote total={ds.total} />
      <DataTable
        spec={paymentSpec}
        data={ds}
        permission="payment.read"
        exportName="payments"
        create={canCreate ? { label: 'Create payment', permission: 'payment.create', onClick: () => setCreateOpen(true) } : undefined}
        rowActions={(row) =>
          row.status === 'paid' || row.status === 'partially_refunded' ? (
            <Button size="sm" variant="ghost" disabled={!canRefund} onClick={() => setRefundFor(row)}>
              Refund
            </Button>
          ) : null
        }
      />
      <RefundRequestDrawer payment={refundFor} onClose={() => setRefundFor(null)} />
      <CreatePaymentDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Create payment

const PAYMENT_TYPES = [
  { value: 'bank', label: 'Bank transfer received' },
  { value: 'account_topup', label: 'Account top-up' },
  { value: 'correction', label: 'Manual correction' },
  { value: 'credit_note', label: 'Credit note settlement' },
  { value: 'chargeback_reversal', label: 'Chargeback reversal' },
  { value: 'goodwill', label: 'Goodwill credit' },
]

const PAYMENT_METHODS: { value: Payment['method']; label: string }[] = [
  { value: 'banktransfer', label: 'bank' },
  { value: 'sepa_dd', label: 'SEPA direct debit' },
  { value: 'ideal', label: 'iDEAL' },
  { value: 'creditcard', label: 'credit card' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'account_credit', label: 'account credit' },
]

function CreatePaymentDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createPayment = useStore((s) => s.createPayment)
  const addToast = useStore((s) => s.addToast)
  const dataVersion = useStore((s) => s.dataVersion)
  const [form, setForm] = useState({
    resellerId: '',
    type: 'bank',
    amount: '',
    currency: 'EUR' as 'EUR' | 'USD' | 'GBP',
    method: 'banktransfer' as Payment['method'],
    reference: '',
    description: '',
    reason: '',
    ticket: '',
  })

  const reseller = useMemo(
    () => (/^\d{4,}$/.test(form.resellerId.trim()) ? findReseller(Number(form.resellerId.trim())) : undefined),
    [form.resellerId, dataVersion],
  )
  const amount = Number(form.amount)
  const amountValid = Number.isFinite(amount) && amount > 0
  const needsApproval = amountValid && amount > PAYMENT_APPROVAL_THRESHOLD
  const currencyMismatch = Boolean(reseller) && reseller!.currency !== form.currency
  // Nothing else can be filled in until the account this credits is known —
  // an amount typed against no reseller is just a number waiting to go astray.
  const locked = !reseller
  const ready =
    Boolean(reseller) &&
    amountValid &&
    form.reason.trim().length >= 8 &&
    /^ZD-\d{6}$/.test(form.ticket)

  const reset = () =>
    setForm({
      resellerId: '', type: 'bank', amount: '', currency: 'EUR', method: 'banktransfer',
      reference: '', description: '', reason: '', ticket: '',
    })

  return (
    <Drawer
      open={open}
      onClose={() => { onClose(); reset() }}
      width="md"
      title="Create payment"
      subtitle="Records money received against a reseller balance"
      footer={
        <>
          <Button variant="ghost" onClick={() => { onClose(); reset() }}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => {
              const { payment, awaitingApproval } = createPayment({
                resellerId: reseller!.id,
                company: reseller!.company,
                amount,
                currency: form.currency,
                type: form.type,
                method: form.method,
                description: form.description,
                reference: form.reference,
                reason: form.reason.trim(),
                ticket: form.ticket,
              })
              addToast({
                kind: awaitingApproval ? 'warn' : 'success',
                title: awaitingApproval ? `${payment.id} sent for approval` : `${payment.id} recorded`,
                body: awaitingApproval
                  ? `${money(amount, form.currency)} is above the ${money(PAYMENT_APPROVAL_THRESHOLD)} threshold — the balance is credited only once an approver signs off.`
                  : `${money(amount, form.currency)} credited to ${reseller!.company}.`,
                href: awaitingApproval ? '/system/jobs' : undefined,
                hrefLabel: awaitingApproval ? 'Approvals' : undefined,
              })
              onClose()
              reset()
            }}
          >
            {needsApproval ? 'Request approval' : 'Create payment'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {locked && (
          <Callout tone="info" title="Start with the reseller">
            Every other field is disabled until a reseller ID resolves. The amount, currency and ledger type only mean something against a
            known account, and the balance preview above is what makes a mistyped amount obvious before it is recorded.
          </Callout>
        )}

        <Callout tone="warn" title="This credits a balance, it does not move money">
          Recording a payment lets the reseller spend against it immediately. Use it when money has actually arrived outside the payment
          providers — a bank transfer, a correction, a goodwill credit — and put the bank reference in the field below so finance can
          reconcile it later.
        </Callout>

        <Field
          label="Reseller ID"
          required
          error={form.resellerId && !reseller ? 'No reseller with that ID.' : null}
          hint={reseller ? undefined : 'Numeric ID, e.g. 100341. The rest of the form unlocks once it resolves.'}
        >
          <Input
            value={form.resellerId}
            invalid={Boolean(form.resellerId) && !reseller}
            onChange={(e) => setForm({ ...form, resellerId: e.target.value })}
            placeholder="100341"
          />
        </Field>

        {reseller && (
          <Card>
            <CardHeader title={reseller.company} subtitle={`${reseller.membership} · ${reseller.paymentTerm} · ${reseller.countryName}`} />
            <div className="p-4">
              <DefinitionList
                items={[
                  { label: 'Current balance', value: <span className={reseller.balance < 0 ? 'text-brand-700' : undefined}>{money(reseller.balance, reseller.currency)}</span> },
                  {
                    label: 'After this payment',
                    value: amountValid ? (
                      <span className="font-medium text-emerald-700">
                        {money(reseller.balance + amount, reseller.currency)}
                      </span>
                    ) : '—',
                  },
                  { label: 'Account currency', value: reseller.currency },
                  { label: 'Status', value: <StatusBadge status={reseller.status} /> },
                ]}
              />
            </div>
          </Card>
        )}

        <fieldset disabled={locked} className={cn('contents', locked && '[&_label]:text-ink-400')}>
          <div className={cn('grid gap-3 transition-opacity sm:grid-cols-2', locked && 'opacity-60')}>
            <Field label="Type" required hint="How this entry is classified in the ledger.">
              <Select disabled={locked} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {PAYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Method" required hint="The instrument the money arrived by.">
              <Select disabled={locked} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as Payment['method'] })}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Field>
            <Field
              label="Amount"
              required
              error={form.amount && !amountValid ? 'Enter an amount greater than zero.' : null}
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                disabled={locked}
                value={form.amount}
                invalid={Boolean(form.amount) && !amountValid}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
              />
            </Field>
            <Field label="Currency" required>
              <Select disabled={locked} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as 'EUR' | 'USD' | 'GBP' })}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </Select>
            </Field>
            <Field label="Bank / PSP reference" className="sm:col-span-2" hint="What reconciliation will match on.">
              <Input disabled={locked} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="NL91RABO0123456789 / 20260827-0042" />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Input disabled={locked} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Bank transfer received 2026-08-27" />
            </Field>
          </div>
        </fieldset>

        {currencyMismatch && (
          <Callout tone="warn" title="Currency differs from the account">
            The account is held in {reseller!.currency} but this entry is in {form.currency}. It will be converted at the rate on the
            booking date, so the credited amount will not match the figure above exactly.
          </Callout>
        )}

        {needsApproval && (
          <Callout tone="danger" title={`Above the ${money(PAYMENT_APPROVAL_THRESHOLD)} threshold`}>
            This becomes a Tier 3 action: the entry is created as pending and the balance is credited only after a second approver signs
            off. That is deliberate — a mistyped amount here is money the reseller can spend.
          </Callout>
        )}

        <div className={cn('transition-opacity', locked && 'opacity-60')}>
          <h4 className={cn('mb-2 text-xs font-semibold uppercase tracking-wide', locked ? 'text-ink-400' : 'text-ink-500')}>
            Why (T2 — audited)
          </h4>
          <ReasonTicketFields
            disabled={locked}
            reason={form.reason}
            ticket={form.ticket}
            onReason={(v) => setForm({ ...form, reason: v })}
            onTicket={(v) => setForm({ ...form, ticket: v })}
            reasonPlaceholder="Bank transfer received today, not matched automatically because the reference was missing."
          />
        </div>
      </div>
    </Drawer>
  )
}

function RefundRequestDrawer({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState(REFUND_REASONS[0])
  const [ticket, setTicket] = useState('')
  const [method, setMethod] = useState('original_method')
  const [iban, setIban] = useState('')
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)
  const addApproval = useStore((s) => s.addApproval)
  const user = useCurrentUser()

  if (!payment) return null
  const value = Number(amount || payment.amount)
  const needsApproval = value > REFUND_APPROVAL_THRESHOLD
  const ticketValid = /^ZD-\d{6}$/.test(ticket)
  const ready = ticketValid && value > 0 && value <= payment.amount - payment.refundedAmount && (method !== 'bank_transfer' || iban.length > 14)

  return (
    <Drawer
      open
      onClose={onClose}
      width="md"
      title={`Refund ${payment.id}`}
      subtitle={`${money(payment.amount, payment.currency)} paid ${relative(payment.createdAt)} by ${payment.company}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => {
              const id = `RF-${Math.floor(Math.random() * 9000 + 51000)}`
              if (needsApproval) {
                addApproval({
                  kind: 'refund',
                  label: `Refund ${id} — ${payment.company}`,
                  amount: value,
                  requestedBy: user.email.split('@')[0],
                  requestedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
                  tier: 'T3',
                  targetId: id,
                  reason,
                  ticket,
                  detail: [
                    `${money(value)} is above the ${money(REFUND_APPROVAL_THRESHOLD)} approver threshold.`,
                    `Payment ${payment.id} · ${payment.psp} reference ${payment.pspReference}.`,
                    method === 'bank_transfer' ? `Beneficiary IBAN ${iban} differs from the original payment method.` : 'Refund goes back to the original payment method.',
                  ],
                })
              }
              logAudit({
                action: 'payment.refund.create',
                resource: 'refund',
                resourceId: id,
                after: { amount: value, method, awaitingApproval: needsApproval },
                reason,
                ticket,
              })
              addToast({
                kind: needsApproval ? 'warn' : 'success',
                title: needsApproval ? `Refund ${id} sent for approval` : `Refund ${id} submitted`,
                body: needsApproval
                  ? `${money(value)} exceeds the ${money(REFUND_APPROVAL_THRESHOLD)} threshold — a Finance Approver must sign off.`
                  : 'Below the approval threshold. Processed on the next PSP batch.',
                href: '/billing/payments?tab=refunds',
                hrefLabel: 'Refunds',
              })
              onClose()
            }}
          >
            {needsApproval ? 'Request approval' : 'Submit refund'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <DefinitionList
          items={[
            { label: 'Payment', value: <code className="font-mono text-xs">{payment.id}</code> },
            { label: 'Invoice', value: payment.invoiceNumber },
            { label: 'PSP', value: `${payment.psp} · ${payment.pspReference}` },
            { label: 'Refundable', value: money(payment.amount - payment.refundedAmount, payment.currency) },
          ]}
        />
        <Field label="Refund amount" required hint={`Maximum ${money(payment.amount - payment.refundedAmount, payment.currency)}.`}>
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(payment.amount)} />
        </Field>
        <Field label="Reason" required>
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {REFUND_REASONS.map((r) => <option key={r}>{r}</option>)}
          </Select>
        </Field>
        <Field
          label="Zendesk ticket"
          required
          error={ticket && !ticketValid ? 'Must be ZD-123456. The reference is checked against Zendesk before payout.' : null}
          hint="The old form accepted any free text here and never validated it."
        >
          <Input value={ticket} onChange={(e) => setTicket(e.target.value.toUpperCase())} placeholder="ZD-448120" invalid={Boolean(ticket) && !ticketValid} />
        </Field>
        <Field label="Payout route" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="original_method">Back to the original payment method (recommended)</option>
            <option value="account_credit">As account credit</option>
            <option value="bank_transfer">To specific banking details</option>
          </Select>
        </Field>
        {method === 'bank_transfer' && (
          <>
            <Field label="Beneficiary IBAN" required>
              <Input value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} placeholder="NL91RABO0123456789" />
            </Field>
            <Callout tone="danger" title="Money to arbitrary banking details">
              Paying out to an IBAN that differs from the original payment is the highest-risk refund route. It always requires
              second-approver sign-off, regardless of amount.
            </Callout>
          </>
        )}
        {needsApproval && (
          <Callout tone="warn" title={`Above the ${money(REFUND_APPROVAL_THRESHOLD)} threshold`}>
            This becomes a Tier 3 action: a Finance Approver reviews the amount, ticket and beneficiary before any money moves.
          </Callout>
        )}
      </div>
    </Drawer>
  )
}

// ─────────────────────────────────────────────────────── Refunds + approver queue

const refundSpec: TableSpec<Refund> = {
  id: 'refunds',
  rowId: (r) => r.id,
  defaultSort: { key: 'requestedAt', dir: 'desc' },
  search: (r) => `${r.id} ${r.paymentId} ${r.company} ${r.zendeskTicket} ${r.requestedBy}`,
  columns: [
    { key: 'id', header: 'Refund', width: 110, mono: true, render: (r) => <span className="font-medium">{r.id}</span> },
    { key: 'company', header: 'Reseller', width: 200, render: (r) => <Link to={`/customers/resellers/${r.resellerId}`} className="hover:text-brand-700 hover:underline">{r.company}</Link> },
    { key: 'amount', header: 'Amount', width: 120, align: 'right', render: (r) => (
      <span className={r.amount > REFUND_APPROVAL_THRESHOLD ? 'font-semibold text-brand-700' : undefined}>{money(r.amount)}</span>
    ) },
    { key: 'tier', header: 'Tier', width: 70, render: (r) => <Badge tone={r.tier === 'T3' ? 'danger' : 'warn'}>{r.tier}</Badge> },
    { key: 'status', header: 'Status', width: 150, render: (r) => <StatusBadge status={r.status} /> },
    { key: 'reason', header: 'Reason', width: 200 },
    { key: 'zendeskTicket', header: 'Ticket', width: 120, render: (r) => (
      r.ticketValid
        ? <code className="font-mono text-xs">{r.zendeskTicket}</code>
        : <Tooltip content="Not a valid Zendesk reference — the old form never checked"><Badge tone="danger">{r.zendeskTicket || 'missing'}</Badge></Tooltip>
    ) },
    { key: 'method', header: 'Route', width: 140, render: (r) => <Badge tone={r.method === 'bank_transfer' ? 'warn' : 'neutral'}>{r.method.replace('_', ' ')}</Badge> },
    { key: 'requestedBy', header: 'Requested by', width: 130 },
    { key: 'approver', header: 'Approver', width: 130, render: (r) => r.approver ?? '—' },
    { key: 'requestedAt', header: 'Requested', width: 130, render: (r) => relative(r.requestedAt) },
    { key: 'paymentId', header: 'Payment', width: 140, mono: true, optional: true },
    { key: 'iban', header: 'IBAN', width: 180, mono: true, optional: true, noExport: true },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['draft', 'awaiting_approval', 'approved', 'rejected', 'processing', 'completed', 'failed'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'tier', label: 'Tier', type: 'select', options: [{ value: 'T2', label: 'T2 — below threshold' }, { value: 'T3', label: 'T3 — above threshold' }] },
    { key: 'amount', label: 'Amount', type: 'numberrange' },
    { key: 'ticketValid', label: 'Valid ticket reference', type: 'boolean' },
    { key: 'method', label: 'Payout route', type: 'select', options: ['original_method', 'bank_transfer', 'account_credit'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'requestedAt', label: 'Requested', type: 'daterange' },
  ],
}

export function RefundsPage({ hideHeader }: { hideHeader?: boolean } = {}) {
  const ds = refunds()
  const [tab, setTab] = useTab('queue')
  const approvals = useStore((s) => s.approvals)
  const canApprove = useCan('payment.refund.approve')

  const counts = useMemo(() => {
    const c = { awaiting: 0, invalidTicket: 0, completed: 0, value: 0 }
    for (let i = 0; i < ds.total; i++) {
      const r = ds.at(i)
      if (r._deleted) continue
      if (r.status === 'awaiting_approval') {
        c.awaiting++
        c.value += r.amount
      }
      if (!r.ticketValid) c.invalidTicket++
      if (r.status === 'completed') c.completed++
    }
    return c
  }, [ds])

  const spec: TableSpec<Refund> = {
    ...refundSpec,
    id: `refunds_${tab}`,
    defaultFilters: tab === 'queue' ? { status: ['awaiting_approval'] } : tab === 'flagged' ? { ticketValid: false } : {},
  }

  return (
    <Module permissions={['payment.read', 'payment.refund.create', 'payment.refund.approve']} what="refunds">
      {!hideHeader && (
        <PageHeader
          title="Refunds"
          subtitle="The highest-value control gap after RBAC: refunds move money to arbitrary banking details. Every refund above threshold now needs a named approver."
        />
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Awaiting approval" value={num(counts.awaiting)} tone="warn" hint={money(counts.value)} icon={<ShieldAlert className="h-4 w-4" />} />
        <StatTile label="Invalid ticket reference" value={num(counts.invalidTicket)} tone="danger" hint="legacy records" />
        <StatTile label="Completed" value={num(counts.completed)} tone="success" />
        <StatTile label="Approval threshold" value={money(REFUND_APPROVAL_THRESHOLD)} hint="above this: T3 + approver" />
      </div>

      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'queue', label: 'Approval queue', count: approvals.filter((a) => a.kind === 'refund').length + counts.awaiting },
          { id: 'flagged', label: 'Flagged tickets', count: counts.invalidTicket },
          { id: 'all', label: 'All refunds' },
        ]}
      />

      {tab === 'queue' && <ApprovalQueue canApprove={canApprove} />}

      <DataTable key={tab} spec={spec} data={ds} permission="payment.read" exportName="refunds" />
    </Module>
  )
}

function ApprovalQueue({ canApprove }: { canApprove: boolean }) {
  const approvals = useStore((s) => s.approvals)
  const resolveApproval = useStore((s) => s.resolveApproval)
  const addToast = useStore((s) => s.addToast)
  const [note, setNote] = useState('')
  const [acting, setActing] = useState<{ id: string; decision: 'approved' | 'rejected' } | null>(null)

  if (!approvals.length) {
    return (
      <Card className="p-6">
        <p className="text-center text-xs text-ink-500">Nothing waiting for a second approver right now.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <ElevationGate permission="payment.refund.approve" what="approve refunds above threshold">
        <Callout tone="success" title="Approval powers active">
          You are elevated for <code className="font-mono">payment.refund.approve</code>. Approvals you give in this window are recorded
          with the elevation reference.
        </Callout>
      </ElevationGate>

      {approvals.map((a) => (
        <Card key={a.id}>
          <CardHeader
            title={a.label}
            subtitle={`Requested by ${a.requestedBy} · ${relative(a.requestedAt)} · ${a.ticket}`}
            actions={
              <div className="flex items-center gap-2">
                <Badge tone="danger">T3</Badge>
                {a.amount && <span className="text-sm font-semibold tabular text-ink-900">{money(a.amount)}</span>}
              </div>
            }
          />
          <div className="space-y-3 p-4">
            <p className="text-xs text-ink-700">{a.reason}</p>
            <ul className="space-y-1">
              {a.detail.map((d) => (
                <li key={d} className="flex gap-2 text-2xs text-ink-600">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ink-400" />
                  {d}
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="primary" disabled={!canApprove} onClick={() => setActing({ id: a.id, decision: 'approved' })}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
              </Button>
              <Button size="sm" variant="secondary" disabled={!canApprove} onClick={() => setActing({ id: a.id, decision: 'rejected' })}>
                <XCircle className="h-3.5 w-3.5" /> Reject
              </Button>
              {!canApprove && <span className="text-2xs text-ink-500">Requires payment.refund.approve under elevation.</span>}
            </div>
          </div>
        </Card>
      ))}

      <Modal
        open={Boolean(acting)}
        onClose={() => setActing(null)}
        title={acting?.decision === 'approved' ? 'Approve request' : 'Reject request'}
        subtitle="Your decision, name and note are written to the audit log."
        footer={
          <>
            <Button variant="ghost" onClick={() => setActing(null)}>Cancel</Button>
            <Button
              variant={acting?.decision === 'approved' ? 'primary' : 'danger'}
              disabled={note.trim().length < 6}
              onClick={() => {
                if (acting) {
                  resolveApproval(acting.id, acting.decision, note.trim())
                  addToast({
                    kind: acting.decision === 'approved' ? 'success' : 'info',
                    title: acting.decision === 'approved' ? 'Approved — queued for execution' : 'Rejected',
                    body: 'Requester notified; audit entry written.',
                  })
                }
                setNote('')
                setActing(null)
              }}
            >
              {acting?.decision === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </>
        }
      >
        <Field label="Approver note" required hint="Minimum 6 characters.">
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="font-sans text-sm" />
        </Field>
      </Modal>
    </div>
  )
}

// ─────────────────────────────────────────────────────── Invoices

const invoiceSpec: TableSpec<Invoice> = {
  id: 'invoices',
  rowId: (i) => i.id,
  defaultSort: { key: 'issuedAt', dir: 'desc' },
  search: (i) => `${i.number} ${i.company} ${i.resellerId} ${i.poNumber} ${i.paymentId ?? ''}`,
  columns: [
    { key: 'number', header: 'Invoice', width: 160, mono: true, render: (i) => <span className="font-medium">{i.number}</span> },
    { key: 'issuedAt', header: 'Issued', width: 110, render: (i) => shortDate(i.issuedAt) },
    { key: 'company', header: 'Reseller', width: 210, render: (i) => (
      <Link to={`/customers/resellers/${i.resellerId}`} className="hover:text-brand-700 hover:underline">{i.company}</Link>
    ) },
    { key: 'status', header: 'Status', width: 140, render: (i) => <StatusBadge status={i.status} /> },
    { key: 'gross', header: 'Gross', width: 120, align: 'right', render: (i) => money(i.gross, i.currency) },
    { key: 'net', header: 'Net', width: 110, align: 'right', optional: true, render: (i) => money(i.net, i.currency) },
    { key: 'vat', header: 'VAT', width: 100, align: 'right', render: (i) => (i.vat ? money(i.vat, i.currency) : '—') },
    { key: 'vatScheme', header: 'VAT scheme', width: 140, render: (i) => <Badge>{i.vatScheme.replace('_', ' ')}</Badge> },
    { key: 'outstanding', header: 'Outstanding', width: 130, align: 'right', value: (i) => i.gross - i.paidAmount, render: (i) => {
      const left = Math.round((i.gross - i.paidAmount) * 100) / 100
      if (i.status === 'cancelled' || i.status === 'credited') return <span className="text-ink-400">—</span>
      return left > 0 ? <span className="font-medium text-brand-700">{money(left, i.currency)}</span> : <span className="text-emerald-700">settled</span>
    } },
    { key: 'dueAt', header: 'Due', width: 110, render: (i) => (
      <span className={i.status === 'overdue' ? 'font-medium text-brand-700' : undefined}>{shortDate(i.dueAt)}</span>
    ) },
    { key: 'dunningLevel', header: 'Dunning', width: 100, align: 'right', render: (i) => (
      i.dunningLevel ? <Badge tone={i.dunningLevel > 2 ? 'danger' : 'warn'}>level {i.dunningLevel}</Badge> : '—'
    ) },
    { key: 'lines', header: 'Lines', width: 90, align: 'right', render: (i) => num(i.lines) },
    { key: 'period', header: 'Period', width: 100, mono: true, optional: true },
    { key: 'paymentId', header: 'Payment', width: 140, mono: true, optional: true, render: (i) => (
      i.paymentId ? <Link to={`/billing/payments?q=${encodeURIComponent(i.paymentId)}`} className="hover:text-brand-700 hover:underline">{i.paymentId}</Link> : '—'
    ) },
    { key: 'poNumber', header: 'PO number', width: 120, optional: true, render: (i) => i.poNumber || '—' },
    { key: 'country', header: 'Country', width: 90, optional: true },
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'multiselect', options: ['open', 'partially_paid', 'paid', 'overdue', 'credited', 'cancelled'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'period', label: 'Period', type: 'text', placeholder: '2026-08' },
    { key: 'issuedAt', label: 'Issued', type: 'daterange' },
    { key: 'dueAt', label: 'Due', type: 'daterange' },
    { key: 'gross', label: 'Gross amount', type: 'numberrange' },
    { key: 'vatScheme', label: 'VAT scheme', type: 'multiselect', options: ['domestic', 'reverse_charge', 'exempt', 'non_eu'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'dunningLevel', label: 'Dunning level', type: 'numberrange' },
    { key: 'resellerId', label: 'Reseller ID', type: 'text' },
  ],
}

export function InvoicesPage({ hideHeader }: { hideHeader?: boolean } = {}) {
  const ds = invoices()
  const [open, setOpen] = useState<Invoice | null>(null)
  const addToast = useStore((s) => s.addToast)
  const logAudit = useStore((s) => s.logAudit)

  const totals = useMemo(() => {
    let outstanding = 0
    let overdue = 0
    let overdueValue = 0
    let issuedThisPeriod = 0
    const period = '2026-08'
    for (let i = 0; i < ds.total; i++) {
      const inv = ds.at(i)
      if (inv._deleted) continue
      if (inv.status !== 'cancelled' && inv.status !== 'credited') outstanding += inv.gross - inv.paidAmount
      if (inv.status === 'overdue') {
        overdue++
        overdueValue += inv.gross - inv.paidAmount
      }
      if (inv.period === period) issuedThisPeriod++
    }
    return { outstanding, overdue, overdueValue, issuedThisPeriod }
  }, [ds])

  const lines = useMemo(() => (open ? invoiceLines(open) : []), [open])

  return (
    <Module permissions={['finance.invoice.read']} what="invoices">
      {!hideHeader && (
        <PageHeader
          title="Invoices"
          subtitle="The invoice register. Invoices are produced by the billing pipeline — this page reads them, it does not generate them."
          meta={<Badge tone="neutral">{num(ds.total)} invoices</Badge>}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Outstanding" value={money(totals.outstanding)} tone={totals.outstanding > 0 ? 'warn' : 'success'} />
        <StatTile label="Overdue invoices" value={num(totals.overdue)} tone={totals.overdue ? 'danger' : 'success'} hint={money(totals.overdueValue)} />
        <StatTile label="Issued this period" value={num(totals.issuedThisPeriod)} hint="2026-08" />
        <StatTile label="Total invoices" value={num(ds.total)} />
      </div>
      <Callout tone="info" icon={<FileText className="h-4 w-4" />} title="Read-only by design">
        Generating invoices is not an ACP capability. The monthly run belongs to the billing pipeline, where it is scheduled, tested and
        reversible; an admin panel button that mints invoices for thousands of resellers is the kind of one-click, no-dry-run operation this
        rebuild exists to remove. Corrections happen as credit notes through Finance, and each one shows up here.
      </Callout>
      <DataTable
        spec={invoiceSpec}
        data={ds}
        permission="finance.invoice.read"
        exportName="invoices"
        onRowClick={(row) => setOpen(row)}
        rowActions={(row) => (
          <div className="flex items-center gap-1">
            <Tooltip content="Open the invoice detail">
              <Button size="sm" variant="ghost" onClick={() => setOpen(row)}>View</Button>
            </Tooltip>
            <Tooltip content="Download the PDF as sent to the reseller">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  logAudit({ action: 'finance.invoice.read', resource: 'invoice_pdf', resourceId: row.id })
                  addToast({ kind: 'info', title: `Downloading ${row.number}.pdf`, body: 'The download is recorded against the invoice.' })
                }}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          </div>
        )}
      />

      <Drawer
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        width="lg"
        title={open?.number ?? ''}
        subtitle={open ? `${open.company} · issued ${shortDate(open.issuedAt)} · due ${shortDate(open.dueAt)}` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (open) {
                  logAudit({ action: 'finance.invoice.read', resource: 'invoice_pdf', resourceId: open.id })
                  addToast({ kind: 'info', title: `Downloading ${open.number}.pdf` })
                }
              }}
            >
              <Download className="h-3.5 w-3.5" /> Download PDF
            </Button>
          </>
        }
      >
        {open && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={open.status} />
              <Badge>{open.vatScheme.replace('_', ' ')}</Badge>
              {open.dunningLevel > 0 && <Badge tone="danger">dunning level {open.dunningLevel}</Badge>}
              {open.creditNoteFor && <Badge tone="purple">credit note for {open.creditNoteFor}</Badge>}
            </div>

            <DefinitionList
              columns={3}
              items={[
                { label: 'Reseller', value: <Link to={`/customers/resellers/${open.resellerId}`} className="text-brand-700 hover:underline">{open.company}</Link> },
                { label: 'Period', value: open.period },
                { label: 'Country', value: open.country },
                { label: 'Net', value: money(open.net, open.currency) },
                { label: `VAT (${open.vatRate}%)`, value: money(open.vat, open.currency) },
                { label: 'Gross', value: <span className="font-semibold">{money(open.gross, open.currency)}</span> },
                { label: 'Paid', value: money(open.paidAmount, open.currency) },
                { label: 'Outstanding', value: money(open.gross - open.paidAmount, open.currency) },
                { label: 'Payment', value: open.paymentId ? <Link to={`/billing/payments?q=${encodeURIComponent(open.paymentId)}`} className="text-brand-700 hover:underline">{open.paymentId}</Link> : '—' },
                { label: 'PO number', value: open.poNumber || '—' },
                { label: 'Paid at', value: open.paidAt ? shortDate(open.paidAt) : '—' },
                { label: 'Lines', value: num(open.lines) },
              ]}
            />

            <Card>
              <CardHeader
                title="Lines"
                subtitle={open.lines > lines.length ? `First ${lines.length} of ${num(open.lines)}` : `${lines.length} line(s)`}
              />
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-sm">
                  <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Description</th>
                      <th className="px-4 py-2 text-left">Product</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Unit</th>
                      <th className="px-4 py-2 text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id} className="border-t border-ink-100">
                        <td className="px-4 py-2">{l.description}</td>
                        <td className="px-4 py-2"><Badge>{l.product}</Badge></td>
                        <td className="px-4 py-2 text-right tabular">{num(l.quantity)}</td>
                        <td className="px-4 py-2 text-right tabular">{money(l.unitPrice, open.currency)}</td>
                        <td className="px-4 py-2 text-right tabular">{money(l.net, open.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {open.status === 'overdue' && (
              <Callout tone="warn" title={`Overdue — dunning level ${open.dunningLevel}`}>
                {money(open.gross - open.paidAmount, open.currency)} outstanding since {shortDate(open.dueAt)}. Collections are driven from{' '}
                <Link to="/reports/postpaid-debt" className="text-brand-700 hover:underline">Reports → Postpaid Customer Debt</Link>, not from
                this page.
              </Callout>
            )}
          </div>
        )}
      </Drawer>
    </Module>
  )
}
