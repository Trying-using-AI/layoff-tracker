import { launch, HTML, check, summary } from './lib.mjs';
import fs from 'node:fs';
const { browser, page, errors } = await launch({ width: 1300, height: 900 });
await page.goto(HTML); await page.waitForSelector('.hero');
const F = (n) => ({ name: n, b64: fs.readFileSync('tests/fixtures/' + n).toString('base64') });
const files = Object.fromEntries(['a.pdf', 'b.pdf', 'report10.pdf', 'images.pdf', 'form.pdf', 'spread.pdf', 'invoices.pdf', 'sample.docx', 'cutout.png', 'photo.jpg', 'scan.pdf', 'locked.pdf'].map((n) => [n, F(n)]));
await page.evaluate((files) => { window.__F = files; window.__call = async (id, names, over = {}) => {
  const t = W.byId[id]; const items = []; for (const n of names) { const f = window.__F[n]; const u = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0)); const it = new W.Item(new File([u], n, { type: W.mime(n) })); if (it.kind === 'pdf') await W.pdf.prepare(it); items.push(it); }
  const spec = typeof t.opts === 'function' ? t.opts(items, {}, {}) : (t.opts || []); const fields = W.fields(spec); const vals = Object.assign({}, fields.vals, over);
  const res = await t.run(items, vals, { progress() { }, check() { }, tool: t, api: {} }); const outs = Array.isArray(res) ? res : res.outputs;
  const info = []; for (const o of outs) { let pages = null; if (/\.pdf$/.test(o.name)) { const d = await PDFLib.PDFDocument.load(await o.blob.arrayBuffer()); pages = d.getPageCount(); } info.push([o.name, o.blob.size, pages]); } return info; }; }, files);
const V = [
  ['alternate-mix', ['a.pdf', 'b.pdf'], { take: 2, tail: 'stop' }, (r) => r[0][2] === 6],
  ['nup', ['report10.pdf'], { booklet: true }, (r) => r[0][2] === 6],
  ['nup', ['report10.pdf'], { per: 9, order: 'col', border: false }, (r) => r[0][2] === 2],
  ['split-half', ['report10.pdf'], { mode: 'doc' }, (r) => r.length === 2 && r[0][2] === 5],
  ['split-half', ['spread.pdf'], { dir: 'h', only: true }, (r) => r[0][2] === 6],
  ['split', ['report10.pdf'], { mode: 'parts', parts: 3 }, (r) => r.length === 3],
  ['split', ['report10.pdf'], { mode: 'each' }, (r) => r.length === 10],
  ['rotate', ['a.pdf'], { angle: 270, pages: 'odd' }, (r) => r[0][2] === 3],
  ['flip', ['a.pdf'], { axis: 'both', pages: '1' }, (r) => r[0][2] === 3],
  ['flip', ['a.pdf'], { axis: 'v' }, (r) => r[0][2] === 3],
  ['crop-resize', ['a.pdf'], { mode: 'resize', size: 'custom', cw: 100, ch: 150, fit: 'cover', orient: 'landscape' }, (r) => r[0][2] === 3],
  ['crop-resize', ['a.pdf'], { mode: 'crop', top: 10, left: 10, right: 5, bottom: 5, pages: '2-3' }, (r) => r[0][2] === 3],
  ['compress', ['images.pdf'], { level: 'custom', maxDim: 700, q: 40 }, (r) => r[0][1] < 400000],
  ['compress', ['images.pdf'], { level: 'lossless', target: 0.2 }, (r) => r[0][1] < 250000],
  ['watermark', ['a.pdf'], { layout: 'bottom', layer: 'under', rotate: -30, kind: 'text', text: 'नमस्ते ₹100' }, (r) => r[0][2] === 3],
  ['page-numbers', ['report10.pdf'], { pos: 'tr', style: 'ROMAN', start: 5, fmt: 'custom', custom: 'p.{n}/{N}' }, (r) => r[0][2] === 10],
  ['headers-footers', ['a.pdf'], { hc: 'Hello', fr: '{title} — {date}', line: true, skipFirst: true }, (r) => r[0][2] === 3],
  ['bates', ['a.pdf', 'b.pdf'], { restart: true, box: false, pos: 'bl', step: 5 }, (r) => r.length === 2],
  ['flatten', ['form.pdf'], { mode: 'annots' }, (r) => r[0][2] === 1],
  ['change-colors', ['a.pdf'], { mode: 'bw', text: false, dpi: 110 }, (r) => r[0][2] === 3],
  ['change-colors', ['a.pdf'], { mode: 'duo', ink: '#001133', paper: '#ffeecc', brightness: 20, contrast: 10 }, (r) => r[0][2] === 3],
  ['metadata', ['report10.pdf'], { wipe: true }, (r) => r[0][2] === 10],
  ['pdf-to-images', ['a.pdf'], { fmt: 'image/webp', dpi: 72 }, (r) => r.length === 3],
  ['pdf-to-images', ['a.pdf'], { fmt: 'image/jpeg', dpi: 300, pages: '1' }, (r) => r.length === 1],
  ['pdf-to-zip', ['a.pdf', 'b.pdf'], { mode: 'images', fmt: 'image/png', dpi: 72 }, (r) => r.length === 1],
  ['pdf-to-html', ['a.pdf'], { mode: 'layout' }, (r) => r.length === 1],
  ['pdf-to-excel', ['report10.pdf'], { layout: 'one', text: true, nums: false }, (r) => r.length === 1],
  ['pdf-to-ebook', ['report10.pdf'], { fmt: 'md' }, (r) => /\.md$/.test(r[0][0])],
  ['pdf-to-ebook', ['report10.pdf'], { fmt: 'epub', split: 'p10', title: 'T', author: 'A' }, (r) => /\.epub$/.test(r[0][0])],
  ['pdf-to-word', ['images.pdf'], { images: true, tables: false, breaks: true }, (r) => r.length === 1],
  ['images-to-pdf', ['photo.jpg', 'cutout.png'], { size: 'fit', recompress: true, quality: 60, maxPx: 900, margin: 0 }, (r) => r[0][2] === 2],
  ['images-to-pdf', ['photo.jpg'], { size: 'Letter', orient: 'landscape', fit: 'fill', bg: '#112233' }, (r) => r[0][2] === 1],
  ['word-to-pdf', ['sample.docx'], { useDoc: false, size: 'Letter', margin: 30, numbers: true }, (r) => r[0][2] >= 2],
  ['encrypt', ['a.pdf'], { pw: 'x', pw2: 'x', print: false, copy: false, modify: false }, (r) => r.length === 1],
  ['extract-text', ['a.pdf'], { layout: 'raw', marks: false, ocr: false }, (r) => r.length === 1],
  ['ocr', ['scan.pdf'], { lang: 'eng', dpi: 150, skip: false, txt: true }, (r) => r.length === 2],
  ['summarize', ['report10.pdf'], { len: 12, kw: false }, (r) => r.length === 1],
  ['compare', ['a.pdf', 'a.pdf'], { visual: false }, (r) => r.length === 1],
  ['remove-password', ['locked.pdf'], {}, (r) => false],
];
for (const [id, names, over, ok] of V) {
  const t0 = Date.now(); let r, err; try { r = await page.evaluate(([id, names, over]) => window.__call(id, names, over), [id, names, over]); } catch (e) { err = e.message.split('\n')[0].slice(0, 160); }
  if (id === 'remove-password' && err) { check(`${id} (locked, no UI → needs password)`, true); continue; }
  check(`${id} ${JSON.stringify(over).slice(0, 70)}`, !err && ok(r), err || JSON.stringify(r)); 
}
check('no console errors', errors.filter((e) => !/Failed to load resource|invalid password|startxref/.test(e)).length === 0, errors.join('\n'));
await browser.close(); process.exit(summary() ? 1 : 0);
