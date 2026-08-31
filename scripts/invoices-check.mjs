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

await p.goto(BASE + '/billing/invoices', { waitUntil: 'networkidle' })
await p.waitForTimeout(3000)

await step('page lists invoices, not runs', async () => {
  await p.getByRole('heading', { name: 'Invoices' }).first().waitFor({ timeout: 5000 })
  await p.getByText(/INV-2026-/).first().waitFor({ timeout: 15000 })
})

await step('no run or create affordance anywhere on the page', async () => {
  const text = await p.locator('body').innerText()
  for (const phrase of ['Start run', 'Create invoice', 'Invoice run', 'Current run', 'dry run']) {
    if (text.includes(phrase)) throw new Error(`still shows "${phrase}"`)
  }
  for (const name of ['Start run', 'Create invoice']) {
    if ((await p.getByRole('button', { name }).count()) !== 0) throw new Error(`button "${name}" present`)
  }
})

await step('invoice columns are present', async () => {
  const text = (await p.locator('table').first().innerText()).toLowerCase()
  for (const col of ['invoice', 'issued', 'status', 'gross', 'vat', 'outstanding', 'due', 'dunning']) {
    if (!text.includes(col)) throw new Error(`missing column ${col}`)
  }
})

await step('detail drawer shows lines and totals', async () => {
  await p.locator('table tbody tr').first().click()
  await p.getByText('Lines').first().waitFor({ timeout: 5000 })
  const drawer = await p.locator('body').innerText()
  if (!drawer.includes('Outstanding')) throw new Error('no outstanding figure in the drawer')
  await p.keyboard.press('Escape')
})

await step('filters include status and VAT scheme', async () => {
  await p.getByRole('button', { name: /Filters/ }).click()
  await p.getByText('VAT scheme').first().waitFor({ timeout: 3000 })
  await p.getByText('Dunning level').first().waitFor({ timeout: 3000 })
})

await step('export is still available (read-only affordance)', async () => {
  await p.getByRole('button', { name: 'Export' }).waitFor({ timeout: 4000 })
})

await step('finance.invoice.run is gone from the permission catalogue', async () => {
  await p.goto(BASE + '/system/roles?tab=matrix', { waitUntil: 'networkidle' })
  await p.waitForTimeout(2000)
  const text = await p.locator('body').innerText()
  if (text.includes('finance.invoice.run')) throw new Error('permission still listed')
  if (!text.includes('finance.invoice.settle')) throw new Error('replacement permission missing')
})

await step('old /finance/invoice-runs link still redirects', async () => {
  await p.goto(BASE + '/finance/invoice-runs', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  if (new URL(p.url()).pathname !== '/billing/invoices') throw new Error('landed on ' + p.url())
})

console.log(results.join('\n'))
console.log(errs.length ? `\n${errs.length} error(s):\n` + errs.slice(0, 4).join('\n') : '\nno runtime errors')
await b.close()
