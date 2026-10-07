// ===== PDF helpers: pdf-lib / pdf.js / qpdf glue =====
const PDF_FILES = { accept: ".pdf,application/pdf", kind: "pdf" };
const P = W.pdf = {};
P.SIZES = { A3: [841.89, 1190.55], A4: [595.28, 841.89], A5: [419.53, 595.28], A6: [297.64, 419.53], Letter: [612, 792], Legal: [612, 1008], Tabloid: [792, 1224], Executive: [522, 756] };
P.sizeOpts = Object.keys(P.SIZES).map((k) => [k, `${k} (${Math.round(P.SIZES[k][0] * 25.4 / 72)}×${Math.round(P.SIZES[k][1] * 25.4 / 72)} mm)`]);
W.canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

// run a queue so thumbnails don't starve the UI
const _q = []; let _active = 0;
function enqueue(fn) { return new Promise((res, rej) => { _q.push({ fn, res, rej }); pump(); }); }
function pump() { while (_active < 2 && _q.length) { const j = _q.shift(); _active++; j.fn().then(j.res, j.rej).finally(() => { _active--; pump(); }); } }
P.enqueue = enqueue;

P.create = async () => {
  const { PDFDocument } = await W.lib('pdflib');
  const d = await PDFDocument.create();
  d.setProducer('Wrangl'); d.setCreator('Wrangl'); d.setCreationDate(new Date()); d.setModificationDate(new Date());
  return d;
};
P.save = async (doc, opts) => { try { doc.setProducer('Wrangl'); doc.setModificationDate(new Date()); } catch { } return doc.save(Object.assign({ useObjectStreams: true }, opts)); };
P.rgb = async (hex, fallback = '#000000') => {
  const { rgb } = await W.lib('pdflib');
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '') || /^#?([0-9a-f]{6})$/i.exec(fallback);
  const n = parseInt(m[1], 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
P.hexToRgb01 = (hex) => { const n = parseInt(String(hex).replace('#', '').padEnd(6, '0'), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

// ---------- qpdf (WebAssembly) ----------
let _qpdf;
P.qpdf = async function (args, inputs, outputs = ['/out.pdf']) {
  const { factory, wasmBinary } = await (_qpdf || (_qpdf = W.lib('qpdf')));
  const log = [];
  const url = P._wasmUrl || (P._wasmUrl = URL.createObjectURL(new Blob([wasmBinary], { type: 'application/wasm' })));
  const m = await factory({ noInitialRun: true, print: (t) => log.push(t), printErr: (t) => log.push(t), locateFile: (f) => (/\.wasm$/.test(f) ? url : f) });
  for (const [name, data] of Object.entries(inputs)) m.FS.writeFile(name, data);
  let code;
  try { code = m.callMain(args); } catch (e) { code = typeof e.status === 'number' ? e.status : (e instanceof Error ? 99 : 1); if (code === 99) log.push(String(e)); }
  const out = {};
  for (const o of outputs) { try { out[o] = m.FS.readFile(o); } catch { } }
  return { code, out, log: log.join('\n') };
};
/** decrypt with a password (empty string for owner-only protection). Returns bytes or throws {badPassword} */
P.decryptBytes = async function (bytes, password = '') {
  const r = await P.qpdf([`--password=${password}`, '--decrypt', '/in.pdf', '/out.pdf'], { '/in.pdf': bytes });
  if (r.out['/out.pdf'] && (r.code === 0 || r.code === 3)) return r.out['/out.pdf'];
  const e = new Error(/password/i.test(r.log) || r.code === 2 ? 'Incorrect password' : 'Could not decrypt: ' + r.log.split('\n')[0]);
  e.badPassword = /password/i.test(r.log) || r.code === 2; throw e;
};

// ---------- opening PDFs ----------
async function askPassword(name, again) {
  const pw = await W.ask('Password needed', `“${name}” is password-protected. Enter its password to open it on this device.`, { type: 'password', ok: 'Unlock', placeholder: 'Password', note: again ? 'That password didn’t work — try again.' : '' });
  return pw;
}
/** Opens with pdf.js, handling passwords by decrypting with qpdf. Fills item.info. */
P.looksEncrypted = (b) => { const n = b.length; let s = ''; const from = Math.max(0, n - 40000); for (let i = from; i < n; i += 0x4000) s += String.fromCharCode.apply(null, b.subarray(i, Math.min(n, i + 0x4000))); return /\/Encrypt\b/.test(s); };
P.prepare = async function (item) {
  if (item._ready) return item;
  item.wasEncrypted = item.wasEncrypted || P.looksEncrypted(await item.buf());
  const pdfjs = await W.lib('pdfjs');
  let tries = 0;
  for (; ;) {
    const bytes = await item.buf();
    try {
      const task = pdfjs.getDocument({ data: bytes.slice(), password: item.password || undefined, isEvalSupported: false });
      const doc = await task.promise;
      item._pdfjs = Promise.resolve(doc);
      item.info.pages = doc.numPages;
      const pg = await doc.getPage(1); const vp = pg.getViewport({ scale: 1 });
      item.info.pw = vp.width; item.info.ph = vp.height;
      item._ready = true; return item;
    } catch (e) {
      if (e && e.name === 'PasswordException') {
        const pw = await askPassword(item.name, tries++ > 0);
        if (pw == null) throw Object.assign(new Error('cancelled'), { cancelled: true });
        try { const dec = await P.decryptBytes(bytes, pw); item.password = ''; item.setFile(W.file(dec, item.name, 'application/pdf')); item.decrypted = true; item.wasEncrypted = true; continue; } catch (e2) { if (e2.badPassword) continue; throw e2; }
      }
      throw e;
    }
  }
};
P.doc = async function (item) { await P.prepare(item); return item._pdfjs || (item._pdfjs = P.prepare(item).then(() => item._pdfjs)); };
/** pdf-lib document (fresh instance each call; you may mutate it) */
P.load = async function (item, opts = {}) {
  const { PDFDocument } = await W.lib('pdflib');
  let bytes = await item.buf();
  try { return await PDFDocument.load(bytes, Object.assign({ updateMetadata: false }, opts)); }
  catch (e) {
    if (/encrypt/i.test(e.message || '')) {
      const dec = await P.decryptBytes(bytes, item.password || '');
      item.setFile(W.file(dec, item.name, 'application/pdf')); bytes = dec;
      return PDFDocument.load(bytes, Object.assign({ updateMetadata: false }, opts));
    }
    throw e;
  }
};
P.loadBytes = async (bytes, opts = {}) => { const { PDFDocument } = await W.lib('pdflib'); return PDFDocument.load(bytes, Object.assign({ updateMetadata: false }, opts)); };
P.pageCount = async (item) => { await P.prepare(item); return item.info.pages; };

// ---------- rendering ----------
P.render = async function (page, { scale = 1, width, canvas, bg = '#ffffff', rotation } = {}) {
  let vp = page.getViewport({ scale: 1, rotation });
  if (width) scale = width / vp.width;
  vp = page.getViewport({ scale, rotation });
  const c = canvas || W.canvas(vp.width, vp.height);
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d', { willReadFrequently: false });
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); }
  await page.render({ canvasContext: ctx, viewport: vp, background: bg || undefined }).promise;
  return c;
};
P.renderPage = async function (item, idx, opts) { const doc = await P.doc(item); const page = await doc.getPage(idx + 1); return P.render(page, opts); };
P.thumb = async function (item, idx = 0, width = 120) {
  item._th = item._th || new Map();
  const key = idx + '@' + width;
  if (!item._th.has(key)) {
    item._th.set(key, enqueue(async () => {
      const doc = await P.doc(item);
      const page = await doc.getPage(idx + 1);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const c = await P.render(page, { width: width * dpr });
      return c.toDataURL('image/jpeg', 0.82);
    }));
  }
  const url = await item._th.get(key);
  return h('img.fl-img', { src: url, alt: 'Page ' + (idx + 1), draggable: 'false' });
};
/** JPEG/PNG blob of a page at a dpi */
P.pageBlob = async function (item, idx, { dpi = 150, type = 'image/jpeg', q = 0.85, bg = '#fff' } = {}) {
  const c = await P.renderPage(item, idx, { scale: dpi / 72, bg });
  return { blob: await U.canvasBlob(c, type, q), w: c.width, h: c.height, canvas: c };
};

// ---------- text ----------
/** returns [{w,h,items:[{str,x,y,w,h,size,font,bold,italic,mono,serif}]}] with y measured from the top (baseline) */
P.text = async function (item, { pages, onProgress } = {}) {
  const doc = await P.doc(item); const out = [];
  const idxs = pages || Array.from({ length: doc.numPages }, (_, i) => i);
  for (let k = 0; k < idxs.length; k++) {
    const i = idxs[k];
    const page = await doc.getPage(i + 1); const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = [];
    for (const t of tc.items) {
      if (t.str === undefined) continue;
      const tr = t.transform; const size = Math.hypot(tr[0], tr[1]) || Math.hypot(tr[2], tr[3]) || 1;
      const st = tc.styles[t.fontName] || {}; const fam = (st.fontFamily || '') + ' ' + (t.fontName || '');
      let name = t.fontName || ''; try { const f = page.commonObjs.has(name) ? page.commonObjs.get(name) : null; if (f && f.name) name = f.name; } catch { }
      const fl = (name + ' ' + fam).toLowerCase();
      items.push({ str: t.str, x: tr[4], y: vp.height - tr[5], w: t.width, h: t.height || size, size, eol: !!t.hasEOL, font: name,
        bold: /bold|black|heavy|semibold|demi/.test(fl), italic: /italic|oblique/.test(fl), mono: /mono|courier|consolas|typewriter/.test(fl) || /monospace/.test(fam), serif: /serif|times|georgia|garamond|minion|cambria/.test(fl) && !/sans/.test(fl) });
    }
    out.push({ index: i, w: vp.width, h: vp.height, items });
    onProgress && onProgress((k + 1) / idxs.length);
  }
  return out;
};
/** merge text items into reading-order lines: [{y,x,size,text,items,bold,italic}] */
P.lines = function (pg, { tol = 0.5 } = {}) {
  const its = pg.items.filter((t) => t.str !== '' || t.eol).slice().sort((a, b) => (Math.abs(a.y - b.y) < Math.min(a.size, b.size) * tol ? a.x - b.x : a.y - b.y));
  const lines = [];
  for (const t of its) {
    if (!t.str.trim() && !t.str) continue;
    let L = lines[lines.length - 1];
    if (L && Math.abs(L.y - t.y) < Math.max(L.size, t.size) * tol) {
      const gap = t.x - (L.x2);
      L.text += (gap > t.size * 0.18 && !/\s$/.test(L.text) && !/^\s/.test(t.str) ? ' ' : '') + t.str; L.x2 = Math.max(L.x2, t.x + t.w); L.items.push(t); L.size = Math.max(L.size, t.size);
      L.bold = L.bold && t.bold; L.italic = L.italic && t.italic;
    } else lines.push({ y: t.y, x: t.x, x2: t.x + t.w, size: t.size, text: t.str, items: [t], bold: t.bold, italic: t.italic, mono: t.mono });
  }
  return lines.filter((l) => l.text.trim());
};
P.plainText = async function (item, opts = {}) {
  const pgs = await P.text(item, opts);
  return pgs.map((pg) => P.lines(pg).map((l) => l.text.replace(/\s+$/, '')).join('\n'));
};

// ---------- misc doc helpers ----------
P.copyPages = async (dst, srcDoc, idxs) => dst.copyPages(srcDoc, idxs);
P.pageSize = (page) => { const { width, height } = page.getSize(); return [width, height]; };
/** Effective rotation-aware visible box */
P.visibleBox = (page) => { const b = page.getCropBox ? page.getCropBox() : page.getMediaBox(); return b; };
P.addLink = function (doc, page, rect, url) {
  const { PDFName, PDFString } = PDFLib; const ctx = doc.context;
  const link = ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: rect, Border: [0, 0, 0], A: ctx.obj({ S: 'URI', URI: PDFString.of(url) }) });
  const ref = ctx.register(link); const annots = page.node.Annots() || ctx.obj([]);
  if (!page.node.Annots()) page.node.set(PDFName.of('Annots'), annots);
  annots.push(ref);
};
P.download = (bytes, name) => U.download(new Blob([bytes], { type: 'application/pdf' }), name);
/** build an Uint8Array -> output descriptor */
P.outPdf = (bytes, name) => W.out(name, new Blob([bytes], { type: 'application/pdf' }));
P.suffixName = (item, suffix, ext = 'pdf') => `${U.safeName(U.base(item.name))}${suffix}.${ext}`;

// ---------- affine helpers for placing embedded pages ----------
/** apply B first then A. m = [a,b,c,d,e,f] (PDF convention) */
P.mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
P.scaleM = (sx, sy = sx) => [sx, 0, 0, sy, 0, 0];
P.moveM = (x, y) => [1, 0, 0, 1, x, y];
/** info about the visible (upright) page: box, rotation and the matrix source->visible */
P.viewInfo = function (page, box) {
  const b = box || (page.getCropBox ? page.getCropBox() : page.getMediaBox());
  const l = b.x, bt = b.y, r = b.x + b.width, t = b.y + b.height, bw = b.width, bh = b.height;
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  let m, w, h;
  if (rot === 90) { m = [0, -1, 1, 0, -bt, r]; w = bh; h = bw; }
  else if (rot === 180) { m = [-1, 0, 0, -1, r, t]; w = bw; h = bh; }
  else if (rot === 270) { m = [0, 1, -1, 0, t, -l]; w = bh; h = bw; }
  else { m = [1, 0, 0, 1, -l, -bt]; w = bw; h = bh; }
  return { w, h, m, bbox: { left: l, bottom: bt, right: r, top: t }, rot };
};
/** embed a source page, returning {emb, info} */
P.embed = async function (dst, srcPage, box) {
  const info = P.viewInfo(srcPage, box);
  const [emb] = await dst.embedPages([srcPage], [info.bbox]);
  return { emb, info };
};
/** draw embedded page into dstPage with matrix mapping *visible-upright* coordinates -> page coordinates */
P.place = function (dstPage, e, M) {
  const { pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject } = PDFLib;
  const full = P.mul(M, e.info.m);
  const key = dstPage.node.newXObject('WPage', e.emb.ref);
  dstPage.pushOperators(pushGraphicsState(), concatTransformationMatrix(...full), drawObject(key), popGraphicsState());
};
P.addOutline = function (doc, entries) {
  const { PDFName, PDFHexString } = PDFLib; const ctx = doc.context; const pages = doc.getPages();
  let total = 0;
  const rootRef = ctx.nextRef();
  const build = (list, parentRef) => {
    const refs = list.map(() => ctx.nextRef());
    list.forEach((e, i) => {
      total++;
      const d = ctx.obj({ Title: PDFHexString.fromText(e.title || 'Untitled'), Parent: parentRef, Dest: [pages[Math.min(e.page, pages.length - 1)].ref, PDFName.of('Fit')] });
      if (i > 0) d.set(PDFName.of('Prev'), refs[i - 1]);
      if (i < list.length - 1) d.set(PDFName.of('Next'), refs[i + 1]);
      if (e.children && e.children.length) { const kids = build(e.children, refs[i]); d.set(PDFName.of('First'), kids[0]); d.set(PDFName.of('Last'), kids[kids.length - 1]); d.set(PDFName.of('Count'), ctx.obj(-e.children.length)); }
      ctx.assign(refs[i], d);
    });
    return refs;
  };
  if (!entries.length) return;
  const top = build(entries, rootRef);
  ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: top[0], Last: top[top.length - 1], Count: total }));
  doc.catalog.set(PDFName.of('Outlines'), rootRef);
};
/** common option fields */
P.pagesField = (o = {}) => Object.assign({ id: 'pages', type: 'text', label: 'Pages', placeholder: 'All pages — or e.g. 1-3, 5, 8-', help: 'Leave empty for every page. Use commas and ranges; “odd”, “even” and “last” work too.' }, o);
P.baseName = (items) => U.safeName(U.base(items[0].name));
