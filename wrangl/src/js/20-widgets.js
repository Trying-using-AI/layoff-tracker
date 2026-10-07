// ===== Reusable widgets: Item, dropzone, file list, form fields, progress, results, simple-tool runner =====
const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', txt: 'text/plain', csv: 'text/csv', json: 'application/json', html: 'text/html', md: 'text/markdown', zip: 'application/zip', epub: 'application/epub+zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', wav: 'audio/wav', webm: 'audio/webm' };
W.mime = (name) => MIME[U.ext(name)] || 'application/octet-stream';

class Item {
  constructor(file) {
    this.id = U.uid(); this.file = file; this.name = file.name || 'file'; this.size = file.size;
    this.kind = W.kindOf(file); this.info = {};
  }
  async buf() { return this._b || (this._b = new Uint8Array(await this.file.arrayBuffer())); }
  setFile(file) { this.file = file; this.size = file.size; this._b = null; this._pdfjs = null; this._th = null; }
}
W.Item = Item;
/** wrap bytes/blob into a File */
W.file = (data, name, type) => new File([data], name, { type: type || W.mime(name) });
W.out = (name, data, type) => ({ name, blob: data instanceof Blob ? data : new Blob([data], { type: type || W.mime(name) }) });

// ---------- dropzone ----------
function acceptFn(accept) {
  if (!accept || accept.trim() === '*' || accept.trim() === '*/*') return () => true;
  const toks = accept.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return (f) => {
    const n = (f.name || '').toLowerCase(), t = (f.type || '').toLowerCase();
    return toks.some((k) => k.startsWith('.') ? n.endsWith(k) : k.endsWith('/*') ? t.startsWith(k.slice(0, -1)) : t === k);
  };
}
W.acceptFn = acceptFn;
W.dropzone = function ({ accept = '', multiple = true, title, hint, onFiles, compact = false, icon = 'upload-cloud', capture = false }) {
  const ok = acceptFn(accept);
  const handle = (files) => {
    files = Array.from(files || []);
    const good = files.filter(ok), bad = files.filter((f) => !ok(f));
    if (bad.length) W.toast(`Skipped ${bad.length} file${bad.length > 1 ? 's' : ''} that ${bad.length > 1 ? 'aren’t' : 'isn’t'} supported here: ${bad.slice(0, 2).map((f) => f.name).join(', ')}${bad.length > 2 ? '…' : ''}`, 'err');
    if (good.length) onFiles(multiple ? good : good.slice(0, 1));
  };
  const el = h('div.dz' + (compact ? '.compact' : ''), { tabindex: '0', role: 'button', 'aria-label': title || 'Add files' },
    h('span.dz-ic', { html: ic(icon, compact ? 20 : 30) }),
    h('div.dz-t', h('b', title || (multiple ? 'Drop files here' : 'Drop a file here')), h('span', hint || ('or click to browse' + (compact ? '' : ' · or paste from clipboard')))),
    !compact && h('button.btn.primary', { type: 'button', tabindex: '-1' }, multiple ? 'Choose files' : 'Choose file'));
  const pick = async () => { const f = await W.pickFiles({ accept, multiple }); if (f.length) handle(f); };
  el.addEventListener('click', pick);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  el.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.remove('over'); handle(e.dataTransfer.files); });
  const onPaste = (e) => {
    if (!el.isConnected) { document.removeEventListener('paste', onPaste); return; }
    const tg = e.target; if (tg && (/^(INPUT|TEXTAREA)$/.test(tg.tagName) || tg.isContentEditable)) return;
    const fs = Array.from(e.clipboardData && e.clipboardData.files || []).map((f, i) => f.name === 'image.png' ? new File([f], 'pasted-' + (i + 1) + '.png', { type: f.type }) : f);
    if (fs.length) { e.preventDefault(); handle(fs); }
  };
  document.addEventListener('paste', onPaste);
  el.handle = handle;
  return el;
};

// ---------- file list ----------
W.fileList = function (cfg = {}) {
  const { multi = true, accept = '.pdf,application/pdf', kind = 'pdf', min = 1, max = Infinity, onChange, title, hint, extra, allowBroken = false, sortable = true, noThumb = false, icon, dzIcon } = cfg;
  const items = [];
  const root = h('div.fl');
  const list = h('div.fl-list');
  const dzFull = W.dropzone({ accept, multiple: multi, title, hint, icon: dzIcon, onFiles: (fs) => add(fs) });
  const dzMore = W.dropzone({ accept, multiple: multi, compact: true, title: multi ? 'Add more files' : 'Replace file', hint: 'drop or click', onFiles: (fs) => add(fs) });
  root.append(dzFull, list, dzMore);
  const api = { el: root, items, add, clear, remove, move, refresh, onChange: onChange || (() => { }), accept };

  function refresh() {
    dzFull.hidden = items.length > 0; dzMore.hidden = items.length === 0 || (!multi ? false : items.length >= max);
    list.hidden = items.length === 0;
    list.innerHTML = '';
    items.forEach((it, i) => list.appendChild(row(it, i)));
  }
  function row(it, i) {
    const th = h('div.fl-th');
    if (!noThumb) fillThumb(th, it);
    const meta = h('span.fl-meta', metaText(it));
    it._meta = meta;
    const r = h('div.fl-row', { draggable: sortable && items.length > 1 ? 'true' : null, dataset: { id: it.id } },
      sortable && items.length > 1 && h('span.fl-grip', { html: ic('grip-vertical', 16), title: 'Drag to reorder' }),
      th,
      h('div.fl-main', h('span.fl-name', { title: it.name }, it.name), meta, it.error && h('span.fl-err', it.error)),
      extra ? extra(it, api) : null,
      h('div.fl-act',
        items.length > 1 && h('button.icon-btn', { title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, html: ic('arrow-up', 16), onclick: () => move(i, i - 1) }),
        items.length > 1 && h('button.icon-btn', { title: 'Move down', 'aria-label': 'Move down', disabled: i === items.length - 1, html: ic('arrow-down', 16), onclick: () => move(i, i + 1) }),
        h('button.icon-btn', { title: 'Remove', 'aria-label': 'Remove ' + it.name, html: ic('x', 16), onclick: () => remove(it.id) })));
    if (sortable) {
      r.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-wrangl-row', it.id); e.dataTransfer.effectAllowed = 'move'; r.classList.add('dragging'); });
      r.addEventListener('dragend', () => r.classList.remove('dragging'));
      r.addEventListener('dragover', (e) => { if (Array.from(e.dataTransfer.types).includes('text/x-wrangl-row')) { e.preventDefault(); r.classList.add('dropat'); } });
      r.addEventListener('dragleave', () => r.classList.remove('dropat'));
      r.addEventListener('drop', (e) => { const id = e.dataTransfer.getData('text/x-wrangl-row'); r.classList.remove('dropat'); if (!id) return; e.preventDefault(); e.stopPropagation(); const from = items.findIndex((x) => x.id === id); if (from >= 0) move(from, i); });
    }
    return r;
  }
  function metaText(it) {
    const bits = [U.fmtBytes(it.size)];
    if (it.info.pages) bits.push(U.plural(it.info.pages, 'page'));
    if (it.info.w) bits.push(`${it.info.w}×${it.info.h}`);
    if (it.info.note) bits.push(it.info.note);
    return bits.join(' · ');
  }
  async function fillThumb(th, it) {
    if (it.kind === 'pdf') {
      th.appendChild(h('span.fl-ph', { html: ic('file-text', 22) }));
      try { const c = await W.pdf.thumb(it, 0, 96); th.innerHTML = ''; th.appendChild(c); if (it._meta) it._meta.textContent = metaText(it); } catch { }
    } else if (it.kind === 'image') {
      try { const img = await U.fileImage(it.file); it.info.w = img.naturalWidth; it.info.h = img.naturalHeight; img.className = 'fl-img'; th.appendChild(img); if (it._meta) it._meta.textContent = metaText(it); } catch { th.appendChild(h('span.fl-ph', { html: ic('image-off', 22) })); }
    } else th.appendChild(h('span.fl-ph', { html: ic(icon || ({ docx: 'file-text', xlsx: 'sheet', csv: 'table', pptx: 'presentation', audio: 'audio-lines', html: 'code', md: 'file-code', epub: 'book-open', zip: 'file-archive' }[it.kind] || 'file'), 22) }));
  }
  async function add(files) {
    files = Array.from(files);
    if (!multi) { items.length = 0; files = files.slice(0, 1); }
    if (items.length + files.length > max) { files = files.slice(0, Math.max(0, max - items.length)); W.toast(`This tool takes at most ${max} files.`, 'info'); }
    let added = 0;
    for (const f of files) {
      const it = new Item(f);
      if (it.kind === 'pdf' && kind === 'pdf') {
        try { await W.pdf.prepare(it); } catch (e) {
          if (e && e.cancelled) continue;
          if (!allowBroken) { W.toast(`“${f.name}” can’t be read as a PDF${e && e.message ? ' (' + e.message + ')' : ''}.`, 'err', 6000); continue; }
          it.error = 'Damaged or unreadable PDF';
        }
      }
      items.push(it); added++;
    }
    refresh(); api.onChange(items, 'add');
    return added;
  }
  function remove(id) { const i = items.findIndex((x) => x.id === id); if (i >= 0) { const [it] = items.splice(i, 1); if (it._pdfjs) { it._pdfjs.then((d) => d.destroy && d.destroy()).catch(() => { }); } refresh(); api.onChange(items, 'remove'); } }
  function move(a, b) { if (b < 0 || b >= items.length || a === b) return; const [x] = items.splice(a, 1); items.splice(b, 0, x); refresh(); api.onChange(items, 'move'); }
  function clear() { items.length = 0; refresh(); api.onChange(items, 'clear'); }
  refresh();
  return api;
};

// ---------- form fields ----------
/** spec: [{id,type,label,help,value,options,show,min,max,step,unit,placeholder,rows,accept}] */
W.fields = function (spec, { onChange } = {}) {
  const vals = {};
  const el = h('div.fields');
  const wraps = [];
  const fire = (id) => { applyShow(); onChange && onChange(vals, id); };
  const opt = (o) => Array.isArray(o) ? o : [o, String(o)];
  function build(f, parent) {
    if (f.type === 'row') { const r = h('div.frow'); f.children.forEach((c) => build(c, r)); parent.appendChild(r); return; }
    const wrap = h('div.field' + (f.type === 'check' ? '.is-check' : ''), { dataset: { id: f.id || '' } });
    wrap._f = f;
    let input;
    const v0 = f.value;
    switch (f.type) {
      case 'heading': wrap.appendChild(h('h4.fh', f.label)); break;
      case 'info': wrap.appendChild(h('div.finfo', { html: f.html || U.esc(f.label) })); break;
      case 'select': {
        vals[f.id] = v0 !== undefined ? v0 : opt(f.options[0])[0];
        input = h('select.in', { id: 'f-' + f.id, onchange: () => { const o = f.options.map(opt).find((x) => String(x[0]) === input.value); vals[f.id] = o ? o[0] : input.value; fire(f.id); } }, f.options.map(opt).map(([v, l]) => h('option', { value: String(v), selected: String(v) === String(vals[f.id]) }, l)));
        wrap.append(f.label && h('label.lbl', { for: 'f-' + f.id }, f.label), input); break;
      }
      case 'seg': {
        vals[f.id] = v0 !== undefined ? v0 : opt(f.options[0])[0];
        const g = h('div.seg', { role: 'radiogroup', 'aria-label': f.label });
        f.options.map(opt).forEach(([v, l]) => g.appendChild(h('button.seg-b' + (String(v) === String(vals[f.id]) ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(v) === String(vals[f.id]), dataset: { v: String(v) }, onclick: () => { vals[f.id] = v; $$('.seg-b', g).forEach((b) => { const on = b.dataset.v === String(v); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); fire(f.id); } }, l)));
        wrap.append(f.label && h('span.lbl', f.label), g); break;
      }
      case 'check': {
        vals[f.id] = !!v0;
        input = h('input', { type: 'checkbox', id: 'f-' + f.id, checked: !!v0, onchange: () => { vals[f.id] = input.checked; fire(f.id); } });
        wrap.append(h('label.chk', input, h('span.chk-box'), h('span', f.label))); break;
      }
      case 'range': {
        vals[f.id] = v0 !== undefined ? v0 : f.min;
        const out = h('output.rout', String(vals[f.id]) + (f.unit || ''));
        input = h('input', { type: 'range', id: 'f-' + f.id, min: f.min, max: f.max, step: f.step || 1, value: vals[f.id], oninput: () => { vals[f.id] = parseFloat(input.value); out.textContent = (f.fmt ? f.fmt(vals[f.id]) : vals[f.id]) + (f.unit || ''); fire(f.id); } });
        if (f.fmt) out.textContent = f.fmt(vals[f.id]) + (f.unit || '');
        wrap.append(h('div.lbl-row', h('label.lbl', { for: 'f-' + f.id }, f.label), out), input); break;
      }
      case 'color': {
        vals[f.id] = v0 || '#000000';
        input = h('input.color', { type: 'color', id: 'f-' + f.id, value: vals[f.id], oninput: () => { vals[f.id] = input.value; fire(f.id); } });
        wrap.append(h('label.lbl', { for: 'f-' + f.id }, f.label), input); break;
      }
      case 'number': {
        vals[f.id] = v0 !== undefined ? v0 : (f.min ?? 0);
        input = h('input.in', { type: 'number', id: 'f-' + f.id, min: f.min, max: f.max, step: f.step || 1, value: vals[f.id], oninput: () => { const n = parseFloat(input.value); vals[f.id] = isNaN(n) ? (f.min ?? 0) : n; fire(f.id); } });
        wrap.append(f.label && h('label.lbl', { for: 'f-' + f.id }, f.label), f.unit ? h('div.with-unit', input, h('span', f.unit)) : input); break;
      }
      case 'textarea': {
        vals[f.id] = v0 || '';
        input = h('textarea.in', { id: 'f-' + f.id, rows: f.rows || 4, placeholder: f.placeholder || '', value: vals[f.id], spellcheck: f.spell ? 'true' : 'false', oninput: () => { vals[f.id] = input.value; fire(f.id); } });
        wrap.append(f.label && h('label.lbl', { for: 'f-' + f.id }, f.label), input); break;
      }
      case 'file': {
        vals[f.id] = null;
        const name = h('span.muted.small', f.placeholder || 'No file chosen');
        const prev = h('img.fprev', { hidden: true, alt: '' });
        const b = h('button.btn.sm', { type: 'button', onclick: async () => { const fs = await W.pickFiles({ accept: f.accept || 'image/*', multiple: false }); if (fs[0]) set(f.id, fs[0]); } }, f.button || 'Choose file');
        const clr = h('button.btn.sm.ghost', { type: 'button', hidden: true, onclick: () => set(f.id, null) }, 'Remove');
        wrap._set = (file) => { vals[f.id] = file; name.textContent = file ? file.name : (f.placeholder || 'No file chosen'); clr.hidden = !file; if (file && /^image\//.test(file.type)) { prev.src = URL.createObjectURL(file); prev.hidden = false; } else prev.hidden = true; };
        wrap.append(f.label && h('span.lbl', f.label), h('div.row.gap.wrap', b, clr, name), prev); break;
      }
      default: { // text / password
        vals[f.id] = v0 || '';
        input = h('input.in', { type: f.type === 'password' ? 'password' : f.type === 'datetime' ? 'datetime-local' : 'text', id: 'f-' + f.id, placeholder: f.placeholder || '', value: vals[f.id], autocomplete: f.type === 'password' ? 'new-password' : 'off', spellcheck: 'false', oninput: () => { vals[f.id] = input.value; fire(f.id); } });
        wrap.append(f.label && h('label.lbl', { for: 'f-' + f.id }, f.label), input);
      }
    }
    if (input) wrap._input = input;
    if (f.help) wrap.appendChild(h('div.help', f.help));
    parent.appendChild(wrap); wraps.push(wrap);
  }
  spec.forEach((f) => build(f, el));
  function applyShow() { wraps.forEach((w) => { const f = w._f; w.hidden = !!(f.show && !f.show(vals)); }); }
  function set(id, v) {
    vals[id] = v; const w = wraps.find((x) => x._f.id === id); if (!w) return;
    if (w._set) w._set(v);
    else if (w._input) { const i = w._input; if (i.type === 'checkbox') i.checked = !!v; else i.value = v; }
    const seg = $('.seg', w); if (seg) $$('.seg-b', seg).forEach((b) => { const on = b.dataset.v === String(v); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    fire(id);
  }
  applyShow();
  return { el, vals, set, get: (id) => vals[id], refresh: applyShow };
};

// ---------- progress ----------
W.progress = function () {
  const bar = h('div.pbar'), lab = h('span.plabel', ''), pct = h('span.ppct', '');
  const el = h('div.progress', { hidden: true, role: 'progressbar' }, h('div.ptop', lab, pct), h('div.ptrack', bar));
  return {
    el,
    set(f, label) { el.hidden = false; if (f == null) { el.classList.add('ind'); pct.textContent = ''; } else { el.classList.remove('ind'); bar.style.width = Math.round(U.clamp(f, 0, 1) * 100) + '%'; pct.textContent = Math.round(U.clamp(f, 0, 1) * 100) + '%'; } if (label != null) lab.textContent = label; },
    hide() { el.hidden = true; bar.style.width = '0'; el.classList.remove('ind'); },
  };
};

// ---------- results ----------
const NEXT = {
  pdf: ['compress', 'organize', 'rotate', 'edit', 'sign', 'watermark', 'page-numbers', 'encrypt', 'pdf-to-images', 'split', 'merge'],
  image: ['images-to-pdf', 'remove-bg'],
};
W.showResults = async function (box, outputs, { tool, note, extraNode, save = true } = {}) {
  box.innerHTML = '';
  if (!outputs || !outputs.length) { box.appendChild(h('div.res.warn', h('b', 'Nothing was produced.'), note && h('p', note))); return; }
  const card = h('div.res');
  card.appendChild(h('div.res-head', h('span.res-ok', { html: ic('circle-check', 20) }), h('div', h('b', outputs.length === 1 ? 'Your file is ready' : `${outputs.length} files are ready`), note && h('div.muted.small', { html: note }))));
  const rows = h('div.res-rows');
  outputs.forEach((o) => {
    const kind = W.kindOf({ name: o.name, type: o.blob.type });
    const nextIds = (NEXT[kind] || []).filter((id) => W.byId[id] && (!tool || id !== tool.id));
    const prev = o.view || null;
    const dl = h('button.btn.primary.sm', { html: ic('download', 15) + '<span>Download</span>', onclick: () => U.download(o.blob, o.name) });
    const actions = h('div.row.gap.wrap', dl);
    if (kind === 'pdf') actions.appendChild(h('button.btn.sm', { html: ic('external-link', 15) + '<span>Open</span>', onclick: () => { const u = URL.createObjectURL(o.blob); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000); } }));
    if (nextIds.length) {
      const m = h('select.in.sm.next', { 'aria-label': 'Continue with another tool', onchange: () => { if (m.value) W.go(m.value, [W.file(o.blob, o.name, o.blob.type)]); } }, h('option', { value: '' }, 'Continue with…'), nextIds.map((id) => h('option', { value: id }, W.byId[id].name)));
      actions.appendChild(m);
    }
    const th = h('div.fl-th');
    if (kind === 'pdf') { const it = new Item(W.file(o.blob, o.name)); W.pdf.prepare(it).then(() => W.pdf.thumb(it, 0, 96)).then((c) => { th.innerHTML = ''; th.appendChild(c); $('.res-meta', row) && ($('.res-meta', row).textContent = U.fmtBytes(o.blob.size) + (it.info.pages ? ' · ' + U.plural(it.info.pages, 'page') : '')); }).catch(() => { }); th.appendChild(h('span.fl-ph', { html: ic('file-text', 22) })); }
    else if (kind === 'image') { th.appendChild(h('img.fl-img', { src: URL.createObjectURL(o.blob), alt: '' })); }
    else th.appendChild(h('span.fl-ph', { html: ic(/zip/.test(o.blob.type) || /\.zip$/.test(o.name) ? 'file-archive' : 'file', 22) }));
    const row = h('div.res-row', th, h('div.fl-main', h('span.fl-name', { title: o.name }, o.name), h('span.fl-meta.res-meta', U.fmtBytes(o.blob.size) + (o.meta ? ' · ' + o.meta : ''))), actions);
    rows.appendChild(h('div.res-item', row, prev));
  });
  card.appendChild(rows);
  if (outputs.length > 1) {
    card.appendChild(h('div.row.gap', h('button.btn.sm', { html: ic('file-archive', 15) + '<span>Download all as ZIP</span>', onclick: async (e) => { const b = e.currentTarget; b.disabled = true; try { const z = await W.zip(outputs); U.download(z, (tool ? tool.id : 'wrangl') + '-' + U.stamp() + '.zip'); } finally { b.disabled = false; } } })));
  }
  if (extraNode) card.appendChild(extraNode);
  const savedNote = h('div.muted.small.saved', '');
  card.appendChild(savedNote);
  box.appendChild(card);
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (save && W.store.get('saveWs', true)) {
    let n = 0;
    for (const o of outputs) { if (o.blob.size <= 120 * 1048576 && await W.ws.put({ id: U.uid(), name: o.name, size: o.blob.size, ts: Date.now(), tool: tool && tool.id, blob: o.blob })) n++; }
    if (n) savedNote.innerHTML = ic('hard-drive', 13) + ` Saved to <a href="#/recent">Recent workspace</a> on this device.`;
  }
  W.recordUse(tool ? tool.id : 'merge', outputs.map((o) => o.name));
};

W.zip = async function (outputs, onProgress) {
  const JSZip = await W.lib('jszip'); const z = new JSZip(); const seen = new Set();
  for (const o of outputs) {
    let n = o.name, i = 1; while (seen.has(n)) { n = o.name.replace(/(\.[^.]+)?$/, `-${++i}$1`); } seen.add(n);
    z.file(n, o.blob);
  }
  return z.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, onProgress && ((m) => onProgress(m.percent / 100)));
};

// ---------- simple tool runner ----------
/** def.files: {multi,min,max,accept,kind,title,hint,extra}  def.opts: spec | fn(items,vals)->spec   def.run(items, vals, ctx)->outputs */
W.simpleTool = function (def) {
  def.render = async function (root) {
    const cfg = Object.assign({ multi: false, min: 1 }, def.files || {});
    const state = { running: false, cancel: false };
    const prog = W.progress();
    const results = h('div.results');
    let fields = null, fieldsHost = h('div.opts-host');
    const runBtn = h('button.btn.primary.lg', { html: ic(def.actionIcon || 'wand-sparkles', 18) + '<span>' + U.esc(def.action || def.name) + '</span>', onclick: run });
    const cancelBtn = h('button.btn.lg', { hidden: true, onclick: () => { state.cancel = true; cancelBtn.disabled = true; } }, 'Cancel');
    const fl = W.fileList(Object.assign({}, cfg, { onChange: onFiles, kind: cfg.kind || 'pdf' }));
    const filesCard = h('section.card.pad', h('h3.card-h', h('span.step', '1'), cfg.heading || (cfg.multi ? 'Choose your files' : 'Choose your file')), fl.el);
    const panelHost = h('div.panel-host');
    const optsCard = h('section.card.pad', { hidden: true }, h('h3.card-h', h('span.step', '2'), def.optsTitle || 'Options'), fieldsHost);
    const actionRow = h('div.actions', runBtn, cancelBtn, h('button.btn.ghost', { onclick: () => { fl.clear(); results.innerHTML = ''; prog.hide(); } }, 'Start over'));
    root.append(filesCard, panelHost, optsCard, h('div.action-wrap', { hidden: true }, actionRow), prog.el, results);
    const actionWrap = actionRow.parentElement;
    const api = { fl, get vals() { return fields ? fields.vals : {}; }, setOpt: (k, v) => fields && fields.set(k, v), run, panelHost, results, prog, refreshFields: buildFields };
    function buildFields() {
      const spec = typeof def.opts === 'function' ? def.opts(fl.items, fields ? fields.vals : {}, api) : (def.opts || []);
      const prev = fields ? Object.assign({}, fields.vals) : {};
      const s2 = spec.map((f) => (f.id && prev[f.id] !== undefined && f.type !== 'file' && !f.reset) ? Object.assign({}, f, { value: prev[f.id] }) : f);
      fields = W.fields(s2, { onChange: (v, id) => { def.onOpt && def.onOpt(v, id, api); } });
      fieldsHost.innerHTML = ''; fieldsHost.appendChild(fields.el);
      optsCard.hidden = spec.length === 0 || fl.items.length < cfg.min;
    }
    function onFiles(items, why) {
      const ready = items.length >= cfg.min;
      actionWrap.hidden = !ready; optsCard.hidden = !ready || (fields && !fields.el.children.length);
      if (typeof def.opts === 'function') buildFields();
      else if (!fields) buildFields();
      if (def.onFiles) def.onFiles(items, api, why);
      if (why !== 'move') { results.innerHTML = ''; }
    }
    buildFields();
    if (cfg.min === 0) { actionWrap.hidden = false; optsCard.hidden = false; }
    async function run() {
      if (state.running) return;
      if (fl.items.length < cfg.min) { W.toast(`Add at least ${cfg.min} file${cfg.min > 1 ? 's' : ''} first.`, 'info'); return; }
      if (def.validate) { const msg = def.validate(fl.items, fields.vals, api); if (msg) { W.toast(msg, 'err', 5000); return; } }
      state.running = true; state.cancel = false; runBtn.disabled = true; cancelBtn.hidden = false; cancelBtn.disabled = false; results.innerHTML = '';
      const t0 = performance.now();
      const ctx = {
        progress: (f, l) => prog.set(f, l),
        check: () => { if (state.cancel) throw Object.assign(new Error('Cancelled'), { cancelled: true }); },
        tool: def, api,
      };
      prog.set(null, 'Working…');
      try {
        await W.lib('pdflib'); await U.tick();
        const res = await def.run(fl.items, Object.assign({}, fields.vals), ctx);
        prog.hide();
        let outputs = res, note, extra;
        if (res && !Array.isArray(res) && res.outputs) { outputs = res.outputs; note = res.note; extra = res.extra; }
        const sec = ((performance.now() - t0) / 1000).toFixed(1);
        await W.showResults(results, outputs, { tool: def, note: note ? note + ` <span class="muted">(${sec}s)</span>` : `Finished in ${sec}s`, extraNode: extra });
      } catch (e) {
        prog.hide();
        if (e && e.cancelled) W.toast('Cancelled', 'info');
        else { console.error(e); results.innerHTML = ''; results.appendChild(h('div.errbox', h('b', 'Something went wrong'), h('p', friendlyError(e)))); }
      } finally { state.running = false; runBtn.disabled = false; cancelBtn.hidden = true; }
    }
    // carried-over files from another tool / dashboard
    const carried = W.takeCarry(def.id);
    if (carried.length) { const ok = W.acceptFn(fl.accept); const use = carried.filter(ok); if (use.length) await fl.add(use); else W.toast('That file type isn’t supported by this tool.', 'err'); }
    if (def.setup) def.setup(root, api);
    return () => { };
  };
  return W.tool(def);
};
function friendlyError(e) {
  const m = String(e && e.message || e);
  if (/password/i.test(m)) return 'This PDF is password-protected. Use “Remove password” first, or enter the password when prompted.';
  if (/Invalid PDF|No PDF header|Failed to parse|trailer|xref/i.test(m)) return 'This PDF looks damaged. Try the “Repair PDF” tool first. (' + m + ')';
  return m;
}
W.friendlyError = friendlyError;

// ---------- misc shared helpers ----------
/** Parse "1-3,5,8-" style ranges. Returns 0-based indexes in the order requested. */
W.parseRanges = function (str, n, { allowEmpty = true } = {}) {
  str = String(str || '').trim().toLowerCase();
  if (!str || str === 'all') { if (!allowEmpty) throw new Error('Enter a page range'); return Array.from({ length: n }, (_, i) => i); }
  const out = [];
  for (let tok of str.split(/[,;\s]+/).filter(Boolean)) {
    if (tok === 'odd') { for (let i = 0; i < n; i += 2) out.push(i); continue; }
    if (tok === 'even') { for (let i = 1; i < n; i += 2) out.push(i); continue; }
    if (tok === 'first') { out.push(0); continue; }
    if (tok === 'last') { out.push(n - 1); continue; }
    tok = tok.replace(/last/g, String(n)).replace(/end/g, String(n));
    let m;
    if ((m = /^(\d+)$/.exec(tok))) { const p = +m[1]; if (p < 1 || p > n) throw new Error(`Page ${p} is out of range (1–${n})`); out.push(p - 1); }
    else if ((m = /^(\d*)-(\d*)$/.exec(tok))) {
      let a = m[1] === '' ? 1 : +m[1], b = m[2] === '' ? n : +m[2];
      if (a < 1 || b < 1 || a > n || b > n) throw new Error(`Range ${tok} is out of range (1–${n})`);
      if (a <= b) for (let i = a; i <= b; i++) out.push(i - 1); else for (let i = a; i >= b; i--) out.push(i - 1);
    } else throw new Error(`Can’t understand “${tok}”. Use something like 1-3, 5, 8-`);
  }
  return out;
};
W.sleep = U.sleep;
