import { chromium } from 'playwright-core'

const BASE = process.env.BASE ?? 'http://localhost:4173'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const routes = [
  '/', '/resellers', '/resellers/100000', '/resellers/new-pending',
  '/resellers/notification-settings', '/resellers/provider-mappings',
  '/resellers/memberships', '/resellers/statistics',
  '/customers/contact-validation', '/customers/identity-verification',
  '/domains', '/domains/transfers', '/domains/notifications', '/domains/domain-info',
  '/domains/create-in-database',
  '/products/ssl', '/products/spamexperts', '/products/licenses', '/products/dns-zones',
  '/products/virtual-products', '/products/trademarks',
  '/finance/payments', '/finance/refunds', '/finance/invoice-runs', '/finance/integrations',
  '/catalog/extensions', '/catalog/promotions', '/catalog/promocodes', '/catalog/domain-providers',
  '/ops/tasks', '/ops/mail', '/ops/custom-settings', '/ops/rate-limits', '/ops/bulk',
  '/admin/users', '/admin/roles', '/admin/audit', '/admin/jobs', '/admin/coverage',
  '/does-not-exist',
]

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1560, height: 950 } })
const problems = []
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 300)}`)
})
page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 300)}`))

for (const r of routes) {
  const before = problems.length
  await page.goto(BASE + r, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const text = await page.locator('body').innerText()
  const blank = text.trim().length < 40
  const status = problems.length > before ? 'ERR' : blank ? 'BLANK' : 'ok'
  console.log(`${status.padEnd(5)} ${r}  (${text.trim().length} chars)`)
  if (problems.length > before) console.log('      ' + problems.slice(before).join('\n      '))
}
await browser.close()
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nno console errors')
