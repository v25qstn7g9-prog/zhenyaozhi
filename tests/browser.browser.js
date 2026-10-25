'use strict';
// Run with Playwright installed: node --test tests/browser.browser.js
// Chromium defaults to /usr/bin/chromium; no requests are sent to the food API.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const BASE = process.env.ZY_TEST_URL || 'http://localhost:8202';
const KEY = 'zhenyaozhi.records.v1';
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] }); });
after(async () => { await browser.close(); });
async function fresh(options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, ...options });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort());
  await context.route('**/api/food', route => route.abort());
  const page = await context.newPage();
  await page.goto(BASE); await page.waitForSelector('#quickWeight');
  return { context, page };
}
async function stored(page) { return page.evaluate(key => localStorage.getItem(key), KEY); }
async function upload(page, backup) {
  await page.click('[data-nav=settings]');
  await page.locator('#importFileInput').setInputFiles({ name: 'test-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.waitForFunction(() => document.querySelector('#backupMsg').textContent.trim().length > 0);
}
function backup() {
  return { profile: { lang: 'zh', seeded: false }, weights: [{ id: 'weight-1', date: '2026-10-18', weightKg: 80, fatKg: null, muscleKg: null }], injections: [{ id: 'shot-1', date: '2026-10-18', doseMg: 0.25, site: 'r-arm' }], meals: [{ id: 'meal-1', date: '2026-10-18', meal: 'lunch', name: 'Test meal', kcal: 500, protein: 30, carbs: 50, fat: 20, fiber: 6 }], purchases: [{ id: 'purchase-1', date: '2026-10-18', medication: 'wegovy', items: [{ doseMg: 0.25, qty: 2 }], price: 6000, place: 'Test' }] };
}
test('sample records retain the sample notice after reload; clearing ends the sample', async () => {
  const { context, page } = await fresh();
  try {
    assert.equal(await page.locator('.banner').count(), 1);
    await page.reload(); await page.waitForSelector('#quickWeight');
    assert.equal(await page.locator('.banner').count(), 1);
    await page.click('[data-nav=settings]'); await page.click('#clearBtn'); await page.click('#__confirmBtn');
    await page.click('[data-nav=home]'); assert.equal(await page.locator('.banner').count(), 0);
  } finally { await context.close(); }
});
test('backup IDs remain inert text in all four record lists, including after reload', async () => {
  const { context, page } = await fresh();
  try {
    const data = backup();
    const marker = 'audit"><img src="data:," onerror="window.__auditMarker=1"><span data-audit="';
    for (const collection of ['weights', 'injections', 'meals', 'purchases']) data[collection][0].id = marker;
    await upload(page, data); await page.click('#__confirmBtn');
    for (const view of ['weight', 'shot', 'diet', 'ledger']) await page.click(`[data-nav=${view}]`);
    assert.equal(await page.evaluate(() => window.__auditMarker || 0), 0);
    assert.equal(await page.locator('img[onerror="window.__auditMarker=1"]').count(), 0);
    assert.equal(JSON.parse(await stored(page)).injections[0].id, marker);
    await page.reload(); await page.waitForSelector('#quickWeight');
    for (const view of ['weight', 'shot', 'diet', 'ledger']) await page.click(`[data-nav=${view}]`);
    assert.equal(await page.evaluate(() => window.__auditMarker || 0), 0);
  } finally { await context.close(); }
});
test('invalid backups are rejected before confirmation and preserve every existing record', async () => {
  const { context, page } = await fresh();
  try {
    const mutations = [d => { d.weights[0].date = null; }, d => { d.weights[0].date = '2026-02-30'; }, d => { d.weights[0].weightKg = -1; }, d => { d.injections[0].doseMg = 0; }, d => { d.injections[0].site = 'unknown'; }, d => { d.meals[0].protein = -1; }, d => { d.purchases[0].items[0].qty = 0.5; }, d => { d.profile.heightCm = '" onfocus="alert(1)'; }, d => { d.weights[0].time = '25:00'; }];
    const original = await stored(page);
    for (const mutate of mutations) {
      const data = backup(); mutate(data); await upload(page, data);
      assert.equal(await page.locator('#__confirmBtn').count(), 0, JSON.stringify(data));
      assert.equal(await stored(page), original);
    }
    await page.reload(); await page.waitForSelector('#quickWeight'); assert.equal(await stored(page), original);
  } finally { await context.close(); }
});
test('Taipei dates match local time and refresh when a form is reopened after midnight', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Taipei' });
  try {
    const page = await context.newPage(); await page.clock.install({ time: new Date('2026-10-18T15:59:00Z') });
    await page.goto(BASE); await page.waitForSelector('#quickWeight'); await page.click('#quickWeight');
    assert.equal(await page.inputValue('#wf-date'), '2026-10-18'); await page.click('#closeSheet');
    await page.clock.setSystemTime(new Date('2026-10-18T16:01:00Z'));
    await page.click('#quickWeight'); assert.equal(await page.inputValue('#wf-date'), '2026-10-19'); assert.equal(await page.inputValue('#wf-time'), '00:01'); await page.click('#closeSheet');
    await page.click('[data-nav=shot]'); await page.click('#addShotBtn'); assert.equal(await page.inputValue('#sf-date'), '2026-10-19'); await page.click('#closeSheet');
    await page.click('[data-nav=ledger]'); await page.click('#addBuyBtn'); assert.equal(await page.inputValue('#pf-date'), '2026-10-19'); await page.click('#closeSheet');
    await page.click('[data-nav=diet]'); assert.equal(await page.locator('.wk-day.today').getAttribute('data-day'), '2026-10-19');
  } finally { await context.close(); }
});
test('negative manual nutrients are rejected without writing, valid values can then be saved', async () => {
  const { context, page } = await fresh();
  try {
    const original = await stored(page); await page.click('[data-nav=diet]'); await page.click('#foodManual');
    await page.fill('#fm-name', 'Test meal'); await page.fill('#fm-kcal', '500'); await page.fill('#fm-protein', '-30'); await page.click('#fm-save');
    assert.equal(await stored(page), original); assert.equal(await page.locator('#sheetOverlay.open').count(), 1);
    assert.ok((await page.locator('#fs-msg').textContent()).trim());
    await page.fill('#fm-protein', '30'); await page.click('#fm-save');
    assert.equal(JSON.parse(await stored(page)).meals[0].protein, 30);
  } finally { await context.close(); }
});
test('negative values edited in an estimated meal are rejected without calling AI', async () => {
  const { context, page } = await fresh();
  try {
    await context.route('**/api/food', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, items: [{ name: 'Fixture meal', kcal: 500, protein: 30, carbs: 50, fat: 20, fiber: 6 }] }) }));
    const original = await stored(page); await page.click('[data-nav=diet]'); await page.click('#foodText'); await page.fill('#fs-text', 'fixture'); await page.click('#fs-est'); await page.waitForSelector('#fs-save');
    await page.fill('#fs-items [data-k=protein]', '-1'); await page.click('#fs-save'); assert.equal(await stored(page), original);
    await page.fill('#fs-items [data-k=protein]', '30'); await page.click('#fs-save'); assert.equal(JSON.parse(await stored(page)).meals[0].protein, 30);
  } finally { await context.close(); }
});
test('legacy backups without profile, IDs, meals or purchases retain compatible records', async () => {
  const { context, page } = await fresh();
  try {
    const data = backup(); await upload(page, data); await page.click('#__confirmBtn');
    const old = { weights: [{ date: '2026-09-01', weightKg: 88.5, fatKg: null, muscleKg: null }], injections: [{ date: '2026-09-01', doseMg: 0.25, site: 'r-abd-u' }] };
    await upload(page, old); await page.click('#__confirmBtn');
    const actual = JSON.parse(await stored(page)); assert.equal(actual.weights[0].weightKg, 88.5); assert.equal(actual.injections[0].doseMg, 0.25); assert.ok(actual.weights[0].id); assert.deepEqual(actual.meals, data.meals); assert.deepEqual(actual.purchases, data.purchases);
  } finally { await context.close(); }
});
test('export, clear and restore preserves all four arrays and optional measurements', async () => {
  const { context, page } = await fresh();
  try {
    const data = backup(); Object.assign(data.weights[0], { time: '08:30', fatKg: 20, fatPercent: 25, muscleKg: 24, musclePercent: 30, waistCm: 88, leanKg: 60, score: 75, custom: [{ name: 'Change', value: -1 }] });
    await upload(page, data); await page.click('#__confirmBtn');
    const downloadPromise = page.waitForEvent('download'); await page.click('#exportFileBtn'); const download = await downloadPromise; const stream = await download.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk); const exported = JSON.parse(Buffer.concat(chunks));
    await page.click('#clearBtn'); await page.click('#__confirmBtn'); await upload(page, exported); await page.click('#__confirmBtn'); const actual = JSON.parse(await stored(page));
    for (const field of ['weights', 'injections', 'meals', 'purchases']) assert.deepEqual(actual[field], exported[field]);
  } finally { await context.close(); }
});
const legacyHtml = process.env.ZY_LEGACY_HTML;
if (legacyHtml) test('a snapshot actually saved by the green four-page app loads without migration', async () => {
  const { context, page } = await fresh();
  try {
    const data = backup(); const old = { profile: { gender: 'female', heightCm: 160, startWeight: 90, goalWeight: 65, medication: '司美格魯肽', intervalDays: 7, totalSpend: 1234, remindersOn: false, seeded: false, startDate: '2026-09-01', lang: 'zh' }, weights: data.weights, injections: data.injections };
    await page.evaluate(({ key, old }) => localStorage.setItem(key, JSON.stringify(old)), { key: KEY, old });
    await context.route(BASE + '/legacy-fixture.html', route => route.fulfill({ contentType: 'text/html', body: fs.readFileSync(legacyHtml, 'utf8') }));
    await page.goto(BASE + '/legacy-fixture.html'); await page.waitForSelector('#quickWeight'); await page.click('[data-nav=settings]'); await page.fill('#f-height', '170'); await page.click('#saveProfile2');
    const snapshot = await stored(page); assert.deepEqual(Object.keys(JSON.parse(snapshot)).sort(), ['injections', 'profile', 'weights']);
    if (process.env.ZY_EVIDENCE_DIR) fs.writeFileSync(path.join(process.env.ZY_EVIDENCE_DIR, 'green-saved-snapshot.json'), snapshot);
    await page.goto(BASE); await page.waitForSelector('#quickWeight'); assert.equal(await stored(page), snapshot); await page.click('[data-nav=weight]'); assert.match(await page.locator('#view-weight').textContent(), /80.0/); await page.click('[data-nav=shot]'); assert.match(await page.locator('#view-shot').textContent(), /0.25/);
  } finally { await context.close(); }
});

test('invalid profile numbers are rejected instead of creating an unrestorable backup', async () => {
  const { context, page } = await fresh();
  try {
    const original = await stored(page); await page.click('[data-nav=settings]'); await page.fill('#f-height', '-170'); await page.click('#saveProfile'); assert.equal(await stored(page), original);
    assert.ok((await page.locator('#profileMsg').textContent()).trim()); await page.fill('#f-height', '170'); await page.click('#saveProfile'); assert.equal(JSON.parse(await stored(page)).profile.heightCm, 170);
  } finally { await context.close(); }
});
test('invalid optional measurements do not change records or the preferred units', async () => {
  const { context, page } = await fresh();
  try {
    const original = await stored(page); await page.click('#quickWeight'); await page.fill('#wf-weight', '80'); await page.click('#wf-fat-unit [data-u=pct]'); await page.fill('#wf-fat', '101'); await page.click('#wf-save'); assert.equal(await stored(page), original);
    await page.fill('#wf-fat', '25'); await page.click('#wf-save'); const saved = JSON.parse(await stored(page)); assert.equal(saved.weights.at(-1).fatKg, 20); assert.equal(saved.profile.fatUnit, 'pct');
  } finally { await context.close(); }
});
test('a storage failure during restore leaves both storage and displayed records intact', async () => {
  const { context, page } = await fresh();
  try {
    const original = await stored(page), home = await page.locator('#view-home .big').textContent(); await upload(page, backup());
    await page.evaluate(key => { const write = Storage.prototype.setItem; Storage.prototype.setItem = function(k, value) { if (k === key) throw new DOMException('Fixture quota failure', 'QuotaExceededError'); return write.call(this, k, value); }; }, KEY);
    await page.click('#__confirmBtn'); assert.equal(await stored(page), original); assert.match(await page.locator('#backupMsg').textContent(), /未變更|unchanged/);
    await page.click('[data-nav=home]'); assert.equal(await page.locator('#view-home .big').textContent(), home);
  } finally { await context.close(); }
});
test('crossing midnight does not change an explicitly selected historical diet date', async () => {
  const context = await browser.newContext({ timezoneId: 'Asia/Taipei' });
  try {
    const page = await context.newPage(); await page.clock.install({ time: new Date('2026-10-18T15:59:00Z') }); await page.goto(BASE); await page.waitForSelector('#quickWeight'); await page.click('[data-nav=diet]'); await page.click('[data-wk="-7"]'); const chosen = await page.locator('.wk-day.on').getAttribute('data-day');
    await page.clock.setSystemTime(new Date('2026-10-18T16:01:00Z')); await page.click('#foodManual'); await page.fill('#fm-name', 'Past meal'); await page.fill('#fm-kcal', '100'); await page.click('#fm-save'); assert.equal(JSON.parse(await stored(page)).meals[0].date, chosen);
  } finally { await context.close(); }
});

test('persisted malformed records open recovery without rewriting raw data and accept a valid restore', async () => {
  const context = await browser.newContext({ acceptDownloads: true });
  try {
    const page = await context.newPage(), corrupt = backup(); corrupt.weights[0].date = null; const raw = JSON.stringify(corrupt);
    await page.addInitScript(({ key, raw }) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, raw); }, { key: KEY, raw });
    await page.goto(BASE); await page.waitForSelector('#exportRawBtn', { timeout: 3000 }); assert.equal(await stored(page), raw);
    await page.click('[data-nav=weight]'); assert.equal(await page.locator('.view.active').getAttribute('data-view'), 'settings');
    const promise = page.waitForEvent('download'); await page.click('#exportRawBtn'); const download = await promise; const stream = await download.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk); assert.equal(Buffer.concat(chunks).toString(), raw);
    await upload(page, backup()); await page.click('#__confirmBtn'); await page.click('[data-nav=weight]'); assert.match(await page.locator('#view-weight').textContent(), /80.0/); assert.equal(await page.locator('#exportRawBtn').count(), 0);
  } finally { await context.close(); }
});
test('invalid JSON already in storage is never replaced with sample records', async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage(); await page.addInitScript(key => localStorage.setItem(key, '{broken json'), KEY); await page.goto(BASE); await page.waitForSelector('#exportRawBtn', { timeout: 3000 }); assert.equal(await stored(page), '{broken json');
    await page.click('#clearBtn'); await page.click('#__confirmBtn'); const saved = JSON.parse(await stored(page)); assert.equal(saved.weights.length, 0); assert.equal(saved.injections.length, 0); assert.equal(saved.profile.seeded, false);
  } finally { await context.close(); }
});

test('recovery uses a safely recognized English preference from damaged records', async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage(), data = backup(); data.profile.lang = 'en'; data.weights[0].date = null;
    await page.addInitScript(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: KEY, data }); await page.goto(BASE); await page.waitForSelector('#exportRawBtn'); assert.equal(await page.locator('#exportRawBtn').textContent(), 'Download original data');
  } finally { await context.close(); }
});

test('clearing damaged records preserves separately valid existing settings', async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage(), data = backup(); data.profile.heightCm = 170; data.profile.lang = 'en'; data.weights[0].date = null;
    await page.addInitScript(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: KEY, data }); await page.goto(BASE); await page.waitForSelector('#exportRawBtn'); await page.click('#clearBtn'); await page.click('#__confirmBtn'); const actual = JSON.parse(await stored(page)); assert.equal(actual.profile.heightCm, 170); assert.equal(actual.profile.lang, 'en'); assert.equal(actual.weights.length, 0);
  } finally { await context.close(); }
});
test('a save that fails keeps a visible alert with retry and backup until a later save works; leaving asks first', async () => {
  const { context, page } = await fresh();
  try {
    assert.equal(await page.locator('#saveAlert').isVisible(), false);
    const original = await stored(page);
    // storage full: every write of the records fails
    await page.evaluate(key => { const orig = Storage.prototype.setItem; window.__full = true; Storage.prototype.setItem = function (k, v) { if (k === key && window.__full) throw new DOMException('full', 'QuotaExceededError'); return orig.call(this, k, v); }; }, KEY);
    await page.click('[data-nav=diet]'); await page.click('#foodManual');
    await page.fill('#fm-name', 'Unsaved meal'); await page.fill('#fm-kcal', '400'); await page.click('#fm-save');
    await page.waitForSelector('#saveAlert:not([hidden])');
    assert.equal(await stored(page), original, 'what was already saved stays as it was');
    await page.click('[data-nav=diet]'); assert.ok((await page.locator('#view-diet').textContent()).includes('Unsaved meal'), 'the new meal is still on screen');
    for (const view of ['home', 'weight', 'settings']) { await page.click(`[data-nav=${view}]`); assert.equal(await page.locator('#saveAlert').isVisible(), true, view); }
    assert.equal(await page.locator('#saveRetry').count(), 1); assert.equal(await page.locator('#saveBackup').count(), 1);
    assert.ok((await page.locator('#saveRetry').boundingBox()).height >= 44);
    // still full: retry says so and the alert stays
    await page.click('#saveRetry'); assert.equal(await page.locator('#saveAlert').isVisible(), true);
    assert.match(await page.locator('#saveAlert').textContent(), /還是存不進去|Still can't save/);
    // leaving the page while unsaved asks first
    await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); window.__prevented = e.defaultPrevented; });
    assert.equal(await page.evaluate(() => window.__prevented), true);
    // space freed: retry saves the meal and the alert goes away
    await page.evaluate(() => { window.__full = false; });
    await page.click('#saveRetry');
    assert.equal(await page.locator('#saveAlert').isVisible(), false);
    assert.equal(JSON.parse(await stored(page)).meals.some(m => m.name === 'Unsaved meal'), true);
  } finally { await context.close(); }
});
test('a browser that cannot store at all shows the alert with backup only', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await context.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('blocked', 'SecurityError'); }; });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort());
    const page = await context.newPage(); await page.goto(BASE); await page.waitForSelector('#quickWeight');
    await page.waitForSelector('#saveAlert:not([hidden])');
    assert.equal(await page.locator('#saveRetry').count(), 0); assert.equal(await page.locator('#saveBackup').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const leaveAsks = () => page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    assert.equal(await leaveAsks(), false, 'only sample data: nothing to lose');
    await page.click('[data-nav=diet]'); await page.click('#foodManual'); await page.fill('#fm-name', 'Memory meal'); await page.fill('#fm-kcal', '300'); await page.click('#fm-save');
    assert.equal(await leaveAsks(), true, 'a record that cannot be stored: leaving asks first');
  } finally { await context.close(); }
});
test('the save alert follows the language, is not rebuilt on every failed save, and goes away after a successful restore', async () => {
  const { context, page } = await fresh();
  try {
    await page.evaluate(key => { const orig = Storage.prototype.setItem; window.__full = true; Storage.prototype.setItem = function (k, v) { if (k === key && window.__full) throw new DOMException('full', 'QuotaExceededError'); return orig.call(this, k, v); }; }, KEY);
    await page.click('[data-nav=settings]'); await page.click('#langSeg [data-lang=en]');
    await page.waitForSelector('#saveAlert:not([hidden])');
    assert.match(await page.locator('#saveAlert .save-alert-text').textContent(), /not saved/);
    await page.evaluate(() => { window.__retryNode = document.getElementById('saveRetry'); });
    await page.click('#saveRetry');
    assert.equal(await page.evaluate(() => window.__retryNode === document.getElementById('saveRetry')), true, 'same button after a failed retry');
    await page.click('#langSeg [data-lang=zh]');
    assert.match(await page.locator('#saveAlert .save-alert-text').textContent(), /沒有存到/);
    // space freed, a backup restored: everything is saved, the alert goes and leaving no longer asks
    await page.evaluate(() => { window.__full = false; });
    await upload(page, backup()); await page.click('#__confirmBtn');
    assert.equal(await page.locator('#saveAlert').isVisible(), false);
    assert.equal(await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }), false);
  } finally { await context.close(); }
});
test('a backup that finishes after a new change does not stop the leave prompt (the change is not in it)', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    // a download that waits until the test lets it finish, and records what it saved
    await context.addInitScript(() => { window.claude = { use: async name => name === 'downloads' ? { save: opts => new Promise(r => { window.__saved = opts.data; window.__finish = () => r(); }) } : null }; });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort());
    const page = await context.newPage(); await page.goto(BASE); await page.waitForSelector('#quickWeight');
    await page.evaluate(key => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === key) throw new DOMException('full', 'QuotaExceededError'); return orig.call(this, k, v); }; }, KEY);
    const addWeight = async kg => { await page.click('#quickWeight'); await page.fill('#wf-weight', String(kg)); await page.click('#wf-save'); };
    await addWeight(77.7);
    await page.waitForSelector('#saveAlert:not([hidden])');
    await page.click('#saveBackup');                       // the download starts with 77.7 in it…
    await page.waitForFunction(() => typeof window.__finish === 'function');
    await addWeight(76.6);                                 // …a new weight is added while it is still going…
    await page.evaluate(() => window.__finish());          // …and then the old download finishes
    await page.waitForFunction(() => /又改了紀錄|changed your records/.test(document.querySelector('#saveAlert .save-alert-msg').textContent));
    assert.ok(await page.evaluate(() => window.__saved.includes('77.7') && !window.__saved.includes('76.6')), 'the backup holds the earlier records only');
    const leaveAsks = () => page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    assert.equal(await leaveAsks(), true, '76.6 is in no backup: leaving still asks');
    assert.equal(await page.locator('#saveAlert').isVisible(), true);
    // a backup made after the last change does stop it
    await page.evaluate(() => { window.__finish = null; });
    await page.click('#saveRetry');                        // trying to save again changes no record: it does not undo a backup
    await page.click('#saveBackup'); await page.waitForFunction(() => typeof window.__finish === 'function'); await page.evaluate(() => window.__finish());
    await page.waitForFunction(() => /已下載|Downloaded|已送出|Sent/.test(document.querySelector('#saveAlert .save-alert-msg').textContent));
    assert.equal(await leaveAsks(), false);
    await page.click('#saveRetry');
    assert.equal(await leaveAsks(), false, 'a failed retry does not undo the backup');
    await addWeight(75.5);
    assert.equal(await leaveAsks(), true, 'a new change after the backup asks again');
  } finally { await context.close(); }
});
