import { chromium } from 'playwright-core'
const BASE = process.env.BASE ?? 'http://localhost:5181'
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const page = await browser.newPage({ viewport: { width: 1560, height: 1000 } })
const problems = []
page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 200)))
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) problems.push('console: ' + m.text().slice(0, 200)) })

const routes = [
  '/',
  '/customers/resellers', '/customers/resellers/100000', '/customers/resellers/new-pending',
  '/customers/resellers/notification-settings', '/customers/resellers/statistics',
  '/customers/contact-validation', '/customers/identity-verification', '/customers/membership-plans',
  '/customers/membership-plans?tab=rate-limits',
  '/domains', '/domains/premium', '/domains/transfers', '/domains/transfers?tab=grouped',
  '/domains/notifications', '/domains/trademarks', '/domains/providers',
  '/domains/providers?tab=reseller-mapping', '/domains/domain-info', '/domains/create-in-database',
  '/domains/bulk', '/domains/atlasindigo.dev',
  '/products/dns-zones', '/products/ssl', '/products/ssl?tab=panel', '/products/licenses',
  '/products/licenses?tab=migrations', '/products/spamexperts', '/products/extensions',
  '/products/extensions/com', '/products/virtual-products',
  '/billing/payments', '/billing/payments?tab=refunds', '/billing/invoices', '/billing/promotions',
  '/billing/promotions?tab=multiyear', '/billing/promocodes', '/billing/promocodes?tab=fast-checkout',
  '/billing/promocodes?tab=batches', '/billing/subscriptions', '/billing/twinfield',
  '/risk/bruteforce', '/risk/bruteforce?tab=activation', '/risk/bruteforce?tab=changes',
  '/risk/ip-blacklist', '/risk/banned-keywords', '/risk/bulk-abuse', '/risk/batch-cracker',
  '/reports/support', '/reports/sales', '/reports/postpaid-debt', '/reports/negative-balance',
  '/reports/provider-statistics', '/reports/ev',
  '/system/tasks', '/system/mail', '/system/custom-settings', '/system/query-runner',
  '/system/roles', '/system/roles?tab=users', '/system/audit', '/system/jobs', '/system/bulk',
  '/coverage', '/nope-not-a-page',
]

let fails = 0
for (const r of routes) {
  const before = problems.length
  await page.goto(BASE + r, { waitUntil: 'networkidle' })
  await page.waitForTimeout(450)
  const text = (await page.locator('body').innerText()).trim()
  const blank = text.length < 60
  const noPerm = text.includes('You do not have access')
  const status = problems.length > before ? 'ERR' : blank ? 'BLANK' : noPerm ? 'DENIED' : 'ok'
  if (status !== 'ok') fails++
  console.log(`${status.padEnd(6)} ${r}`)
  if (problems.length > before) console.log('       ' + problems.slice(before).join('\n       '))
}

// Redirects from the previous IA must land somewhere real.
const redirects = [
  ['/resellers', '/customers/resellers'],
  ['/resellers/100000', '/customers/resellers/100000'],
  ['/finance/payments', '/billing/payments'],
  ['/ops/tasks', '/system/tasks'],
  ['/admin/roles', '/system/roles'],
  ['/catalog/extensions/com', '/products/extensions/com'],
  ['/ops/bulk', '/system/bulk'],
  ['/admin/coverage', '/coverage'],
]
console.log('\n--- redirects ---')
for (const [from, to] of redirects) {
  await page.goto(BASE + from, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  const landed = new URL(page.url()).pathname
  const ok = landed === to
  if (!ok) fails++
  console.log(`${ok ? 'ok    ' : 'FAIL  '} ${from} → ${landed}${ok ? '' : ` (expected ${to})`}`)
}

console.log(`\n${fails} problem route(s); ${problems.length} console/page error(s)`)
await browser.close()
