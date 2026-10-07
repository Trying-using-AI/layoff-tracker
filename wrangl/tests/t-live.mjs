// Runs the real UI against the published bytes under the real https origin.
//   WRANGL_URL=https://<owner>.github.io/<repo>/ WRANGL_LIVE_FILE=/path/to/downloaded.html node tests/t-live.mjs
import { launch, openTool, addFiles, runAndDownload, check, summary, inspect, HTML } from './lib.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
if (!process.env.WRANGL_URL) { console.log('set WRANGL_URL and WRANGL_LIVE_FILE'); process.exit(2); }
const { browser, page, errors } = await launch();
const T = async (name, fn) => { console.log('\n# ' + name); try { await fn(); } catch (e) { check(name + ' (exception)', false, e.message.slice(0, 300)); } };

await T('loads over https', async () => {
  await page.goto(HTML); await page.waitForSelector('.tcard');
  check('secure context', await page.evaluate(() => isSecureContext && location.protocol === 'https:'));
  check('title', /Wrangl/.test(await page.title()), await page.title());
  const n = await page.$$eval('.tcard', (c) => c.length); check('70 tools listed', n >= 70, String(n));
  check('DecompressionStream + Worker + wasm', await page.evaluate(() => typeof DecompressionStream === 'function' && typeof Worker === 'function' && typeof WebAssembly === 'object'));
});
await T('merge', async () => {
  await openTool(page, 'merge'); await addFiles(page, ['a.pdf', 'b.pdf']); await page.waitForSelector('.fl-row');
  const [o] = await runAndDownload(page); const i = inspect(o); check('6 pages in order', i.n === 6 && i.pages.map((p) => p.text).join() === 'A1,A2,A3,B1,B2,B3', JSON.stringify(i).slice(0, 160));
});
await T('encrypt (qpdf wasm)', async () => {
  await openTool(page, 'encrypt'); await addFiles(page, 'a.pdf'); await page.fill('#f-pw', 'Sup3r-secret!'); await page.fill('#f-pw2', 'Sup3r-secret!');
  const [o] = await runAndDownload(page); const i = inspect(o, 'Sup3r-secret!'); check('AES-protected, opens with password', fs.readFileSync(o).includes('/Encrypt') && i.n === 3, JSON.stringify(i).slice(0, 120));
  const v = execFileSync('python3', ['-c', `import pypdf;r=pypdf.PdfReader('${o}');print(r.trailer['/Encrypt'].get('/V'), r.trailer['/Encrypt'].get('/R'))`], { encoding: 'utf8' }); check('AES-256 (V5 R6)', /^5 6/.test(v), v);
});
await T('ocr (worker + wasm + model, offline)', async () => {
  await openTool(page, 'ocr'); await addFiles(page, 'scan.pdf');
  const [o] = await runAndDownload(page, '.action-wrap .btn.primary', { timeout: 240000 }); const txt = execFileSync('pdftotext', ['-layout', o, '-'], { encoding: 'utf8' });
  check('searchable text layer', /quick brown fox/i.test(txt) && /48213/.test(txt), txt.slice(0, 160));
});
await T('word to pdf (html engine)', async () => {
  await openTool(page, 'word-to-pdf'); await addFiles(page, 'sample.docx');
  const [o] = await runAndDownload(page); const i = inspect(o); check('pdf with text', i.n >= 1 && i.pages.some((p) => (p.text || '').length > 20), JSON.stringify(i).slice(0, 160));
});
await T('pdf to images', async () => {
  await openTool(page, 'pdf-to-images'); await addFiles(page, 'a.pdf'); const [o] = await runAndDownload(page); check('image/zip produced', fs.statSync(o).size > 1000, o);
});
await T('nothing else on the network', async () => {
  check('no external requests', page.external.length === 0, page.external.slice(0, 5).join(' '));
  const bad = errors.filter((e) => !/Failed to load resource/.test(e)); check('no console errors', bad.length === 0, bad.slice(0, 3).join(' | '));
});
await browser.close(); process.exit(summary() ? 1 : 0);
