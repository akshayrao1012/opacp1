import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle, FileText, Mail, Plus, RotateCcw, ShieldCheck, Terminal, Trash2, X,
} from 'lucide-react'
import { EntityDetail, RelatedList } from '../components/patterns/EntityDetail'
import { Module, TabBar, useTab } from '../components/patterns/Page'
import { DetailRow as Row, FieldGroup, YesNoValue } from '../components/patterns/DetailRow'
import { ActivityTimeline } from '../components/patterns/Activity'
import { DangerZone, T2Confirm, type DestructiveSpec } from '../components/patterns/Destructive'
import {
  Badge, Button, Callout, Card, CardHeader, CopyButton, Field, Input, SecretValue, Select,
  StatTile, StatusBadge, Switch, Textarea,
} from '../components/ui'
import { useCan, useStore } from '../lib/store'
import { cn, money, num, relative, shortDate } from '../lib/format'
import { findDomainByName, eppLookup, type Domain } from '../lib/mock/domains'
import {
  ABUSE_ACTIONS, ABUSE_CATEGORIES, ABUSE_NOTIFY_OPTIONS, domainAbuseReports, domainDetail,
  domainInvoiceLines, domainMutations, parseNameservers, type DomainDetailRecord,
} from '../lib/mock/domainDetail'
import { dnsRecords } from '../lib/mock/products'

export function DomainDetail() {
  const { name } = useParams()
  const navigate = useNavigate()
  const dataVersion = useStore((s) => s.dataVersion)
  const domain = useMemo(() => (name ? findDomainByName(decodeURIComponent(name)) : undefined), [name, dataVersion])
  const [tab, setTab] = useTab('overview')

  if (!domain) {
    return (
      <Module permissions={['domain.read']}>
        <Callout tone="warn" title="Domain not found">
          {name ? decodeURIComponent(name) : 'That domain'} is not in the database. Try the EPP lookup — it queries the registry directly.
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={() => navigate('/domains/domain-info')}>Open EPP lookup</Button>
          </div>
        </Callout>
      </Module>
    )
  }

  const detail = domainDetail(domain)
  const mutations = domainMutations(domain)
  const invoiceLines = domainInvoiceLines(domain)
  const abuse = domainAbuseReports(domain)
  const openLines = invoiceLines.filter((l) => l.status === 'open')

  return (
    <Module permissions={['domain.read']}>
      <EntityDetail
        backTo="/domains"
        backLabel="Back to search"
        identifier={domain.id}
        title={domain.name}
        status={
          <>
            <StatusBadge status={domain.status} />
            <Badge tone="neutral">{detail.statusCode}</Badge>
            {detail.action !== 'none' && (
              <Badge tone="info">
                {detail.action} · {detail.actionStatus}
              </Badge>
            )}
            {domain.premium && <Badge tone="purple">premium {money(domain.premiumPrice ?? 0)}</Badge>}
            {detail.isAbusive === 'yes' && <Badge tone="danger">abusive</Badge>}
            {detail.isBlocked === 'yes' && <Badge tone="danger">blocked</Badge>}
            {detail.isParked === 'yes' && <Badge tone="warn">parked</Badge>}
            {detail.isLockedTransferProhibited === 'yes' && <Badge tone="neutral">clientTransferProhibited</Badge>}
            {detail.dnssecEnabled === 'yes' && <Badge tone="info">DNSSEC</Badge>}
          </>
        }
        keyFacts={[
          {
            label: 'Reseller',
            value: (
              <Link to={`/customers/resellers/${domain.resellerId}`} className="text-brand-700 hover:underline">
                {domain.resellerId} — {domain.company}
              </Link>
            ),
          },
          { label: 'Domain owner', value: detail.ownerName },
          { label: 'Expires (registry)', value: shortDate(domain.expiresAt) },
          { label: 'Auto-renew', value: `${detail.autoRenewSetting} · reseller ${detail.resellerAutoRenew}` },
          { label: 'Current provider', value: <span className="text-2xs">{detail.currentProvider}</span> },
        ]}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(`/domains/domain-info?domain=${encodeURIComponent(domain.name)}`)}>
              <Terminal className="h-3.5 w-3.5" /> EPP info
            </Button>
            <Button variant="secondary" onClick={() => setTab('registry')}>Whois</Button>
            <Button variant="secondary" onClick={() => navigate('/domains')}>Back to search</Button>
          </>
        }
        alerts={
          <>
            {detail.privateComment && (
              <Callout tone="warn" icon={<FileText className="h-4 w-4" />} title="Private comment">
                {detail.privateComment}
              </Callout>
            )}
            {detail.actionStatus === 'foa1Expired' && (
              <Callout tone="danger" title="Transfer stalled — FOA 1 expired">
                The first Form of Authorisation was never answered. Restart FOA mail sending from the Registry tab, or send the auth code
                to the registrant.
              </Callout>
            )}
            {detail.isAbusive === 'yes' && (
              <Callout tone="danger" title={`${abuse.length} abuse report(s) on this domain`}>
                {detail.abuseNotifyCount} notification(s), {detail.abuseHoldCount} hold(s), {detail.abuseDeleteCount} deletion(s). Full
                history is on the Abuse tab.
              </Callout>
            )}
          </>
        }
        tabs={
          <TabBar
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'contacts', label: 'Contacts & verification' },
              { id: 'dns', label: 'Nameservers & DNS', count: parseNameservers(domain.nameservers).length },
              { id: 'registry', label: 'Registry & transfer' },
              { id: 'billing', label: 'Invoice lines', count: invoiceLines.length },
              { id: 'mutations', label: 'Mutations', count: mutations.length },
              { id: 'abuse', label: 'Abuse', count: abuse.length },
              { id: 'danger', label: 'Danger zone' },
            ]}
          />
        }
        resource="domain"
        resourceId={String(domain.id)}
        related={
          <>
            <RelatedList
              title="Domain info"
              items={[
                { key: 'whois', primary: 'Whois', secondary: 'Registry whois output', to: `/domains/domain-info?domain=${encodeURIComponent(domain.name)}` },
                { key: 'info', primary: 'infoDomain (EPP)', secondary: 'Live registry response', to: `/domains/domain-info?domain=${encodeURIComponent(domain.name)}` },
                { key: 'trust', primary: 'Trust / verification', secondary: detail.ownerVerificationStatus },
              ]}
            />
            <RelatedList
              title="Reseller"
              items={[
                { key: 'r', primary: domain.company, secondary: `ID ${domain.resellerId}`, to: `/customers/resellers/${domain.resellerId}` },
                { key: 'a', primary: "Reseller's abuse history", secondary: 'All reports for this reseller', to: `/domains?f=${encodeURIComponent(JSON.stringify({ resellerId: String(domain.resellerId), abuseReports: { min: 1 } }))}` },
              ]}
            />
          </>
        }
      >
        {tab === 'overview' && <OverviewTab domain={domain} detail={detail} />}
        {tab === 'contacts' && <ContactsTab domain={domain} detail={detail} />}
        {tab === 'dns' && <DnsTab domain={domain} detail={detail} />}
        {tab === 'registry' && <RegistryTab domain={domain} detail={detail} />}
        {tab === 'billing' && <BillingTab domain={domain} lines={invoiceLines} openLines={openLines.length} />}
        {tab === 'mutations' && <MutationsTab domain={domain} mutations={mutations} />}
        {tab === 'abuse' && <AbuseTab domain={domain} detail={detail} reports={abuse} />}
        {tab === 'danger' && <DangerTab domain={domain} detail={detail} />}
      </EntityDetail>
    </Module>
  )
}

// ─────────────────────────────────────────────────────── Overview

function OverviewTab({ domain, detail }: { domain: Domain; detail: DomainDetailRecord }) {
  const [edit, setEdit] = useState<{ label: string; permission: string; field: string; value: string; kind?: 'date' | 'text' | 'select'; options?: string[] } | null>(null)
  const [value, setValue] = useState('')
  const [confirm, setConfirm] = useState(false)
  const mutate = useStore((s) => s.mutate)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)

  const open = (e: NonNullable<typeof edit>) => {
    setEdit(e)
    setValue(e.value)
    setConfirm(true)
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <FieldGroup title="Identity">
          <Row label="Domain name" value={<span className="font-medium">{domain.name}</span>} />
          <Row label="Domain ID" value={<code className="font-mono text-2xs">{domain.id}</code>} />
          <Row label="TLD" value={`.${domain.tld}`} />
          <Row label="Controller class" value={detail.controllerClass} />
          <Row
            label="Current provider"
            value={<span className="text-2xs">{detail.currentProvider}</span>}
            permission="domain.write"
            onEdit={() => open({ label: 'Current provider', permission: 'domain.write', field: 'provider', value: domain.provider, kind: 'select', options: ['SIDN', 'DENIC', 'Verisign', 'EURid', 'AFNIC', 'Nominet', 'CentralNic', 'Identity Digital'] })}
          />
          <Row label="Registration period" value={`${domain.years} year(s)`} />
          <Row
            label="Private comment"
            value={detail.privateComment || <span className="text-ink-400">—</span>}
            permission="domain.write"
            onEdit={() => open({ label: 'Private comment', permission: 'domain.write', field: 'privateComment', value: detail.privateComment })}
          />
          <Row label="Deletion reasons" value={detail.deletionReasons || <span className="text-ink-400">—</span>} />
        </FieldGroup>

        <FieldGroup title="Dates">
          <Row label="Creation date" value={`${domain.createdAt} 15:22:00`} />
          <Row label="Order date" value={detail.orderDate} />
          <Row label="Active date" value={detail.activeDate ?? <span className="text-ink-400">not activated</span>} />
          <Row
            label="Renewal date"
            value={detail.renewalDate ?? <span className="text-ink-400">not set</span>}
            permission="domain.write"
            onEdit={() => open({ label: 'Renewal date', permission: 'domain.write', field: 'renewalDate', value: detail.renewalDate ?? '', kind: 'date' })}
          />
          <Row label="Expiration date at registry" value={detail.expirationAtRegistry} />
          <Row
            label="Expiration date"
            value={detail.expirationDate ?? <span className="text-ink-400">not set</span>}
            permission="domain.bulk.sync"
            hint="drives renewal billing"
            onEdit={() => open({ label: 'Expiration date', permission: 'domain.bulk.sync', field: 'expiresAt', value: domain.expiresAt, kind: 'date' })}
          />
          <Row
            label="Action status expiration date"
            value={detail.actionStatusExpiresAt ?? <span className="text-ink-400">—</span>}
            permission="domain.transfer.write"
            onEdit={() => open({ label: 'Action status expiration date', permission: 'domain.transfer.write', field: 'actionStatusExpiresAt', value: detail.actionStatusExpiresAt ?? '', kind: 'date' })}
          />
        </FieldGroup>

        <FieldGroup title="Status">
          <Row label="Status" value={<span className="flex items-center justify-end gap-1.5"><StatusBadge status={domain.status} /><code className="font-mono text-2xs text-ink-500">{detail.statusCode}</code></span>} />
          <Row label="Action" value={detail.action === 'none' ? <span className="text-ink-400">—</span> : detail.action} />
          <Row label="Action status" value={detail.actionStatus} />
          <Row label="Is deleted" value={<YesNoValue v={detail.isDeleted} />} />
          <Row label="Is blocked" value={<YesNoValue v={detail.isBlocked} />} permission="domain.write" onEdit={() => open({ label: 'Is blocked', permission: 'domain.write', field: 'isBlocked', value: detail.isBlocked, kind: 'select', options: ['yes', 'no'] })} />
          <Row label="Is abusive" value={<YesNoValue v={detail.isAbusive} />} hint="set from the Abuse tab" />
          <Row label="Is client hold enabled" value={<YesNoValue v={detail.isClientHoldEnabled} />} hint="T3 — danger zone" />
          <Row label="Is parked (contact verification failed)" value={<YesNoValue v={detail.isParked} />} permission="domain.write" onEdit={() => open({ label: 'Is parked', permission: 'domain.write', field: 'isParked', value: detail.isParked, kind: 'select', options: ['yes', 'no'] })} />
          <Row label="Is locked (clientTransferProhibited)" value={<YesNoValue v={detail.isLockedTransferProhibited} />} permission="domain.write" onEdit={() => open({ label: 'Transfer lock', permission: 'domain.write', field: 'transferLock', value: String(domain.transferLock), kind: 'select', options: ['true', 'false'] })} />
          <Row label="Uses domicile" value={<YesNoValue v={detail.usesDomicile} />} />
        </FieldGroup>

        <FieldGroup title="Settings">
          <Row
            label="Auto-renew settings"
            value={detail.autoRenewSetting}
            permission="domain.write"
            onEdit={() => open({ label: 'Auto-renew', permission: 'domain.write', field: 'autoRenew', value: detail.autoRenewSetting, kind: 'select', options: ['default', 'on', 'off'] })}
          />
          <Row label="Reseller auto-renew settings" value={detail.resellerAutoRenew} hint="inherited" />
          <Row label="Locked status" value={detail.lockedStatus} />
          <Row label="WPP enabled" value={detail.wppEnabled} hint="whois privacy" />
          <Row
            label="Consent for publishing"
            value={<YesNoValue v={detail.consentForPublishing} />}
            permission="domain.write"
            onEdit={() => open({ label: 'Consent for publishing', permission: 'domain.write', field: 'consentForPublishing', value: detail.consentForPublishing, kind: 'select', options: ['yes', 'no'] })}
          />
          <Row label="Premium" value={domain.premium ? money(domain.premiumPrice ?? 0) : <span className="text-ink-400">no</span>} />
          <Row label="Has active Sectigo zone" value={<YesNoValue v={detail.hasActiveSectigoZone} />} />
        </FieldGroup>
      </div>

      <Callout tone="info" title="Same fields, tiered actions">
        Every field from the legacy Domain-Details screen is here, grouped instead of stacked in two long columns. Each pencil is
        permission-checked, and anything that touches money, the registry or a compliance flag opens the T2 confirmation with a reason and
        a ticket reference rather than saving on click.
      </Callout>

      {edit && (
        <T2Confirm
          open={confirm}
          onClose={() => { setConfirm(false); setEdit(null) }}
          title={`Change ${edit.label}`}
          permission={edit.permission}
          cta="Apply change"
          description={
            <div className="space-y-3">
              <p>
                <code className="font-mono">{edit.field}</code> on {domain.name}: <code className="font-mono">{edit.value || 'empty'}</code> →{' '}
                <code className="font-mono">{value || 'empty'}</code>
              </p>
              <Field label={edit.label} required>
                {edit.kind === 'select' ? (
                  <Select value={value} onChange={(e) => setValue(e.target.value)}>
                    {edit.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </Select>
                ) : edit.kind === 'date' ? (
                  <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
                ) : (
                  <Textarea rows={2} value={value} onChange={(e) => setValue(e.target.value)} className="font-sans text-sm" />
                )}
              </Field>
            </div>
          }
          onConfirm={({ reason, ticket }) => {
            const patch: Record<string, unknown> =
              edit.field === 'autoRenew' ? { autoRenew: value !== 'off' }
              : edit.field === 'transferLock' ? { transferLock: value === 'true' }
              : { [edit.field]: value }
            mutate('domains', String(domain.id), patch)
            logAudit({ action: 'domain.write', resource: 'domain', resourceId: String(domain.id), before: { [edit.field]: edit.value }, after: { [edit.field]: value }, reason, ticket })
            addToast({ kind: 'success', title: `${edit.label} updated`, body: `${domain.name} — recorded with reason and ticket.` })
            setEdit(null)
          }}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────── Contacts & verification

function ContactsTab({ domain, detail }: { domain: Domain; detail: DomainDetailRecord }) {
  const [verifyOpen, setVerifyOpen] = useState(false)
  const canVerify = useCan('customer.kyc.decide')
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)

  const contacts = [
    { role: 'Owner (registrant)', handle: detail.ownerHandle, name: detail.ownerName },
    { role: 'Admin', handle: detail.adminHandle, name: detail.adminName },
    { role: 'Tech', handle: detail.techHandle, name: detail.techName },
    { role: 'Billing', handle: detail.adminHandle, name: detail.adminName },
  ]

  return (
    <>
      <Card>
        <CardHeader
          title="Contact info"
          subtitle="Owner, Admin and Tech were three bare links on the legacy screen"
          actions={
            <Button size="sm" variant="secondary" onClick={() => setVerifyOpen(true)} disabled={!canVerify}>
              <ShieldCheck className="h-3.5 w-3.5" /> Verify contact
            </Button>
          }
        />
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">Handle</th>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.role} className="border-t border-ink-100">
                <td className="px-4 py-2 font-medium text-ink-900">{c.role}</td>
                <td className="px-4 py-2 font-mono text-xs">{c.handle}</td>
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2">
                  <Link to={`/customers/contact-validation?q=${encodeURIComponent(c.handle)}`} className="text-2xs text-brand-700 hover:underline">
                    Open contact
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <FieldGroup title="Verification">
          <Row label="Is email verified" value={<YesNoValue v={detail.emailVerified} />} />
          <Row label="Is phone verified" value={<YesNoValue v={detail.phoneVerified} />} />
          <Row label="Is owner contact verified" value={<YesNoValue v={detail.ownerContactVerified} />} />
          <Row label="Owner verification status" value={detail.ownerVerificationStatus} />
          <Row label="Identity verification" value={<StatusBadge status={detail.identityVerificationState === 'not_started' ? 'not_started' : detail.identityVerificationState === 'in_progress' ? 'in_review' : detail.identityVerificationState} />} />
        </FieldGroup>

        <Card>
          <CardHeader title="Identity verification" subtitle="Starting verification emails the registrant and blocks changes until it resolves" />
          <div className="space-y-3 p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <StatTile label="Registrant email" value={detail.emailVerified === 'yes' ? 'verified' : 'unverified'} tone={detail.emailVerified === 'yes' ? 'success' : 'warn'} />
              <StatTile label="Registrant phone" value={detail.phoneVerified === 'yes' ? 'verified' : 'unverified'} tone={detail.phoneVerified === 'yes' ? 'success' : 'warn'} />
            </div>
            <Button
              variant="primary"
              disabled={!canVerify || detail.identityVerificationState === 'verified'}
              onClick={() => {
                logAudit({ action: 'customer.kyc.decide', resource: 'domain_contact', resourceId: detail.ownerHandle, after: { verificationStarted: true }, reason: 'Registrant verification started from domain detail', ticket: 'ZD-448500' })
                addToast({ kind: 'success', title: 'Verification started', body: `Email sent to the registrant of ${domain.name}. The case appears in Identity verification.` })
              }}
            >
              Start verification
            </Button>
            <p className="text-2xs text-ink-500">
              The case is created in <Link to="/customers/identity-verification" className="text-brand-700 hover:underline">Customers → Identity verification</Link>,
              where the decision is made with a reason — not on this page.
            </p>
            {detail.isParked === 'yes' && (
              <Callout tone="warn" title="Domain is parked">
                Contact verification failed, so the domain is parked. It resolves to the parking page until the registrant verifies.
              </Callout>
            )}
          </div>
        </Card>
      </div>

      <T2Confirm
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        title="Verify contact manually"
        permission="customer.kyc.decide"
        cta="Mark contact verified"
        description={<>Marks the registrant contact of {domain.name} as verified without waiting for the registrant to click through. Use only with evidence attached to the ticket.</>}
        onConfirm={({ reason, ticket }) => {
          logAudit({ action: 'customer.kyc.decide', resource: 'domain_contact', resourceId: detail.ownerHandle, after: { manuallyVerified: true }, reason, ticket })
          addToast({ kind: 'success', title: 'Contact marked verified' })
        }}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────── Nameservers & DNS

function DnsTab({ domain, detail }: { domain: Domain; detail: DomainDetailRecord }) {
  const rows = parseNameservers(domain.nameservers)
  const [draft, setDraft] = useState(rows)
  const [newNs, setNewNs] = useState({ name: '', ip: '', ipv6: '' })
  const [confirm, setConfirm] = useState(false)
  const [dnssecOpen, setDnssecOpen] = useState(false)
  const canWrite = useCan('domain.write')
  const mutate = useStore((s) => s.mutate)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)
  const dirty = JSON.stringify(draft) !== JSON.stringify(rows)

  return (
    <>
      <Card>
        <CardHeader
          title="Nameservers"
          subtitle={`Nameserver group: ${detail.nameserverGroup}`}
          actions={
            <div className="flex items-center gap-2">
              {dirty && <Badge tone="warn">unsaved changes</Badge>}
              <Button size="sm" variant="secondary" disabled={!dirty} onClick={() => setDraft(rows)}>
                <RotateCcw className="h-3.5 w-3.5" /> Revert
              </Button>
              <Button size="sm" variant="primary" disabled={!dirty || !canWrite} onClick={() => setConfirm(true)}>
                Update nameservers
              </Button>
            </div>
          }
        />
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">IP</th>
              <th className="px-4 py-2 text-left">IPv6</th>
              <th className="w-24 px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {draft.map((ns, i) => (
              <tr key={`${ns.name}-${i}`} className="border-t border-ink-100">
                <td className="px-4 py-2 font-mono text-xs">{ns.name}</td>
                <td className="px-4 py-2 font-mono text-xs text-ink-600">{ns.ip || <span className="text-ink-400">—</span>}</td>
                <td className="px-4 py-2 font-mono text-xs text-ink-600">{ns.ipv6 || <span className="text-ink-400">—</span>}</td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canWrite || draft.length <= 2}
                    title={draft.length <= 2 ? 'A domain needs at least two nameservers' : 'Remove'}
                    onClick={() => setDraft(draft.filter((_, x) => x !== i))}
                  >
                    <X className="h-3.5 w-3.5" /> Remove
                  </Button>
                </td>
              </tr>
            ))}
            <tr className="border-t border-ink-100 bg-ink-50/60">
              <td className="px-4 py-2">
                <Input value={newNs.name} onChange={(e) => setNewNs({ ...newNs, name: e.target.value })} placeholder="ns1.example.com" className="h-7 py-0 text-xs" />
              </td>
              <td className="px-4 py-2">
                <Input value={newNs.ip} onChange={(e) => setNewNs({ ...newNs, ip: e.target.value })} placeholder="optional glue" className="h-7 py-0 text-xs" />
              </td>
              <td className="px-4 py-2">
                <Input value={newNs.ipv6} onChange={(e) => setNewNs({ ...newNs, ipv6: e.target.value })} placeholder="optional glue" className="h-7 py-0 text-xs" />
              </td>
              <td className="px-4 py-2 text-right">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!canWrite || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(newNs.name)}
                  onClick={() => { setDraft([...draft, newNs]); setNewNs({ name: '', ip: '', ipv6: '' }) }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="border-t border-ink-100 px-4 py-2">
          <p className="text-2xs text-ink-500">
            Changes are staged and pushed to {domain.provider} in one registry call, so a half-applied delegation is not possible. The
            legacy screen applied each Remove immediately.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <FieldGroup title="DNS settings">
          <Row label="Nameserver group" value={detail.nameserverGroup} permission="domain.write" onEdit={() => undefined} />
          <Row label="DNSSEC enabled" value={<YesNoValue v={detail.dnssecEnabled} />} permission="domain.write" onEdit={() => setDnssecOpen(true)} />
          <Row label="Has active Sectigo zone" value={<YesNoValue v={detail.hasActiveSectigoZone} />} />
          <Row label="Zone provider" value={domain.nameservers.includes('openprovider') ? 'Openprovider DNS' : 'Reseller nameservers'} />
        </FieldGroup>

        <Card>
          <CardHeader title="Zone records" subtitle="First page of the zone file" actions={<Link to="/products/dns-zones" className="text-2xs text-brand-700 hover:underline">Open in DNS zones</Link>} />
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-right">TTL</th>
                <th className="px-4 py-2 text-left">Value</th>
              </tr>
            </thead>
            <tbody>
              {dnsRecords(domain.name).map((r, i) => (
                <tr key={i} className="border-t border-ink-100">
                  <td className="px-4 py-2 font-mono text-xs">{r.name}</td>
                  <td className="px-4 py-2"><Badge>{r.type}</Badge></td>
                  <td className="px-4 py-2 text-right tabular">{r.ttl}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-600">{r.prio ? `${r.prio} ` : ''}{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <T2Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Update nameservers"
        permission="domain.write"
        cta="Push to registry"
        description={
          <div className="space-y-2">
            <p>{domain.name} delegation changes to:</p>
            <ul className="ml-4 list-disc font-mono text-2xs">
              {draft.map((ns) => <li key={ns.name}>{ns.name}{ns.ip ? ` (${ns.ip})` : ''}</li>)}
            </ul>
            <p className="text-ink-500">
              Resolution follows the old delegation until caches expire — up to the parent TTL. Mail can be affected if the new
              nameservers do not carry the MX records.
            </p>
          </div>
        }
        onConfirm={({ reason, ticket }) => {
          const joined = draft.map((n) => n.name).join(', ')
          mutate('domains', String(domain.id), { nameservers: joined })
          logAudit({ action: 'domain.write', resource: 'domain_nameservers', resourceId: String(domain.id), before: { nameservers: domain.nameservers }, after: { nameservers: joined }, reason, ticket })
          addToast({ kind: 'success', title: 'Nameservers updated', body: 'Registry call queued — follow it in Task manager.' })
        }}
      />

      <T2Confirm
        open={dnssecOpen}
        onClose={() => setDnssecOpen(false)}
        title={detail.dnssecEnabled === 'yes' ? 'Disable DNSSEC' : 'Enable DNSSEC'}
        permission="domain.write"
        cta={detail.dnssecEnabled === 'yes' ? 'Disable DNSSEC' : 'Enable DNSSEC'}
        description={
          detail.dnssecEnabled === 'yes'
            ? <>Removing the DS record at the registry breaks validation for resolvers that cached it. Expect up to 24 hours of SERVFAIL for validating resolvers if the zone is still signed.</>
            : <>Publishes the DS record at {domain.provider}. If the zone is not correctly signed, validating resolvers will fail to resolve {domain.name} entirely.</>
        }
        onConfirm={({ reason, ticket }) => {
          mutate('domains', String(domain.id), { dnssec: detail.dnssecEnabled !== 'yes' })
          logAudit({ action: 'domain.write', resource: 'domain_dnssec', resourceId: String(domain.id), before: { dnssec: detail.dnssecEnabled }, after: { dnssec: detail.dnssecEnabled === 'yes' ? 'no' : 'yes' }, reason, ticket })
          addToast({ kind: 'success', title: 'DNSSEC updated' })
        }}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────── Registry & transfer

function RegistryTab({ domain, detail }: { domain: Domain; detail: DomainDetailRecord }) {
  const epp = useMemo(() => eppLookup(domain.name), [domain.name])
  const [raw, setRaw] = useState(false)
  const [foaEmail, setFoaEmail] = useState('')
  const [action, setAction] = useState<null | 'foa_restart' | 'authcode_sms' | 'authcode_email' | 'foa_manual'>(null)
  const canTransfer = useCan('domain.transfer.write')
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)

  const ACTION_COPY: Record<string, { title: string; body: ReactNode; cta: string }> = {
    foa_restart: {
      title: 'Restart FOA mail sending',
      body: <>Re-sends the Form of Authorisation to the registrant of {domain.name} and resets the FOA clock. The registrant sees a new approval email; the previous link stops working.</>,
      cta: 'Restart FOA',
    },
    authcode_sms: {
      title: 'Send auth code via SMS',
      body: <>Sends the transfer authorisation code to the registrant&apos;s verified phone number. The auth code is the credential that moves this domain away from Openprovider — treat it as a secret.</>,
      cta: 'Send SMS',
    },
    authcode_email: {
      title: 'Send auth code via email',
      body: <>Emails the transfer authorisation code to the registrant address on file. Anyone with this code can transfer {domain.name} to another registrar.</>,
      cta: 'Send email',
    },
    foa_manual: {
      title: 'Send FOA manually',
      body: <>Sends the Form of Authorisation to <code className="font-mono">{foaEmail || 'the address you enter'}</code> instead of the registrant address on file. Use only when the whois address is unreachable and the ticket documents why.</>,
      cta: 'Send FOA',
    },
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <FieldGroup title="Transfer state">
          <Row label="Action" value={detail.action === 'none' ? <span className="text-ink-400">—</span> : detail.action} />
          <Row label="Action status" value={<code className="font-mono text-2xs">{detail.actionStatus}</code>} />
          <Row label="Action status expires" value={detail.actionStatusExpiresAt ?? '—'} />
          <Row label="Transfer lock" value={<YesNoValue v={detail.isLockedTransferProhibited} />} />
          <Row label="Auth code valid" value={epp.authInfo ? 'yes' : 'no'} />
        </FieldGroup>

        <Card>
          <CardHeader title="Authorization code" subtitle="Masked by default — revealing it is audited (P8)" />
          <div className="space-y-3 p-4">
            <SecretValue
              value={detail.authorizationCode}
              masked={'•'.repeat(10)}
              canReveal={useCan('domain.epp.read')}
              onReveal={() =>
                logAudit({
                  action: 'domain.epp.read',
                  resource: 'domain_authinfo',
                  resourceId: String(domain.id),
                  reason: 'Auth code revealed from domain detail',
                })
              }
              hint="This code transfers the domain. The legacy screen had a plain Show button with no record of who pressed it."
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={!canTransfer} onClick={() => setAction('authcode_sms')}>
                Send auth-code via SMS
              </Button>
              <Button size="sm" variant="secondary" disabled={!canTransfer} onClick={() => setAction('authcode_email')}>
                <Mail className="h-3.5 w-3.5" /> Send auth-code via email
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Form of Authorisation (FOA)"
          subtitle={detail.actionStatus === 'foa1Expired' ? 'FOA 1 expired — the registrant never replied' : 'Transfer approval mail to the registrant'}
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Button variant="secondary" disabled={!canTransfer} onClick={() => setAction('foa_restart')}>
              Restart FOA mail sending
            </Button>
            <p className="text-2xs text-ink-500">Re-sends to the registrant address on file and resets the clock.</p>
          </div>
          <div className="space-y-2">
            <Field label="Manual FOA — send to a specific address" hint="The legacy hint said: you can get it from whois.">
              <Input value={foaEmail} onChange={(e) => setFoaEmail(e.target.value)} placeholder="owner@example.com" />
            </Field>
            <Button
              size="sm"
              variant="secondary"
              disabled={!canTransfer || !/^\S+@\S+\.\S+$/.test(foaEmail)}
              onClick={() => setAction('foa_manual')}
            >
              Send
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Registry response (EPP)"
          subtitle={`${epp.registry} · EPP ${epp.code} ${epp.message} · ${epp.latencyMs} ms`}
          actions={
            <div className="flex items-center gap-2">
              <Switch checked={raw} onChange={setRaw} label="Raw JSON" />
              <CopyButton value={epp.raw} label="Copy" />
            </div>
          }
        />
        {raw ? (
          <pre className="max-h-[420px] overflow-auto scrollbar-thin bg-ink-950 p-4 font-mono text-2xs leading-relaxed text-ink-100">
            {epp.raw.replace(epp.authInfo, '«masked»')}
          </pre>
        ) : (
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap gap-1.5">
              {epp.statuses.map((s) => (
                <Badge key={s} tone={s === 'clientHold' ? 'danger' : s === 'pendingTransfer' ? 'warn' : 'success'}>{s}</Badge>
              ))}
            </div>
            <dl className="grid gap-x-6 sm:grid-cols-2">
              <Row label="ROID" value={<code className="font-mono text-2xs">{epp.roid}</code>} />
              <Row label="Registry" value={epp.registry} />
              <Row label="Created" value={shortDate(epp.created)} />
              <Row label="Updated" value={shortDate(epp.updated)} />
              <Row label="Expires" value={shortDate(epp.expires)} />
              <Row label="Registrant" value={<code className="font-mono text-2xs">{epp.registrant}</code>} />
              <Row label="Admin" value={<code className="font-mono text-2xs">{epp.admin}</code>} />
              <Row label="Tech" value={<code className="font-mono text-2xs">{epp.tech}</code>} />
            </dl>
          </div>
        )}
      </Card>

      {action && (
        <T2Confirm
          open
          onClose={() => setAction(null)}
          title={ACTION_COPY[action].title}
          permission="domain.transfer.write"
          cta={ACTION_COPY[action].cta}
          description={ACTION_COPY[action].body}
          onConfirm={({ reason, ticket }) => {
            logAudit({ action: 'domain.transfer.write', resource: 'domain', resourceId: String(domain.id), after: { operation: action, recipient: action === 'foa_manual' ? foaEmail : 'registrant on file' }, reason, ticket })
            addToast({ kind: 'success', title: ACTION_COPY[action].title, body: 'Queued. Delivery shows up in the mail log.', href: `/system/mail?q=${encodeURIComponent(domain.name)}`, hrefLabel: 'Mail log' })
            setAction(null)
          }}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────── Invoice lines

function BillingTab({ domain, lines, openLines }: { domain: Domain; lines: ReturnType<typeof domainInvoiceLines>; openLines: number }) {
  const [action, setAction] = useState<null | 'complete' | 'cancel'>(null)
  const canWrite = useCan('finance.invoice.settle')
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)
  const totals = lines.reduce((acc, l) => ({ gross: acc.gross + l.gross, cost: acc.cost + l.cost, refund: acc.refund + l.refund }), { gross: 0, cost: 0, refund: 0 })

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Invoice lines" value={num(lines.length)} />
        <StatTile label="Open lines" value={num(openLines)} tone={openLines ? 'warn' : 'neutral'} />
        <StatTile label="Gross" value={money(totals.gross)} />
        <StatTile label="Margin" value={money(totals.gross - totals.cost)} tone="success" />
      </div>

      <Card>
        <CardHeader
          title="Invoice lines"
          subtitle="Billing for this domain across its lifetime"
          actions={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" disabled={!canWrite || !openLines} onClick={() => setAction('complete')}>
                Complete opened lines
              </Button>
              <Button size="sm" variant="secondary" disabled={!canWrite || !openLines} onClick={() => setAction('cancel')}>
                Cancel opened lines
              </Button>
            </div>
          }
        />
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2 text-left">ID</th>
                <th className="px-4 py-2 text-left">At</th>
                <th className="px-4 py-2 text-left">Trx</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Gross / cost</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-left">Curr</th>
                <th className="px-4 py-2 text-right">Refund</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className={cn('border-t border-ink-100', l.status === 'open' && 'bg-amber-50/50')}>
                  <td className="px-4 py-2 font-mono text-xs">{l.id}</td>
                  <td className="px-4 py-2 text-xs">{l.at}</td>
                  <td className="px-4 py-2"><Badge>{l.trx}</Badge></td>
                  <td className="px-4 py-2"><StatusBadge status={l.status === 'open' ? 'pending' : l.status} /></td>
                  <td className="px-4 py-2 text-right tabular">{l.gross.toFixed(2)} | {l.cost.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right tabular">{l.qty}</td>
                  <td className="px-4 py-2 text-xs">{l.currency}</td>
                  <td className="px-4 py-2 text-right tabular">{l.refund ? l.refund.toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-ink-100 px-4 py-2">
          <p className="text-2xs text-ink-500">
            Refunds are requested from <Link to="/finance/payments" className="text-brand-700 hover:underline">Finance → Payments</Link>, where
            the approver threshold applies. Completing or cancelling a line here only settles what was already invoiced.
          </p>
        </div>
      </Card>

      {action && (
        <T2Confirm
          open
          onClose={() => setAction(null)}
          title={action === 'complete' ? 'Complete opened invoice lines' : 'Cancel opened invoice lines'}
          permission="finance.invoice.settle"
          cta={action === 'complete' ? 'Complete lines' : 'Cancel lines'}
          description={
            action === 'complete'
              ? <>Settles {openLines} open line(s) for {domain.name} against the reseller balance. If the balance is insufficient the reseller goes negative.</>
              : <>Cancels {openLines} open line(s). The registry operation they paid for is not rolled back — cancel only when the operation itself failed.</>
          }
          onConfirm={({ reason, ticket }) => {
            logAudit({ action: 'finance.invoice.settle', resource: 'domain_invoice_lines', resourceId: String(domain.id), after: { operation: action, lines: openLines }, reason, ticket })
            addToast({ kind: 'success', title: action === 'complete' ? 'Lines completed' : 'Lines cancelled' })
            setAction(null)
          }}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────── Mutations

function MutationsTab({ domain, mutations }: { domain: Domain; mutations: ReturnType<typeof domainMutations> }) {
  const [q, setQ] = useState('')
  const filtered = mutations.filter((m) => !q || `${m.id} ${m.action} ${m.by} ${m.at}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <Card>
        <CardHeader
          title="Domain mutations"
          subtitle="Every change pushed to the registry for this domain"
          actions={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mutations" className="h-7 w-48 py-0 text-xs" />}
        />
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-ink-500">
            {mutations.length === 0 ? 'No data available in table — this domain has never been modified.' : 'No mutations match that search.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2 text-left">ID</th>
                <th className="px-4 py-2 text-left">Action</th>
                <th className="px-4 py-2 text-left">At</th>
                <th className="px-4 py-2 text-left">By</th>
                <th className="px-4 py-2 text-left">Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-t border-ink-100">
                  <td className="px-4 py-2 font-mono text-xs">{m.id}</td>
                  <td className="px-4 py-2"><code className="font-mono text-xs text-ink-800">{m.action}</code></td>
                  <td className="px-4 py-2 text-xs">{m.at}</td>
                  <td className="px-4 py-2 text-xs">{m.by}</td>
                  <td className="px-4 py-2 text-2xs text-ink-500">{m.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="border-t border-ink-100 px-4 py-2">
          <p className="text-2xs text-ink-500">
            Showing {filtered.length} of {mutations.length} entries. Mutations are registry operations; ACP actions with a reason and a
            ticket are in the activity timeline below.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="ACP activity" subtitle="Actor, role in effect, before/after, reason, ticket, IP (P7)" />
        <div className="p-3">
          <ActivityTimeline resource="domain" resourceId={String(domain.id)} limit={10} />
        </div>
      </Card>
    </>
  )
}

// ─────────────────────────────────────────────────────── Abuse

function AbuseTab({
  domain, detail, reports,
}: { domain: Domain; detail: DomainDetailRecord; reports: ReturnType<typeof domainAbuseReports> }) {
  const [category, setCategory] = useState(ABUSE_CATEGORIES[0])
  const [message, setMessage] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [notify, setNotify] = useState(ABUSE_NOTIFY_OPTIONS[0])
  const [action, setAction] = useState(ABUSE_ACTIONS[0])
  const [confirm, setConfirm] = useState(false)
  const canMark = useCan('domain.bulk.suspend')
  const hasBase = useStore((s) => s.hasBase('domain.bulk.suspend'))
  const mutate = useStore((s) => s.mutate)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Action count: notify" value={num(detail.abuseNotifyCount)} tone={detail.abuseNotifyCount ? 'warn' : 'neutral'} />
        <StatTile label="Action count: hold" value={num(detail.abuseHoldCount)} tone={detail.abuseHoldCount ? 'danger' : 'neutral'} />
        <StatTile label="Action count: delete" value={num(detail.abuseDeleteCount)} tone={detail.abuseDeleteCount ? 'danger' : 'neutral'} />
        <StatTile label="Is abusive" value={detail.isAbusive === 'yes' ? 'Yes' : 'No'} tone={detail.isAbusive === 'yes' ? 'danger' : 'success'} />
      </div>

      <Card>
        <CardHeader
          title="Mark domain as abusive"
          subtitle="One domain, one report. For a campaign, use the bulk console — it reports per row and needs one approval, not fifty"
          actions={<Link to={`/system/bulk?op=domain_abuse&input=${encodeURIComponent(domain.name)}`} className="text-2xs text-brand-700 hover:underline">Open in bulk console</Link>}
        />
        <div className="space-y-3 p-4">
          <Callout tone="info" title="What the registrant sees">
            The customer receives an email with the details below and the status appears in their control panel. If they do not respond
            within 5 days, the domain is deactivated automatically — that is what the default action means.
          </Callout>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category" required>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {ABUSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="ReplyTo" hint="Where registrant replies go. Defaults to the abuse desk.">
              <Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="abuse@openprovider.com" />
            </Field>
            <Field label="Notify domain holder options">
              <Select value={notify} onChange={(e) => setNotify(e.target.value)}>
                {ABUSE_NOTIFY_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </Select>
            </Field>
            <Field label="Action" hint='"Without any action" records the report without enforcing anything.'>
              <Select value={action} onChange={(e) => setAction(e.target.value)}>
                {ABUSE_ACTIONS.map((o) => <option key={o}>{o}</option>)}
              </Select>
            </Field>
            <Field
              label="Evidence and description"
              required
              className="sm:col-span-2"
              hint="Sent verbatim to the registrant and stored on the report. Include URLs and timestamps."
            >
              <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} className="font-sans text-sm" />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="danger" disabled={!canMark || message.trim().length < 20} onClick={() => setConfirm(true)}>
              <AlertTriangle className="h-3.5 w-3.5" /> Submit abuse report
            </Button>
            {!hasBase && <span className="text-2xs text-ink-500">Requires domain.bulk.suspend — Abuse &amp; Compliance holds it.</span>}
            {hasBase && !canMark && <span className="text-2xs text-amber-700">Tier 3 — request elevation from the danger zone or the top bar.</span>}
            {message.trim().length < 20 && <span className="text-2xs text-ink-500">Describe the evidence (20 characters minimum).</span>}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Domain abuse history"
          subtitle={reports.length ? `${reports.length} report(s)` : 'No abuse reports'}
          actions={
            <Link to={`/domains?f=${encodeURIComponent(JSON.stringify({ resellerId: String(domain.resellerId), abuseReports: { min: 1 } }))}`} className="text-2xs text-brand-700 hover:underline">
              Full reseller abuse history
            </Link>
          }
        />
        {reports.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-ink-500">No abuse reports for {domain.name}.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {reports.map((r) => (
              <li key={r.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-2xs text-ink-500">{r.id}</code>
                  <Badge tone="danger">{r.category}</Badge>
                  <StatusBadge status={r.status === 'awaiting_response' ? 'pending' : r.status === 'held' ? 'clientHold' : r.status === 'dismissed' ? 'cancelled' : 'sent'} />
                  <span className="text-2xs text-ink-500">{r.reporter} · {relative(r.at)}</span>
                </div>
                <p className="text-xs text-ink-700">{r.message}</p>
                <p className="text-2xs text-ink-500">Action taken: {r.action}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <T2Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Submit abuse report"
        permission="domain.bulk.suspend"
        cta="Submit and enforce"
        description={
          <div className="space-y-2">
            <p>{domain.name} — {category}. Notification: {notify}. Action: {action}.</p>
            <p className="text-ink-500">
              The report, your reason and the ticket reference are attached to the domain permanently and appear in the reseller&apos;s
              abuse history.
            </p>
          </div>
        }
        onConfirm={({ reason, ticket }) => {
          const enforcing = action.includes('clientHold')
          mutate('domains', String(domain.id), {
            abuseReports: domain.abuseReports + 1,
            ...(enforcing ? { status: 'clientHold', suspended: true } : {}),
          })
          logAudit({ action: 'domain.bulk.suspend', resource: 'domain_abuse', resourceId: String(domain.id), after: { category, action, notify, replyTo: replyTo || 'abuse@openprovider.com' }, reason, ticket })
          addToast({ kind: 'warn', title: 'Abuse report recorded', body: enforcing ? 'clientHold applied — reversible from the danger zone.' : 'Registrant notified; 5-day clock started.' })
          setMessage('')
          setConfirm(false)
        }}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────── Danger zone

function DangerTab({ domain, detail }: { domain: Domain; detail: DomainDetailRecord }) {
  const mutate = useStore((s) => s.mutate)
  const softDelete = useStore((s) => s.softDelete)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)
  const createJob = useStore((s) => s.createJob)
  const addApproval = useStore((s) => s.addApproval)
  const held = detail.isClientHoldEnabled === 'yes'

  const queue = (label: string, permission: string, reason: string, ticket: string, approver: string | null) => {
    const job = createJob({
      kind: 'domain_registry_op',
      label: `${label} — ${domain.name}`,
      status: approver ? 'awaiting_approval' : 'running',
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
    logAudit({ action: permission, resource: 'domain', resourceId: String(domain.id), after: { operation: label, job: job.id }, reason, ticket })
    if (approver) {
      addApproval({
        kind: 'bulk_job',
        label: `${label} — ${domain.name}`,
        requestedBy: 'you',
        requestedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        tier: 'T3',
        targetId: job.id,
        reason,
        ticket,
        detail: [`Single domain: ${domain.name} (${domain.company}).`, `Registry: ${domain.provider}.`, 'Nothing changes until this is approved.'],
      })
    }
    return job.id
  }

  const deleteSpecs: DestructiveSpec[] = [
    {
      title: 'Delete in OP + Registry',
      description: 'Cancels the registration at the registry and removes the local record.',
      consequences: [
        `${domain.name} is deleted at ${domain.provider} and enters the registry redemption/quarantine period.`,
        'The domain stops resolving; mail stops being delivered.',
        'The local record, DNS zone link and notification schedule are removed.',
        'Restoring afterwards costs the registry restore fee, if the TLD allows it at all.',
      ],
      reversible: 'Only during the redemption period, at the restore fee. After that, irreversible.',
      permission: 'domain.bulk.delete',
      tier: 'T3',
      confirmValue: domain.name,
      cta: 'Delete in OP + Registry',
      dryRun: () => ({
        summary: `${domain.name} would be deleted at ${domain.provider} and in the Openprovider database.`,
        willChange: [
          { label: 'Registry registrations cancelled', count: 1, tone: 'danger' },
          { label: 'Local domain records deleted', count: 1, tone: 'danger' },
          { label: 'DNS zones orphaned', count: 1, tone: 'warn' },
          { label: 'Notification schedules cancelled', count: 4, tone: 'warn' },
        ],
        notes: [`Quarantine at ${domain.provider} applies before the name is released.`],
      }),
      onExecute: ({ reason, ticket, approver }) => {
        const id = queue('Delete in OP + Registry', 'domain.bulk.delete', reason, ticket, approver)
        addToast({ kind: 'warn', title: 'Deletion queued for approval', body: `${id} — nothing has changed yet.`, href: '/system/jobs', hrefLabel: 'Job centre' })
      },
    },
    {
      title: 'Delete in OP + Registry (with glue records)',
      description: 'Same as above, and also removes host objects that use this domain as their parent.',
      consequences: [
        `${domain.name} is deleted at ${domain.provider}.`,
        'Glue records (host objects such as ns1.' + domain.name + ') are removed first.',
        'Any other domain delegated to those hosts loses its delegation and stops resolving.',
      ],
      reversible: 'Irreversible for the glue records; other domains must be re-delegated by hand.',
      permission: 'domain.bulk.delete',
      tier: 'T3',
      confirmValue: domain.name,
      cta: 'Delete with glue records',
      dryRun: () => ({
        summary: `${domain.name} plus its host objects would be deleted at ${domain.provider}.`,
        willChange: [
          { label: 'Registry registrations cancelled', count: 1, tone: 'danger' },
          { label: 'Glue / host objects removed', count: 2, tone: 'danger' },
          { label: 'Other domains losing delegation', count: 7, tone: 'danger' },
        ],
        notes: ['The seven affected domains belong to 3 resellers — they are listed in the job report.'],
      }),
      onExecute: ({ reason, ticket, approver }) => {
        const id = queue('Delete in OP + Registry (glue)', 'domain.bulk.delete', reason, ticket, approver)
        addToast({ kind: 'warn', title: 'Deletion queued for approval', body: `${id} — 7 delegations affected.`, href: '/system/jobs', hrefLabel: 'Job centre' })
      },
    },
    {
      title: 'Delete only in OP (no registry interaction)',
      description: 'Removes the local record only. The registration at the registry stays live.',
      consequences: [
        'The domain disappears from the ACP and from the reseller API.',
        `The registration at ${domain.provider} continues until it expires — the domain keeps resolving.`,
        'Renewal billing stops, so the domain will silently expire later.',
      ],
      reversible: 'Recoverable within 30 days by re-importing from the job report.',
      permission: 'domain.bulk.delete',
      tier: 'T3',
      confirmValue: domain.name,
      cta: 'Delete only in OP',
      dryRun: () => ({
        summary: `${domain.name} would be removed from the Openprovider database only.`,
        willChange: [
          { label: 'Local domain records deleted', count: 1, tone: 'danger' },
          { label: 'Registry registrations cancelled', count: 0 },
          { label: 'Notification schedules cancelled', count: 4, tone: 'warn' },
        ],
        notes: ['Use this for records that should never have been in the database — not to end a registration.'],
      }),
      onExecute: ({ reason, ticket, approver }) => {
        if (!approver) softDelete('domains', String(domain.id))
        const id = queue('Delete only in OP', 'domain.bulk.delete', reason, ticket, approver)
        addToast({ kind: 'warn', title: 'Local deletion queued', body: `${id} — registry untouched.`, href: '/system/jobs', hrefLabel: 'Job centre' })
      },
    },
  ]

  const restoreSpecs: DestructiveSpec[] = [
    {
      title: 'Restore in OP + Registry',
      description: 'Restores the domain from redemption at the registry and re-creates the local record.',
      consequences: [
        `${domain.provider} charges the restore fee, which is billed to ${domain.company}.`,
        'The domain starts resolving again with its previous delegation.',
        'A restore invoice line is created immediately.',
      ],
      reversible: 'The restore fee is not refundable.',
      permission: 'domain.write',
      tier: 'T2',
      confirmValue: domain.name,
      cta: 'Restore in OP + Registry',
      onExecute: ({ reason, ticket }) => {
        mutate('domains', String(domain.id), { status: 'active', suspended: false })
        logAudit({ action: 'domain.write', resource: 'domain', resourceId: String(domain.id), after: { restored: 'op+registry' }, reason, ticket })
        addToast({ kind: 'success', title: 'Restore queued', body: 'Registry call queued; restore fee invoiced to the reseller.' })
      },
    },
    {
      title: 'Restore only in OP (no registry interaction)',
      description: 'Re-creates the local record without touching the registry.',
      consequences: [
        'The local record reappears with its previous data.',
        'No registry call is made, so the registry state is assumed to be correct already.',
        'If the registry has in fact released the name, the record will be wrong until the next sync.',
      ],
      reversible: 'Fully reversible — delete only in OP again.',
      permission: 'domain.write',
      tier: 'T2',
      confirmValue: domain.name,
      cta: 'Restore only in OP',
      onExecute: ({ reason, ticket }) => {
        mutate('domains', String(domain.id), { status: 'active' })
        logAudit({ action: 'domain.write', resource: 'domain', resourceId: String(domain.id), after: { restored: 'op-only' }, reason, ticket })
        addToast({ kind: 'success', title: 'Local record restored', body: 'Run a date sync to confirm the registry agrees.' })
      },
    },
    {
      title: 'Restore only in OP (sync, update, complete invoice)',
      description: 'Local restore plus a registry sync, a contact/nameserver update push, and settlement of the open invoice lines.',
      consequences: [
        'Dates are re-read from the registry and overwritten locally.',
        'Contacts and nameservers are pushed to the registry.',
        'Open invoice lines for this domain are completed against the reseller balance.',
      ],
      reversible: 'The invoice settlement is not reversible from here — it needs a refund.',
      permission: 'finance.invoice.settle',
      tier: 'T2',
      confirmValue: domain.name,
      cta: 'Restore, sync and settle',
      onExecute: ({ reason, ticket }) => {
        mutate('domains', String(domain.id), { status: 'active' })
        logAudit({ action: 'finance.invoice.settle', resource: 'domain', resourceId: String(domain.id), after: { restored: 'op-sync-settle' }, reason, ticket })
        addToast({ kind: 'success', title: 'Restored, synced and settled', body: 'Three operations in one job — see the job report for each step.' })
      },
    },
  ]

  const holdSpec: DestructiveSpec = {
    title: held ? 'Remove clientHold' : 'Apply clientHold',
    description: held
      ? 'Lifts the registry hold so the domain resolves again.'
      : 'Takes the domain offline at the registry. Used for abuse enforcement.',
    consequences: held
      ? [`${domain.name} starts resolving again within the TTL.`, 'The abuse case stays on the record.']
      : [
          `${domain.name} stops resolving worldwide within the TTL.`,
          'Email to the domain stops being delivered.',
          'The reseller and the registrant are notified.',
        ],
    reversible: 'Fully reversible — clientHold can be applied and removed from here.',
    permission: 'domain.bulk.suspend',
    tier: 'T3',
    confirmValue: domain.name,
    cta: held ? 'Remove clientHold' : 'Apply clientHold',
    dryRun: () => ({
      summary: held
        ? `clientHold would be removed from ${domain.name} at ${domain.provider}.`
        : `clientHold would be applied to ${domain.name} at ${domain.provider}.`,
      willChange: [
        { label: held ? 'Domains reactivated' : 'Domains suspended', count: 1, tone: held ? 'neutral' : 'danger' },
        { label: 'DNS zones affected', count: 1, tone: 'warn' },
        { label: 'Mailboxes affected', count: 3, tone: 'warn' },
      ],
    }),
    onExecute: ({ reason, ticket }) => {
      mutate('domains', String(domain.id), held ? { status: 'active', suspended: false } : { status: 'clientHold', suspended: true })
      logAudit({ action: 'domain.bulk.suspend', resource: 'domain', resourceId: String(domain.id), before: { status: domain.status }, after: { status: held ? 'active' : 'clientHold' }, reason, ticket })
      addToast({ kind: 'warn', title: held ? 'clientHold removed' : 'clientHold applied', body: 'Reversible from this danger zone.' })
    },
  }

  return (
    <>
      <Callout tone="danger" icon={<Trash2 className="h-4 w-4" />} title="Twelve buttons became three grouped decisions">
        The legacy screen stacked six delete/restore variants next to read-only fields, each a single click with no dry run and no record
        of why. Same capabilities here — each one states its blast radius, requires a typed confirmation, and the destructive three need a
        second approver.
      </Callout>

      <DangerZone title="Suspension" items={[holdSpec]} />
      <DangerZone title="Deletion — Tier 3, second approver required" items={deleteSpecs} />
      <DangerZone title="Restore — Tier 2, chargeable" items={restoreSpecs} />

      <Card>
        <CardHeader title="Why the split" />
        <div className="space-y-2 p-4 text-xs leading-relaxed text-ink-600">
          <p>
            <strong className="text-ink-900">Deletion</strong> is Tier 3: it ends a registration or orphans a record, and the registry
            side is only reversible during redemption, at a fee. Dry run, typed confirmation and a second approver apply.
          </p>
          <p>
            <strong className="text-ink-900">Restore</strong> is Tier 2: it costs the reseller money, but it does not destroy anything.
            Reason and ticket are enough.
          </p>
          <p>
            <strong className="text-ink-900">clientHold</strong> is Tier 3 despite being reversible, because it takes a live domain
            offline for everyone immediately — the same control the bulk abuse operation uses.
          </p>
        </div>
      </Card>
    </>
  )
}
