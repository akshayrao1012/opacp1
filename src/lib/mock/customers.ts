import { Gen, personName, companyName, COUNTRIES } from '../rng'
import { materialized, type Dataset } from '../table'
import { patchable, type Deletable } from './patch'
import { resellers, resellerSample } from './resellers'

// ---------------------------------------------------------------------------
// Contact validation (UK) — Lock / Approve / Unlock become audited T2 actions
// ---------------------------------------------------------------------------

export type ContactValidationStatus = 'pending' | 'approved' | 'locked' | 'rejected'

export interface ContactValidation extends Deletable {
  id: string
  handle: string
  name: string
  company: string
  email: string
  country: string
  resellerId: number
  resellerCompany: string
  status: ContactValidationStatus
  domains: number
  submittedAt: string
  decidedAt: string | null
  decidedBy: string | null
  reason: string | null
  evidence: string[]
  registry: 'Nominet'
  emailVerified: boolean
  addressVerified: boolean
}

let _contacts: Dataset<ContactValidation> | null = null
export function contactValidations(): Dataset<ContactValidation> {
  if (!_contacts) {
    const rds = resellers()
    const rows: ContactValidation[] = Array.from({ length: 1140 }, (_, i) => {
      const g = new Gen('contactval', i)
      const r = rds.at((i * 19) % rds.total)
      const name = personName(g)
      const status = g.weighted<ContactValidationStatus>([
        ['pending', 34], ['approved', 46], ['locked', 14], ['rejected', 6],
      ])
      const decided = status !== 'pending'
      return {
        id: `CV-${400000 + i}`,
        handle: `OP-${g.int(100000, 999999)}`,
        name,
        company: g.bool(0.5) ? companyName(g) : '—',
        email: `${name.split(' ')[0].toLowerCase()}@${g.pick(['gmail.com', 'outlook.com', 'proton.me', 'company.co.uk'])}`,
        country: g.bool(0.8) ? 'GB' : g.pick(COUNTRIES)[0],
        resellerId: r.id,
        resellerCompany: r.company,
        status,
        domains: g.int(1, 64),
        submittedAt: g.dateTimeOffset(-2000, -2),
        decidedAt: decided ? g.dateTimeOffset(-1000, -1) : null,
        decidedBy: decided ? g.pick(['a.rao', 'compliance.bot', 'j.okafor', 'm.silva']) : null,
        reason: status === 'locked' ? g.pick(['Nominet data quality flag', 'Unreachable registrant', 'Address mismatch']) : status === 'rejected' ? g.pick(['Falsified evidence', 'Duplicate registrant']) : null,
        evidence: g.some(['passport.pdf', 'utility-bill.pdf', 'companies-house.pdf', 'bank-statement.pdf'], g.int(0, 2)),
        registry: 'Nominet',
        emailVerified: g.bool(0.7),
        addressVerified: g.bool(0.55),
      }
    })
    _contacts = patchable(materialized('contact_validations', rows), (r) => r.id)
  }
  return _contacts
}

// ---------------------------------------------------------------------------
// Identity verification (KYC/KYB) — 2,202 cases, queue-first
// ---------------------------------------------------------------------------

export type KycStatus = 'awaiting_documents' | 'in_review' | 'escalated' | 'approved' | 'failed'
export type KycType = 'KYC' | 'KYB'

export interface KycDocument {
  id: string
  kind: string
  filename: string
  uploadedAt: string
  pages: number
  checks: { label: string; result: 'pass' | 'warn' | 'fail' }[]
}

export interface KycCase extends Deletable {
  id: string
  type: KycType
  subject: string
  resellerId: number
  resellerCompany: string
  country: string
  status: KycStatus
  riskScore: number
  riskFlags: string[]
  submittedAt: string
  slaHoursLeft: number
  assignee: string
  documents: KycDocument[]
  decidedAt: string | null
  decidedBy: string | null
  reason: string | null
  provider: 'Onfido' | 'Sumsub' | 'Manual'
  attempts: number
}

const KYC_FLAGS = [
  'document-expired', 'face-mismatch', 'pep-hit', 'sanctions-screening', 'address-unverified',
  'ubo-incomplete', 'high-risk-jurisdiction', 'vat-not-found', 'duplicate-identity',
]

function makeDocs(g: Gen, type: KycType): KycDocument[] {
  const kinds = type === 'KYC'
    ? ['Passport', 'National ID', 'Proof of address', 'Selfie']
    : ['Certificate of incorporation', 'UBO declaration', 'VAT certificate', 'Bank statement']
  return g.some(kinds, g.int(1, kinds.length)).map((kind, i) => ({
    id: `DOC-${g.int(10000, 99999)}-${i}`,
    kind,
    filename: `${kind.toLowerCase().replace(/\s+/g, '-')}.pdf`,
    uploadedAt: g.dateTimeOffset(-400, -2),
    pages: g.int(1, 6),
    checks: [
      { label: 'Legibility', result: g.weighted([['pass', 80], ['warn', 15], ['fail', 5]]) },
      { label: 'Expiry', result: g.weighted([['pass', 85], ['fail', 15]]) },
      { label: 'Name match', result: g.weighted([['pass', 78], ['warn', 14], ['fail', 8]]) },
    ],
  }))
}

let _kyc: Dataset<KycCase> | null = null
export function kycCases(): Dataset<KycCase> {
  if (!_kyc) {
    const rds = resellers()
    const rows: KycCase[] = Array.from({ length: 2202 }, (_, i) => {
      const g = new Gen('kyc', i)
      const r = rds.at((i * 23) % rds.total)
      const type = g.weighted<KycType>([['KYC', 58], ['KYB', 42]])
      const status = g.weighted<KycStatus>([
        ['in_review', 26], ['awaiting_documents', 18], ['approved', 40], ['failed', 11], ['escalated', 5],
      ])
      const decided = status === 'approved' || status === 'failed'
      const risk = g.int(0, 100)
      return {
        id: `IV-${600000 + i}`,
        type,
        subject: type === 'KYC' ? personName(g) : companyName(g),
        resellerId: r.id,
        resellerCompany: r.company,
        country: g.pick(COUNTRIES)[0],
        status,
        riskScore: risk,
        riskFlags: risk > 55 ? g.some(KYC_FLAGS, g.int(1, 3)) : g.some(KYC_FLAGS, g.weighted([[0, 75], [1, 25]])),
        submittedAt: g.dateTimeOffset(-1400, -1),
        slaHoursLeft: decided ? 0 : g.int(-40, 72),
        assignee: g.weighted([['Unassigned', 45], ['j.okafor', 20], ['m.silva', 20], ['a.rao', 15]]),
        documents: makeDocs(g, type),
        decidedAt: decided ? g.dateTimeOffset(-900, -1) : null,
        decidedBy: decided ? g.pick(['j.okafor', 'm.silva', 'a.rao']) : null,
        reason: status === 'failed' ? g.pick(['Document tampering suspected', 'UBO structure unresolved', 'Sanctions match confirmed', 'No response within SLA']) : null,
        provider: g.weighted([['Sumsub', 45], ['Onfido', 35], ['Manual', 20]]),
        attempts: g.int(1, 4),
      }
    })
    _kyc = patchable(materialized('kyc_cases', rows), (r) => r.id)
  }
  return _kyc
}

export function kycQueueCounts() {
  const ds = kycCases()
  const counts: Record<string, number> = { in_review: 0, awaiting_documents: 0, escalated: 0, breached: 0 }
  for (let i = 0; i < ds.total; i++) {
    const c = ds.at(i)
    if (c._deleted) continue
    if (c.status in counts) counts[c.status]++
    if (c.slaHoursLeft < 0 && (c.status === 'in_review' || c.status === 'awaiting_documents')) counts.breached++
  }
  return counts
}

/** Customers of a reseller — used on the reseller detail related panel. */
export interface Customer {
  handle: string
  name: string
  company: string
  email: string
  country: string
  domains: number
  createdAt: string
}

export function customersOfReseller(resellerId: number, n = 8): Customer[] {
  return Array.from({ length: n }, (_, i) => {
    const g = new Gen('customer', resellerId, i)
    const name = personName(g)
    return {
      handle: `OP-${g.int(100000, 999999)}`,
      name,
      company: g.bool(0.55) ? companyName(g) : '—',
      email: `${name.split(' ')[0].toLowerCase()}@${g.pick(['gmail.com', 'company.eu', 'mail.de', 'outlook.com'])}`,
      country: g.pick(COUNTRIES)[0],
      domains: g.int(1, 220),
      createdAt: g.dayOffset(-1800, -5),
    }
  })
}

export const resellerPickerOptions = () =>
  resellerSample(60).map((r) => ({ value: String(r.id), label: `${r.id} — ${r.company}` }))
