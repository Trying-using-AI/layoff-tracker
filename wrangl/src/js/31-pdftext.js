// ===== Text drawing helpers on top of pdf-lib (standard fonts, raster fallback, invisible text) =====
P.FAMILIES = [['Helvetica', 'Sans-serif (Helvetica)'], ['Times', 'Serif (Times)'], ['Courier', 'Monospace (Courier)']];
P.std = async function (doc, family = 'Helvetica', bold = false, italic = false) {
  const { StandardFonts } = PDFLib; doc._fc = doc._fc || {};
  const key = family + (bold ? 'B' : '') + (italic ? 'I' : '');
  if (doc._fc[key]) return doc._fc[key];
  let name;
  if (family === 'Times') name = bold && italic ? 'TimesRomanBoldItalic' : bold ? 'TimesRomanBold' : italic ? 'TimesRomanItalic' : 'TimesRoman';
  else if (family === 'Courier') name = 'Courier' + (bold && italic ? 'BoldOblique' : bold ? 'Bold' : italic ? 'Oblique' : '');
  else name = 'Helvetica' + (bold && italic ? 'BoldOblique' : bold ? 'Bold' : italic ? 'Oblique' : '');
  return (doc._fc[key] = await doc.embedFont(StandardFonts[name]));
};
const _cs = new WeakMap();
P.canEncode = function (font, text) {
  let set = _cs.get(font); if (!set) { try { set = new Set(font.getCharacterSet()); } catch { set = null; } _cs.set(font, set); }
  if (!set) return true;
  for (const ch of text) { const cp = ch.codePointAt(0); if (cp === 10 || cp === 13 || cp === 9) continue; if (!set.has(cp)) return false; }
  return true;
};
/** WinAnsi-safe version of a string (for places where we can't raster) */
P.sanitize = (font, text) => { let o = ''; for (const ch of text) o += P.canEncode(font, ch) ? ch : (/\s/.test(ch) ? ' ' : '?'); return o; };

/** Render text to a transparent PNG with the browser's own font stack (handles any script / emoji). */
P.textImage = async function (text, { size = 24, family = 'sans-serif', bold = false, italic = false, color = '#000', scale = 4 } = {}) {
  const font = `${italic ? 'italic ' : ''}${bold ? '700 ' : '400 '}${size * scale}px ${family}`;
  const m = W.canvas(8, 8).getContext('2d'); m.font = font; const w = Math.ceil(m.measureText(text).width) + 4 * scale;
  const asc = Math.ceil(size * scale * 1.0), desc = Math.ceil(size * scale * 0.35);
  const c = W.canvas(w, asc + desc); const g = c.getContext('2d'); g.font = font; g.fillStyle = color; g.textBaseline = 'alphabetic'; g.fillText(text, 2 * scale, asc);
  const blob = await U.canvasBlob(c, 'image/png');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width / scale, h: c.height / scale, baseline: asc / scale, pxW: c.width };
};
P.textWidth = (font, text, size) => font.widthOfTextAtSize(P.sanitize(font, text), size);

/**
 * Draw text; falls back to an image when the string needs glyphs the standard font lacks.
 * opts: x,y (baseline-left, PDF coords), size, family, bold, italic, color (hex), opacity, rotate (deg, about x,y)
 */
P.drawText = async function (doc, page, text, o = {}) {
  const { rgb, degrees } = PDFLib; const size = o.size || 12;
  const font = await P.std(doc, o.family || 'Helvetica', o.bold, o.italic);
  const col = await P.rgb(o.color || '#000000');
  if (P.canEncode(font, text)) {
    page.drawText(text, { x: o.x, y: o.y, size, font, color: col, opacity: o.opacity == null ? 1 : o.opacity, rotate: o.rotate ? degrees(o.rotate) : undefined });
    return { width: font.widthOfTextAtSize(text, size), height: font.heightAtSize(size) };
  }
  const fam = o.family === 'Times' ? 'Georgia, "Times New Roman", serif' : o.family === 'Courier' ? '"Courier New", monospace' : 'system-ui, "Segoe UI", Arial, "Noto Sans", sans-serif';
  const im = await P.textImage(text, { size, family: fam, bold: o.bold, italic: o.italic, color: o.color || '#000' });
  const emb = await doc.embedPng(im.bytes);
  const a = (o.rotate || 0) * Math.PI / 180, ox = -2, oy = -(im.h - im.baseline);
  page.drawImage(emb, { x: o.x + ox * Math.cos(a) - oy * Math.sin(a), y: o.y + ox * Math.sin(a) + oy * Math.cos(a), width: im.w, height: im.h, rotate: o.rotate ? degrees(o.rotate) : undefined, opacity: o.opacity == null ? 1 : o.opacity });
  return { width: im.w, height: im.h };
};
/** Measure width of text as P.drawText would render it */
P.measure = async function (doc, text, o = {}) {
  const size = o.size || 12; const font = await P.std(doc, o.family || 'Helvetica', o.bold, o.italic);
  if (P.canEncode(font, text)) return font.widthOfTextAtSize(text, size);
  const m = W.canvas(8, 8).getContext('2d'); m.font = `${o.italic ? 'italic ' : ''}${o.bold ? '700 ' : ''}${size * 4}px sans-serif`; return m.measureText(text).width / 4;
};

/** Invisible (render mode 3) text so scanned/rasterised pages stay searchable and selectable. words: [{text,x,y,w,h}] in page points with y from the TOP. */
P.invisibleText = async function (doc, page, words, font) {
  const { PDFOperator, PDFNumber, pushGraphicsState, popGraphicsState } = PDFLib;
  font = font || await P.std(doc, 'Helvetica');
  const H = page.getHeight(); const key = page.node.newFontDictionary(font.name, font.ref);
  const ops = [PDFOperator.of('q'), PDFOperator.of('BT'), PDFOperator.of('Tr', [PDFNumber.of(3)])];
  for (const w of words) {
    const text = P.sanitize(font, w.text); if (!text.trim()) continue;
    const size = Math.max(1, w.h * 0.8); const nat = font.widthOfTextAtSize(text, size) || 1; const tz = U.clamp(w.w / nat * 100, 10, 1000);
    ops.push(PDFOperator.of('Tf', [PDFLib.PDFName.of(key.asString().replace(/^\//, '')), PDFNumber.of(size)]));
    ops.push(PDFOperator.of('Tz', [PDFNumber.of(tz)]));
    ops.push(PDFOperator.of('Tm', [PDFNumber.of(1), PDFNumber.of(0), PDFNumber.of(0), PDFNumber.of(1), PDFNumber.of(w.x), PDFNumber.of(H - w.y - w.h * 0.2)]));
    ops.push(PDFOperator.of('Tj', [font.encodeText(text)]));
  }
  ops.push(PDFOperator.of('ET'), PDFOperator.of('Q'));
  page.pushOperators(...ops);
};
/** Mark following drawing ops as a watermark artifact (so "Remove watermark" can find them). */
P.beginWatermark = (page) => { const { PDFOperator, PDFName, PDFDict } = PDFLib; const ctx = page.doc.context; const d = ctx.obj({ Type: 'Pagination', Subtype: 'Watermark' }); page.pushOperators(PDFOperator.of('BDC', [PDFName.of('Artifact'), d])); };
P.endWatermark = (page) => { const { PDFOperator } = PDFLib; page.pushOperators(PDFOperator.of('EMC')); };

// ----- positions on a page for header/footer/number style tools -----
P.POS = [['tl', 'Top left'], ['tc', 'Top centre'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['bc', 'Bottom centre'], ['br', 'Bottom right']];
/** compute x,y baseline for text of width tw at a named position */
P.anchor = function (pos, pw, ph, tw, size, margin) {
  const x = pos[1] === 'l' ? margin : pos[1] === 'c' ? (pw - tw) / 2 : pw - margin - tw;
  const y = pos[0] === 't' ? ph - margin - size * 0.8 : margin;
  return [x, y];
};
P.roman = (n) => { const m = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, r] of m) while (n >= v) { s += r; n -= v; } return s; };
P.alpha = (n) => { let s = ''; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };
