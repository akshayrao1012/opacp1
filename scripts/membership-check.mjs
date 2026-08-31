import { chromium } from 'playwright-core'

const BASE = 'http://localhost:5181'
const PLANS = ['Basic', 'Professional', 'Expert', 'Supreme']
const OLD = ['Bronze', 'Silver', 'Gold', 'Platinum']

const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const p = await b.newPage({ viewport: { width: 1560, height: 1000 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()) })

const results = []
const step = async (n, fn) => {
  try { await fn(); results.push('ok   ' + n) } catch (e) { results.push('FAIL ' + n + ' :: ' + String(e).split('\n')[0]) }
}

const noOldPlans = (text, where) => {
  for (const old of OLD) {
    if (new RegExp(`\\b${old}\\b`).test(text)) throw new Error(`${where} still shows "${old}"`)
  }
}

await step('membership subscriptions use the new plans', async () => {
  await p.goto(BASE + '/customers/membership-plans', { waitUntil: 'networkidle' })
  await p.waitForTimeout(3500)
  const table = await p.locator('table').first().innerText()
  noOldPlans(table, 'Subscriptions table')
  if (!PLANS.some((plan) => table.includes(plan))) throw new Error('no new plan names in the table')
})

await step('plan filter offers exactly the four plans', async () => {
  await p.getByRole('button', { name: /Filters/ }).click()
  await p.waitForTimeout(600)
  const panel = await p.locator('body').innerText()
  for (const plan of PLANS) if (!panel.includes(plan)) throw new Error(`filter missing ${plan}`)
  noOldPlans(panel, 'Filter panel')
  await p.getByRole('button', { name: /Filters/ }).click()
})

await step('rate limits scope by the new plans', async () => {
  await p.goto(BASE + '/customers/membership-plans?tab=rate-limits', { waitUntil: 'networkidle' })
  await p.waitForTimeout(2500)
  const table = await p.locator('table').first().innerText()
  noOldPlans(table, 'Rate limits table')
})

await step('reseller list filter uses the new plans', async () => {
  await p.goto(BASE + '/customers/resellers', { waitUntil: 'networkidle' })
  await p.waitForTimeout(3000)
  const table = await p.locator('table').first().innerText()
  noOldPlans(table, 'Reseller table')
})

await step('reseller detail change-membership offers a plan choice', async () => {
  await p.goto(BASE + '/customers/resellers/100000', { waitUntil: 'networkidle' })
  await p.waitForTimeout(2000)
  await p.getByRole('button', { name: 'Change membership' }).click()
  await p.getByText('New plan').waitFor({ timeout: 4000 })
  const options = await p.locator('select').last().locator('option').allInnerTexts()
  if (options.length !== 3) throw new Error(`expected 3 options (current plan excluded), got ${options.join(',')}`)
  for (const o of options) if (!PLANS.includes(o)) throw new Error(`unexpected option ${o}`)
})

await step('bruteforce plan rules use the new plans', async () => {
  await p.goto(BASE + '/risk/bruteforce?tab=activation', { waitUntil: 'networkidle' })
  await p.waitForTimeout(2500)
  const table = await p.locator('table').first().innerText()
  noOldPlans(table, 'Bruteforce rules')
})

await step('WPP subscriptions mark Expert/Supreme as included', async () => {
  await p.goto(BASE + '/billing/subscriptions', { waitUntil: 'networkidle' })
  await p.waitForTimeout(2500)
  const table = await p.locator('table').first().innerText()
  if (!table.toLowerCase().includes('included')) throw new Error('no included-in-plan rows visible')
})

console.log(results.join('\n'))
console.log(errs.length ? `\n${errs.length} error(s):\n` + errs.slice(0, 4).join('\n') : '\nno runtime errors')
await b.close()
