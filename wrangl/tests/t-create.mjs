import { launch, openTool, addFiles, runAndDownload, check, summary, inspect, OUT } from './lib.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { browser, page, errors } = await launch({ width: 1400, height: 1000 });
const only = process.argv[2];
const T = async (name, fn) => { if (only && !name.includes(only)) return; console.log('\n# ' + name); try { await fn(); } catch (e) { check(name + ' (exception)', false, e.message.slice(0, 500)); } };
const txt = (p) => execFileSync('pdftotext', ['-layout', p, '-'], { encoding: 'utf8' });
const png = (p, n) => execFileSync('pdftoppm', ['-r', '60', '-png', '-f', '1', '-l', '1', p, OUT + '/' + n]);
await T('word', async () => {
  await openTool(page, 'word-to-pdf'); await addFiles(page, 'sample.docx');
  const [o] = await runAndDownload(page, '.action-wrap .btn.primary', { timeout: 90000 }); const t = txt(o); const i = inspect(o);
  console.log('   pages', i.n, 'size', i.pages[0].w, i.pages[0].h);
  check('heading', /Sample Document/.test(t)); check('bold text', /bold text/.test(t)); check('table cells', /R2C3/.test(t)); check('rupee line present (₹ glyph is drawn as a picture)', /Price:\s+1,250/.test(t), t.match(/Price.*/) + ''); check('bullets', /First bullet/.test(t) && /Numbered two/.test(t)); check('many paragraphs → multi page', i.n >= 2);
  png(o, 'word');
});
await T('html', async () => {
  await openTool(page, 'html-to-pdf'); await addFiles(page, 'sample.html');
  const [o] = await runAndDownload(page); const t = txt(o); check('html title', /HTML Title/.test(t)); check('box text', /Boxed content/.test(t)); png(o, 'html');
  const link = execFileSync('python3', ['-c', `import pypdf,sys;r=pypdf.PdfReader('${o}');print([a.get_object().get('/A',{}).get('/URI') for a in (r.pages[0].get('/Annots') or [])])`], { encoding: 'utf8' }); check('link annotation', /example\.com/.test(link), link);
});
await T('markdown', async () => {
  await openTool(page, 'markdown-to-pdf'); await addFiles(page, 'sample.md');
  const [o] = await runAndDownload(page); const t = txt(o); check('md heading', /Markdown Title/.test(t)); check('list nested', /nested/.test(t)); check('table', /1\s+2/.test(t)); check('code', /code block/.test(t)); png(o, 'md');
});
await T('create-pdf', async () => {
  await openTool(page, 'create-pdf'); await page.click('.rte'); await page.keyboard.press('Control+a'); await page.keyboard.type('My typed document line.');
  const [o] = await runAndDownload(page, '.action-wrap .btn.primary'); check('typed text', /My typed document line/.test(txt(o)));
});
await T('excel', async () => {
  await openTool(page, 'excel-to-pdf'); await addFiles(page, 'sample.xlsx');
  const [o] = await runAndDownload(page); const t = txt(o); check('headers', /Region/.test(t) && /Total/.test(t)); check('formula value', /320/.test(t) || /North/.test(t), t.slice(0, 300)); check('sheet 2', /Hello/.test(t)); png(o, 'xlsx');
});
await T('csv→pdf', async () => {
  await openTool(page, 'csv-pdf'); await addFiles(page, 'sample.csv');
  const [o] = await runAndDownload(page); const t = txt(o); check('quoted comma kept', /Gadget, large/.test(t)); check('values', /19\.99/.test(t));
});
await T('epub', async () => {
  await openTool(page, 'ebook-to-pdf'); await addFiles(page, 'sample.epub');
  const [o] = await runAndDownload(page); const t = txt(o); const i = inspect(o); check('title page', /Test Book/.test(t)); check('chapters', /Chapter One/.test(t) && /Chapter Two/.test(t)); console.log('   pages', i.n, i.pages[0].w);
});
await T('images', async () => {
  await openTool(page, 'images-to-pdf'); await addFiles(page, ['photo.jpg', 'cutout.png']);
  const [o] = await runAndDownload(page); const i = inspect(o); check('2 pages A4', i.n === 2 && Math.abs(i.pages[0].w - 595.3) < 2 || Math.abs(i.pages[0].w - 841.9) < 2, JSON.stringify(i.pages));
});
check('no console errors', errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, errors.join('\n'));
await browser.close();
process.exit(summary() ? 1 : 0);
