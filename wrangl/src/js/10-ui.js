// ===== App shell: registry, router, sidebar, search palette, dashboard, recent, favourites =====
W.cats = [
  { id: 'scan', name: 'Scan & workflows', icon: 'scan-line', hue: 175, blurb: 'Capture pages and chain tools together' },
  { id: 'pages', name: 'Page management', icon: 'layout-grid', hue: 218, blurb: 'Merge, split, reorder, rotate and resize' },
  { id: 'edit', name: 'Edit & annotate', icon: 'pen-line', hue: 268, blurb: 'Edit, sign, redact, stamp and mark up' },
  { id: 'create', name: 'Create & convert to PDF', icon: 'file-plus-2', hue: 142, blurb: 'Turn documents, images and text into PDFs' },
  { id: 'convert', name: 'Convert & extract', icon: 'file-output', hue: 38, blurb: 'Get content out of PDFs in other formats' },
  { id: 'security', name: 'Security & privacy', icon: 'shield-check', hue: 348, blurb: 'Protect, unlock, redact and audit' },
  { id: 'ai', name: 'AI & analysis', icon: 'sparkles', hue: 300, blurb: 'Search, summarise, OCR, compare and repair' },
  { id: 'business', name: 'Business', icon: 'briefcase', hue: 84, blurb: 'Invoices, billing and filing bundles' },
  { id: 'share', name: 'Share & collaborate', icon: 'share-2', hue: 200, blurb: 'Send files and draw together, peer to peer' },
  { id: 'images', name: 'Images', icon: 'image', hue: 12, blurb: 'Cut backgrounds and clean up marks' },
];
W.catById = Object.fromEntries(W.cats.map((c) => [c.id, c]));

W.tool = function (def) {
  if (W.byId[def.id]) throw new Error('duplicate tool ' + def.id);
  def.keys = def.keys || '';
  W.tools.push(def); W.byId[def.id] = def;
  return def;
};

// ---------- favourites / recent ----------
W.favs = () => W.store.get('favs', []);
W.isFav = (id) => W.favs().includes(id);
W.toggleFav = (id) => {
  const f = W.favs(); const i = f.indexOf(id);
  if (i >= 0) f.splice(i, 1); else f.push(id);
  W.store.set('favs', f); W.renderSidebar(); return i < 0;
};
W.recentTools = () => W.store.get('recent', []);
W.recordUse = (id, names) => {
  const r = W.recentTools().filter((x) => x.tool !== id);
  r.unshift({ tool: id, ts: Date.now(), names: (names || []).slice(0, 3) });
  W.store.set('recent', r.slice(0, 40));
};

// ---------- toast / modal ----------
W.toast = function (msg, type = 'info', ms = 3800) {
  let box = $('#toasts'); if (!box) { box = h('div#toasts', { role: 'status' }); document.body.appendChild(box); }
  const t = h('div.toast.' + type, { html: `<span class="ti">${ic(type === 'err' ? 'circle-alert' : type === 'ok' ? 'circle-check' : 'info', 18)}</span>` }, h('span', msg));
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
};

W.modal = function ({ title, body, actions = [], wide = false, onClose, dismissible = true }) {
  const back = h('div.modal-back');
  const close = () => { back.classList.remove('show'); setTimeout(() => back.remove(), 180); document.removeEventListener('keydown', esc, true); onClose && onClose(); };
  const esc = (e) => { if (e.key === 'Escape' && dismissible) { e.stopPropagation(); close(); } };
  const box = h('div.modal' + (wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
    title ? h('div.modal-head', h('h3', title), dismissible && h('button.icon-btn', { 'aria-label': 'Close', html: ic('x'), onclick: close })) : null,
    h('div.modal-body', body),
    actions.length ? h('div.modal-foot', actions.map((a) => h('button.btn' + (a.primary ? '.primary' : '') + (a.danger ? '.danger' : ''), { onclick: async () => { const r = a.onclick ? await a.onclick(close) : undefined; if (r !== false && !a.keep) close(); } }, a.label))) : null);
  back.appendChild(box);
  back.addEventListener('mousedown', (e) => { if (e.target === back && dismissible) close(); });
  document.body.appendChild(back);
  document.addEventListener('keydown', esc, true);
  requestAnimationFrame(() => back.classList.add('show'));
  setTimeout(() => { const f = $('input,textarea,select,button.primary', box); f && f.focus(); }, 30);
  return { close, el: box };
};
W.ask = (title, label, { type = 'text', value = '', ok = 'OK', placeholder = '', note = '' } = {}) => new Promise((resolve) => {
  const inp = h('input.in', { type, value, placeholder, onkeydown: (e) => { if (e.key === 'Enter') { done = true; m.close(); resolve(inp.value); } } });
  let done = false;
  const m = W.modal({ title, body: h('div', h('label.lbl', label), inp, note && h('p.muted.small', note)), actions: [{ label: 'Cancel', onclick: () => { } }, { label: ok, primary: true, onclick: () => { done = true; resolve(inp.value); } }], onClose: () => { if (!done) resolve(null); } });
});
W.confirm = (title, msg, ok = 'Continue') => new Promise((resolve) => {
  let done = false;
  W.modal({ title, body: h('p', msg), actions: [{ label: 'Cancel', onclick: () => { } }, { label: ok, primary: true, onclick: () => { done = true; resolve(true); } }], onClose: () => { if (!done) resolve(false); } });
});

// ---------- theme ----------
W.theme = {
  get: () => W.store.get('theme', 'auto'),
  set(v) { W.store.set('theme', v); document.documentElement.dataset.theme = v; const d = v === 'dark' || (v === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); const m = $('meta[name=theme-color]'); m && m.setAttribute('content', d ? '#121110' : '#F7F4EE'); const b = $('#themeBtn'); if (b) { b.innerHTML = ic(v === 'dark' ? 'moon' : v === 'light' ? 'sun' : 'sun-moon'); b.title = 'Theme: ' + v; } },
  cycle() { const n = { auto: 'light', light: 'dark', dark: 'auto' }[this.get()]; this.set(n); W.toast('Theme: ' + n, 'info', 1400); },
};

// ---------- search ----------
function scoreTool(t, q) {
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean); if (!toks.length) return 1;
  const name = t.name.toLowerCase(), keys = (t.keys || '').toLowerCase(), desc = (t.desc || '').toLowerCase(), cat = W.catById[t.cat].name.toLowerCase();
  let s = 0;
  for (const k of toks) {
    let x = 0;
    if (name.startsWith(k)) x = 100; else if (name.split(/\W+/).some((w) => w.startsWith(k))) x = 80; else if (name.includes(k)) x = 60;
    else if (keys.split(/\s+/).some((w) => w.startsWith(k))) x = 45; else if (keys.includes(k)) x = 35; else if (desc.includes(k)) x = 20; else if (cat.includes(k)) x = 10;
    if (!x) return 0; s += x;
  }
  return s;
}
W.searchTools = (q) => W.tools.map((t) => [scoreTool(t, q), t]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).map((x) => x[1]);

W.openSearch = function () {
  if ($('#palette')) return;
  const input = h('input.in', { type: 'search', placeholder: 'Search tools… e.g. merge, sign, word to pdf', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Search tools' });
  const list = h('div.pal-list', { role: 'listbox' });
  let sel = 0, results = [];
  const render = () => {
    const q = input.value.trim();
    results = q ? W.searchTools(q) : [...W.recentTools().map((r) => W.byId[r.tool]).filter(Boolean), ...W.tools.filter((t) => ['merge', 'compress', 'split', 'edit', 'sign', 'word-to-pdf', 'images-to-pdf', 'pdf-to-images'].includes(t.id))].filter((t, i, a) => a.indexOf(t) === i).slice(0, 8);
    sel = 0; list.innerHTML = '';
    if (!results.length) { list.appendChild(h('div.pal-empty', 'No tools match “' + q + '”.')); return; }
    if (!q) list.appendChild(h('div.pal-label', W.recentTools().length ? 'Recent & popular' : 'Popular'));
    results.slice(0, 40).forEach((t, i) => {
      const c = W.catById[t.cat];
      list.appendChild(h('div.pal-item' + (i === 0 ? '.sel' : ''), { role: 'option', dataset: { i }, onmouseenter: () => setSel(i), onclick: () => go(t) },
        h('span.tile.sm', { style: `--h:${c.hue}`, html: ic(t.icon, 16) }), h('span.pi-name', t.name), h('span.pi-cat', c.name), h('span.pi-desc', t.desc)));
    });
  };
  const setSel = (i) => { sel = i; $$('.pal-item', list).forEach((e, j) => e.classList.toggle('sel', j === i)); const e = $$('.pal-item', list)[i]; e && e.scrollIntoView({ block: 'nearest' }); };
  const go = (t) => { close(); location.hash = '#/t/' + t.id; };
  const back = h('div#palette.modal-back.pal', { onmousedown: (e) => { if (e.target === back) close(); } }, h('div.palbox', h('div.pal-in', h('span', { html: ic('search', 18) }), input, h('kbd', 'Esc')), list));
  const close = () => { back.classList.remove('show'); setTimeout(() => back.remove(), 150); };
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(results.length - 1, sel + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(0, sel - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); results[sel] && go(results[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  document.body.appendChild(back); render();
  requestAnimationFrame(() => { back.classList.add('show'); input.focus(); });
};

// ---------- sidebar ----------
W.renderSidebar = function () {
  const side = $('#side'); if (!side) return;
  const open = W.store.get('sideOpen', { pages: true, edit: true });
  const cur = W.current && W.current.tool;
  const favs = W.favs().map((id) => W.byId[id]).filter(Boolean);
  side.innerHTML = '';
  side.appendChild(h('a.side-all' + (location.hash === '' || location.hash === '#/' ? '.on' : ''), { href: '#/', html: ic('layout-dashboard', 16) + '<span>All tools</span>' }));
  if (favs.length) {
    side.appendChild(h('div.side-label', 'Favourites'));
    favs.forEach((t) => side.appendChild(sideLink(t, cur)));
  }
  side.appendChild(h('div.side-label', 'Toolkit'));
  W.cats.forEach((c) => {
    const tools = W.tools.filter((t) => t.cat === c.id);
    const isOpen = open[c.id] || (cur && cur.cat === c.id);
    const d = h('details.side-cat', { style: `--h:${c.hue}`, open: !!isOpen, ontoggle: (e) => { const o = W.store.get('sideOpen', { pages: true, edit: true }); o[c.id] = d.open; W.store.set('sideOpen', o); } },
      h('summary', h('span.tile.xs', { html: ic(c.icon, 14) }), h('span.sc-name', c.name), h('span.sc-n', tools.length), h('span.chev', { html: ic('chevron-down', 14) })),
      h('div.side-items', tools.map((t) => sideLink(t, cur))));
    side.appendChild(d);
  });
};
function sideLink(t, cur) {
  const c = W.catById[t.cat];
  return h('a.side-link' + (cur && cur.id === t.id ? '.on' : ''), { href: '#/t/' + t.id, style: `--h:${c.hue}`, title: t.desc, onclick: () => document.body.classList.remove('nav-open') }, h('span.sl-ic', { html: ic(t.icon, 15) }), h('span', t.name));
}

// ---------- tool cards ----------
W.toolCard = function (t) {
  const c = W.catById[t.cat];
  const fav = h('button.star' + (W.isFav(t.id) ? '.on' : ''), { title: 'Favourite', 'aria-label': 'Toggle favourite for ' + t.name, 'aria-pressed': String(W.isFav(t.id)), html: ic('star', 16), onclick: (e) => { e.preventDefault(); e.stopPropagation(); const on = W.toggleFav(t.id); fav.classList.toggle('on', on); fav.setAttribute('aria-pressed', String(on)); } });
  return h('div.tcw', { style: `--h:${c.hue}`, dataset: { tool: t.id } },
    h('a.card.tcard', { href: '#/t/' + t.id }, h('span.tile', { html: ic(t.icon, 22) }), h('span.tc-txt', h('span.tc-name', t.name), h('span.tc-desc', t.desc))), fav);
};

// ---------- pages ----------
function pageDashboard(main) {
  const q = new URLSearchParams((location.hash.split('?')[1] || ''));
  const focusCat = q.get('cat');
  const n = W.tools.length;
  const hero = h('section.hero',
    h('div.hero-copy',
      h('p.eyebrow', 'Free · private · no sign-up'),
      h('h1', 'Wrangle your ', h('mark', 'PDFs'), '.'),
      h('p.lead', `${n} tools to edit, sign, merge, convert and clean up your files. No accounts. No watermarks. Your files never leave this device.`),
      h('button.hero-search', { onclick: W.openSearch, html: `${ic('search', 18)}<span>Search ${n} tools — try “merge”, “compress”, “sign”…</span><kbd>${U.isMac ? '⌘' : 'Ctrl'} K</kbd>` }),
      h('div.hero-chips', ['merge', 'compress', 'split', 'sign', 'word-to-pdf', 'pdf-to-images', 'organize', 'ocr'].map((id) => W.byId[id]).filter(Boolean).map((t) => h('a.chip-link', { href: '#/t/' + t.id, html: ic(t.icon, 14) + `<span>${U.esc(t.name)}</span>` })))),
    h('div.hero-art', { 'aria-hidden': 'true' }, h('div.sheet.s1'), h('div.sheet.s2'), h('div.sheet.s3', h('i'), h('i'), h('i'), h('i.short'), h('b')), h('div.stamp', { html: ic('lock', 18) + '<span>0 bytes uploaded</span>' })));
  main.appendChild(hero);

  main.appendChild(h('div.trust', [['shield-check', 'Processed on your device'], ['badge-check', 'No added watermarks'], ['user-x', 'No account needed'], ['wifi-off', 'Works offline']].map(([i, t]) => h('span', { html: ic(i, 16) + '<span>' + t + '</span>' }))));

  const drop = h('div.dash-drop', { tabindex: '0', role: 'button', 'aria-label': 'Drop files here to find the right tool' },
    h('span', { html: ic('upload-cloud', 22) }), h('div', h('b', 'Got a file already?'), h('span', ' Drop it here and we’ll suggest what you can do with it.')), h('button.btn', { onclick: () => pickFiles({ multiple: true }).then((f) => f.length && W.chooseForFiles(f)) }, 'Choose files'));
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFiles({ multiple: true }).then((f) => f.length && W.chooseForFiles(f)); } });
  main.appendChild(drop);

  const recent = W.recentTools().map((r) => W.byId[r.tool]).filter(Boolean).slice(0, 4);
  if (recent.length) main.appendChild(h('section.dsec', h('h2.sec-h', h('span', 'Pick up where you left off'), h('a.more', { href: '#/recent' }, 'Recent workspace →')), h('div.grid', recent.map(W.toolCard))));
  const favs = W.favs().map((id) => W.byId[id]).filter(Boolean);
  if (favs.length) main.appendChild(h('section.dsec', h('h2.sec-h', h('span', 'Favourites')), h('div.grid', favs.map(W.toolCard))));

  W.cats.forEach((c) => {
    const tools = W.tools.filter((t) => t.cat === c.id); if (!tools.length) return;
    main.appendChild(h('section.dsec#cat-' + c.id, { style: `--h:${c.hue}` },
      h('h2.sec-h', h('span.tile.sm', { html: ic(c.icon, 16) }), h('span', c.name), h('span.count', tools.length), h('span.blurb', c.blurb)),
      h('div.grid', tools.map(W.toolCard))));
  });
  if (focusCat) setTimeout(() => { const e = $('#cat-' + focusCat); e && e.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
}

function footer() {
  const link = (label, fn) => h('a', { href: '#', onclick: (e) => { e.preventDefault(); fn(); } }, label);
  return h('footer.foot',
    h('div.foot-l', h('span.brand-sm', { html: LOGO_SVG }), h('b', 'Wrangl'), h('span.muted', ' — your files. your device.')),
    h('div.foot-m', 'No accounts. No added watermarks.'),
    h('div.foot-r', link('Privacy', () => W.about('privacy')), link('Terms', () => W.about('terms')), link('About', () => W.about('about')), link('Shortcuts', () => W.about('keys'))));
}

W.about = function (which) {
  const T = {
    privacy: ['Privacy', [
      'Wrangl does its work inside your browser. When you pick a file, it is read into memory on this device and processed by code that ships inside this one HTML page.',
      'Nothing is uploaded: there is no server, no account, no analytics and no tracking. You can turn off your network and every tool still works.',
      'Things that stay on your device: your “Recent workspace” (saved in this browser’s IndexedDB), favourites, and theme. You can wipe them any time from the Recent page.',
      'The only features that can touch the network are ones you start yourself: Send files directly (a peer-to-peer WebRTC link between two browsers; it asks a public STUN server how to find you), and Chat with PDFs if you choose to paste an API key for an AI provider (then the text you ask about goes to that provider).',
    ]],
    terms: ['Terms', [
      'Wrangl is provided as-is, without warranty. You are responsible for the files you process and for keeping backups of your originals.',
      'Redaction removes content from the output you download — always open the result and check it before sharing. Converters (Word, Excel, PowerPoint, EPUB) are best-effort re-creations; complex layouts may differ from the original.',
      'Password protection uses standard PDF encryption (AES-256). Keep your password safe — it cannot be recovered.',
    ]],
    about: ['About Wrangl', [
      `Wrangl bundles ${W.tools.length} document tools into a single HTML file. Everything — PDF engine, converters, fonts, OCR — is inside this file, so it works offline and never needs to send your documents anywhere.`,
      'Built on open-source libraries: pdf-lib, PDF.js, JSZip, qpdf (WebAssembly), Tesseract OCR, mammoth, SheetJS, marked, PptxGenJS, qrcode-generator, Lucide icons, and the Bricolage Grotesque, Instrument Sans and JetBrains Mono typefaces.',
    ]],
    keys: ['Keyboard shortcuts', [
      (U.isMac ? '⌘' : 'Ctrl') + ' + K  or  /   —  search tools',
      'Esc  —  close dialogs',
      'Paste (Ctrl/⌘ + V) on a tool page adds files from your clipboard',
    ]],
  }[which];
  W.modal({ title: T[0], body: h('div.prose', T[1].map((p) => h('p', p))), actions: [{ label: 'Close', primary: true }] });
};

// ---------- recent workspace ----------
async function pageRecent(main) {
  main.appendChild(h('div.page-head', h('h1', 'Recent workspace'), h('p.lead', 'Files you created recently, kept only in this browser. Re-download them or send them into another tool.')));
  const tools = W.recentTools();
  const files = await W.ws.list();
  const bar = h('div.row.gap', h('button.btn', { onclick: async () => { if (await W.confirm('Clear workspace?', 'This deletes saved results from this browser. Your original files are not touched.', 'Clear everything')) { await W.ws.clear(); W.store.del('recent'); route(); } } }, 'Clear workspace'));
  main.appendChild(bar);
  main.appendChild(h('h2.sec-h', 'Saved results'));
  if (!files.length) main.appendChild(h('div.empty', h('span', { html: ic('inbox', 28) }), h('p', 'Nothing here yet. Results you create are saved here automatically.')));
  else {
    const list = h('div.rlist');
    files.forEach((f) => {
      const t = W.byId[f.tool];
      list.appendChild(h('div.rrow', h('span.tile.sm', { style: `--h:${t ? W.catById[t.cat].hue : 220}`, html: ic(t ? t.icon : 'file', 16) }),
        h('div.rr-main', h('b', f.name), h('span.muted.small', `${U.fmtBytes(f.size)} · ${new Date(f.ts).toLocaleString()} · ${t ? t.name : 'File'}`)),
        h('div.row.gap', h('button.btn.sm', { onclick: () => U.download(f.blob, f.name) }, 'Download'),
          h('button.btn.sm', { onclick: () => W.chooseForFiles([new File([f.blob], f.name, { type: f.blob.type })]) }, 'Use in…'),
          h('button.icon-btn', { title: 'Delete', 'aria-label': 'Delete ' + f.name, html: ic('trash-2', 16), onclick: async () => { await W.ws.del(f.id); route(); } }))));
    });
    main.appendChild(list);
  }
  main.appendChild(h('h2.sec-h', 'Recently used tools'));
  if (!tools.length) main.appendChild(h('p.muted', 'No tools used yet.'));
  else main.appendChild(h('div.grid', tools.map((r) => W.byId[r.tool]).filter(Boolean).map(W.toolCard)));
}
function pageFavs(main) {
  main.appendChild(h('div.page-head', h('h1', 'Favourites'), h('p.lead', 'Star any tool to pin it here and in the sidebar.')));
  const favs = W.favs().map((id) => W.byId[id]).filter(Boolean);
  if (!favs.length) main.appendChild(h('div.empty', h('span', { html: ic('star', 28) }), h('p', 'No favourites yet — click the star on any tool.')));
  else main.appendChild(h('div.grid', favs.map(W.toolCard)));
}

// ---------- tool page ----------
async function pageTool(main, id) {
  const t = W.byId[id];
  if (!t) { main.appendChild(h('div.empty', h('p', 'That tool doesn’t exist.'), h('a.btn', { href: '#/' }, 'Back to all tools'))); return; }
  const c = W.catById[t.cat];
  W.recordUse(t.id);
  document.title = t.name + ' — Wrangl';
  const fav = h('button.btn.sm.favbtn' + (W.isFav(t.id) ? '.on' : ''), { html: ic('star', 15) + '<span>Favourite</span>', onclick: () => { const on = W.toggleFav(t.id); fav.classList.toggle('on', on); } });
  main.appendChild(h('div.tool-head', { style: `--h:${c.hue}` },
    h('nav.crumbs', h('a', { href: '#/' }, 'All tools'), h('span', '/'), h('a', { href: '#/?cat=' + c.id }, c.name)),
    h('div.th-row', h('span.tile.lg', { html: ic(t.icon, 26) }), h('div.th-t', h('h1', t.name), h('p', t.desc)), fav),
    h('div.chips', h('span.chip.ok', { html: ic('lock', 13) + '<span>' + (t.net ? 'Private · ' + U.esc(t.net) : 'Runs on this device — nothing uploaded') + '</span>' }), (t.badges || []).map((b) => h('span.chip', b)))));
  const body = h('div.tool-body#toolbody', { style: `--h:${c.hue}` });
  main.appendChild(body);
  const cur = W.current;
  try {
    const cleanup = await t.render(body, { tool: t });
    if (W.current === cur) cur.cleanup = cleanup;
    else if (typeof cleanup === 'function') cleanup();
  } catch (e) {
    console.error(e);
    body.appendChild(h('div.errbox', h('b', 'This tool failed to start.'), h('pre', String(e && e.message || e))));
  }
}

// ---------- router ----------
let routing = 0;
async function route() {
  const my = ++routing;
  const hash = location.hash.replace(/^#/, '') || '/';
  const path = hash.split('?')[0];
  const main = $('#main'); if (!main) return;
  if (W.current && W.current.cleanup) { try { W.current.cleanup(); } catch (e) { console.error(e); } }
  W.current = { path, tool: null };
  main.innerHTML = '';
  document.title = 'Wrangl — free PDF & file tools that stay on your device';
  document.body.classList.remove('nav-open');
  const mm = /^\/t\/([\w-]+)/.exec(path);
  if (mm) W.current.tool = W.byId[mm[1]] || null;
  $$('.topnav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + path));
  W.renderSidebar();
  window.scrollTo(0, 0);
  if (mm) await pageTool(main, mm[1]);
  else if (path === '/recent') await pageRecent(main);
  else if (path === '/favs') pageFavs(main);
  else pageDashboard(main);
  if (my !== routing) return;
  main.appendChild(footer());
  W.renderSidebar();
}
W.route = route;

// ---------- smart file routing ----------
W.kindOf = function (f) {
  const e = U.ext(f.name), t = f.type || '';
  if (e === 'pdf' || t === 'application/pdf') return 'pdf';
  if (/^image\//.test(t) || /^(png|jpe?g|webp|gif|bmp|avif|svg)$/.test(e)) return 'image';
  if (e === 'docx') return 'docx';
  if (/^(xlsx|xls|xlsm|ods)$/.test(e)) return 'xlsx';
  if (e === 'csv' || e === 'tsv') return 'csv';
  if (e === 'pptx') return 'pptx';
  if (/^(html?|xhtml)$/.test(e)) return 'html';
  if (/^(md|markdown)$/.test(e)) return 'md';
  if (e === 'epub') return 'epub';
  if (/^audio\//.test(t) || /^(mp3|wav|m4a|ogg|flac|aac|webm|opus)$/.test(e)) return 'audio';
  if (e === 'txt') return 'txt';
  if (e === 'zip') return 'zip';
  return 'other';
};
const SUGGEST = {
  pdf: ['merge', 'split', 'compress', 'organize', 'rotate', 'edit', 'sign', 'fill-forms', 'redact', 'watermark', 'page-numbers', 'pdf-to-images', 'extract-text', 'pdf-to-word', 'encrypt', 'ocr', 'summarize', 'chat'],
  image: ['images-to-pdf', 'remove-bg', 'scan', 'remove-image-watermark', 'thumbmark', 'handwriting-to-pdf'],
  docx: ['word-to-pdf'], xlsx: ['excel-to-pdf'], csv: ['csv-pdf'], pptx: ['pptx-to-pdf'], html: ['html-to-pdf'], md: ['markdown-to-pdf'], epub: ['ebook-to-pdf'], audio: ['audio-to-pdf'], txt: ['create-pdf', 'text-to-handwriting'], zip: [], other: [],
};
W.chooseForFiles = function (files) {
  files = Array.from(files); if (!files.length) return;
  const kinds = [...new Set(files.map(W.kindOf))];
  let ids = [];
  kinds.forEach((k) => (SUGGEST[k] || []).forEach((id) => { if (!ids.includes(id)) ids.push(id); }));
  if (kinds.length === 1 && kinds[0] === 'pdf' && files.length === 1) ids = ids.filter((i) => i !== 'merge' || true);
  const tools = ids.map((id) => W.byId[id]).filter(Boolean);
  if (!tools.length) { W.toast('No tool handles ' + (files[0].name.split('.').pop() || 'this') + ' files yet.', 'err'); return; }
  const m = W.modal({
    title: files.length === 1 ? 'What would you like to do with ' + files[0].name + '?' : `What would you like to do with ${files.length} files?`, wide: true,
    body: h('div.grid.compact', tools.map((t) => { const c = W.catById[t.cat]; return h('button.card.tcard.btnlike', { style: `--h:${c.hue}`, onclick: () => { m.close(); W.go(t.id, files); } }, h('span.tile', { html: ic(t.icon, 20) }), h('span.tc-txt', h('span.tc-name', t.name), h('span.tc-desc', t.desc))); })),
  });
};
W.go = function (toolId, files) { W.carry = files && files.length ? { tool: toolId, files: Array.from(files) } : null; if (location.hash === '#/t/' + toolId) route(); else location.hash = '#/t/' + toolId; };
W.takeCarry = function (toolId) { const c = W.carry; if (c && c.tool === toolId) { W.carry = null; return c.files; } return []; };

function pickFiles({ accept = '', multiple = true } = {}) {
  return new Promise((resolve) => {
    const i = h('input', { type: 'file', multiple, accept, style: 'display:none' });
    i.addEventListener('change', () => { resolve(Array.from(i.files)); i.remove(); });
    i.addEventListener('cancel', () => { resolve([]); i.remove(); });
    document.body.appendChild(i); i.click();
  });
}
W.pickFiles = pickFiles;

// ---------- shell ----------
W.mountShell = function () {
  const app = $('#app');
  app.innerHTML = '';
  app.appendChild(h('div.shell',
    h('header.top',
      h('button.icon-btn.menu-btn', { 'aria-label': 'Menu', html: ic('menu', 20), onclick: () => document.body.classList.toggle('nav-open') }),
      h('a.brand', { href: '#/', 'aria-label': 'Wrangl home' }, h('span.logo', { html: LOGO_SVG }), h('span.wm', 'Wrangl')),
      h('button.searchbtn', { onclick: W.openSearch, 'aria-label': 'Search tools', html: `${ic('search', 16)}<span>Search tools</span><kbd>${U.isMac ? '⌘' : 'Ctrl'} K</kbd>` }),
      h('nav.topnav', h('a', { href: '#/' }, 'Dashboard'), h('a', { href: '#/recent' }, 'Recent workspace'), h('a', { href: '#/favs' }, 'Favourites')),
      h('button.icon-btn#themeBtn', { 'aria-label': 'Toggle theme', onclick: () => W.theme.cycle() })),
    h('div.body', h('aside#side.side', { 'aria-label': 'Tools' }), h('main#main.main')),
    h('div.scrim', { onclick: () => document.body.classList.remove('nav-open') })));
  W.theme.set(W.theme.get());
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', (e) => {
    const tg = e.target, typing = tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable);
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); W.openSearch(); }
    else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); W.openSearch(); }
  });
  // drop files anywhere on the dashboard -> suggest tools
  let dragN = 0; const ov = h('div.drop-ov', h('div', { html: ic('upload-cloud', 40) }), h('b', 'Drop files to get started'), h('span', 'We’ll suggest the right tool'));
  const onDash = () => (location.hash.replace(/^#/, '') || '/').split('?')[0] === '/';
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  window.addEventListener('dragenter', (e) => { if (!onDash() || !hasFiles(e)) return; dragN++; document.body.appendChild(ov); });
  window.addEventListener('dragleave', (e) => { if (!onDash()) return; dragN = Math.max(0, dragN - 1); if (!dragN) ov.remove(); });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => { dragN = 0; ov.remove(); if (!hasFiles(e)) return; e.preventDefault(); if (onDash()) W.chooseForFiles(e.dataTransfer.files); });
};
