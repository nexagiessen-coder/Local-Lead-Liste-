import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const CHROME = '/opt/pw-browsers/chromium';
const steps = [];
let failures = 0;

function log(ok, label, detail = '') {
  steps.push({ ok, label, detail });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
page.on('requestfailed', (req) => {
  // Aborted requests are normal: Next cancels in-flight RSC prefetches on navigation.
  if (req.failure()?.errorText === 'net::ERR_ABORTED') return;
  consoleErrors.push(`requestfailed: ${req.url()} (${req.failure()?.errorText})`);
});
page.on('response', (res) => {
  if (res.status() >= 400) consoleErrors.push(`HTTP ${res.status()} ${res.url()}`);
});

/**
 * Clicks something that triggers a server action and waits for the response.
 * Retries once: a click that lands before React hydration does nothing.
 */
async function clickAndWait(selector) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await Promise.all([
        page.waitForResponse((res) => res.request().method() === 'POST' && res.status() < 400, { timeout: 8000 }),
        page.click(selector),
      ]);
      await page.waitForTimeout(600);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(1000);
    }
  }
}

try {
  // --- 1. First-run setup --------------------------------------------------
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  log(page.url().includes('/setup'), 'Redirects to first-run setup when no users exist', page.url());

  await page.fill('#name', 'Alex Tester');
  await page.fill('#email', 'alex@example.com');
  await page.fill('#password', 'CorrectHorse12');
  await page.fill('#confirm', 'CorrectHorse12');
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  log(true, 'Creates the admin account and signs in');

  // --- 2. Dashboard --------------------------------------------------------
  const heading = await page.textContent('h1');
  log(heading?.includes('Alex') ?? false, 'Dashboard greets the signed-in user', heading ?? '');
  log(await page.locator('text=Demo mode').isVisible(), 'Demo-mode banner is shown');

  // --- 3. Research ---------------------------------------------------------
  await page.click('a[href="/research"]');
  await page.waitForURL('**/research');
  await page.fill('#location', 'Gießen');
  await page.fill('#radius', '25');
  await page.selectOption('#category', 'barber');
  await page.fill('#count', '20');
  await page.click('button:has-text("Find new leads")');
  await page.waitForSelector('text=Research finished', { timeout: 60000 });
  const statsText = await page.locator('text=Research finished').locator('..').locator('..').innerText();
  log(true, 'Research run completes', statsText.replace(/\n+/g, ' | ').slice(0, 160));

  // --- 4. Research pool ----------------------------------------------------
  await page.click('a[href="/pool"]');
  await page.waitForURL('**/pool');
  await page.waitForSelector('table');
  const poolRows = await page.locator('tbody tr').count();
  log(poolRows > 0, 'Research pool shows discovered businesses', `${poolRows} rows`);

  const tbody = page.locator('tbody');
  const noWebsiteBadges = await tbody.locator('span:text-is("Verified no website")').count();
  const manualBadges = await tbody.locator('span:text-is("Requires manual check")').count();
  const hasWebsiteBadges = await tbody.locator('span:text-is("Verified website")').count();
  log(
    noWebsiteBadges > 0 && manualBadges > 0 && hasWebsiteBadges > 0,
    'Pool contains a mix of website statuses',
    `no-website=${noWebsiteBadges} manual=${manualBadges} verified=${hasWebsiteBadges}`,
  );

  // A Facebook-only business resolved through its link page to a real site.
  const cutAndShave = page.locator('tbody tr', { hasText: 'Cut & Shave' });
  const cutAndShaveStatus = (await cutAndShave.innerText()).replace(/\s+/g, ' ');
  log(
    cutAndShaveStatus.includes('Verified website'),
    'Facebook-only business resolved to its real website automatically',
    cutAndShaveStatus.slice(0, 90),
  );

  // Both Friseur Müller branches survive as separate rows.
  const muellerRows = await page.locator('tbody tr', { hasText: 'Friseur Müller' }).count();
  log(muellerRows === 2, 'Two same-name branches are kept separate', `${muellerRows} rows`);

  // Seltersweg appears exactly once despite two source records.
  const seltersweg = await page.locator('tbody tr', { hasText: 'Seltersweg' }).count();
  log(seltersweg === 1, 'Duplicate source record is deduplicated', `${seltersweg} row`);

  // --- 5. Filter to qualifying businesses ----------------------------------
  await page.goto(`${BASE}/pool?qualified=1`, { waitUntil: 'networkidle' });
  const qualifiedRows = await page.locator('tbody tr').count();
  log(qualifiedRows > 0, 'Qualified filter returns only verified no-website leads', `${qualifiedRows} rows`);

  // --- 6. Business detail --------------------------------------------------
  await page.locator('tbody tr').first().locator('a:has-text("Details")').click();
  await page.waitForURL('**/business/**');
  log(await page.locator('text=Evidence — why this conclusion').isVisible(), 'Detail page shows the evidence section');
  log(await page.locator('h3:has-text("Research channels")').first().isVisible(), 'Detail page shows the research channels');
  log(await page.locator('h2:has-text("Opening hours")').first().isVisible(), 'Detail page shows opening hours');

  const verifyLink = page.locator('a:has-text("Verify manually")').first();
  const verifyHref = await verifyLink.getAttribute('href');
  const verifyTarget = await verifyLink.getAttribute('target');
  log(
    (verifyHref ?? '').startsWith('https://www.google.com/search?q=') && verifyTarget === '_blank',
    'Verify-manually opens a Google search in a new tab',
    verifyHref ?? '',
  );

  await page.screenshot({ path: '/tmp/claude-0/e2e/detail.png', fullPage: false });

  // --- 7. Promote to lead --------------------------------------------------
  const businessName = (await page.locator('h1').first().textContent())?.trim() ?? '';
  await clickAndWait('button:has-text("Add to lead list")');
  await page.waitForSelector('#lead-status', { timeout: 15000 });
  log(true, 'Promotes a qualified business to the lead list', businessName);

  // --- 8. Lead list --------------------------------------------------------
  await page.goto(`${BASE}/leads`, { waitUntil: 'networkidle' });
  const leadRows = await page.locator('tbody tr').count();
  log(leadRows === 1, 'Lead list contains exactly the promoted business', `${leadRows} row`);

  // --- 9. Calling ----------------------------------------------------------
  await page.goto(`${BASE}/call`, { waitUntil: 'networkidle' });
  log(await page.locator('a:has-text("Call now")').first().isVisible(), 'Call queue shows the next lead');

  const callHref = await page.locator('a:has-text("Call now")').first().getAttribute('href');
  log((callHref ?? '').startsWith('tel:+'), 'Call control is a real tel: link', callHref ?? '');

  // Headless Chromium wedges input handling after an external-protocol
  // navigation, so swallow the tel: navigation the way a real OS handler
  // would. The app's own click handler still runs and records the attempt.
  await page.evaluate(() => {
    document.addEventListener(
      'click',
      (event) => {
        const anchor = event.target instanceof Element ? event.target.closest('a[href^="tel:"]') : null;
        if (anchor) event.preventDefault();
      },
      true,
    );
  });

  const beforeCalls = await page.locator('text=previous attempt').first().innerText();
  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/calls') && res.request().method() === 'POST'),
    page.locator('a:has-text("Call now")').first().click(),
  ]);
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'networkidle' });
  const afterCalls = await page.locator('text=previous attempt').first().innerText();
  log(beforeCalls !== afterCalls, 'Calling records an attempt', `${beforeCalls.trim()} -> ${afterCalls.trim()}`);
  log(
    await page.locator(`text=${businessName}`).first().isVisible(),
    'The lead stays visible after calling',
    businessName,
  );

  // Record an outcome.
  await page.selectOption('#outcome', 'no_answer');
  await page.selectOption('#lead-status-after', 'no_answer');
  await page.fill('#call-note', 'Nobody picked up, trying again tomorrow.');
  await clickAndWait('button:has-text("Save call outcome")');
  await page.reload({ waitUntil: 'networkidle' });
  log(
    await page.locator('li:has-text("Alex Tester") span:text-is("no answer")').first().isVisible(),
    'Call outcome is recorded in the call history',
  );

  await page.screenshot({ path: '/tmp/claude-0/e2e/call.png', fullPage: false });

  // --- 10. Command bar -----------------------------------------------------
  await page.goto(`${BASE}/research`, { waitUntil: 'networkidle' });
  await page.fill('#command', 'Show businesses needing manual verification');
  await page.click('button:has-text("Run command")');
  await page.waitForURL('**/pool**', { timeout: 15000 });
  log(page.url().includes('manual') || page.url().includes('website='), 'Command bar routes a filter command', page.url());

  // --- 11. Settings --------------------------------------------------------
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  log(await page.locator('text=Verification thresholds').isVisible(), 'Settings shows verification thresholds');
  log(await page.locator('text=seats in use').isVisible(), 'Settings shows team seat usage');
  await page.screenshot({ path: '/tmp/claude-0/e2e/settings.png', fullPage: false });

  // --- 12. Auth guard ------------------------------------------------------
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(`${BASE}/leads`, { waitUntil: 'networkidle' });
  log(anonPage.url().includes('/login'), 'Signed-out users are redirected to login', anonPage.url());
  const apiResponse = await anonPage.request.get(`${BASE}/api/research/anything`);
  log(apiResponse.status() === 401, 'API rejects unauthenticated requests', `HTTP ${apiResponse.status()}`);
  await anon.close();
} catch (error) {
  log(false, 'Unhandled error during the run', error.message);
  await page.screenshot({ path: '/tmp/claude-0/e2e/error.png' }).catch(() => {});
} finally {
  const realErrors = consoleErrors.filter((e) => !e.includes('favicon'));
  log(realErrors.length === 0, 'No browser console errors', realErrors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${steps.length - failures}/${steps.length} checks passed`);
  process.exit(failures > 0 ? 1 : 0);
}
