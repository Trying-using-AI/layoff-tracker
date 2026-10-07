// ===== Edit & annotate: watermark, numbering, headers/footers, flatten, colours, metadata, remove watermark =====
{
  const PDF_FILES = { accept: '.pdf,application/pdf', kind: 'pdf' };
  const ESC = (s) => s.replace(/[\\()]/g, '\\$&');

  /** Add raw content-stream text to a page, before (under) or after (over) the existing content. */
  P.addContent = function (doc, page, text, under = false) {
    const { PDFName, PDFArray } = PDFLib; const ctx = doc.context;
    const ref = ctx.register(ctx.stream(text));
    const cur = page.node.get(PDFName.of('Contents'));
    let arr;
    if (cur instanceof PDFArray) arr = cur; else { arr = ctx.obj(cur ? [cur] : []); page.node.set(PDFName.of('Contents'), arr); }
    if (under) arr.insert(0, ref); else arr.push(ref);
    // make the original content independent of whatever we draw (balanced q/Q around it is not needed for appended streams)
  };
  const num = (n) => (Math.round(n * 1000) / 1000).toString();

  // ================= WATERMARK =================
  W.simpleTool({
    id: 'watermark', cat: 'edit', name: 'Add a watermark', icon: 'stamp', action: 'Add watermark', actionIcon: 'stamp',
    desc: 'Add your own text or image mark to selected pages.', keys: 'stamp confidential draft logo overlay text image copy',
    files: Object.assign({ multi: true, title: 'Drop PDFs to watermark' }, PDF_FILES),
    opts: [
      { id: 'kind', type: 'seg', label: 'Watermark type', options: [['text', 'Text'], ['image', 'Image / logo']], value: 'text' },
      { id: 'text', type: 'text', label: 'Text', value: 'CONFIDENTIAL', show: (v) => v.kind === 'text' },
      { type: 'row', show: (v) => v.kind === 'text', children: [
        { id: 'family', type: 'select', label: 'Font', options: P.FAMILIES, value: 'Helvetica' },
        { id: 'size', type: 'number', label: 'Size', value: 72, min: 6, max: 400, unit: 'pt' },
        { id: 'color', type: 'color', label: 'Colour', value: '#8a8a8a' },
      ] },
      { id: 'bold', type: 'check', label: 'Bold', value: true, show: (v) => v.kind === 'text' },
      { id: 'img', type: 'file', label: 'Image', accept: 'image/png,image/jpeg,image/webp', button: 'Choose image…', show: (v) => v.kind === 'image' },
      { id: 'scale', type: 'range', label: 'Image width (% of page width)', min: 5, max: 100, value: 40, unit: '%', show: (v) => v.kind === 'image' },
      { id: 'opacity', type: 'range', label: 'Opacity', min: 5, max: 100, value: 30, unit: '%' },
      { id: 'rotate', type: 'range', label: 'Rotation', min: -90, max: 90, value: 45, unit: '°' },
      { id: 'layout', type: 'seg', label: 'Placement', options: [['center', 'Centre'], ['tile', 'Tiled'], ['top', 'Top'], ['bottom', 'Bottom']], value: 'center' },
      { id: 'layer', type: 'seg', label: 'Layer', options: [['over', 'On top of the content'], ['under', 'Behind the content']], value: 'over' },
      P.pagesField(),
    ],
    validate: (it, v) => (v.kind === 'image' && !v.img ? 'Choose an image for the watermark.' : v.kind === 'text' && !v.text.trim() ? 'Enter the watermark text.' : null),
    async run(items, o, ctx) {
      const outs = [];
      for (let f = 0; f < items.length; f++) {
        const it = items[f]; const doc = await P.load(it); const n = doc.getPageCount(); const sel = W.parseRanges(o.pages, n);
        let font, imgEmb, imgW, imgH;
        const col = P.hexToRgb01(o.color || '#888888'); const gs = doc.context.obj({ Type: 'ExtGState', ca: o.opacity / 100, CA: o.opacity / 100 });
        const textAsImage = o.kind === 'text' && !P.canEncode(await P.std(doc, o.family, o.bold), o.text);
        if (o.kind === 'image') { const bytes = new Uint8Array(await o.img.arrayBuffer()); let b = bytes; if (!/png|jpe?g/i.test(o.img.type)) { const im = await U.fileImage(o.img); const c = W.canvas(im.naturalWidth, im.naturalHeight); c.getContext('2d').drawImage(im, 0, 0); b = new Uint8Array(await (await U.canvasBlob(c)).arrayBuffer()); imgEmb = await doc.embedPng(b); } else imgEmb = /png/i.test(o.img.type) ? await doc.embedPng(b) : await doc.embedJpg(b); imgW = imgEmb.width; imgH = imgEmb.height; }
        else if (textAsImage) { const im = await P.textImage(o.text, { size: o.size, bold: o.bold, color: o.color, family: o.family === 'Times' ? 'serif' : o.family === 'Courier' ? 'monospace' : 'sans-serif' }); imgEmb = await doc.embedPng(im.bytes); imgW = im.w; imgH = im.h; }
        else font = await P.std(doc, o.family, o.bold);
        for (let k = 0; k < sel.length; k++) {
          const page = doc.getPage(sel[k]); const { width: pw, height: ph } = page.getSize();
          const gsKey = page.node.newExtGState('WmGS', gs);
          let w, hh, fontKey, imgKey;
          if (font) { w = font.widthOfTextAtSize(o.text, o.size); hh = o.size * 0.72; fontKey = page.node.newFontDictionary(font.name, font.ref); }
          else { const wantW = o.kind === 'image' ? pw * o.scale / 100 : imgW; const s = wantW / imgW; w = imgW * s; hh = imgH * s; imgKey = page.node.newXObject('WmImg', imgEmb.ref); }
          const th = o.rotate * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
          const spots = [];
          if (o.layout === 'tile') { const gx = w * 1.5 + 30, gy = Math.max(hh * 3, 110); for (let y = -ph; y < ph * 2; y += gy) for (let x = -pw; x < pw * 2; x += gx) { const cx = x + ((Math.round(y / gy) % 2) ? gx / 2 : 0), cy = y; if (cx > -w && cx < pw + w && cy > -w && cy < ph + w) spots.push([cx, cy]); } }
          else spots.push([pw / 2, o.layout === 'top' ? ph - hh - 40 : o.layout === 'bottom' ? hh + 40 : ph / 2]);
          let s = `/Artifact <</Type /Pagination /Subtype /Watermark>> BDC q /${gsKey.asString().replace(/^\//, '')} gs\n`;
          for (const [cx, cy] of spots) {
            const x = cx - (w / 2) * cs + (hh / 2) * sn, y = cy - (w / 2) * sn - (hh / 2) * cs;
            if (font) s += `BT ${num(col[0])} ${num(col[1])} ${num(col[2])} rg /${fontKey.asString().replace(/^\//, '')} ${num(o.size)} Tf ${num(cs)} ${num(sn)} ${num(-sn)} ${num(cs)} ${num(x)} ${num(y)} Tm ${font.encodeText(o.text).toString()} Tj ET\n`;
            else s += `q ${num(w * cs)} ${num(w * sn)} ${num(-hh * sn)} ${num(hh * cs)} ${num(x)} ${num(y)} cm /${imgKey.asString().replace(/^\//, '')} Do Q\n`;
          }
          s += 'Q EMC';
          P.addContent(doc, page, s, o.layer === 'under');
          if (k % 10 === 9) { ctx.progress((f + k / sel.length) / items.length, `${it.name}: page ${k + 1}/${sel.length}`); await U.tick(); }
        }
        outs.push(P.outPdf(await P.save(doc), P.suffixName(it, '-watermarked')));
      }
      return outs;
    },
  });

  // ================= PAGE NUMBERS =================
  const FORMATS = [['{n}', '1, 2, 3'], ['Page {n}', 'Page 1'], ['Page {n} of {N}', 'Page 1 of 10'], ['{n} / {N}', '1 / 10'], ['- {n} -', '- 1 -'], ['custom', 'Custom…']];
  W.simpleTool({
    id: 'page-numbers', cat: 'edit', name: 'Page numbers', icon: 'list-ordered', action: 'Add page numbers', actionIcon: 'list-ordered',
    desc: 'Number pages with your preferred position and start.', keys: 'pagination footer header numbering roman folio',
    files: Object.assign({ multi: true, title: 'Drop PDFs to number' }, PDF_FILES),
    opts: [
      { id: 'fmt', type: 'select', label: 'Format', options: FORMATS, value: 'Page {n} of {N}' },
      { id: 'custom', type: 'text', label: 'Custom text', value: 'Page {n}', help: 'Use {n} for the page number and {N} for the last number.', show: (v) => v.fmt === 'custom' },
      { type: 'row', children: [
        { id: 'style', type: 'select', label: 'Numerals', options: [['arabic', '1, 2, 3'], ['roman', 'i, ii, iii'], ['ROMAN', 'I, II, III'], ['alpha', 'a, b, c']], value: 'arabic' },
        { id: 'start', type: 'number', label: 'Start at', value: 1, min: 0 },
        { id: 'skip', type: 'number', label: 'Skip first … pages', value: 0, min: 0 },
      ] },
      { type: 'row', children: [
        { id: 'pos', type: 'select', label: 'Position', options: P.POS, value: 'bc' },
        { id: 'margin', type: 'number', label: 'Margin', value: 12, min: 2, unit: 'mm' },
      ] },
      { type: 'row', children: [
        { id: 'family', type: 'select', label: 'Font', options: P.FAMILIES, value: 'Helvetica' },
        { id: 'size', type: 'number', label: 'Size', value: 11, min: 5, max: 60, unit: 'pt' },
        { id: 'color', type: 'color', label: 'Colour', value: '#333333' },
      ] },
      P.pagesField({ label: 'Only these pages (optional)' }),
    ],
    async run(items, o, ctx) {
      const outs = [];
      for (let f = 0; f < items.length; f++) {
        const it = items[f]; const doc = await P.load(it); const n = doc.getPageCount();
        let sel = W.parseRanges(o.pages, n).filter((i) => i >= o.skip);
        const last = o.start + sel.length - 1; const tpl = o.fmt === 'custom' ? o.custom : o.fmt;
        const conv = (x) => o.style === 'roman' ? P.roman(x).toLowerCase() : o.style === 'ROMAN' ? P.roman(x) : o.style === 'alpha' ? P.alpha(x) : String(x);
        for (let k = 0; k < sel.length; k++) {
          const page = doc.getPage(sel[k]); const { width, height } = page.getSize();
          const text = tpl.replace(/\{n\}/g, conv(o.start + k)).replace(/\{N\}/g, conv(last));
          const tw = await P.measure(doc, text, { size: o.size, family: o.family }); const [x, y] = P.anchor(o.pos, width, height, tw, o.size, U.mmToPt(o.margin));
          await P.drawText(doc, page, text, { x, y, size: o.size, family: o.family, color: o.color });
          if (k % 15 === 14) { ctx.progress((f + k / sel.length) / items.length, `${it.name}: ${k + 1}/${sel.length}`); await U.tick(); }
        }
        outs.push(P.outPdf(await P.save(doc), P.suffixName(it, '-numbered')));
      }
      return outs;
    },
  });

  // ================= BATES =================
  W.simpleTool({
    id: 'bates', cat: 'edit', name: 'Bates numbering', icon: 'binary', action: 'Apply Bates numbers', actionIcon: 'binary',
    desc: 'Apply continuous identifiers across a document batch.', keys: 'legal discovery litigation identifier prefix sequential stamp',
    files: Object.assign({ multi: true, title: 'Drop all the PDFs in the batch', hint: 'Numbers continue across files in the order shown' }, PDF_FILES),
    opts: [
      { type: 'row', children: [
        { id: 'prefix', type: 'text', label: 'Prefix', value: 'ACME-', placeholder: 'e.g. CASE123-' },
        { id: 'suffix', type: 'text', label: 'Suffix', value: '', placeholder: 'optional' },
      ] },
      { type: 'row', children: [
        { id: 'start', type: 'number', label: 'First number', value: 1, min: 0 },
        { id: 'digits', type: 'number', label: 'Digits', value: 6, min: 1, max: 12 },
        { id: 'step', type: 'number', label: 'Increment', value: 1, min: 1 },
      ] },
      { type: 'row', children: [
        { id: 'pos', type: 'select', label: 'Position', options: P.POS, value: 'br' },
        { id: 'size', type: 'number', label: 'Size', value: 10, min: 5, max: 40, unit: 'pt' },
        { id: 'color', type: 'color', label: 'Colour', value: '#000000' },
      ] },
      { id: 'box', type: 'check', label: 'White background behind the number (keeps it legible)', value: true },
      { id: 'restart', type: 'check', label: 'Restart numbering for every file', value: false },
    ],
    async run(items, o, ctx) {
      const outs = []; let cur = o.start; const margin = U.mmToPt(10); const { rgb } = PDFLib; let first = null, lastNo = null;
      for (let f = 0; f < items.length; f++) {
        const it = items[f]; const doc = await P.load(it); if (o.restart) cur = o.start;
        for (let i = 0; i < doc.getPageCount(); i++) {
          const page = doc.getPage(i); const { width, height } = page.getSize();
          const text = `${o.prefix}${String(cur).padStart(o.digits, '0')}${o.suffix}`; if (first == null) first = text; lastNo = text;
          const tw = await P.measure(doc, text, { size: o.size, family: 'Courier', bold: true }); const [x, y] = P.anchor(o.pos, width, height, tw, o.size, margin);
          if (o.box) page.drawRectangle({ x: x - 3, y: y - 2.5, width: tw + 6, height: o.size + 4, color: rgb(1, 1, 1), opacity: 0.9 });
          await P.drawText(doc, page, text, { x, y, size: o.size, family: 'Courier', bold: true, color: o.color });
          cur += o.step;
        }
        ctx.progress((f + 1) / items.length, it.name);
        outs.push(P.outPdf(await P.save(doc), P.suffixName(it, '-bates')));
        await U.tick();
      }
      return { outputs: outs, note: `Numbered <b>${first}</b> → <b>${lastNo}</b>` };
    },
  });

  // ================= HEADERS & FOOTERS =================
  W.simpleTool({
    id: 'headers-footers', cat: 'edit', name: 'Headers & footers', icon: 'panel-top', action: 'Add headers & footers', actionIcon: 'panel-top',
    desc: 'Add text, dates, filenames, or page counters.', keys: 'running header footer date title filename counter confidential',
    files: Object.assign({ multi: true, title: 'Drop PDFs' }, PDF_FILES),
    opts: [
      { id: 'tokens', type: 'info', html: 'Tokens you can use: <code>{page}</code> <code>{pages}</code> <code>{date}</code> <code>{time}</code> <code>{filename}</code> <code>{title}</code>' },
      { type: 'row', children: [{ id: 'hl', type: 'text', label: 'Header — left', placeholder: '{filename}' }, { id: 'hc', type: 'text', label: 'Header — centre' }, { id: 'hr', type: 'text', label: 'Header — right', placeholder: '{date}' }] },
      { type: 'row', children: [{ id: 'fl', type: 'text', label: 'Footer — left' }, { id: 'fc', type: 'text', label: 'Footer — centre', value: 'Page {page} of {pages}' }, { id: 'fr', type: 'text', label: 'Footer — right' }] },
      { type: 'row', children: [
        { id: 'family', type: 'select', label: 'Font', options: P.FAMILIES, value: 'Helvetica' },
        { id: 'size', type: 'number', label: 'Size', value: 10, min: 5, max: 40, unit: 'pt' },
        { id: 'color', type: 'color', label: 'Colour', value: '#444444' },
        { id: 'margin', type: 'number', label: 'Margin', value: 12, min: 3, unit: 'mm' },
      ] },
      { id: 'line', type: 'check', label: 'Draw a thin line between the header/footer and the page', value: false },
      { id: 'skipFirst', type: 'check', label: 'Skip the first page', value: false },
      P.pagesField({ label: 'Only these pages (optional)' }),
    ],
    async run(items, o, ctx) {
      const outs = []; const { rgb } = PDFLib; const d = new Date();
      for (let f = 0; f < items.length; f++) {
        const it = items[f]; const doc = await P.load(it); const n = doc.getPageCount();
        const sel = W.parseRanges(o.pages, n).filter((i) => !(o.skipFirst && i === 0));
        const title = doc.getTitle() || U.base(it.name); const mar = U.mmToPt(o.margin);
        const fill = (t, i) => t.replace(/\{page\}/g, i + 1).replace(/\{pages\}/g, n).replace(/\{date\}/g, d.toLocaleDateString()).replace(/\{time\}/g, d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })).replace(/\{filename\}/g, U.base(it.name)).replace(/\{title\}/g, title);
        for (const i of sel) {
          const page = doc.getPage(i); const { width, height } = page.getSize();
          for (const [key, pos] of [['hl', 'tl'], ['hc', 'tc'], ['hr', 'tr'], ['fl', 'bl'], ['fc', 'bc'], ['fr', 'br']]) {
            if (!o[key]) continue; const text = fill(o[key], i); const tw = await P.measure(doc, text, { size: o.size, family: o.family }); const [x, y] = P.anchor(pos, width, height, tw, o.size, mar);
            await P.drawText(doc, page, text, { x, y, size: o.size, family: o.family, color: o.color });
          }
          if (o.line) { const c = rgb(0.7, 0.7, 0.7); if (o.hl || o.hc || o.hr) page.drawLine({ start: { x: mar, y: height - mar - o.size * 1.2 }, end: { x: width - mar, y: height - mar - o.size * 1.2 }, thickness: 0.5, color: c }); if (o.fl || o.fc || o.fr) page.drawLine({ start: { x: mar, y: mar + o.size * 1.3 }, end: { x: width - mar, y: mar + o.size * 1.3 }, thickness: 0.5, color: c }); }
        }
        ctx.progress((f + 1) / items.length, it.name);
        outs.push(P.outPdf(await P.save(doc), P.suffixName(it, '-hf')));
      }
      return outs;
    },
  });

  // ================= FLATTEN =================
  W.simpleTool({
    id: 'flatten', cat: 'edit', name: 'Flatten PDF', icon: 'layers', action: 'Flatten', actionIcon: 'layers',
    desc: 'Bake forms and annotations into page content.', keys: 'lock form fields annotations comments merge layers print',
    files: Object.assign({ multi: true, title: 'Drop PDFs to flatten' }, PDF_FILES),
    opts: [
      { id: 'mode', type: 'seg', label: 'Flatten', options: [['forms', 'Form fields (text stays selectable)'], ['annots', 'Remove annotations'], ['all', 'Everything → page pictures']], value: 'forms' },
      { id: 'dpi', type: 'select', label: 'Picture resolution', options: [[120, '120 dpi (small)'], [150, '150 dpi'], [200, '200 dpi'], [300, '300 dpi (print)']], value: 200, show: (v) => v.mode === 'all' },
      { id: 'text', type: 'check', label: 'Keep text searchable (invisible text layer)', value: true, show: (v) => v.mode === 'all' },
      { id: 'links', type: 'check', label: 'Keep links when removing annotations', value: true, show: (v) => v.mode === 'annots' },
    ],
    async run(items, o, ctx) {
      const outs = [];
      for (let f = 0; f < items.length; f++) {
        const it = items[f]; let doc;
        if (o.mode === 'forms') {
          doc = await P.load(it); const form = doc.getForm(); const fields = form.getFields().length;
          if (!fields) { outs.push(Object.assign(P.outPdf(await P.save(doc), P.suffixName(it, '-flattened')), { meta: 'no form fields found' })); continue; }
          form.flatten();
          outs.push(Object.assign(P.outPdf(await P.save(doc), P.suffixName(it, '-flattened')), { meta: `${fields} fields flattened` }));
        } else if (o.mode === 'annots') {
          doc = await P.load(it); const { PDFName, PDFDict } = PDFLib; let removed = 0;
          doc.getPages().forEach((p) => { const a = p.node.Annots(); if (!a) return; const keep = []; for (let i = 0; i < a.size(); i++) { const d = a.lookup(i, PDFDict); const st = d.get(PDFName.of('Subtype')); if (o.links && String(st) === '/Link') keep.push(a.get(i)); else removed++; } if (keep.length) p.node.set(PDFName.of('Annots'), doc.context.obj(keep)); else p.node.delete(PDFName.of('Annots')); });
          try { doc.catalog.delete(PDFName.of('AcroForm')); } catch { }
          outs.push(Object.assign(P.outPdf(await P.save(doc), P.suffixName(it, '-clean')), { meta: `${removed} annotations removed` }));
        } else {
          const out = await P.create(); const pdoc = await P.doc(it); const n = pdoc.numPages; const texts = o.text ? await P.text(it) : null; const font = await P.std(out, 'Helvetica');
          for (let i = 0; i < n; i++) {
            ctx.check(); ctx.progress((f + i / n) / items.length, `${it.name}: page ${i + 1}/${n}`);
            const pg = await pdoc.getPage(i + 1); const vp = pg.getViewport({ scale: 1 });
            const c = await P.render(pg, { scale: o.dpi / 72 }); const jb = new Uint8Array(await (await U.canvasBlob(c, 'image/jpeg', 0.88)).arrayBuffer());
            const im = await out.embedJpg(jb); const page = out.addPage([vp.width, vp.height]); page.drawImage(im, { x: 0, y: 0, width: vp.width, height: vp.height });
            if (texts) await P.invisibleText(out, page, texts[i].items.filter((t) => t.str.trim()).map((t) => ({ text: t.str, x: t.x, y: t.y - t.size * 0.8, w: t.w, h: t.size })), font);
            await U.tick();
          }
          outs.push(P.outPdf(await P.save(out), P.suffixName(it, '-flat')));
        }
      }
      return outs;
    },
  });

  // ================= CHANGE COLOURS =================
  const hueInv = [-0.574, 1.43, 0.144, 0.426, 0.43, 0.144, 0.426, 1.43, -0.856];
  function recolor(d, o) {
    const len = d.length; const [tr, tg, tb] = P.hexToRgb01(o.ink).map((x) => x * 255), [pr, pg, pb] = P.hexToRgb01(o.paper).map((x) => x * 255);
    const br = o.brightness, ct = (259 * (o.contrast + 255)) / (255 * (259 - o.contrast));
    for (let i = 0; i < len; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      switch (o.mode) {
        case 'invert': r = 255 - r; g = 255 - g; b = 255 - b; break;
        case 'dark': { const nr = hueInv[0] * r + hueInv[1] * g + hueInv[2] * b, ng = hueInv[3] * r + hueInv[4] * g + hueInv[5] * b, nb = hueInv[6] * r + hueInv[7] * g + hueInv[8] * b; r = 255 - nr; g = 255 - ng; b = 255 - nb; break; }
        case 'gray': r = g = b = lum; break;
        case 'sepia': { const nr = 0.393 * r + 0.769 * g + 0.189 * b, ng = 0.349 * r + 0.686 * g + 0.168 * b, nb = 0.272 * r + 0.534 * g + 0.131 * b; r = nr; g = ng; b = nb; break; }
        case 'bw': { const v = lum < o.threshold ? 0 : 255; r = g = b = v; break; }
        case 'contrast': { const v = U.clamp((lum - 128) * 1.8 + 128, 0, 255); r = g = b = v; break; }
        case 'duo': { const t = lum / 255; r = tr + (pr - tr) * t; g = tg + (pg - tg) * t; b = tb + (pb - tb) * t; break; }
      }
      if (br || o.contrast) { r = (r + br - 128) * ct + 128; g = (g + br - 128) * ct + 128; b = (b + br - 128) * ct + 128; }
      d[i] = r < 0 ? 0 : r > 255 ? 255 : r; d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  }
  W.pdf.recolor = recolor;
  W.simpleTool({
    id: 'change-colors', cat: 'edit', name: 'Change PDF colours', icon: 'contrast', action: 'Change colours', actionIcon: 'contrast',
    desc: 'Create inverted, sepia, grayscale, or high-contrast pages.', keys: 'invert dark mode night grayscale black white sepia colour color ink saving print low vision duotone',
    files: Object.assign({ multi: false, title: 'Drop a PDF' }, PDF_FILES),
    opts: [
      { id: 'mode', type: 'select', label: 'Look', options: [['dark', 'Dark mode (invert, keep hues)'], ['invert', 'Invert colours'], ['gray', 'Grayscale'], ['sepia', 'Sepia'], ['bw', 'Black & white (scan clean-up)'], ['contrast', 'High-contrast grayscale'], ['duo', 'Custom ink & paper colours']], value: 'dark' },
      { type: 'row', show: (v) => v.mode === 'duo', children: [{ id: 'ink', type: 'color', label: 'Ink (dark areas)', value: '#1d2a44' }, { id: 'paper', type: 'color', label: 'Paper (light areas)', value: '#f5ecd7' }] },
      { id: 'threshold', type: 'range', label: 'Black / white threshold', min: 40, max: 230, value: 160, show: (v) => v.mode === 'bw' },
      { id: 'brightness', type: 'range', label: 'Brightness', min: -80, max: 80, value: 0 },
      { id: 'contrast', type: 'range', label: 'Contrast', min: -60, max: 100, value: 0 },
      { id: 'dpi', type: 'select', label: 'Quality', options: [[110, 'Small (110 dpi)'], [150, 'Good (150 dpi)'], [200, 'Sharp (200 dpi)'], [300, 'Print (300 dpi)']], value: 150 },
      { id: 'text', type: 'check', label: 'Keep text searchable (invisible text layer)', value: true },
      P.pagesField({ label: 'Only these pages (others are kept as they are)' }),
    ],
    setup(root, api) {
      const box = h('section.card.pad', { hidden: true }, h('h3.card-h', 'Preview (page 1)'), h('div.cc-prev'));
      api.panelHost.appendChild(box); const host = $('.cc-prev', box);
      api.draw = U.debounce(async () => {
        const it = api.fl.items[0]; box.hidden = !it; if (!it) return;
        const c = await P.renderPage(it, 0, { width: 420 }); const g = c.getContext('2d'); const id = g.getImageData(0, 0, c.width, c.height); recolor(id.data, api.vals); g.putImageData(id, 0, 0);
        c.className = 'cc-img'; host.innerHTML = ''; host.appendChild(c);
      }, 120);
    },
    onFiles: (items, api) => api.draw && api.draw(), onOpt: (v, id, api) => api.draw && api.draw(),
    async run(items, o, ctx) {
      const it = items[0]; const pdoc = await P.doc(it); const n = pdoc.numPages; const sel = new Set(W.parseRanges(o.pages, n));
      const texts = o.text ? await P.text(it) : null; const out = await P.create(); const font = await P.std(out, 'Helvetica'); const src = sel.size < n ? await P.load(it) : null;
      for (let i = 0; i < n; i++) {
        ctx.check(); ctx.progress(i / n, `Page ${i + 1} of ${n}`);
        if (!sel.has(i)) { const [cp] = await out.copyPages(src, [i]); out.addPage(cp); continue; }
        const pg = await pdoc.getPage(i + 1); const vp = pg.getViewport({ scale: 1 }); const c = await P.render(pg, { scale: o.dpi / 72 });
        const g = c.getContext('2d'); const id = g.getImageData(0, 0, c.width, c.height); recolor(id.data, o); g.putImageData(id, 0, 0);
        const isBW = o.mode === 'bw'; const blob = await U.canvasBlob(c, isBW ? 'image/png' : 'image/jpeg', 0.88); const bytes = new Uint8Array(await blob.arrayBuffer());
        const im = isBW ? await out.embedPng(bytes) : await out.embedJpg(bytes); const page = out.addPage([vp.width, vp.height]); page.drawImage(im, { x: 0, y: 0, width: vp.width, height: vp.height });
        if (texts) await P.invisibleText(out, page, texts[i].items.filter((t) => t.str.trim()).map((t) => ({ text: t.str, x: t.x, y: t.y - t.size * 0.8, w: t.w, h: t.size })), font);
        await U.tick();
      }
      return [P.outPdf(await P.save(out), P.suffixName(it, '-' + o.mode))];
    },
  });

  // ================= METADATA =================
  const toLocal = (d) => { if (!d) return ''; const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  W.simpleTool({
    id: 'metadata', cat: 'convert', name: 'Edit metadata', icon: 'tags', action: 'Save metadata', actionIcon: 'tags',
    desc: 'Update the title, author, subject, and keywords.', keys: 'properties author title subject keywords creator producer dates remove clean info',
    files: Object.assign({ multi: false, title: 'Drop a PDF' }, PDF_FILES),
    opts: [
      { id: 'title', type: 'text', label: 'Title' }, { id: 'author', type: 'text', label: 'Author' }, { id: 'subject', type: 'text', label: 'Subject' },
      { id: 'keywords', type: 'text', label: 'Keywords', help: 'Separate with commas.' },
      { type: 'row', children: [{ id: 'creator', type: 'text', label: 'Creator (application)' }, { id: 'producer', type: 'text', label: 'Producer' }] },
      { type: 'row', children: [{ id: 'created', type: 'datetime', label: 'Created' }, { id: 'modified', type: 'datetime', label: 'Modified' }] },
      { id: 'wipe', type: 'check', label: 'Remove all metadata instead (title, author, dates, XMP…)', value: false },
    ],
    async onFiles(items, api) {
      if (!items[0]) return; const d = await P.load(items[0]); const set = api.setOpt;
      set('title', d.getTitle() || ''); set('author', d.getAuthor() || ''); set('subject', d.getSubject() || ''); set('keywords', d.getKeywords() || '');
      set('creator', d.getCreator() || ''); set('producer', d.getProducer() || ''); set('created', toLocal(d.getCreationDate())); set('modified', toLocal(d.getModificationDate()));
    },
    async run(items, o) {
      const it = items[0]; const d = await P.load(it); const { PDFName } = PDFLib;
      if (o.wipe) { d.setTitle(''); d.setAuthor(''); d.setSubject(''); d.setKeywords([]); d.setCreator(''); d.setProducer(''); const info = d.context.lookup(d.context.trailerInfo.Info); if (info && info.keys) info.keys().slice().forEach((k) => info.delete(k)); }
      else {
        d.setTitle(o.title); d.setAuthor(o.author); d.setSubject(o.subject); d.setKeywords(o.keywords.split(',').map((s) => s.trim()).filter(Boolean)); d.setCreator(o.creator); d.setProducer(o.producer);
        if (o.created) d.setCreationDate(new Date(o.created)); if (o.modified) d.setModificationDate(new Date(o.modified));
      }
      try { d.catalog.delete(PDFName.of('Metadata')); } catch { }
      const bytes = await d.save({ useObjectStreams: true, updateFieldAppearances: false });
      return [P.outPdf(bytes, P.suffixName(it, o.wipe ? '-clean' : '-meta'))];
    },
  });
}
