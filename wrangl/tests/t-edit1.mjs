import { launch, openTool, addFiles, runAndDownload, check, summary, inspect, OUT } from './lib.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { browser, page, errors } = await launch();
const only = process.argv[2];
const T = async (name, fn) => { if (only && !name.includes(only)) return; console.log('\n# ' + name); try { await fn(); } catch (e) { check(name + ' (exception)', false, e.message.slice(0, 400)); } };
const pdftext = (p) => execFileSync('pdftotext', ['-layout', p, '-'], { encoding: 'utf8' });
const rawtext = (p) => execFileSync('pdftotext', ['-raw', p, '-'], { encoding: 'utf8' });
await T('watermark text', async () => {
  await openTool(page, 'watermark'); await addFiles(page, 'a.pdf');
  const [o] = await runAndDownload(page); const t = rawtext(o);
  check('has CONFIDENTIAL', /CONFIDENTIAL/.test(t.replace(/\s+/g, '')), t.slice(0, 100)); check('keeps A1', /A1/.test(t));
  execFileSync('pdftoppm', ['-r', '50', '-png', '-f', '1', '-l', '1', o, OUT + '/wm']);
});
await T('watermark under + tile', async () => {
  await openTool(page, 'watermark'); await addFiles(page, 'a.pdf');
  await page.fill('#f-text', 'DRAFT'); await page.click('.seg-b:has-text("Tiled")'); await page.click('.seg-b:has-text("Behind the content")');
  const [o] = await runAndDownload(page); const t = rawtext(o);
  const dn = (t.replace(/\s+/g, '').match(/DRAFT/g) || []).length; check('tiled DRAFT many', dn >= 4, dn + ''); check('3 pages', inspect(o).n === 3);
});
await T('watermark image', async () => {
  await openTool(page, 'watermark'); await addFiles(page, 'a.pdf');
  await page.click('.seg-b:has-text("Image / logo")');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Choose image")')]); await chooser.setFiles(['tests/fixtures/cutout.png']);
  const [o] = await runAndDownload(page); check('image wm saved', fs.statSync(o).size > 3000);
});
await T('page numbers', async () => {
  await openTool(page, 'page-numbers'); await addFiles(page, 'report10.pdf');
  const [o] = await runAndDownload(page); const t = pdftext(o);
  check('Page 1 of 10', /Page 1 of 10/.test(t)); check('Page 10 of 10', /Page 10 of 10/.test(t));
});
await T('page numbers roman skip', async () => {
  await openTool(page, 'page-numbers'); await addFiles(page, 'a.pdf');
  await page.selectOption('#f-style', 'roman'); await page.selectOption('#f-fmt', '{n}'); await page.fill('#f-skip', '1');
  const [o] = await runAndDownload(page); const t = pdftext(o); check('roman i, ii', /\bi\b/.test(t) && /\bii\b/.test(t), t);
});
await T('bates', async () => {
  await openTool(page, 'bates'); await addFiles(page, ['a.pdf', 'b.pdf']);
  const outs = await runAndDownload(page, '.action-wrap .btn.primary', { all: true });
  check('2 outputs', outs.length === 2); const t1 = pdftext(outs[0]), t2 = pdftext(outs[1]);
  check('a: 000001..3', /ACME-000001/.test(t1) && /ACME-000003/.test(t1)); check('b continues 000004..6', /ACME-000004/.test(t2) && /ACME-000006/.test(t2), t2);
});
await T('headers-footers', async () => {
  await openTool(page, 'headers-footers'); await addFiles(page, 'a.pdf');
  await page.fill('#f-hl', '{filename}'); await page.fill('#f-hr', 'Generated {date}');
  const [o] = await runAndDownload(page); const t = pdftext(o);
  check('filename in header', /a\b/.test(t) && /Generated/.test(t), t.slice(0, 200)); check('Page 1 of 3', /Page 1 of 3/.test(t));
});
await T('flatten forms', async () => {
  await openTool(page, 'flatten'); await addFiles(page, 'form.pdf');
  const [o] = await runAndDownload(page); check('saved', fs.statSync(o).size > 500);
});
await T('flatten all', async () => {
  await openTool(page, 'flatten'); await addFiles(page, 'report10.pdf'); await page.click('.seg-b:has-text("Everything")');
  const [o] = await runAndDownload(page); const t = pdftext(o);
  check('searchable text kept', /Report page 2/.test(t), t.slice(0, 120)); console.log('   size', fs.statSync(o).size);
});
await T('change colors dark', async () => {
  await openTool(page, 'change-colors'); await addFiles(page, 'report10.pdf');
  await page.waitForSelector('.cc-img'); await page.screenshot({ path: OUT + '/colors.png' });
  const [o] = await runAndDownload(page); const t = pdftext(o);
  check('text searchable', /Report page/.test(t)); execFileSync('pdftoppm', ['-r', '40', '-png', '-f', '1', '-l', '1', o, OUT + '/dark']);
});
await T('metadata', async () => {
  await openTool(page, 'metadata'); await addFiles(page, 'report10.pdf');
  await page.waitForFunction(() => document.querySelector('#f-title') && document.querySelector('#f-title').value === 'Quarterly Report');
  check('prefilled author', (await page.inputValue('#f-author')) === 'Test Author');
  await page.fill('#f-title', 'Changed Title'); await page.fill('#f-keywords', 'alpha, beta');
  const [o] = await runAndDownload(page); const i = inspect(o);
  check('title changed', i.meta['/Title'] === 'Changed Title', JSON.stringify(i.meta)); check('keywords', /alpha/.test(i.meta['/Keywords'] || ''));
});
check('no console errors', errors.length === 0, errors.join('\n'));
await browser.close();
process.exit(summary() ? 1 : 0);
