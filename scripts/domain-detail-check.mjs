import { chromium } from 'playwright-core'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:5181'
const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })

// A known seeded domain, so the check does not depend on the list page rendering.
const first = process.env.DOMAIN ?? 'atlasindigo.dev'
console.log('opening domain:', first)
await page.goto(BASE + '/domains/' + encodeURIComponent(first), { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

const tabs = ['overview','contacts','dns','registry','billing','mutations','abuse','danger']
const labels = {
  overview: ['Creation date','Order date','Active date','Renewal date','Expiration date at registry','Controller class','Current provider','Private comment','Deletion reasons','Is deleted','Auto-renew settings','Reseller auto-renew settings','Locked status','WPP enabled','Consent for publishing','Is blocked','Is abusive','Is client hold enabled','Is parked','Uses domicile','Has active Sectigo zone','Action status'],
  contacts: ['Owner (registrant)','Admin','Tech','Is email verified','Is phone verified','Is owner contact verified','Owner verification status','Start verification','Verify contact'],
  dns: ['Nameservers','IPv6','Add','Update nameservers','Nameserver group','DNSSEC enabled','Has active Sectigo zone'],
  registry: ['Authorization code','Send auth-code via SMS','Send auth-code via email','Restart FOA mail sending','Manual FOA'],
  billing: ['Invoice lines','Gross / cost','Complete opened lines','Cancel opened lines','Refund'],
  mutations: ['Domain mutations','ACP activity'],
  abuse: ['Mark domain as abusive','ReplyTo','Notify domain holder options','Action count: notify','Action count: hold','Action count: delete','Domain abuse history'],
  danger: ['Delete in OP + Registry','with glue records','Delete only in OP','Restore in OP + Registry','Restore only in OP','clientHold'],
}
for (const t of tabs) {
  await page.goto(`${BASE}/domains/${encodeURIComponent(first)}?tab=${t}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const text = await page.locator('body').innerText()
  const hay = text.toLowerCase()
  const missing = labels[t].filter((l) => !hay.includes(l.toLowerCase()))
  console.log(`${missing.length ? 'MISSING' : 'ok     '} ${t.padEnd(10)} ${missing.length ? missing.join(' | ') : `${labels[t].length} labels present`}`)
}
await page.goto(`${BASE}/domains/${encodeURIComponent(first)}?tab=overview`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.screenshot({ path: 'scripts/dd-overview.png', clip: { x: 260, y: 90, width: 1200, height: 900 } })
await page.goto(`${BASE}/domains/${encodeURIComponent(first)}?tab=danger`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.screenshot({ path: 'scripts/dd-danger.png', clip: { x: 260, y: 90, width: 1200, height: 900 } })
console.log(errs.length ? `\n${errs.length} error(s):\n` + errs.slice(0,5).join('\n') : '\nno runtime errors')
await browser.close()
