// ===== PDF content analysis: reading-order structure, tables, embedded images, DOCX/EPUB writers =====
{
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  const BULLET = /^\s*([•●○◦▪■□▫–—\-*·]|\(?\d{1,3}[.)]|\(?[a-zA-Z][.)]|[ivxIVX]{1,5}[.)])\s+/;

  /** Split one text line (items on a baseline) into segments separated by wide gaps. */
  function segments(L, gapMul = 1.35) {
    const its = L.items.slice().sort((a, b) => a.x - b.x); const segs = []; let cur = null;
    for (const t of its) {
      if (!t.str) continue;
      const gap = cur ? t.x - cur.x2 : 0; const thr = Math.max(t.size * gapMul, 9);
      if (cur && gap <= thr) { cur.text += (gap > t.size * 0.15 && !/\s$/.test(cur.text) && !/^\s/.test(t.str) ? ' ' : '') + t.str; cur.x2 = Math.max(cur.x2, t.x + t.w); cur.items.push(t); }
      else { cur = { x: t.x, x2: t.x + t.w, text: t.str, items: [t] }; segs.push(cur); }
    }
    segs.forEach((s) => { s.text = s.text.replace(/\s+/g, ' ').trim(); }); return segs.filter((s) => s.text);
  }
  function runsOf(items) {
    const runs = []; const its = items.slice().sort((a, b) => a.x - b.x);
    for (const t of its) { const l = runs[runs.length - 1]; const key = (t.bold ? 'b' : '') + (t.italic ? 'i' : ''); if (l && l.key === key && Math.abs(l.size - t.size) < 0.6) { l.text += ((t.x - l.x2) > t.size * 0.15 && !/\s$/.test(l.text) && !/^\s/.test(t.str) ? ' ' : '') + t.str; l.x2 = t.x + t.w; } else runs.push({ key, bold: t.bold, italic: t.italic, size: t.size, text: t.str, x2: t.x + t.w }); }
    return runs;
  }
  function tableFrom(lines) {
    // lines: [{y, size, segs}]. cluster segment starts into columns
    const xs = []; lines.forEach((l) => l.segs.forEach((s) => xs.push(s.x))); xs.sort((a, b) => a - b);
    const tol = Math.max(6, median(lines.map((l) => l.size)) * 0.9); const cols = [];
    for (const x of xs) { const c = cols[cols.length - 1]; if (c && x - c.max <= tol) { c.max = x; c.n++; c.sum += x; } else cols.push({ min: x, max: x, n: 1, sum: x }); }
    const starts = cols.filter((c) => c.n >= Math.max(2, Math.ceil(lines.length * 0.3))).map((c) => c.sum / c.n);
    if (starts.length < 2) return null;
    const rows = lines.map((l) => { const cells = starts.map(() => ''); l.segs.forEach((s) => { let bi = 0, bd = 1e9; starts.forEach((st, i) => { const d = Math.abs(s.x - st); if (d < bd) { bd = d; bi = i; } }); // a segment starting right of col i but left of col i+1 belongs to i
      for (let i = starts.length - 1; i >= 0; i--) if (s.x >= starts[i] - tol) { bi = i; break; } cells[bi] += (cells[bi] ? ' ' : '') + s.text; }); return cells; });
    return { type: 'table', rows, cols: starts, y: lines[0].y, y2: lines[lines.length - 1].y, x: starts[0] };
  }

  /** Analyse one page's text into blocks: heading / para / list / table. */
  function analysePage(pg, bodySize) {
    const raw = P.lines(pg, { tol: 0.45 }); const lines = raw.map((l) => ({ y: l.y, x: l.x, x2: l.x2, size: l.size, items: l.items, text: l.text, bold: l.items.every((t) => t.bold), italic: l.items.every((t) => t.italic), mono: l.mono, segs: segments(l) })).filter((l) => l.segs.length);
    lines.sort((a, b) => a.y - b.y || a.x - b.x);
    const blocks = []; let i = 0; const right = Math.max(...lines.map((l) => l.x2), 0);
    while (i < lines.length) {
      const L = lines[i];
      // table candidate run
      if (L.segs.length >= 2) {
        let j = i; const run = [];
        while (j < lines.length && (lines[j].segs.length >= 2 || (run.length && lines[j].segs.length === 1 && lines[j].x < run[0].segs[0].x + 12 && lines[j].y - lines[j - 1].y < lines[j].size * 1.6 && lines[j + 1] && lines[j + 1].segs.length >= 2)) && (j === i || lines[j].y - lines[j - 1].y < Math.max(lines[j].size, lines[j - 1].size) * 2.6)) { run.push(lines[j]); j++; }
        if (run.length >= 2) { const t = tableFrom(run); if (t) { blocks.push(t); i = j; continue; } }
      }
      // paragraph assembly
      const para = { type: 'para', lines: [L], y: L.y, x: L.x, size: L.size, bold: L.bold, italic: L.italic, mono: L.mono }; let j = i + 1;
      const isBullet = BULLET.test(L.text); if (isBullet) para.list = true;
      while (j < lines.length) {
        const N = lines[j], prev = lines[j - 1]; const gap = N.y - prev.y;
        if (N.segs.length >= 2) break; if (BULLET.test(N.text) && !para.mono) break;
        if (gap > Math.max(prev.size, N.size) * 1.65 || gap < 0) break; if (Math.abs(N.size - prev.size) > prev.size * 0.18) break; if (N.bold !== prev.bold && prev.text.length < 60) break;
        if (!para.mono && prev.x2 < right - Math.max(prev.size * 7, 60) && prev.text.length < 70 && N.x <= prev.x + 2 && !/[,;]$/.test(prev.text)) { if (!/[a-z,]$/.test(prev.text) || /^[A-Z]/.test(N.text)) break; }
        if (!para.mono && N.x > prev.x + prev.size * 1.2 && !para.list) break; para.lines.push(N); j++;
      }
      const small = L.size; const isHeading = !para.list && !para.mono && para.lines.length <= 3 && (small >= bodySize * 1.18 || (para.bold && para.lines.length === 1 && L.text.length < 90 && small >= bodySize * 0.98));
      para.heading = isHeading ? (small >= bodySize * 1.7 ? 1 : small >= bodySize * 1.35 ? 2 : 3) : 0;
      blocks.push(para); i = j;
    }
    // finalize paragraphs
    for (const b of blocks) {
      if (b.type !== 'para') continue; let text = '';
      b.lines.forEach((l, k) => { const t = l.text.replace(/\s+/g, ' ').trim(); if (!k) text = t; else if (/-$/.test(text) && /^[a-z]/.test(t)) text = text.slice(0, -1) + t; else text += (b.mono ? '\n' : ' ') + t; });
      b.text = text; b.runs = []; b.lines.forEach((l, k) => { const rs = runsOf(l.items); if (k) rs.length && (rs[0].text = ' ' + rs[0].text); b.runs.push(...rs); });
      if (b.list) { const m = BULLET.exec(b.text); b.marker = m ? m[1] : '•'; b.ordered = /\d|[a-zA-Z]|[ivx]/i.test(b.marker) && !/^[•●○◦▪■□▫–—\-*·]$/.test(b.marker); b.body = b.text.replace(BULLET, ''); }
    }
    return blocks;
  }

  /** Reading-order structure for the whole document. */
  W.pdf.structure = async function (item, { onProgress, pages } = {}) {
    const pgs = await P.text(item, { pages, onProgress: (f) => onProgress && onProgress(f * 0.6) });
    const sizes = []; pgs.forEach((p) => p.items.forEach((t) => { if (t.str.trim().length > 2) for (let k = 0; k < Math.min(t.str.length, 40); k++) sizes.push(Math.round(t.size * 2) / 2); }));
    const body = median(sizes) || 11; const out = [];
    pgs.forEach((p, i) => { out.push({ index: p.index, w: p.w, h: p.h, blocks: analysePage(p, body) }); onProgress && onProgress(0.6 + 0.4 * (i + 1) / pgs.length); });
    return { pages: out, body };
  };
  W.pdf.extractTables = async function (item, onProgress) {
    const st = await W.pdf.structure(item, { onProgress });
    return st.pages.map((p) => { const tabs = p.blocks.filter((b) => b.type === 'table'); const rows = tabs.length ? tabs.flatMap((t, k) => (k ? [[''], ...t.rows] : t.rows)) : p.blocks.filter((b) => b.type === 'para').flatMap((b) => b.lines.map((l) => l.segs.map((s) => s.text))); return { page: p.index, rows, tables: tabs.length }; });
  };

  // ---------- embedded images with positions (pdf.js) ----------
  function toCanvas(img) {
    const w = img.width, hh = img.height; const c = W.canvas(w, hh); const g = c.getContext('2d');
    if (img.bitmap) { g.drawImage(img.bitmap, 0, 0); return c; }
    const id = g.createImageData(w, hh); const d = id.data, s = img.data; if (!s) return null;
    if (img.kind === 3) d.set(s.subarray ? s.subarray(0, d.length) : s);
    else if (img.kind === 2) { for (let i = 0, j = 0; i < w * hh; i++) { d[j++] = s[i * 3]; d[j++] = s[i * 3 + 1]; d[j++] = s[i * 3 + 2]; d[j++] = 255; } }
    else if (img.kind === 1) { const rb = (w + 7) >> 3; for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const v = (s[y * rb + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0; const o = (y * w + x) * 4; d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255; } }
    else return null;
    g.putImageData(id, 0, 0); return c;
  }
  W.pdf.pageImages = async function (item, idx, { minSize = 24 } = {}) {
    const doc = await P.doc(item); const page = await doc.getPage(idx + 1); const vp = page.getViewport({ scale: 1 }); const { OPS } = pdfjsLib;
    const list = await page.getOperatorList(); const out = []; const stack = []; let m = [1, 0, 0, 1, 0, 0];
    const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    for (let i = 0; i < list.fnArray.length; i++) {
      const fn = list.fnArray[i], a = list.argsArray[i];
      if (fn === OPS.save) stack.push(m.slice()); else if (fn === OPS.restore) m = stack.pop() || m; else if (fn === OPS.transform) m = mul(m, a);
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintJpegXObject) {
        let img = null; try { img = fn === OPS.paintInlineImageXObject ? a[0] : (page.objs.has(a[0]) ? page.objs.get(a[0]) : page.commonObjs.has(a[0]) ? page.commonObjs.get(a[0]) : null); } catch { }
        if (!img || img.width < 2) continue;
        const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => vp.convertToViewportPoint(m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]));
        const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]); const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, hh = Math.max(...ys) - y;
        if (w < minSize || hh < minSize) continue; out.push({ x, y, w, h: hh, img, key: fn === OPS.paintInlineImageXObject ? null : a[0] });
      }
    }
    const res = []; const seen = new Map();
    for (const o of out) { let c = o.key && seen.get(o.key); if (!c) { try { c = toCanvas(o.img); } catch { c = null; } if (o.key) seen.set(o.key, c); } if (c) res.push({ x: o.x, y: o.y, w: o.w, h: o.h, canvas: c }); }
    return res;
  };

  // ---------- DOCX writer ----------
  const xe = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  W.docx = {
    run(r) { const rp = (r.bold ? '<w:b/>' : '') + (r.italic ? '<w:i/>' : '') + (r.underline ? '<w:u w:val="single"/>' : '') + (r.color ? `<w:color w:val="${r.color}"/>` : '') + (r.size ? `<w:sz w:val="${Math.round(r.size * 2)}"/><w:szCs w:val="${Math.round(r.size * 2)}"/>` : '') + (r.mono ? '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>' : ''); return `<w:r>${rp ? `<w:rPr>${rp}</w:rPr>` : ''}<w:t xml:space="preserve">${xe(r.text)}</w:t></w:r>`; },
    para(runs, { style, align, after = 120, before = 0, left = 0, hanging = 0, pageBreakBefore = false, numId } = {}) {
      const pp = (style ? `<w:pStyle w:val="${style}"/>` : '') + (pageBreakBefore ? '<w:pageBreakBefore/>' : '') + (numId ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>` : '') + `<w:spacing w:before="${before}" w:after="${after}"/>` + (left || hanging ? `<w:ind w:left="${left}"${hanging ? ` w:hanging="${hanging}"` : ''}/>` : '') + (align ? `<w:jc w:val="${align}"/>` : '');
      return `<w:p><w:pPr>${pp}</w:pPr>${runs.map((r) => W.docx.run(r)).join('')}</w:p>`;
    },
    table(rows) { const n = Math.max(...rows.map((r) => r.length)); const grid = Array.from({ length: n }, () => `<w:gridCol w:w="${Math.floor(9000 / n)}"/>`).join(''); return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>`).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows.map((r) => `<w:tr>${Array.from({ length: n }, (_, i) => `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(9000 / n)}" w:type="dxa"/></w:tcPr>${W.docx.para([{ text: r[i] || '' }], { after: 40 })}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>${W.docx.para([{ text: '' }], { after: 80 })}`; },
    image(rid, id, wpt, hpt, name = 'image') { const cx = Math.round(wpt * 12700), cy = Math.round(hpt * 12700); return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${name}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`; },
    async build({ body, images = [], pageW = 595, pageH = 842, margin = 72, title = '', author = '' }) {
      const JSZip = await W.lib('jszip'); const z = new JSZip(); const tw = Math.round(pageW * 20), th = Math.round(pageH * 20), mg = Math.round(margin * 20);
      z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
      z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
      z.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(title)}</dc:title><dc:creator>${xe(author || 'Wrangl')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`);
      const rels = images.map((im, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i + 1}.${im.ext}"/>`).join('');
      z.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${rels}</Relationships>`);
      images.forEach((im, i) => z.file(`word/media/image${i + 1}.${im.ext}`, im.bytes));
      const hs = (id, name, sz, color = '000000') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
      z.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${hs('Heading1', 'heading 1', 40)}${hs('Heading2', 'heading 2', 32)}${hs('Heading3', 'heading 3', 26)}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720"/></w:pPr></w:style></w:styles>`);
      z.file('word/numbering.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`);
      z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="${tw}" w:h="${th}"/><w:pgMar w:top="${mg}" w:right="${mg}" w:bottom="${mg}" w:left="${mg}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
      return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
    },
  };
  W.canvasBytes = async (c, type = 'image/png', q) => new Uint8Array(await (await U.canvasBlob(c, type, q)).arrayBuffer());

  // ---------- EPUB writer ----------
  W.epub = {
    async build({ title, author = '', chapters, images = [], lang = 'en' }) {
      const JSZip = await W.lib('jszip'); const z = new JSZip(); const id = 'urn:uuid:' + ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
      z.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
      z.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
      const manifest = chapters.map((c, i) => `<item id="c${i + 1}" href="ch${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('') + images.map((im, i) => `<item id="img${i + 1}" href="images/${im.name}" media-type="${im.type}"/>`).join('');
      z.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${id}</dc:identifier><dc:title>${xe(title)}</dc:title><dc:creator>${xe(author || 'Unknown')}</dc:creator><dc:language>${lang}</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>${manifest}</manifest><spine toc="ncx">${chapters.map((c, i) => `<itemref idref="c${i + 1}"/>`).join('')}</spine></package>`);
      const xh = (t, body) => `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}"><head><meta charset="utf-8"/><title>${xe(t)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body}</body></html>`;
      z.file('OEBPS/nav.xhtml', xh('Contents', `<nav epub:type="toc"><h1>Contents</h1><ol>${chapters.map((c, i) => `<li><a href="ch${i + 1}.xhtml">${xe(c.title)}</a></li>`).join('')}</ol></nav>`));
      z.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${id}"/></head><docTitle><text>${xe(title)}</text></docTitle><navMap>${chapters.map((c, i) => `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${xe(c.title)}</text></navLabel><content src="ch${i + 1}.xhtml"/></navPoint>`).join('')}</navMap></ncx>`);
      z.file('OEBPS/style.css', 'body{font-family:Georgia,serif;line-height:1.55;margin:5%}h1,h2,h3{font-family:Helvetica,Arial,sans-serif;line-height:1.25}p{margin:0 0 .8em;text-align:justify}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #999;padding:3px 6px}pre{white-space:pre-wrap;font-size:.85em}');
      chapters.forEach((c, i) => z.file(`OEBPS/ch${i + 1}.xhtml`, xh(c.title, c.html))); images.forEach((im) => z.file('OEBPS/images/' + im.name, im.bytes));
      return z.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' });
    },
  };
  W.xe = xe;
}
