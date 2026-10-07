// ===== Text/PDF → handwriting, scanned-notes clean-up, document scanner =====
{
  const IMG_ACCEPT = 'image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.heic';
  const rnd = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  // ================= HANDWRITING ENGINE =================
  const PAPER = { ruled: 'Ruled notebook', legal: 'Yellow legal pad', grid: 'Graph / grid', dotted: 'Dotted', plain: 'Plain white', cream: 'Plain cream' };
  W.hw = {
    fields: (extra = []) => [
      { id: 'font', type: 'select', label: 'Handwriting', options: W.hwFonts.map((f) => [f.id, `${f.family} — ${f.label}`]), value: 'caveat' },
      { type: 'row', children: [{ id: 'size', type: 'range', label: 'Letter size', min: 12, max: 34, value: 20, unit: ' pt' }, { id: 'ink', type: 'color', label: 'Ink', value: '#1b2f78' }] },
      { type: 'row', children: [{ id: 'paper', type: 'select', label: 'Paper', options: Object.entries(PAPER), value: 'ruled' }, { id: 'psize', type: 'select', label: 'Page size', options: [['A4', 'A4'], ['Letter', 'US Letter'], ['A5', 'A5']], value: 'A4' }] },
      { id: 'gap', type: 'range', label: 'Line spacing', min: 6, max: 14, step: 0.5, value: 9, unit: ' mm' },
      { id: 'jitter', type: 'range', label: 'Natural variation (wobble, slant, spacing)', min: 0, max: 100, value: 45, unit: '%' },
      { id: 'margin', type: 'range', label: 'Margin', min: 8, max: 40, value: 22, unit: ' mm' },
      { id: 'scan', type: 'check', label: 'Photographed / scanned paper look (grain & soft shading)', value: true },
      ...extra,
    ],
    async renderPages(text, o, { dpi = 140, maxPages = 40, onProgress } = {}) {
      const fam = await W.loadFont(o.font); const [pw, ph] = P.SIZES[o.psize || 'A4']; const WPX = Math.round(pw / 72 * dpi), HPX = Math.round(ph / 72 * dpi); const mm = dpi / 25.4;
      const gap = o.gap * mm; const size = o.size * dpi / 72; const mx = o.margin * mm; const top = Math.max(o.margin * mm * 0.9, gap * 1.6); const left = mx + (o.paper === 'ruled' || o.paper === 'legal' ? gap * 0.9 : 0); const right = WPX - mx * 0.8; const jit = (o.jitter || 0) / 100; const rand = rnd(7);
      const pages = []; const wordsOut = []; let cv, g, y, words;
      const newPage = () => { cv = W.canvas(WPX, HPX); g = cv.getContext('2d'); words = []; pages.push(cv); wordsOut.push(words); W.hw.paper(g, WPX, HPX, o, { gap, top, left: mx, dpi }); y = top + gap; g.font = `${size}px '${fam}'`; g.textBaseline = 'alphabetic'; };
      newPage(); const m = W.canvas(4, 4).getContext('2d'); m.font = `${size}px '${fam}'`; const space = m.measureText(' ').width * 1.15;
      const col = o.ink || '#1b2f78'; const paras = String(text).replace(/\r/g, '').split('\n'); const baseDy = gap * 0.12;
      for (const para of paras) {
        const toks = para.split(/\s+/).filter(Boolean);
        if (!toks.length) { y += gap; if (y > HPX - mx) { if (pages.length >= maxPages) break; newPage(); } continue; }
        let x = left + (rand() * 6 * jit); let slope = (rand() - 0.5) * jit * 0.012;
        for (const wd of toks) {
          const w = m.measureText(wd).width;
          if (x + w > right && x > left + 1) { y += gap; x = left + rand() * 6 * jit; slope = (rand() - 0.5) * jit * 0.012; if (y > HPX - mx * 0.9) { if (pages.length >= maxPages) { onProgress && onProgress(1); return { pages, words: wordsOut, truncated: true }; } newPage(); x = left; } }
          const dy = (rand() - 0.5) * 2 * jit * size * 0.07 + (x - left) * slope; const rot = (rand() - 0.5) * 2 * jit * 0.03 + slope * 0.4; const sc = 1 + (rand() - 0.5) * jit * 0.1;
          g.save(); g.translate(x, y - baseDy + dy); g.rotate(rot); g.scale(sc, sc * (1 + (rand() - 0.5) * jit * 0.06)); g.fillStyle = col; g.globalAlpha = 0.82 + rand() * 0.16; g.font = `${size}px '${fam}'`; g.fillText(wd, 0, 0); g.globalAlpha = 0.28; g.fillText(wd, 0.5, 0.4); g.restore();
          words.push({ text: wd, x, y: y - size * 0.8 + dy, w: w * sc, h: size });
          x += w * sc + space * (1 + (rand() - 0.4) * jit * 0.5);
        }
        y += gap;
        if (y > HPX - mx * 0.9) { if (pages.length >= maxPages) break; newPage(); }
      }
      if (o.scan) pages.forEach((c, i) => W.hw.agePaper(c, rnd(11 + i)));
      onProgress && onProgress(1); return { pages, words: wordsOut, truncated: false };
    },
    paper(g, w, h, o, { gap, top, left, dpi }) {
      const bg = { legal: '#fff4b8', cream: '#fbf5e6', ruled: '#fffefa', grid: '#fffefa', dotted: '#fffefa', plain: '#ffffff' }[o.paper] || '#fff'; g.fillStyle = bg; g.fillRect(0, 0, w, h);
      const line = o.paper === 'legal' ? '#7aa2c8' : '#a9c1e0'; const lw = Math.max(1, dpi / 110);
      if (o.paper === 'ruled' || o.paper === 'legal') { g.strokeStyle = line; g.lineWidth = lw; for (let y = top + gap; y < h - gap * 0.6; y += gap) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.strokeStyle = o.paper === 'legal' ? '#d9534f' : '#f19a9a'; g.lineWidth = lw * 1.3; const mxp = left + gap * 0.55; g.beginPath(); g.moveTo(mxp, 0); g.lineTo(mxp, h); g.stroke(); if (o.paper === 'legal') { g.beginPath(); g.moveTo(mxp + 5 * lw, 0); g.lineTo(mxp + 5 * lw, h); g.stroke(); } }
      else if (o.paper === 'grid') { g.strokeStyle = '#c4d6ea'; g.lineWidth = lw * 0.8; const s = gap * 0.55; for (let x = 0; x < w; x += s) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += s) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } }
      else if (o.paper === 'dotted') { g.fillStyle = '#b5c4d6'; const s = gap * 0.55; for (let y = s; y < h; y += s) for (let x = s; x < w; x += s) g.fillRect(x, y, lw * 1.5, lw * 1.5); }
    },
    agePaper(c, rand) {
      const g = c.getContext('2d'); const w = c.width, h = c.height; const grad = g.createLinearGradient(0, 0, w, h * 0.3); grad.addColorStop(0, 'rgba(0,0,0,0.0)'); grad.addColorStop(1, 'rgba(60,40,10,0.07)'); g.fillStyle = grad; g.fillRect(0, 0, w, h);
      const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.78); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(40,30,10,0.16)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
      const id = g.getImageData(0, 0, w, h); const d = id.data; for (let i = 0; i < d.length; i += 4) { const n = (rand() - 0.5) * 9; d[i] += n; d[i + 1] += n; d[i + 2] += n; } g.putImageData(id, 0, 0);
    },
    async toPdf(res, { dpi }) {
      const doc = await P.create(); const font = await P.std(doc, 'Helvetica'); const [pw, ph] = [res.pages[0].width / dpi * 72, res.pages[0].height / dpi * 72];
      for (let i = 0; i < res.pages.length; i++) { const jb = await W.canvasBytes(res.pages[i], 'image/jpeg', 0.88); const im = await doc.embedJpg(jb); const page = doc.addPage([pw, ph]); page.drawImage(im, { x: 0, y: 0, width: pw, height: ph }); const s = 72 / dpi; await P.invisibleText(doc, page, res.words[i].map((w) => ({ text: w.text, x: w.x * s, y: w.y * s, w: w.w * s, h: w.h * s })), font); }
      return P.save(doc);
    },
  };

  W.tool({
    id: 'text-to-handwriting', cat: 'edit', name: 'Text to handwriting', icon: 'pen-tool', desc: 'Write your text on ruled, plain, or grid paper.',
    keys: 'handwritten notes assignment homework font notebook paper write cursive pen realistic',
    async render(root) {
      root.classList.add('wide'); const results = h('div.results'); const prog = W.progress();
      const ta = h('textarea.in.hw-text', { rows: 14, spellcheck: 'true', placeholder: 'Type or paste the text you want written by hand…', value: 'Dear friend,\n\nThis page was written entirely in your browser. Change the pen, the paper and the amount of natural wobble on the right — everything updates as you type.\n\nWith best wishes,\nWrangl', oninput: () => preview() });
      const fields = W.fields(W.hw.fields([{ id: 'sel', type: 'check', label: 'Make the PDF text selectable & searchable', value: true }, { id: 'fmt', type: 'seg', label: 'Download as', options: [['pdf', 'PDF'], ['png', 'PNG images (ZIP)']], value: 'pdf' }]), { onChange: () => preview() });
      const pv = h('canvas.hw-prev'); const pcount = h('span.muted.small');
      const preview = U.debounce(async () => { try { const r = await W.hw.renderPages(ta.value, fields.vals, { dpi: 60, maxPages: 1 }); const c = r.pages[0]; pv.width = c.width; pv.height = c.height; pv.getContext('2d').drawImage(c, 0, 0); const est = await W.hw.renderPages(ta.value, fields.vals, { dpi: 20, maxPages: 60 }); pcount.textContent = `${U.plural(est.pages.length, 'page')}${est.truncated ? '+' : ''}`; } catch (e) { console.warn(e); } }, 180);
      const go = h('button.btn.primary.lg', { html: ic('file-down', 18) + '<span>Create handwritten document</span>', onclick: async () => {
        if (!ta.value.trim()) { W.toast('Type some text first.', 'info'); return; } go.disabled = true; results.innerHTML = ''; prog.set(null, 'Writing…');
        try { const o = fields.vals; const dpi = 150; const r = await W.hw.renderPages(ta.value, o, { dpi }); let outs;
          if (o.fmt === 'png') { outs = []; for (let i = 0; i < r.pages.length; i++) outs.push(W.out(`handwriting-${i + 1}.png`, await U.canvasBlob(r.pages[i], 'image/png'))); }
          else outs = [P.outPdf(await W.hw.toPdf(o.sel ? r : Object.assign({}, r, { words: r.pages.map(() => []) }), { dpi }), 'handwriting.pdf')];
          prog.hide(); await W.showResults(results, outs, { tool: W.byId['text-to-handwriting'], note: `${U.plural(r.pages.length, 'page')}${r.truncated ? ' (limited to 40 pages)' : ''}` }); }
        catch (e) { prog.hide(); console.error(e); results.appendChild(h('div.errbox', h('b', 'Something went wrong'), h('p', W.friendlyError(e)))); } finally { go.disabled = false; } } });
      root.append(h('div.hw-grid', h('section.card.pad', h('h3.card-h', h('span.step', '1'), 'Your text'), ta), h('section.card.pad', h('h3.card-h', h('span.step', '2'), 'Style'), fields.el), h('section.card.pad.hw-pv', h('h3.card-h', 'Preview — page 1 ', pcount), h('div.hw-pvbox', pv), h('div.actions', { style: 'margin-top:12px' }, go), prog.el, results)));
      const carried = W.takeCarry('text-to-handwriting'); if (carried.length) { ta.value = await carried[0].text(); } preview();
    },
  });

  W.simpleTool({
    id: 'pdf-to-handwriting', cat: 'edit', name: 'PDF to handwriting', icon: 'pen-line', action: 'Make it handwritten', actionIcon: 'pen-tool',
    desc: 'Give document text a handwritten look.', keys: 'handwritten convert pdf text notes copy assignment font pen',
    files: Object.assign({ multi: false, title: 'Drop a PDF whose text should look handwritten' }, PDF_FILES),
    opts: [...W.hw.fields([{ id: 'sel', type: 'check', label: 'Keep the text selectable & searchable', value: true }]), P.pagesField()],
    async run(items, o, ctx) {
      const it = items[0]; const n = await P.pageCount(it); const sel = W.parseRanges(o.pages, n); const pages = await P.plainText(it, { pages: sel, onProgress: (f) => ctx.progress(f * 0.3, 'Reading text') }); let text = pages.join('\n\n');
      if (text.replace(/\s/g, '').length < 10) { const parts = []; for (const i of sel.slice(0, 10)) { const c = await P.renderPage(it, i, { scale: 2.2 }); parts.push((await W.ocr.recognize(c, {})).text); } text = parts.join('\n\n'); }
      if (!text.trim()) throw new Error('No text found in this PDF.'); text = text.replace(/\n(?!\n)/g, ' ').replace(/ {2,}/g, ' ');
      const dpi = 150; const r = await W.hw.renderPages(text, o, { dpi, onProgress: (f) => ctx.progress(0.3 + 0.5 * f, 'Writing') }); ctx.progress(0.85, 'Building PDF');
      return { outputs: [P.outPdf(await W.hw.toPdf(o.sel ? r : Object.assign({}, r, { words: r.pages.map(() => []) }), { dpi }), P.suffixName(it, '-handwritten'))], note: `${U.plural(r.pages.length, 'page')}${r.truncated ? ' (limited to 40 pages)' : ''}` };
    },
  });

  // ================= SCAN CLEAN-UP =================
  /** clean a photographed page: flatten uneven lighting, then boost contrast */
  W.cleanCanvas = function (src, mode = 'enhance', { maxSide = 2400 } = {}) {
    if (mode === 'original') return src;
    const sc = Math.min(1, maxSide / Math.max(src.width, src.height)); const w = Math.round(src.width * sc), h = Math.round(src.height * sc); const c = W.canvas(w, h); const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, w, h); const id = g.getImageData(0, 0, w, h); const d = id.data;
    const lum = new Float32Array(w * h); for (let i = 0; i < w * h; i++) lum[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
    const small = W.canvas(Math.max(8, w >> 3), Math.max(8, h >> 3)); small.getContext('2d').drawImage(c, 0, 0, small.width, small.height); const sg = small.getContext('2d').getImageData(0, 0, small.width, small.height).data; const sl = new Float32Array(small.width * small.height); for (let i = 0; i < sl.length; i++) sl[i] = sg[i * 4] * 0.3 + sg[i * 4 + 1] * 0.59 + sg[i * 4 + 2] * 0.11;
    // background estimate: morphological-ish "max" via blur of the bright pixels at low res
    let bgS = new Float32Array(sl); for (let pass = 0; pass < 2; pass++) { const bl = W.boxBlur(bgS, small.width, small.height, 4); for (let i = 0; i < bgS.length; i++) bgS[i] = Math.max(bl[i], pass ? bgS[i] * 0.97 : sl[i] * 0.0 + bl[i]); } bgS = W.boxBlur(bgS, small.width, small.height, 5);
    const bgC = W.canvas(small.width, small.height); const bgI = bgC.getContext('2d').createImageData(small.width, small.height); for (let i = 0; i < bgS.length; i++) { bgI.data[i * 4] = bgI.data[i * 4 + 1] = bgI.data[i * 4 + 2] = bgS[i]; bgI.data[i * 4 + 3] = 255; } bgC.getContext('2d').putImageData(bgI, 0, 0);
    const big = W.canvas(w, h); const bg2 = big.getContext('2d'); bg2.imageSmoothingQuality = 'high'; bg2.drawImage(bgC, 0, 0, w, h); const bd = bg2.getImageData(0, 0, w, h).data;
    for (let i = 0; i < w * h; i++) {
      const bgv = Math.max(60, bd[i * 4]); const k = 255 / bgv;
      if (mode === 'enhance') { for (let j = 0; j < 3; j++) { let v = d[i * 4 + j] * k; v = (v - 40) * 1.18 + 40; d[i * 4 + j] = v < 0 ? 0 : v > 255 ? 255 : v; } }
      else { let v = lum[i] * k; if (mode === 'bw') v = v < 168 ? 0 : 255; else { v = (v - 45) * 1.35; v = v < 0 ? 0 : v > 255 ? 255 : v; } d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; }
    }
    g.putImageData(id, 0, 0); return c;
  };
  const CLEAN_MODES = [['enhance', 'Clean colour'], ['gray', 'Clean grayscale'], ['bw', 'Black & white'], ['original', 'Original']];
  W.simpleTool({
    id: 'handwriting-to-pdf', cat: 'edit', name: 'Handwriting to PDF', icon: 'notebook-pen', action: 'Create PDF', actionIcon: 'notebook-pen',
    desc: 'Recognize handwriting or clean up scanned notes.', keys: 'notes photo scan whiteboard notebook ocr clean shadows handwritten convert jpg png',
    files: { multi: true, min: 1, accept: IMG_ACCEPT, kind: 'image', title: 'Drop photos of your notes', hint: 'Drag rows to set the page order', dzIcon: 'notebook-pen' },
    opts: [
      { id: 'mode', type: 'seg', label: 'Clean-up', options: CLEAN_MODES, value: 'enhance' },
      { id: 'size', type: 'select', label: 'Page size', options: [['fit', 'Same as the photo'], ...P.sizeOpts], value: 'A4' },
      { id: 'ocr', type: 'check', label: 'Recognise text so the PDF is searchable (best for printed or neat writing)', value: false },
      { id: 'lang', type: 'select', label: 'Language', options: W.OCR_LANGS, value: 'eng', show: (v) => v.ocr },
      { id: 'txt', type: 'check', label: 'Also save the recognised text', value: false, show: (v) => v.ocr },
    ],
    async run(items, o, ctx) {
      const doc = await P.create(); const font = await P.std(doc, 'Helvetica'); const texts = [];
      for (let i = 0; i < items.length; i++) {
        ctx.check(); const base = i / items.length, span = 1 / items.length; ctx.progress(base, `Cleaning ${items[i].name}`);
        const im = await U.fileImage(items[i].file); const c0 = W.canvas(im.naturalWidth, im.naturalHeight); c0.getContext('2d').drawImage(im, 0, 0); URL.revokeObjectURL(im._url); const c = W.cleanCanvas(c0, o.mode);
        const jb = await W.canvasBytes(c, o.mode === 'bw' ? 'image/png' : 'image/jpeg', 0.88); const emb = o.mode === 'bw' ? await doc.embedPng(jb) : await doc.embedJpg(jb);
        let pw, ph; if (o.size === 'fit') { pw = c.width * 0.5; ph = c.height * 0.5; } else { [pw, ph] = P.SIZES[o.size]; if (c.width > c.height && pw < ph) [pw, ph] = [ph, pw]; }
        const s = Math.min(pw / c.width, ph / c.height); const dw = c.width * s, dh = c.height * s; const page = doc.addPage([pw, ph]); page.drawImage(emb, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
        if (o.ocr) { const r = await W.ocr.recognize(c, { lang: o.lang, onProgress: (f, l) => ctx.progress(base + span * (0.4 + 0.6 * f), `Page ${i + 1}: ${l}`) }); texts.push(r.text.trim()); await P.invisibleText(doc, page, r.words.filter((w) => w.text.trim() && w.conf > 20).map((w) => ({ text: w.text, x: (pw - dw) / 2 + w.x0 * s, y: (ph - dh) / 2 + w.y0 * s, w: (w.x1 - w.x0) * s, h: (w.y1 - w.y0) * s })), font); }
        await U.tick();
      }
      const outs = [P.outPdf(await P.save(doc), items.length === 1 ? U.safeName(U.base(items[0].name)) + '-clean.pdf' : 'notes.pdf')]; if (o.ocr && o.txt) outs.push(W.out('notes.txt', new Blob([texts.join('\n\n')], { type: 'text/plain' })));
      return { outputs: outs, note: `${U.plural(items.length, 'page')} cleaned${o.ocr ? ' and recognised' : ''}` };
    },
  });

  // ================= SCANNER (camera + perspective crop) =================
  function homography(src, dst) { // returns H mapping dst->src (3x3 as 9-array) given 4 point pairs
    const A = [], b = []; for (let i = 0; i < 4; i++) { const [x, y] = dst[i], [u, v] = src[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
    const n = 8; for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]]; for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; } }
    const x = new Array(n); for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; } return [...x, 1];
  }
  W.warpQuad = function (src, quad, maxSide = 2200) { // quad: [tl,tr,br,bl] in src px
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]); let w = Math.max(d(quad[0], quad[1]), d(quad[3], quad[2])), hh = Math.max(d(quad[0], quad[3]), d(quad[1], quad[2])); const sc = Math.min(1, maxSide / Math.max(w, hh)); w = Math.max(20, Math.round(w * sc)); hh = Math.max(20, Math.round(hh * sc));
    const H = homography(quad, [[0, 0], [w, 0], [w, hh], [0, hh]]); const out = W.canvas(w, hh); const og = out.getContext('2d'); const od = og.createImageData(w, hh); const sg = src.getContext('2d', { willReadFrequently: true }); const sd = sg.getImageData(0, 0, src.width, src.height); const sw = src.width, sh = src.height;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const z = H[6] * x + H[7] * y + 1; const u = (H[0] * x + H[1] * y + H[2]) / z, v = (H[3] * x + H[4] * y + H[5]) / z; const o = (y * w + x) * 4; if (u < 0 || v < 0 || u >= sw - 1 || v >= sh - 1) { od.data[o] = od.data[o + 1] = od.data[o + 2] = 255; od.data[o + 3] = 255; continue; } const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0; const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4; for (let k = 0; k < 3; k++) od.data[o + k] = sd.data[i00 + k] * (1 - fx) * (1 - fy) + sd.data[i10 + k] * fx * (1 - fy) + sd.data[i01 + k] * (1 - fx) * fy + sd.data[i11 + k] * fx * fy; od.data[o + 3] = 255; }
    og.putImageData(od, 0, 0); return out;
  };
  W.detectQuad = function (src) {
    const sc = 360 / Math.max(src.width, src.height); const w = Math.max(8, Math.round(src.width * sc)), hh = Math.max(8, Math.round(src.height * sc)); const c = W.canvas(w, hh); const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, w, hh); const d = g.getImageData(0, 0, w, hh).data; const L = new Float32Array(w * hh); for (let i = 0; i < w * hh; i++) L[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
    const blurred = W.boxBlur(L, w, hh, 2); const hist = new Array(256).fill(0); blurred.forEach((v) => hist[Math.round(v)]++); let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i]; let sB = 0, wB = 0, best = 0, th = 128; for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = w * hh - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF; const v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = t; } }
    let mask = new Uint8Array(w * hh); let fg = 0; for (let i = 0; i < w * hh; i++) { mask[i] = blurred[i] > th ? 1 : 0; fg += mask[i]; } if (fg > w * hh * 0.7) { for (let i = 0; i < mask.length; i++) mask[i] ^= 1; fg = w * hh - fg; }
    // largest connected component
    const lab = new Int32Array(w * hh); let bestN = 0, bestId = 0, id = 0; const stack = new Int32Array(w * hh); for (let s = 0; s < w * hh; s++) { if (!mask[s] || lab[s]) continue; id++; let n = 0, sp = 0; stack[sp++] = s; lab[s] = id; while (sp) { const i = stack[--sp]; n++; const x = i % w, y = (i / w) | 0; if (x > 0 && mask[i - 1] && !lab[i - 1]) { lab[i - 1] = id; stack[sp++] = i - 1; } if (x < w - 1 && mask[i + 1] && !lab[i + 1]) { lab[i + 1] = id; stack[sp++] = i + 1; } if (y > 0 && mask[i - w] && !lab[i - w]) { lab[i - w] = id; stack[sp++] = i - w; } if (y < hh - 1 && mask[i + w] && !lab[i + w]) { lab[i + w] = id; stack[sp++] = i + w; } } if (n > bestN) { bestN = n; bestId = id; } }
    const inv = 1 / sc; const full = [[0.02 * src.width, 0.02 * src.height], [0.98 * src.width, 0.02 * src.height], [0.98 * src.width, 0.98 * src.height], [0.02 * src.width, 0.98 * src.height]];
    if (bestN < w * hh * 0.12) return full;
    let tl = null, tr = null, br = null, bl = null, a = 1e9, b = -1e9, c2 = -1e9, d2 = 1e9; for (let i = 0; i < w * hh; i++) if (lab[i] === bestId) { const x = i % w, y = (i / w) | 0; const s1 = x + y, s2 = x - y; if (s1 < a) { a = s1; tl = [x, y]; } if (s1 > b) { b = s1; br = [x, y]; } if (s2 > c2) { c2 = s2; tr = [x, y]; } if (s2 < d2) { d2 = s2; bl = [x, y]; } }
    return [tl, tr, br, bl].map(([x, y]) => [U.clamp(x * inv, 0, src.width - 1), U.clamp(y * inv, 0, src.height - 1)]);
  };

  W.tool({
    id: 'scan', cat: 'scan', name: 'Scan documents', icon: 'scan-line', desc: 'Turn your camera or photos into clean, searchable pages.',
    keys: 'camera scanner phone photo document receipt crop perspective deskew ocr capture mobile cam',
    async render(root) {
      root.classList.add('wide'); const pages = []; let stream = null; const results = h('div.results'); const prog = W.progress(); const opts = { mode: 'enhance', size: 'A4', ocr: true, lang: 'eng' };
      const strip = h('div.sc-strip'); const hint = h('p.muted.small', 'Add pages with the camera or by choosing photos. Corners are detected automatically — drag them to adjust.');
      const video = h('video.sc-video', { playsinline: true, muted: true, autoplay: true }); const camBox = h('div.sc-cam', { hidden: true }, video, h('div.sc-cam-bar', h('button.btn.primary', { html: ic('camera', 16) + '<span>Capture page</span>', onclick: capture }), h('button.btn', { onclick: stopCam }, 'Close camera')));
      const dz = W.dropzone({ accept: IMG_ACCEPT, multiple: true, compact: true, title: 'Add photos', hint: 'drop or click', icon: 'images', onFiles: addFiles });
      const fields = W.fields([{ id: 'mode', type: 'seg', label: 'Look', options: CLEAN_MODES, value: 'enhance' }, { id: 'size', type: 'select', label: 'Page size', options: [['fit', 'Same as the scan'], ...P.sizeOpts], value: 'A4' }, { id: 'ocr', type: 'check', label: 'Make the text searchable (OCR)', value: true }, { id: 'lang', type: 'select', label: 'Language', options: W.OCR_LANGS, value: 'eng', show: (v) => v.ocr }], { onChange: (v) => { Object.assign(opts, v); drawStrip(); } });
      const go = h('button.btn.primary.lg', { html: ic('file-down', 18) + '<span>Create PDF</span>', onclick: build });
      root.append(h('section.card.pad', h('h3.card-h', h('span.step', '1'), 'Capture'), h('div.row.gap.wrap', h('button.btn.primary', { html: ic('camera', 16) + '<span>Use camera</span>', onclick: startCam }), dz), camBox, hint),
        h('section.card.pad', { hidden: true, id: 'pagesCard' }, h('h3.card-h', h('span.step', '2'), 'Pages'), strip), h('section.card.pad', { hidden: true, id: 'optCard' }, h('h3.card-h', h('span.step', '3'), 'Output'), fields.el, h('div.actions', { style: 'margin-top:14px' }, go)), prog.el, results);
      const pc = $('#pagesCard', root), oc = $('#optCard', root);
      async function startCam() { try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false }); video.srcObject = stream; camBox.hidden = false; await video.play().catch(() => { }); } catch (e) { W.toast('Camera unavailable: ' + (e.name === 'NotAllowedError' ? 'permission was denied.' : e.message), 'err', 5000); } }
      function stopCam() { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; camBox.hidden = true; }
      function capture() { if (!video.videoWidth) { W.toast('The camera is still starting…', 'info'); return; } const c = W.canvas(video.videoWidth, video.videoHeight); c.getContext('2d').drawImage(video, 0, 0); addCanvas(c, 'Scan ' + (pages.length + 1)); }
      async function addFiles(fs) { for (const f of fs) { try { const im = await U.fileImage(f); const sc = Math.min(1, 3000 / Math.max(im.naturalWidth, im.naturalHeight)); const c = W.canvas(im.naturalWidth * sc, im.naturalHeight * sc); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(im._url); addCanvas(c, f.name); } catch { W.toast(`“${f.name}” isn’t an image this browser can read.`, 'err'); } } }
      function addCanvas(c, name) { const p = { id: U.uid(), src: c, name, quad: W.detectQuad(c), rot: 0 }; p.out = W.warpQuad(c, p.quad); pages.push(p); drawStrip(); }
      function rotated(c, deg) { if (!deg) return c; const r = W.canvas(deg % 180 ? c.height : c.width, deg % 180 ? c.width : c.height); const g = r.getContext('2d'); g.translate(r.width / 2, r.height / 2); g.rotate(deg * Math.PI / 180); g.drawImage(c, -c.width / 2, -c.height / 2); return r; }
      function drawStrip() {
        pc.hidden = oc.hidden = !pages.length; strip.innerHTML = '';
        pages.forEach((p, i) => { const view = W.cleanCanvas(rotated(p.out, p.rot), opts.mode, { maxSide: 520 }); view.className = 'sc-th-cv';
          const card = h('div.sc-card', { draggable: 'true', dataset: { id: p.id } }, h('div.sc-th', view), h('div.sc-bar', h('span.og-num', String(i + 1)), h('button.icon-btn', { title: 'Adjust corners', 'aria-label': 'Adjust corners of page ' + (i + 1), html: ic('crop', 15), onclick: () => cropper(p) }), h('button.icon-btn', { title: 'Rotate', 'aria-label': 'Rotate page ' + (i + 1), html: ic('rotate-cw', 15), onclick: () => { p.rot = (p.rot + 90) % 360; drawStrip(); } }), h('button.icon-btn', { title: 'Move left', 'aria-label': 'Move left', disabled: !i, html: ic('arrow-left', 15), onclick: () => { [pages[i - 1], pages[i]] = [pages[i], pages[i - 1]]; drawStrip(); } }), h('button.icon-btn', { title: 'Move right', 'aria-label': 'Move right', disabled: i === pages.length - 1, html: ic('arrow-right', 15), onclick: () => { [pages[i + 1], pages[i]] = [pages[i], pages[i + 1]]; drawStrip(); } }), h('button.icon-btn', { title: 'Delete', 'aria-label': 'Delete page ' + (i + 1), html: ic('trash-2', 15), onclick: () => { pages.splice(i, 1); drawStrip(); } }))); strip.appendChild(card); });
      }
      function cropper(p) {
        const maxW = Math.min(820, innerWidth - 80); const sc = Math.min(1, maxW / p.src.width, (innerHeight * 0.7) / p.src.height); const cw = Math.round(p.src.width * sc), ch = Math.round(p.src.height * sc); const cv = h('canvas', { width: cw, height: ch }); cv.getContext('2d').drawImage(p.src, 0, 0, cw, ch);
        const q = p.quad.map(([x, y]) => [x * sc, y * sc]); const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', cw); svg.setAttribute('height', ch); svg.style.cssText = 'position:absolute;left:0;top:0;touch-action:none';
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon'); poly.setAttribute('fill', 'rgba(232,71,43,.18)'); poly.setAttribute('stroke', '#E8472B'); poly.setAttribute('stroke-width', '2'); svg.appendChild(poly); const hs = q.map((pt, i) => { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('r', 11); c.setAttribute('fill', '#fff'); c.setAttribute('stroke', '#E8472B'); c.setAttribute('stroke-width', 3); c.style.cursor = 'grab'; svg.appendChild(c); c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); c._d = true; }); c.addEventListener('pointermove', (e) => { if (!c._d) return; const r = svg.getBoundingClientRect(); q[i] = [U.clamp(e.clientX - r.left, 0, cw), U.clamp(e.clientY - r.top, 0, ch)]; upd(); }); c.addEventListener('pointerup', () => (c._d = false)); return c; });
        const upd = () => { poly.setAttribute('points', q.map((x) => x.join(',')).join(' ')); hs.forEach((c, i) => { c.setAttribute('cx', q[i][0]); c.setAttribute('cy', q[i][1]); }); }; upd();
        const m = W.modal({ title: 'Adjust the page corners', wide: true, body: h('div', h('div', { style: `position:relative;width:${cw}px;max-width:100%;margin:0 auto;line-height:0` }, cv, svg), h('p.muted.small', { style: 'margin-top:8px' }, 'Drag the four dots onto the corners of the page.')), actions: [{ label: 'Auto-detect', keep: true, onclick: () => { const a = W.detectQuad(p.src); a.forEach((pt, i) => (q[i] = [pt[0] * sc, pt[1] * sc])); upd(); return false; } }, { label: 'Cancel' }, { label: 'Apply', primary: true, onclick: () => { p.quad = q.map(([x, y]) => [x / sc, y / sc]); p.out = W.warpQuad(p.src, p.quad); drawStrip(); } }] });
      }
      async function build() {
        if (!pages.length) return; go.disabled = true; results.innerHTML = ''; stopCam();
        try { const doc = await P.create(); const font = await P.std(doc, 'Helvetica'); const texts = [];
          for (let i = 0; i < pages.length; i++) { const p = pages[i]; const base = i / pages.length, span = 1 / pages.length; prog.set(base, `Processing page ${i + 1} of ${pages.length}`); await U.tick(); const c = W.cleanCanvas(rotated(p.out, p.rot), opts.mode); const jb = await W.canvasBytes(c, opts.mode === 'bw' ? 'image/png' : 'image/jpeg', 0.88); const emb = opts.mode === 'bw' ? await doc.embedPng(jb) : await doc.embedJpg(jb);
            let pw, ph; if (opts.size === 'fit') { pw = c.width * 0.45; ph = c.height * 0.45; } else { [pw, ph] = P.SIZES[opts.size]; if (c.width > c.height) [pw, ph] = [Math.max(pw, ph), Math.min(pw, ph)]; } const s = Math.min(pw / c.width, ph / c.height); const dw = c.width * s, dh = c.height * s; const page = doc.addPage([pw, ph]); page.drawImage(emb, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
            if (opts.ocr) { const r = await W.ocr.recognize(c, { lang: opts.lang, onProgress: (f, l) => prog.set(base + span * (0.3 + 0.7 * f), `Page ${i + 1}: ${l}`) }); await P.invisibleText(doc, page, r.words.filter((w) => w.text.trim() && w.conf > 20).map((w) => ({ text: w.text, x: (pw - dw) / 2 + w.x0 * s, y: (ph - dh) / 2 + w.y0 * s, w: (w.x1 - w.x0) * s, h: (w.y1 - w.y0) * s })), font); } }
          prog.hide(); await W.showResults(results, [P.outPdf(await P.save(doc), 'scan-' + U.stamp() + '.pdf')], { tool: W.byId.scan, note: `${U.plural(pages.length, 'page')}${opts.ocr ? ' · searchable' : ''}` }); }
        catch (e) { prog.hide(); console.error(e); results.appendChild(h('div.errbox', h('b', 'Something went wrong'), h('p', W.friendlyError(e)))); } finally { go.disabled = false; }
      }
      const carried = W.takeCarry('scan'); if (carried.length) await addFiles(carried);
      return () => stopCam();
    },
  });
}
