/**
 * P4 — one bulk console, many typed operations.
 *
 * `Bulk Domain Form`, `Bulk Abuse form`, `Bulk DNS form`, `Delete reseller`,
 * `Internal Transfer` and both license migration pages each become an entry
 * here, so they share input parsing, validation, dry run, approval, job
 * execution and the result report.
 */

import type { Tier } from './rbac'
import { domains, type Domain } from './mock/domains'
import { dnsZones, type DnsZone } from './mock/products'
import { licenses, type License } from './mock/products'
import { resellers, type Reseller } from './mock/resellers'
import { TASK_STATS } from './mock/ops'

export type InputMode = 'rows' | 'criteria'

export interface ExtraField {
  key: string
  label: string
  type: 'select' | 'number' | 'text' | 'boolean'
  options?: { value: string; label: string }[]
  default?: string | number | boolean
  hint?: string
  required?: boolean
}

export interface RowVerdict {
  input: string
  ok: boolean
  status: 'ok' | 'not_found' | 'rejected' | 'warning'
  message: string
  /** Dataset row id, when resolved. */
  rowId?: string
  datasetId?: string
  detail?: string
}

export interface BulkOperation {
  id: string
  label: string
  group: string
  /** The legacy ACP page this replaces — shown in the console for traceability. */
  replaces: string
  tier: Tier
  permission: string
  inputMode: InputMode
  inputLabel: string
  inputHint: string
  placeholder: string
  consequences: string[]
  reversible: string
  rollback: string | null
  extraFields?: ExtraField[]
  sample: () => string[]
  validate: (inputs: string[], values: Record<string, string>) => RowVerdict[]
  /** Applied per row on execute. Returns the patch, or null to soft-delete. */
  effect?: (verdict: RowVerdict, values: Record<string, string>) => { datasetId: string; rowId: string; patch: Record<string, unknown> | null } | null
  /** Criteria-mode operations report their scope instead of a row list. */
  criteriaSummary?: (values: Record<string, string>) => { count: number; description: string }
}

// ── lookup helpers: one scan, only matching rows retained ──────────────────

function indexDomains(names: Set<string>): Map<string, Domain> {
  const out = new Map<string, Domain>()
  const ds = domains()
  for (let i = 0; i < ds.total && out.size < names.size; i++) {
    const d = ds.at(i)
    if (names.has(d.name)) out.set(d.name, d)
  }
  return out
}

function indexZones(names: Set<string>): Map<string, DnsZone> {
  const out = new Map<string, DnsZone>()
  const ds = dnsZones()
  for (let i = 0; i < ds.total && out.size < names.size; i++) {
    const z = ds.at(i)
    if (names.has(z.name)) out.set(z.name, z)
  }
  return out
}

function indexLicenses(keys: Set<string>): Map<string, License> {
  const out = new Map<string, License>()
  const ds = licenses()
  for (let i = 0; i < ds.total && out.size < keys.size; i++) {
    const l = ds.at(i)
    if (keys.has(l.key)) out.set(l.key, l)
  }
  return out
}

function indexResellers(ids: Set<string>): Map<string, Reseller> {
  const out = new Map<string, Reseller>()
  const ds = resellers()
  for (let i = 0; i < ds.total && out.size < ids.size; i++) {
    const r = ds.at(i)
    if (ids.has(String(r.id))) out.set(String(r.id), r)
  }
  return out
}

function sampleDomains(n: number, filter?: (d: Domain) => boolean): string[] {
  const ds = domains()
  const out: string[] = []
  for (let i = 0; i < ds.total && out.length < n; i += 7) {
    const d = ds.at(i)
    if (d._deleted) continue
    if (filter && !filter(d)) continue
    out.push(d.name)
  }
  return out
}

// ── operations ────────────────────────────────────────────────────────────

export const BULK_OPERATIONS: BulkOperation[] = [
  {
    id: 'domain_lookup',
    label: 'Domain lookup',
    group: 'Domains',
    replaces: 'Domains → Bulk Domain Form (lookup)',
    tier: 'T1',
    permission: 'domain.bulk.lookup',
    inputMode: 'rows',
    inputLabel: 'Domain names',
    inputHint: 'One per line, or comma separated. Up to 50,000 rows.',
    placeholder: 'atlas42.com\nbeacon-willow.nl',
    consequences: ['Reads the current state of each domain. Nothing is changed.'],
    reversible: 'Read-only.',
    rollback: null,
    sample: () => sampleDomains(12),
    validate: (inputs) => {
      const found = indexDomains(new Set(inputs))
      return inputs.map((input) => {
        const d = found.get(input)
        return d
          ? { input, ok: true, status: 'ok' as const, message: `${d.status} · expires ${d.expiresAt}`, rowId: String(d.id), datasetId: 'domains', detail: d.company }
          : { input, ok: false, status: 'not_found' as const, message: 'Not found in the database' }
      })
    },
  },
  {
    id: 'domain_sync_dates',
    label: 'Sync domain dates with registry',
    group: 'Domains',
    replaces: 'Domains → Bulk Domain Form (sync dates)',
    tier: 'T2',
    permission: 'domain.bulk.sync',
    inputMode: 'rows',
    inputLabel: 'Domain names',
    inputHint: 'Each domain is re-read from its registry and the local dates are corrected.',
    placeholder: 'atlas42.com',
    consequences: [
      'Queries each registry for the authoritative expiry and creation date.',
      'Overwrites the local expiry date where it differs.',
      'Re-schedules expiry notifications affected by the new date.',
    ],
    reversible: 'Previous dates are kept in the job result report and can be re-applied.',
    rollback: 'Re-apply previous dates from the job result CSV.',
    sample: () => sampleDomains(10),
    validate: (inputs) => {
      const found = indexDomains(new Set(inputs))
      return inputs.map((input) => {
        const d = found.get(input)
        if (!d) return { input, ok: false, status: 'not_found' as const, message: 'Not found in the database' }
        if (d.status === 'deleted') return { input, ok: false, status: 'rejected' as const, message: 'Domain is deleted' }
        return { input, ok: true, status: 'ok' as const, message: `expiry ${d.expiresAt} → registry value`, rowId: String(d.id), datasetId: 'domains', detail: d.provider }
      })
    },
    effect: (v) => (v.rowId ? { datasetId: 'domains', rowId: v.rowId, patch: { datesSyncedAt: new Date().toISOString().slice(0, 10) } } : null),
  },
  {
    id: 'domain_delete',
    label: 'Delete domains from database',
    group: 'Domains',
    replaces: 'Domains → Bulk Domain Form (delete)',
    tier: 'T3',
    permission: 'domain.bulk.delete',
    inputMode: 'rows',
    inputLabel: 'Domain names',
    inputHint: 'Removes the local record only. The registration at the registry is untouched.',
    placeholder: 'atlas42.com',
    consequences: [
      'Deletes the local domain record, its DNS zone link and its notification schedule.',
      'The registration at the registry is NOT cancelled — the domain keeps resolving.',
      'Reseller-facing API calls for these domains start returning 404.',
    ],
    reversible: 'Recoverable from the job result report within 30 days by re-importing.',
    rollback: 'Re-import from the job result CSV via "Create in database".',
    sample: () => sampleDomains(8, (d) => d.status === 'expired'),
    validate: (inputs) => {
      const found = indexDomains(new Set(inputs))
      return inputs.map((input) => {
        const d = found.get(input)
        if (!d) return { input, ok: false, status: 'not_found' as const, message: 'Not found in the database' }
        if (d.status === 'active' && d.abuseReports === 0) {
          return { input, ok: true, status: 'warning' as const, message: 'Active domain — deleting the record leaves it unmanaged', rowId: String(d.id), datasetId: 'domains', detail: d.company }
        }
        return { input, ok: true, status: 'ok' as const, message: `${d.status} · ${d.company}`, rowId: String(d.id), datasetId: 'domains', detail: d.company }
      })
    },
    effect: (v) => (v.rowId ? { datasetId: 'domains', rowId: v.rowId, patch: null } : null),
  },
  {
    id: 'domain_abuse',
    label: 'Abuse enforcement',
    group: 'Domains',
    replaces: 'Domains → Bulk Abuse form (was "Bulk Abhuse form")',
    tier: 'T3',
    permission: 'domain.bulk.suspend',
    inputMode: 'rows',
    inputLabel: 'Domain names',
    inputHint: 'Enforcement is applied per domain and reported per row.',
    placeholder: 'phishing-example.com',
    consequences: [
      'Applies the selected enforcement action at the registry and in the local database.',
      'Suspension takes the domain offline immediately for every visitor.',
      'Notifies the reseller and the registrant on the abuse contact address.',
    ],
    reversible: 'clientHold and suspension are reversible by the same console. Deletion is not.',
    rollback: 'Run the same operation with "Remove clientHold".',
    extraFields: [
      {
        key: 'action',
        label: 'Enforcement action',
        type: 'select',
        required: true,
        default: 'client_hold',
        options: [
          { value: 'client_hold', label: 'Apply clientHold (reversible)' },
          { value: 'remove_hold', label: 'Remove clientHold' },
          { value: 'suspend', label: 'Suspend domain' },
          { value: 'delete', label: 'Delete domain at registry (irreversible)' },
        ],
      },
      { key: 'abuse_ref', label: 'Abuse case reference', type: 'text', required: true, hint: 'Registry or reporter case id, e.g. NL-2026-8841.' },
    ],
    sample: () => sampleDomains(10, (d) => d.abuseReports > 0 || d.status === 'active'),
    validate: (inputs, values) => {
      const found = indexDomains(new Set(inputs))
      const action = values.action ?? 'client_hold'
      return inputs.map((input) => {
        const d = found.get(input)
        if (!d) return { input, ok: false, status: 'not_found' as const, message: 'Not found in the database' }
        if (action === 'remove_hold' && d.status !== 'clientHold') {
          return { input, ok: false, status: 'rejected' as const, message: 'Not on clientHold — nothing to remove' }
        }
        if (action !== 'remove_hold' && d.status === 'clientHold') {
          return { input, ok: true, status: 'warning' as const, message: 'Already on clientHold', rowId: String(d.id), datasetId: 'domains', detail: d.company }
        }
        if (d.premium) {
          return { input, ok: true, status: 'warning' as const, message: 'Premium domain — commercial impact', rowId: String(d.id), datasetId: 'domains', detail: d.company }
        }
        return { input, ok: true, status: 'ok' as const, message: `${d.company} · ${d.abuseReports} abuse report(s)`, rowId: String(d.id), datasetId: 'domains', detail: d.company }
      })
    },
    effect: (v, values) => {
      if (!v.rowId) return null
      const action = values.action ?? 'client_hold'
      if (action === 'delete') return { datasetId: 'domains', rowId: v.rowId, patch: null }
      const patch =
        action === 'client_hold' ? { status: 'clientHold', suspended: true }
        : action === 'remove_hold' ? { status: 'active', suspended: false }
        : { status: 'quarantine', suspended: true }
      return { datasetId: 'domains', rowId: v.rowId, patch }
    },
  },
  {
    id: 'internal_transfer',
    label: 'Internal transfer between resellers',
    group: 'Domains',
    replaces: 'Domains → Internal Transfer',
    tier: 'T3',
    permission: 'domain.bulk.internal_transfer',
    inputMode: 'rows',
    inputLabel: 'Domain names',
    inputHint: 'Moves each domain to the target reseller. Registry ownership does not change.',
    placeholder: 'atlas42.com',
    consequences: [
      'Re-assigns each domain to the target reseller inside Openprovider.',
      'Billing for renewals moves to the target reseller immediately.',
      'The losing reseller loses API access to these domains.',
    ],
    reversible: 'Reversible by running the transfer back to the original reseller.',
    rollback: 'Run again with the original reseller as target, using the job result CSV.',
    extraFields: [
      { key: 'target_reseller', label: 'Target reseller ID', type: 'text', required: true, hint: 'Numeric reseller ID, e.g. 100341.' },
      { key: 'move_customers', label: 'Also move linked customer contacts', type: 'boolean', default: true },
    ],
    sample: () => sampleDomains(8),
    validate: (inputs, values) => {
      const found = indexDomains(new Set(inputs))
      const target = (values.target_reseller ?? '').trim()
      const targetReseller = target ? indexResellers(new Set([target])).get(target) : undefined
      return inputs.map((input) => {
        const d = found.get(input)
        if (!d) return { input, ok: false, status: 'not_found' as const, message: 'Not found in the database' }
        if (!targetReseller) return { input, ok: false, status: 'rejected' as const, message: 'Target reseller does not exist' }
        if (d.resellerId === targetReseller.id) return { input, ok: false, status: 'rejected' as const, message: 'Already owned by the target reseller' }
        if (d.status === 'pending_transfer') return { input, ok: false, status: 'rejected' as const, message: 'A registry transfer is already in progress' }
        return { input, ok: true, status: 'ok' as const, message: `${d.company} → ${targetReseller.company}`, rowId: String(d.id), datasetId: 'domains', detail: d.company }
      })
    },
    effect: (v, values) => {
      if (!v.rowId) return null
      const target = (values.target_reseller ?? '').trim()
      const r = indexResellers(new Set([target])).get(target)
      return { datasetId: 'domains', rowId: v.rowId, patch: { resellerId: Number(target), company: r?.company ?? 'Unknown' } }
    },
  },
  {
    id: 'dns_zone_delete',
    label: 'Delete DNS zones',
    group: 'DNS',
    replaces: 'DNS Zones → Bulk DNS form (previously had no guardrail at all)',
    tier: 'T3',
    permission: 'product.dns.bulk.delete',
    inputMode: 'rows',
    inputLabel: 'Zone names',
    inputHint: 'Deletes the zone and every record in it.',
    placeholder: 'atlas42.com',
    consequences: [
      'Deletes the zone and all of its records from the Openprovider DNS platform.',
      'Any domain still pointing at ns1/ns2.openprovider.nl stops resolving within the TTL.',
      'Mail delivery for the zone stops as soon as the MX records disappear.',
    ],
    reversible: 'The full zone file is captured in the job result report and can be re-imported.',
    rollback: 'Re-import the zone file from the job result report.',
    sample: () => {
      const ds = dnsZones()
      const out: string[] = []
      for (let i = 0; i < ds.total && out.length < 8; i += 601) {
        const z = ds.at(i)
        if (!z._deleted && z.orphaned) out.push(z.name)
      }
      if (out.length < 4) for (let i = 0; i < ds.total && out.length < 6; i += 997) out.push(ds.at(i).name)
      return out
    },
    validate: (inputs) => {
      const found = indexZones(new Set(inputs))
      const dom = indexDomains(new Set(inputs))
      return inputs.map((input) => {
        const z = found.get(input)
        if (!z) return { input, ok: false, status: 'not_found' as const, message: 'No such zone' }
        const linked = dom.get(input)
        if (linked && linked.status === 'active') {
          return { input, ok: true, status: 'warning' as const, message: `Active domain uses this zone (${linked.company})`, rowId: z.id, datasetId: 'dns_zones', detail: `${z.records} records` }
        }
        return { input, ok: true, status: 'ok' as const, message: `${z.records} records · ${z.orphaned ? 'orphaned' : 'linked'}`, rowId: z.id, datasetId: 'dns_zones', detail: z.company }
      })
    },
    effect: (v) => (v.rowId ? { datasetId: 'dns_zones', rowId: v.rowId, patch: null } : null),
  },
  {
    id: 'license_migration',
    label: 'License migration',
    group: 'Licenses',
    replaces: 'Licenses → Migration (new, Plesk) + Migration (import)',
    tier: 'T3',
    permission: 'product.license.migrate',
    inputMode: 'rows',
    inputLabel: 'License keys',
    inputHint: 'One key per line. Keys are migrated in chunks to respect vendor rate limits.',
    placeholder: 'PL1234-5678-9012-3456',
    consequences: [
      'Re-issues each key on the target vendor account.',
      'The old key is deactivated once the new key is confirmed active.',
      'Servers using the old key must be re-activated within 24 hours or hosting panels lock.',
    ],
    reversible: 'Partially — keys already deactivated at the vendor must be re-issued manually.',
    rollback: 'Vendor support ticket per key. Use the result report as the key mapping.',
    extraFields: [
      {
        key: 'source', label: 'Source', type: 'select', required: true, default: 'plesk',
        options: [
          { value: 'plesk', label: 'Plesk' },
          { value: 'virtuozzo', label: 'Virtuozzo' },
          { value: 'cpanel', label: 'cPanel' },
        ],
      },
      { key: 'target_account', label: 'Target vendor account', type: 'text', required: true, default: 'op-plesk-01' },
      { key: 'chunk_size', label: 'Chunk size', type: 'number', default: 250, hint: 'Rows per vendor API batch. Lower is slower but safer.' },
      { key: 'comment', label: 'Migration comment', type: 'text', required: true, hint: 'Stored on every migrated key.' },
    ],
    sample: () => {
      const ds = licenses()
      const out: string[] = []
      for (let i = 0; i < ds.total && out.length < 10; i += 1013) {
        const l = ds.at(i)
        if (l.status === 'active' && l.product === 'Plesk') out.push(l.key)
      }
      return out
    },
    validate: (inputs, values) => {
      const found = indexLicenses(new Set(inputs))
      const source = values.source ?? 'plesk'
      return inputs.map((input) => {
        const l = found.get(input)
        if (!l) return { input, ok: false, status: 'not_found' as const, message: 'Unknown license key' }
        if (l.status === 'terminated') return { input, ok: false, status: 'rejected' as const, message: 'Terminated licenses cannot be migrated' }
        if (l.product.toLowerCase() !== source) {
          return { input, ok: false, status: 'rejected' as const, message: `Key is ${l.product}, source is set to ${source}` }
        }
        return { input, ok: true, status: 'ok' as const, message: `${l.product} ${l.edition} · ${l.company}`, rowId: l.id, datasetId: 'licenses', detail: l.ipAddress }
      })
    },
    effect: (v, values) =>
      v.rowId
        ? { datasetId: 'licenses', rowId: v.rowId, patch: { migrationBatch: `MIG-2026-${(values.target_account ?? 'op').slice(-3)}`, vendorAccount: values.target_account ?? 'op-plesk-01' } }
        : null,
  },
  {
    id: 'reseller_delete',
    label: 'Delete reseller (GDPR erasure)',
    group: 'Resellers',
    replaces: 'Delete reseller',
    tier: 'T3',
    permission: 'reseller.delete',
    inputMode: 'rows',
    inputLabel: 'Reseller IDs',
    inputHint: 'Comma separated or one per line, as in the old form — but every ID is now resolved and shown before anything runs.',
    placeholder: '100341, 100678',
    consequences: [
      'Anonymises the admin, technical, billing, abuse and sales contacts of the reseller.',
      'Deletes every linked customer record.',
      'Deactivates all remaining contacts and revokes API credentials.',
      'The reseller can never sign in again; historical invoices are retained for tax purposes.',
    ],
    reversible: 'Irreversible. This is a GDPR erasure and is signed off as such (NFR-6).',
    rollback: null,
    extraFields: [
      { key: 'legal_basis', label: 'Legal basis', type: 'select', required: true, default: 'gdpr_erasure', options: [
        { value: 'gdpr_erasure', label: 'GDPR Art. 17 erasure request' },
        { value: 'fraud', label: 'Fraud / AUP termination' },
        { value: 'duplicate', label: 'Duplicate account cleanup' },
      ] },
      { key: 'legal_signoff', label: 'Legal sign-off reference', type: 'text', required: true, hint: 'Required by the GDPR erasure procedure.' },
    ],
    sample: () => {
      const ds = resellers()
      const out: string[] = []
      for (let i = 0; i < ds.total && out.length < 3; i += 397) {
        const r = ds.at(i)
        if (r.status === 'closed') out.push(String(r.id))
      }
      return out
    },
    validate: (inputs) => {
      const found = indexResellers(new Set(inputs))
      return inputs.map((input) => {
        const r = found.get(input)
        if (!r) return { input, ok: false, status: 'not_found' as const, message: 'No such reseller' }
        if (r.status === 'active' && r.domains > 0) {
          return { input, ok: true, status: 'warning' as const, message: `Active with ${r.domains.toLocaleString('en-GB')} domains — erasure will orphan them`, rowId: String(r.id), datasetId: 'resellers', detail: r.company }
        }
        if (r.balance > 0) {
          return { input, ok: true, status: 'warning' as const, message: `Positive balance of ${r.balance.toFixed(2)} ${r.currency} — refund first`, rowId: String(r.id), datasetId: 'resellers', detail: r.company }
        }
        return { input, ok: true, status: 'ok' as const, message: `${r.company} · ${r.status}`, rowId: String(r.id), datasetId: 'resellers', detail: r.company }
      })
    },
    effect: (v) =>
      v.rowId
        ? { datasetId: 'resellers', rowId: v.rowId, patch: { status: 'closed', company: `Anonymised reseller ${v.rowId}`, contactName: '[anonymised]', email: '[anonymised]', phone: '[anonymised]', vat: '[anonymised]' } }
        : null,
  },
  {
    id: 'task_purge',
    label: 'Purge outdated tasks',
    group: 'Platform',
    replaces: 'Task Manager cleanup (Q9 in the PRD)',
    tier: 'T3',
    permission: 'ops.task.purge',
    inputMode: 'criteria',
    inputLabel: 'Selection criteria',
    inputHint: 'Purge is defined by criteria, not by a pasted list.',
    placeholder: '',
    consequences: [
      'Deletes task rows older than the chosen age whose status is "outdated".',
      'Task history disappears from reseller-facing API responses.',
      'Frees the index that currently makes Task Manager slow to page.',
    ],
    reversible: 'Purged rows are written to cold storage for 90 days before hard deletion.',
    rollback: 'Restore from cold storage within 90 days (Engineering ticket).',
    extraFields: [
      { key: 'older_than_days', label: 'Older than (days)', type: 'number', default: 365, required: true },
      { key: 'statuses', label: 'Statuses', type: 'select', default: 'outdated', options: [
        { value: 'outdated', label: 'Outdated only' },
        { value: 'outdated_failed', label: 'Outdated + failed' },
      ] },
    ],
    sample: () => [],
    validate: () => [],
    criteriaSummary: (values) => {
      const days = Number(values.older_than_days ?? 365)
      const share = Math.max(0.05, Math.min(1, 1 - (days - 200) / 1600))
      const count = Math.round(TASK_STATS.outdated * share)
      return {
        count,
        description: `${count.toLocaleString('en-GB')} of ${TASK_STATS.outdated.toLocaleString('en-GB')} outdated tasks are older than ${days} days (total table: ${TASK_STATS.total.toLocaleString('en-GB')} rows).`,
      }
    },
  },
]

export function operationById(id: string): BulkOperation | undefined {
  return BULK_OPERATIONS.find((o) => o.id === id)
}
