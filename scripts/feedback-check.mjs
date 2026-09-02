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

const signInAs = async (name) => {
  const header = p.locator('header').first()
  await header.locator('button').filter({ hasText: /Super Admin|Finance|Support|Sales|Commercial|Abuse|Technical|Auditor/ }).first().click()
  await header.getByRole('button', { name: new RegExp(name) }).first().click()
  await p.waitForTimeout(1200)
}

/** Select the text of an element so the highlight pill appears. */
const selectText = async (selector) => {
  await p.evaluate((sel) => {
    const el = document.querySelector(sel)
    const range = document.createRange()
    range.selectNodeContents(el)
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(range)
    // The pill listens on mouseup, which a programmatic selection does not fire.
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  }, selector)
  await p.waitForTimeout(300)
}

await p.goto(BASE + '/billing/payments', { waitUntil: 'networkidle' })
await p.waitForTimeout(3000)
// Start from a clean slate — feedback deliberately survives reloads.
await p.evaluate(() => localStorage.removeItem('acp.feedback.v1'))
await p.reload({ waitUntil: 'networkidle' })
await p.waitForTimeout(2500)

await step('the widget is available on every page, to any role', async () => {
  await signInAs('Lotte Jansen') // Support L1 — no feedback permissions at all
  if (!(await p.getByRole('button', { name: 'Give feedback' }).isVisible())) throw new Error('launcher missing for Support L1')
})

await step('Support L1 can file a note', async () => {
  await p.getByRole('button', { name: 'Give feedback' }).click()
  await p.getByRole('dialog').waitFor({ timeout: 4000 })
  const dialog = p.locator('[role=dialog]')
  await dialog.getByPlaceholder(/Reseller ID should accept/).fill('Payment list needs a reseller-name filter')
  await dialog.locator('select').first().selectOption('ux')
  await dialog.locator('select').nth(1).selectOption('major')
  await dialog.getByPlaceholder(/Support agents know the company name/).fill('Agents search by company, not by numeric ID.')
  await dialog.getByRole('button', { name: /Submit feedback/ }).click()
  await p.getByText(/FB-001 recorded/).waitFor({ timeout: 5000 })
})

await step('the launcher counts what was raised on this page', async () => {
  const text = await p.getByRole('button', { name: 'Give feedback' }).innerText()
  if (!/1/.test(text)) throw new Error('launcher shows no count: ' + JSON.stringify(text))
})

await step('highlighting text offers to quote it', async () => {
  await selectText('main h1')
  await p.getByRole('button', { name: /Add feedback on this/ }).waitFor({ timeout: 3000 })
  await p.getByRole('button', { name: /Add feedback on this/ }).click()
  const dialog = p.locator('[role=dialog]')
  await dialog.getByText('Highlighted on the page').waitFor({ timeout: 4000 })
  const quote = await dialog.locator('blockquote').first().innerText()
  if (!quote.trim()) throw new Error('quote is empty')
  await dialog.getByPlaceholder(/Reseller ID should accept/).fill('This heading should say Payments and refunds')
  await dialog.locator('select').nth(0).selectOption('copy')
  await dialog.locator('select').nth(1).selectOption('minor')
  await dialog.getByRole('button', { name: /Submit feedback/ }).click()
  await p.getByText(/FB-002 recorded/).waitFor({ timeout: 5000 })
})

await step('Support L1 cannot see the Feedback section', async () => {
  const nav = await p.locator('aside').first().innerText()
  if (/^Feedback$/m.test(nav)) throw new Error('Support L1 sees the Feedback nav item')
  await p.goto(BASE + '/system/feedback', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1800)
  const text = await p.locator('main').innerText()
  if (!/permission/i.test(text)) throw new Error('no-permission state missing: ' + text.slice(0, 120))
})

await step('the Auditor is excluded too, despite holding every other read', async () => {
  await signInAs('Sofia Marin')
  await p.waitForTimeout(1200)
  const text = await p.locator('main').innerText()
  if (!/permission/i.test(text)) throw new Error('auditor could read the feedback section')
})

await step('Super Admin sees both notes in System → Feedback', async () => {
  await signInAs('Akshay Rao')
  await p.waitForTimeout(2500)
  const main = await p.locator('main').innerText()
  if (!main.includes('FB-001') || !main.includes('FB-002')) throw new Error('notes missing from the table')
  if (!/reseller-name filter/i.test(main)) throw new Error('summary text missing')
  if (!/2 notes/i.test(main)) throw new Error('header count missing')
})

await step('the sidebar badges the open notes', async () => {
  const item = p.locator('aside').first().getByRole('link', { name: /Feedback/ }).first()
  const text = await item.innerText()
  if (!/2/.test(text)) throw new Error('nav badge missing: ' + JSON.stringify(text))
})

await step('the drawer shows the highlighted quote and the captured context', async () => {
  await p.getByText('This heading should say Payments and refunds').first().click()
  const dialog = p.locator('[role=dialog]')
  await dialog.getByText('Highlighted by the reviewer').waitFor({ timeout: 4000 })
  const text = (await dialog.innerText()).toLowerCase()
  for (const want of ['Lotte Jansen', 'Support Agent (L1)', '/billing/payments', 'Viewport']) {
    if (!text.includes(want.toLowerCase())) throw new Error(`drawer missing "${want}"`)
  }
})

await step('Super Admin can triage a note', async () => {
  const dialog = p.locator('[role=dialog]')
  await dialog.locator('select').last().selectOption('accepted')
  await dialog.getByPlaceholder(/Agreed/).fill('Agreed — heading will be reworded.')
  await dialog.getByRole('button', { name: 'Apply status' }).click()
  await p.getByText(/FB-002 → Accepted/).waitFor({ timeout: 5000 })
  await p.locator('[role=dialog]').getByRole('button', { name: 'Close' }).last().click()
  await p.waitForTimeout(800)
  const main = await p.locator('main').innerText()
  if (!/Accepted/.test(main)) throw new Error('status did not change in the table')
})

await step('the status change is audited', async () => {
  await p.locator('aside').first().getByRole('link', { name: 'Audit Log' }).click()
  await p.waitForTimeout(2500)
  const main = await p.locator('main').innerText()
  if (!main.includes('system.feedback.triage')) throw new Error('no audit entry for the triage')
})

await step('feedback survives a reload, unlike the rest of the prototype data', async () => {
  await p.goto(BASE + '/system/feedback', { waitUntil: 'networkidle' })
  await p.waitForTimeout(2800)
  const main = await p.locator('main').innerText()
  if (!main.includes('FB-001') || !main.includes('FB-002')) throw new Error('notes lost on reload')
})

await step('a note cannot be deleted, only answered', async () => {
  await p.getByText('Payment list needs a reseller-name filter').first().click()
  const dialog = p.locator('[role=dialog]')
  await dialog.getByText(/cannot be deleted/i).waitFor({ timeout: 4000 })
  if ((await dialog.getByRole('button', { name: /^Delete/ }).count()) !== 0) {
    throw new Error('a delete affordance is still offered')
  }
  // Declining it keeps the record and states why.
  await dialog.locator('select').last().selectOption('wont_do')
  await dialog.getByPlaceholder(/Agreed/).fill('Out of scope for this milestone.')
  await dialog.getByRole('button', { name: 'Apply status' }).click()
  await p.getByText(/FB-001 → Won't do/).waitFor({ timeout: 5000 })
  await dialog.getByRole('button', { name: 'Close' }).last().click()
  await p.waitForTimeout(900)
  const main = await p.locator('main').innerText()
  if (!main.includes('FB-001')) throw new Error('the note vanished — it should still be listed')
  if (!/won't do/i.test(main)) throw new Error('the decline was not recorded in the table')
})

console.log(results.join('\n'))
console.log(errs.length ? `\n${errs.length} error(s):\n` + errs.slice(0, 4).join('\n') : '\nno runtime errors')
await b.close()
