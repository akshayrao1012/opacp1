import { chromium } from 'playwright-core'

const BASE = 'http://localhost:5181'
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const p = await b.newPage({ viewport: { width: 1560, height: 1100 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()) })

const results = []
const step = async (n, fn) => {
  try { await fn(); results.push('ok   ' + n) } catch (e) { results.push('FAIL ' + n + ' :: ' + String(e).split('\n')[0]) }
}

/** Every control in the drawer except the reseller field. */
const gated = () => [
  p.getByPlaceholder('0.00'),
  p.getByPlaceholder('NL91RABO0123456789 / 20260827-0042'),
  p.getByPlaceholder('Bank transfer received 2026-08-27'),
  p.getByPlaceholder(/Bank transfer received today/),
  p.getByPlaceholder('ZD-448120'),
]

const allDisabled = async (want) => {
  for (const loc of gated()) {
    const disabled = await loc.isDisabled()
    if (disabled !== want) {
      const ph = await loc.getAttribute('placeholder')
      throw new Error(`"${ph}" disabled=${disabled}, expected ${want}`)
    }
  }
  // Type, Method and Currency — scoped to the drawer, so the table's page-size
  // select behind it is not mistaken for a form field.
  const selects = p.locator('[role=dialog]').locator('select')
  const n = await selects.count()
  if (n < 3) throw new Error(`expected 3 selects in the drawer, found ${n}`)
  for (let i = 0; i < n; i++) {
    if ((await selects.nth(i).isDisabled()) !== want) throw new Error(`drawer select ${i} disabled=${!want}, expected ${want}`)
  }
}

// Sign in as Finance, who holds payment.create.
await p.goto(BASE + '/billing/payments', { waitUntil: 'networkidle' })
await p.waitForTimeout(3000)
const header = p.locator('header').first()
await header.locator('button').filter({ hasText: /Super Admin|Finance|Support|Sales/ }).first().click()
await header.getByRole('button', { name: /Fabienne Moreau/ }).first().click()
await p.waitForTimeout(2500)

await step('drawer opens with every field but Reseller ID disabled', async () => {
  await p.getByRole('button', { name: 'Create payment' }).click()
  await p.getByText('Start with the reseller').waitFor({ timeout: 4000 })
  if (await p.getByPlaceholder('100341').isDisabled()) throw new Error('Reseller ID should stay enabled')
  await allDisabled(true)
})

await step('an unknown reseller ID keeps them disabled', async () => {
  await p.getByPlaceholder('100341').fill('999999')
  await p.getByText('No reseller with that ID').waitFor({ timeout: 3000 })
  await allDisabled(true)
})

await step('a partial ID keeps them disabled', async () => {
  await p.getByPlaceholder('100341').fill('100')
  await p.waitForTimeout(500)
  await allDisabled(true)
})

await step('a valid reseller ID enables the rest', async () => {
  await p.getByPlaceholder('100341').fill('100000')
  await p.waitForTimeout(900)
  await allDisabled(false)
  // The lock explainer goes away once it is no longer true.
  if ((await p.getByText('Start with the reseller').count()) !== 0) throw new Error('lock hint still shown')
})

await step('clearing the reseller re-locks the form', async () => {
  await p.getByPlaceholder('100341').fill('')
  await p.waitForTimeout(600)
  await allDisabled(true)
})

await step('the flow still completes once unlocked', async () => {
  await p.getByPlaceholder('100341').fill('100000')
  await p.waitForTimeout(900)
  await p.getByPlaceholder('0.00').fill('120.00')
  await p.getByPlaceholder(/Bank transfer received today/).fill('Bank transfer arrived without a reference.')
  await p.getByPlaceholder('ZD-448120').fill('ZD-449200')
  const submit = p.locator('button:has-text("Create payment")').last()
  if (await submit.isDisabled()) throw new Error('submit still disabled with a complete form')
  await submit.click()
  await p.getByText(/credited to/).first().waitFor({ timeout: 8000 })
})

console.log(results.join('\n'))
console.log(errs.length ? `\n${errs.length} error(s):\n` + errs.slice(0, 4).join('\n') : '\nno runtime errors')
await b.close()
