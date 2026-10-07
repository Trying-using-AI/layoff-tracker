import { launch, openTool, addFiles, runAndDownload, check, summary, inspect, OUT, FIX } from './lib.mjs';
import path from 'node:path';
const { browser, page, errors } = await launch();
const only = process.argv[2];
const T = async (name, fn) => { if (only && !name.includes(only)) return; console.log('\n# ' + name); try { await fn(); } catch (e) { check(name + ' (exception)', false, e.message.slice(0, 300)); } };

await T('merge', async () => {
  await openTool(page, 'merge');
  await addFiles(page, ['a.pdf', 'b.pdf']);
  await page.waitForSelector('.fl-row');
  const [o] = await runAndDownload(page);
  const i = inspect(o); check('6 pages', i.n === 6, JSON.stringify(i).slice(0, 200)); check('order A1..B3', i.pages.map((p) => p.text).join() === 'A1,A2,A3,B1,B2,B3', i.pages.map((p) => p.text).join());
  check('bookmarks', i.outline.length === 2, JSON.stringify(i.outline));
});
await T('alternate', async () => {
  await openTool(page, 'alternate-mix');
  await addFiles(page, ['a.pdf', 'b.pdf']);
  const [o] = await runAndDownload(page);
  const i = inspect(o); check('interleaved', i.pages.map((p) => p.text).join() === 'A1,B1,A2,B2,A3,B3', i.pages.map((p) => p.text).join());
});
await T('split ranges', async () => {
  await openTool(page, 'split');
  await addFiles(page, 'report10.pdf');
  await page.waitForSelector('.fields');
  await page.fill('#f-ranges', '1-3, 5, 8-');
  const outs = await runAndDownload(page, '.action-wrap .btn.primary', { all: true });
  check('3 files', outs.length === 3, outs.join());
  const counts = outs.map((p) => inspect(p).n).sort(); check('page counts 1,3,3', counts.join() === '1,3,3', counts.join());
});
await T('split every', async () => {
  await openTool(page, 'split'); await addFiles(page, 'report10.pdf');
  await page.click('.seg-b:has-text("Every N pages")'); await page.fill('#f-n', '4');
  const outs = await runAndDownload(page, '.action-wrap .btn.primary', { all: true });
  check('3 files (4,4,2)', outs.length === 3 && outs.map((p) => inspect(p).n).sort().join() === '2,4,4');
});
await T('split remove', async () => {
  await openTool(page, 'split'); await addFiles(page, 'report10.pdf');
  await page.fill('#f-ranges', '2-9'); await page.locator('label.chk', { hasText: 'Remove those pages' }).click();
  const [o] = await runAndDownload(page); const i = inspect(o);
  check('2 pages left (1 and 10)', i.n === 2 && /page 1\b|Introduction/.test(i.pages[0].text) && /page 10/.test(i.pages[1].text), JSON.stringify(i.pages.map((p) => p.text.slice(0, 30))));
});
await T('split-text', async () => {
  await openTool(page, 'split-text'); await addFiles(page, 'invoices.pdf');
  await page.fill('#f-text', 'INVOICE No.');
  const outs = await runAndDownload(page, '.action-wrap .btn.primary', { all: true });
  check('3 invoices', outs.length === 3, outs.join()); check('2 pages each', outs.every((p) => inspect(p).n === 2));
  check('named from match', outs.some((p) => /INVOICE No\. INV-1001/.test(p)), outs.join());
});
await T('split-bookmarks', async () => {
  await openTool(page, 'split-bookmarks'); await addFiles(page, 'report10.pdf');
  await page.waitForSelector('.finfo:not([hidden])');
  console.log('   info:', (await page.textContent('.finfo')).trim());
  const outs = await runAndDownload(page, '.action-wrap .btn.primary', { all: true });
  check('3 chapters', outs.length === 3, outs.join());
  check('chapter sizes 3,3,4', outs.map((p) => inspect(p).n).join() === '3,3,4', outs.map((p) => inspect(p).n).join());
});
await T('split-half', async () => {
  await openTool(page, 'split-half'); await addFiles(page, 'spread.pdf');
  const [o] = await runAndDownload(page); const i = inspect(o);
  check('6 pages', i.n === 6, JSON.stringify(i.pages)); check('page width halved', Math.abs(i.pages[0].w - 421) < 1, i.pages[0].w + 'x' + i.pages[0].h);
});
await T('split-size', async () => {
  await openTool(page, 'split-size'); await addFiles(page, 'images.pdf');
  await page.fill('#f-mb', '0.3');
  const outs = await runAndDownload(page, '.action-wrap .btn.primary', { all: true });
  const fs = await import('node:fs');
  check('multiple parts', outs.length >= 2, outs.join()); check('each ≤ 0.3MB or single page', outs.every((p) => fs.statSync(p).size <= 0.3 * 1048576 || inspect(p).n === 1));
});
await T('rotate', async () => {
  await openTool(page, 'rotate'); await addFiles(page, 'a.pdf');
  await page.fill('#f-pages', '2');
  await page.waitForSelector('.rot-cell');
  const [o] = await runAndDownload(page); const i = inspect(o);
  check('page 2 rotated 90', i.pages.map((p) => p.rot).join() === '0,90,0', i.pages.map((p) => p.rot).join());
});
await T('flip', async () => {
  await openTool(page, 'flip'); await addFiles(page, 'a.pdf');
  const [o] = await runAndDownload(page); const i = inspect(o); check('3 pages', i.n === 3 && i.pages[0].w > 590, JSON.stringify(i.pages[0]));
});
await T('nup', async () => {
  await openTool(page, 'nup'); await addFiles(page, 'report10.pdf');
  const [o] = await runAndDownload(page); const i = inspect(o); check('3 sheets (10/4)', i.n === 3, JSON.stringify(i.pages.map((p) => [p.w, p.h])));
  check('text present', /Report page 2|Chapter/.test(i.pages[0].text), i.pages[0].text);
});
await T('pdf-to-zip', async () => {
  await openTool(page, 'pdf-to-zip'); await addFiles(page, 'a.pdf');
  await page.click('.seg-b:has-text("Every page as its own PDF")');
  const [o] = await runAndDownload(page);
  const { execFileSync } = await import('node:child_process');
  const ls = execFileSync('unzip', ['-l', o], { encoding: 'utf8' }); check('zip has 3 pdfs', (ls.match(/\.pdf/g) || []).length === 3, ls);
});
check('no console errors', errors.length === 0, errors.join('\n'));
await browser.close();
process.exit(summary() ? 1 : 0);
