import { launch, openTool, addFiles, runAndDownload, check, summary, inspect, OUT } from './lib.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { browser, page, errors } = await launch({ width: 1400, height: 1000 });
const only = process.argv[2];
const T = async (name, fn) => { if (only && !name.includes(only)) return; console.log('\n# ' + name); try { await fn(); } catch (e) { check(name + ' (exception)', false, e.message.slice(0, 500)); } };
const raw = (p) => execFileSync('pdftotext', ['-layout', p, '-'], { encoding: 'utf8' });
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', timeout: 120000 });
await T('pdf-to-images', async () => {
  await openTool(page, 'pdf-to-images'); await addFiles(page, 'a.pdf'); await page.fill('#f-pages', '1-2');
  const outs = await runAndDownload(page, '.action-wrap .btn.primary', { all: true }); check('2 png', outs.length === 2 && outs.every((p) => p.endsWith('.png')), outs.join());
  check('png valid', fs.readFileSync(outs[0]).slice(1, 4).toString() === 'PNG');
});
await T('extract-text', async () => {
  await openTool(page, 'extract-text'); await addFiles(page, 'report10.pdf'); await page.fill('#f-pages', '1-2');
  const [o] = await runAndDownload(page); const t = fs.readFileSync(o, 'utf8'); check('has text', /Chapter 1: Introduction/.test(t) && /Report page 2/.test(t), t.slice(0, 200)); check('markers', /--- Page 2 ---/.test(t));
});
await T('extract-text OCR', async () => {
  await openTool(page, 'extract-text'); await addFiles(page, 'scan.pdf');
  const [o] = await runAndDownload(page, '.action-wrap .btn.primary', { timeout: 180000 }); const t = fs.readFileSync(o, 'utf8'); console.log('   OCR:', JSON.stringify(t.slice(0, 160)));
  check('OCR text', /quick brown fox/i.test(t) && /48213/.test(t));
});
await T('extract-images', async () => {
  await openTool(page, 'extract-images'); await addFiles(page, 'images.pdf');
  const outs = await runAndDownload(page, '.action-wrap .btn.primary', { all: true }); check('3 jpgs', outs.length === 3 && outs.every((p) => p.endsWith('.jpg')), outs.join());
  check('valid jpeg', fs.readFileSync(outs[0])[0] === 0xFF);
});
await T('extract-images page mode', async () => {
  await openTool(page, 'extract-images'); await addFiles(page, 'images.pdf'); await page.click('.seg-b:has-text("Decoded from page")');
  const outs = await runAndDownload(page, '.action-wrap .btn.primary', { all: true }); check('3 pngs', outs.length === 3 && outs.every((p) => p.endsWith('.png')), outs.join());
});
await T('pdf-to-html', async () => {
  await openTool(page, 'pdf-to-html'); await addFiles(page, 'report10.pdf');
  let [o] = await runAndDownload(page); let t = fs.readFileSync(o, 'utf8'); check('flow: heading', /<h1>Chapter 1: Introduction<\/h1>/.test(t) || /<h[12]>[^<]*Introduction/.test(t), t.slice(0, 600)); check('flow: paragraph', /<p>.*Lorem ipsum/.test(t));
  await openTool(page, 'pdf-to-html'); await addFiles(page, 'report10.pdf'); await page.click('.seg-b:has-text("Page pictures")');
  [o] = await runAndDownload(page); t = fs.readFileSync(o, 'utf8'); check('overlay: img + spans', /<img class="bg"/.test(t) && /<span style/.test(t));
});
await T('pdf-to-word', async () => {
  await openTool(page, 'pdf-to-word'); await addFiles(page, 'report10.pdf');
  const [o] = await runAndDownload(page, '.action-wrap .btn.primary', { timeout: 120000 }); check('docx saved', fs.statSync(o).size > 3000);
  const pdf = sh('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', OUT + '/lo', o]); const t = raw(OUT + '/lo/' + o.split('/').pop().replace('.docx', '.pdf'));
  check('LibreOffice opens it & text intact', /Chapter 1: Introduction/.test(t) && /Lorem ipsum/.test(t) && /Report page 2/.test(t), t.slice(0, 200));
  console.log('   word → pdf pages:', inspect(OUT + '/lo/' + o.split('/').pop().replace('.docx', '.pdf')).n);
});
await T('pdf-to-excel', async () => {
  await openTool(page, 'pdf-to-excel'); await addFiles(page, 'invoices.pdf'); await page.locator('label.chk', { hasText: 'include text' }).click();
  const [o] = await runAndDownload(page); const py = sh('python3', ['-c', `import openpyxl;wb=openpyxl.load_workbook('${o}');print(wb.sheetnames);print([[c.value for c in r] for r in wb.worksheets[0].iter_rows()][:4])`]); console.log('   ', py.trim().slice(0, 200)); check('xlsx readable', /INV-1001|INVOICE/i.test(py));
});
await T('pdf-to-pptx image', async () => {
  await openTool(page, 'pdf-to-pptx'); await addFiles(page, 'a.pdf');
  const [o] = await runAndDownload(page, '.action-wrap .btn.primary', { timeout: 120000 }); const py = sh('python3', ['-c', `from pptx import Presentation;p=Presentation('${o}');print(len(p.slides.__iter__.__self__._sldIdLst), len(list(p.slides[0].shapes)))`]); console.log('   ', py.trim()); check('3 slides', /^3 /.test(py));
});
await T('pdf-to-pptx text', async () => {
  await openTool(page, 'pdf-to-pptx'); await addFiles(page, 'report10.pdf'); await page.click('.seg-b:has-text("Editable text")');
  const [o] = await runAndDownload(page, '.action-wrap .btn.primary', { timeout: 120000 }); const py = sh('python3', ['-c', `from pptx import Presentation;p=Presentation('${o}');print(' | '.join(sh.text_frame.text for sh in p.slides[0].shapes if sh.has_text_frame)[:150])`]); console.log('   ', py.trim()); check('text boxes', /Chapter 1: Introduction/.test(py));
});
await T('pdf-to-ebook epub', async () => {
  await openTool(page, 'pdf-to-ebook'); await addFiles(page, 'report10.pdf');
  const [o] = await runAndDownload(page); const ls = sh('unzip', ['-l', o]); check('epub structure', /mimetype/.test(ls) && /content\.opf/.test(ls) && /ch1\.xhtml/.test(ls), ls);
  const first = sh('unzip', ['-p', o, 'mimetype']); check('mimetype first', first === 'application/epub+zip');
  const pdf = sh('python3', ['-c', `import zipfile;z=zipfile.ZipFile('${o}');print(z.infolist()[0].filename, z.infolist()[0].compress_type)`]); check('mimetype stored first', /^mimetype 0/.test(pdf), pdf);
});
await T('pdf-to-ebook guide', async () => {
  await openTool(page, 'pdf-to-ebook'); await addFiles(page, 'report10.pdf'); await page.click('.seg-b:has-text("Study guide")');
  const [o] = await runAndDownload(page); const t = fs.readFileSync(o, 'utf8'); check('guide sections', /Key points/.test(t) && /Key terms/.test(t), t.slice(0, 300));
});
await T('ocr tool', async () => {
  await openTool(page, 'ocr'); await addFiles(page, 'scan.pdf');
  const [o] = await runAndDownload(page, '.action-wrap .btn.primary', { timeout: 180000 }); const t = raw(o); check('searchable text layer', /quick brown fox/i.test(t) && /48213/.test(t), t.slice(0, 200));
  const i = inspect(o); check('still 1 page', i.n === 1);
});
await T('summarize', async () => {
  await openTool(page, 'summarize'); await addFiles(page, 'report10.pdf');
  const [o] = await runAndDownload(page); const t = fs.readFileSync(o, 'utf8'); check('summary md', /Summary of report10/.test(t) && /Key terms/.test(t), t.slice(0, 300));
});
await T('compare', async () => {
  await openTool(page, 'compare'); await addFiles(page, ['a.pdf', 'b.pdf']);
  const [o] = await runAndDownload(page, '.action-wrap .btn.primary', { timeout: 120000 }); await page.waitForSelector('.cmp'); console.log('   ', (await page.textContent('.cmp-sum')).trim()); check('report pdf', inspect(o).n >= 1);
  await page.screenshot({ path: OUT + '/compare.png' });
});
await T('repair', async () => {
  await openTool(page, 'repair'); await addFiles(page, 'broken.pdf');
  const [o] = await runAndDownload(page, '.action-wrap .btn.primary', { timeout: 120000 }); const i = inspect(o); console.log('   ', JSON.stringify(i).slice(0, 200)); check('recovered ≥1 page', i.n >= 1);
});
await T('chat', async () => {
  await openTool(page, 'chat'); await addFiles(page, 'report10.pdf'); await page.waitForSelector('.chat-in textarea'); await page.waitForFunction(() => /Ready/.test(document.querySelector('.chat-log').previousElementSibling.textContent));
  await page.fill('.chat-in textarea', 'What is the marker word on page 7?'); await page.click('.chat-in .btn.primary'); await page.waitForSelector('.msg.bot blockquote, .msg.bot p:not(.muted)'); await page.waitForTimeout(500);
  const txt = await page.textContent('.msg.bot'); console.log('   answer:', txt.slice(0, 160)); check('mentions alpha7', /alpha7/.test(txt));
});
check('no console errors', errors.filter((e) => !/Failed to load resource|Cannot read|Error: /.test(e)).length === 0, errors.join('\n'));
await browser.close();
process.exit(summary() ? 1 : 0);
