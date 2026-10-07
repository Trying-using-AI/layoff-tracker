// ===== DOM → vector PDF engine =====
// Lays HTML out with the browser, then replays the layout into pdf-lib: real (selectable) text,
// backgrounds, borders, images, links and automatic page breaks. Used by every "create PDF" tool.
{
  const PX = 0.75; // 1 CSS px = 0.75 pt
  const STACKS = { sans: 'Arial, "Liberation Sans", Helvetica, sans-serif', serif: '"Times New Roman", "Liberation Serif", Times, serif', mono: '"Courier New", "Liberation Mono", Courier, monospace' };
  const famKind = (ff) => {
    for (const raw of (ff || '').split(',')) {
      const f = raw.replace(/['"]/g, '').trim().toLowerCase(); if (!f) continue;
      if (/mono|courier|consolas|menlo|monaco|lucida console|source code|fira code/.test(f)) return 'mono';
      if (/^(times|georgia|garamond|palatino|cambria|book antiqua|baskerville|serif|liberation serif|noto serif|charter|constantia|iowan)/.test(f) || /\bserif$/.test(f) && !/sans/.test(f)) return 'serif';
      if (/arial|helvetica|sans|verdana|tahoma|calibri|segoe|roboto|inter|system-ui|ui-sans|trebuchet|open sans|lato|montserrat/.test(f)) return 'sans';
    }
    return 'sans';
  };
  const parseColor = (c) => {
    if (!c || c === 'transparent') return null;
    const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat); const a = p.length > 3 ? p[3] : 1; if (a <= 0.01) return null;
    return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a };
  };
  const metricCache = new Map();
  const ascentOf = (cs) => {
    const key = cs.fontStyle + cs.fontWeight + cs.fontSize + cs.fontFamily; let v = metricCache.get(key);
    if (v == null) { const g = metricCache.ctx || (metricCache.ctx = W.canvas(4, 4).getContext('2d')); g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; const m = g.measureText('Hg'); v = m.fontBoundingBoxAscent != null ? m.fontBoundingBoxAscent : parseFloat(cs.fontSize) * 0.905; metricCache.set(key, v); }
    return v;
  };

  const DOC_CSS = `
  html,body{margin:0;padding:0;background:#fff}
  body{font-family:${STACKS.sans};font-size:11pt;line-height:1.5;color:#1a1a1a;-webkit-text-size-adjust:none}
  h1,h2,h3,h4,h5,h6{font-family:${STACKS.sans};line-height:1.25;margin:1.1em 0 .45em;color:#111;break-after:avoid}
  h1{font-size:22pt}h2{font-size:17pt}h3{font-size:14pt}h4{font-size:12pt}h5{font-size:11pt}h6{font-size:10pt;color:#555}
  p{margin:0 0 .75em}ul,ol{margin:0 0 .75em;padding-left:1.7em}li{margin:.15em 0}
  a{color:#1a56c4;text-decoration:underline}
  table{border-collapse:collapse;margin:.4em 0 .9em;max-width:100%}
  th,td{border:1px solid #b8b8b8;padding:4px 8px;vertical-align:top;text-align:left}th{background:#f1f1f1;font-weight:700}
  tr{break-inside:avoid}
  pre{background:#f5f5f2;border:1px solid #e1e1dc;border-radius:4px;padding:8px 10px;white-space:pre-wrap;word-break:break-word;font-size:9.5pt;line-height:1.4;break-inside:avoid}
  code{font-family:${STACKS.mono};font-size:.92em}:not(pre)>code{background:#f0f0ec;padding:0 .25em;border-radius:3px}
  blockquote{margin:.6em 0 .9em;padding:.1em 1em;border-left:3px solid #c9c9c0;color:#555}
  hr{border:0;border-top:1px solid #c9c9c0;margin:1em 0}
  img{max-width:100%;height:auto}figure{margin:.6em 0}figcaption{font-size:9pt;color:#666}
  `;
  W.docCss = DOC_CSS;

  /** Build a hidden iframe with the given full HTML; resolves when loaded + images decoded. */
  async function mountFrame(html, widthPx, heightPx = 1200) {
    const fr = document.createElement('iframe');
    fr.setAttribute('sandbox', 'allow-same-origin'); fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
    Object.assign(fr.style, { position: 'fixed', left: '-30000px', top: '0', width: widthPx + 'px', height: heightPx + 'px', border: '0', visibility: 'hidden', pointerEvents: 'none' });
    fr.srcdoc = html; document.body.appendChild(fr);
    await new Promise((res, rej) => { fr.onload = () => res(); setTimeout(() => res(), 8000); });
    const d = fr.contentDocument; if (!d) { fr.remove(); throw new Error('Could not lay out the document in this browser.'); }
    if (d.fonts && d.fonts.ready) { try { await d.fonts.ready; } catch { } }
    const imgs = Array.from(d.images || []).filter((i) => !i.complete);
    await Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 6000); })));
    return fr;
  }
  W.mountFrame = mountFrame;

  function normalizeFonts(doc) {
    const win = doc.defaultView;
    for (const el of doc.body.querySelectorAll('*')) {
      if (/^(script|style|link|meta|title|head|svg|path|g|circle|rect|line|polyline|polygon|ellipse|text|defs|use|img|canvas)$/i.test(el.tagName)) continue;
      const cs = win.getComputedStyle(el); const k = famKind(cs.fontFamily); el.style.fontFamily = STACKS[k];
    }
    doc.body.style.fontFamily = STACKS[famKind(win.getComputedStyle(doc.body).fontFamily)];
  }
  function addListMarkers(doc) {
    const win = doc.defaultView;
    const style = doc.createElement('style'); style.textContent = 'li.__li{list-style:none!important;position:relative}.__mk{position:absolute;right:100%;margin-right:.45em;white-space:nowrap;text-align:right}'; doc.head.appendChild(style);
    const lists = Array.from(doc.querySelectorAll('ul,ol'));
    for (const L of lists) {
      const cs = win.getComputedStyle(L); const type = cs.listStyleType; if (type === 'none') continue;
      const ord = L.tagName === 'OL'; let n = ord ? (parseInt(L.getAttribute('start'), 10) || 1) : 0; if (ord && L.hasAttribute('reversed')) n = L.children.length;
      let depth = 0; for (let p = L.parentElement; p; p = p.parentElement) if (/^(UL|OL)$/.test(p.tagName)) depth++;
      for (const li of Array.from(L.children)) {
        if (li.tagName !== 'LI') continue; const v = li.getAttribute('value'); if (v) n = parseInt(v, 10);
        const mk = doc.createElement('span'); mk.className = '__mk';
        let t; if (!ord) t = type === 'circle' ? '◦' : type === 'square' ? '▪' : (depth % 3 === 0 ? '•' : depth % 3 === 1 ? '◦' : '▪');
        else t = type === 'lower-alpha' || type === 'lower-latin' ? P.alpha(n) + '.' : type === 'upper-alpha' ? P.alpha(n).toUpperCase() + '.' : type === 'lower-roman' ? P.roman(n).toLowerCase() + '.' : type === 'upper-roman' ? P.roman(n) + '.' : n + '.';
        mk.textContent = t; li.classList.add('__li'); li.insertBefore(mk, li.firstChild); n += (ord && L.hasAttribute('reversed')) ? -1 : 1;
      }
    }
  }

  // ---------- collecting draw items ----------
  async function collect(doc, root, origin, opts) {
    const win = doc.defaultView; const items = []; const atoms = []; const links = []; const imgJobs = [];
    const ox = origin.x, oy = origin.y;
    const rel = (r) => ({ x: r.left - ox, y: r.top - oy, w: r.width, h: r.height });
    const range = doc.createRange();
    const walk = (el, inh) => {
      const cs = win.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.hasAttribute('data-nopdf')) return;
      const tag = el.tagName.toLowerCase(); if (/^(script|style|noscript|template|head|meta|link|title|iframe|object|embed)$/.test(tag)) return;
      const op = inh.opacity * parseFloat(cs.opacity || 1); if (op <= 0.01) return;
      const deco = (cs.textDecorationLine && cs.textDecorationLine !== 'none') ? cs.textDecorationLine : inh.deco;
      const next = { opacity: op, deco };
      const rects = Array.from(el.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
      const isInline = cs.display === 'inline';
      // background & borders
      const bg = parseColor(cs.backgroundColor);
      if (rects.length && tag !== 'body' || (tag === 'body' && bg)) {
        const rr = isInline ? rects : [el.getBoundingClientRect()];
        for (const r of rr) {
          if (r.width < 0.5 || r.height < 0.5) continue; const b = rel(r);
          const rad = parseFloat(cs.borderTopLeftRadius) || 0;
          if (bg && !(tag === 'html')) items.push({ k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, fill: bg, op, rad: Math.min(rad, b.h / 2, b.w / 2) });
          if (!isInline || rr.length) {
            const sides = ['Top', 'Right', 'Bottom', 'Left']; const bw = sides.map((s) => parseFloat(cs['border' + s + 'Width']) || 0), bs = sides.map((s) => cs['border' + s + 'Style']), bc = sides.map((s) => parseColor(cs['border' + s + 'Color']));
            const uniform = bw[0] > 0 && bw.every((w, i) => w === bw[0] && bs[i] === bs[0] && bs[i] !== 'none' && bs[i] !== 'hidden' && bc[i] && bc[i].r === bc[0].r && bc[i].g === bc[0].g && bc[i].b === bc[0].b);
            if (uniform && rad > 0.5) items.push({ k: 'box', x: b.x, y: b.y, w: b.w, h: b.h, width: bw[0], color: bc[0], dash: bs[0], op, rad: Math.min(rad, b.h / 2, b.w / 2) });
            else for (let i = 0; i < 4; i++) { if (bw[i] > 0 && bs[i] !== 'none' && bs[i] !== 'hidden' && bc[i]) items.push({ k: 'line', side: i, x: b.x, y: b.y, w: b.w, h: b.h, width: bw[i], color: bc[i], dash: bs[i], op }); }
          }
        }
      }
      if (tag === 'tr' || cs.breakInside === 'avoid' || cs.pageBreakInside === 'avoid') { const b = rel(el.getBoundingClientRect()); if (b.h > 0) atoms.push({ top: b.y, bottom: b.y + b.h, size: b.h, row: true }); }
      if (cs.breakBefore === 'page' || cs.pageBreakBefore === 'always') { const b = rel(el.getBoundingClientRect()); atoms.push({ top: b.y, bottom: b.y + 1, size: 1, force: true }); }
      if (/^h[1-6]$/.test(tag)) { const b = rel(el.getBoundingClientRect()); atoms.push({ top: b.y, bottom: b.y + b.h, size: b.h, heading: true }); }
      if (tag === 'a' && el.getAttribute('href') && /^(https?:|mailto:|tel:)/i.test(el.href)) rects.forEach((r) => links.push({ ...rel(r), href: el.href }));
      // replaced elements
      if (tag === 'img') { const r = rel(el.getBoundingClientRect()); if (r.w > 0 && r.h > 0 && el.naturalWidth) { const it = { k: 'img', x: r.x, y: r.y, w: r.w, h: r.h, op, src: el, fit: cs.objectFit }; items.push(it); atoms.push({ top: r.y, bottom: r.y + r.h, size: r.h, img: true }); } return; }
      if (tag === 'canvas') { const r = rel(el.getBoundingClientRect()); items.push({ k: 'img', x: r.x, y: r.y, w: r.w, h: r.h, op, canvas: el }); atoms.push({ top: r.y, bottom: r.y + r.h, size: r.h, img: true }); return; }
      if (tag === 'svg') { const r = rel(el.getBoundingClientRect()); if (r.w > 0 && r.h > 0) { items.push({ k: 'img', x: r.x, y: r.y, w: r.w, h: r.h, op, svg: el }); atoms.push({ top: r.y, bottom: r.y + r.h, size: r.h, img: true }); } return; }
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        const v = tag === 'select' ? (el.options[el.selectedIndex] || {}).text : el.value; if (v && !/^(checkbox|radio|button|submit|file|hidden)$/.test(el.type || '')) { const b = el.getBoundingClientRect(); pushText(String(v), { left: b.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), top: b.top + parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth), width: b.width, height: parseFloat(cs.fontSize) * 1.2 }, cs, next, el); }
        return;
      }
      for (const ch of el.childNodes) {
        if (ch.nodeType === 3) textNode(ch, el, cs, next);
        else if (ch.nodeType === 1) walk(ch, next);
      }
    };
    const pushText = (str, r, cs, st, el) => {
      const size = parseFloat(cs.fontSize); const kind = famKind(cs.fontFamily); const asc = ascentOf(cs);
      items.push({ k: 'text', text: str, x: r.left - ox, y: r.top - oy, w: r.width, h: r.height, base: r.top - oy + asc, size, kind, bold: parseInt(cs.fontWeight, 10) >= 600 || cs.fontWeight === 'bold', italic: cs.fontStyle !== 'normal', color: parseColor(cs.color) || { r: 0, g: 0, b: 0, a: 1 }, op: st.opacity, deco: st.deco, css: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, ls: parseFloat(cs.letterSpacing) || 0 });
    };
    const textNode = (node, el, cs, st) => {
      const data = node.data; if (!/\S/.test(data)) return;
      const tt = cs.textTransform; const re = /\S+/g; let m;
      while ((m = re.exec(data))) {
        range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        const rs = Array.from(range.getClientRects()).filter((r) => r.width > 0);
        let word = m[0]; if (tt === 'uppercase') word = word.toUpperCase(); else if (tt === 'lowercase') word = word.toLowerCase(); else if (tt === 'capitalize') word = word.replace(/(^|[\s\-"(])(\p{L})/gu, (a, b, c) => b + c.toUpperCase());
        if (rs.length === 1) pushText(word, rs[0], cs, st, el);
        else if (rs.length > 1) { // word wrapped inside itself: place char by char
          for (let i = 0; i < m[0].length; i++) { range.setStart(node, m.index + i); range.setEnd(node, m.index + i + 1); const cr = range.getClientRects()[0]; if (cr && cr.width > 0) pushText(word[i] || m[0][i], cr, cs, st, el); }
        }
      }
    };
    walk(root, { opacity: 1, deco: 'none' });
    return { items, atoms, links };
  }

  // ---------- pagination ----------
  function paginate(atomsIn, textItems, H, contentBottom) {
    const atoms = atomsIn.slice();
    // each text line is an atom
    const lines = new Map();
    for (const t of textItems) { const key = Math.round(t.base); const L = lines.get(key); if (L) { L.top = Math.min(L.top, t.y); L.bottom = Math.max(L.bottom, t.y + t.h); } else lines.set(key, { top: t.y, bottom: t.y + t.h, size: t.h, line: true }); }
    lines.forEach((l) => atoms.push(l));
    atoms.sort((a, b) => a.top - b.top || b.size - a.size);
    const starts = [0]; let ps = 0; let lastHeading = null;
    for (const a of atoms) {
      if (a.force) { if (a.top > ps + 1) { ps = a.top; starts.push(ps); } continue; }
      if (a.bottom > ps + H + 0.5) {
        if (a.top > ps + 2) {
          let np = a.top; if (lastHeading && lastHeading.top > ps + 2 && lastHeading.bottom <= a.top + 1 && !a.heading && a.top - lastHeading.bottom < 40) np = lastHeading.top;
          ps = np; starts.push(ps);
        }
        while (a.bottom > ps + H + 0.5 && (a.img || a.row || a.line || a.size > H)) { if (a.line || a.row) { if (a.size <= H) break; } ps += H; starts.push(ps); }
      }
      if (a.heading) lastHeading = a;
    }
    // drop starts beyond content
    return starts.filter((s) => s < contentBottom - 0.5 || s === 0);
  }

  // ---------- rendering ----------
  async function embedImg(doc, it, cache) {
    const key = it.src || it.canvas || it.svg; if (cache.has(key)) return cache.get(key);
    let emb;
    try {
      if (it.src) {
        const src = it.src.currentSrc || it.src.src;
        if (/^data:image\/jpe?g/i.test(src)) emb = await doc.embedJpg(U.fromB64(src.split(',')[1]));
        else if (/^data:image\/png/i.test(src)) emb = await doc.embedPng(U.fromB64(src.split(',')[1]));
        else { const c = W.canvas(Math.min(2400, it.src.naturalWidth), Math.min(2400, it.src.naturalHeight)); c.getContext('2d').drawImage(it.src, 0, 0, c.width, c.height); emb = await doc.embedPng(new Uint8Array(await (await U.canvasBlob(c)).arrayBuffer())); }
      } else if (it.canvas) emb = await doc.embedPng(new Uint8Array(await (await U.canvasBlob(it.canvas)).arrayBuffer()));
      else if (it.svg) {
        const s = it.svg.cloneNode(true); s.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); if (!s.getAttribute('width')) s.setAttribute('width', it.w); if (!s.getAttribute('height')) s.setAttribute('height', it.h);
        const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(s)); const im = await U.loadImage(url);
        const sc = Math.min(3, 2400 / Math.max(it.w, it.h)); const c = W.canvas(it.w * sc, it.h * sc); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); emb = await doc.embedPng(new Uint8Array(await (await U.canvasBlob(c)).arrayBuffer()));
      }
    } catch (e) { console.warn('image skipped', e); }
    cache.set(key, emb); return emb;
  }
  const WINANSI_EXTRA = new Set();
  async function drawPage(doc, page, items, links, srcY0, srcY1, tx, ty, fonts, cache, ph) {
    const { rgb, degrees } = PDFLib;
    const X = (x) => tx + x * PX, Yb = (y) => ph - ty - (y - srcY0) * PX; // y→pdf (top-left based)
    const col = (c) => rgb(c.r, c.g, c.b);
    for (const it of items) {
      if (it.k === 'rect') {
        const y0 = Math.max(it.y, srcY0), y1 = Math.min(it.y + it.h, srcY1); if (y1 - y0 <= 0.2) continue;
        if (it.rad > 0.5 && y0 === it.y && y1 === it.y + it.h) page.drawSvgPath(rrPath(it.w * PX, it.h * PX, it.rad * PX), { x: X(it.x), y: Yb(it.y), color: col(it.fill), opacity: it.fill.a * it.op, borderWidth: 0 });
        else page.drawRectangle({ x: X(it.x), y: Yb(y1), width: it.w * PX, height: (y1 - y0) * PX, color: col(it.fill), opacity: it.fill.a * it.op });
      } else if (it.k === 'line') {
        const x = it.x, y = it.y, w = it.w, hh = it.h, bw = it.width; let rx, ry, rw, rh;
        if (it.side === 0) { rx = x; ry = y; rw = w; rh = bw; } else if (it.side === 2) { rx = x; ry = y + hh - bw; rw = w; rh = bw; } else if (it.side === 3) { rx = x; ry = y; rw = bw; rh = hh; } else { rx = x + w - bw; ry = y; rw = bw; rh = hh; }
        const y0 = Math.max(ry, srcY0), y1 = Math.min(ry + rh, srcY1); if (y1 - y0 <= 0.01) continue;
        const dashed = it.dash === 'dashed' || it.dash === 'dotted';
        if (!dashed) page.drawRectangle({ x: X(rx), y: Yb(y1), width: rw * PX, height: (y1 - y0) * PX, color: col(it.color), opacity: it.color.a * it.op });
        else { const horiz = rw >= rh; const t = (horiz ? rh : rw) * PX; page.drawLine({ start: { x: X(horiz ? rx : rx + rw / 2), y: Yb(horiz ? ry + rh / 2 : y1) }, end: { x: X(horiz ? rx + rw : rx + rw / 2), y: Yb(horiz ? ry + rh / 2 : y0) }, thickness: t, color: col(it.color), opacity: it.color.a * it.op, dashArray: it.dash === 'dotted' ? [t, t * 1.5] : [t * 3, t * 2] }); }
      } else if (it.k === 'box') {
        if (it.y + it.h < srcY0 || it.y > srcY1) continue;
        page.drawSvgPath(rrPath(it.w * PX, it.h * PX, it.rad * PX), { x: X(it.x), y: Yb(it.y), borderColor: col(it.color), borderWidth: it.width * PX, borderOpacity: it.color.a * it.op, borderDashArray: it.dash === 'dashed' ? [4, 3] : undefined });
      } else if (it.k === 'img') {
        const emb = await embedImg(doc, it, cache); if (!emb) continue;
        page.drawImage(emb, { x: X(it.x), y: Yb(it.y + it.h), width: it.w * PX, height: it.h * PX, opacity: it.op });
      } else if (it.k === 'text') {
        await drawWord(doc, page, it, X, Yb, fonts, cache);
      }
    }
    for (const l of links) { if (l.y < srcY0 - 0.5 || l.y >= srcY1) continue; P.addLink(doc, page, [X(l.x), Yb(l.y + l.h), X(l.x + l.w), Yb(l.y)], l.href); }
  }
  const rrPath = (w, h, r) => `M${r} 0 H${w - r} Q${w} 0 ${w} ${r} V${h - r} Q${w} ${h} ${w - r} ${h} H${r} Q0 ${h} 0 ${h - r} V${r} Q0 0 ${r} 0 Z`;
  async function drawWord(doc, page, it, X, Yb, fonts, cache) {
    const { rgb } = PDFLib; const font = await fonts(it.kind, it.bold, it.italic); const size = it.size * PX; const c = rgb(it.color.r, it.color.g, it.color.b); const opacity = it.color.a * it.op;
    const text = it.text; const y = Yb(it.base);
    if (P.canEncode(font, text)) {
      const t = font.widthOfTextAtSize(text, size);
      page.drawText(text, { x: X(it.x), y, size, font, color: c, opacity });
      if (it.deco && it.deco !== 'none') { const th = Math.max(0.5, size / 16), w = Math.max(t, it.w * PX); if (/underline/.test(it.deco)) page.drawLine({ start: { x: X(it.x), y: y - size * 0.13 }, end: { x: X(it.x) + w, y: y - size * 0.13 }, thickness: th, color: c, opacity }); if (/line-through/.test(it.deco)) page.drawLine({ start: { x: X(it.x), y: y + size * 0.3 }, end: { x: X(it.x) + w, y: y + size * 0.3 }, thickness: th, color: c, opacity }); }
      return;
    }
    // mixed / unsupported glyphs: draw encodable runs as text, the rest as rasterised glyph images measured by the browser
    const chars = Array.from(text); let i = 0; let cx = it.x; const widths = chars.map((ch) => (P.canEncode(font, ch) ? font.widthOfTextAtSize(ch, size) / PX : null));
    const gctx = cache.gctx || (cache.gctx = W.canvas(4, 4).getContext('2d')); gctx.font = it.css;
    const run = [];
    for (const ch of chars) run.push({ ch, ok: P.canEncode(font, ch) });
    let pos = it.x;
    // group
    const groups = []; for (const r of run) { const g = groups[groups.length - 1]; if (g && g.ok === r.ok) g.s += r.ch; else groups.push({ ok: r.ok, s: r.ch }); }
    for (const g of groups) {
      const wPx = g.ok ? font.widthOfTextAtSize(g.s, size) / PX : gctx.measureText(g.s).width;
      if (g.ok) page.drawText(g.s, { x: X(pos), y, size, font, color: c, opacity });
      else {
        const key = g.s + '|' + it.css + '|' + it.color.r + it.color.g + it.color.b; let e = cache.get(key);
        if (!e) { const sc = 4; const cv = W.canvas((wPx + 4) * sc, it.size * 1.6 * sc); const g2 = cv.getContext('2d'); g2.font = it.css.replace(/(\d+(\.\d+)?)px/, (m, n) => parseFloat(n) * sc + 'px'); g2.fillStyle = `rgb(${Math.round(it.color.r * 255)},${Math.round(it.color.g * 255)},${Math.round(it.color.b * 255)})`; g2.textBaseline = 'alphabetic'; g2.fillText(g.s, 2 * sc, it.size * 1.2 * sc); e = { emb: await doc.embedPng(new Uint8Array(await (await U.canvasBlob(cv)).arrayBuffer())), w: cv.width / sc, h: cv.height / sc }; cache.set(key, e); }
        page.drawImage(e.emb, { x: X(pos - 2), y: y - it.size * 0.4 * PX, width: e.w * PX, height: e.h * PX, opacity });
      }
      pos += wPx;
    }
  }

  /**
   * Render an HTML document (string) to PDF.
   * o: { html, widthPx, page:[w,h] pt, margin:[t,r,b,l] pt, pageEls: css selector for fixed-size pages, title, author, numbers, onProgress }
   */
  W.htmlToPdf = async function (o) {
    await W.lib('pdflib');
    const pageSize = o.page || P.SIZES.A4; const m = o.margin || [56.7, 56.7, 56.7, 56.7];
    const contentW = (pageSize[0] - m[1] - m[3]) / PX, contentH = (pageSize[1] - m[0] - m[2]) / PX;
    const fixed = !!o.pageSel;
    const fr = await mountFrame(o.html, fixed ? (o.frameW || 1200) : contentW);
    try {
      const d = fr.contentDocument, win = d.defaultView;
      if (o.normalize !== false) normalizeFonts(d); addListMarkers(d);
      if (o.onProgress) o.onProgress(0.15, 'Measuring layout');
      const out = await P.create(); if (o.title) out.setTitle(o.title); if (o.author) out.setAuthor(o.author);
      const fcache = {}; const fonts = async (k, b, i) => { const key = k + b + i; return fcache[key] || (fcache[key] = await P.std(out, k === 'serif' ? 'Times' : k === 'mono' ? 'Courier' : 'Helvetica', b, i)); };
      const imgCache = new Map();
      if (fixed) {
        const els = Array.from(d.querySelectorAll(o.pageSel)); if (!els.length) throw new Error('Nothing to render.');
        for (let i = 0; i < els.length; i++) {
          const el = els[i]; const r = el.getBoundingClientRect(); const { items, links } = await collect(d, el, { x: r.left, y: r.top }, o);
          const pw = r.width * PX, ph = r.height * PX; const page = out.addPage([pw, ph]);
          const bg = parseColor(win.getComputedStyle(el).backgroundColor); if (bg) page.drawRectangle({ x: 0, y: 0, width: pw, height: ph, color: PDFLib.rgb(bg.r, bg.g, bg.b) });
          await drawPage(out, page, items, links, 0, r.height + 1, 0, 0, fonts, imgCache, ph);
          o.onProgress && o.onProgress(0.2 + 0.75 * (i + 1) / els.length, `Page ${i + 1} of ${els.length}`); await U.tick();
        }
      } else {
        const body = d.body; const br = body.getBoundingClientRect(); const total = Math.max(d.documentElement.scrollHeight, br.height);
        const { items, atoms, links } = await collect(d, body, { x: br.left, y: br.top }, o);
        const textItems = items.filter((t) => t.k === 'text');
        const starts = paginate(atoms, textItems, contentH, total);
        const n = starts.length;
        o.onProgress && o.onProgress(0.4, `Building ${n} page${n > 1 ? 's' : ''}`);
        for (let p = 0; p < n; p++) {
          const y0 = starts[p], y1 = p + 1 < n ? starts[p + 1] : Infinity;
          const page = out.addPage(pageSize);
          const pageItems = items.filter((it) => { if (it.k === 'rect' || it.k === 'box' || it.k === 'line') return it.y + it.h > y0 && it.y < y1 + 0.01; const cy = it.k === 'text' ? it.y + it.h / 2 : it.y + 0.5; return cy >= y0 - 0.01 && cy < y1; });
          await drawPage(out, page, pageItems, links, y0, Math.min(y1, y0 + contentH + 1), m[3], m[0], fonts, imgCache, pageSize[1]);
          if (o.numbers) { const f = await fonts('sans', false, false); const t = `${p + 1} / ${n}`; const w = f.widthOfTextAtSize(t, 9); page.drawText(t, { x: (pageSize[0] - w) / 2, y: m[2] / 2 - 3, size: 9, font: f, color: PDFLib.rgb(0.45, 0.45, 0.45) }); }
          if (p % 3 === 2) { o.onProgress && o.onProgress(0.4 + 0.55 * (p + 1) / n, `Page ${p + 1} of ${n}`); await U.tick(); }
        }
      }
      return await P.save(out);
    } finally { fr.remove(); }
  };
  /** wrap a body fragment into a complete document with the default stylesheet */
  W.wrapDoc = (bodyHtml, { css = '', extraHead = '' } = {}) => `<!doctype html><html><head><meta charset="utf-8"><style>${DOC_CSS}${css}</style>${extraHead}</head><body>${bodyHtml}</body></html>`;
  W.PX = PX;
}
