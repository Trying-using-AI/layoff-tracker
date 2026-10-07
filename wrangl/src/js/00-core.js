// ===== Core: namespace, DOM helpers, utils, storage, library loader =====
const W = { tools: [], byId: {}, cats: [], current: null, carry: null, version: '1.0.0' };
window.W = W;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/** Tiny hyperscript: h('div.card#id', {class, style, onclick, html, dataset...}, ...children) */
function h(tag, a, ...kids) {
  if (a != null && (typeof a !== 'object' || a instanceof Node || Array.isArray(a))) { kids.unshift(a); a = null; }
  const tn = /^[a-z0-9-]+/i.exec(tag)[0];
  const el = document.createElement(tn);
  for (const t of tag.slice(tn.length).matchAll(/([.#])([\w-]+)/g)) { if (t[1] === '#') el.id = t[2]; else el.classList.add(t[2]); }
  if (a) for (const k in a) {
    const v = a[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = (el.className ? el.className + ' ' : '') + v;
    else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else Object.assign(el.style, v); }
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden' || k === 'indeterminate') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

function ic(name, size = 18, cls = '') {
  const inner = ICONS[name] || ICONS.file;
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
function icn(name, size = 18, cls = '') { const t = document.createElement('span'); t.className = 'ic-wrap'; t.innerHTML = ic(name, size, cls); return t; }

// ---------- utils ----------
const U = W.u = {
  fmtBytes(n) {
    if (n == null || isNaN(n)) return '';
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB']; let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < 2);
    return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + ' ' + u[i];
  },
  uid: () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  tick: () => new Promise((r) => setTimeout(r, 0)),
  frame: () => new Promise((r) => requestAnimationFrame(() => r())),
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  base: (name) => String(name || 'file').replace(/\.[^./\\]+$/, ''),
  ext: (name) => (/\.([^./\\]+)$/.exec(name || '') || [, ''])[1].toLowerCase(),
  safeName: (s) => String(s || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file',
  clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
  debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
  download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
  },
  async copy(text) { try { await navigator.clipboard.writeText(text); return true; } catch { const t = h('textarea', { value: text, style: 'position:fixed;opacity:0' }); document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch { } t.remove(); return ok; } },
  stamp: () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; },
  blob: (data, type) => data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' }),
  isMac: /Mac|iPhone|iPad/.test(navigator.platform || ''),
  plural: (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`,
  b64: (bytes) => { let s = ''; const c = 0x8000; for (let i = 0; i < bytes.length; i += c) s += String.fromCharCode.apply(null, bytes.subarray(i, i + c)); return btoa(s); },
  fromB64: (s) => { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; },
  async sha(alg, buf) { const d = await crypto.subtle.digest(alg, buf); return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join(''); },
  canvasBlob: (c, type = 'image/png', q) => new Promise((res, rej) => c.toBlob((b) => b ? res(b) : rej(new Error('Canvas export failed')), type, q)),
  loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read this image')); i.src = src; }); },
  async fileImage(file) {
    const url = URL.createObjectURL(file);
    try { const i = await U.loadImage(url); i._url = url; return i; } catch (e) { URL.revokeObjectURL(url); throw e; }
  },
  mmToPt: (mm) => mm * 72 / 25.4,
};

// ---------- storage ----------
W.store = {
  get(k, d) { try { const v = localStorage.getItem('wrangl.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wrangl.' + k, JSON.stringify(v)); } catch { } },
  del(k) { try { localStorage.removeItem('wrangl.' + k); } catch { } },
};

/** Recent workspace: outputs saved in IndexedDB (device only). */
W.ws = {
  _db: null,
  open() {
    if (this._db) return this._db;
    this._db = new Promise((res, rej) => {
      let r; try { r = indexedDB.open('wrangl', 1); } catch (e) { return rej(e); }
      r.onupgradeneeded = () => { r.result.createObjectStore('files', { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this._db;
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => { const t = db.transaction('files', mode); const s = t.objectStore('files'); const out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  },
  async put(rec) { try { await this.tx('readwrite', (s) => s.put(rec)); await this.trim(); return true; } catch { return false; } },
  async list() { try { return await this.tx('readonly', (s) => s.getAll()).then((a) => a.sort((x, y) => y.ts - x.ts)); } catch { return []; } },
  async get(id) { try { return await this.tx('readonly', (s) => s.get(id)); } catch { return null; } },
  async del(id) { try { await this.tx('readwrite', (s) => s.delete(id)); } catch { } },
  async clear() { try { await this.tx('readwrite', (s) => s.clear()); } catch { } },
  async trim(cap = 250 * 1048576) {
    const all = await this.list(); let tot = all.reduce((a, r) => a + (r.size || 0), 0);
    for (let i = all.length - 1; i >= 0 && (tot > cap || all.length - (all.length - 1 - i) > 80); i--) { if (tot <= cap && all.length <= 80) break; tot -= all[i].size || 0; await this.del(all[i].id); all.length = i; }
  },
};

// ---------- lazy library loader (libs are packed in the page as gzip+base64) ----------
const _libs = {};
async function unpackLib(name) {
  const el = document.getElementById('lib-' + name);
  if (!el) throw new Error('Library not bundled: ' + name);
  const raw = el.dataset.raw === '1';
  const res = await fetch('data:application/octet-stream;base64,' + el.textContent.trim());
  const buf = await res.arrayBuffer();
  if (raw) return new Uint8Array(buf);
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser is too old. Please use a current Chrome, Edge, Firefox or Safari.');
  const out = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return new Uint8Array(out);
}
W.libBytes = unpackLib;
const dec = new TextDecoder();
function runScript(text) { const s = document.createElement('script'); s.textContent = text; document.head.appendChild(s); s.remove(); }
const LIBS = {
  pdflib: async () => { runScript(dec.decode(await unpackLib('pdflib'))); return window.PDFLib; },

  jszip: async () => { runScript(dec.decode(await unpackLib('jszip'))); return window.JSZip; },
  marked: async () => { runScript(dec.decode(await unpackLib('marked'))); return window.marked; },
  mammoth: async () => { runScript(dec.decode(await unpackLib('mammoth'))); return window.mammoth; },
  xlsx: async () => { runScript(dec.decode(await unpackLib('xlsx'))); return window.XLSX; },
  qr: async () => { runScript(dec.decode(await unpackLib('qr'))); return window.qrcode; },
  pptxgen: async () => { runScript(dec.decode(await unpackLib('pptxgen'))); return window.PptxGenJS; },
  pdfjs: async () => {
    runScript(dec.decode(await unpackLib('pdfjs')));
    const worker = await unpackLib('pdfworker');
    const url = URL.createObjectURL(new Blob([worker], { type: 'text/javascript' }));
    pdfjsLib.GlobalWorkerOptions.workerSrc = url;
    try { pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(url); } catch (e) { console.warn('pdf.js worker unavailable, using main thread', e); }
    return pdfjsLib;
  },
  qpdf: async () => {
    const code = dec.decode(await unpackLib('qpdf'));
    const factory = new Function(code + '\n;return Module;')();
    const wasmBinary = await unpackLib('qpdfwasm');
    return { factory, wasmBinary };
  },
  tesseract: async () => {
    runScript(dec.decode(await unpackLib('tesseract')));
    return window.Tesseract;
  },
};
W.lib = (name) => (_libs[name] ||= LIBS[name]().catch((e) => { delete _libs[name]; throw e; }));
W.libs = async (...names) => { const r = []; for (const n of names) r.push(await W.lib(n)); return r; };

// ---------- handwriting fonts ----------
W.hwFonts = [
  { id: 'caveat', family: 'Caveat', label: 'Casual' }, { id: 'kalam', family: 'Kalam', label: 'Neat marker' }, { id: 'homemade-apple', family: 'Homemade Apple', label: 'Flowing script' },
  { id: 'reenie-beanie', family: 'Reenie Beanie', label: 'Quick scrawl' }, { id: 'shadows-into-light', family: 'Shadows Into Light', label: 'Marker' }, { id: 'patrick-hand', family: 'Patrick Hand', label: 'Print' },
  { id: 'indie-flower', family: 'Indie Flower', label: 'Rounded' }, { id: 'dancing-script', family: 'Dancing Script', label: 'Formal script' }, { id: 'la-belle-aurore', family: 'La Belle Aurore', label: 'Fountain pen' },
  { id: 'covered-by-your-grace', family: 'Covered By Your Grace', label: 'Playful' },
];
const _fonts = {};
W.loadFont = (id) => (_fonts[id] ||= (async () => {
  const f = W.hwFonts.find((x) => x.id === id); if (!f) throw new Error('Unknown font ' + id);
  const bytes = await unpackLib('hw-' + id);
  const ff = new FontFace(f.family, bytes.buffer); await ff.load(); document.fonts.add(ff); return f.family;
})());
