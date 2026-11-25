const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '../..');
const FIXTURE_PATH = path.join(ROOT_DIR, 'tests/fixtures/ai-art-15papers.request.json');
const fixturePapers = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')).papers;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function ping() {
      http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error(`Server returned ${res.statusCode}`));
        setTimeout(ping, 150);
      }).on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error('Server failed to start within timeout'));
        setTimeout(ping, 150);
      });
    }
    ping();
  });
}

function buildEpmcStub(papers) {
  return {
    hitCount: papers.length,
    resultList: {
      result: papers.map((p, i) => ({
        id: p.pmid || p.id || String(i + 1),
        source: p.pmid ? 'MED' : 'PPR',
        pmid: p.pmid || '',
        pmcid: p.pmcid || '',
        doi: p.doi || '',
        title: p.title,
        authorString: Array.isArray(p.authors) ? p.authors.join(', ') : (p.authors || ''),
        journalTitle: p.journal || 'Scholarly Journal',
        pubYear: String(p.year || 2023),
        citedByCount: Number(p.citation_count || 10),
        abstractText: p.abstract || p.abstract_summary || '',
        pubTypeList: { pubType: [p.study_type || 'Journal Article'] }
      }))
    }
  };
}

function buildProxyStub(papers, sourceName) {
  return {
    statusCode: 200,
    total: papers.length,
    data: papers.map((p, i) => ({
      id: p.id || p.doi || p.pmid || `${sourceName}-${i}`,
      title: p.title,
      authors: Array.isArray(p.authors) ? p.authors : ['Unknown Authors'],
      journal: p.journal || 'Academic Journal',
      year: p.year || 2023,
      publication_date: String(p.year || 2023),
      abstract: p.abstract || p.abstract_summary || '',
      abstract_summary: p.abstract_summary || p.abstract || '',
      citation_count: Number(p.citation_count || 5),
      doi: p.doi || '',
      pmid: p.pmid || '',
      pmcid: p.pmcid || '',
      source: sourceName,
      sources: [sourceName === 'openalex' ? 'OpenAlex' : 'Crossref']
    }))
  };
}

async function setupRetrievalStubs(page) {
  const epmcBody = JSON.stringify(buildEpmcStub(fixturePapers));
  const openalexBody = JSON.stringify(buildProxyStub(fixturePapers.slice(0, 6), 'openalex'));
  const crossrefBody = JSON.stringify(buildProxyStub(fixturePapers.slice(6, 12), 'crossref'));

  await page.route('https://www.ebi.ac.uk/europepmc/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: epmcBody })
  );
  await page.route('**/api/s2**', (route) =>
    route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Rate limit exceeded' }) })
  );
  await page.route('**/api/openalex**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: openalexBody })
  );
  await page.route('**/api/crossref**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: crossrefBody })
  );
}

async function runSteps1To5(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  await page.fill('#topic-input', 'Artificial Intelligence in Assisted Reproduction: Clinical Evidence, Current Limitations, Bias, and the Future of Embryo Selection');
  await page.fill('#short-title-input', 'AI in ART');
  await page.fill('#target-papers-input', '15');
  await page.fill('#start-year-input', '2019');
  await page.selectOption('#audience-select', 'Consultants');
  await page.fill('#slide-count-input', '15');
  await page.selectOption('#density-select', 'Short bullet points');
  await page.click('.visual-style-btn[data-value="Scientific pictorial"]');

  await page.click('#btn-to-keywords');
  await expect(page.locator('#step-2-section')).toBeVisible({ timeout: 15000 });
  expect(new URL(page.url()).search).toBe('');

  await page.click('#btn-approve-keywords');
  await expect(page.locator('#step-3-section')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#pmc-query-input')).not.toHaveValue('');
  await expect(page.locator('#s2-query-input')).not.toHaveValue('');

  await setupRetrievalStubs(page);
  await page.click('#btn-approve-strategy');

  await expect(page.locator('#step-6-section')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#papers-list .paper-card').first()).toBeVisible({ timeout: 15000 });
}

test.describe('Preppt Browser Smoke Suite', () => {
  let serverProc;
  let baseUrl;

  test.beforeAll(async () => {
    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverProc = spawn(process.execPath, [path.join(ROOT_DIR, 'server.js')], {
      cwd: ROOT_DIR,
      env: { ...process.env, PORT: String(port), PREPPT_OFFLINE: '1' },
      stdio: 'pipe'
    });
    await waitForServer(`${baseUrl}/`);
  });

  test.afterAll(async () => {
    if (serverProc && !serverProc.killed) {
      serverProc.kill();
    }
  });

  test('A: happy path end-to-end workflow and .docx export', async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Stubbed /api/s2 429 intentionally exercises fallback path
        if (!text.includes('status of 429')) {
          consoleErrors.push(text);
        }
      }
    });

    await runSteps1To5(page, baseUrl);

    const cardCount = await page.locator('#papers-list .paper-card').count();
    expect(cardCount).toBeGreaterThanOrEqual(5);

    const paperListText = await page.locator('#papers-list').innerText();
    expect(paperListText).not.toMatch(/\bundefined\b/);
    expect(paperListText).not.toMatch(/\bNaN\b/);

    await page.click('#btn-approve-papers');

    await expect(page.locator('#step-8-section')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.slide-card').first()).toBeVisible({ timeout: 15000 });
    const slideCount = await page.locator('.slide-card').count();
    expect(slideCount).toBeGreaterThanOrEqual(1);

    const bodyText = await page.locator('#step-8-section').innerText();
    expect(bodyText).not.toMatch(/failed generator self-check/i);

    await expect(page.locator('#validation-summary-line')).toContainText(/0 failed/i, { timeout: 15000 });
    const checklistFailCount = await page.locator('#validation-checklist .check-fail, #validation-checklist [data-status="fail"]').count();
    expect(checklistFailCount).toBe(0);

    const warningsCheckbox = page.locator('#warnings-reviewed-checkbox');
    if (await warningsCheckbox.isVisible()) {
      await warningsCheckbox.check();
    }
    await expect(page.locator('#export-docx-btn')).toBeEnabled({ timeout: 5000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#export-docx-btn')
    ]);
    const suggested = download.suggestedFilename();
    expect(suggested.endsWith('.docx')).toBe(true);
    const outPath = path.join(os.tmpdir(), `smoke-${Date.now()}-${suggested}`);
    await download.saveAs(outPath);
    const stat = fs.statSync(outPath);
    expect(stat.size).toBeGreaterThan(10240);
    fs.unlinkSync(outPath);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('B: synthesis error is visible and non-reloading', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await runSteps1To5(page, baseUrl);

    await page.route('**/api/synthesize', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Synthesis failed. Please retry.' })
      })
    );

    await page.click('#btn-approve-papers');
    await page.waitForTimeout(5000);

    const visibleError = page.locator(':visible', { hasText: 'Synthesis failed' }).first();
    await expect(visibleError).toBeVisible();
    expect(new URL(page.url()).search).toBe('');
    expect(pageErrors).toEqual([]);
  });

  test('C: no secrets in the served bundle', async ({ request }) => {
    for (const assetPath of ['/app.js', '/index.html']) {
      const res = await request.get(`${baseUrl}${assetPath}`);
      expect(res.status()).toBe(200);
      const body = await res.text();
      expect(body).not.toMatch(/AIza|sk-|gsk_|xai-|api_key=/);
      expect(body).not.toMatch(/\b\w*key\w*\s*=\s*['"`][A-Za-z0-9]{16,}['"`]/i);
    }
  });

  test('D: malicious paper metadata and slide bullets are escaped (XSS)', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });

    const maliciousTitle = '<img src=x onerror="window.__xss=1">';
    const maliciousNote = '<script>window.__xss=2</script>';
    const maliciousDoi = 'javascript:alert(1)';
    const maliciousBullet = '<b onmouseover=alert(1)>x</b>';

    await page.addInitScript((noteVal) => {
      localStorage.setItem('preppt:notes:v1', JSON.stringify({
        '<img src=x onerror="window.__xss=1">': noteVal
      }));
    }, maliciousNote);

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.fill('#topic-input', 'Artificial Intelligence in Assisted Reproduction');
    await page.fill('#short-title-input', 'AI in ART');
    await page.fill('#target-papers-input', '5');
    await page.fill('#start-year-input', '2019');
    await page.click('#btn-to-keywords');
    await expect(page.locator('#step-2-section')).toBeVisible({ timeout: 15000 });
    await page.click('#btn-approve-keywords');
    await expect(page.locator('#step-3-section')).toBeVisible({ timeout: 15000 });

    const maliciousPaper = {
      ...fixturePapers[0],
      id: 'xss-1',
      title: maliciousTitle,
      doi: maliciousDoi,
      pmid: '',
      abstract: 'Artificial Intelligence in Assisted Reproduction clinical outcomes.'
    };
    await page.route('https://www.ebi.ac.uk/europepmc/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildEpmcStub(fixturePapers.slice(1, 5))) })
    );
    await page.route('**/api/s2**', (route) =>
      route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Rate limit' }) })
    );
    await page.route('**/api/openalex**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildProxyStub([maliciousPaper], 'openalex')) })
    );
    await page.route('**/api/crossref**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildProxyStub(fixturePapers.slice(5, 8), 'crossref')) })
    );

    await page.click('#btn-approve-strategy');
    await expect(page.locator('#step-6-section')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#papers-list .paper-card').first()).toBeVisible({ timeout: 15000 });

    const paperListText = await page.locator('#papers-list').innerText();
    expect(paperListText).toContain(maliciousTitle);

    await page.route('**/api/synthesize', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          shortTitle: 'AI in ART',
          meta: { engine: 'deterministic-extractive', slideDensity: 'Balanced', audience: 'Consultants' },
          synthesisPlan: { objective: 'Test', themes: [] },
          researchGaps: [],
          slides: [{
            slideNumber: 1,
            title: 'XSS Test Slide',
            suggestedVisualType: 'Bar chart',
            objective: 'Objective',
            mainMessage: 'Main message',
            slideDensity: 'Balanced',
            onSlideText: maliciousBullet,
            detailedVisualDescription: 'Layout',
            speakerNotes: 'Notes',
            audienceQuestion: 'Question?',
            transition: 'Next',
            sources: [1]
          }],
          validation: { isValid: true, passedCount: 1, warningCount: 0, failedCount: 0, checks: [] }
        })
      })
    );

    await page.click('#btn-approve-papers');
    await expect(page.locator('#step-8-section')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.slide-card').first()).toBeVisible({ timeout: 15000 });

    const xssFlag = await page.evaluate(() => window.__xss);
    expect(xssFlag).toBeUndefined();
    expect(dialogs).toEqual([]);
    const slideText = await page.locator('.slide-card').first().innerText();
    expect(slideText).toContain(maliciousBullet);
  });
});
