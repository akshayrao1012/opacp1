import { chromium } from 'playwright-core'
const BASE = 'http://localhost:5181'
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const p = await b.newPage({ viewport: { width: 1560, height: 950 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
const step = async (n, fn) => { try { await fn(); console.log('ok   ' + n) } catch (e) { console.log('FAIL ' + n + ' :: ' + String(e).split('\n')[0]) } }

await p.goto(BASE + '/', { waitUntil: 'networkidle' })
await p.waitForTimeout(700)

await step('old search field is gone', async () => {
  const n = await p.getByText('Search anything — reseller, domain, payment, license, handle').count()
  if (n !== 0) throw new Error('still present ' + n)
})
await step('quick jump is in the top bar (first row)', async () => {
  const header = p.locator('header').first()
  await header.getByText('Quick jump').waitFor({ timeout: 4000 })
  if ((await header.locator('input[id^="quick-"]').count()) !== 4) throw new Error('fields not in header')
})
await step('only one quick jump row exists', async () => {
  const n = await p.getByText('Quick jump').count()
  if (n !== 1) throw new Error('found ' + n)
})
await step('omnisearch still reachable via the icon', async () => {
  await p.getByRole('button', { name: 'Open omnisearch' }).click()
  await p.getByPlaceholder(/Reseller ID, domain/).waitFor({ timeout: 3000 })
  await p.keyboard.press('Escape')
})
await step('omnisearch still reachable via ctrl+k', async () => {
  await p.keyboard.press('Control+K')
  await p.getByPlaceholder(/Reseller ID, domain/).waitFor({ timeout: 3000 })
  await p.keyboard.press('Escape')
})
await step('quick jump still jumps from the top bar', async () => {
  await p.getByLabel('DomainID/Name', { exact: true }).fill('atlasindigo.dev')
  await p.getByLabel('DomainID/Name', { exact: true }).press('Enter')
  await p.waitForTimeout(2500)
  if (!p.url().includes('/domains/atlasindigo.dev')) throw new Error('url ' + p.url())
})
await step('bar persists on a detail page', async () => {
  await p.locator('header').first().getByText('Quick jump').waitFor({ timeout: 3000 })
})
// All four fields must be inside the viewport, not merely scrollable.
const visible = await p.locator('input[id^="quick-"]').evaluateAll((els) =>
  els.map((e) => { const r = e.getBoundingClientRect(); return { id: e.id, right: Math.round(r.right), clipped: r.right > window.innerWidth || r.left < 0 } }))
console.log('field positions:', JSON.stringify(visible))
console.log(visible.some((v) => v.clipped) ? 'FAIL some fields clipped' : 'ok   all four fields visible without scrolling')
await p.screenshot({ path: 'scripts/tb-wide.png', clip: { x: 250, y: 0, width: 1310, height: 120 } })
await p.setViewportSize({ width: 1280, height: 850 })
await p.waitForTimeout(400)
await p.screenshot({ path: 'scripts/tb-1280.png', clip: { x: 250, y: 0, width: 1030, height: 120 } })
console.log(errs.length ? `\n${errs.length} error(s):\n` + errs.slice(0, 4).join('\n') : '\nno runtime errors')
await b.close()
