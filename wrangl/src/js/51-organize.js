// ===== Organize pages (visual), Crop & resize, Compress =====
{
  const PDF_FILES = { accept: '.pdf,application/pdf', kind: 'pdf' };

  // ================= ORGANIZE =================
  W.tool({
    id: 'organize', cat: 'pages', name: 'Organize pages', icon: 'layout-panel-top',
    desc: 'Reorder, remove, rotate, and restore pages.', keys: 'rearrange reorder delete remove insert blank duplicate drag thumbnails sort pages',
    async render(root) {
      let pages = []; // {id, item, idx, rot, blank}
      let removed = [];
      const sel = new Set(); let lastClicked = -1;
      const hist = []; let hpos = -1;
      const files = new Map(); // Item.id -> Item
      let busy = false;
      const prog = W.progress(); const results = h('div.results');
      const fl = W.dropzone({ accept: '.pdf,application/pdf', multiple: true, title: 'Drop PDFs to organize', hint: 'You can add several; pages from all of them end up in one grid', onFiles: addFiles });
      const gridHost = h('div.og-host', { hidden: true });
      const toolbar = h('div.og-bar');
      const grid = h('div.og-grid', { tabindex: '0', 'aria-label': 'Pages' });
      const removedBox = h('div.og-removed', { hidden: true });
      const info = h('div.small.muted');
      const exportBtn = h('button.btn.primary.lg', { html: ic('download', 18) + '<span>Save organized PDF</span>', onclick: exportPdf });
      gridHost.append(toolbar, info, grid, removedBox, h('div.action-wrap', h('div.actions', exportBtn, h('button.btn.ghost', { onclick: () => { pages = []; removed = []; sel.clear(); hist.length = 0; hpos = -1; files.clear(); update(); } }, 'Start over'))));
      root.append(h('section.card.pad', h('h3.card-h', h('span.step', '1'), 'Choose your PDF'), fl), gridHost, prog.el, results);
      const carried = W.takeCarry('organize'); if (carried.length) await addFiles(carried);

      const snap = () => JSON.stringify({ p: pages.map((x) => [x.id, x.item ? x.item.id : null, x.idx, x.rot, x.blank]), r: removed.map((x) => [x.id, x.item ? x.item.id : null, x.idx, x.rot, x.blank]) });
      const restore = (s) => { const d = JSON.parse(s); const mk = (a) => ({ id: a[0], item: a[1] ? files.get(a[1]) : null, idx: a[2], rot: a[3], blank: a[4] }); pages = d.p.map(mk); removed = d.r.map(mk); sel.clear(); update(true); };
      const commit = () => { hist.length = hpos + 1; hist.push(snap()); if (hist.length > 60) hist.shift(); hpos = hist.length - 1; update(); };
      const undo = () => { if (hpos > 0) { hpos--; restore(hist[hpos]); } };
      const redo = () => { if (hpos < hist.length - 1) { hpos++; restore(hist[hpos]); } };

      async function addFiles(fs) {
        for (const f of fs) {
          const it = new W.Item(f);
          try { await P.prepare(it); } catch (e) { if (!e.cancelled) W.toast(`“${f.name}” can’t be read as a PDF.`, 'err'); continue; }
          files.set(it.id, it);
          for (let i = 0; i < it.info.pages; i++) pages.push({ id: U.uid(), item: it, idx: i, rot: 0 });
        }
        if (!hist.length) { hist.push(snap()); hpos = 0; }
        commit(); gridHost.hidden = !pages.length; fl.hidden = pages.length > 0 && false;
      }
      const sizeOf = (p) => p.blank ? p.blank : (() => { const it = p.item; return [it.info.pw, it.info.ph]; })();

      function update(noCommitHist) {
        gridHost.hidden = !pages.length && !removed.length; fl.classList.toggle('compact', pages.length > 0);
        toolbar.innerHTML = '';
        const b = (icon, label, fn, { dis, title, danger } = {}) => h('button.btn.sm' + (danger ? '.danger-o' : ''), { disabled: !!dis, title: title || label, onclick: fn, html: ic(icon, 15) + '<span>' + label + '</span>' });
        const anySel = sel.size > 0;
        toolbar.append(
          b('undo-2', 'Undo', undo, { dis: hpos <= 0 }), b('redo-2', 'Redo', redo, { dis: hpos >= hist.length - 1 }), h('span.og-sep'),
          b('square-check-big', sel.size === pages.length && pages.length ? 'Select none' : 'Select all', () => { if (sel.size === pages.length) sel.clear(); else pages.forEach((p) => sel.add(p.id)); update(); }),
          b('rotate-ccw', 'Rotate left', () => rotate(-90), { dis: !anySel, title: 'Rotate selected pages left' }),
          b('rotate-cw', 'Rotate right', () => rotate(90), { dis: !anySel, title: 'Rotate selected pages right' }),
          b('copy', 'Duplicate', duplicate, { dis: !anySel }),
          b('trash-2', 'Remove', removeSel, { dis: !anySel }),
          h('span.og-sep'),
          b('file-plus', 'Blank page', addBlank, { title: 'Insert a blank page after the selection (or at the end)' }),
          b('arrow-up-down', 'Reverse', () => { pages.reverse(); commit(); }),
          b('file-input', 'Add PDF…', async () => { const f = await W.pickFiles({ accept: '.pdf,application/pdf', multiple: true }); if (f.length) addFiles(f); }));
        info.textContent = `${U.plural(pages.length, 'page')}${anySel ? ` · ${sel.size} selected` : ''}${removed.length ? ` · ${removed.length} removed` : ''} — drag to reorder, click to select (Shift for ranges).`;
        renderGrid(); renderRemoved();
      }
      function renderGrid() {
        grid.innerHTML = '';
        const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); e.target._load && e.target._load(); } }), { rootMargin: '300px' });
        pages.forEach((p, i) => grid.appendChild(card(p, i, io)));
      }
      function card(p, i, io) {
        const [pw, ph] = sizeOf(p); const rot = ((p.rot % 360) + 360) % 360; const swap = rot === 90 || rot === 270;
        const ratio = swap ? pw / ph : ph / pw;
        const th = h('div.og-th', { style: `aspect-ratio:${(swap ? ph / pw : pw / ph).toFixed(4)}` });
        const inner = h('div.og-inner');
        th.appendChild(inner);
        if (p.blank) inner.classList.add('blank');
        else {
          if (swap) inner.style.setProperty('--iw', (pw / ph * 100).toFixed(2) + '%');
          inner.style.setProperty('--rot', rot + 'deg'); inner.classList.toggle('rotated', rot !== 0); inner.classList.toggle('swap', swap);
          th._load = () => P.thumb(p.item, p.idx, 170).then((img) => { inner.innerHTML = ''; inner.appendChild(img); }).catch(() => { });
          io.observe(th);
        }
        const c = h('div.og-card' + (sel.has(p.id) ? '.sel' : ''), { draggable: 'true', dataset: { id: p.id }, tabindex: '-1' },
          th, h('div.og-num', String(i + 1)), p.blank ? h('div.og-lbl', 'Blank') : (files.size > 1 ? h('div.og-lbl', { title: p.item.name }, p.item.name.slice(0, 14)) : null),
          h('div.og-tools', h('button.icon-btn', { title: 'Rotate left', 'aria-label': 'Rotate page ' + (i + 1) + ' left', html: ic('rotate-ccw', 14), onclick: (e) => { e.stopPropagation(); p.rot -= 90; commit(); } }),
            h('button.icon-btn', { title: 'Rotate right', 'aria-label': 'Rotate page ' + (i + 1) + ' right', html: ic('rotate-cw', 14), onclick: (e) => { e.stopPropagation(); p.rot += 90; commit(); } }),
            h('button.icon-btn', { title: 'Remove', 'aria-label': 'Remove page ' + (i + 1), html: ic('trash-2', 14), onclick: (e) => { e.stopPropagation(); removed.unshift(...pages.splice(i, 1)); sel.delete(p.id); commit(); } })),
          h('span.og-check', { html: ic('check', 14) }));
        c.addEventListener('click', (e) => {
          if (e.shiftKey && lastClicked >= 0) { const [a, b] = [Math.min(lastClicked, i), Math.max(lastClicked, i)]; for (let k = a; k <= b; k++) sel.add(pages[k].id); }
          else if (e.ctrlKey || e.metaKey || sel.size) { if (sel.has(p.id)) sel.delete(p.id); else sel.add(p.id); }
          else sel.add(p.id);
          lastClicked = i; update();
        });
        c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-wrangl-page', p.id); e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging'); if (!sel.has(p.id)) { sel.clear(); } });
        c.addEventListener('dragend', () => { c.classList.remove('dragging'); $$('.og-card.dropb,.og-card.dropa', grid).forEach((x) => x.classList.remove('dropb', 'dropa')); });
        c.addEventListener('dragover', (e) => { if (!Array.from(e.dataTransfer.types).includes('text/x-wrangl-page')) return; e.preventDefault(); const r = c.getBoundingClientRect(); const after = e.clientX > r.left + r.width / 2; c.classList.toggle('dropa', after); c.classList.toggle('dropb', !after); });
        c.addEventListener('dragleave', () => c.classList.remove('dropa', 'dropb'));
        c.addEventListener('drop', (e) => {
          const id = e.dataTransfer.getData('text/x-wrangl-page'); if (!id) return; e.preventDefault(); e.stopPropagation();
          const r = c.getBoundingClientRect(); const after = e.clientX > r.left + r.width / 2;
          const moving = sel.has(id) ? pages.filter((x) => sel.has(x.id)) : [pages.find((x) => x.id === id)];
          const ids = new Set(moving.map((x) => x.id)); if (ids.has(p.id)) return;
          const rest = pages.filter((x) => !ids.has(x.id)); let at = rest.findIndex((x) => x.id === p.id); if (after) at++;
          rest.splice(at, 0, ...moving); pages = rest; commit();
        });
        return c;
      }
      function renderRemoved() {
        removedBox.hidden = !removed.length; removedBox.innerHTML = '';
        if (!removed.length) return;
        removedBox.append(h('div.og-rh', h('b', 'Removed pages'), h('span.muted.small', 'Click a page to put it back'), h('button.btn.sm.ghost', { onclick: () => { removed.forEach((r) => pages.push(r)); removed = []; commit(); } }, 'Restore all')));
        const row = h('div.og-rrow'); removedBox.appendChild(row);
        removed.forEach((r, i) => {
          const th = h('div.og-rth', { title: 'Restore', onclick: () => { removed.splice(i, 1); pages.push(r); commit(); } }, h('span.og-rnum', r.blank ? '∅' : (r.item.name.slice(0, 8) + ' p' + (r.idx + 1))));
          if (!r.blank) P.thumb(r.item, r.idx, 80).then((img) => th.prepend(img)).catch(() => { });
          row.appendChild(th);
        });
      }
      function rotate(d) { pages.forEach((p) => { if (sel.has(p.id)) p.rot += d; }); commit(); }
      function duplicate() { const out = []; pages.forEach((p) => { out.push(p); if (sel.has(p.id)) out.push(Object.assign({}, p, { id: U.uid() })); }); pages = out; commit(); }
      function removeSel() { const keep = []; pages.forEach((p) => { (sel.has(p.id) ? removed : keep)[sel.has(p.id) ? 'unshift' : 'push'](p); }); pages = keep; sel.clear(); commit(); }
      function addBlank() {
        const ref = (sel.size ? pages.filter((p) => sel.has(p.id)).pop() : pages[pages.length - 1]); const at = ref ? pages.indexOf(ref) + 1 : pages.length;
        const [w, h2] = ref ? sizeOf(ref) : [595.28, 841.89]; pages.splice(at, 0, { id: U.uid(), item: null, idx: 0, rot: 0, blank: [w, h2] }); commit();
      }
      grid.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) { e.preventDefault(); removeSel(); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); pages.forEach((p) => sel.add(p.id)); update(); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      });
      grid.addEventListener('click', (e) => { if (e.target === grid) { sel.clear(); update(); } });

      async function exportPdf() {
        if (busy) return; if (!pages.length) { W.toast('There are no pages left to save.', 'err'); return; }
        busy = true; exportBtn.disabled = true; results.innerHTML = ''; prog.set(null, 'Building your PDF…');
        try {
          const out = await P.create(); const docs = new Map(); const { degrees } = PDFLib;
          for (let i = 0; i < pages.length; i++) {
            const p = pages[i]; prog.set(i / pages.length, `Page ${i + 1} of ${pages.length}`);
            if (p.blank) { out.addPage(p.blank); continue; }
            let d = docs.get(p.item.id); if (!d) { d = await P.load(p.item); docs.set(p.item.id, d); }
            const [cp] = await out.copyPages(d, [p.idx]); out.addPage(cp);
            const r = ((cp.getRotation().angle + p.rot) % 360 + 360) % 360; if (p.rot) cp.setRotation(degrees(r));
            if (i % 20 === 19) await U.tick();
          }
          const first = [...files.values()][0];
          const name = files.size === 1 ? P.suffixName(first, '-organized') : 'organized.pdf';
          const res = [P.outPdf(await P.save(out), name)];
          prog.hide(); await W.showResults(results, res, { tool: W.byId.organize, note: `${U.plural(pages.length, 'page')}` });
        } catch (e) { prog.hide(); console.error(e); results.innerHTML = ''; results.appendChild(h('div.errbox', h('b', 'Something went wrong'), h('p', W.friendlyError(e)))); }
        finally { busy = false; exportBtn.disabled = false; }
      }
    },
  });

  // ================= CROP & RESIZE =================
  const inv = (m, x, y) => { const [a, b, c, d, e, f] = m; const det = a * d - b * c; const X = x - e, Y = y - f; return [(d * X - c * Y) / det, (-b * X + a * Y) / det]; };
  W.simpleTool({
    id: 'crop-resize', cat: 'pages', name: 'Crop & resize', icon: 'crop', action: 'Apply', actionIcon: 'crop',
    desc: 'Trim margins and fit pages to a new size.', keys: 'trim margins whitespace page size a4 letter scale fit paper',
    files: Object.assign({ multi: false, title: 'Drop a PDF to crop or resize' }, PDF_FILES),
    opts: [
      { id: 'mode', type: 'seg', label: 'What do you want to do?', options: [['crop', 'Crop margins'], ['resize', 'Resize pages']], value: 'crop' },
      { type: 'row', show: (v) => v.mode === 'crop', children: [
        { id: 'top', type: 'number', label: 'Top', value: 0, min: 0, step: 0.5, unit: 'mm' }, { id: 'bottom', type: 'number', label: 'Bottom', value: 0, min: 0, step: 0.5, unit: 'mm' },
        { id: 'left', type: 'number', label: 'Left', value: 0, min: 0, step: 0.5, unit: 'mm' }, { id: 'right', type: 'number', label: 'Right', value: 0, min: 0, step: 0.5, unit: 'mm' }] },
      { id: 'size', type: 'select', label: 'New page size', options: [...P.sizeOpts, ['custom', 'Custom…']], value: 'A4', show: (v) => v.mode === 'resize' },
      { type: 'row', show: (v) => v.mode === 'resize' && v.size === 'custom', children: [{ id: 'cw', type: 'number', label: 'Width', value: 210, min: 10, unit: 'mm' }, { id: 'ch', type: 'number', label: 'Height', value: 297, min: 10, unit: 'mm' }] },
      { id: 'orient', type: 'seg', label: 'Orientation', options: [['keep', 'Keep each page’s'], ['portrait', 'Portrait'], ['landscape', 'Landscape']], value: 'keep', show: (v) => v.mode === 'resize' },
      { id: 'fit', type: 'seg', label: 'Content', options: [['contain', 'Scale to fit'], ['cover', 'Scale to fill (crop edges)'], ['none', 'Keep original size']], value: 'contain', show: (v) => v.mode === 'resize' },
      { id: 'bg', type: 'color', label: 'Background where the page is smaller', value: '#ffffff', show: (v) => v.mode === 'resize' },
      P.pagesField(),
    ],
    setup(root, api) {
      const wrap = h('section.card.pad.crop-card', { hidden: true }, h('h3.card-h', 'Preview'),
        h('div.row.gap.wrap', h('button.btn.sm', { onclick: autoDetect, html: ic('scan-search', 15) + '<span>Auto-detect margins</span>' }), h('button.btn.sm.ghost', { onclick: () => { ['top', 'bottom', 'left', 'right'].forEach((k) => api.setOpt(k, 0)); } }, 'Reset'), h('span.muted.small', 'Drag the edges of the frame, or type values below.')),
        h('div.crop-stage'));
      api.panelHost.appendChild(wrap);
      const stage = $('.crop-stage', wrap); let dims = null; let img = null; let rect = null;
      api.draw = async () => {
        const it = api.fl.items[0]; if (!it) { wrap.hidden = true; return; }
        wrap.hidden = api.vals.mode !== 'crop'; if (wrap.hidden) return;
        if (!stage._it || stage._it !== it) {
          stage._it = it; stage.innerHTML = '';
          const c = await P.renderPage(it, 0, { width: 560 }); c.className = 'crop-img'; dims = { w: it.info.pw, h: it.info.ph };
          rect = h('div.crop-rect', ...['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((k) => h('i.ch.ch-' + k, { dataset: { k } })));
          stage.append(c, h('div.crop-shade'), rect); img = c; wire();
        }
        place();
      };
      const mm = (pt) => pt * 25.4 / 72;
      function place() {
        if (!rect || !dims) return; const v = api.vals; const W_ = mm(dims.w), H_ = mm(dims.h);
        rect.style.left = (v.left / W_ * 100) + '%'; rect.style.right = (v.right / W_ * 100) + '%'; rect.style.top = (v.top / H_ * 100) + '%'; rect.style.bottom = (v.bottom / H_ * 100) + '%';
      }
      function wire() {
        let drag = null;
        rect.addEventListener('pointerdown', (e) => { const k = e.target.dataset && e.target.dataset.k; if (!k) return; e.preventDefault(); rect.setPointerCapture(e.pointerId); drag = { k, r: stage.getBoundingClientRect() }; });
        rect.addEventListener('pointermove', (e) => {
          if (!drag) return; const { k, r } = drag; const W_ = mm(dims.w), H_ = mm(dims.h);
          const fx = U.clamp((e.clientX - r.left) / r.width, 0, 1), fy = U.clamp((e.clientY - r.top) / r.height, 0, 1);
          const set = (id, val) => api.setOpt(id, Math.max(0, Math.round(val * 2) / 2));
          if (k.includes('w')) set('left', Math.min(fx * W_, W_ - api.vals.right - 5));
          if (k.includes('e')) set('right', Math.min((1 - fx) * W_, W_ - api.vals.left - 5));
          if (k.includes('n')) set('top', Math.min(fy * H_, H_ - api.vals.bottom - 5));
          if (k.includes('s')) set('bottom', Math.min((1 - fy) * H_, H_ - api.vals.top - 5));
        });
        rect.addEventListener('pointerup', () => { drag = null; });
      }
      async function autoDetect() {
        const it = api.fl.items[0]; if (!it) return;
        let sel; try { sel = W.parseRanges(api.vals.pages, it.info.pages); } catch { sel = [0]; }
        const take = sel.slice(0, 6); let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, cw = 0, ch = 0;
        for (const i of take) {
          const c = await P.renderPage(it, i, { width: 600 }); cw = c.width; ch = c.height;
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const o = (y * c.width + x) * 4; if (d[o + 3] > 10 && (d[o] < 238 || d[o + 1] < 238 || d[o + 2] < 238)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
        }
        if (x1 < 0) { W.toast('That page looks blank.', 'info'); return; }
        const pad = 6, W_ = mm(it.info.pw), H_ = mm(it.info.ph), r = (v, tot, pxTot) => Math.max(0, Math.round((v / pxTot * tot) * 2) / 2);
        api.setOpt('left', r(Math.max(0, x0 - pad), W_, cw)); api.setOpt('right', r(Math.max(0, cw - x1 - pad), W_, cw));
        api.setOpt('top', r(Math.max(0, y0 - pad), H_, ch)); api.setOpt('bottom', r(Math.max(0, ch - y1 - pad), H_, ch));
      }
    },
    onFiles: (items, api) => api.draw && api.draw(),
    onOpt: (v, id, api) => api.draw && api.draw(),
    async run(items, o, ctx) {
      const it = items[0]; const src = await P.load(it); const n = src.getPageCount(); const sel = new Set(W.parseRanges(o.pages, n));
      if (o.mode === 'crop') {
        const [mt, mb, ml, mr] = [o.top, o.bottom, o.left, o.right].map(U.mmToPt);
        if (!(mt || mb || ml || mr)) throw new Error('Set at least one margin to crop (or use Auto-detect).');
        sel.forEach((i) => {
          const pg = src.getPage(i); const info = P.viewInfo(pg);
          if (ml + mr >= info.w - 10 || mt + mb >= info.h - 10) throw new Error(`Page ${i + 1} would have no content left — use smaller margins.`);
          const [ax, ay] = inv(info.m, ml, mb), [bx, by] = inv(info.m, info.w - mr, info.h - mt);
          const x = Math.min(ax, bx), y = Math.min(ay, by), w = Math.abs(bx - ax), hh = Math.abs(by - ay);
          pg.setCropBox(x, y, w, hh); pg.setMediaBox(x, y, w, hh);
        });
        return [P.outPdf(await P.save(src), P.suffixName(it, '-cropped'))];
      }
      const out = await P.create(); const bg = await P.rgb(o.bg);
      let [tw, th] = o.size === 'custom' ? [U.mmToPt(o.cw), U.mmToPt(o.ch)] : P.SIZES[o.size];
      for (let i = 0; i < n; i++) {
        ctx.check(); ctx.progress(i / n, `Page ${i + 1} of ${n}`);
        if (!sel.has(i)) { const [cp] = await out.copyPages(src, [i]); out.addPage(cp); continue; }
        const e = await P.embed(out, src.getPage(i));
        let [w, hh] = tw < th ? [tw, th] : [th, tw]; // portrait base
        const land = o.orient === 'landscape' || (o.orient === 'keep' && e.info.w > e.info.h);
        if (land) [w, hh] = [hh, w];
        const pg = out.addPage([w, hh]); pg.drawRectangle({ x: 0, y: 0, width: w, height: hh, color: bg });
        const sc = o.fit === 'none' ? 1 : (o.fit === 'cover' ? Math.max(w / e.info.w, hh / e.info.h) : Math.min(w / e.info.w, hh / e.info.h));
        P.place(pg, e, [sc, 0, 0, sc, (w - e.info.w * sc) / 2, (hh - e.info.h * sc) / 2]);
        await U.tick();
      }
      return [P.outPdf(await P.save(out), P.suffixName(it, `-${o.size === 'custom' ? 'resized' : o.size}`))];
    },
  });

  // ================= COMPRESS =================
  async function inflate(bytes) { const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')); return new Uint8Array(await new Response(s).arrayBuffer()); }
  function unPredict(data, columns, colors, bpc, predictor) {
    if (predictor < 10) return data;
    const bpp = Math.max(1, (colors * bpc) >> 3), rowLen = (columns * colors * bpc + 7) >> 3, rows = Math.floor(data.length / (rowLen + 1));
    const out = new Uint8Array(rows * rowLen);
    for (let y = 0; y < rows; y++) {
      const ft = data[y * (rowLen + 1)], src = y * (rowLen + 1) + 1, dst = y * rowLen, prev = dst - rowLen;
      for (let x = 0; x < rowLen; x++) {
        const raw = data[src + x], a = x >= bpp ? out[dst + x - bpp] : 0, b = y > 0 ? out[prev + x] : 0, c = (x >= bpp && y > 0) ? out[prev + x - bpp] : 0;
        let v;
        switch (ft) { case 0: v = raw; break; case 1: v = raw + a; break; case 2: v = raw + b; break; case 3: v = raw + ((a + b) >> 1); break;
          case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; } default: v = raw; }
        out[dst + x] = v & 255;
      }
    }
    return out;
  }
  function a85(src) {
    const out = []; let n = 0, acc = 0;
    for (let i = 0; i < src.length; i++) {
      const c = src[i]; if (c === 126) break; if (c <= 32) continue;
      if (c === 122 && n === 0) { out.push(0, 0, 0, 0); continue; }
      acc = acc * 85 + (c - 33); n++;
      if (n === 5) { out.push((acc >>> 24) & 255, (acc >>> 16) & 255, (acc >>> 8) & 255, acc & 255); acc = 0; n = 0; }
    }
    if (n > 1) { for (let i = n; i < 5; i++) acc = acc * 85 + 84; const b = [(acc >>> 24) & 255, (acc >>> 16) & 255, (acc >>> 8) & 255, acc & 255]; out.push(...b.slice(0, n - 1)); }
    return new Uint8Array(out);
  }
  function ahex(src) { const s = new TextDecoder().decode(src).replace(/>.*/s, '').replace(/\s+/g, ''); const o = new Uint8Array(s.length >> 1); for (let i = 0; i < o.length; i++) o[i] = parseInt(s.substr(i * 2, 2), 16); return o; }
  const jpegComponents = (b) => { for (let i = 2; i < b.length - 9;) { if (b[i] !== 0xFF) { i++; continue; } const m = b[i + 1]; if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return b[i + 9]; i += 2 + (b[i + 2] << 8 | b[i + 3]); } return 3; };
  /** Re-encode raster images inside a pdf-lib document. Returns {changed, saved} */
  async function recompressImages(doc, { maxDim = 1600, q = 0.7, minBytes = 20000 }, ctx) {
    const { PDFName, PDFRawStream, PDFNumber, PDFArray, PDFDict } = PDFLib; const context = doc.context;
    const entries = context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));
    let changed = 0, saved = 0, k = 0;
    const N = (d, key) => { const v = d.lookup(PDFName.of(key)); return v && v.asNumber ? v.asNumber() : (v instanceof PDFNumber ? v.asNumber() : undefined); };
    const nameOf = (v) => String((v && v.asString ? v.asString() : v) || '').replace(/^\//, '');
    for (const [ref, st] of entries) {
      k++; ctx.check(); ctx.progress(0.1 + 0.6 * k / entries.length, `Optimising image ${k} of ${entries.length}`);
      try {
        const d = st.dict; if (st.contents.length < minBytes) continue;
        if (d.get(PDFName.of('ImageMask')) && String(d.get(PDFName.of('ImageMask'))) === 'true') continue;
        if (d.has(PDFName.of('Decode'))) continue;
        let filters = d.lookup(PDFName.of('Filter')); filters = (filters instanceof PDFArray ? filters.asArray().map((x) => nameOf(x)) : [nameOf(filters)]);
        let data = st.contents; let parmsAll = d.lookup(PDFName.of('DecodeParms')); let pIdx = 0;
        while (filters.length > 1 && /^(ASCII85Decode|ASCIIHexDecode)$/.test(filters[0])) { data = filters[0] === 'ASCII85Decode' ? a85(data) : ahex(data); filters.shift(); pIdx++; }
        if (filters.length !== 1) continue;
        const fname = filters[0];
        const w = N(d, 'Width'), hgt = N(d, 'Height'); if (!w || !hgt) continue;
        let bitmap, comps = 3;
        if (fname === 'DCTDecode') {
          comps = jpegComponents(data); if (comps === 4) continue;
          bitmap = await createImageBitmap(new Blob([data], { type: 'image/jpeg' }));
        } else if (fname === 'FlateDecode') {
          const bpc = N(d, 'BitsPerComponent') || 8; if (bpc !== 8) continue;
          let cs = d.lookup(PDFName.of('ColorSpace')); let csName = cs instanceof PDFArray ? nameOf(cs.lookup(0)) : nameOf(cs);
          if (csName === 'Indexed' || csName === 'Separation' || csName === 'DeviceN' || csName === 'Lab' || csName === 'DeviceCMYK') continue;
          if (csName === 'ICCBased') { const prof = cs.lookup(1); comps = prof && prof.dict ? (N(prof.dict, 'N') || 3) : 3; } else comps = csName === 'DeviceGray' || csName === 'CalGray' ? 1 : 3;
          if (comps !== 1 && comps !== 3) continue;
          let raw = await inflate(data);
          let pred = 1, cols = w;
          const pd = parmsAll instanceof PDFArray ? parmsAll.lookup(pIdx) : parmsAll; if (pd && pd.get) { pred = N(pd, 'Predictor') || 1; cols = N(pd, 'Columns') || w; }
          if (pred >= 10) raw = unPredict(raw, cols, comps, 8, pred); else if (pred === 2) continue;
          if (raw.length < w * hgt * comps) continue;
          const id = new ImageData(w, hgt); const px = id.data;
          for (let i = 0, j = 0; i < w * hgt; i++) { if (comps === 3) { px[j++] = raw[i * 3]; px[j++] = raw[i * 3 + 1]; px[j++] = raw[i * 3 + 2]; } else { const g = raw[i]; px[j++] = g; px[j++] = g; px[j++] = g; } px[j++] = 255; }
          bitmap = await createImageBitmap(id);
        } else continue;
        const sc = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
        const nw = Math.max(1, Math.round(bitmap.width * sc)), nh = Math.max(1, Math.round(bitmap.height * sc));
        const c = W.canvas(nw, nh); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, nw, nh); g.imageSmoothingQuality = 'high'; g.drawImage(bitmap, 0, 0, nw, nh); bitmap.close && bitmap.close();
        const blob = await U.canvasBlob(c, 'image/jpeg', q); const nb = new Uint8Array(await blob.arrayBuffer());
        if (nb.length >= st.contents.length * 0.92) continue;
        const nd = context.obj({ Type: 'XObject', Subtype: 'Image', Width: nw, Height: nh, ColorSpace: comps === 1 && fname === 'DCTDecode' ? 'DeviceGray' : 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode', Length: nb.length });
        for (const key of ['SMask', 'Mask', 'Intent', 'Interpolate', 'Metadata']) { const v = d.get(PDFName.of(key)); if (v) nd.set(PDFName.of(key), v); }
        if (comps === 1 && fname === 'DCTDecode') { /* keep gray JPEG as RGB-encoded gray */ nd.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB')); }
        context.assign(ref, PDFRawStream.of(nd, nb));
        saved += st.contents.length - nb.length; changed++;
      } catch (e) { console.warn('image skipped', e); }
    }
    return { changed, saved, total: entries.length };
  }
  W.pdf.recompressImages = recompressImages;
  W.pdf.optimize = async (bytes) => {
    const r = await P.qpdf(['--object-streams=generate', '--compress-streams=y', '--recompress-flate', '--compression-level=9', '/in.pdf', '/out.pdf'], { '/in.pdf': bytes });
    return r.out['/out.pdf'] && (r.code === 0 || r.code === 3) ? r.out['/out.pdf'] : bytes;
  };
  const LEVELS = { lossless: null, balanced: { maxDim: 2200, q: 0.78 }, strong: { maxDim: 1500, q: 0.62 }, extreme: { dpi: 96, q: 0.5 } };
  W.simpleTool({
    id: 'compress', cat: 'pages', name: 'Compress PDF', icon: 'minimize-2', action: 'Compress', actionIcon: 'minimize-2',
    desc: 'Reduce file size. Start with lossless compression to keep image quality.', keys: 'reduce shrink smaller optimize size email upload mb kb',
    files: Object.assign({ multi: true, min: 1, title: 'Drop PDFs to compress' }, PDF_FILES),
    opts: [
      { id: 'level', type: 'seg', label: 'Compression level', options: [['lossless', 'Lossless'], ['balanced', 'Balanced'], ['strong', 'Strong'], ['extreme', 'Extreme'], ['custom', 'Custom']], value: 'lossless' },
      { id: 'info', type: 'info', show: (v) => true, html: '' },
      { id: 'maxDim', type: 'range', label: 'Longest image side', min: 600, max: 4000, step: 100, value: 1600, unit: ' px', show: (v) => v.level === 'custom' },
      { id: 'q', type: 'range', label: 'JPEG quality', min: 20, max: 95, step: 1, value: 70, unit: '%', show: (v) => v.level === 'custom' },
      { id: 'target', type: 'number', label: 'Try to get under (optional, 0 = off)', value: 0, min: 0, step: 0.5, unit: 'MB', help: 'If the first pass is still too big, stronger settings are tried automatically.', show: (v) => v.level !== 'extreme' },
    ],
    setup(root, api) {
      const txt = { lossless: '<b>Lossless</b> — rebuilds the file structure and recompresses data without touching image quality. Often saves 5–30%.', balanced: '<b>Balanced</b> — recompresses large photos (max 2200 px, JPEG 78%). Looks the same on screen; text stays sharp and selectable.', strong: '<b>Strong</b> — smaller photos (max 1500 px, JPEG 62%). Great for email attachments; text stays sharp and selectable.', extreme: '<b>Extreme</b> — turns every page into a 96 dpi picture. Smallest file, but text can no longer be selected or searched.', custom: '<b>Custom</b> — choose the image size and quality yourself.' };
      api.setInfo = (v) => { const f = $('.finfo', api.panelHost.parentElement); const e = $$('.finfo', root).find((x) => x.closest('.field') && x.closest('.field').dataset.id === 'info'); if (e) e.innerHTML = txt[v.level]; };
      setTimeout(() => api.setInfo(api.vals), 0);
    },
    onOpt: (v, id, api) => api.setInfo && api.setInfo(v),
    async run(items, o, ctx) {
      const outs = []; let beforeTot = 0, afterTot = 0;
      for (let f = 0; f < items.length; f++) {
        const it = items[f]; ctx.check(); const label = items.length > 1 ? `${it.name}: ` : '';
        const orig = await it.buf(); beforeTot += orig.length;
        const attempt = async (level) => {
          const cfg = level === 'custom' ? { maxDim: o.maxDim, q: o.q / 100 } : LEVELS[level];
          if (level === 'extreme') {
            const out = await P.create(); const doc = await P.doc(it); const n = doc.numPages;
            for (let i = 0; i < n; i++) { ctx.check(); ctx.progress((f + i / n) / items.length, `${label}rendering page ${i + 1}/${n}`); const pg = await doc.getPage(i + 1); const vp = pg.getViewport({ scale: 1 }); const c = await P.render(pg, { scale: cfg.dpi / 72 }); const jb = new Uint8Array(await (await U.canvasBlob(c, 'image/jpeg', cfg.q)).arrayBuffer()); const im = await out.embedJpg(jb); const page = out.addPage([vp.width, vp.height]); page.drawImage(im, { x: 0, y: 0, width: vp.width, height: vp.height }); await U.tick(); }
            return P.save(out);
          }
          const d = await P.load(it);
          if (cfg) await recompressImages(d, Object.assign({}, cfg), { check: ctx.check, progress: (p, l) => ctx.progress((f + p) / items.length, label + l) });
          ctx.progress((f + 0.8) / items.length, label + 'rebuilding file');
          return P.save(d);
        };
        let level = o.level, bytes = await attempt(level);
        ctx.progress((f + 0.9) / items.length, label + 'optimising streams');
        bytes = await W.pdf.optimize(bytes);
        const target = (o.target || 0) * 1048576;
        const ladder = ['balanced', 'strong', 'extreme'];
        if (target && bytes.length > target) { for (const lv of ladder.slice(Math.max(0, ladder.indexOf(level) + 1))) { const b = await W.pdf.optimize(await attempt(lv)); level = lv; bytes = b; if (b.length <= target) break; } }
        let note = '';
        if (bytes.length >= orig.length) { bytes = orig; note = ' (already well compressed — original kept)'; }
        afterTot += bytes.length;
        const pct = Math.round((1 - bytes.length / orig.length) * 100);
        outs.push(Object.assign(P.outPdf(bytes, P.suffixName(it, '-compressed')), { meta: `was ${U.fmtBytes(orig.length)} → ${pct > 0 ? '−' + pct + '%' : 'no change'}${note}` }));
      }
      const tp = Math.round((1 - afterTot / beforeTot) * 100);
      return { outputs: outs, note: `${U.fmtBytes(beforeTot)} → <b>${U.fmtBytes(afterTot)}</b>${tp > 0 ? ` (saved ${tp}%)` : ''}` };
    },
  });
}
