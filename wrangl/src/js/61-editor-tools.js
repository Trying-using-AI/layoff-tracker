// ===== Tool pages built on the editor: Edit PDF, Sign PDF, Redact PDF, Fill forms =====
{
  const PDF_ACCEPT = '.pdf,application/pdf';

  /** shared shell: dropzone -> editor + save bar */
  async function editorShell(root, { id, mode, saveLabel = 'Save PDF', makePanel, afterLoad, exporter, suffix = '-edited', dzTitle = 'Drop a PDF to edit' }) {
    const results = h('div.results'); const prog = W.progress();
    let editor = null, item = null, busy = false;
    const dz = W.dropzone({ accept: PDF_ACCEPT, multiple: false, title: dzTitle, onFiles: (fs) => open(fs[0]) });
    const save = h('button.btn.primary.lg', { html: ic('download', 18) + `<span>${saveLabel}</span>`, onclick: doSave });
    const bar = h('div.actions.ed-save', { hidden: true }, save, h('button.btn', { onclick: () => W.pickFiles({ accept: PDF_ACCEPT, multiple: false }).then((f) => f[0] && open(f[0])) }, 'Open another PDF'));
    const host = h('div.ed-host');
    root.append(results, dz, bar, prog.el, host);
    async function open(file) {
      const it = new W.Item(file);
      try { await P.prepare(it); } catch (e) { if (!e.cancelled) W.toast(`“${file.name}” can’t be read as a PDF.`, 'err'); return; }
      item = it; if (editor) editor.destroy(); host.innerHTML = ''; results.innerHTML = '';
      editor = new W.Editor(host, { mode }); root.classList.add('wide');
      await editor.load(it); dz.hidden = true; bar.hidden = false;
      if (makePanel) makePanel(editor, it); if (afterLoad) afterLoad(editor, it);
      editor.onChange = () => { save.disabled = false; };
    }
    async function doSave() {
      if (busy || !editor) return; busy = true; save.disabled = true; results.innerHTML = '';
      try {
        prog.set(null, 'Applying your changes…');
        const bytes = exporter ? await exporter(editor, item, (f, l) => prog.set(f, l)) : await editor.save((f) => prog.set(f, 'Writing pages'));
        prog.hide();
        await W.showResults(results, [P.outPdf(bytes, P.suffixName(item, suffix))], { tool: W.byId[id], note: editor.hasChanges() ? `${U.plural(editor.objs.filter((o) => !o.locked).length, 'change')} applied` : 'No changes were made' });
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) { prog.hide(); console.error(e); results.innerHTML = ''; results.appendChild(h('div.errbox', h('b', 'Could not save'), h('p', W.friendlyError(e)))); }
      finally { busy = false; save.disabled = false; }
    }
    const carried = W.takeCarry(id); if (carried.length) await open(carried[0]);
    return () => { editor && editor.destroy(); };
  }
  W.editorShell = editorShell;

  // ================= EDIT PDF =================
  W.tool({
    id: 'edit', cat: 'edit', name: 'Edit PDF', icon: 'file-pen-line', desc: 'Change existing text, add content, and mark up pages.',
    keys: 'edit text annotate draw highlight shapes image whiteout type fill write markup comment',
    render: (root) => editorShell(root, { id: 'edit', mode: 'edit', suffix: '-edited' }),
  });

  // ================= SIGN PDF =================
  const trim = (c, pad = 4) => {
    const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(c.width - 1, x1 + pad); y1 = Math.min(c.height - 1, y1 + pad);
    const o = W.canvas(x1 - x0 + 1, y1 - y0 + 1); o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height); return o;
  };
  W.trimCanvas = trim;
  const INKS = [['#111111', 'Black'], ['#1a3a8f', 'Blue'], ['#0b5b2e', 'Green'], ['#b3261e', 'Red']];
  /** signature maker panel. onUse(dataUrl, canvas) */
  W.sigPanel = function ({ onUse, title = 'Your signature', allowSave = true }) {
    const st = { tab: 'draw', ink: '#1a3a8f', font: 'caveat', text: '', upload: null, sensitivity: 60, removeBg: true };
    const wrap = h('div.sigp');
    const tabs = h('div.seg'); const body = h('div.sigp-body'); const savedRow = h('div.sig-saved'); const inkRow = h('div.sig-ink');
    ['draw', 'type', 'upload'].forEach((t) => tabs.appendChild(h('button.seg-b' + (t === st.tab ? '.on' : ''), { dataset: { t }, onclick: () => { st.tab = t; $$('.seg-b', tabs).forEach((b) => b.classList.toggle('on', b.dataset.t === t)); renderBody(); } }, { draw: 'Draw', type: 'Type', upload: 'Upload' }[t])));
    const saveChk = h('input', { type: 'checkbox', checked: true });
    let getCanvas = () => null;
    const use = h('button.btn.primary', { html: ic('check', 16) + '<span>Use this signature</span>', onclick: () => { const c = getCanvas(); if (!c) { W.toast('Add a signature first.', 'info'); return; } const url = c.toDataURL('image/png'); if (allowSave && saveChk.checked) { const s = W.store.get('sigs', []); s.unshift({ id: U.uid(), url, w: c.width, h: c.height }); W.store.set('sigs', s.slice(0, 8)); renderSaved(); } onUse(url, c); } });
    INKS.forEach(([c, l]) => inkRow.appendChild(h('button.swatch' + (c === st.ink ? '.on' : ''), { style: `background:${c}`, title: l, 'aria-label': l + ' ink', onclick: () => { st.ink = c; $$('.swatch', inkRow).forEach((b) => b.classList.toggle('on', b === inkRow.children[INKS.findIndex((x) => x[0] === c)])); renderBody(true); } })));
    function renderSaved() {
      const s = W.store.get('sigs', []); savedRow.innerHTML = ''; if (!s.length) return;
      savedRow.appendChild(h('span.lbl', 'Saved on this device'));
      const r = h('div.row.gap.wrap'); s.forEach((x) => r.appendChild(h('div.sig-chip', h('button.sig-use', { title: 'Place this signature', onclick: () => onUse(x.url, null) }, h('img', { src: x.url, alt: 'Saved signature' })), h('button.icon-btn', { title: 'Delete', 'aria-label': 'Delete saved signature', html: ic('x', 12), onclick: () => { W.store.set('sigs', W.store.get('sigs', []).filter((y) => y.id !== x.id)); renderSaved(); } })))); savedRow.appendChild(r);
    }
    function renderBody(keep) {
      if (st.tab === 'draw') {
        if (keep && body._pad) { redrawPad(); return; }
        body.innerHTML = ''; const cv = h('canvas.sig-cv'); const dpr = 2; const cw = 640, ch = 200; cv.width = cw * dpr; cv.height = ch * dpr;
        const g = cv.getContext('2d'); g.scale(dpr, dpr); g.lineCap = 'round'; g.lineJoin = 'round'; let strokes = [], cur = null;
        const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * cw, (e.clientY - r.top) / r.height * ch]; };
        const redraw = () => { g.clearRect(0, 0, cw, ch); g.strokeStyle = st.ink; g.fillStyle = st.ink; for (const s of strokes) { if (s.length === 1) { g.beginPath(); g.arc(s[0][0], s[0][1], 1.6, 0, 7); g.fill(); continue; } g.lineWidth = 3; g.beginPath(); g.moveTo(s[0][0], s[0][1]); for (let i = 1; i < s.length - 1; i++) { const mx = (s[i][0] + s[i + 1][0]) / 2, my = (s[i][1] + s[i + 1][1]) / 2; g.quadraticCurveTo(s[i][0], s[i][1], mx, my); } const l = s[s.length - 1]; g.lineTo(l[0], l[1]); g.stroke(); } };
        redrawPad = redraw; body._pad = true;
        cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); cur = [pos(e)]; strokes.push(cur); redraw(); e.preventDefault(); });
        cv.addEventListener('pointermove', (e) => { if (!cur) return; cur.push(pos(e)); redraw(); });
        const end = () => { cur = null; }; cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
        body.append(h('div.sig-pad', cv, h('div.sig-line'), h('span.sig-x', '✕')), h('div.row.gap', h('button.btn.sm', { onclick: () => { strokes = []; redraw(); } }, 'Clear'), h('button.btn.sm', { onclick: () => { strokes.pop(); redraw(); } }, 'Undo stroke'), h('span.muted.small', 'Draw with your mouse, finger or stylus.')));
        getCanvas = () => (strokes.length ? trim(cv, 6 * dpr) : null);
      } else if (st.tab === 'type') {
        body._pad = false; body.innerHTML = '';
        const inp = h('input.in', { value: st.text, placeholder: 'Type your name', oninput: () => { st.text = inp.value; preview(); }, style: 'max-width:420px' });
        const list = h('div.sig-fonts'); const pv = h('canvas.sig-prev');
        W.hwFonts.forEach((f) => list.appendChild(h('button.sig-font' + (f.id === st.font ? '.on' : ''), { dataset: { f: f.id }, title: f.label, onclick: () => { st.font = f.id; $$('.sig-font', list).forEach((b) => b.classList.toggle('on', b.dataset.f === f.id)); preview(); } }, h('span', { style: `font-family:'${f.family}'` }, 'Signature'), h('small', f.label))));
        Promise.all(W.hwFonts.map((f) => W.loadFont(f.id).catch(() => { }))).then(() => { list.classList.add('ready'); preview(); });
        const preview = async () => { const fam = (W.hwFonts.find((f) => f.id === st.font) || {}).family; await W.loadFont(st.font); const txt = st.text || 'Your Name'; const c = W.canvas(10, 10); const g0 = c.getContext('2d'); const size = 110; g0.font = `${size}px '${fam}'`; const w = Math.ceil(g0.measureText(txt).width) + 60; pv.width = w; pv.height = size * 1.6; const g = pv.getContext('2d'); g.font = `${size}px '${fam}'`; g.fillStyle = st.ink; g.textBaseline = 'alphabetic'; g.fillText(txt, 30, size * 1.1); pv.style.opacity = st.text ? 1 : 0.35; };
        redrawPad = preview; preview();
        body.append(inp, list, h('div.sig-pad.typed', pv)); getCanvas = () => (st.text.trim() ? trim(pv, 8) : null);
      } else {
        body._pad = false; body.innerHTML = '';
        const pv = h('canvas.sig-prev'); const info = h('p.muted.small', 'Upload a photo or scan of your signature. A clean white background works best.');
        const sens = h('input', { type: 'range', min: 5, max: 100, value: st.sensitivity, oninput: () => { st.sensitivity = +sens.value; render(); } });
        const rb = h('input', { type: 'checkbox', checked: st.removeBg, onchange: () => { st.removeBg = rb.checked; render(); } });
        const render = () => { if (!st.upload) return; const im = st.upload; const sc = Math.min(1, 900 / im.naturalWidth); pv.width = Math.round(im.naturalWidth * sc); pv.height = Math.round(im.naturalHeight * sc); const g = pv.getContext('2d'); g.drawImage(im, 0, 0, pv.width, pv.height); if (st.removeBg) { const id = g.getImageData(0, 0, pv.width, pv.height); const d = id.data; const th = 255 - st.sensitivity * 1.6; for (let i = 0; i < d.length; i += 4) { const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; if (l > th) d[i + 3] = 0; else if (l > th - 40) d[i + 3] = Math.round(255 * (th - l) / 40); } g.putImageData(id, 0, 0); } };
        body.append(h('button.btn', { onclick: async () => { const f = await W.pickFiles({ accept: 'image/*', multiple: false }); if (f[0]) { st.upload = await U.fileImage(f[0]); render(); info.hidden = true; } } }, 'Choose image…'), info,
          h('div.row.gap.wrap', h('label.chk', rb, h('span.chk-box'), h('span', 'Make the background transparent')), h('label.small', 'Strength ', sens)), h('div.sig-pad.typed', pv));
        getCanvas = () => (st.upload ? trim(pv, 6) : null);
      }
    }
    let redrawPad = () => { };
    wrap.append(h('div.row.gap.wrap', h('b', title), tabs, inkRow), body, h('div.row.gap.wrap', use, allowSave ? h('label.chk', saveChk, h('span.chk-box'), h('span.small', 'Remember on this device')) : null), savedRow);
    renderBody(); renderSaved();
    return wrap;
  };

  W.tool({
    id: 'sign', cat: 'edit', name: 'Sign PDF', icon: 'signature', desc: 'Draw, type, or upload a signature and place it.',
    keys: 'signature sign initial esign autograph date stamp',
    render: (root) => editorShell(root, {
      id: 'sign', mode: 'sign', suffix: '-signed', saveLabel: 'Save signed PDF', dzTitle: 'Drop a PDF to sign',
      makePanel(ed) {
        const panel = W.sigPanel({ onUse: (url) => ed.addImage(url, { sig: true }) });
        const wrap = h('div.card.pad.sig-card', h('div.row.gap', h('b', 'Add your signature'), h('span.muted.small', 'then drag it into place and resize it'), h('button.btn.sm.ghost', { style: 'margin-left:auto', onclick: () => { wrap.hidden = true; } }, 'Hide')), panel);
        ed.extra.appendChild(wrap); ed.onSign = () => { wrap.hidden = false; wrap.scrollIntoView({ block: 'nearest' }); };
        ed.setTool('sign');
      },
    }),
  });

  // ================= REDACT =================
  /** locate text matches on each page; returns [{page,x,y,w,h,text}] in points (y from top) */
  const mctx = W.canvas(4, 4).getContext('2d');
  W.pdf.findText = async function (item, matcher, { onProgress, pages, pgs: pre } = {}) {
    const pgs = pre || await P.text(item, { pages, onProgress: (f) => onProgress && onProgress(f * 0.9) }); const hits = [];
    for (const pg of pgs) {
      const lines = P.lines(pg);
      for (const L of lines) {
        // build line string + item offsets
        let text = '', spans = [];
        L.items.slice().sort((a, b) => a.x - b.x).forEach((t, idx, arr) => { const prev = arr[idx - 1]; if (prev && t.x - (prev.x + prev.w) > t.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(t.str)) text += ' '; spans.push({ t, s: text.length, e: text.length + t.str.length }); text += t.str; });
        const ms = matcher(text); if (!ms) continue;
        for (const [ms0, me0] of ms) {
          for (const sp of spans) {
            const a = Math.max(ms0, sp.s), b = Math.min(me0, sp.e); if (b <= a) continue;
            const t = sp.t; const full = t.str; mctx.font = `${Math.max(8, t.size)}px ${t.serif ? 'serif' : t.mono ? 'monospace' : 'sans-serif'}`;
            const pre = mctx.measureText(full.slice(0, a - sp.s)).width, part = mctx.measureText(full.slice(a - sp.s, b - sp.s)).width, tot = mctx.measureText(full).width || 1;
            const x = t.x + t.w * (pre / tot), w = Math.max(t.w * (part / tot), 2);
            hits.push({ page: pg.index, x: x - 1, y: t.y - t.size * 0.9, w: w + 2, h: t.size * 1.2, text: text.slice(ms0, me0) });
          }
        }
      }
    }
    onProgress && onProgress(1); return hits;
  };
  W.pdf.mkMatcher = (terms, { regex = false, caseSens = false, whole = false } = {}) => {
    const parts = terms.map((t) => t.trim()).filter(Boolean); if (!parts.length) return null;
    const src = parts.map((t) => (regex ? t : t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).map((t) => (whole && !regex ? `\\b${t}\\b` : t)).join('|');
    const re = new RegExp(src, 'g' + (caseSens ? '' : 'i'));
    return (text) => { const out = []; let m; re.lastIndex = 0; while ((m = re.exec(text))) { if (m[0] === '') { re.lastIndex++; continue; } out.push([m.index, m.index + m[0].length]); } return out.length ? out : null; };
  };
  /** burn black boxes into pages that have redactions; other pages are copied untouched */
  W.pdf.applyRedactions = async function (item, rects, { dpi = 200, color = '#000000', keepText = true, onProgress } = {}) {
    const out = await P.create(); const src = await P.load(item); const pdoc = await P.doc(item); const n = pdoc.numPages; const by = new Map(); rects.forEach((r) => (by.get(r.page) || by.set(r.page, []).get(r.page)).push(r));
    const font = await P.std(out, 'Helvetica'); const texts = keepText && by.size ? await P.text(item, { pages: [...by.keys()] }) : [];
    for (let i = 0; i < n; i++) {
      onProgress && onProgress(i / n, `Page ${i + 1} of ${n}`);
      if (!by.has(i)) { const [cp] = await out.copyPages(src, [i]); out.addPage(cp); continue; }
      const pg = await pdoc.getPage(i + 1); const vp = pg.getViewport({ scale: 1 }); const c = await P.render(pg, { scale: dpi / 72 }); const g = c.getContext('2d'); const s = dpi / 72;
      g.fillStyle = color; by.get(i).forEach((r) => g.fillRect(r.x * s, r.y * s, r.w * s, r.h * s));
      const jb = new Uint8Array(await (await U.canvasBlob(c, 'image/jpeg', 0.9)).arrayBuffer()); const im = await out.embedJpg(jb);
      const page = out.addPage([vp.width, vp.height]); page.drawImage(im, { x: 0, y: 0, width: vp.width, height: vp.height });
      if (keepText) { const td = texts.find((t) => t.index === i); if (td) { const hit = (t) => by.get(i).some((r) => t.x < r.x + r.w + 1 && t.x + t.w > r.x - 1 && t.y - t.size * 0.9 < r.y + r.h && t.y + t.size * 0.3 > r.y); await P.invisibleText(out, page, td.items.filter((t) => t.str.trim() && !hit(t)).map((t) => ({ text: t.str, x: t.x, y: t.y - t.size * 0.8, w: t.w, h: t.size })), font); } }
      await U.tick();
    }
    return P.save(out);
  };
  W.tool({
    id: 'redact', cat: 'edit', name: 'Redact PDF', icon: 'square-dashed-bottom-code', desc: 'Permanently remove selected text or areas.',
    keys: 'blackout censor hide sensitive private confidential black out remove text permanently',
    badges: ['Permanent'],
    render: (root) => editorShell(root, {
      id: 'redact', mode: 'redact', suffix: '-redacted', saveLabel: 'Apply redactions & save', dzTitle: 'Drop a PDF to redact',
      afterLoad(ed, item) {
        const inp = h('textarea.in', { rows: 2, placeholder: 'Words or phrases to find, one per line (or use a regular expression)…', style: 'min-height:64px' });
        const o = { regex: false, caseSens: false, whole: false, dpi: 200, keepText: true, color: '#000000' };
        const chk = (k, label) => h('label.chk', h('input', { type: 'checkbox', checked: o[k], onchange: (e) => { o[k] = e.target.checked; } }), h('span.chk-box'), h('span.small', label));
        const status = h('span.muted.small', '');
        const find = h('button.btn.sm.primary', { html: ic('search', 14) + '<span>Find & mark</span>', onclick: async () => {
          const terms = inp.value.split('\n'); let m; try { m = W.pdf.mkMatcher(terms, o); } catch (e) { W.toast('That pattern isn’t valid: ' + e.message, 'err'); return; } if (!m) { W.toast('Type something to look for.', 'info'); return; }
          status.textContent = 'Searching…'; const hits = await W.pdf.findText(item, m);
          hits.forEach((r) => { const ob = { id: U.uid(), type: 'redact', page: r.page, x: r.x, y: r.y, w: r.w, h: r.h, text: r.text }; ed.objs.push(ob); ed.draw(ob); }); if (hits.length) ed.commit();
          status.textContent = hits.length ? `Marked ${hits.length} match${hits.length > 1 ? 'es' : ''} on ${new Set(hits.map((h2) => h2.page)).size} page(s). Review them below, then apply.` : 'No matches. (Scanned pages need OCR first.)';
        } });
        const clearAll = h('button.btn.sm.ghost', { onclick: () => { ed.objs.filter((x) => x.type === 'redact').forEach((x) => ed.removeObj(x.id, true)); ed.commit(); status.textContent = 'All marks cleared.'; } }, 'Clear marks');
        ed.extra.appendChild(h('div.card.pad.red-card', h('div.row.gap.wrap', h('b', 'Find text to redact'), status), inp, h('div.row.gap.wrap', find, clearAll, chk('regex', 'Regular expression'), chk('caseSens', 'Match case'), chk('whole', 'Whole words')),
          h('div.row.gap.wrap', h('label.small', 'Quality ', h('select.in.sm', { onchange: (e) => { o.dpi = +e.target.value; } }, [[150, '150 dpi'], [200, '200 dpi'], [300, '300 dpi']].map(([v, l]) => h('option', { value: v, selected: v === 200 }, l)))), h('label.small', 'Box colour ', h('input', { type: 'color', value: '#000000', oninput: (e) => { o.color = e.target.value; } })), chk('keepText', 'Keep the rest of the text searchable')),
          h('p.muted.small', 'Redacted pages are rebuilt as pictures with the marked areas burned in — the hidden text is gone from the file, not just covered. Unmarked pages are untouched.')));
        ed.redactOpts = o; ed.setTool('redact');
      },
      async exporter(ed, item, prog) {
        const rects = ed.objs.filter((x) => x.type === 'redact'); if (!rects.length) throw new Error('Nothing is marked yet. Drag over what you want to hide, or use “Find & mark”.');
        return W.pdf.applyRedactions(item, rects, Object.assign({ onProgress: prog }, ed.redactOpts));
      },
    }),
  });

  // ================= FILL FORMS =================
  W.tool({
    id: 'fill-forms', cat: 'edit', name: 'Fill PDF forms', icon: 'text-cursor-input', desc: 'Complete form fields and optionally lock the answers.',
    keys: 'acroform fields checkbox radio dropdown text input application flatten lock',
    async render(root) {
      const results = h('div.results'); const prog = W.progress(); let item = null, fields = [], vals = {}, timer;
      const dz = W.dropzone({ accept: PDF_ACCEPT, multiple: false, title: 'Drop a fillable PDF form', onFiles: (fs) => open(fs[0]) });
      const fType = (f) => { const L = PDFLib; return f instanceof L.PDFTextField ? 'PDFTextField' : f instanceof L.PDFCheckBox ? 'PDFCheckBox' : f instanceof L.PDFRadioGroup ? 'PDFRadioGroup' : f instanceof L.PDFDropdown ? 'PDFDropdown' : f instanceof L.PDFOptionList ? 'PDFOptionList' : f instanceof L.PDFSignature ? 'PDFSignature' : 'other'; };
      const left = h('div.ff-fields'), prev = h('div.ff-prev'); const lock = h('input', { type: 'checkbox' });
      const save = h('button.btn.primary.lg', { html: ic('download', 18) + '<span>Save filled PDF</span>', onclick: doSave });
      const main = h('div.ff', { hidden: true }, h('section.card.pad', h('h3.card-h', 'Fields'), left, h('label.chk', { style: 'margin-top:14px' }, lock, h('span.chk-box'), h('span', 'Lock answers (flatten the form so it can’t be changed)'))), h('section.card.pad', h('h3.card-h', 'Live preview'), prev), h('div.actions', { style: 'grid-column:1/-1' }, save, h('button.btn', { onclick: () => W.pickFiles({ accept: PDF_ACCEPT, multiple: false }).then((f) => f[0] && open(f[0])) }, 'Open another PDF')));
      root.append(results, dz, main, prog.el);
      async function open(file) {
        const it = new W.Item(file); try { await P.prepare(it); } catch (e) { if (!e.cancelled) W.toast('That file can’t be read as a PDF.', 'err'); return; }
        item = it; const doc = await P.load(it); const form = doc.getForm(); fields = form.getFields().map((f) => ({ name: f.getName(), type: fType(f), f })); vals = {}; results.innerHTML = '';
        left.innerHTML = '';
        if (!fields.length) { dz.hidden = false; main.hidden = false; left.append(h('div.finfo', 'This PDF has no fillable fields. Use ', h('a', { href: '#/t/edit' }, 'Edit PDF'), ' to type anywhere on the page, or ', h('a', { href: '#/t/sign' }, 'Sign PDF'), ' to add a signature.')); prev.innerHTML = ''; save.disabled = true; dz.hidden = true; return; }
        save.disabled = false; dz.hidden = true; main.hidden = false;
        for (const fd of fields) {
          const f = fd.f; const lab = h('label.lbl', fd.name.replace(/[_.\[\]]+/g, ' ').trim()); const w = h('div.field');
          const T = fd.type;
          if (T === 'PDFTextField') { const multi = f.isMultiline(); const cur = f.getText() || ''; vals[fd.name] = cur; const inp = h(multi ? 'textarea.in' : 'input.in', { value: cur, rows: 3, maxlength: f.getMaxLength() || null, oninput: () => { vals[fd.name] = inp.value; sched(); } }); w.append(lab, inp); }
          else if (T === 'PDFCheckBox') { vals[fd.name] = f.isChecked(); const c = h('input', { type: 'checkbox', checked: f.isChecked(), onchange: () => { vals[fd.name] = c.checked; sched(); } }); w.append(h('label.chk', c, h('span.chk-box'), h('span', fd.name))); }
          else if (T === 'PDFRadioGroup') { const opts = f.getOptions(); vals[fd.name] = f.getSelected() || ''; w.append(lab, h('div.seg', opts.map((o) => h('button.seg-b' + (vals[fd.name] === o ? '.on' : ''), { type: 'button', onclick: (e) => { vals[fd.name] = o; $$('.seg-b', e.target.parentNode).forEach((b) => b.classList.toggle('on', b === e.target)); sched(); } }, o)))); }
          else if (T === 'PDFDropdown' || T === 'PDFOptionList') { const opts = f.getOptions(); const cur = (f.getSelected() || [])[0] || ''; vals[fd.name] = cur; w.append(lab, h('select.in', { onchange: (e) => { vals[fd.name] = e.target.value; sched(); } }, h('option', { value: '' }, '—'), opts.map((o) => h('option', { value: o, selected: o === cur }, o)))); }
          else if (T === 'PDFSignature') { w.append(lab, h('div.finfo', 'Signature field — use ', h('a', { href: '#/t/sign' }, 'Sign PDF'), ' after filling.')); }
          else continue;
          left.appendChild(w);
        }
        renderPreview();
      }
      async function build(flatten) {
        const doc = await P.load(item); const form = doc.getForm();
        for (const fd of form.getFields()) {
          const nm = fd.getName(); if (!(nm in vals)) continue; const v = vals[nm]; const T = fType(fd);
          try {
            if (T === 'PDFTextField') { const s = fd.isReadOnly() ? null : v; if (s !== null) fd.setText(v || undefined); }
            else if (T === 'PDFCheckBox') v ? fd.check() : fd.uncheck();
            else if (T === 'PDFRadioGroup') { if (v) fd.select(v); }
            else if (T === 'PDFDropdown') { if (v) fd.select(v); else fd.clear(); }
            else if (T === 'PDFOptionList') { if (v) fd.select(v); }
          } catch (e) { console.warn('field', nm, e); }
        }
        const { StandardFonts } = PDFLib; const font = await doc.embedFont(StandardFonts.Helvetica);
        form.updateFieldAppearances(font); if (flatten) form.flatten({ updateFieldAppearances: false });
        return P.save(doc);
      }
      function sched() { clearTimeout(timer); timer = setTimeout(renderPreview, 350); }
      async function renderPreview() {
        try { const bytes = await build(false); const tmp = new W.Item(W.file(bytes, 'preview.pdf')); await P.prepare(tmp); prev.innerHTML = ''; const n = Math.min(tmp.info.pages, 2); for (let i = 0; i < n; i++) { const c = await P.renderPage(tmp, i, { width: 520 }); c.className = 'ff-pg'; prev.appendChild(c); } if (tmp.info.pages > n) prev.appendChild(h('p.muted.small', `Showing the first ${n} of ${tmp.info.pages} pages — the saved file contains all of them.`)); } catch (e) { console.warn(e); }
      }
      async function doSave() {
        save.disabled = true; results.innerHTML = ''; prog.set(null, 'Filling the form…');
        try { const bytes = await build(lock.checked); prog.hide(); await W.showResults(results, [P.outPdf(bytes, P.suffixName(item, '-filled'))], { tool: W.byId['fill-forms'], note: lock.checked ? 'Answers are locked (flattened)' : 'Fields remain editable' }); results.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        catch (e) { prog.hide(); results.appendChild(h('div.errbox', h('b', 'Could not save'), h('p', W.friendlyError(e)))); } finally { save.disabled = false; }
      }
      const carried = W.takeCarry('fill-forms'); if (carried.length) await open(carried[0]);
    },
  });
}
