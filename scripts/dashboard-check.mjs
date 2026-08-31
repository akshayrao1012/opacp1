import { chromium } from 'playwright-core'

const BASE = 'http://localhost:5181'
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const p = await b.newPage({ viewport: { width: 1560, height: 1200 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()) })

const results = []
const step = async (n, fn) => {
  try { await fn(); results.push('ok   ' + n) } catch (e) { results.push('FAIL ' + n + ' :: ' + String(e).split('\n')[0]) }
}

/** Switch identity via the account menu (no reload — the store is in memory). */
const signInAs = async (name) => {
  const header = p.locator('header').first()
  await header.locator('button').filter({ hasText: /Super Admin|Finance|Support|Sales|Commercial|Abuse|Technical|Auditor/ }).first().click()
  await header.getByRole('button', { name: new RegExp(name) }).first().click()
  await p.waitForTimeout(1200)
  const home = p.locator('aside').first().getByRole('link', { name: 'Home' })
  await home.click()
  await p.waitForTimeout(2500)
  return (await p.locator('main').innerText())
}

await p.goto(BASE + '/', { waitUntil: 'networkidle' })
await p.waitForTimeout(3000)

const seen = {}

// Section headings render through text-transform: uppercase, so compare case-insensitively.
const check = (name, text, { must, mustNot }) => {
  const hay = text.toLowerCase()
  for (const m of must) if (!hay.includes(m.toLowerCase())) throw new Error(`${name}: missing "${m}"`)
  for (const m of mustNot) if (hay.includes(m.toLowerCase())) throw new Error(`${name}: should not show "${m}"`)
}

await step('Support L1 sees a queue-and-lookup dashboard', async () => {
  const text = await signInAs('Lotte Jansen')
  seen.support = text
  check('L1', text, {
    must: ['Your focus', 'My queue', 'Transfers needing ACK', 'Common tasks', 'Look up a domain'],
    mustNot: ['Money waiting on a decision', 'Queue health', 'Book of business', 'Recent Tier 3 activity', 'Risk right now'],
  })
})

await step('Finance sees money, not queues or risk', async () => {
  const text = await signInAs('Fabienne Moreau')
  seen.finance = text
  check('Finance', text, {
    must: ['Money waiting on a decision', 'Refunds awaiting approval', 'Invoices', 'Debt and balances', 'Record a payment'],
    mustNot: ['My queue', 'Risk right now', 'Book of business', 'Stuck batches'],
  })
})

await step('Finance Approver leads with approvals', async () => {
  const text = await signInAs('Hugo Vermeer')
  check('Approver', text, {
    must: ['Waiting on an approver', 'Money waiting on a decision', 'Recent Tier 3 activity', 'Refund queue'],
    mustNot: ['Queue health', 'Risk right now'],
  })
})

await step('Abuse & Compliance sees compliance queues and risk', async () => {
  const text = await signInAs('Jide Okafor')
  seen.abuse = text
  check('Abuse', text, {
    must: ['Risk right now', 'Identity verification', 'Contact validation', 'Enforcement', 'Bulk abuse form'],
    mustNot: ['Money waiting on a decision', 'Book of business', 'Queue health'],
  })
})

await step('Technical Operations sees the queue and what is stuck', async () => {
  const text = await signInAs('Nils Bergström')
  seen.techops = text
  check('TechOps', text, {
    must: ['Queue health', 'Outdated backlog', 'Stuck batches', 'Platform health', 'Task manager'],
    mustNot: ['Money waiting on a decision', 'Book of business'],
  })
})

await step('Sales sees the book of business', async () => {
  const text = await signInAs('Iris Lammers')
  seen.sales = text
  check('Sales', text, {
    must: ['Book of business', 'MRR', 'Top resellers', 'Onboarding', 'Membership plans'],
    mustNot: ['Queue health', 'Risk right now', 'Money waiting on a decision'],
  })
})

await step('Commercial sees campaigns', async () => {
  const text = await signInAs('Mira Klein')
  check('Commercial', text, {
    must: ['Campaigns', 'Promotions live', 'Book of business', 'Generate promocodes'],
    mustNot: ['Queue health', 'Risk right now', 'Waiting on an approver'],
  })
})

await step('Auditor sees the audit view and no queues', async () => {
  const text = await signInAs('Sofia Marin')
  check('Auditor', text, {
    must: ['Recent Tier 3 activity', 'Elevation', 'Audit log'],
    mustNot: ['My queue', 'Money waiting on a decision', 'Campaigns'],
  })
})

await step('Super Admin sees the platform-wide composition', async () => {
  const text = await signInAs('Akshay Rao')
  check('SuperAdmin', text, {
    must: ['Waiting on an approver', 'Money waiting on a decision', 'Risk right now', 'Queue health', 'Book of business', 'Recent Tier 3 activity'],
    mustNot: [],
  })
})

await step('the dashboards genuinely differ', async () => {
  const keys = Object.keys(seen)
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (seen[keys[i]] === seen[keys[j]]) throw new Error(`${keys[i]} and ${keys[j]} rendered identically`)
    }
  }
})

console.log(results.join('\n'))
console.log(errs.length ? `\n${errs.length} error(s):\n` + errs.slice(0, 4).join('\n') : '\nno runtime errors')
await b.close()
