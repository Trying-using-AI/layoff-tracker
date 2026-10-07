import { launch, openTool, addFiles, runAndDownload, check, summary, inspect, OUT } from './lib.mjs';
import { execFileSync } from 'node:child_process';
const { browser, page, errors } = await launch({ width: 1440, height: 1000 });
const only = process.argv[2];
const T = async (name, fn) => { if (only && !name.includes(only)) return; console.log('\n# ' + name); try { await fn(); } catch (e) { check(name + ' (exception)', false, e.message.slice(0, 500)); } };
const raw = (p) => execFileSync('pdftotext', ['-layout', p, '-'], { encoding: 'utf8' });
await T('text-to-handwriting', async () => {
  await openTool(page, 'text-to-handwriting'); await page.waitForSelector('.hw-prev'); await page.waitForTimeout(1500); await page.screenshot({ path: OUT + '/hw.png' });
  const [o] = await runAndDownload(page, '.hw-pv .btn.primary.lg', { timeout: 90000 }); const i = inspect(o); const t = raw(o); check('pdf page(s)', i.n >= 1); check('searchable text layer', /entirely/.test(t) && /Wrangl/.test(t), t.slice(0, 120));
  execFileSync('pdftoppm', ['-r', '45', '-png', '-f', '1', '-l', '1', o, OUT + '/hwout']);
});
await T('pdf-to-handwriting', async () => {
  await openTool(page, 'pdf-to-handwriting'); await addFiles(page, 'report10.pdf'); await page.fill('#f-pages', '1');
  const [o] = await runAndDownload(page, '.action-wrap .btn.primary', { timeout: 90000 }); const t = raw(o); check('text kept & searchable', /Introduction/.test(t) && /Lorem/.test(t), t.slice(0, 100));
});
await T('handwriting-to-pdf', async () => {
  await openTool(page, 'handwriting-to-pdf'); await addFiles(page, 'scan.png'); await page.locator('label.chk', { hasText: 'Recognise text' }).click();
  const [o] = await runAndDownload(page, '.action-wrap .btn.primary', { timeout: 120000 }); const t = raw(o); check('cleaned + OCR', /quick brown fox/i.test(t), t.slice(0, 100));
});
await T('scan', async () => {
  await openTool(page, 'scan'); const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.click('.dz.compact')]); await ch.setFiles(['tests/fixtures/scan.png', 'tests/fixtures/photo.jpg']);
  await page.waitForSelector('.sc-card'); await page.waitForTimeout(800); check('2 pages', (await page.$$('.sc-card')).length === 2); await page.screenshot({ path: OUT + '/scan.png' });
  await page.locator('.sc-card button[title="Adjust corners"]').first().click(); await page.waitForSelector('.modal circle'); await page.screenshot({ path: OUT + '/scancrop.png' }); await page.click('.modal button:has-text("Apply")');
  await page.locator('label.chk', { hasText: 'searchable' }).click();
  const [o] = await runAndDownload(page, '#optCard .btn.primary', { timeout: 120000 }); check('2-page PDF', inspect(o).n === 2);
});
await T('scan camera', async () => {
  await openTool(page, 'scan'); await page.click('button:has-text("Use camera")'); await page.waitForSelector('.sc-video'); await page.waitForFunction(() => { const v = document.querySelector('.sc-video'); return v && v.videoWidth > 0; }, null, { timeout: 15000 });
  await page.click('button:has-text("Capture page")'); await page.waitForSelector('.sc-card'); check('captured from camera', (await page.$$('.sc-card')).length === 1);
});
check('no console errors', errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, errors.join('\n')); await browser.close(); process.exit(summary() ? 1 : 0);
