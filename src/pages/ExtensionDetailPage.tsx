import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Globe, Route, Server, Tag } from 'lucide-react'
import { EntityDetail, RelatedList } from '../components/patterns/EntityDetail'
import { Module, TabBar, useTab } from '../components/patterns/Page'
import { DetailRow, FieldGroup, YesNoValue } from '../components/patterns/DetailRow'
import { T2Confirm } from '../components/patterns/Destructive'
import {
  Badge, Button, Callout, Card, CardHeader, Field, Input, Select, StatTile, StatusBadge, Textarea,
} from '../components/ui'
import { useStore } from '../lib/store'
import { money, num, relative } from '../lib/format'
import { extensionDetail, extensionRates, findExtension } from '../lib/mock/extensionDetail'

type EditKind = 'text' | 'number' | 'yesno' | 'select'

interface EditSpec {
  label: string
  field: string
  value: string
  kind: EditKind
  options?: string[]
  impact?: string
}

export function ExtensionDetail() {
  const { tld } = useParams()
  const navigate = useNavigate()
  const dataVersion = useStore((s) => s.dataVersion)
  const extension = useMemo(() => (tld ? findExtension(tld) : undefined), [tld, dataVersion])
  const [tab, setTab] = useTab('main')
  const [edit, setEdit] = useState<EditSpec | null>(null)
  const [value, setValue] = useState('')
  const mutate = useStore((s) => s.mutate)
  const logAudit = useStore((s) => s.logAudit)
  const addToast = useStore((s) => s.addToast)

  if (!extension) {
    return (
      <Module permissions={['catalog.extension.read']}>
        <Callout tone="warn" title="Extension not found">
          .{tld} is not in the extension catalogue.
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={() => navigate('/products/extensions')}>Back to extensions</Button>
          </div>
        </Callout>
      </Module>
    )
  }

  const d = extensionDetail(extension)
  const rates = extensionRates(extension)

  const open = (spec: EditSpec) => {
    setEdit(spec)
    setValue(spec.value)
  }

  return (
    <Module permissions={['catalog.extension.read']}>
      <EntityDetail
        backTo="/catalog/extensions"
        backLabel="Back to search"
        identifier={extension.id}
        title={`.${extension.tld}`}
        status={
          <>
            <StatusBadge status={extension.active ? 'active' : 'inactive'} />
            <Badge tone="neutral">{d.status}</Badge>
            <Badge tone={extension.category === 'newGTLD' ? 'purple' : 'info'}>{extension.category}</Badge>
            {d.premiumSupported === 'yes' && <Badge tone="purple">premium</Badge>}
            {d.registrantVerificationRequired === 'yes' && <Badge tone="warn">registrant verification</Badge>}
            {d.localPresenceRequired === 'yes' && <Badge tone="warn">local presence</Badge>}
          </>
        }
        keyFacts={[
          { label: 'Registry', value: extension.registry },
          { label: 'Domains under management', value: num(extension.domains) },
          { label: 'Create / renew', value: `${money(extension.createPrice)} / ${money(extension.renewPrice)}` },
          { label: 'Order period', value: `${d.minOrderPeriod}–${d.maxOrderPeriod} years` },
          { label: 'Route', value: <span className="text-2xs">{d.currentRouteId} · {d.currentRouteLabel}</span> },
        ]}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => navigate(`/domains?f=${encodeURIComponent(JSON.stringify({ tld: [extension.tld] }))}`)}
            >
              <Globe className="h-3.5 w-3.5" /> Domains on .{extension.tld}
            </Button>
            <Button variant="secondary" onClick={() => navigate('/products/extensions')}>Back to search</Button>
          </>
        }
        alerts={
          !extension.active ? (
            <Callout tone="warn" title={`.${extension.tld} is not active`}>
              New registrations are refused. Existing domains keep renewing unless the registry has withdrawn the TLD.
            </Callout>
          ) : undefined
        }
        tabs={
          <TabBar
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'main', label: 'Main info' },
              { id: 'transfer', label: 'Transfer, trade & quarantine' },
              { id: 'nameservers', label: 'Nameservers' },
              { id: 'pricing', label: 'Pricing', count: rates.length },
              { id: 'requirements', label: 'Registrant requirements' },
            ]}
          />
        }
        resource="extension"
        resourceId={extension.id}
        related={
          <>
            <RelatedList
              title="Registry"
              items={[
                { key: 'r', primary: extension.registry, secondary: `Route ${d.currentRouteId}`, to: `/domains/providers?q=${encodeURIComponent(extension.registry)}` },
                { key: 'p', primary: 'Promotions on this TLD', secondary: 'Catalog → Promotions', to: `/billing/promotions?q=${encodeURIComponent(extension.tld)}` },
                { key: 'd', primary: `${num(extension.domains)} domains`, secondary: 'Filtered domain list', to: `/domains?f=${encodeURIComponent(JSON.stringify({ tld: [extension.tld] }))}` },
              ]}
            />
            <Card>
              <CardHeader title="Tags (labels)" icon={<Tag className="h-4 w-4" />} />
              <div className="flex flex-wrap gap-1 p-4">
                {d.tags.map((t) => (
                  <Badge key={t} tone="neutral">{t}</Badge>
                ))}
              </div>
            </Card>
          </>
        }
      >
        {tab === 'main' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <FieldGroup title="Main info">
              <DetailRow label="Extension" value={<span className="font-medium">{extension.tld}</span>} />
              <DetailRow label="Tags (labels)" value={d.tags.join(', ')} />
              <DetailRow
                label="Active"
                value={<YesNoValue v={extension.active} />}
                permission="catalog.extension.write"
                onEdit={() => open({ label: 'Active', field: 'active', value: String(extension.active), kind: 'yesno', impact: 'Deactivating stops all new registrations and transfers in for this TLD, immediately, for every reseller.' })}
              />
              <DetailRow
                label="Show on public site"
                value={<YesNoValue v={d.showOnPublicSite} />}
                permission="catalog.extension.write"
                onEdit={() => open({ label: 'Show on public site', field: 'showOnPublicSite', value: d.showOnPublicSite, kind: 'yesno' })}
              />
              <DetailRow
                label="Minimal order period"
                value={d.minOrderPeriod}
                permission="catalog.extension.write"
                onEdit={() => open({ label: 'Minimal order period', field: 'minYears', value: String(d.minOrderPeriod), kind: 'number' })}
              />
              <DetailRow
                label="Maximum order period"
                value={d.maxOrderPeriod}
                permission="catalog.extension.write"
                onEdit={() => open({ label: 'Maximum order period', field: 'maxYears', value: String(d.maxOrderPeriod), kind: 'number' })}
              />
              <DetailRow
                label="Minimal renew period"
                value={d.minRenewPeriod ?? <span className="text-ink-400">—</span>}
                permission="catalog.extension.write"
                onEdit={() => open({ label: 'Minimal renew period', field: 'minRenewPeriod', value: String(d.minRenewPeriod ?? ''), kind: 'number' })}
              />
              <DetailRow
                label="Maximum renew period"
                value={d.maxRenewPeriod ?? <span className="text-ink-400">—</span>}
                permission="catalog.extension.write"
                onEdit={() => open({ label: 'Maximum renew period', field: 'maxRenewPeriod', value: String(d.maxRenewPeriod ?? ''), kind: 'number' })}
              />
              <DetailRow
                label="Minimum domain length"
                value={d.minDomainLength}
                permission="catalog.extension.write"
                onEdit={() => open({ label: 'Minimum domain length', field: 'minDomainLength', value: String(d.minDomainLength), kind: 'number' })}
              />
              <DetailRow label="Maximum domain length" value={d.maxDomainLength} />
              <DetailRow
                label="Status"
                value={<code className="font-mono text-2xs">{d.status}</code>}
                permission="catalog.extension.write"
                onEdit={() => open({ label: 'Status', field: 'status', value: d.status, kind: 'select', options: ['ACT', 'INA', 'DEP'] })}
              />
            </FieldGroup>

            <div className="space-y-4">
              <FieldGroup title="Routing" subtitle="Which registry connection handles this TLD">
                <DetailRow
                  label="Current RouteId"
                  value={<span>{d.currentRouteId} <span className="text-2xs text-ink-500">({d.currentRouteLabel})</span></span>}
                  permission="catalog.extension.write"
                  onEdit={() => open({ label: 'Current RouteId', field: 'currentRouteId', value: String(d.currentRouteId), kind: 'number', impact: 'Changing the route switches which registry connection every operation on this TLD uses. A wrong route fails every registration until it is corrected.' })}
                />
                <DetailRow
                  label="Final RouteId"
                  value={d.finalRouteId}
                  permission="catalog.extension.write"
                  onEdit={() => open({ label: 'Final RouteId', field: 'finalRouteId', value: String(d.finalRouteId), kind: 'number' })}
                />
                <DetailRow label="Registry" value={<Link to={`/domains/providers?q=${encodeURIComponent(extension.registry)}`} className="text-brand-700 hover:underline">{extension.registry}</Link>} />
              </FieldGroup>

              <FieldGroup title="Capabilities">
                <DetailRow label="New gTLD" value={<YesNoValue v={d.newGtld} />} />
                <DetailRow
                  label="Premium is supported"
                  value={<YesNoValue v={d.premiumSupported} />}
                  permission="catalog.extension.write"
                  onEdit={() => open({ label: 'Premium is supported', field: 'premiumSupported', value: d.premiumSupported, kind: 'yesno' })}
                />
                <DetailRow label="Billing handle is supported" value={<YesNoValue v={d.billingHandleSupported} />} />
                <DetailRow
                  label="WPP is supported"
                  value={<YesNoValue v={d.wppSupported} />}
                  hint="whois privacy"
                  permission="catalog.extension.write"
                  onEdit={() => open({ label: 'WPP is supported', field: 'wppSupported', value: d.wppSupported, kind: 'yesno' })}
                />
                <DetailRow label="Whois privacy by registry" value={<YesNoValue v={d.whoisPrivacyByRegistry} />} />
                <DetailRow label="IDN supported" value={<YesNoValue v={d.idnSupported} />} />
                <DetailRow label="DNSSEC supported" value={<YesNoValue v={d.dnssecSupported} />} />
                <DetailRow label="Restore supported" value={<YesNoValue v={d.restoreSupported} />} />
                <DetailRow label="Auto-renew supported" value={<YesNoValue v={d.autoRenewSupported} />} />
              </FieldGroup>
            </div>
          </div>
        )}

        {tab === 'transfer' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <FieldGroup title="Transfer, trade and modify">
              <DetailRow
                label="Transfer possible"
                value={<YesNoValue v={d.transferPossible} />}
                permission="catalog.extension.write"
                onEdit={() => open({ label: 'Transfer possible', field: 'transferPossible', value: d.transferPossible, kind: 'yesno' })}
              />
              <DetailRow label="Transfer cancel is supported" value={<YesNoValue v={d.transferCancelSupported} />} />
              <DetailRow label="Trade possible" value={<YesNoValue v={d.tradePossible} />} hint="registrant change via registry trade" />
              <DetailRow
                label="Modify owner allowed"
                value={<YesNoValue v={d.modifyOwnerAllowed} />}
                permission="catalog.extension.write"
                onEdit={() => open({ label: 'Modify owner allowed', field: 'modifyOwnerAllowed', value: d.modifyOwnerAllowed, kind: 'yesno' })}
              />
              <DetailRow
                label="Transfer billed as renew"
                value={<YesNoValue v={d.transferBilledAsRenew} />}
                hint="premium domains only"
              />
              <DetailRow label="Locking allowed" value={<YesNoValue v={d.lockingAllowed} />} />
              <DetailRow label="Transfer lock after registration" value={`${d.transferLockDays} days`} />
              <DetailRow
                label="FOA strategy"
                value={<code className="font-mono text-2xs">{d.foaStrategy}</code>}
                permission="catalog.extension.write"
                onEdit={() => open({ label: 'FOA strategy', field: 'foaStrategy', value: d.foaStrategy, kind: 'select', options: ['skip', 'registry', 'openprovider', 'both'], impact: 'Changes who sends the Form of Authorisation for every transfer on this TLD. Setting it to skip means no approval mail is sent at all.' })}
              />
            </FieldGroup>

            <div className="space-y-4">
              <FieldGroup title="Quarantine and renewal">
                <DetailRow
                  label="Renewal offset"
                  value={`${d.renewalOffsetDays} day${d.renewalOffsetDays === 1 ? '' : 's'}`}
                  permission="catalog.extension.write"
                  onEdit={() => open({ label: 'Renewal offset', field: 'renewalOffsetDays', value: String(d.renewalOffsetDays), kind: 'number' })}
                />
                <DetailRow
                  label="Soft quarantine (auto-renew grace) period"
                  value={`${d.softQuarantineDays} days`}
                  permission="catalog.extension.write"
                  onEdit={() => open({ label: 'Soft quarantine period', field: 'quarantineDays', value: String(d.softQuarantineDays), kind: 'number', impact: 'This is the window in which an expired domain can still be renewed at normal price. Shortening it means domains are released sooner.' })}
                />
                <DetailRow label="Hard quarantine (redemption) period" value={`${d.hardQuarantineDays} days`} />
              </FieldGroup>

              <div className="grid gap-3 sm:grid-cols-2">
                <StatTile label="Soft quarantine" value={`${d.softQuarantineDays} d`} hint="renewable at normal price" />
                <StatTile label="Hard quarantine" value={`${d.hardQuarantineDays} d`} hint="restore fee applies" tone={d.hardQuarantineDays ? 'warn' : 'neutral'} />
              </div>

              <Callout tone="info" title="Looking for local presence or country codes?">
                The legacy screen kept those in this column. They are registrant rules rather than transfer rules, so they live on the{' '}
                <button onClick={() => setTab('requirements')} className="font-medium text-brand-700 underline">Registrant requirements</button>{' '}
                tab — along with verification and trustee service.
              </Callout>

              <Callout tone="info" title="Why these two matter together">
                Soft quarantine is the grace window where a renewal still works at list price. Hard quarantine is redemption: recoverable,
                but only at the restore fee ({money(extension.restorePrice)}). When both are zero the name is released immediately after
                expiry.
              </Callout>
            </div>
          </div>
        )}

        {tab === 'nameservers' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <FieldGroup title="Nameservers" subtitle="What the registry requires at registration">
              <DetailRow
                label="Nameservers are required"
                value={<YesNoValue v={d.nameserversRequired} />}
                permission="catalog.extension.write"
                onEdit={() => open({ label: 'Nameservers are required', field: 'nameserversRequired', value: d.nameserversRequired, kind: 'yesno', impact: 'Requiring nameservers means a registration without delegation is refused by the registry rather than parked.' })}
              />
              <DetailRow label="Minimum nameservers" value={d.minNameservers} />
              <DetailRow label="Maximum nameservers" value={d.maxNameservers} />
              <DetailRow label="Glue records supported" value={<YesNoValue v={d.glueRecordsSupported} />} />
              <DetailRow label="IPv6 supported" value={<YesNoValue v={d.ipv6Supported} />} />
              <DetailRow label="Nameserver update supported" value={<YesNoValue v={d.nameserverUpdateSupported} />} />
              <DetailRow label="DNSSEC maximum keys" value={d.dnssecMaxKeys || <span className="text-ink-400">not supported</span>} />
            </FieldGroup>

            <Card>
              <CardHeader title="Effect on domains" subtitle="How these rules show up in operations" icon={<Server className="h-4 w-4" />} />
              <div className="space-y-2 p-4 text-xs leading-relaxed text-ink-600">
                <p>
                  {d.nameserversRequired === 'yes'
                    ? `A .${extension.tld} registration without at least ${d.minNameservers} nameservers is rejected at the registry, so the bulk console flags those rows before it runs.`
                    : `.${extension.tld} accepts registrations with no delegation, so domains can sit unparked until the reseller sets nameservers.`}
                </p>
                <p>
                  {d.glueRecordsSupported === 'yes'
                    ? 'Glue records are supported, which is why the domain danger zone has a separate "delete with glue records" operation for this TLD.'
                    : 'Glue records are not supported, so host objects are never created for this TLD.'}
                </p>
                <p>
                  {d.dnssecMaxKeys
                    ? `Up to ${d.dnssecMaxKeys} DS keys can be published.`
                    : 'DNSSEC is not available, so the DNSSEC toggle on domain detail is inert for this TLD.'}
                </p>
              </div>
            </Card>
          </div>
        )}

        {tab === 'pricing' && (
          <Card>
            <CardHeader
              title="Pricing"
              subtitle="Reseller price and our cost per action and period"
              actions={<Badge tone="neutral">{extension.currency}</Badge>}
            />
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Action</th>
                    <th className="px-4 py-2 text-left">Period</th>
                    <th className="px-4 py-2 text-right">Price</th>
                    <th className="px-4 py-2 text-right">Cost</th>
                    <th className="px-4 py-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((r, i) => (
                    <tr key={i} className="border-t border-ink-100">
                      <td className="px-4 py-2 font-medium text-ink-900">{r.action}</td>
                      <td className="px-4 py-2 text-xs">{r.period}</td>
                      <td className="px-4 py-2 text-right tabular">{money(r.price, r.currency)}</td>
                      <td className="px-4 py-2 text-right tabular text-ink-600">{money(r.cost, r.currency)}</td>
                      <td className="px-4 py-2 text-right tabular">
                        <span className={r.price - r.cost < 0 ? 'font-medium text-brand-700' : 'text-emerald-700'}>
                          {money(r.price - r.cost, r.currency)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-ink-100 px-4 py-2">
              <p className="text-2xs text-ink-500">
                Price changes are T2: they affect every reseller from the next order. Promotions on top of these prices live in{' '}
                <Link to={`/billing/promotions?q=${encodeURIComponent(extension.tld)}`} className="text-brand-700 hover:underline">Catalog → Promotions</Link>.
              </p>
            </div>
          </Card>
        )}

        {tab === 'requirements' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <FieldGroup title="Registrant requirements">
              <DetailRow label="Local presence required" value={<YesNoValue v={d.localPresenceRequired} />} />
              <DetailRow
                label="Country codes allowed for owner"
                value={d.countryCodesAllowedForOwner.length ? d.countryCodesAllowedForOwner.join(', ') : <span className="text-ink-400">— any</span>}
                permission="catalog.extension.write"
                onEdit={() => open({ label: 'Country codes allowed for owner', field: 'countryCodes', value: d.countryCodesAllowedForOwner.join(', '), kind: 'text', impact: 'Restricting country codes causes the registry to reject registrations from other countries. Existing domains are unaffected.' })}
              />
              <DetailRow label="Registrant verification required" value={<YesNoValue v={d.registrantVerificationRequired} />} />
              <DetailRow
                label="Verification deadline"
                value={d.registrantVerificationDeadlineDays ? `${d.registrantVerificationDeadlineDays} days` : <span className="text-ink-400">—</span>}
                hint="before the domain is parked"
              />
              <DetailRow label="Trustee service available" value={<YesNoValue v={d.trusteeServiceAvailable} />} />
              <DetailRow label="Registry lock available" value={<YesNoValue v={d.registryLockAvailable} />} />
            </FieldGroup>

            <Card>
              <CardHeader title="What this means for support" icon={<Route className="h-4 w-4" />} />
              <div className="space-y-2 p-4 text-xs leading-relaxed text-ink-600">
                {d.localPresenceRequired === 'yes' ? (
                  <p>
                    Registrants outside the allowed countries need the trustee service
                    {d.trusteeServiceAvailable === 'yes' ? ', which is available for this TLD.' : ', which is not available — those registrations cannot be completed.'}
                  </p>
                ) : (
                  <p>No local presence requirement, so any registrant country is accepted.</p>
                )}
                {d.registrantVerificationRequired === 'yes' ? (
                  <p>
                    Registrant verification is mandatory: the domain is parked after {d.registrantVerificationDeadlineDays} days without a
                    reply. Those cases show up in{' '}
                    <Link to="/customers/identity-verification" className="text-brand-700 hover:underline">Identity verification</Link> and as
                    "Is parked" on domain detail.
                  </p>
                ) : (
                  <p>No registrant verification, so the "Is parked" flag on domain detail is never set by this registry.</p>
                )}
              </div>
            </Card>
          </div>
        )}
      </EntityDetail>

      {edit && (
        <T2Confirm
          open
          onClose={() => setEdit(null)}
          title={`Change ${edit.label} for .${extension.tld}`}
          permission="catalog.extension.write"
          cta="Apply change"
          description={
            <div className="space-y-3">
              <p>
                <code className="font-mono">{edit.field}</code>: <code className="font-mono">{edit.value || 'empty'}</code> →{' '}
                <code className="font-mono">{value || 'empty'}</code>
              </p>
              {edit.impact && <p className="text-ink-700">{edit.impact}</p>}
              <p className="text-ink-500">
                Catalogue changes apply to all {num(extension.domains)} existing .{extension.tld} domains and every reseller from the next
                order.
              </p>
              <Field label={edit.label} required>
                {edit.kind === 'yesno' ? (
                  <Select value={value} onChange={(e) => setValue(e.target.value)}>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </Select>
                ) : edit.kind === 'select' ? (
                  <Select value={value} onChange={(e) => setValue(e.target.value)}>
                    {edit.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </Select>
                ) : edit.kind === 'number' ? (
                  <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
                ) : (
                  <Textarea rows={2} value={value} onChange={(e) => setValue(e.target.value)} className="font-sans text-sm" />
                )}
              </Field>
            </div>
          }
          onConfirm={({ reason, ticket }) => {
            const patch: Record<string, unknown> =
              edit.field === 'active' ? { active: value === 'true' || value === 'yes' }
              : edit.kind === 'number' ? { [edit.field]: Number(value) }
              : { [edit.field]: value }
            mutate('extensions', extension.id, patch)
            logAudit({
              action: 'catalog.extension.write',
              resource: 'extension',
              resourceId: extension.id,
              before: { [edit.field]: edit.value },
              after: { [edit.field]: value },
              reason,
              ticket,
            })
            addToast({ kind: 'success', title: `.${extension.tld} — ${edit.label} updated`, body: `Applied ${relative(new Date().toISOString())}; recorded with reason and ticket.` })
            setEdit(null)
          }}
        />
      )}
    </Module>
  )
}
