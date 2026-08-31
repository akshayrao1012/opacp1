/**
 * Interaction smoke: exercises the flows that matter most — RBAC switching,
 * elevation, the bulk console end to end, and export.
 */
import { chromium } from 'playwright-core'

const BASE = process.env.BASE ?? 'http://localhost:4173'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1560, height: 950 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()) })
const step = async (name, fn) => {
  try { await fn(); console.log('ok   ' + name) } catch (e) { console.log('FAIL ' + name + ' :: ' + String(e).split('\n')[0]) }
}

await page.goto(BASE + '/', { waitUntil: 'networkidle' })

await step('sign in as Support L1 hides Admin group', async () => {
  await page.getByRole('button', { name: /Akshay Rao/ }).click()
  await page.getByRole('button', { name: /Lotte Jansen/ }).click()
  await page.waitForTimeout(400)
  const adminVisible = await page.getByRole('button', { name: 'Admin & Governance' }).count()
  if (adminVisible !== 0) throw new Error('Admin group still visible for L1')
  const bulk = await page.getByRole('link', { name: 'Bulk operations' }).count()
  if (bulk !== 0) throw new Error('Bulk console visible for L1')
})

await step('L1 hitting a forbidden URL gets the no-permission state', async () => {
  await page.goto(BASE + '/admin/audit', { waitUntil: 'networkidle' })
  await page.getByText('You do not have access').waitFor({ timeout: 4000 })
})

await step('sign back in as Super Admin', async () => {
  await page.getByRole('button', { name: /Lotte Jansen/ }).click()
  await page.getByRole('button', { name: /Akshay Rao/ }).first().click()
  await page.waitForTimeout(500)
  const admin = await page.getByRole('button', { name: 'Admin & Governance' }).count()
  if (!admin) throw new Error('Admin group missing for Super Admin')
})

await step('bulk console: sample rows validate', async () => {
  await page.goto(BASE + '/ops/bulk?op=domain_abuse', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Load sample rows/ }).click()
  await page.getByRole('textbox').first().fill('') // abuse_ref empty check
  await page.getByRole('button', { name: /Load sample rows/ }).click()
  await page.waitForTimeout(300)
})

await step('bulk console: elevation required before execution', async () => {
  const gate = await page.getByText('Elevation required').count()
  if (!gate) throw new Error('no elevation gate shown for T3 operation')
})

await step('request elevation', async () => {
  await page.getByRole('button', { name: /Request elevation/ }).first().click()
  await page.getByPlaceholder(/Abuse escalation/).fill('Phishing campaign NL-2026-8841 confirmed by SIDN')
  await page.getByPlaceholder('ZD-448377').fill('ZD-448377')
  await page.getByRole('button', { name: /Elevate for 60 minutes/ }).click()
  await page.getByText('Elevated access active').waitFor({ timeout: 4000 })
})

await step('table export produces a job', async () => {
  await page.goto(BASE + '/catalog/promocodes', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByText('Export queued').waitFor({ timeout: 5000 })
})

await step('omnisearch resolves a reseller id', async () => {
  await page.keyboard.press('Control+K')
  await page.getByPlaceholder(/Reseller ID, domain/).fill('100000')
  await page.waitForTimeout(900)
  const hits = await page.getByText(/Reseller/).count()
  if (!hits) throw new Error('no omnisearch hits')
  await page.keyboard.press('Escape')
})

// In-app navigation: the audit log lives in memory, so a hard reload would
// (correctly) start from the seeded state with none of this session's entries.
await step('audit log records this session activity', async () => {
  await page.getByRole('button', { name: 'Admin & Governance' }).click()
  await page.getByRole('link', { name: 'Audit log' }).click()
  await page.waitForTimeout(1500)
  await page.getByText('export.run').first().waitFor({ timeout: 6000 })
})

console.log(errs.length ? `\n${errs.length} runtime error(s):\n` + errs.slice(0, 8).join('\n') : '\nno runtime errors')
await browser.close()
