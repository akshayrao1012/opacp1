import { chromium } from 'playwright-core'
const BASE = 'http://localhost:5181'
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const page = await browser.newPage({ viewport: { width: 1560, height: 950 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
const step = async (name, fn) => {
  try { await fn(); console.log('ok   ' + name) } catch (e) { console.log('FAIL ' + name + ' :: ' + String(e).split('\n')[0]) }
}
const jump = async (field, value) => {
  await page.getByLabel(field, { exact: true }).fill(value)
  await page.getByLabel(field, { exact: true }).press('Enter')
  await page.waitForTimeout(2500)
  return page.url().replace(BASE, '')
}

await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)

await step('bar is present on the dashboard', async () => {
  await page.getByText('Quick jump').waitFor({ timeout: 4000 })
})

await step('domain by name → domain detail', async () => {
  const url = await jump('DomainID/Name', 'atlasindigo.dev')
  if (url !== '/domains/atlasindigo.dev') throw new Error('got ' + url)
})

await step('bar persists on the domain detail page', async () => {
  await page.getByText('Quick jump').waitFor({ timeout: 3000 })
})

await step('domain by numeric ID → domain detail', async () => {
  const url = await jump('DomainID/Name', '5000056')
  if (!url.startsWith('/domains/')) throw new Error('got ' + url)
})

await step('reseller by ID → reseller detail', async () => {
  const url = await jump('ResellerID/Company', '100000')
  if (url !== '/resellers/100000') throw new Error('got ' + url)
})

await step('reseller by company name → detail or filtered search', async () => {
  const url = await jump('ResellerID/Company', 'Ferro')
  if (!url.startsWith('/resellers')) throw new Error('got ' + url)
})

await step('unknown TLD is refused with a toast, no navigation', async () => {
  const before = page.url()
  await jump('Go to Tld', 'zzzznope')
  if (page.url() !== before) throw new Error('navigated anyway to ' + page.url())
  await page.getByText('not found').first().waitFor({ timeout: 3000 })
})

await step('known TLD → extension catalogue', async () => {
  const url = await jump('Go to Tld', '.com')
  if (!url.startsWith('/catalog/extensions')) throw new Error('got ' + url)
})

await step('handle → contact validation', async () => {
  const url = await jump('User (handle)', 'OP-123456')
  if (!url.startsWith('/customers/contact-validation')) throw new Error('got ' + url)
})

await step('alt+d focuses the domain field', async () => {
  await page.keyboard.press('Alt+d')
  const id = await page.evaluate(() => document.activeElement?.id)
  if (id !== 'quick-domain') throw new Error('focused ' + id)
})

await step('fields hidden for a role without the permission', async () => {
  await page.getByRole('button', { name: /Akshay Rao/ }).click()
  await page.getByRole('button', { name: /Mira Klein/ }).click()  // Commercial: no customer.contact.read
  await page.waitForTimeout(600)
  const handle = await page.getByLabel('User (handle)', { exact: true }).count()
  const tld = await page.getByLabel('Go to Tld', { exact: true }).count()
  if (handle !== 0) throw new Error('handle field visible for Commercial')
  if (tld !== 1) throw new Error('tld field should stay visible for Commercial')
})

await page.screenshot({ path: 'scripts/qs.png', clip: { x: 0, y: 0, width: 1560, height: 200 } })
console.log(errs.length ? `\n${errs.length} error(s):\n` + errs.slice(0, 5).join('\n') : '\nno runtime errors')
await browser.close()
