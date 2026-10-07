// ===== Visual PDF editor (Edit PDF · Sign PDF · Redact PDF share this engine) =====
{
  const CSSFONT = { Helvetica: 'Arial, "Liberation Sans", Helvetica, sans-serif', Times: '"Times New Roman", "Liberation Serif", Times, serif', Courier: '"Courier New", "Liberation Mono", Courier, monospace' };
  const ASC = { Helvetica: 0.905, Times: 0.891, Courier: 0.833 }, DESC = { Helvetica: 0.212, Times: 0.216, Courier: 0.3 };
  const LH = 1.2;
  const baseOff = (fam, size) => ((LH - (ASC[fam] + DESC[fam])) / 2 + ASC[fam]) * size;
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (name, attrs = {}) => { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const TOOLS = {
    select: { icon: 'mouse-pointer-2', label: 'Select', key: 'V' },
    text: { icon: 'type', label: 'Text', key: 'T' },
    edittext: { icon: 'text-cursor-input', label: 'Edit text', key: 'E' },
    draw: { icon: 'pencil', label: 'Draw', key: 'D' },
    highlight: { icon: 'highlighter', label: 'Highlight', key: 'H' },
    rect: { icon: 'square', label: 'Rectangle', key: 'R' },
    ellipse: { icon: 'circle', label: 'Ellipse', key: 'O' },
    line: { icon: 'minus', label: 'Line', key: 'L' },
    arrow: { icon: 'move-up-right', label: 'Arrow', key: 'A' },
    whiteout: { icon: 'eraser', label: 'Whiteout', key: 'W' },
    image: { icon: 'image-plus', label: 'Image', key: 'I' },
    sign: { icon: 'signature', label: 'Signature', key: 'S' },
    stamp: { icon: 'badge-check', label: 'Stamps', key: 'M' },
    redact: { icon: 'square-dashed', label: 'Mark area', key: 'X' },
  };
  const MODES = {
    edit: ['select', 'text', 'edittext', 'draw', 'highlight', 'rect', 'ellipse', 'line', 'arrow', 'whiteout', 'image', 'sign', 'stamp'],
    sign: ['sign', 'select', 'text', 'stamp', 'image', 'draw', 'whiteout'],
    redact: ['redact', 'select'],
  };
  const HL_COLORS = ['#ffe94d', '#7be07b', '#ff8fc4', '#7fc8ff', '#ffb066'];

  class Editor {
    constructor(host, { mode = 'edit', onExport } = {}) {
      this.host = host; this.mode = mode; this.k = 1.25; this.pages = []; this.objs = []; this.imgs = new Map();
      this.sel = null; this.tool = MODES[mode][0]; this.hist = []; this.hpos = -1; this.runs = new Map(); this.onExport = onExport;
      this.style = { color: '#111111', fill: null, stroke: '#d32f2f', sw: 2, size: 16, family: 'Helvetica', bold: false, italic: false, underline: false, align: 'left', opacity: 1, hl: HL_COLORS[0], arrow: false, whiteFill: '#ffffff' };
      this.build();
    }
    build() {
      const tools = MODES[this.mode];
      this.toolbar = h('div.ed-bar', { role: 'toolbar', 'aria-label': 'Editing tools' },
        ...tools.map((t) => h('button.ed-tool', { dataset: { tool: t }, title: `${TOOLS[t].label} (${TOOLS[t].key})`, onclick: () => this.setTool(t), html: ic(TOOLS[t].icon, 17) + `<span>${TOOLS[t].label}</span>` })),
        h('span.og-sep'),
        this.undoBtn = h('button.icon-btn', { title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', html: ic('undo-2', 17), onclick: () => this.undo() }),
        this.redoBtn = h('button.icon-btn', { title: 'Redo (Ctrl+Shift+Z)', 'aria-label': 'Redo', html: ic('redo-2', 17), onclick: () => this.redo() }),
        h('span.og-sep'),
        h('button.icon-btn', { title: 'Zoom out', 'aria-label': 'Zoom out', html: ic('zoom-out', 17), onclick: () => this.zoom(0.85) }),
        this.zoomLbl = h('span.ed-zoom', '100%'),
        h('button.icon-btn', { title: 'Zoom in', 'aria-label': 'Zoom in', html: ic('zoom-in', 17), onclick: () => this.zoom(1.18) }),
        this.pageLbl = h('span.ed-page', ''));
      this.propsEl = h('div.ed-props');
      this.extra = h('div.ed-extra');
      this.pagesEl = h('div.ed-pages', { tabindex: '0' });
      this.root = h('div.ed', { dataset: { tool: this.tool } }, this.toolbar, this.propsEl, this.extra, this.pagesEl);
      this.host.appendChild(this.root);
      this.keyHandler = (e) => this.onKey(e); document.addEventListener('keydown', this.keyHandler);
      this.io = new IntersectionObserver((es) => es.forEach((en) => { const pg = en.target._pg; if (!pg) return; if (en.isIntersecting) this.renderPage(pg); else this.unrenderPage(pg); }), { root: null, rootMargin: '700px 0px' });
      this.vis = new IntersectionObserver((es) => { es.forEach((en) => { en.target._pg.visible = en.intersectionRatio; }); this.updatePageLabel(); }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
      this.syncTools(); this.renderProps();
    }
    destroy() { document.removeEventListener('keydown', this.keyHandler); this.io.disconnect(); this.vis.disconnect(); if (this.pdfjs) this.pdfjs.destroy && this.pdfjs.destroy(); this.root.remove(); }

    // ---------- loading ----------
    async load(item) {
      this.item = item; this.pdfjs = await P.doc(item); this.pagesEl.innerHTML = ''; this.pages = []; this.objs = []; this.sel = null; this.runs.clear(); this.hist = []; this.hpos = -1;
      const n = this.pdfjs.numPages; const sizes = [];
      for (let i = 0; i < n; i += 25) { const part = await Promise.all(Array.from({ length: Math.min(25, n - i) }, (_, j) => this.pdfjs.getPage(i + j + 1))); part.forEach((p) => { const vp = p.getViewport({ scale: 1 }); sizes.push([vp.width, vp.height]); }); }
      this.sizes = sizes;
      const avail = Math.max(300, this.pagesEl.clientWidth || this.host.clientWidth || 900) - 32;
      this.k = U.clamp(avail / Math.max(...sizes.map((s) => s[0])), 0.5, 1.6);
      for (let i = 0; i < n; i++) this.addPageEl(i);
      this.commit(true); this.updateZoomLbl(); this.updatePageLabel();
    }
    addPageEl(i) {
      const [w, hgt] = this.sizes[i];
      const canvas = h('canvas.ep-cv'), et = h('div.et'), svg = svgEl('svg', { class: 'eo-svg', viewBox: `0 0 ${w} ${hgt}`, preserveAspectRatio: 'none' }), html = h('div.eo-html'), sel = h('div.eo-sel');
      const el = h('div.ep', { dataset: { p: i }, style: { width: w * this.k + 'px', height: hgt * this.k + 'px' } }, canvas, et, svg, html, sel, h('div.ep-n', String(i + 1)));
      const pg = { i, w, h: hgt, el, canvas, et, svg, html, sel, rendered: false, visible: 0 };
      el._pg = pg; this.pages.push(pg); this.pagesEl.appendChild(el); this.io.observe(el); this.vis.observe(el);
      el.addEventListener('pointerdown', (e) => this.onDown(e, pg)); el.addEventListener('pointermove', (e) => this.onMove(e, pg)); el.addEventListener('pointerup', (e) => this.onUp(e, pg)); el.addEventListener('pointercancel', (e) => this.onUp(e, pg));
      el.addEventListener('dblclick', (e) => this.onDbl(e, pg));
    }
    async renderPage(pg) {
      if (pg.rendered || pg.rendering) return; pg.rendering = true;
      try {
        const page = await this.pdfjs.getPage(pg.i + 1); const dpr = Math.min(2, window.devicePixelRatio || 1);
        const scale = this.k * dpr; const vp = page.getViewport({ scale });
        pg.canvas.width = Math.ceil(vp.width); pg.canvas.height = Math.ceil(vp.height); pg.canvas.style.width = '100%'; pg.canvas.style.height = '100%';
        const ctx = pg.canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pg.canvas.width, pg.canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, background: '#ffffff' }).promise;
        pg.rendered = true; pg.scale = scale;
        this.objs.filter((o) => o.page === pg.i).forEach((o) => this.draw(o));
        if (this.mode === 'edit' || this.mode === 'sign') this.buildRuns(pg, page);
      } catch (e) { console.warn('render failed', e); } finally { pg.rendering = false; }
    }
    unrenderPage(pg) { if (!pg.rendered) return; pg.canvas.width = pg.canvas.height = 1; pg.rendered = false; }
    zoom(f) { this.k = U.clamp(this.k * f, 0.4, 3); this.relayout(); }
    relayout() {
      this.pages.forEach((pg) => { pg.el.style.width = pg.w * this.k + 'px'; pg.el.style.height = pg.h * this.k + 'px'; pg.rendered = false; pg.canvas.width = pg.canvas.height = 1; pg.et.innerHTML = ''; pg.runsBuilt = false; });
      this.pages.forEach((pg) => { const r = pg.el.getBoundingClientRect(); if (r.bottom > -700 && r.top < innerHeight + 700) this.renderPage(pg); });
      this.objs.forEach((o) => this.draw(o)); this.drawSel(); this.updateZoomLbl();
    }
    updateZoomLbl() { this.zoomLbl.textContent = Math.round(this.k / 1.3333 * 100) + '%'; }
    currentPage() { let best = this.pages[0], bv = -1; for (const p of this.pages) { const r = p.el.getBoundingClientRect(); const vis = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 60)); if (vis > bv) { bv = vis; best = p; } } return best; }
    updatePageLabel() { const p = this.currentPage(); if (p && this.pageLbl) this.pageLbl.textContent = `Page ${p.i + 1} / ${this.pages.length}`; }

    // ---------- tools ----------
    setTool(t) {
      if (t === 'image') { this.pickImage(); return; }
      if (t === 'sign' && this.onSign) { this.onSign(); }
      if (t === 'stamp') { this.openStamps(); return; }
      this.tool = t; this.root.dataset.tool = t; this.select(null); this.syncTools(); this.renderProps();
      if (t === 'edittext') this.pages.forEach((pg) => pg.rendered && !pg.runsBuilt && this.pdfjs.getPage(pg.i + 1).then((p) => this.buildRuns(pg, p)));
    }
    syncTools() { $$('.ed-tool', this.toolbar).forEach((b) => b.classList.toggle('on', b.dataset.tool === this.tool)); this.undoBtn.disabled = this.hpos <= 0; this.redoBtn.disabled = this.hpos >= this.hist.length - 1; }
    async pickImage() {
      const fs = await W.pickFiles({ accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml', multiple: false }); if (!fs[0]) return;
      const im = await U.fileImage(fs[0]); const c = W.canvas(im.naturalWidth, im.naturalHeight); c.getContext('2d').drawImage(im, 0, 0);
      this.addImage(c.toDataURL('image/png'), { w: im.naturalWidth, h: im.naturalHeight });
    }
    addImage(url, { w, h: hh, sig = false, width } = {}) {
      return new Promise(async (res) => {
        if (!w) { const im = await U.loadImage(url); w = im.naturalWidth; hh = im.naturalHeight; }
        const pg = this.currentPage(); const id = U.uid(); this.imgs.set(id, { url, w, h: hh });
        const tw = width || Math.min(pg.w * (sig ? 0.28 : 0.5), 300), th = tw * hh / w; const r = pg.el.getBoundingClientRect();
        const cx = U.clamp(((innerWidth / 2 - r.left) / this.k), tw / 2, pg.w - tw / 2), cy = U.clamp(((innerHeight * 0.45 - r.top) / this.k), th / 2, pg.h - th / 2);
        const o = { id: U.uid(), type: 'image', page: pg.i, x: cx - tw / 2, y: cy - th / 2, w: tw, h: th, imgId: id, opacity: 1, sig };
        this.objs.push(o); this.draw(o); this.commit(); this.setTool('select'); this.select(o.id); res(o);
      });
    }
    openStamps() {
      const items = [['✓', 'Check mark'], ['✗', 'Cross'], ['●', 'Dot'], ['—', 'Dash']];
      const d = new Date(); const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      const m = W.modal({ title: 'Quick stamps', body: h('div.stamp-grid', ...items.map(([g, l]) => h('button.btn', { title: l, style: 'font-size:22px;height:52px', onclick: () => { m.close(); this.addTextAt(g, { size: 22 }); } }, g)), h('button.btn', { style: 'grid-column:span 2', onclick: () => { m.close(); this.addTextAt(date, { size: 12 }); } }, 'Today · ' + date), ['APPROVED', 'DRAFT', 'PAID', 'COPY'].map((t) => h('button.btn', { onclick: () => { m.close(); this.addTextAt(t, { size: 22, bold: true, color: '#c62828', box: true }); } }, t))) });
    }
    addTextAt(text, opts = {}, at) {
      const pg = at ? this.pages[at.page] : this.currentPage(); const r = pg.el.getBoundingClientRect();
      const x = at ? at.x : U.clamp((innerWidth / 2 - r.left) / this.k - 30, 10, pg.w - 40), y = at ? at.y : U.clamp((innerHeight * 0.4 - r.top) / this.k, 10, pg.h - 30);
      const o = Object.assign({ id: U.uid(), type: 'text', page: pg.i, x, y, w: null, text, size: this.style.size, family: this.style.family, bold: this.style.bold, italic: this.style.italic, underline: false, color: this.style.color, align: 'left', opacity: 1 }, opts);
      this.objs.push(o); this.draw(o); this.commit(); this.setTool('select'); this.select(o.id); return o;
    }

    // ---------- pointer interaction ----------
    pt(e, pg) { const r = pg.el.getBoundingClientRect(); return [(e.clientX - r.left) / this.k, (e.clientY - r.top) / this.k]; }
    onDown(e, pg) {
      if (e.button && e.button !== 0) return;
      const tgt = e.target;
      if (tgt.closest && tgt.closest('.etr')) return; // handled by click on text runs
      const editing = tgt.isContentEditable; if (editing) return;
      const [x, y] = this.pt(e, pg);
      const handle = tgt.closest && tgt.closest('[data-h]');
      if (handle && this.sel) { this.drag = { kind: 'resize', h: handle.dataset.h, o: this.get(this.sel), start: [x, y], orig: clone(this.get(this.sel)), pg, moved: false }; pg.el.setPointerCapture(e.pointerId); e.preventDefault(); return; }
      const oid = tgt.closest && tgt.closest('[data-oid]'); const selectLike = this.tool === 'select' || this.tool === 'sign';
      if (selectLike && oid && !oid.classList.contains('locked')) {
        const o = this.get(oid.dataset.oid); this.select(o.id); this.drag = { kind: 'move', o, start: [x, y], orig: clone(o), pg, moved: false }; pg.el.setPointerCapture(e.pointerId); e.preventDefault(); return;
      }
      if (selectLike) { this.select(null); return; }
      if (this.tool === 'text') { const o = this.addTextAt('', {}, { page: pg.i, x, y: y - this.style.size * 0.5 }); this.editText(o.id); e.preventDefault(); return; }
      if (['rect', 'ellipse', 'highlight', 'whiteout', 'redact'].includes(this.tool)) {
        const base = { id: U.uid(), type: this.tool, page: pg.i, x, y, w: 0, h: 0 };
        if (this.tool === 'rect' || this.tool === 'ellipse') Object.assign(base, { fill: this.style.fill, stroke: this.style.stroke, sw: this.style.sw, opacity: 1 });
        if (this.tool === 'highlight') Object.assign(base, { color: this.style.hl, opacity: 0.45 });
        if (this.tool === 'whiteout') Object.assign(base, { fill: this.style.whiteFill });
        this.objs.push(base); this.drag = { kind: 'create', o: base, start: [x, y], pg }; pg.el.setPointerCapture(e.pointerId); e.preventDefault(); return;
      }
      if (this.tool === 'line' || this.tool === 'arrow') {
        const o = { id: U.uid(), type: 'line', page: pg.i, x1: x, y1: y, x2: x, y2: y, stroke: this.style.stroke, sw: this.style.sw, arrow: this.tool === 'arrow', opacity: 1 };
        this.objs.push(o); this.drag = { kind: 'create-line', o, pg }; pg.el.setPointerCapture(e.pointerId); e.preventDefault(); return;
      }
      if (this.tool === 'draw') {
        const o = { id: U.uid(), type: 'draw', page: pg.i, pts: [[x, y]], stroke: this.style.stroke, sw: this.style.sw, opacity: 1 };
        this.objs.push(o); this.drag = { kind: 'draw', o, pg }; pg.el.setPointerCapture(e.pointerId); e.preventDefault(); return;
      }
    }
    onMove(e, pg) {
      const d = this.drag; if (!d) return; const [x, y] = this.pt(e, d.pg); const o = d.o;
      if (d.kind === 'move') {
        const dx = x - d.start[0], dy = y - d.start[1]; if (Math.abs(dx) + Math.abs(dy) > 0.5) d.moved = true;
        this.moveObj(o, d.orig, dx, dy); this.draw(o); this.drawSel();
      } else if (d.kind === 'resize') { d.moved = true; this.resizeObj(o, d.orig, d.h, x, y, e.shiftKey); this.draw(o); this.drawSel(); }
      else if (d.kind === 'create') { o.x = Math.min(d.start[0], x); o.y = Math.min(d.start[1], y); o.w = Math.abs(x - d.start[0]); o.h = Math.abs(y - d.start[1]); this.draw(o); }
      else if (d.kind === 'create-line') { o.x2 = x; o.y2 = y; if (e.shiftKey) { const dx = x - o.x1, dy = y - o.y1; if (Math.abs(dx) > Math.abs(dy)) o.y2 = o.y1; else o.x2 = o.x1; } this.draw(o); }
      else if (d.kind === 'draw') { const l = o.pts[o.pts.length - 1]; if (Math.hypot(x - l[0], y - l[1]) > 0.6) { o.pts.push([x, y]); this.draw(o); } }
    }
    onUp(e, pg) {
      const d = this.drag; if (!d) return; this.drag = null; const o = d.o;
      if (d.kind === 'move' || d.kind === 'resize') { if (d.moved) this.commit(); return; }
      if (d.kind === 'create') { if (o.w < 3 || o.h < 3) { this.removeObj(o.id, true); return; } this.commit(); if (this.tool !== 'highlight' && this.tool !== 'redact') { this.setTool('select'); this.select(o.id); } return; }
      if (d.kind === 'create-line') { if (Math.hypot(o.x2 - o.x1, o.y2 - o.y1) < 4) { this.removeObj(o.id, true); return; } this.commit(); this.setTool('select'); this.select(o.id); return; }
      if (d.kind === 'draw') { if (o.pts.length < 2) o.pts.push([o.pts[0][0] + 0.1, o.pts[0][1] + 0.1]); this.draw(o); this.commit(); }
    }
    onDbl(e, pg) { const t = e.target.closest && e.target.closest('[data-oid]'); if (t && (this.tool === 'select' || this.tool === 'sign')) { const o = this.get(t.dataset.oid); if (o && o.type === 'text') this.editText(o.id); } }
    onKey(e) {
      if (!this.root.isConnected) return; const tg = e.target; if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) { if (e.key === 'Escape' && tg.isContentEditable) tg.blur(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && this.sel) { e.preventDefault(); this.duplicate(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel) { e.preventDefault(); this.removeObj(this.sel); return; }
      if (e.key === 'Escape') { this.select(null); this.setTool(MODES[this.mode][0] === 'sign' ? 'select' : 'select'); return; }
      if (this.sel && e.key.startsWith('Arrow')) { e.preventDefault(); const o = this.get(this.sel); const st = e.shiftKey ? 10 : 1; const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0; this.moveObj(o, clone(o), dx, dy); this.draw(o); this.drawSel(); this.commit(); return; }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) { const t = Object.keys(TOOLS).find((k) => TOOLS[k].key.toLowerCase() === e.key.toLowerCase() && MODES[this.mode].includes(k)); if (t) { e.preventDefault(); this.setTool(t); } }
    }

    // ---------- objects ----------
    get(id) { return this.objs.find((o) => o.id === id); }
    bbox(o) {
      if (o.type === 'line') return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
      if (o.type === 'draw') { const xs = o.pts.map((p) => p[0]), ys = o.pts.map((p) => p[1]); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
      if (o.type === 'text') { const n = o.node; if (n && n.isConnected && this.pages[o.page].rendered !== undefined) { const r = n.getBoundingClientRect(); const pr = this.pages[o.page].el.getBoundingClientRect(); return { x: (r.left - pr.left) / this.k, y: (r.top - pr.top) / this.k, w: r.width / this.k, h: r.height / this.k }; } return { x: o.x, y: o.y, w: o.w || 50, h: o.size * LH }; }
      return { x: o.x, y: o.y, w: o.w, h: o.h };
    }
    moveObj(o, orig, dx, dy) {
      const pg = this.pages[o.page];
      if (o.type === 'line') { o.x1 = orig.x1 + dx; o.y1 = orig.y1 + dy; o.x2 = orig.x2 + dx; o.y2 = orig.y2 + dy; }
      else if (o.type === 'draw') o.pts = orig.pts.map((p) => [p[0] + dx, p[1] + dy]);
      else { o.x = orig.x + dx; o.y = orig.y + dy; }
    }
    resizeObj(o, orig, hnd, x, y, keep) {
      if (o.type === 'line') { if (hnd === 'p1') { o.x1 = x; o.y1 = y; } else { o.x2 = x; o.y2 = y; } return; }
      if (o.type === 'text') { if (hnd.includes('e')) o.w = Math.max(20, x - orig.x); if (hnd.includes('w')) { const nx = Math.min(x, orig.x + (orig.w || 60) - 20); o.w = (orig.w || 60) + (orig.x - nx); o.x = nx; } return; }
      const b = o.type === 'draw' ? this.bbox(orig) : { x: orig.x, y: orig.y, w: orig.w, h: orig.h };
      let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
      if (hnd.includes('w')) x0 = x; if (hnd.includes('e')) x1 = x; if (hnd.includes('n')) y0 = y; if (hnd.includes('s')) y1 = y;
      if (keep && o.type === 'image' && b.w > 0 && b.h > 0) { const ar = b.w / b.h; let nw = Math.abs(x1 - x0), nh = Math.abs(y1 - y0); if (nw / nh > ar) nw = nh * ar; else nh = nw / ar; if (hnd.includes('w')) x0 = x1 - nw; else x1 = x0 + nw; if (hnd.includes('n')) y0 = y1 - nh; else y1 = y0 + nh; }
      const nx = Math.min(x0, x1), ny = Math.min(y0, y1), nw = Math.max(2, Math.abs(x1 - x0)), nh = Math.max(2, Math.abs(y1 - y0));
      if (o.type === 'draw') { const sx = nw / (b.w || 1), sy = nh / (b.h || 1); o.pts = orig.pts.map((p) => [nx + (p[0] - b.x) * sx, ny + (p[1] - b.y) * sy]); }
      else { o.x = nx; o.y = ny; o.w = nw; o.h = nh; }
    }
    select(id) { this.sel = id; this.pages.forEach((p) => { p.sel.innerHTML = ''; }); $$('.eo-sel-on', this.root).forEach((n) => n.classList.remove('eo-sel-on')); this.drawSel(); this.renderProps(); }
    drawSel() {
      const o = this.sel && this.get(this.sel); this.pages.forEach((p) => { p.sel.innerHTML = ''; }); if (!o) return;
      const pg = this.pages[o.page]; const b = this.bbox(o); const k = this.k; if (!b) return;
      if (o.type === 'line') {
        const mk = (n, px, py) => h('i.hd.hd-pt', { dataset: { h: n }, style: { left: px * k + 'px', top: py * k + 'px' } });
        pg.sel.append(mk('p1', o.x1, o.y1), mk('p2', o.x2, o.y2)); return;
      }
      const box = h('div.selbox', { style: { left: b.x * k + 'px', top: b.y * k + 'px', width: b.w * k + 'px', height: b.h * k + 'px' } });
      const hs = o.type === 'text' ? ['w', 'e'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
      hs.forEach((n) => box.appendChild(h('i.hd.hd-' + n, { dataset: { h: n } }))); pg.sel.appendChild(box);
    }
    commit(initial) {
      const snap = JSON.stringify(this.objs.map((o) => { const c = Object.assign({}, o); delete c.node; return c; }));
      if (this.hist[this.hpos] === snap) { this.syncTools(); return; }
      this.hist.length = this.hpos + 1; this.hist.push(snap); if (this.hist.length > 100) this.hist.shift(); this.hpos = this.hist.length - 1; this.syncTools(); this.onChange && this.onChange();
    }
    restore(s) {
      this.pages.forEach((p) => { p.svg.innerHTML = ''; p.html.innerHTML = ''; }); this.objs = JSON.parse(s); this.sel = null; this.objs.forEach((o) => this.draw(o)); this.drawSel(); this.renderProps(); this.syncTools(); this.onChange && this.onChange();
    }
    undo() { if (this.hpos > 0) { this.hpos--; this.restore(this.hist[this.hpos]); } }
    redo() { if (this.hpos < this.hist.length - 1) { this.hpos++; this.restore(this.hist[this.hpos]); } }
    removeObj(id, silent) {
      const o = this.get(id); if (!o) return; const gone = [o]; if (o.cover) { const c = this.get(o.cover); c && gone.push(c); }
      gone.forEach((g) => { g.node && g.node.remove(); g.hit && g.hit.remove(); this.objs.splice(this.objs.indexOf(g), 1); });
      if (this.sel === id) this.sel = null; this.drawSel(); this.renderProps(); if (!silent) this.commit(); else this.syncTools();
    }
    duplicate() { const o = this.get(this.sel); if (!o) return; const c = clone(o); delete c.node; c.id = U.uid(); delete c.cover; if (c.type === 'line') { c.x1 += 12; c.y1 += 12; c.x2 += 12; c.y2 += 12; } else if (c.type === 'draw') c.pts = c.pts.map((p) => [p[0] + 12, p[1] + 12]); else { c.x += 12; c.y += 12; } this.objs.push(c); this.draw(c); this.select(c.id); this.commit(); }

    // ---------- drawing objects to DOM ----------
    draw(o) {
      const pg = this.pages[o.page]; if (!pg) return; const k = this.k;
      const place = (n, layer) => { if (!n.isConnected) layer.appendChild(n); n.dataset.oid = o.id; n.classList.toggle('locked', !!o.locked); o.node = n; };
      switch (o.type) {
        case 'rect': case 'whiteout': case 'highlight': case 'redact': case 'ellipse': {
          const el = o.node && o.node.isConnected ? o.node : svgEl(o.type === 'ellipse' ? 'ellipse' : 'rect');
          if (o.type === 'ellipse') { el.setAttribute('cx', o.x + o.w / 2); el.setAttribute('cy', o.y + o.h / 2); el.setAttribute('rx', o.w / 2); el.setAttribute('ry', o.h / 2); }
          else { el.setAttribute('x', o.x); el.setAttribute('y', o.y); el.setAttribute('width', o.w); el.setAttribute('height', o.h); }
          if (o.type === 'rect' || o.type === 'ellipse') { el.setAttribute('fill', o.fill || 'none'); el.setAttribute('stroke', o.stroke || 'none'); el.setAttribute('stroke-width', o.sw || 0); el.setAttribute('opacity', o.opacity); }
          else if (o.type === 'whiteout') { el.setAttribute('fill', o.fill || '#fff'); }
          else if (o.type === 'highlight') { el.setAttribute('fill', o.color); el.setAttribute('opacity', o.opacity); el.style.mixBlendMode = 'multiply'; }
          else if (o.type === 'redact') { el.setAttribute('fill', 'rgba(0,0,0,.55)'); el.setAttribute('stroke', '#000'); el.setAttribute('stroke-width', 1); el.setAttribute('stroke-dasharray', '4 3'); }
          el.setAttribute('pointer-events', 'all'); place(el, pg.svg); break;
        }
        case 'line': {
          const g = o.node && o.node.isConnected ? o.node : svgEl('g'); g.innerHTML = '';
          const ln = (extra) => svgEl('line', Object.assign({ x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, 'stroke-linecap': 'round' }, extra));
          g.appendChild(ln({ stroke: o.stroke, 'stroke-width': o.sw, opacity: o.opacity }));
          if (o.arrow) { const a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), L = Math.max(8, o.sw * 4.5), w = Math.PI / 7; const p = (t) => `${o.x2 - L * Math.cos(a + t)},${o.y2 - L * Math.sin(a + t)}`; g.appendChild(svgEl('polygon', { points: `${o.x2},${o.y2} ${p(w)} ${p(-w)}`, fill: o.stroke, opacity: o.opacity })); }
          g.appendChild(ln({ stroke: 'transparent', 'stroke-width': Math.max(12, o.sw + 8), 'pointer-events': 'stroke' })); place(g, pg.svg); break;
        }
        case 'draw': {
          const g = o.node && o.node.isConnected ? o.node : svgEl('g'); g.innerHTML = '';
          const d = 'M' + o.pts.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' L');
          g.appendChild(svgEl('path', { d, fill: 'none', stroke: o.stroke, 'stroke-width': o.sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: o.opacity }));
          g.appendChild(svgEl('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(12, o.sw + 8), 'pointer-events': 'stroke' })); place(g, pg.svg); break;
        }
        case 'image': {
          const n = o.node && o.node.isConnected ? o.node : h('img.eo-img', { draggable: 'false', alt: o.sig ? 'Signature' : 'Image' }); const im = this.imgs.get(o.imgId); if (n.getAttribute('src') !== im.url) n.src = im.url;
          Object.assign(n.style, { left: o.x * k + 'px', top: o.y * k + 'px', width: o.w * k + 'px', height: o.h * k + 'px', opacity: o.opacity }); place(n, pg.html); break;
        }
        case 'text': {
          const n = o.node && o.node.isConnected ? o.node : h('div.eo-t', { spellcheck: 'false' });
          if (!n._editing && n.textContent !== o.text) n.textContent = o.text;
          Object.assign(n.style, { left: o.x * k + 'px', top: o.y * k + 'px', fontSize: o.size * k + 'px', fontFamily: CSSFONT[o.family], fontWeight: o.bold ? '700' : '400', fontStyle: o.italic ? 'italic' : 'normal', textDecoration: o.underline ? 'underline' : 'none', color: o.color, textAlign: o.align, opacity: o.opacity, width: o.w ? o.w * k + 'px' : 'auto', whiteSpace: o.w ? 'pre-wrap' : 'pre', lineHeight: LH });
          n.classList.toggle('boxed', !!o.box); if (o.box) n.style.borderColor = o.color;
          if (!n._wired) { n._wired = true; n.addEventListener('input', () => { o.text = n.innerText.replace(/\n$/, ''); this.drawSel(); }); n.addEventListener('blur', () => { n._editing = false; n.contentEditable = 'false'; const t = n.innerText.replace(/\n$/, ''); o.text = t; if (!t.trim()) { this.removeObj(o.id); } else this.commit(); }); n.addEventListener('keydown', (e) => { if (e.key === 'Escape') n.blur(); e.stopPropagation(); }); }
          place(n, pg.html); break;
        }
      }
    }
    editText(id) {
      const o = this.get(id); if (!o || !o.node) return; const n = o.node; n._editing = true; n.contentEditable = 'true'; n.focus();
      const r = document.createRange(); r.selectNodeContents(n); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); this.drawSel();
    }

    // ---------- existing-text editing ----------
    async buildRuns(pg, page) {
      if (pg.runsBuilt) return; pg.runsBuilt = true; pg.et.innerHTML = '';
      let data = this.runs.get(pg.i); if (!data) { data = (await P.text(this.item, { pages: [pg.i] }))[0]; this.runs.set(pg.i, data); }
      // group fragments into runs per baseline
      const items = data.items.filter((t) => t.str.trim()).sort((a, b) => (Math.abs(a.y - b.y) < Math.min(a.size, b.size) * 0.4 ? a.x - b.x : a.y - b.y)); const runs = [];
      for (const t of items) {
        const L = runs[runs.length - 1];
        if (L && Math.abs(L.y - t.y) < Math.max(L.size, t.size) * 0.4 && t.x - L.x2 < Math.max(L.size, t.size) * 0.9) { const gap = t.x - L.x2; L.text += (gap > t.size * 0.15 && !/\s$/.test(L.text) && !/^\s/.test(t.str) ? ' ' : '') + t.str; L.x2 = Math.max(L.x2, t.x + t.w); L.size = Math.max(L.size, t.size); L.items.push(t); }
        else runs.push({ x: t.x, y: t.y, x2: t.x + t.w, size: t.size, text: t.str, items: [t], bold: t.bold, italic: t.italic, mono: t.mono, serif: t.serif });
      }
      const k = this.k;
      runs.forEach((r) => {
        const used = this.objs.some((o) => o.edits && o.edits === pg.i + ':' + r.x.toFixed(1) + ':' + r.y.toFixed(1)); if (used) return;
        const top = (r.y - r.size * 0.85) * k, hh = r.size * 1.05 * k;
        const d = h('div.etr', { title: 'Click to edit this text', style: { left: (r.x - 1) * k + 'px', top: top + 'px', width: (r.x2 - r.x + 2) * k + 'px', height: hh + 'px' }, onclick: (e) => { e.stopPropagation(); this.editRun(pg, r, d); } });
        pg.et.appendChild(d);
      });
    }
    sampleColors(pg, r) {
      const cv = pg.canvas; if (!pg.rendered || cv.width < 10) return { bg: '#ffffff', fg: '#000000' };
      const s = pg.scale, g = cv.getContext('2d'); const x0 = Math.max(0, Math.floor((r.x - 2) * s)), y0 = Math.max(0, Math.floor((r.y - r.size * 0.95) * s)), w = Math.max(2, Math.ceil((r.x2 - r.x + 4) * s)), hh = Math.max(2, Math.ceil(r.size * 1.25 * s));
      let img; try { img = g.getImageData(x0, y0, Math.min(w, cv.width - x0), Math.min(hh, cv.height - y0)).data; } catch { return { bg: '#ffffff', fg: '#000000' }; }
      const counts = new Map(); let dark = null, dl = 999;
      for (let i = 0; i < img.length; i += 4) { const key = ((img[i] >> 4) << 8) | ((img[i + 1] >> 4) << 4) | (img[i + 2] >> 4); counts.set(key, (counts.get(key) || 0) + 1); const l = img[i] * 0.3 + img[i + 1] * 0.59 + img[i + 2] * 0.11; if (l < dl) { dl = l; dark = [img[i], img[i + 1], img[i + 2]]; } }
      let bestK = 0, bc = -1; counts.forEach((c, kk) => { if (c > bc) { bc = c; bestK = kk; } });
      const bgc = [((bestK >> 8) & 15) * 17, ((bestK >> 4) & 15) * 17, (bestK & 15) * 17]; const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
      return { bg: hex(bgc), fg: hex(dark || [0, 0, 0]) };
    }
    editRun(pg, r, node) {
      const col = this.sampleColors(pg, r); const fam = r.mono ? 'Courier' : r.serif ? 'Times' : 'Helvetica';
      const cover = { id: U.uid(), type: 'whiteout', page: pg.i, x: r.x - 1.5, y: r.y - r.size * 0.92, w: r.x2 - r.x + 3, h: r.size * 1.2, fill: col.bg, locked: true };
      const o = { id: U.uid(), type: 'text', page: pg.i, x: r.x, y: r.y - baseOff(fam, r.size), w: null, text: r.text, size: Math.round(r.size * 10) / 10, family: fam, bold: r.bold, italic: r.italic, underline: false, color: col.fg, align: 'left', opacity: 1, cover: cover.id, edits: pg.i + ':' + r.x.toFixed(1) + ':' + r.y.toFixed(1) };
      this.objs.push(cover, o); this.draw(cover); this.draw(o); node.remove(); this.commit(); this.setTool('select'); this.select(o.id); this.editText(o.id);
    }

    // ---------- properties bar ----------
    renderProps() {
      const el = this.propsEl; el.innerHTML = ''; const o = this.sel && this.get(this.sel); const t = o ? o.type : this.tool; const S = this.style;
      const tgt = o || null;
      const set = (k, v, styleKey) => { if (tgt) { tgt[k] = v; this.draw(tgt); this.drawSel(); this.commit(); } if (styleKey !== false) S[styleKey || k] = v; };
      const color = (label, key, val, { none } = {}) => { const wrap = h('label.pr-c', { title: label }, h('span', label)); const inp = h('input', { type: 'color', value: val || '#000000', oninput: () => { set(key, inp.value, key === 'color' ? 'color' : key === 'stroke' ? 'stroke' : key === 'fill' ? 'fill' : key === 'color_hl' ? 'hl' : undefined); } }); wrap.appendChild(inp); if (none) wrap.appendChild(h('button.btn.sm.ghost', { type: 'button', onclick: (e) => { e.preventDefault(); set(key, null, 'fill'); this.renderProps(); } }, 'None')); return wrap; };
      const num = (label, key, val, min, max, step = 1, styleKey) => h('label.pr-n', h('span', label), h('input.in.sm', { type: 'number', min, max, step, value: val, style: 'width:68px', oninput: (e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) set(key, v, styleKey); } }));
      const sel = (label, key, val, opts) => h('label.pr-n', h('span', label), h('select.in.sm', { onchange: (e) => set(key, e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l))));
      const tog = (label, ic2, key, val, title) => h('button.icon-btn' + (val ? '.on' : ''), { title, 'aria-label': title, 'aria-pressed': String(!!val), html: label || ic(ic2, 16), onclick: () => { set(key, !val); this.renderProps(); } });
      const items = [];
      const isText = t === 'text' || t === 'edittext';
      if (isText) {
        const v = tgt || S;
        items.push(sel('Font', 'family', v.family, [['Helvetica', 'Sans'], ['Times', 'Serif'], ['Courier', 'Mono']]), num('Size', 'size', v.size, 6, 200, 1), tog('<b>B</b>', '', 'bold', v.bold, 'Bold'), tog('<i>I</i>', '', 'italic', v.italic, 'Italic'), tog('<u>U</u>', '', 'underline', tgt ? tgt.underline : false, 'Underline'),
          tgt ? sel('Align', 'align', tgt.align, [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]) : null, color('Colour', 'color', v.color));
      } else if (t === 'rect' || t === 'ellipse') { const v = tgt || S; items.push(color('Outline', 'stroke', v.stroke), color('Fill', 'fill', v.fill || '#ffffff', { none: true }), num('Width', 'sw', v.sw, 0, 40, 0.5), tgt ? num('Opacity %', 'opacity', Math.round(tgt.opacity * 100), 5, 100, 5) : null); }
      else if (t === 'line' || t === 'draw') { const v = tgt || S; items.push(color('Colour', 'stroke', v.stroke), num('Width', 'sw', v.sw, 0.5, 40, 0.5), t === 'line' && tgt ? tog('', 'move-up-right', 'arrow', tgt.arrow, 'Arrowhead') : null); }
      else if (t === 'highlight') { items.push(h('div.pr-sw', HL_COLORS.map((c) => h('button.swatch' + (((tgt && tgt.color) || S.hl) === c ? '.on' : ''), { style: `background:${c}`, 'aria-label': 'Highlight colour ' + c, onclick: () => { if (tgt) { tgt.color = c; this.draw(tgt); this.commit(); } S.hl = c; this.renderProps(); } })))); }
      else if (t === 'whiteout') items.push(color('Cover colour', 'fill', (tgt && tgt.fill) || S.whiteFill, {}), h('span.muted.small', 'Covers content visually. To remove it for good, use Redact PDF.'));
      else if (t === 'image') items.push(num('Opacity %', 'opacity', Math.round((tgt ? tgt.opacity : 1) * 100), 5, 100, 5));
      else if (t === 'redact') items.push(h('span.muted.small', 'Drag over anything to mark it. Marked areas are blacked out and removed when you apply.'));
      else if (t === 'select' && !tgt) items.push(h('span.muted.small', 'Click an object to select it · drag to move · double-click text to edit · Delete removes.'));
      if (this.tool === 'edittext' && !tgt) items.push(h('span.muted.small', 'Click any text on the page to change it.'));
      if (tgt) items.push(h('span.og-sep'), h('button.btn.sm', { onclick: () => this.duplicate(), html: ic('copy', 14) + '<span>Duplicate</span>' }), h('button.btn.sm.danger-o', { onclick: () => this.removeObj(this.sel), html: ic('trash-2', 14) + '<span>Delete</span>' }));
      items.filter(Boolean).forEach((i) => el.appendChild(i)); el.hidden = !el.children.length;
    }

    // ---------- export ----------
    hasChanges() { return this.objs.length > 0; }
    async save(onProgress) {
      const doc = await P.load(this.item); const { degrees, rgb, BlendMode, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = PDFLib;
      const byPage = new Map(); this.objs.forEach((o) => { (byPage.get(o.page) || byPage.set(o.page, []).get(o.page)).push(o); });
      const pagesIdx = [...byPage.keys()].sort((a, b) => a - b); let done = 0; const imgCache = new Map();
      for (const pi of pagesIdx) {
        const page = doc.getPage(pi); const info = P.viewInfo(page); const [vw, vh] = [info.w, info.h];
        const inv = invAff(info.m); page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...inv));
        const Y = (y, hh = 0) => vh - y - hh;
        for (const o of byPage.get(pi)) {
          const op = o.opacity == null ? 1 : o.opacity;
          switch (o.type) {
            case 'whiteout': page.drawRectangle({ x: o.x, y: Y(o.y, o.h), width: o.w, height: o.h, color: await P.rgb(o.fill || '#ffffff') }); break;
            case 'rect': page.drawRectangle({ x: o.x, y: Y(o.y, o.h), width: o.w, height: o.h, color: o.fill ? await P.rgb(o.fill) : undefined, borderColor: o.stroke ? await P.rgb(o.stroke) : undefined, borderWidth: o.stroke ? o.sw : 0, opacity: op, borderOpacity: op }); break;
            case 'ellipse': page.drawEllipse({ x: o.x + o.w / 2, y: Y(o.y, o.h) + o.h / 2, xScale: o.w / 2, yScale: o.h / 2, color: o.fill ? await P.rgb(o.fill) : undefined, borderColor: o.stroke ? await P.rgb(o.stroke) : undefined, borderWidth: o.stroke ? o.sw : 0, opacity: op, borderOpacity: op }); break;
            case 'highlight': page.drawRectangle({ x: o.x, y: Y(o.y, o.h), width: o.w, height: o.h, color: await P.rgb(o.color), opacity: o.opacity, blendMode: BlendMode.Multiply }); break;
            case 'line': {
              const c = await P.rgb(o.stroke); page.drawLine({ start: { x: o.x1, y: Y(o.y1) }, end: { x: o.x2, y: Y(o.y2) }, thickness: o.sw, color: c, opacity: op, lineCap: 1 });
              if (o.arrow) { const a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), L = Math.max(8, o.sw * 4.5), w = Math.PI / 7; const pts = [[o.x2, o.y2], [o.x2 - L * Math.cos(a + w), o.y2 - L * Math.sin(a + w)], [o.x2 - L * Math.cos(a - w), o.y2 - L * Math.sin(a - w)]]; page.drawSvgPath(`M${pts[0][0]} ${pts[0][1]} L${pts[1][0]} ${pts[1][1]} L${pts[2][0]} ${pts[2][1]} Z`, { x: 0, y: vh, color: c, borderWidth: 0, opacity: op }); }
              break;
            }
            case 'draw': { const d = 'M' + o.pts.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' L'); page.drawSvgPath(d, { x: 0, y: vh, borderColor: await P.rgb(o.stroke), borderWidth: o.sw, borderOpacity: op, borderLineCap: 1 }); break; }
            case 'image': {
              const im = this.imgs.get(o.imgId); let emb = imgCache.get(o.imgId);
              if (!emb) { const bytes = U.fromB64(im.url.split(',')[1]); emb = /png/.test(im.url.slice(0, 20)) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes); imgCache.set(o.imgId, emb); }
              page.drawImage(emb, { x: o.x, y: Y(o.y, o.h), width: o.w, height: o.h, opacity: op }); break;
            }
            case 'text': {
              if (!o.text) break; const size = o.size; const lines = []; const font = await P.std(doc, o.family, o.bold, o.italic);
              const measure = (s) => (P.canEncode(font, s) ? font.widthOfTextAtSize(s, size) : s.length * size * 0.55);
              for (const para of o.text.split('\n')) { if (!o.w) { lines.push(para); continue; } let cur = ''; for (const wd of para.split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (measure(t) > o.w && cur) { lines.push(cur); cur = wd; } else cur = t; } lines.push(cur); }
              const b = baseOff(o.family, size); let maxW = 0; lines.forEach((l) => (maxW = Math.max(maxW, measure(l))));
              for (let i = 0; i < lines.length; i++) {
                const lw = measure(lines[i]); const bx = o.w || maxW; const x = o.align === 'center' ? o.x + (bx - lw) / 2 : o.align === 'right' ? o.x + bx - lw : o.x;
                const y = Y(o.y + b + i * size * LH);
                await P.drawText(doc, page, lines[i], { x, y, size, family: o.family, bold: o.bold, italic: o.italic, color: o.color, opacity: op });
                if (o.underline && lines[i]) page.drawLine({ start: { x, y: y - size * 0.12 }, end: { x: x + lw, y: y - size * 0.12 }, thickness: Math.max(0.5, size / 18), color: await P.rgb(o.color), opacity: op });
              }
              if (o.box) { const hh = lines.length * size * LH; page.drawRectangle({ x: o.x - 4, y: Y(o.y - 2, hh + 4), width: maxW + 8, height: hh + 4, borderColor: await P.rgb(o.color), borderWidth: 1.5, opacity: 0 , borderOpacity: op }); }
              break;
            }
          }
        }
        page.pushOperators(popGraphicsState());
        onProgress && onProgress(++done / pagesIdx.length);
        if (done % 5 === 0) await U.tick();
      }
      return P.save(doc);
    }
  }
  const invAff = (m) => { const [a, b, c, d, e, f] = m; const det = a * d - b * c; return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]; };
  W.Editor = Editor; W.EDITOR_TOOLS = TOOLS; W.invAff = invAff;
}
