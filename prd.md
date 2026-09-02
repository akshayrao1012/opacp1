# Openprovider Admin Control Panel (ACP) — Product Requirements Document

| | |
|---|---|
| **Product** | Openprovider Admin Control Panel (ACP) revamp |
| **Document version** | v1.0 |
| **Status** | Approved for prototype; prototype built and clickable |
| **Date** | 2026-08-28 |
| **Author** | Akshay Rao (akshay.rao@procys.com) |
| **Supersedes** | PRD-Openprovider-ACP-Revamp.md (v0.1) |
| **Artefact** | `openprovider-acp` — React 19 / Vite 6 / TypeScript prototype, no backend |

---

## 1. Summary

The ACP is the internal control panel Openprovider staff use to operate the registrar: resellers, domains, products, billing, abuse and platform operations. Today it is a single flat "Overviews" menu of ~60 legacy pages, with no permission model beyond "admin or not", no audit trail, no guardrails on destructive bulk actions, and list screens that cannot cope with the real data volumes (248,930 domains; 465,980 tasks; 108,216 licenses).

This revamp keeps every capability that is still used, retires the ones that are dead, and rebuilds the surface around three ideas:

1. **A real permission model.** Every action is a `resource.action` permission carrying a risk tier (T0–T3). Roles are bundles of permissions. Destructive permissions cannot be held permanently — they require time-boxed elevation.
2. **Task-oriented information architecture.** Eight groups, maximum two levels deep, organised by what an operator is trying to do rather than by which database table the page reads.
3. **Ten canonical patterns.** Every screen inherits one of P1–P10, so a list behaves like every other list and a destructive action is guarded the same way everywhere.

The deliverable described here is a **clickable prototype with no database**. All data is deterministic, generated in the browser at real inventory scale. State changes (payments recorded, roles edited, jobs run) live in memory for the session.

---

## 2. Problem statement

| Problem | Evidence | Consequence |
|---|---|---|
| No least-privilege model | Any ACP user can reach any page | A support agent can delete a reseller |
| No accountability | No audit log; some pages hardcode a username | "Who suspended this domain?" is unanswerable |
| Destructive actions have no guardrails | Bulk DNS zone delete has no dry run or confirmation | One paste of a wrong list destroys production zones |
| Lists do not scale | 108,216 licenses rendered as one table | Screens hang; operators export to spreadsheets instead |
| Flat, undiscoverable IA | ~60 items in one "Overviews" menu | New staff need weeks; capability is rediscovered by asking colleagues |
| Dead and duplicated pages | Two promocode managers; three 404 pages still linked | Maintenance cost and operator confusion |
| No sense of "what needs me now" | No dashboard; the landing page is a menu | Work is pulled from Zendesk, not from the system of record |

---

## 3. Goals and non-goals

### 3.1 Goals

| ID | Goal | Measure |
|---|---|---|
| G1 | Enforce least privilege | 100 % of write actions permission-checked; 0 unpermissioned mutations |
| G2 | Make every consequential action accountable | 100 % of T1+ actions produce an audit entry with actor, role, reason, ticket |
| G3 | Make destructive actions survivable | 100 % of T3 operations gated by dry run + typed confirm + second approver |
| G4 | Make the largest tables usable | Any list, at any scale, first paint under 2 s; filter/sort under 500 ms |
| G5 | Cut time-to-competence for a new operator | A new agent completes the top five support tasks unaided on day one |
| G6 | Retire the dead surface | Every legacy page has an explicit disposition: rebuild, merge, fix, elevate or retire |
| G7 | Start operators on work, not on a menu | Home is a role-aware dashboard; ≥ 60 % of sessions begin from a dashboard link |

### 3.2 Non-goals

- Not a customer-facing panel. Reseller-facing UX is out of scope.
- Not a billing engine. Invoices are **read-only** here; generation belongs to the billing pipeline.
- Not a replacement for registry tooling. EPP is surfaced, not re-implemented.
- Not a data migration project. The prototype assumes existing data shapes.
- Not an SSO/IdP implementation. Role derivation from IdP groups is modelled, not built (Q3).

---

## 4. Users and personas

Ten roles ship as defaults. Roles are editable bundles, not hardcoded classes.

| Role | Job to be done | Representative permissions |
|---|---|---|
| **Support Agent (L1)** | Look something up, explain what happened, escalate | All T0 reads across resellers, domains, payments, mail |
| **Support Lead (L2)** | Fix what L1 escalates | + `domain.write`, `domain.transfer.write`, `domain.create_in_db`, bulk console |
| **Finance** | Reconcile, invoice, refund | `payment.create`, `payment.refund.create`, `finance.invoice.settle` |
| **Finance Approver** | Second pair of eyes on money | + `payment.refund.approve`, `payment.create.approve`, `admin.audit.read` |
| **Commercial / Marketing** | Pricing, promotions, campaign codes | `catalog.extension.write`, `catalog.promotion.write`, `catalog.promocode.write` |
| **Abuse & Compliance** | KYC/KYB, contact validation, takedowns | `customer.kyc.decide`, `domain.bulk.suspend`, `risk.*.write` |
| **Technical Operations** | Queue health, integrations, bulk data | `ops.task.purge`, `domain.bulk.delete`, `product.license.migrate`, query runner |
| **Sales / Account Management** | Reseller health, memberships, revenue | `reseller.approve`, `reseller.membership.write`, sales + finance reports |
| **Auditor (read-only)** | Review and attest, change nothing | Every T0 permission + `admin.audit.read`; no writes at all |
| **Super Admin** | Govern roles; run T3 under elevation | All permissions (T3 still requires elevation) |

Twelve demo identities are seeded so every role can be tried without a login (identity switcher in the top bar).

---

## 5. Permission model (R-RBAC)

### 5.1 Risk tiers

| Tier | Meaning | Controls enforced |
|---|---|---|
| **T0** | Read | Permission check; access logged |
| **T1** | Routine write | Permission check; audit entry |
| **T2** | Sensitive write — money, resellers, pricing, compliance | + mandatory reason (≥ 8 chars) + Zendesk ticket matching `ZD-\d{6}` |
| **T3** | Destructive / irreversible / unbounded | All T2 controls + mandatory dry run + typed confirmation + second-approver sign-off + time-boxed elevation |

### 5.2 Requirements

| ID | Requirement |
|---|---|
| R-RBAC-1 | Permissions are `resource.action` strings. ~95 permissions across 11 groups: Resellers, Customers, Domains, Products, Finance, Catalog, Platform Ops, Risk & Abuse, Reports, System, Admin & Governance. |
| R-RBAC-2 | Every permission declares exactly one tier. The tier, not the screen, decides the controls. |
| R-RBAC-3 | Roles are named permission bundles, creatable and editable in the UI. A user may hold several; effective permission is the union. |
| R-RBAC-4 | A session may be scoped to a whitelist of reseller IDs. Out-of-scope records are invisible, not merely non-editable. |
| R-RBAC-5 | T3 permissions may never be held permanently. Elevation is requested with reason + ticket, granted for **60 minutes**, and expires automatically. |
| R-RBAC-6 | The role editor previews **effective access**: given a set of roles, which permissions resolve, from which role, at which tier. |
| R-RBAC-7 | A UI element the user cannot use is hidden, not disabled-and-mysterious. A whole nav group with no visible children disappears. |
| R-RBAC-8 | Users can be created and assigned roles and scope in-product (prototype: no invite email is sent). |

### 5.3 Approval thresholds

| Action | Below threshold | At/above threshold |
|---|---|---|
| Refund | T2 — reason + ticket | **€500** → T3, second approver |
| Recorded payment (credits a reseller balance) | T2 — reason + ticket | **€10,000** → T3, second approver; the credit applies only on approval |

---

## 6. Information architecture (R-IA)

| ID | Requirement |
|---|---|
| R-IA-1 | Maximum depth is Group → Module → Tab. Tabs live inside the module page; the nav tree is exactly two levels. |
| R-IA-2 | Eight top-level groups replace the flat "Overviews" bucket. |
| R-IA-3 | Every superseded legacy route redirects to its new home, so bookmarks and Zendesk macros keep working. |
| R-IA-4 | A persistent quick-jump bar sits above every page: Domain ID/name, Reseller ID/company, User handle, Go to TLD. It never scrolls away. |
| R-IA-5 | `⌘K` / `Ctrl-K` opens omnisearch across modules and records. |

### 6.1 The tree

| Group | Modules |
|---|---|
| **Home** | Dashboard (role-aware) |
| **Customers** | Resellers · Contact Validation · Identity Verification (KYC/KYB) · Membership Plans (Subscriptions / Rate Limits) |
| **Domains** | All Domains · Premium Domains · Transfers · Notifications · Trademark Manager · Providers |
| **Products & Services** | DNS Zones · SSL · Licenses · SpamExperts · Extensions · Virtual Products |
| **Billing** | Payments (Payments / Refunds) · Invoices · Promotions · Promocodes · Subscriptions (WPP) |
| **Risk & Abuse** | Bruteforce · IP Blacklist · Banned Keywords · Bulk Abuse Form · Batch Cracker |
| **Reports** | Support · Sales · Postpaid Customer Debt · Negative Available Balance · Domain Provider Statistics · EV |
| **System** *(admin-only)* | Task Manager · Mail · Custom Settings · Query Runner · Roles & Permissions · Audit Log · Job Centre · Feedback |

Satellite routes reachable from a module rather than the nav: Domain info (EPP), Create in database, Bulk domain form, Bulk DNS form, Bulk operations console.

---

## 7. Canonical patterns (P1–P10)

Every screen inherits one. This is the contract that keeps 50+ modules coherent.

| Pattern | Contract | Where |
|---|---|---|
| **P1 — List / table** | Server-side filter, sort, pagination. Saved views, column picker, density toggle, sticky header, full URL state, CSV export as an async job. | Every list module |
| **P2 — Entity detail** | Header with identifier, status and key facts; tabbed body; related-records rail; activity timeline. | Reseller, Domain, Extension, KYC case |
| **P3 — Form** | Validation on blur, field-level errors, explicit required marking, progressive disclosure, no destructive submit without confirmation. Create opens in a drawer. | All create/edit flows |
| **P4 — Bulk operation** | Input → per-row validation → **mandatory dry run** → typed confirm → async job → per-row result report → rollback path. | Bulk operations console |
| **P5 — Destructive action** | Danger zone, plain-language consequences, typed confirmation, reason + ticket, second approver for T3. | Reseller delete, domain suspend, zone delete |
| **P6 — Async job** | Anything slow becomes a job with an ID, progress, owner and downloadable result. | Job Centre, exports, migrations |
| **P7 — Audit & activity** | Immutable record of actor, role, before/after, reason, ticket, IP. Surfaced per entity and globally. | Audit Log + every entity timeline |
| **P8 — Secrets** | Masked by default; revealed by an audited, permissioned action; impact stated before rotation; never logged. | Notification settings, provider credentials, EPP auth info |
| **P9 — States** | Defined empty, loading, error and no-permission states. Errors carry a correlation ID. | Every view |
| **P10 — Foundation** | Openprovider brand (#CC1F3A), WCAG 2.1 AA targets, full keyboard navigation, ⌘K omnisearch, responsive to tablet. | App shell |

---

## 8. Functional requirements by group

### 8.1 Home — role-aware dashboard

| ID | Requirement |
|---|---|
| F-HOME-1 | Home composes widgets from the union of the user's roles, rendered in one fixed canonical order so multi-role users get a predictable page. |
| F-HOME-2 | Relevance and permission are separate gates. A role declares which widgets it *cares about*; each widget independently re-checks the permission it needs. A widget the user may not see never renders, whatever the role config says. |
| F-HOME-3 | Each role states a one-line **focus** ("Reconcile what came in, chase what has not, refund what should go back"). |
| F-HOME-4 | Each role gets a **Common tasks** shortcut list, so the dashboard is a starting point and not just numbers. |
| F-HOME-5 | 24 widget types: my queue, transfers needing ACK, KYC and contact-validation queues, money waiting, invoice health, debt and balances, approvals, sales summary, top resellers, catalog activity, risk summary, abuse enforcement, queue health, stuck batches, platform health, running jobs, recent T3 activity, live elevations, webhook failures, onboarding queue, common tasks, my activity. |
| F-HOME-6 | Dashboard aggregates read from cached one-pass summaries; the page never re-scans a 466k-row table. |

### 8.2 Customers

| ID | Requirement |
|---|---|
| F-CUS-1 | Reseller list at 4,182 records with saved-view segmentation replacing the legacy "extended search". |
| F-CUS-2 | Reseller detail (P2): Profile · Domains · Billing · Notifications · Settings, with a related-records rail and activity timeline. |
| F-CUS-3 | Membership plans are **Basic, Professional, Expert, Supreme** (ascending). Plan tier scales rate limits and bruteforce thresholds. 18,160 subscriptions. |
| F-CUS-4 | Contact validation (1,140 cases): Lock / Approve / Unlock are audited T2 actions. |
| F-CUS-5 | Identity verification (2,202 KYC/KYB cases): queue-first, document viewer, approve/fail as T2 with reason + ticket. |
| F-CUS-6 | Reseller deletion is GDPR erasure — T3, via the bulk console, with a legal-basis field and sign-off reference. |
| F-CUS-7 | Notification settings expose an API key and signature secret under P8 (masked, reveal is audited, rotation states its impact). |

### 8.3 Domains

| ID | Requirement |
|---|---|
| F-DOM-1 | Domain list at 248,930 records under P1. Premium is a saved view, not a separate page. |
| F-DOM-2 | Domain detail preserves the full legacy field set (~40 fields, 12 actions) regrouped into 8 tabs; registry is derived from the actual TLD. |
| F-DOM-3 | Domain deletes are T3 (dry run + typed confirm + approver); restores are T2. |
| F-DOM-4 | Transfers (6,420) with an "all third-party" and a "grouped by reseller" view; acting on a transfer is T2. |
| F-DOM-5 | Domain info runs an EPP lookup and shows structured fields with a raw-JSON toggle. |
| F-DOM-6 | Create-in-database keeps the legacy test mode and makes it **mandatory** before a real write. |
| F-DOM-7 | Provider list carries live health; reseller→provider credential mappings use P8. |

### 8.4 Products & Services

| ID | Requirement |
|---|---|
| F-PRD-1 | Licenses (108,216) and SpamExperts domains (4,590) under P1; license migration is a single T3 wizard replacing three legacy forms. |
| F-PRD-2 | SSL (7,412 orders); "Reset Comodo password" is T2 with an explicit impact statement. The external SSL panel remains a labelled hand-off tab pending Q7. |
| F-PRD-3 | DNS zone bulk delete is T3 — previously it had no guardrail at all. |
| F-PRD-4 | Extension (TLD) detail reproduces the full legacy per-TLD screen across 5 tabs, reachable from the "Go to TLD" quick-jump field for any TLD entered. |
| F-PRD-5 | Extension create keeps clone-from-existing, as a drawer on the list. |

### 8.5 Billing

| ID | Requirement |
|---|---|
| F-BIL-1 | Payments (41,260) with a Payments / Refunds tab pair and an approvals badge. |
| F-BIL-2 | **Create payment** is available to Finance and Finance Approver only (`payment.create`). It credits a reseller balance; it does not move money, and says so. |
| F-BIL-3 | Create payment uses progressive disclosure: **every field except Reseller ID is disabled until a reseller ID resolves.** An amount typed against no account is a number waiting to go astray. Clearing the reseller re-locks the form. |
| F-BIL-4 | A recorded payment shows the reseller's balance before/after, so a mistyped amount is obvious before it is recorded. Above €10,000 it queues for a second approver. |
| F-BIL-5 | Refunds are T2; above €500 they are T3 and enter an approver queue. |
| F-BIL-6 | **Invoices are read-only** (38,420): filters, VAT scheme, dunning state, per-invoice lines, PDF. Invoice generation is not an ACP capability — the run belongs to the billing pipeline. |
| F-BIL-7 | Promocode Manager and Fast Checkout Promocodes merge into one module with a type tab; batch generation from CSV is an async job. |
| F-BIL-8 | Promotions include the "Multiyear" tab (legacy "Multilayer"); the hardcoded username is removed and a validation preview added. |
| F-BIL-9 | The Twinfield integration section is retired at product request. *This departs from PRD v0.1 §7 row 4, which specified a rebuild with masked tokens; the deviation is recorded on the coverage page.* |

### 8.6 Risk & Abuse

| ID | Requirement |
|---|---|
| F-RSK-1 | Bruteforce: attempts, protection activation and last-minute-change detection; thresholds scale with membership plan. Unblocking an IP or account is T2. |
| F-RSK-2 | IP blacklist and banned keywords are T2 writes; the keyword screen measures its own false-positive rate. |
| F-RSK-3 | Bulk abuse enforcement is T3 with a mandatory abuse-case reference; actions are clientHold (reversible), remove hold, suspend, and registry delete (irreversible). |
| F-RSK-4 | Batch Cracker can split, replay or resume a stuck batch (T2); abandoning a batch and discarding its rows is T3. |

### 8.7 Reports

| ID | Requirement |
|---|---|
| F-REP-1 | Six report modules: Support, Sales, Postpaid Customer Debt, Negative Available Balance, Domain Provider Statistics, EV. |
| F-REP-2 | Finance reports are gated by `reports.finance.read`; the sales dashboard by `reports.sales.read`. |
| F-REP-3 | Every report exports as an async job, never as a blocking download. |

### 8.8 System (admin-only)

| ID | Requirement |
|---|---|
| F-SYS-1 | Task Manager surfaces 465,980 entries with 182,003 outdated; purging outdated tasks is T3 (Q9). |
| F-SYS-2 | Mail log with delivery and verification tabs, both exportable. |
| F-SYS-3 | Custom settings are a feature-flag surface showing effective scope; changes are T2. |
| F-SYS-4 | Query Runner offers **approved parameterised queries only**. Raw SQL is deliberately disabled; exporting results is T2. |
| F-SYS-5 | Roles & Permissions: Roles · Permissions · Users · Effective access. Users can be added and assigned roles and scope. |
| F-SYS-6 | Audit Log is global, filterable, immutable and exportable. |
| F-SYS-7 | Job Centre lists every async job with ID, progress, owner, result and a cancel action (`admin.job.cancel`). |
| F-SYS-8 | **Feedback** collects the review notes raised from the in-page widget (§8.9). Read is `system.feedback.read`; triage is `system.feedback.triage`. Both are held by Super Admin only — deliberately excluded from the Auditor's read-only sweep, since this is the prototype owner's channel rather than part of the product under attestation. |
| F-SYS-9 | The Bulk operations console hosts **nine typed operations** — domain lookup (T1), domain date sync (T2), domain delete (T3), abuse enforcement (T3), internal transfer (T3), DNS zone delete (T3), license migration (T3), reseller GDPR erasure (T3), task purge (T3) — replacing six scattered legacy forms with one governed flow. |

### 8.9 Review feedback (prototype instrumentation)

The prototype is a review artefact, so collecting reactions to it is part of the deliverable rather than an afterthought.

| ID | Requirement |
|---|---|
| F-FB-1 | A feedback launcher is present on **every** page, for **every** role. Filing a note requires no permission — a reviewer who cannot read a module can still say so. |
| F-FB-2 | Selecting any text on a page raises an **Add feedback on this** pill next to the selection; the highlighted words are quoted verbatim into the note, so nobody has to guess which label or figure was meant. |
| F-FB-3 | Each note carries a summary, type (bug · UX · copy · data · idea · question), severity (blocker · major · minor · nice to have) and optional detail. |
| F-FB-4 | Context is captured automatically: route, breadcrumb page label, the reviewer's identity, **the roles in effect at capture time**, and the viewport size — a layout or visibility complaint is not reproducible without them. |
| F-FB-5 | The composer shows what has already been raised on the same page, so reviewers can see they are not duplicating a note. |
| F-FB-6 | Notes are readable only in System → Feedback, by a holder of `system.feedback.read`. Triage — status changes, annotations, deletion — needs `system.feedback.triage`, which stops a reviewer quietly closing their own complaint. |
| F-FB-7 | Status lifecycle: Open → Triaged → Accepted / Won't do / Resolved. Every status change writes an audit entry (`system.feedback.triage`, T1). |
| F-FB-8 | The Feedback module surfaces a hotspot list — the most-commented pages — because a cluster of notes usually means one underlying problem. |
| F-FB-9 | Feedback is the **one** dataset that survives a reload. Everything else resets by design (§10.1); losing a reviewer's own notes to a refresh would make the widget worse than a notepad. Scope is per browser: it is local storage, not a shared queue. |

---

## 9. Non-functional requirements

| ID | Requirement |
|---|---|
| N-1 | **Performance.** First paint of any list ≤ 2 s; filter/sort round-trip ≤ 500 ms at 250k rows. Lists are windowed; nothing renders a full table. |
| N-2 | **Scale.** All list surfaces are designed against real inventory volumes, not sample data (see §11). |
| N-3 | **Accessibility.** WCAG 2.1 AA targets: contrast, focus order, visible focus rings, labelled controls, full keyboard operation of tables, drawers and dialogs. |
| N-4 | **Responsiveness.** Usable down to tablet width; the quick-jump bar and nav collapse gracefully. |
| N-5 | **Brand.** Openprovider red `#CC1F3A`; product logo used as app mark and favicon. |
| N-6 | **Observability.** Every error state carries a correlation ID an operator can paste into a ticket. |
| N-7 | **Auditability.** Audit entries are append-only and capture actor, role, resource, before/after, reason, ticket and IP. |
| N-8 | **Security.** Secrets are masked at rest in the UI, revealed only by an audited permissioned action, and never written to logs, URLs or exports. |
| N-9 | **Determinism (prototype).** The same seed produces the same data on every load, so bugs and screenshots are reproducible. |

---

## 10. Prototype architecture

The prototype has **no database and no backend**.

| Concern | Approach |
|---|---|
| Stack | Vite 6 · React 19 · TypeScript (strict, `noUnusedLocals`) · react-router-dom 7 · Tailwind 3 · zustand 5 · lucide-react |
| Data | Deterministic seeded PRNG (mulberry32); `NOW_MS` frozen at 2026-08-26 so relative dates are stable |
| Large tables | `synthetic(id, total, factory)` — a dataset that can be scanned by index without ever retaining rows. `materialized(id, rows)` for small sets. `concatDatasets` splices session-created rows on top of generated ones |
| Mutations | A patch layer (`patchRow`, `markRemoved`, `_deleted`) overlays edits on generated rows; the store bumps a `dataVersion` to invalidate views |
| Aggregates | Cached one-pass summaries (`taskHealth`, `financeHealth`, `riskHealth`) so dashboards never rescan |
| Session state | Roles, users, audit, jobs, approvals, elevations, toasts in zustand. Only session preferences (identity, density, nav collapse) persist to `localStorage`; data and audit reset on reload |
| Async work | Exports, bulk operations and migrations run as simulated jobs with progress and results |
| Verification | Playwright-core driving system Chrome; 15 scripted flow checks (`npm run smoke:*`) |
| Dev server | `http://localhost:5181` (`npm run dev`). The app requires a server — `index.html` cannot be opened from disk |

### 10.1 Prototype limitations (explicit)

- No authentication: identity is switched from the top bar.
- No persistence: recorded payments, role edits and audit entries vanish on reload; `resetData` restores the seed.
- No network: EPP lookups, registry calls, PSP and vendor APIs are simulated.
- Emails, invites and PDFs are represented, not sent or generated.
- Review feedback (§8.9) is the sole exception to "no persistence": it is kept in the reviewer's own browser storage, so notes do not converge across reviewers or machines.

---

## 11. Data model volumes

| Entity | Records | Storage |
|---|---|---|
| Domains | 248,930 | synthetic |
| Tasks | 465,980 (182,003 outdated) | synthetic |
| Licenses | 108,216 | synthetic |
| Payments | 41,260 | synthetic |
| Invoices | 38,420 | synthetic |
| Membership subscriptions | 18,160 | synthetic |
| Transfers | 6,420 | materialized |
| Resellers | 4,182 | materialized |
| SSL orders | 7,412 | materialized |
| SpamExperts domains | 4,590 | materialized |
| KYC/KYB cases | 2,202 | materialized |
| Contact validations | 1,140 | materialized |
| Promocodes | 468 | materialized |
| Trademarks | 384 | materialized |
| Promotions | 212 | materialized |
| Refunds | 246 | materialized |
| Admin users | 12 | seeded |
| Roles | 10 | seeded, editable |
| Permissions | ~95 across 11 groups | static catalogue |

---

## 12. Legacy page disposition

Every page in the supplied inventory carries one of six dispositions, published in-product at `/coverage` so the build can be reviewed against the document rather than from memory.

| Disposition | Meaning |
|---|---|
| **Rebuild** | Capability kept, screen rebuilt on a canonical pattern |
| **Merge** | Folded into another module as a tab, drawer or saved view |
| **Fix** | Kept, with a defect corrected (hardcoded username, spelling, missing validation) |
| **Elevate** | Kept, but moved behind T2/T3 controls it previously lacked |
| **Retire** | Removed — dead, 404, or no longer an ACP capability |
| **New** | Did not exist before |

Notable decisions:

- **Retired:** Twinfield overview (product request; deviates from PRD v0.1 §7 row 4) · Invoice creation (belongs to the billing pipeline) · Licenses → Change Owner (404; pending Q8) · Resellers → Disabled modify domain (404).
- **Merged:** Two promocode managers → one module · Premium domains → a saved view · Six bulk forms → one governed console.
- **Elevated:** Bulk DNS zone delete, bulk abuse enforcement, internal transfer, reseller delete, task purge, license migration — all previously unguarded, now T3.
- **New:** Home dashboard · System group (roles, audit, jobs, query runner) · Risk & Abuse group · six report modules · WPP subscriptions · the review feedback widget and its Feedback module (prototype instrumentation, not a production ACP capability).

---

## 13. Success metrics

| Metric | Baseline | Target |
|---|---|---|
| Unpermissioned write actions | Unbounded | 0 |
| T1+ actions with a complete audit entry | 0 % | 100 % |
| T3 operations executed without dry run | 100 % | 0 % |
| Median time to answer "who changed this and why" | Not answerable | < 60 s |
| List first paint at ≥ 100k rows | Hangs / times out | ≤ 2 s |
| Sessions starting from a dashboard link | 0 % | ≥ 60 % |
| Legacy pages with no owner or disposition | ~60 | 0 |
| New-operator time to the top five support tasks | Weeks | Day one |

---

## 14. Release plan

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 — Prototype** *(done)* | Full clickable surface, no backend; all patterns, RBAC, dashboards, bulk console | Every inventory page has a disposition; all flow checks pass |
| **1 — Foundation** | Auth/IdP, permission service, audit store, job runner, read model for large tables | RBAC and audit enforced server-side; P1 hits N-1 on real data |
| **2 — Core operations** | Customers, Domains, Billing on the real API | Support and Finance work entirely in the new ACP |
| **3 — Governed bulk & risk** | Bulk console, Risk & Abuse, elevation workflow | No legacy bulk form remains reachable |
| **4 — Reports & retirement** | Reports, query runner, legacy shutdown | Old ACP routes redirect only; nothing renders from the legacy app |

---

## 15. Open decisions

| # | Question | Owner |
|---|---|---|
| Q1 | Re-skin the existing ACP, or build a new front end against a dedicated admin API? | Akshay + Engineering |
| Q2 | Is there an existing internal design system to build on? | Design |
| Q3 | Which identity provider backs ACP login, and can roles derive from IdP groups? | IT / Security |
| Q4 | Which ACP sections exist beyond "Overviews"? | Akshay |
| Q5 | Can the backend filter and sort the 100k+ tables, or is a read model needed? | Engineering |
| Q6 | Audit log retention period and legal requirements | Legal / Compliance |
| Q7 | Does sslpanel.io get absorbed into the ACP? | Product |
| Q8 | Is Licenses → Change Owner still needed? | Product + Support |
| Q9 | Cleanup plan for the 182,003 outdated tasks | Engineering |
| Q10 | Who are the named approvers for T3 operations and refunds above threshold? | Finance + Ops leadership |

---

## 16. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Backend cannot filter/sort at scale (Q5) | P1 unachievable; N-1 missed | Decide early; budget a read model in Phase 1 |
| Elevation friction pushes staff back to direct DB access | Governance defeated | 60-minute window, one-click request, named approvers (Q10) |
| Role sprawl as teams request bespoke bundles | Least privilege erodes | Roles are permission bundles with an effective-access preview; review quarterly |
| Retired pages turn out to be in use | Operator work blocked | Every retirement is recorded with a rationale and a redirect; reversible |
| Audit retention conflicts with GDPR erasure | Legal exposure | Resolve Q6 before Phase 1; erasure records the act, not the erased data |

---

## Appendix A — Permission groups

Resellers · Customers · Domains · Products · Finance · Catalog · Platform Ops · Risk & Abuse · Reports · System · Admin & Governance.

## Appendix B — Running the prototype

```
npm install
npm run dev          # http://localhost:5181
npm run build        # tsc -b && vite build
npm run lint         # tsc -b --noEmit
npm run smoke        # scripted browser checks (requires the dev server)
```

In-product reference: **PRD coverage** in the sidebar footer (`/coverage`) — page disposition map, the ten patterns, and the open decisions above.
