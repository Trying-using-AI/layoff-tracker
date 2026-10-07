// ===== Convert & extract: PDF → images / text / images / HTML / Word / Excel / PowerPoint / EPUB =====
{
  const esc = U.esc;
  const copyBtn = (getText) => h('button.btn.sm', { html: ic('copy', 14) + '<span>Copy</span>', onclick: async (e) => { const b = e.currentTarget; if (await U.copy(getText())) { b.querySelector('span').textContent = 'Copied'; setTimeout(() => (b.querySelector('span').textContent = 'Copy'), 1400); } } });

  // ================= PDF TO IMAGES =================
  W.simpleTool({
    id: 'pdf-to-images', cat: 'convert', name: 'PDF to images', icon: 'file-image', action: 'Convert to images', actionIcon: 'file-image',
    desc: 'Export selected PDF pages as sharp PNGs or smaller JPGs.', keys: 'jpg jpeg png webp pictures screenshot render pages export thumbnails',
    files: Object.assign({ multi: false, title: 'Drop a PDF to convert' }, PDF_FILES),
    opts: [
      { id: 'fmt', type: 'seg', label: 'Format', options: [['image/png', 'PNG (sharp)'], ['image/jpeg', 'JPG (smaller)'], ['image/webp', 'WebP']], value: 'image/png' },
      { id: 'dpi', type: 'select', label: 'Resolution', options: [[72, '72 dpi — screen'], [110, '110 dpi'], [150, '150 dpi — good'], [220, '220 dpi — sharp'], [300, '300 dpi — print'], [450, '450 dpi — very large']], value: 150 },
      { id: 'q', type: 'range', label: 'Quality', min: 50, max: 100, value: 90, unit: '%', show: (v) => v.fmt !== 'image/png' },
      P.pagesField(),
    ],
    async run(items, o, ctx) {
      const it = items[0]; const n = await P.pageCount(it); const sel = W.parseRanges(o.pages, n); const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[o.fmt]; const base = U.safeName(U.base(it.name)); const w = String(n).length; const outs = [];
      for (let k = 0; k < sel.length; k++) {
        ctx.check(); ctx.progress(k / sel.length, `Page ${sel[k] + 1}`);
        const b = await P.pageBlob(it, sel[k], { dpi: +o.dpi, type: o.fmt, q: o.q / 100 }); outs.push(Object.assign(W.out(`${base}-page-${String(sel[k] + 1).padStart(w, '0')}.${ext}`, b.blob), { meta: `${b.w}×${b.h}px` })); await U.tick();
      }
      return { outputs: outs, note: `${U.plural(outs.length, 'image')} at ${o.dpi} dpi` };
    },
  });

  // ================= EXTRACT TEXT =================
  W.simpleTool({
    id: 'extract-text', cat: 'convert', name: 'Extract text', icon: 'text', action: 'Extract text', actionIcon: 'text',
    desc: 'Get selectable text, with OCR for scanned pages.', keys: 'copy text txt plain ocr scan read content words',
    files: Object.assign({ multi: false, title: 'Drop a PDF' }, PDF_FILES),
    opts: [
      { id: 'layout', type: 'seg', label: 'Reading order', options: [['read', 'Natural reading order'], ['raw', 'Exactly as stored']], value: 'read' },
      { id: 'marks', type: 'check', label: 'Add “--- Page N ---” separators', value: true },
      { id: 'ocr', type: 'check', label: 'Run OCR on pages that have no text (scans)', value: true },
      P.pagesField(),
    ],
    async run(items, o, ctx) {
      const it = items[0]; const n = await P.pageCount(it); const sel = W.parseRanges(o.pages, n); const pgs = await P.text(it, { pages: sel }); const out = []; let ocrN = 0;
      for (let k = 0; k < pgs.length; k++) {
        ctx.check(); ctx.progress(k / pgs.length, `Page ${pgs[k].index + 1}`);
        let t = o.layout === 'raw' ? pgs[k].items.map((x) => x.str).join(' ') : P.lines(pgs[k]).map((l) => l.text.replace(/\s+$/, '')).join('\n');
        if (o.ocr && t.replace(/\s/g, '').length < 8) { const c = await P.renderPage(it, pgs[k].index, { scale: 2.2 }); const r = await W.ocr.recognize(c, { onProgress: (f, l) => ctx.progress((k + f) / pgs.length, `OCR page ${pgs[k].index + 1}: ${l}`) }); t = r.text.trim(); ocrN++; }
        out.push((o.marks ? `--- Page ${pgs[k].index + 1} ---\n` : '') + t);
      }
      const text = out.join('\n\n'); const words = (text.match(/\S+/g) || []).length;
      const ta = h('textarea.in.txt-out', { readonly: true, rows: 12, value: text });
      const o1 = W.out(U.safeName(U.base(it.name)) + '.txt', new Blob([text], { type: 'text/plain' })); o1.view = h('div.txt-view', ta, h('div.row.gap', copyBtn(() => text)));
      if (!words) throw new Error('No text found. This PDF may be a scan — enable OCR and try again.');
      return { outputs: [o1], note: `${words.toLocaleString()} words from ${U.plural(pgs.length, 'page')}${ocrN ? ` (${ocrN} via OCR)` : ''}` };
    },
  });

  // ================= EXTRACT IMAGES =================
  // decode raw PDF image stream (pdf-lib) into a canvas; returns null when unsupported
  async function inflateRaw(bytes) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()); }
  function a85d(src) { const out = []; let n = 0, acc = 0; for (let i = 0; i < src.length; i++) { const c = src[i]; if (c === 126) break; if (c <= 32) continue; if (c === 122 && n === 0) { out.push(0, 0, 0, 0); continue; } acc = acc * 85 + (c - 33); n++; if (n === 5) { out.push((acc >>> 24) & 255, (acc >>> 16) & 255, (acc >>> 8) & 255, acc & 255); acc = 0; n = 0; } } if (n > 1) { for (let i = n; i < 5; i++) acc = acc * 85 + 84; const b = [(acc >>> 24) & 255, (acc >>> 16) & 255, (acc >>> 8) & 255, acc & 255]; out.push(...b.slice(0, n - 1)); } return new Uint8Array(out); }
  W.pdf.rawImages = async function (item, onProgress) {
    const doc = await P.load(item); const { PDFName, PDFRawStream, PDFArray, decodePDFRawStream } = PDFLib; const ctx = doc.context; const out = []; let skipped = 0;
    const entries = ctx.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && String(o.dict.get(PDFName.of('Subtype'))) === '/Image');
    const nameOf = (v) => String((v && v.asString ? v.asString() : v) || '').replace(/^\//, '');
    const num = (d, k) => { const v = d.lookup(PDFName.of(k)); return v && v.asNumber ? v.asNumber() : undefined; };
    for (let ei = 0; ei < entries.length; ei++) {
      const [ref, st] = entries[ei]; onProgress && onProgress(ei / entries.length);
      try {
        const d = st.dict; if (String(d.get(PDFName.of('ImageMask'))) === 'true') { skipped++; continue; }
        const w = num(d, 'Width'), hgt = num(d, 'Height'); if (!w || !hgt) continue;
        let filters = d.lookup(PDFName.of('Filter')); filters = filters instanceof PDFArray ? filters.asArray().map(nameOf) : filters ? [nameOf(filters)] : [];
        let data = st.contents; let parms = d.lookup(PDFName.of('DecodeParms')); let pIdx = 0;
        while (filters.length > 1 && filters[0] === 'ASCII85Decode') { data = a85d(data); filters.shift(); pIdx++; }
        if (filters.length === 1 && filters[0] === 'DCTDecode') { out.push({ ref: ref.toString(), w, h: hgt, type: 'jpg', bytes: data }); continue; }
        if (filters.length > 1 || (filters[0] && filters[0] !== 'FlateDecode')) { skipped++; continue; }
        let raw = filters.length ? await inflateRaw(data) : data; const pd = parms instanceof PDFArray ? parms.lookup(pIdx) : parms; let pred = 1, cols = w;
        const bpc = num(d, 'BitsPerComponent') || 8; let cs = d.lookup(PDFName.of('ColorSpace')); let csn = cs instanceof PDFArray ? nameOf(cs.lookup(0)) : nameOf(cs); let comps = 3, palette = null;
        if (csn === 'Indexed') { const base = cs.lookup(1); const bn = base instanceof PDFArray ? nameOf(base.lookup(0)) : nameOf(base); let lut = cs.lookup(3); const lb = lut && lut.contents ? (lut instanceof PDFRawStream ? decodePDFRawStream(lut).decode() : lut.getContents()) : lut && lut.asBytes ? lut.asBytes() : null; if (!lb) { skipped++; continue; } palette = { lut: lb, n: bn === 'DeviceGray' || bn === 'CalGray' ? 1 : bn === 'DeviceCMYK' ? 4 : 3 }; comps = 1; }
        else if (csn === 'DeviceGray' || csn === 'CalGray') comps = 1; else if (csn === 'DeviceRGB' || csn === 'CalRGB') comps = 3; else if (csn === 'DeviceCMYK') comps = 4; else if (csn === 'ICCBased') { const pf = cs.lookup(1); comps = pf && pf.dict ? num(pf.dict, 'N') || 3 : 3; } else { skipped++; continue; }
        if (pd && pd.get) { pred = (pd.lookup(PDFName.of('Predictor')) || { asNumber: () => 1 }).asNumber(); const cc = pd.lookup(PDFName.of('Columns')); cols = cc && cc.asNumber ? cc.asNumber() : w; }
        if (pred >= 10) { const bpp = Math.max(1, (comps * bpc) >> 3), rl = (cols * comps * bpc + 7) >> 3, rows = Math.floor(raw.length / (rl + 1)); const o2 = new Uint8Array(rows * rl); for (let y = 0; y < rows; y++) { const ft = raw[y * (rl + 1)], s = y * (rl + 1) + 1, dd = y * rl, pv = dd - rl; for (let x = 0; x < rl; x++) { const rw = raw[s + x], a = x >= bpp ? o2[dd + x - bpp] : 0, b = y > 0 ? o2[pv + x] : 0, c = x >= bpp && y > 0 ? o2[pv + x - bpp] : 0; let v; switch (ft) { case 1: v = rw + a; break; case 2: v = rw + b; break; case 3: v = rw + ((a + b) >> 1); break; case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = rw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; } default: v = rw; } o2[dd + x] = v & 255; } } raw = o2; }
        const c = W.canvas(w, hgt); const g = c.getContext('2d'); const id = g.createImageData(w, hgt); const px = id.data; const rl = (w * comps * bpc + 7) >> 3;
        const sample = (y, i) => { if (bpc === 8) return raw[y * rl + i]; const bit = i * bpc; const byte = raw[y * rl + (bit >> 3)]; const sh = 8 - bpc - (bit & 7); return (byte >> sh) & ((1 << bpc) - 1); };
        const maxv = (1 << bpc) - 1;
        for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
          const o = (y * w + x) * 4; let r, gg, b;
          if (palette) { const idx = sample(y, x); const lut = palette.lut; if (palette.n === 1) r = gg = b = lut[idx]; else if (palette.n === 3) { r = lut[idx * 3]; gg = lut[idx * 3 + 1]; b = lut[idx * 3 + 2]; } else { const cc = lut[idx * 4], m = lut[idx * 4 + 1], yy = lut[idx * 4 + 2], k = lut[idx * 4 + 3]; r = 255 * (1 - cc / 255) * (1 - k / 255); gg = 255 * (1 - m / 255) * (1 - k / 255); b = 255 * (1 - yy / 255) * (1 - k / 255); } }
          else if (comps === 1) { r = gg = b = sample(y, x) * 255 / maxv; }
          else if (comps === 3) { r = sample(y, x * 3) * 255 / maxv; gg = sample(y, x * 3 + 1) * 255 / maxv; b = sample(y, x * 3 + 2) * 255 / maxv; }
          else { const cc = sample(y, x * 4), m = sample(y, x * 4 + 1), yy = sample(y, x * 4 + 2), k = sample(y, x * 4 + 3); r = 255 * (1 - cc / maxv) * (1 - k / maxv); gg = 255 * (1 - m / maxv) * (1 - k / maxv); b = 255 * (1 - yy / maxv) * (1 - k / maxv); }
          px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = 255;
        }
        // soft mask -> alpha
        const sm = d.lookup(PDFName.of('SMask'));
        if (sm && sm.dict) { try { const sw = num(sm.dict, 'Width'), sh2 = num(sm.dict, 'Height'); let sraw = await inflateRaw(sm.contents); const spd = sm.dict.lookup(PDFName.of('DecodeParms')); if (spd && spd.get && (spd.lookup(PDFName.of('Predictor')) || { asNumber: () => 1 }).asNumber() >= 10) { const rl2 = sw, rows = sh2; const o2 = new Uint8Array(rows * rl2); for (let y = 0; y < rows; y++) { const ft = sraw[y * (rl2 + 1)], s = y * (rl2 + 1) + 1, dd = y * rl2, pv = dd - rl2; for (let x = 0; x < rl2; x++) { const rw = sraw[s + x], a = x >= 1 ? o2[dd + x - 1] : 0, b = y > 0 ? o2[pv + x] : 0, c2 = x >= 1 && y > 0 ? o2[pv + x - 1] : 0; let v; switch (ft) { case 1: v = rw + a; break; case 2: v = rw + b; break; case 3: v = rw + ((a + b) >> 1); break; case 4: { const p = a + b - c2, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c2); v = rw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c2); break; } default: v = rw; } o2[dd + x] = v & 255; } } sraw = o2; } for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) px[(y * w + x) * 4 + 3] = sraw[Math.min(sh2 - 1, Math.floor(y * sh2 / hgt)) * sw + Math.min(sw - 1, Math.floor(x * sw / w))]; } catch { } }
        g.putImageData(id, 0, 0); out.push({ ref: ref.toString(), w, h: hgt, type: 'png', canvas: c });
      } catch (e) { console.warn('image failed', e); skipped++; }
    }
    return { images: out, skipped };
  };
  W.simpleTool({
    id: 'extract-images', cat: 'convert', name: 'Extract images', icon: 'image-down', action: 'Extract images', actionIcon: 'image-down',
    desc: 'Save the embedded images from your document.', keys: 'pictures photos graphics assets save pull out logo',
    files: Object.assign({ multi: false, title: 'Drop a PDF' }, PDF_FILES),
    opts: [
      { id: 'mode', type: 'seg', label: 'Method', options: [['orig', 'Original images (JPEGs kept as-is)'], ['page', 'Decoded from page (works for everything)']], value: 'orig' },
      { id: 'min', type: 'number', label: 'Ignore images smaller than', value: 40, min: 0, max: 600, unit: 'px', help: 'Skips tiny icons, bullets and line decorations.' },
    ],
    async run(items, o, ctx) {
      const it = items[0]; const base = U.safeName(U.base(it.name)); const outs = []; let skipped = 0;
      if (o.mode === 'orig') {
        const r = await W.pdf.rawImages(it, (f) => ctx.progress(f, 'Reading images')); skipped = r.skipped; let k = 0;
        for (const im of r.images) { if (im.w < o.min || im.h < o.min) continue; k++; const blob = im.bytes ? new Blob([im.bytes], { type: 'image/jpeg' }) : await U.canvasBlob(im.canvas, 'image/png'); outs.push(Object.assign(W.out(`${base}-image-${String(k).padStart(2, '0')}.${im.type}`, blob), { meta: `${im.w}×${im.h}px` })); }
      }
      if (o.mode === 'page' || (!outs.length && o.mode === 'orig' && skipped)) {
        const n = await P.pageCount(it); let k = 0; for (let i = 0; i < n; i++) { ctx.check(); ctx.progress(i / n, `Page ${i + 1}`); const ims = await W.pdf.pageImages(it, i, { minSize: 8 }); for (const im of ims) { if (im.canvas.width < o.min || im.canvas.height < o.min) continue; k++; outs.push(Object.assign(W.out(`${base}-p${i + 1}-image-${k}.png`, await U.canvasBlob(im.canvas, 'image/png')), { meta: `${im.canvas.width}×${im.canvas.height}px` })); } }
      }
      if (!outs.length) throw new Error('No embedded images were found' + (skipped ? ` (${skipped} unsupported ones were skipped — try the other method)` : '') + '. Vector graphics aren’t images; use “PDF to images” to export the pages.');
      return { outputs: outs, note: `${U.plural(outs.length, 'image')} extracted${skipped ? ` · ${skipped} unsupported skipped` : ''}` };
    },
  });

  // ================= PDF TO HTML =================
  W.simpleTool({
    id: 'pdf-to-html', cat: 'convert', name: 'PDF to HTML', icon: 'file-code', action: 'Convert to HTML', actionIcon: 'file-code',
    desc: 'Export positioned pages or readable, flowing HTML.', keys: 'web page website html5 convert text layout flowing responsive',
    files: Object.assign({ multi: false, title: 'Drop a PDF' }, PDF_FILES),
    opts: [
      { id: 'mode', type: 'seg', label: 'Output', options: [['flow', 'Readable, flowing text'], ['layout', 'Positioned text'], ['image', 'Page pictures + selectable text']], value: 'flow' },
      { id: 'images', type: 'check', label: 'Include embedded images', value: true, show: (v) => v.mode === 'flow' },
      { id: 'dpi', type: 'select', label: 'Page picture quality', options: [[96, '96 dpi (small)'], [144, '144 dpi'], [200, '200 dpi (sharp)']], value: 144, show: (v) => v.mode === 'image' },
    ],
    async run(items, o, ctx) {
      const it = items[0]; const base = U.safeName(U.base(it.name)); let body = '';
      if (o.mode === 'flow') {
        const st = await W.pdf.structure(it, { onProgress: (f) => ctx.progress(f * 0.7, 'Analysing') });
        for (let i = 0; i < st.pages.length; i++) {
          ctx.check(); const pg = st.pages[i]; const imgs = o.images ? await W.pdf.pageImages(it, pg.index) : []; const items2 = [...pg.blocks.map((b) => ({ y: b.y, b })), ...imgs.map((im) => ({ y: im.y + im.h, im }))].sort((a, b) => a.y - b.y); let list = null;
          for (const e of items2) {
            if (e.im) { body += `<p><img alt="" src="${e.im.canvas.toDataURL(e.im.w * e.im.h > 200000 ? 'image/jpeg' : 'image/png', 0.85)}"></p>\n`; continue; }
            const b = e.b; if (b.type === 'para' && b.list) { const tag = b.ordered ? 'ol' : 'ul'; if (!list || list !== tag) { if (list) body += `</${list}>`; body += `<${tag}>`; list = tag; } body += `<li>${esc(b.body)}</li>`; continue; } if (list) { body += `</${list}>`; list = null; }
            if (b.type === 'table') body += '<table>' + b.rows.map((r, k) => '<tr>' + r.map((c) => (k ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`)).join('') + '</tr>').join('') + '</table>\n';
            else if (b.heading) body += `<h${b.heading}>${esc(b.text)}</h${b.heading}>\n`; else if (b.mono) body += `<pre>${esc(b.text)}</pre>\n`; else body += `<p>${b.runs.map((r) => (r.bold && !b.bold ? `<b>${esc(r.text)}</b>` : r.italic && !b.italic ? `<i>${esc(r.text)}</i>` : esc(r.text))).join('')}</p>\n`;
          }
          if (list) { body += `</${list}>`; list = null; } if (i < st.pages.length - 1) body += '<hr>\n';
          ctx.progress(0.7 + 0.3 * (i + 1) / st.pages.length, `Page ${i + 1}`);
        }
        body = `<main>${body}</main>`;
      } else {
        const pgs = await P.text(it, { onProgress: (f) => ctx.progress(f * 0.4, 'Reading text') });
        for (let i = 0; i < pgs.length; i++) {
          ctx.check(); const pg = pgs[i]; let bg = ''; if (o.mode === 'image') { const c = await P.renderPage(it, pg.index, { scale: o.dpi / 72 }); bg = `<img class="bg" alt="" src="${c.toDataURL('image/jpeg', 0.82)}">`; }
          const spans = pg.items.filter((t) => t.str.trim()).map((t) => `<span style="left:${(t.x / pg.w * 100).toFixed(3)}%;top:${((t.y - t.size * 0.88) / pg.h * 100).toFixed(3)}%;font-size:${(t.size / pg.w * 100).toFixed(3)}cqw;${t.bold ? 'font-weight:700;' : ''}${t.italic ? 'font-style:italic;' : ''}${t.serif ? 'font-family:Georgia,serif;' : t.mono ? 'font-family:monospace;' : ''}">${esc(t.str)}</span>`).join('');
          body += `<section class="pg${o.mode === 'image' ? ' ov' : ''}" style="aspect-ratio:${pg.w}/${pg.h}">${bg}${spans}</section>\n`; ctx.progress(0.4 + 0.6 * (i + 1) / pgs.length, `Page ${i + 1}`);
        }
      }
      const css = o.mode === 'flow' ? 'body{font:16px/1.65 Georgia,serif;color:#1d1d1b;margin:0;background:#faf9f6}main{max-width:760px;margin:0 auto;padding:40px 22px}h1,h2,h3{font-family:Helvetica,Arial,sans-serif;line-height:1.25}table{border-collapse:collapse;margin:1em 0;width:100%}td,th{border:1px solid #bbb;padding:5px 9px;text-align:left}img{max-width:100%;height:auto}hr{border:0;border-top:1px dashed #ccc;margin:2em 0}pre{background:#f0efe9;padding:10px;overflow:auto}'
        : 'body{margin:0;background:#e9e7e1;padding:20px 0}.pg{position:relative;width:min(900px,96vw);margin:0 auto 20px;background:#fff;box-shadow:0 2px 12px #0003;overflow:hidden;container-type:inline-size}.pg span{position:absolute;white-space:pre;line-height:1.1;color:#000;font-family:Arial,Helvetica,sans-serif}.pg.ov span{color:transparent}.bg{position:absolute;inset:0;width:100%;height:100%}';
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(U.base(it.name))}</title><style>${css}</style></head><body>${body}</body></html>`;
      return [W.out(base + '.html', new Blob([html], { type: 'text/html' }))];
    },
  });

  // ================= PDF TO WORD =================
  W.simpleTool({
    id: 'pdf-to-word', cat: 'convert', name: 'PDF to Word', icon: 'file-type-2', action: 'Convert to Word', actionIcon: 'file-type-2',
    desc: 'Export editable text and layout into a Word document.', keys: 'docx doc editable microsoft office convert text',
    badges: ['.docx'],
    files: Object.assign({ multi: false, title: 'Drop a PDF' }, PDF_FILES),
    opts: [
      { id: 'images', type: 'check', label: 'Include images', value: true }, { id: 'tables', type: 'check', label: 'Detect tables', value: true },
      { id: 'breaks', type: 'check', label: 'Keep original page breaks', value: false }, { id: 'ocr', type: 'check', label: 'OCR scanned pages (no text layer)', value: true },
    ],
    async run(items, o, ctx) {
      const it = items[0]; const st = await W.pdf.structure(it, { onProgress: (f) => ctx.progress(f * 0.5, 'Reading text') }); const imgs = []; let body = ''; let mid = 1;
      const f0 = st.pages[0]; const PW = f0.w, PH = f0.h; const margin = Math.min(...st.pages.flatMap((p) => p.blocks.map((b) => b.x ?? 72)).filter((x) => x > 10), 72);
      for (let i = 0; i < st.pages.length; i++) {
        ctx.check(); const pg = st.pages[i]; ctx.progress(0.5 + 0.5 * i / st.pages.length, `Page ${i + 1}`);
        if (!pg.blocks.length) { const c = await P.renderPage(it, pg.index, { scale: 2.2 }); try { const r = await W.ocr.recognize(c, {}); r.text.split(/\n{2,}/).filter((t) => t.trim()).forEach((t) => (body += W.docx.para([{ text: t.replace(/\n/g, ' ') }], { pageBreakBefore: o.breaks && i > 0 }))); continue; } catch { } }
        const ims = o.images ? await W.pdf.pageImages(it, pg.index) : []; const seq = [...pg.blocks.map((b) => ({ y: b.y, b })), ...ims.map((im) => ({ y: im.y + im.h, im }))].sort((a, b) => a.y - b.y); let first = true;
        for (const e of seq) {
          const pb = o.breaks && i > 0 && first; first = false;
          if (e.im) { const c = e.im.canvas; const jpg = c.width * c.height > 250000; const bytes = await W.canvasBytes(c, jpg ? 'image/jpeg' : 'image/png', 0.85); const k = imgs.length + 1; imgs.push({ ext: jpg ? 'jpeg' : 'png', bytes }); const maxW = PW - 2 * margin; const s = Math.min(1, maxW / e.im.w); body += W.docx.image('rIdImg' + k, mid++, e.im.w * s, e.im.h * s); continue; }
          const b = e.b;
          if (b.type === 'table') { if (o.tables) body += W.docx.table(b.rows); else b.rows.forEach((r) => (body += W.docx.para([{ text: r.join('    ') }], { pageBreakBefore: pb }))); continue; }
          const runs = b.runs.map((r) => ({ text: r.text, bold: r.bold, italic: r.italic, size: b.heading ? undefined : Math.max(7, Math.min(20, Math.round(r.size * 2) / 2)), mono: b.mono }));
          if (b.heading) body += W.docx.para(b.runs.map((r) => ({ text: r.text })), { style: 'Heading' + b.heading, pageBreakBefore: pb });
          else if (b.list) body += W.docx.para([{ text: b.body }], { numId: b.ordered ? 2 : 1, after: 60, pageBreakBefore: pb, style: 'ListParagraph' });
          else body += W.docx.para(runs, { pageBreakBefore: pb, left: b.x > margin + 20 ? Math.round((b.x - margin) * 20) : 0 });
        }
      }
      const blob = await W.docx.build({ body, images: imgs, pageW: PW, pageH: PH, margin: Math.max(36, Math.min(100, margin)), title: U.base(it.name) });
      return [W.out(U.safeName(U.base(it.name)) + '.docx', blob)];
    },
  });

  // ================= PDF TO EXCEL =================
  W.simpleTool({
    id: 'pdf-to-excel', cat: 'convert', name: 'PDF to Excel', icon: 'sheet', action: 'Convert to Excel', actionIcon: 'sheet',
    desc: 'Extract document tables into editable spreadsheet cells.', keys: 'xlsx xls table data extract spreadsheet convert rows columns',
    badges: ['.xlsx'],
    files: Object.assign({ multi: false, title: 'Drop a PDF with tables' }, PDF_FILES),
    opts: [
      { id: 'layout', type: 'seg', label: 'Sheets', options: [['page', 'One sheet per page'], ['one', 'Everything on one sheet']], value: 'page' },
      { id: 'text', type: 'check', label: 'Also include text that isn’t in a table', value: false },
      { id: 'nums', type: 'check', label: 'Convert numbers (1,234.50 → 1234.5)', value: true },
    ],
    async run(items, o, ctx) {
      const XLSX = await W.lib('xlsx'); const it = items[0]; const st = await W.pdf.structure(it, { onProgress: (f) => ctx.progress(f * 0.8, 'Detecting tables') });
      const conv = (v) => { if (!o.nums) return v; const t = String(v).trim(); if (/^[-+(]?[$€£₹]?\s?\d{1,3}(,\d{3})*(\.\d+)?\)?%?$/.test(t) || /^[-+]?\d+(\.\d+)?$/.test(t)) { const neg = /^\(.*\)$/.test(t) || /^-/.test(t); const n = parseFloat(t.replace(/[^\d.]/g, '')); if (!isNaN(n)) return /%$/.test(t) ? (neg ? -n : n) / 100 : (neg ? -n : n); } return v; };
      const wb = XLSX.utils.book_new(); let all = []; let tables = 0;
      for (const pg of st.pages) {
        const rows = []; pg.blocks.forEach((b) => { if (b.type === 'table') { tables++; if (rows.length) rows.push([]); b.rows.forEach((r) => rows.push(r.map(conv))); } else if (o.text) rows.push([b.text]); });
        if (!rows.length) continue;
        if (o.layout === 'page') XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), `Page ${pg.index + 1}`); else { if (all.length) all.push([]); all = all.concat(rows); }
      }
      if (o.layout === 'one' && all.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(all), 'Tables');
      if (!wb.SheetNames.length) throw new Error('No tables were detected. Try enabling “include text”, or run OCR first if the PDF is a scan.');
      const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      return { outputs: [W.out(U.safeName(U.base(it.name)) + '.xlsx', new Blob([bytes], { type: W.mime('x.xlsx') }))], note: `${tables} table${tables === 1 ? '' : 's'} detected in ${U.plural(wb.SheetNames.length, 'sheet')}` };
    },
  });

  // ================= PDF TO POWERPOINT =================
  W.simpleTool({
    id: 'pdf-to-pptx', cat: 'convert', name: 'PDF to PowerPoint', icon: 'presentation', action: 'Convert to PowerPoint', actionIcon: 'presentation',
    desc: 'Make slides with editable text or a faithful visual layout.', keys: 'pptx ppt slides deck presentation convert powerpoint',
    badges: ['.pptx'],
    files: Object.assign({ multi: false, title: 'Drop a PDF' }, PDF_FILES),
    opts: [
      { id: 'mode', type: 'seg', label: 'Slides', options: [['image', 'Faithful (page pictures)'], ['text', 'Editable text boxes + images']], value: 'image' },
      { id: 'dpi', type: 'select', label: 'Picture quality', options: [[110, '110 dpi (small)'], [150, '150 dpi'], [220, '220 dpi (sharp)']], value: 150, show: (v) => v.mode === 'image' },
    ],
    async run(items, o, ctx) {
      const PptxGenJS = await W.lib('pptxgen'); const it = items[0]; const doc = await P.doc(it); const n = doc.numPages; const p1 = await doc.getPage(1); const vp = p1.getViewport({ scale: 1 });
      const pptx = new PptxGenJS(); pptx.defineLayout({ name: 'PDF', width: vp.width / 72, height: vp.height / 72 }); pptx.layout = 'PDF'; pptx.title = U.base(it.name);
      const texts = o.mode === 'text' ? await P.text(it, { onProgress: (f) => ctx.progress(f * 0.3, 'Reading text') }) : null;
      for (let i = 0; i < n; i++) {
        ctx.check(); ctx.progress(0.3 + 0.7 * i / n, `Slide ${i + 1} of ${n}`); const slide = pptx.addSlide();
        if (o.mode === 'image') { const c = await P.renderPage(it, i, { scale: o.dpi / 72 }); const pg = await doc.getPage(i + 1); const v = pg.getViewport({ scale: 1 }); slide.addImage({ data: c.toDataURL('image/jpeg', 0.88), x: 0, y: 0, w: v.width / 72, h: v.height / 72 }); }
        else {
          slide.background = { color: 'FFFFFF' }; const ims = await W.pdf.pageImages(it, i); ims.forEach((im) => slide.addImage({ data: im.canvas.toDataURL(im.canvas.width * im.canvas.height > 200000 ? 'image/jpeg' : 'image/png', 0.85), x: im.x / 72, y: im.y / 72, w: im.w / 72, h: im.h / 72 }));
          const lines = P.lines(texts[i]);
          for (const l of lines) { const segs = l.items; const x0 = l.x, x1 = l.x2; slide.addText(l.text, { x: x0 / 72, y: (l.y - l.size * 0.95) / 72, w: Math.max(0.3, (x1 - x0) / 72 + 0.25), h: l.size * 1.3 / 72, fontSize: Math.max(5, Math.round(l.size * 10) / 10), bold: l.bold, italic: l.italic, fontFace: segs[0].mono ? 'Courier New' : segs[0].serif ? 'Times New Roman' : 'Arial', color: '111111', margin: 0, valign: 'top', wrap: false, fit: 'none' }); }
        }
        await U.tick();
      }
      const blob = await pptx.write({ outputType: 'blob' });
      return [W.out(U.safeName(U.base(it.name)) + '.pptx', blob)];
    },
  });

  // ================= PDF TO EPUB / MARKDOWN / HTML / STUDY GUIDE =================
  const mdOf = (st) => st.pages.map((pg) => pg.blocks.map((b) => { if (b.type === 'table') { const w = Math.max(...b.rows.map((r) => r.length)); const row = (r) => '| ' + Array.from({ length: w }, (_, i) => (r[i] || '').replace(/\|/g, '\\|')).join(' | ') + ' |'; return [row(b.rows[0]), '|' + ' --- |'.repeat(w), ...b.rows.slice(1).map(row)].join('\n'); } if (b.heading) return '#'.repeat(b.heading) + ' ' + b.text; if (b.list) return (b.ordered ? '1. ' : '- ') + b.body; if (b.mono) return '```\n' + b.text + '\n```'; return b.text; }).join('\n\n')).join('\n\n');
  W.simpleTool({
    id: 'pdf-to-ebook', cat: 'convert', name: 'PDF to ebook', icon: 'book-marked', action: 'Convert', actionIcon: 'book-marked',
    desc: 'Create an EPUB, Markdown, HTML, or study guide.', keys: 'epub kindle reader markdown md study notes convert book',
    files: Object.assign({ multi: false, title: 'Drop a PDF' }, PDF_FILES),
    opts: [
      { id: 'fmt', type: 'seg', label: 'Create', options: [['epub', 'EPUB ebook'], ['md', 'Markdown'], ['guide', 'Study guide']], value: 'epub' },
      { id: 'title', type: 'text', label: 'Title (optional)' }, { id: 'author', type: 'text', label: 'Author (optional)', show: (v) => v.fmt === 'epub' },
      { id: 'split', type: 'select', label: 'Chapters', options: [['h', 'Split at headings'], ['p10', 'Every 10 pages'], ['one', 'One chapter']], value: 'h', show: (v) => v.fmt === 'epub' },
    ],
    async run(items, o, ctx) {
      const it = items[0]; const base = U.safeName(U.base(it.name)); const st = await W.pdf.structure(it, { onProgress: (f) => ctx.progress(f * 0.6, 'Reading text') }); const title = o.title || (await P.load(it).then((d) => d.getTitle()).catch(() => '')) || U.base(it.name);
      if (o.fmt === 'md') return [W.out(base + '.md', new Blob([`# ${title}\n\n` + mdOf(st)], { type: 'text/markdown' }))];
      if (o.fmt === 'guide') {
        const full = st.pages.map((p) => p.blocks.filter((b) => b.type === 'para').map((b) => b.text).join(' ')).join('\n\n'); const sm = W.summarize(full, { sentences: 8 }); const kw = W.keywords(full, 18);
        const heads = st.pages.flatMap((p) => p.blocks.filter((b) => b.heading)).map((b) => `${'  '.repeat(b.heading - 1)}- ${b.text}`);
        const md = `# Study guide: ${title}\n\n## Key points\n\n${sm.map((s) => '- ' + s).join('\n')}\n\n## Key terms\n\n${kw.map((k) => `- **${k.word}** — appears ${k.count}×`).join('\n')}\n\n${heads.length ? '## Outline\n\n' + heads.join('\n') + '\n\n' : ''}## Review questions\n\n${sm.slice(0, 5).map((s, i) => `${i + 1}. Explain in your own words: “${s.length > 110 ? s.slice(0, 107) + '…' : s}”`).join('\n')}\n`;
        return [W.out(base + '-study-guide.md', new Blob([md], { type: 'text/markdown' }))];
      }
      const chapters = []; let cur = { title: 'Start', html: '' }; let pageCount = 0; const imgs = [];
      for (const pg of st.pages) {
        if (o.split === 'p10' && pageCount && pageCount % 10 === 0) { chapters.push(cur); cur = { title: `Pages ${pageCount + 1}–`, html: '' }; } pageCount++;
        for (const b of pg.blocks) {
          if (o.split === 'h' && b.heading === 1 && cur.html) { chapters.push(cur); cur = { title: '', html: '' }; }
          if (b.heading && (!cur.title || cur.title === 'Start')) cur.title = b.text;
          if (b.type === 'table') cur.html += '<table>' + b.rows.map((r, k) => '<tr>' + r.map((c) => `<${k ? 'td' : 'th'}>${esc(c)}</${k ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>';
          else if (b.heading) cur.html += `<h${Math.min(3, b.heading)}>${esc(b.text)}</h${Math.min(3, b.heading)}>`; else if (b.list) cur.html += `<p>${esc(b.marker + ' ' + b.body)}</p>`; else if (b.mono) cur.html += `<pre>${esc(b.text)}</pre>`; else cur.html += `<p>${esc(b.text)}</p>`;
        }
        ctx.progress(0.6 + 0.35 * pageCount / st.pages.length, `Page ${pageCount}`);
      }
      chapters.push(cur); const real = chapters.filter((c) => c.html); real.forEach((c, i) => { if (!c.title || c.title === 'Start') c.title = i === 0 ? title : `Part ${i + 1}`; c.title = c.title.slice(0, 80); });
      if (o.split === 'one') { const all = real.map((c) => c.html).join(''); real.length = 0; real.push({ title, html: all }); }
      const blob = await W.epub.build({ title, author: o.author, chapters: real.length ? real : [{ title, html: '<p></p>' }], images: imgs });
      return { outputs: [W.out(base + '.epub', blob)], note: `${U.plural(real.length, 'chapter')}` };
    },
  });
}
