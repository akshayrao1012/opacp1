import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell, NotFound } from './components/shell/AppShell'
import { Home } from './pages/Home'
import {
  ResellerMemberships, ResellerNotificationSettings, ResellerProviderMappings, ResellerStatistics,
  ResellersNewPending, ResellersOverview, ResellerDetail,
} from './pages/Resellers'
import { ContactValidationPage, IdentityVerificationPage } from './pages/Customers'
import {
  DomainCreateInDatabase, DomainInfo, DomainNotificationsPage, DomainTransfers, DomainsOverview,
} from './pages/Domains'
import { DomainDetail } from './pages/DomainDetailPage'
import { DnsZonesPage, SpamExpertsPage, TrademarksPage, VirtualProductsPage } from './pages/Products'
import { InvoicesPage, PaymentsPage, RefundsPage } from './pages/Finance'
import { ExtensionsPage, PromocodesPage, PromotionsPage } from './pages/Catalog'
import { ExtensionDetail } from './pages/ExtensionDetailPage'
import { CustomSettingsPage, MailPage, RateLimitsPage, TasksPage } from './pages/Ops'
import { BulkConsole } from './pages/BulkConsole'
import { AuditPage, JobsPage, RolesPage, UsersPage } from './pages/Admin'
import { BannedKeywordsPage, BatchCrackerPage, BruteforcePage, IpBlacklistPage } from './pages/Risk'
import {
  EvReport, NegativeBalanceReport, PostpaidDebtReport, ProviderStatisticsReport, SalesDashboard,
  SupportDashboard,
} from './pages/Reports'
import { QueryRunnerPage } from './pages/QueryRunner'
import { WppSubscriptionsPage } from './pages/Billing'
import {
  BillingPayments, DomainProvidersModule, LicensesModule, MembershipPlansPage, PremiumDomainsPage,
  PromocodesModule, SslModule,
} from './pages/Composites'
import { CoveragePage } from './pages/Coverage'
import { FeedbackPage } from './pages/Feedback'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />

          {/* ── Customers ─────────────────────────────────────────────── */}
          <Route path="/customers/resellers" element={<ResellersOverview />} />
          <Route path="/customers/resellers/new-pending" element={<ResellersNewPending />} />
          <Route path="/customers/resellers/notification-settings" element={<ResellerNotificationSettings />} />
          <Route path="/customers/resellers/provider-mappings" element={<ResellerProviderMappings />} />
          <Route path="/customers/resellers/statistics" element={<ResellerStatistics />} />
          <Route path="/customers/resellers/:id" element={<ResellerDetail />} />
          <Route path="/customers/contact-validation" element={<ContactValidationPage />} />
          <Route path="/customers/identity-verification" element={<IdentityVerificationPage />} />
          <Route path="/customers/membership-plans" element={<MembershipPlansPage />} />
          <Route path="/customers/memberships" element={<ResellerMemberships />} />

          {/* ── Domains ───────────────────────────────────────────────── */}
          <Route path="/domains" element={<DomainsOverview />} />
          <Route path="/domains/premium" element={<PremiumDomainsPage />} />
          <Route path="/domains/transfers" element={<DomainTransfers />} />
          <Route path="/domains/notifications" element={<DomainNotificationsPage />} />
          <Route path="/domains/trademarks" element={<TrademarksPage />} />
          <Route path="/domains/providers" element={<DomainProvidersModule />} />
          <Route path="/domains/domain-info" element={<DomainInfo />} />
          <Route path="/domains/create-in-database" element={<DomainCreateInDatabase />} />
          <Route path="/domains/bulk" element={<BulkConsole />} />
          <Route path="/domains/:name" element={<DomainDetail />} />

          {/* ── Products & Services ───────────────────────────────────── */}
          <Route path="/products/dns-zones" element={<DnsZonesPage />} />
          <Route path="/products/bulk-dns" element={<BulkConsole />} />
          <Route path="/products/ssl" element={<SslModule />} />
          <Route path="/products/licenses" element={<LicensesModule />} />
          <Route path="/products/spamexperts" element={<SpamExpertsPage />} />
          <Route path="/products/extensions" element={<ExtensionsPage />} />
          <Route path="/products/extensions/:tld" element={<ExtensionDetail />} />
          <Route path="/products/virtual-products" element={<VirtualProductsPage />} />

          {/* ── Billing ───────────────────────────────────────────────── */}
          <Route path="/billing/payments" element={<BillingPayments />} />
          <Route path="/billing/payments/list" element={<PaymentsPage />} />
          <Route path="/billing/refunds" element={<RefundsPage />} />
          <Route path="/billing/invoices" element={<InvoicesPage />} />
          <Route path="/billing/promotions" element={<PromotionsPage />} />
          <Route path="/billing/promocodes" element={<PromocodesModule />} />
          <Route path="/billing/promocodes/all" element={<PromocodesPage />} />
          <Route path="/billing/subscriptions" element={<WppSubscriptionsPage />} />

          {/* ── Risk & Abuse ──────────────────────────────────────────── */}
          <Route path="/risk/bruteforce" element={<BruteforcePage />} />
          <Route path="/risk/ip-blacklist" element={<IpBlacklistPage />} />
          <Route path="/risk/banned-keywords" element={<BannedKeywordsPage />} />
          <Route path="/risk/bulk-abuse" element={<BulkConsole />} />
          <Route path="/risk/batch-cracker" element={<BatchCrackerPage />} />

          {/* ── Reports ───────────────────────────────────────────────── */}
          <Route path="/reports/support" element={<SupportDashboard />} />
          <Route path="/reports/sales" element={<SalesDashboard />} />
          <Route path="/reports/postpaid-debt" element={<PostpaidDebtReport />} />
          <Route path="/reports/negative-balance" element={<NegativeBalanceReport />} />
          <Route path="/reports/provider-statistics" element={<ProviderStatisticsReport />} />
          <Route path="/reports/ev" element={<EvReport />} />

          {/* ── System (admin-only) ───────────────────────────────────── */}
          <Route path="/system/tasks" element={<TasksPage />} />
          <Route path="/system/mail" element={<MailPage />} />
          <Route path="/system/custom-settings" element={<CustomSettingsPage />} />
          <Route path="/system/query-runner" element={<QueryRunnerPage />} />
          <Route path="/system/roles" element={<RolesPage />} />
          <Route path="/system/users" element={<UsersPage />} />
          <Route path="/system/audit" element={<AuditPage />} />
          <Route path="/system/jobs" element={<JobsPage />} />
          <Route path="/system/feedback" element={<FeedbackPage />} />
          <Route path="/system/bulk" element={<BulkConsole />} />
          <Route path="/system/rate-limits" element={<RateLimitsPage />} />

          <Route path="/coverage" element={<CoveragePage />} />

          {/* ── Redirects from the previous IA, so shared links keep working ── */}
          <Route path="/resellers" element={<Navigate to="/customers/resellers" replace />} />
          <Route path="/resellers/new-pending" element={<Navigate to="/customers/resellers/new-pending" replace />} />
          <Route path="/resellers/notification-settings" element={<Navigate to="/customers/resellers/notification-settings" replace />} />
          <Route path="/resellers/provider-mappings" element={<Navigate to="/domains/providers?tab=reseller-mapping" replace />} />
          <Route path="/resellers/memberships" element={<Navigate to="/customers/membership-plans" replace />} />
          <Route path="/resellers/statistics" element={<Navigate to="/customers/resellers/statistics" replace />} />
          <Route path="/resellers/disabled-modify-domain" element={<Navigate to="/customers/resellers" replace />} />
          <Route path="/resellers/:id" element={<ResellerRedirect />} />
          <Route path="/products/trademarks" element={<Navigate to="/domains/trademarks" replace />} />
          <Route path="/catalog/extensions" element={<Navigate to="/products/extensions" replace />} />
          <Route path="/catalog/extensions/:tld" element={<ExtensionRedirect />} />
          <Route path="/catalog/promotions" element={<Navigate to="/billing/promotions" replace />} />
          <Route path="/catalog/promocodes" element={<Navigate to="/billing/promocodes" replace />} />
          <Route path="/catalog/domain-providers" element={<Navigate to="/domains/providers" replace />} />
          <Route path="/finance/payments" element={<Navigate to="/billing/payments" replace />} />
          <Route path="/finance/refunds" element={<Navigate to="/billing/payments?tab=refunds" replace />} />
          <Route path="/finance/invoice-runs" element={<Navigate to="/billing/invoices" replace />} />
          <Route path="/finance/integrations" element={<Navigate to="/billing/payments" replace />} />
          <Route path="/ops/tasks" element={<Navigate to="/system/tasks" replace />} />
          <Route path="/ops/mail" element={<Navigate to="/system/mail" replace />} />
          <Route path="/ops/custom-settings" element={<Navigate to="/system/custom-settings" replace />} />
          <Route path="/ops/rate-limits" element={<Navigate to="/customers/membership-plans?tab=rate-limits" replace />} />
          <Route path="/ops/bulk" element={<Navigate to="/system/bulk" replace />} />
          <Route path="/admin/users" element={<Navigate to="/system/roles?tab=users" replace />} />
          <Route path="/admin/roles" element={<Navigate to="/system/roles" replace />} />
          <Route path="/admin/audit" element={<Navigate to="/system/audit" replace />} />
          <Route path="/admin/jobs" element={<Navigate to="/system/jobs" replace />} />
          <Route path="/admin/coverage" element={<Navigate to="/coverage" replace />} />

          {/* Retired in the old ACP — kept as a redirect, never linked. */}
          <Route path="/licenses/change-owner" element={<Navigate to="/products/licenses" replace />} />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

/** Keeps older reseller links working: /resellers/100341 → /customers/resellers/100341 */
function ResellerRedirect() {
  const { id } = useParams()
  return <Navigate to={`/customers/resellers/${id}`} replace />
}

/** /catalog/extensions/com → /products/extensions/com */
function ExtensionRedirect() {
  const { tld } = useParams()
  return <Navigate to={`/products/extensions/${tld}`} replace />
}
