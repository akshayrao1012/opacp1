import { chromium } from 'playwright-core'
const BASE = 'http://localhost:5181'
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const p = await b.newPage({ viewport: { width: 1560, height: 1000 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
const step = async (n, fn) => { try { await fn(); console.log('ok   ' + n) } catch (e) { console.log('FAIL ' + n + ' :: ' + String(e).split('\n')[0]) } }

await p.goto(BASE + '/', { waitUntil: 'networkidle' })
await p.waitForTimeout(700)

await step('Go to Tld → Extension details', async () => {
  await p.getByLabel('Go to Tld', { exact: true }).fill('com')
  await p.getByLabel('Go to Tld', { exact: true }).press('Enter')
  await p.waitForTimeout(2000)
  if (!p.url().endsWith('/catalog/extensions/com')) throw new Error('url ' + p.url())
  await p.getByText('Main info').first().waitFor({ timeout: 4000 })
})

const LABELS = {
  main: ['Extension', 'Tags (labels)', 'Active', 'Show on public site', 'Minimal order period', 'Maximum order period',
         'Minimal renew period', 'Maximum renew period', 'Minimum domain length', 'Status', 'Current RouteId', 'Final RouteId',
         'New gTLD', 'Premium is supported', 'Billing handle is supported', 'WPP is supported'],
  transfer: ['Transfer possible', 'Transfer cancel is supported', 'Trade possible', 'Modify owner allowed',
             'Transfer billed as renew', 'Locking allowed', 'Renewal offset', 'Soft quarantine', 'Hard quarantine',
             'FOA strategy', 'Registrant requirements'],
  nameservers: ['Nameservers are required', 'Minimum nameservers', 'Maximum nameservers', 'Glue records supported', 'IPv6 supported'],
  pricing: ['Action', 'Period', 'Price', 'Cost', 'Margin'],
  requirements: ['Local presence required', 'Country codes allowed for owner', 'Registrant verification required', 'Trustee service available', 'Registry lock available'],
}
for (const [tab, labels] of Object.entries(LABELS)) {
  await p.goto(`${BASE}/catalog/extensions/com?tab=${tab}`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(500)
  const hay = (await p.locator('body').innerText()).toLowerCase()
  const missing = labels.filter((l) => !hay.includes(l.toLowerCase()))
  console.log(`${missing.length ? 'MISSING' : 'ok     '} ${tab.padEnd(12)} ${missing.length ? missing.join(' | ') : labels.length + ' labels present'}`)
}

await step('unknown TLD still refused', async () => {
  await p.goto(BASE + '/catalog/extensions/zzzz', { waitUntil: 'networkidle' })
  await p.getByText('Extension not found').waitFor({ timeout: 3000 })
})
await step('extensions list row links to the detail screen', async () => {
  await p.goto(BASE + '/catalog/extensions', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  const href = await p.locator('table tbody tr a').first().getAttribute('href')
  if (!href?.startsWith('/catalog/extensions/')) throw new Error('href ' + href)
})
await step('edit pencil opens the T2 confirmation', async () => {
  await p.goto(BASE + '/catalog/extensions/com?tab=main', { waitUntil: 'networkidle' })
  await p.waitForTimeout(600)
  await p.getByLabel('Edit Active').click()
  await p.getByText('T2 — sensitive write').waitFor({ timeout: 3000 })
  await p.keyboard.press('Escape')
})
await p.goto(`${BASE}/catalog/extensions/com`, { waitUntil: 'networkidle' })
await p.waitForTimeout(700)
await p.screenshot({ path: 'scripts/ext.png', clip: { x: 250, y: 60, width: 1310, height: 930 } })
console.log(errs.length ? `\n${errs.length} error(s):\n` + errs.slice(0, 4).join('\n') : '\nno runtime errors')
await b.close()
