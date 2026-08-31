import { Gen, isoDate, NOW_MS } from '../rng'
import { materialized, synthetic, type Dataset } from '../table'
import { patchable, type Deletable } from './patch'
import { resellers } from './resellers'

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type PaymentMethod = 'ideal' | 'creditcard' | 'paypal' | 'banktransfer' | 'sepa_dd' | 'account_credit'
export type PaymentStatus = 'paid' | 'pending' | 'failed' | 'chargeback' | 'refunded' | 'partially_refunded'

export interface Payment extends Deletable {
  id: string
  resellerId: number
  company: string
  amount: number
  currency: 'EUR' | 'USD' | 'GBP'
  method: PaymentMethod
  status: PaymentStatus
  createdAt: string
  settledAt: string | null
  invoiceNumber: string
  psp: 'Adyen' | 'Mollie' | 'PayPal' | 'Bank'
  pspReference: string
  refundedAmount: number
  description: string
  countryCode: string
}

const PAYMENT_COUNT = 41_260

let _payments: Dataset<Payment> | null = null
export function payments(): Dataset<Payment> {
  if (!_payments) {
    const rds = resellers()
    _payments = patchable(
      synthetic<Payment>('payments', PAYMENT_COUNT, (i) => {
        const g = new Gen('payment', i)
        const r = rds.at((i * 3) % rds.total)
        const status = g.weighted<PaymentStatus>([
          ['paid', 76], ['pending', 8], ['failed', 7], ['refunded', 5], ['partially_refunded', 2], ['chargeback', 2],
        ])
        const amount = g.money(4, 24000)
        return {
          id: `PAY-${2_000_000 + i}`,
          resellerId: r.id,
          company: r.company,
          amount,
          currency: r.currency,
          method: g.weighted([
            ['ideal', 26], ['creditcard', 30], ['sepa_dd', 16], ['banktransfer', 14], ['paypal', 10], ['account_credit', 4],
          ]),
          status,
          createdAt: g.dateTimeOffset(-14000, -1),
          settledAt: status === 'pending' || status === 'failed' ? null : g.dateTimeOffset(-13900, -1),
          invoiceNumber: `INV-2026-${String(100000 + i).slice(-6)}`,
          psp: g.weighted([['Adyen', 46], ['Mollie', 32], ['PayPal', 12], ['Bank', 10]]),
          pspReference: `${g.int(1e11, 9e11)}`,
          refundedAmount: status === 'refunded' ? amount : status === 'partially_refunded' ? Math.round(amount * g.float(0.1, 0.6) * 100) / 100 : 0,
          description: g.pick(['Account top-up', 'Invoice settlement', 'Domain renewals batch', 'SSL order', 'Membership fee', 'License renewals']),
          countryCode: r.country,
        }
      }),
      (r) => r.id,
    )
  }
  return _payments
}

export function findPayment(id: string): Payment | undefined {
  const ds = payments()
  for (let i = 0; i < ds.total; i++) {
    const p = ds.at(i)
    if (p.id === id) return p
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Refunds — with an approver queue (T2 → T3 above threshold)
// ---------------------------------------------------------------------------

export type RefundStatus = 'draft' | 'awaiting_approval' | 'approved' | 'rejected' | 'processing' | 'completed' | 'failed'

export interface Refund extends Deletable {
  id: string
  paymentId: string
  resellerId: number
  company: string
  amount: number
  currency: string
  originalAmount: number
  reason: string
  zendeskTicket: string
  ticketValid: boolean
  requestedBy: string
  requestedAt: string
  status: RefundStatus
  approver: string | null
  approvedAt: string | null
  rejectionReason: string | null
  iban: string
  beneficiary: string
  method: 'original_method' | 'bank_transfer' | 'account_credit'
  tier: 'T2' | 'T3'
}

export const REFUND_REASONS = [
  'Duplicate payment', 'Domain registration failed', 'Overcharged renewal', 'Chargeback avoidance',
  'Goodwill — outage credit', 'Cancelled order', 'Incorrect membership fee',
]

let _refunds: Dataset<Refund> | null = null
export function refunds(): Dataset<Refund> {
  if (!_refunds) {
    const rds = resellers()
    const rows: Refund[] = Array.from({ length: 246 }, (_, i) => {
      const g = new Gen('refund', i)
      const r = rds.at((i * 53) % rds.total)
      const original = g.money(20, 18000)
      const amount = Math.round(original * g.float(0.15, 1) * 100) / 100
      const status = g.weighted<RefundStatus>([
        ['awaiting_approval', 22], ['completed', 44], ['approved', 8], ['rejected', 9], ['processing', 9], ['failed', 4], ['draft', 4],
      ])
      const ticketValid = g.bool(0.82)
      return {
        id: `RF-${50000 + i}`,
        paymentId: `PAY-${2_000_000 + g.int(0, 41_000)}`,
        resellerId: r.id,
        company: r.company,
        amount,
        currency: 'EUR',
        originalAmount: original,
        reason: g.pick(REFUND_REASONS),
        zendeskTicket: ticketValid ? `ZD-${g.int(400000, 499999)}` : g.pick(['see email', 'ZD-', 'n/a', '12345']),
        ticketValid,
        requestedBy: g.pick(['f.moreau', 'l.jansen', 'finance.bot', 's.nilsson']),
        requestedAt: g.dateTimeOffset(-2000, -1),
        status,
        approver: status === 'approved' || status === 'completed' ? g.pick(['h.vermeer', 'k.oosterhuis']) : null,
        approvedAt: status === 'approved' || status === 'completed' ? g.dateTimeOffset(-1900, -1) : null,
        rejectionReason: status === 'rejected' ? g.pick(['No valid ticket reference', 'Beneficiary mismatch', 'Duplicate refund request']) : null,
        iban: `NL${g.int(10, 99)}RABO${g.int(1000000000, 9999999999)}`,
        beneficiary: r.company,
        method: g.weighted([['original_method', 62], ['bank_transfer', 30], ['account_credit', 8]]),
        tier: amount > 500 ? 'T3' : 'T2',
      }
    })
    _refunds = patchable(materialized('refunds', rows), (r) => r.id)
  }
  return _refunds
}

// ---------------------------------------------------------------------------
// Invoices — the register itself. There is no run/generation capability in the
// ACP: invoices are produced by the billing pipeline and this is the read model.
// ---------------------------------------------------------------------------

export type InvoiceStatus = 'open' | 'partially_paid' | 'paid' | 'overdue' | 'credited' | 'cancelled'
export type VatScheme = 'domestic' | 'reverse_charge' | 'exempt' | 'non_eu'

export interface Invoice extends Deletable {
  id: string
  number: string
  resellerId: number
  company: string
  country: string
  period: string
  issuedAt: string
  dueAt: string
  net: number
  vat: number
  gross: number
  vatRate: number
  vatScheme: VatScheme
  currency: 'EUR' | 'USD' | 'GBP'
  status: InvoiceStatus
  paidAt: string | null
  paymentId: string | null
  paidAmount: number
  lines: number
  dunningLevel: number
  poNumber: string
  pdf: string
  creditNoteFor: string | null
}

const INVOICE_COUNT = 38_420

let _invoices: Dataset<Invoice> | null = null
export function invoices(): Dataset<Invoice> {
  if (!_invoices) {
    const rds = resellers()
    _invoices = patchable(
      synthetic<Invoice>('invoices', INVOICE_COUNT, (i) => {
        const g = new Gen('invoice', i)
        const r = rds.at((i * 7) % rds.total)
        const net = g.money(4, 21000)
        const scheme = g.weighted<VatScheme>([
          ['domestic', 44], ['reverse_charge', 38], ['non_eu', 12], ['exempt', 6],
        ])
        const vatRate = scheme === 'domestic' ? 21 : 0
        const vat = Math.round(net * (vatRate / 100) * 100) / 100
        const gross = Math.round((net + vat) * 100) / 100
        const ageDays = g.int(0, 640)
        const issued = isoDate(NOW_MS - ageDays * 86400000)
        const termDays = r.paymentTerm === 'Net 30' ? 30 : r.paymentTerm === 'Net 14' ? 14 : 0
        const due = isoDate(NOW_MS - (ageDays - termDays) * 86400000)
        const status = g.weighted<InvoiceStatus>([
          ['paid', 74], ['open', 10], ['overdue', 8], ['partially_paid', 3], ['credited', 3], ['cancelled', 2],
        ])
        const overdue = status === 'overdue'
        const paidAmount =
          status === 'paid' ? gross : status === 'partially_paid' ? Math.round(gross * g.float(0.15, 0.8) * 100) / 100 : 0
        return {
          id: `INV-2026-${String(100000 + i).slice(-6)}`,
          number: `INV-2026-${String(100000 + i).slice(-6)}`,
          resellerId: r.id,
          company: r.company,
          country: r.country,
          period: issued.slice(0, 7),
          issuedAt: issued,
          dueAt: due,
          net,
          vat,
          gross,
          vatRate,
          vatScheme: scheme,
          currency: r.currency,
          status,
          paidAt: status === 'paid' ? isoDate(NOW_MS - Math.max(0, ageDays - g.int(1, 20)) * 86400000) : null,
          paymentId: status === 'paid' || status === 'partially_paid' ? `PAY-${2_000_000 + g.int(0, 41_000)}` : null,
          paidAmount,
          lines: g.weighted([[g.int(1, 5), 46], [g.int(6, 40), 38], [g.int(41, 900), 16]]),
          dunningLevel: overdue ? g.int(1, 3) : 0,
          poNumber: g.bool(0.22) ? `PO-${g.int(10000, 99999)}` : '',
          pdf: `/invoices/INV-2026-${String(100000 + i).slice(-6)}.pdf`,
          creditNoteFor: status === 'credited' ? `INV-2026-${String(100000 + g.int(1, 900)).slice(-6)}` : null,
        }
      }),
      (r) => r.id,
    )
  }
  return _invoices
}

export interface InvoiceLine {
  id: string
  description: string
  product: 'domain' | 'ssl' | 'license' | 'spamexperts' | 'membership' | 'wpp' | 'service'
  quantity: number
  unitPrice: number
  net: number
  vatRate: number
  period: string
}

const LINE_TEMPLATES: [InvoiceLine['product'], string][] = [
  ['domain', 'Domain renewal'],
  ['domain', 'Domain registration'],
  ['domain', 'Domain transfer'],
  ['ssl', 'SSL certificate'],
  ['license', 'Plesk license'],
  ['spamexperts', 'SpamExperts mailbox bundle'],
  ['membership', 'Membership fee'],
  ['wpp', 'Whois privacy protection'],
  ['service', 'Managed service'],
]

/** Lines for the detail drawer, derived from the invoice so totals stay plausible. */
export function invoiceLines(invoice: Invoice, limit = 12): InvoiceLine[] {
  const g = new Gen('invline', invoice.id)
  const n = Math.min(limit, invoice.lines)
  const rows: InvoiceLine[] = []
  let remaining = invoice.net
  for (let i = 0; i < n; i++) {
    const [product, description] = g.pick(LINE_TEMPLATES)
    const last = i === n - 1
    const quantity = product === 'domain' ? g.int(1, 40) : g.int(1, 6)
    const net = last ? Math.round(remaining * 100) / 100 : Math.round(remaining * g.float(0.08, 0.4) * 100) / 100
    remaining = Math.max(0, Math.round((remaining - net) * 100) / 100)
    rows.push({
      id: `IL-${invoice.id}-${i}`,
      description,
      product,
      quantity,
      unitPrice: Math.round((net / Math.max(1, quantity)) * 100) / 100,
      net,
      vatRate: invoice.vatRate,
      period: invoice.period,
    })
  }
  return rows
}

/** One-pass money summary, cached for the session. */
export interface FinanceHealth {
  paidCount: number
  paidValue: number
  pending: number
  failed: number
  chargebacks: number
  refundsAwaiting: number
  refundsAwaitingValue: number
  invoicesOverdue: number
  invoicesOverdueValue: number
  invoicesOutstanding: number
}

let _financeHealth: FinanceHealth | null = null
export function financeHealth(): FinanceHealth {
  if (_financeHealth) return _financeHealth
  const pds = payments()
  let paidCount = 0
  let paidValue = 0
  let pending = 0
  let failed = 0
  let chargebacks = 0
  for (let i = 0; i < pds.total; i++) {
    const p = pds.at(i)
    if (p._deleted) continue
    if (p.status === 'paid') {
      paidCount++
      paidValue += p.amount
    } else if (p.status === 'pending') pending++
    else if (p.status === 'failed') failed++
    else if (p.status === 'chargeback') chargebacks++
  }

  const rds = refunds()
  let refundsAwaiting = 0
  let refundsAwaitingValue = 0
  for (let i = 0; i < rds.total; i++) {
    const r = rds.at(i)
    if (r._deleted || r.status !== 'awaiting_approval') continue
    refundsAwaiting++
    refundsAwaitingValue += r.amount
  }

  const ids = invoices()
  let invoicesOverdue = 0
  let invoicesOverdueValue = 0
  let invoicesOutstanding = 0
  for (let i = 0; i < ids.total; i++) {
    const inv = ids.at(i)
    if (inv._deleted || inv.status === 'cancelled' || inv.status === 'credited') continue
    const left = inv.gross - inv.paidAmount
    invoicesOutstanding += left
    if (inv.status === 'overdue') {
      invoicesOverdue++
      invoicesOverdueValue += left
    }
  }

  _financeHealth = {
    paidCount,
    paidValue: Math.round(paidValue * 100) / 100,
    pending,
    failed,
    chargebacks,
    refundsAwaiting,
    refundsAwaitingValue: Math.round(refundsAwaitingValue * 100) / 100,
    invoicesOverdue,
    invoicesOverdueValue: Math.round(invoicesOverdueValue * 100) / 100,
    invoicesOutstanding: Math.round(invoicesOutstanding * 100) / 100,
  }
  return _financeHealth
}
