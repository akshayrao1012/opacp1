# Openprovider ACP — revamp prototype

A clickable, self-contained prototype of the Admin Control Panel described in
`PRD-Openprovider-ACP-Revamp.md` (Draft v0.1). No database: all data is generated
deterministically in the browser and mutations live in memory, so a reload — or the
reset button in the top bar — restores the starting state.

```bash
npm install
npm run dev      # http://localhost:5181
npm run build    # type-check + production bundle
npm run lint     # tsc --noEmit
```

Stack: Vite 6, React 19, TypeScript, react-router 7, Tailwind 3, zustand, lucide-react.

## What to look at first

| Try this | Where | What it demonstrates |
|---|---|---|
| Switch identity in the top-right menu (12 personas) | anywhere | RBAC changes navigation, buttons and pages — not just labels (G1) |
| Switch identity, then open Home | `/` | The dashboard is composed per role: Support gets a queue, Finance gets money, Tech Ops gets the task queue |
| Open a Tier 3 action without elevation | `/ops/bulk` | Time-boxed elevation, announced and audited (R-RBAC-5) |
| Run a bulk abuse suspension end to end | `/ops/bulk?op=domain_abuse` | Input → per-row validation → mandatory dry run → typed confirm → approver → job → report (P4) |
| Sort and filter 108,216 licenses | `/products/licenses` | Server-side query with timing shown in the footer (NFR-1) |
| Approve a refund above €500 | `/billing/payments?tab=refunds` | T2 → T3 escalation, validated Zendesk reference, approver queue |
| Record a payment as Finance, then as Support | `/billing/payments` | `payment.create` is finance-only; above €10,000 the credit waits for an approver |
| Reveal a reseller API key | `/customers/resellers/notification-settings` | Secrets masked by default, reveal is permissioned and audited (P8) |
| Read the audit log | `/admin/audit` | Actor, role in effect, before/after, reason, ticket, IP, correlation ID (P7) |
| Check coverage against the PRD | `/admin/coverage` | All 54 inventory rows, their new home, and the patterns applied |
| Press ⌘K / Ctrl-K | anywhere | Omnisearch resolving any identifier (R-IA-2) |
| Type an ID into the Quick jump bar | anywhere | The legacy persistent quick-search bar: four typed fields that go straight to a record |
| Select any text, then click **Add feedback on this** | anywhere | Review feedback captured against the exact words, the route and the roles you held |
| Read the notes as Super Admin | `/system/feedback` | Collected review feedback with triage, hotspots and an audit trail |

## How the PRD maps onto the code

### Access control (§6.1)

- `src/lib/rbac.ts` — 80 permissions as `resource.action`, each classified T0–T3, bundled
  into 10 roles that mirror the personas in §5. T3 permissions are listed in
  `ELEVATION_REQUIRED` and can never be held permanently.
- `src/lib/store.ts` — `can()` is the single check: base permission from roles, plus a live
  elevation grant for anything T3. Every UI affordance calls it; nothing is gated by
  hiding alone. `logAudit()` writes the P7 record.
- `src/pages/Admin.tsx` — role editor, permission catalogue, an **Add user** action on the
  Users tab (prototype only: it creates the account in memory and in the account switcher,
  sends no invitation, and states that real provisioning is IdP-derived), and the
  "what can this person actually do?" effective-permissions preview (R-RBAC-6). Reseller
  scoping (R-RBAC-4) is editable per user; `Pierre Dubois` ships scoped to nine resellers.

### Information architecture (§6.2)

`src/lib/nav.ts` holds eight top-level groups: **Home · Customers · Domains · Products &
Services · Billing · Risk & Abuse · Reports · System**. Depth is exactly Group → Module →
Tab; tabs live inside the module and keep their state in the URL, so every view is linkable.
Groups whose every item is hidden by permission disappear from the sidebar, and System is
marked admin-only in the nav itself.

Every path from the earlier structure redirects rather than 404s, so links already shared
keep working: `/resellers/100341` → `/customers/resellers/100341`, `/finance/payments` →
`/billing/payments`, `/ops/tasks` → `/system/tasks`, `/admin/roles` → `/system/roles`, and so
on for every moved module.

Two additions to the requested tree, both because the PRD requires them and they had nowhere
else to live: **Audit Log** and **Job Centre** sit under System next to Roles & Permissions
(G6 and P6). Everything else maps one-to-one.

Areas built from scratch for this structure: **Risk & Abuse** (Bruteforce with
Overview/Activation/Last-minute changes, IP Blacklist, Banned Keywords, Bulk Abuse Form,
Batch Cracker), all six **Reports**, **Query Runner**, and **Billing → Subscriptions**
(Reseller WPP). Their data lives in `src/lib/mock/risk.ts`, `reports.ts` and `billing.ts` —
the report datasets are derived from the operational rows rather than invented separately, so
a number on a report can be drilled into.

### Patterns (§6.3)

| Pattern | Implementation |
|---|---|
| P1 list/table | `src/components/patterns/DataTable.tsx` + `src/lib/table.ts` |
| P2 entity detail | `src/components/patterns/EntityDetail.tsx`, applied in full by `src/pages/DomainDetailPage.tsx` |
| P3 form | `Field`/`Input`/`Select` in `src/components/ui/index.tsx`; create flows are drawers |
| P4 bulk operation | `src/lib/bulk.ts` (operation registry) + `src/pages/BulkConsole.tsx` |
| P5 destructive action | `src/components/patterns/Destructive.tsx` (`DangerZone`, `DestructiveDialog`) |
| P6 async job | `createJob`/`advanceJob` in the store, surfaced in `/system/jobs` |
| P7 audit & activity | `logAudit` + `src/components/patterns/Activity.tsx` |
| P8 secrets | `SecretValue` — masked, permissioned reveal, audited |
| P9 states | `EmptyState`, `TableSkeleton`, `ErrorState`, `NoPermission` |
| P10 foundation | brand `#CC1F3A` in `tailwind.config.js`, keyboard omnisearch, tablet-down layout |

Branding assets live in `public/`: `openprovider-logo.png` (the wordmark, used in the
sidebar header and as the PNG favicon fallback) and `favicon.svg`, which letterboxes that
wordmark on a white plate so it stays legible in dark browser chrome. The collapsed sidebar
rail keeps the `OP` monogram — the wordmark is unreadable at 62px.

### Role-aware Home (§6.2)

`src/lib/dashboards.ts` maps each role to the widgets it cares about, a one-line focus
statement, and a set of shortcuts; `src/pages/Home.tsx` renders the union for the roles a
user holds, in one canonical order so a multi-role page stays predictable. Support sees a
queue and lookup shortcuts; Finance sees money waiting on a decision; Finance Approver leads
with the approval queue; Abuse & Compliance gets the compliance queues and live risk;
Technical Operations gets queue health and what is stuck; Sales and Commercial get the book of
business and campaigns; Auditor gets the audit and elevation view and nothing operational.

Relevance and permission are separate: the role list decides what is *worth showing*, and
every widget still checks its own permission before reading data. The heavy figures come from
`taskHealth()`, `financeHealth()` and `riskHealth()` — one-pass summaries cached for the
session, so the dashboard never re-scans the 466k-row task table on render.

### Quick jump bar

`src/components/shell/QuickSearch.tsx` reproduces the legacy always-on search strip —
DomainID/Name, ResellerID/Company, User (handle), Go to Tld — as the top bar itself, the
first thing on the page. It sits outside the scroll container, so it stays on screen
everywhere. Omnisearch lost its wide input and kept the magnifier icon plus ⌘K; row density
and the prototype reset moved into the account menu to leave the four fields room.

Each field resolves rather than just searching: a numeric domain ID opens that domain's
detail screen, a company name opens the reseller when exactly one matches, a TLD opens the full
Extension details screen, an unknown TLD is refused with a toast instead of navigating to an
empty result, and anything not found falls
back to a filtered list rather than a dead end. Fields whose permission the signed-in user
lacks are hidden, like every other affordance. `alt+d` / `alt+r` / `alt+u` / `alt+t` focus
the four fields; Enter jumps, Escape clears.

This sits alongside omnisearch (⌘K) rather than replacing it: omnisearch infers what you
pasted, the quick bar lets you state what you meant, which is faster when you already know
you are holding a reseller ID.

### Extension detail — the legacy field set, regrouped

`Go to Tld` opens `src/pages/ExtensionDetailPage.tsx`, the equivalent of the legacy
"Extension - Details" screen, across five tabs: **Main info** (extension, tags, active, show
on public site, order and renew periods, domain length, status, routing, capabilities),
**Transfer, trade & quarantine** (transfer possible / cancel / trade, modify owner, billed as
renew, locking, renewal offset, soft and hard quarantine, FOA strategy), **Nameservers**
(required, min/max, glue, IPv6, DNSSEC keys), **Pricing** (price and cost per action and
period), and **Registrant requirements** (local presence, allowed country codes,
verification, trustee, registry lock). Fields come from
`src/lib/mock/extensionDetail.ts`.

Two grouping calls worth naming: local presence and allowed country codes sit under
Registrant requirements rather than in the transfer column where the legacy screen kept them
— they are registrant rules, not transfer rules — and the transfer tab carries a
cross-reference so nobody hunts. Each pencil is a T2 change: catalogue edits apply to every
reseller and every existing domain on that TLD, so they capture a reason and a ticket, and
the confirmation states the blast radius (for example, that deactivating a TLD refuses all
new registrations immediately).

### Domain detail — the legacy field set, regrouped

`src/pages/DomainDetailPage.tsx` carries every field, table and button from the old
Domain-Details screen, which stacked ~40 read-only fields in two columns with twelve
coloured action buttons wedged between them. Nothing was dropped; it is grouped into eight
tabs and the actions are tiered:

| Tab | Legacy content it covers |
|---|---|
| Overview | Identity, all six dates, action + action status, controller class, current provider, private comment, deletion reasons, every `Is …` flag, auto-renew, WPP, locked status, consent for publishing |
| Contacts & verification | Owner / Admin / Tech / Billing handles, email + phone + owner-contact verification, owner verification status, Start verification, Verify contact |
| Nameservers & DNS | Nameserver table with IP/IPv6 glue, add/remove/update, nameserver group, DNSSEC, Sectigo zone, zone records |
| Registry & transfer | Authorization code (masked, audited reveal), send auth-code by SMS/email, Restart FOA, manual FOA to a given address, EPP response |
| Invoice lines | ID / At / Trx / Status / Gross\Cost / Qty / Curr / Refund, complete or cancel open lines |
| Mutations | Domain mutations table plus the ACP activity timeline |
| Abuse | Mark domain as abusive (evidence, ReplyTo, notify options, action), abuse statistics, abuse history |
| Danger zone | Three delete variants, three restore variants, clientHold |

Field data comes from `src/lib/mock/domainDetail.ts`, derived from the domain's seed so it is
stable per domain without adding 40 columns to the 249k-row list factory.

Two changes of substance rather than layout: nameserver edits are staged and pushed in one
registry call (the legacy Remove applied immediately, so a half-applied delegation was
possible), and the six delete/restore buttons are split by blast radius — deletion is T3
with a dry run and a second approver, restore is T2 because it costs money but destroys
nothing, and clientHold is T3 despite being reversible because it takes a live domain
offline for everyone at once.

### Scale (§6.4)

`src/lib/table.ts` distinguishes *materialized* datasets (a real array) from *synthetic*
ones (a total plus a row factory scanned per query). That is how the prototype carries the
inventory's real record counts — 465,980 tasks, 249k domains, 108,216 licenses, 96k mail
messages, 61k DNS zones, 41k payments, 18,160 memberships — without holding a million
objects in memory. Query time is measured and shown in every table footer.

Mutations against synthetic rows go through `src/lib/mock/patch.ts`, a patch table keyed by
dataset + row id, so a bulk suspend genuinely changes what the tables show.

## Positions the prototype takes

The PRD leaves ten decisions open (§9). Where a decision blocks a screen, the prototype
takes the safer position and labels it rather than guessing silently:

- **Dead pages are retired, not linked.** `Licenses → Change Owner` and
  `Resellers → Disabled modify domain` (both 404s) exist only as redirects; `SSL → SSL Panel`
  is called out on the SSL page as an external tool pending Q7.
- **Content errors are fixed.** "Bulk Abhuse form" → Abuse enforcement,
  "Identity Verifiction" → Identity verification, "Domain Prociders" → Domain providers,
  and `Promotions → Multilayer` → **Multiyear**, with the hardcoded personal username
  removed and a validation preview added.
- **Every T3 operation is dry-runnable and needs a second approver**, including the three
  that had no guardrail at all (bulk DNS delete, bulk domain delete, bulk abuse).
- **Refund payouts to a different IBAN always need approval**, regardless of amount.
- **Registry passwords are write-only** — rotate-and-verify, never read back.
- Open decisions Q1–Q10 are listed at `/admin/coverage` with their owners.

## Prototype boundaries

- No backend, no auth: identity is a picker, and the "server-side" query engine runs in the
  browser with simulated latency. The chosen identity, row density and sidebar state are
  kept in `localStorage`; data mutations, jobs and the audit log are memory-only, so a
  reload always returns to a known state.
- `PRD coverage` sits in the sidebar footer rather than inside Admin & Governance — it is a
  prototype meta-page, and putting it in a permissioned group would have shown that group
  to roles that should not see it.
- Review feedback is the one thing that survives a reload — it is the reviewer's own work, so it
  is written to `localStorage` (`acp.feedback.v1`). That also means it is per browser: notes do
  not converge across reviewers, and clearing site data clears them. Filing a note needs no
  permission; reading the collected set needs `system.feedback.read`, which only Super Admin
  holds — it is deliberately kept out of the Auditor's all-T0 sweep.
- File upload in the bulk console is stubbed; paste and sample-row loading work.
- Baselines the PRD needs before build (task timings, SUS, escalation volume) are shown as
  targets, not measurements. The health figures on the dashboard are illustrative.
- `scripts/smoke.mjs` drives every route through Chrome (`npm run build && npx vite preview`,
  then `node scripts/smoke.mjs`) to check for blank pages and console errors.
