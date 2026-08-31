import { chromium } from 'playwright-core'

const BASE = 'http://localhost:5181'
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const p = await b.newPage({ viewport: { width: 1560, height: 1000 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()) })

const results = []
const step = async (n, fn) => {
  try { await fn(); results.push('ok   ' + n) } catch (e) { results.push('FAIL ' + n + ' :: ' + String(e).split('\n')[0]) }
}

await p.goto(BASE + '/billing/payments', { waitUntil: 'networkidle' })
await p.waitForTimeout(3000)

await step('Billing nav no longer lists Twinfield', async () => {
  const sidebar = p.locator('aside').first()
  // Only expand if it is not already open — the group auto-expands on its own routes.
  if ((await sidebar.getByRole('link', { name: 'Payments' }).count()) === 0) {
    await sidebar.getByRole('button', { name: 'Billing' }).click()
    await p.waitForTimeout(400)
  }
  const nav = await sidebar.innerText()
  if (/twinfield/i.test(nav)) throw new Error('sidebar still lists Twinfield')
  for (const item of ['Payments', 'Invoices', 'Promotions', 'Promocodes', 'Subscriptions']) {
    if (!nav.includes(item)) throw new Error(`Billing lost ${item}`)
  }
})

await step('/billing/twinfield is not a page any more', async () => {
  await p.goto(BASE + '/billing/twinfield', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1200)
  const text = await p.locator('main').innerText()
  if (!text.includes('This page does not exist')) throw new Error('route still renders something')
})

await step('old /finance/integrations link lands somewhere real', async () => {
  await p.goto(BASE + '/finance/integrations', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  if (new URL(p.url()).pathname !== '/billing/payments') throw new Error('landed on ' + p.url())
})

await step('finance.integration.* permissions are gone from the catalogue', async () => {
  await p.goto(BASE + '/system/roles?tab=matrix', { waitUntil: 'networkidle' })
  await p.waitForTimeout(2200)
  const text = await p.locator('body').innerText()
  if (text.includes('finance.integration')) throw new Error('permission still listed')
  if (!text.includes('finance.invoice.read')) throw new Error('finance permissions missing entirely')
})

await step('Finance dashboard no longer links Twinfield', async () => {
  const header = p.locator('header').first()
  await header.locator('button').filter({ hasText: /Super Admin|Finance|Support|Sales/ }).first().click()
  await header.getByRole('button', { name: /Fabienne Moreau/ }).first().click()
  await p.waitForTimeout(1000)
  await p.locator('aside').first().getByRole('link', { name: 'Home' }).click()
  await p.waitForTimeout(3000)
  const text = await p.locator('main').innerText()
  if (/twinfield/i.test(text)) throw new Error('dashboard still mentions Twinfield')
  if (!/money waiting/i.test(text)) throw new Error('finance dashboard did not render')
})

await step('the P8 secrets pattern is still demonstrated elsewhere', async () => {
  // Back to an identity that may read notification settings — Finance may not.
  const header = p.locator('header').first()
  await header.locator('button').filter({ hasText: /Finance/ }).first().click()
  await header.getByRole('button', { name: /Akshay Rao/ }).first().click()
  await p.waitForTimeout(900)
  await p.goto(BASE + '/customers/resellers/notification-settings', { waitUntil: 'networkidle' })
  await p.waitForTimeout(2500)
  const text = await p.locator('main').innerText()
  if (!text.includes('masked')) throw new Error('secrets pattern copy missing')
})

console.log(results.join('\n'))
console.log(errs.length ? `\n${errs.length} error(s):\n` + errs.slice(0, 4).join('\n') : '\nno runtime errors')
await b.close()
