import { chromium } from 'playwright-core'
const BASE = 'http://localhost:5181'
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const p = await b.newPage({ viewport: { width: 1560, height: 1000 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()) })
const step = async (n, fn) => { try { await fn(); console.log('ok   ' + n) } catch (e) { console.log('FAIL ' + n + ' :: ' + String(e).split('\n')[0]) } }

await p.goto(BASE + '/system/roles?tab=users', { waitUntil: 'networkidle' })
await p.waitForTimeout(900)

let before = 0
await step('Users tab shows the Add user button', async () => {
  before = await p.locator('button:has-text("Edit access")').count()
  await p.getByRole('button', { name: /Add user/ }).waitFor({ timeout: 4000 })
})

await step('drawer opens with validation blocking submit', async () => {
  await p.getByRole('button', { name: /Add user/ }).click()
  await p.getByText('What this does and does not do').waitFor({ timeout: 3000 })
  const disabled = await p.getByRole('button', { name: 'Create user' }).isDisabled()
  if (!disabled) throw new Error('Create user enabled with an empty form')
})

await step('duplicate email is rejected', async () => {
  await p.getByPlaceholder('Anna Bakker').fill('Test Person')
  await p.getByPlaceholder('anna.bakker@openprovider.com').fill('akshay.rao@procys.com')
  await p.getByText('A user with this email already exists').waitFor({ timeout: 3000 })
})

await step('role selection shows the effective-permissions preview', async () => {
  await p.getByPlaceholder('anna.bakker@openprovider.com').fill('test.person@openprovider.com')
  await p.locator('label:has-text("Support Agent (L1)") input[type=checkbox]').first().check()
  await p.getByText('What this person would be able to do').waitFor({ timeout: 3000 })
})

await step('reason + ticket still required', async () => {
  const disabled = await p.getByRole('button', { name: 'Create user' }).isDisabled()
  if (!disabled) throw new Error('Create user enabled without reason/ticket')
})

await step('creating the user adds a row', async () => {
  await p.getByPlaceholder(/New starter on the Support team/).fill('New starter on the Support team, approved by their lead.')
  await p.getByPlaceholder('ZD-448120').fill('ZD-449001')
  await p.getByRole('button', { name: 'Create user' }).click()
  await p.waitForTimeout(900)
  await p.getByText('Test Person').first().waitFor({ timeout: 4000 })
  const after = await p.locator('button:has-text("Edit access")').count()
  if (after !== before + 1) throw new Error(`rows ${before} → ${after}`)
})

await step('new user appears in the account switcher', async () => {
  const account = p.locator('header').first().getByRole('button', { name: /Akshay Rao/ }).first()
  await account.click()
  await p.locator('header').first().getByRole('button', { name: /Test Person/ }).waitFor({ timeout: 3000 })
  await account.click()
})

await step('creation is in the audit log', async () => {
  await p.getByRole('link', { name: 'Audit Log' }).click()
  await p.waitForTimeout(1500)
  await p.getByText('admin.user.write').first().waitFor({ timeout: 5000 })
})

await p.goto(BASE + '/system/roles?tab=users', { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
await p.getByRole('button', { name: /Add user/ }).click()
await p.waitForTimeout(500)
await p.screenshot({ path: 'scripts/adduser.png', clip: { x: 700, y: 0, width: 860, height: 1000 } })
console.log(errs.length ? `\n${errs.length} error(s):\n` + errs.slice(0, 4).join('\n') : '\nno runtime errors')
await b.close()
