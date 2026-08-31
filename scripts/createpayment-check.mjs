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

/** Switch identity through the account menu — no reload, the store is in memory. */
const signInAs = async (name) => {
  const header = p.locator('header').first()
  await header.locator('button').filter({ hasText: /Super Admin|Finance|Support|Sales|Commercial|Abuse|Technical|Auditor/ }).first().click()
  await header.getByRole('button', { name: new RegExp(name) }).first().click()
  await p.waitForTimeout(800)
}

/** In-app sidebar navigation. Names are not exact — items can carry a badge count. */
const navTo = async (group, item) => {
  const sidebar = p.locator('aside').first()
  if ((await sidebar.getByRole('link', { name: item }).count()) === 0) {
    await sidebar.getByRole('button', { name: group }).click()
    await p.waitForTimeout(400)
  }
  await sidebar.getByRole('link', { name: item }).first().click()
  await p.waitForTimeout(2500)
}

await p.goto(BASE + '/billing/payments', { waitUntil: 'networkidle' })
await p.waitForTimeout(2500)

// Hugo Vermeer (Finance Approver) holds payment.create, payment.create.approve,
// admin.job.read and admin.audit.read — one identity covers the whole flow.
await step('Finance Approver sees the Create payment button', async () => {
  await signInAs('Hugo Vermeer')
  await p.waitForTimeout(1500)
  await p.getByRole('button', { name: 'Create payment' }).waitFor({ timeout: 8000 })
})

await step('empty form blocks submit', async () => {
  await p.getByRole('button', { name: 'Create payment' }).click()
  await p.getByText('This credits a balance, it does not move money').waitFor({ timeout: 3000 })
  if (!(await p.locator('button:has-text("Create payment")').last().isDisabled())) throw new Error('submit enabled on an empty form')
})

await step('unknown reseller ID is rejected', async () => {
  await p.getByPlaceholder('100341').fill('999999')
  await p.getByText('No reseller with that ID').waitFor({ timeout: 3000 })
})

await step('valid reseller shows balance before and after', async () => {
  await p.getByPlaceholder('100341').fill('100000')
  await p.getByPlaceholder('0.00').fill('250.50')
  await p.getByText('After this payment').waitFor({ timeout: 3000 })
})

await step('reason and ticket are required', async () => {
  if (!(await p.locator('button:has-text("Create payment")').last().isDisabled())) throw new Error('submit enabled without reason/ticket')
})

await step('below threshold: recorded and credited immediately', async () => {
  await p.getByPlaceholder(/Bank transfer received today/).fill('Bank transfer arrived without a matching reference.')
  await p.getByPlaceholder('ZD-448120').fill('ZD-449100')
  await p.locator('button:has-text("Create payment")').last().click()
  await p.getByText(/credited to/).first().waitFor({ timeout: 8000 })
  await p.getByText(/PAY-M/).first().waitFor({ timeout: 25000 })
})

await step('above threshold becomes an approval request', async () => {
  await p.getByRole('button', { name: 'Create payment' }).click()
  await p.getByPlaceholder('100341').fill('100000')
  await p.getByPlaceholder('0.00').fill('25000')
  await p.getByText(/Above the .* threshold/).waitFor({ timeout: 3000 })
  await p.getByPlaceholder(/Bank transfer received today/).fill('Large bank transfer, reconciliation pending.')
  await p.getByPlaceholder('ZD-448120').fill('ZD-449101')
  await p.getByRole('button', { name: 'Request approval' }).click()
  await p.getByText(/sent for approval/).first().waitFor({ timeout: 8000 })
})

await step('pending approval reaches the job centre', async () => {
  await navTo('System', 'Job Centre')
  await p.getByText(/Recorded payment/).first().waitFor({ timeout: 10000 })
})

await step('creation is in the audit log', async () => {
  await navTo('System', 'Audit Log')
  await p.getByText('payment.create').first().waitFor({ timeout: 10000 })
})

await step('Support L1 cannot see the button', async () => {
  await signInAs('Lotte Jansen')
  await navTo('Billing', 'Payments')
  if ((await p.getByRole('button', { name: 'Create payment' }).count()) !== 0) throw new Error('visible for Support L1')
})

await step('Sales cannot see the button either', async () => {
  await signInAs('Iris Lammers')
  await navTo('Billing', 'Payments')
  if ((await p.getByRole('button', { name: 'Create payment' }).count()) !== 0) throw new Error('visible for Sales')
})

console.log(results.join('\n'))
console.log(errs.length ? `\n${errs.length} error(s):\n` + errs.slice(0, 4).join('\n') : '\nno runtime errors')
await b.close()
