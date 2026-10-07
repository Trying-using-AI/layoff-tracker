// ===== Create & convert to PDF: HTML, Markdown, rich text, Word, Excel, CSV, EPUB, images =====
{
  W.pageFields = (def = {}) => [
    { type: 'row', children: [
      { id: 'size', type: 'select', label: 'Page size', options: P.sizeOpts, value: def.size || 'A4' },
      { id: 'orient', type: 'select', label: 'Orientation', options: [['portrait', 'Portrait'], ['landscape', 'Landscape']], value: def.orient || 'portrait' },
      { id: 'margin', type: 'select', label: 'Margins', options: [[8, 'Narrow (8 mm)'], [15, 'Compact (15 mm)'], [20, 'Normal (20 mm)'], [30, 'Wide (30 mm)']], value: def.margin || 20 },
    ] },
    { id: 'numbers', type: 'check', label: 'Add page numbers', value: !!def.numbers },
  ];
  W.pageSetup = (o) => { let [w, hh] = P.SIZES[o.size || 'A4']; if (o.orient === 'landscape') [w, hh] = [hh, w]; const m = U.mmToPt(+(o.margin || 20)); return { page: [w, hh], margin: [m, m, m, m], numbers: !!o.numbers }; };
  const textFile = (f) => f.text();
  const stripScripts = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<(iframe|object|embed)[\s\S]*?<\/\1>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '');

  // preview iframe helper
  function previewPanel(api, title = 'Preview') {
    const fr = h('iframe.doc-prev', { sandbox: '', title: 'Document preview' });
    const box = h('section.card.pad', h('h3.card-h', title), h('div.prev-wrap', fr)); api.panelHost.appendChild(box); api.prevFrame = fr; api.prevBox = box;
    return (html) => { fr.srcdoc = html; };
  }

  // ================= HTML TO PDF =================
  W.simpleTool({
    id: 'html-to-pdf', cat: 'create', name: 'HTML to PDF', icon: 'file-code-2', action: 'Convert to PDF', actionIcon: 'file-code-2',
    desc: 'Convert HTML with print layout and CSS support.', keys: 'web page website code css html5 print',
    files: { multi: false, min: 0, accept: '.html,.htm,.xhtml,text/html', kind: 'html', title: 'Drop an HTML file (optional)', hint: 'or paste HTML below', dzIcon: 'file-code-2', heading: 'HTML file (optional)' },
    opts: [
      { id: 'html', type: 'textarea', label: 'Or paste HTML', rows: 8, value: '<h1>Hello from Wrangl</h1>\n<p>Edit this HTML, or drop an .html file above. <b>CSS</b> in a <code>&lt;style&gt;</code> block is supported.</p>', help: 'Self-contained HTML works best (inline CSS, data-URI images). Linked online resources load only when you’re online.' },
      ...W.pageFields(),
    ],
    setup(root, api) { api.setPrev = previewPanel(api); api.cur = ''; api.refresh = U.debounce(async () => { const it = api.fl.items[0]; const src = it ? await it.file.text() : api.vals.html; api.cur = src; api.setPrev(stripScripts(src)); }, 250); api.refresh(); },
    onFiles: (items, api) => api.refresh && api.refresh(), onOpt: (v, id, api) => id === 'html' && api.refresh && api.refresh(),
    async run(items, o, ctx) {
      const src = stripScripts(items[0] ? await items[0].file.text() : o.html); if (!src.trim()) throw new Error('Paste some HTML or choose a file.');
      const full = /<html|<body|<!doctype/i.test(src) ? src : W.wrapDoc(src);
      const m = /<title>([^<]*)<\/title>/i.exec(src);
      const bytes = await W.htmlToPdf(Object.assign({ html: full, title: m && m[1].trim(), onProgress: ctx.progress }, W.pageSetup(o)));
      return [P.outPdf(bytes, (items[0] ? U.safeName(U.base(items[0].name)) : 'page') + '.pdf')];
    },
  });

  // ================= MARKDOWN TO PDF =================
  const MD_THEMES = {
    clean: '',
    book: 'body{font-family:"Times New Roman","Liberation Serif",serif;font-size:12pt;line-height:1.6}h1,h2,h3,h4{font-family:"Times New Roman","Liberation Serif",serif}h1{text-align:center;font-size:26pt}p{text-align:justify}',
    github: 'body{font-size:10.5pt}h1,h2{border-bottom:1px solid #d8d8d0;padding-bottom:.25em}h1{font-size:24pt}h2{font-size:18pt}pre{background:#f6f8fa}',
    compact: 'body{font-size:9.5pt;line-height:1.38}h1{font-size:17pt}h2{font-size:13.5pt}h3{font-size:11.5pt}p,ul,ol{margin-bottom:.5em}',
  };
  W.mdToHtml = async (md) => { const marked = await W.lib('marked'); return stripScripts(marked.parse(md, { gfm: true, breaks: false })); };
  W.simpleTool({
    id: 'markdown-to-pdf', cat: 'create', name: 'Markdown to PDF', icon: 'file-type', action: 'Convert to PDF', actionIcon: 'file-type',
    desc: 'Turn Markdown into a document with readable typography.', keys: 'md readme notes docs github commonmark',
    files: { multi: false, min: 0, accept: '.md,.markdown,.txt,text/markdown,text/plain', kind: 'md', title: 'Drop a .md file (optional)', hint: 'or type / paste Markdown below', dzIcon: 'file-type', heading: 'Markdown file (optional)' },
    opts: [
      { id: 'md', type: 'textarea', label: 'Markdown', rows: 12, spell: true, value: '# Hello, Wrangl\n\nWrite **Markdown** here, or drop a file above.\n\n- Lists\n- *Emphasis* and `code`\n- [Links](https://example.com)\n\n| Feature | Works |\n|---|---|\n| Tables | yes |\n\n> Quotes and fenced code blocks work too.\n' },
      { id: 'theme', type: 'seg', label: 'Style', options: [['clean', 'Clean'], ['book', 'Book'], ['github', 'GitHub'], ['compact', 'Compact']], value: 'clean' },
      ...W.pageFields(),
    ],
    setup(root, api) { api.setPrev = previewPanel(api); api.refresh = U.debounce(async () => { const it = api.fl.items[0]; const md = it ? await it.file.text() : api.vals.md; api.setPrev(W.wrapDoc(await W.mdToHtml(md), { css: MD_THEMES[api.vals.theme] + 'body{padding:18px}' })); }, 250); api.refresh(); },
    onFiles: (items, api) => api.refresh && api.refresh(), onOpt: (v, id, api) => (id === 'md' || id === 'theme') && api.refresh && api.refresh(),
    async run(items, o, ctx) {
      const md = items[0] ? await items[0].file.text() : o.md; if (!md.trim()) throw new Error('Write or paste some Markdown first.');
      const html = W.wrapDoc(await W.mdToHtml(md), { css: MD_THEMES[o.theme] }); const t = /^#\s+(.+)$/m.exec(md);
      const bytes = await W.htmlToPdf(Object.assign({ html, title: t && t[1], onProgress: ctx.progress }, W.pageSetup(o)));
      return [P.outPdf(bytes, (items[0] ? U.safeName(U.base(items[0].name)) : 'document') + '.pdf')];
    },
  });

  // ================= CREATE A PDF (rich text) =================
  W.tool({
    id: 'create-pdf', cat: 'create', name: 'Create a PDF', icon: 'file-plus-2', desc: 'Start with your words and make a new document.',
    keys: 'write type editor document letter new blank text rich word processor notes',
    async render(root) {
      const opts = W.fields([{ id: 'title', type: 'text', label: 'Document title (optional)', placeholder: 'Untitled' }, ...W.pageFields({ margin: 20 })]);
      const prog = W.progress(); const results = h('div.results');
      const ed = h('div.rte', { contentEditable: 'true', spellcheck: 'true', 'aria-label': 'Document text', html: '<h1>Untitled document</h1><p>Start typing here… Use the toolbar for headings, lists, tables, images and more.</p>' });
      const cmd = (c, v) => { ed.focus(); document.execCommand(c, false, v); };
      const btn = (icon, title, fn) => h('button.icon-btn', { type: 'button', title, 'aria-label': title, html: ic(icon, 17), onmousedown: (e) => e.preventDefault(), onclick: fn });
      const sel = (opts2, fn, title) => h('select.in.sm', { title, 'aria-label': title, onchange: (e) => { fn(e.target.value); e.target.selectedIndex = 0; ed.focus(); } }, opts2.map(([v, l]) => h('option', { value: v }, l)));
      const color = (title, ic2, fn) => h('label.rte-c', { title }, h('span', { html: ic(ic2, 16) }), h('input', { type: 'color', value: '#c62828', onchange: (e) => fn(e.target.value) }));
      const tb = h('div.rte-bar',
        sel([['', 'Style'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['p', 'Paragraph'], ['blockquote', 'Quote'], ['pre', 'Code block']], (v) => v && cmd('formatBlock', v), 'Paragraph style'),
        sel([['', 'Font'], ['Arial', 'Sans'], ['Times New Roman', 'Serif'], ['Courier New', 'Mono']], (v) => v && cmd('fontName', v), 'Font'),
        sel([['', 'Size'], ['2', 'Small'], ['3', 'Normal'], ['4', 'Large'], ['5', 'X-large'], ['6', 'Huge']], (v) => v && cmd('fontSize', v), 'Font size'),
        h('span.og-sep'),
        btn('bold', 'Bold (Ctrl+B)', () => cmd('bold')), btn('italic', 'Italic (Ctrl+I)', () => cmd('italic')), btn('underline', 'Underline (Ctrl+U)', () => cmd('underline')), btn('strikethrough', 'Strikethrough', () => cmd('strikeThrough')),
        color('Text colour', 'baseline', (c) => cmd('foreColor', c)), color('Highlight', 'highlighter', (c) => cmd('hiliteColor', c)),
        h('span.og-sep'),
        btn('list', 'Bulleted list', () => cmd('insertUnorderedList')), btn('list-ordered', 'Numbered list', () => cmd('insertOrderedList')),
        btn('align-left', 'Align left', () => cmd('justifyLeft')), btn('align-center', 'Centre', () => cmd('justifyCenter')), btn('align-right', 'Align right', () => cmd('justifyRight')), btn('align-justify', 'Justify', () => cmd('justifyFull')),
        h('span.og-sep'),
        btn('link', 'Insert link', async () => { const sel0 = getSelection(); const rng = sel0.rangeCount ? sel0.getRangeAt(0).cloneRange() : null; const u = await W.ask('Insert link', 'Web address', { placeholder: 'https://', ok: 'Insert' }); if (u) { ed.focus(); if (rng) { sel0.removeAllRanges(); sel0.addRange(rng); } cmd('createLink', /^[a-z]+:/i.test(u) ? u : 'https://' + u); } }),
        btn('table', 'Insert table', () => { const r = +prompt('Rows', '3') || 0, c = +prompt('Columns', '3') || 0; if (r && c) cmd('insertHTML', '<table>' + ('<tr>' + '<td>&nbsp;</td>'.repeat(c) + '</tr>').repeat(r) + '</table><p></p>'); }),
        btn('image-plus', 'Insert image', async () => { const f = await W.pickFiles({ accept: 'image/*', multiple: false }); if (f[0]) { const url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f[0]); }); cmd('insertHTML', `<img src="${url}" style="max-width:100%">`); } }),
        btn('minus', 'Horizontal line', () => cmd('insertHorizontalRule')), btn('remove-formatting', 'Clear formatting', () => cmd('removeFormat')),
        btn('undo-2', 'Undo', () => cmd('undo')), btn('redo-2', 'Redo', () => cmd('redo')));
      const go = h('button.btn.primary.lg', { html: ic('file-down', 18) + '<span>Create PDF</span>', onclick: async () => {
        go.disabled = true; results.innerHTML = '';
        try { const o = opts.vals; const html = W.wrapDoc(ed.innerHTML.replace(/<font[^>]*size="(\d)"[^>]*>/g, (m, n) => `<font style="font-size:${[0, 8, 10, 12, 14, 18, 24, 32][+n]}pt">`), { css: 'font{line-height:inherit}' }); const t = o.title || (/<h1[^>]*>([^<]+)</.exec(ed.innerHTML) || [])[1] || 'Document';
          prog.set(0.05, 'Laying out'); const bytes = await W.htmlToPdf(Object.assign({ html, title: t, onProgress: (f, l) => prog.set(f, l) }, W.pageSetup(o))); prog.hide();
          await W.showResults(results, [P.outPdf(bytes, U.safeName(t) + '.pdf')], { tool: W.byId['create-pdf'] }); }
        catch (e) { prog.hide(); console.error(e); results.appendChild(h('div.errbox', h('b', 'Something went wrong'), h('p', W.friendlyError(e)))); } finally { go.disabled = false; } } });
      root.append(h('section.card.pad', h('h3.card-h', h('span.step', '1'), 'Write'), tb, ed), h('section.card.pad', h('h3.card-h', h('span.step', '2'), 'Page setup'), opts.el), h('div.action-wrap', h('div.actions', go)), prog.el, results);
      const carried = W.takeCarry('create-pdf'); if (carried.length) { const f = carried[0]; ed.innerText = await f.text(); }
    },
  });

  // ================= WORD TO PDF =================
  async function docxPage(buf) {
    try { const JSZip = await W.lib('jszip'); const z = await JSZip.loadAsync(buf); const xml = await z.file('word/document.xml').async('string'); const sz = /<w:pgSz[^>]*>/.exec(xml), mg = /<w:pgMar[^>]*>/.exec(xml); if (!sz) return null; const g = (s, k) => { const m = new RegExp(k + '="(-?\\d+)"').exec(s || ''); return m ? +m[1] / 20 : null; }; const w = g(sz[0], 'w:w'), hh = g(sz[0], 'w:h'); if (!w || !hh) return null; const orient = /w:orient="landscape"/.test(sz[0]);
      return { page: orient && w < hh ? [hh, w] : [w, hh], margin: [g(mg && mg[0], 'w:top') || 56, g(mg && mg[0], 'w:right') || 56, g(mg && mg[0], 'w:bottom') || 56, g(mg && mg[0], 'w:left') || 56].map((x) => Math.abs(x)) }; } catch { return null; }
  }
  W.docxToHtml = async function (file) {
    const mammoth = await W.lib('mammoth'); const arrayBuffer = await file.arrayBuffer();
    const r = await mammoth.convertToHtml({ arrayBuffer }, { includeDefaultStyleMap: true, styleMap: ["p[style-name='Title'] => h1.doc-title:fresh", "p[style-name='Subtitle'] => p.doc-sub:fresh", "u => u", "strike => s", "p[style-name='Quote'] => blockquote:fresh", "p[style-name='Intense Quote'] => blockquote:fresh", "p[style-name='Code'] => pre:fresh"],
      convertImage: mammoth.images.imgElement((img) => img.read('base64').then((d) => ({ src: `data:${img.contentType};base64,${d}` }))) });
    return { html: stripScripts(r.value), messages: r.messages, arrayBuffer };
  };
  W.simpleTool({
    id: 'word-to-pdf', cat: 'create', name: 'Word to PDF', icon: 'file-text', action: 'Convert to PDF', actionIcon: 'file-text',
    desc: 'Convert Word documents with text, images, and tables.', keys: 'docx doc microsoft office document convert',
    badges: ['.docx'],
    files: { multi: true, min: 1, accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'docx', title: 'Drop Word documents (.docx)', dzIcon: 'file-text' },
    opts: [{ id: 'useDoc', type: 'check', label: 'Use each document’s own page size and margins', value: true }, ...W.pageFields().map((f) => (f.show ? f : Object.assign({}, f, { show: (v) => !v.useDoc }))), { id: 'css', type: 'info', html: 'Text, headings, lists, tables, images and links are converted. Fonts, columns, text boxes and headers/footers are simplified — for pixel-perfect output use Word’s own “Save as PDF”.' }],
    async run(items, o, ctx) {
      const outs = [];
      for (let i = 0; i < items.length; i++) {
        ctx.check(); const it = items[i]; ctx.progress(i / items.length, `Reading ${it.name}`);
        const { html, arrayBuffer, messages } = await W.docxToHtml(it.file); const dp = o.useDoc ? await docxPage(arrayBuffer) : null; const setup = dp ? { page: dp.page, margin: dp.margin, numbers: o.numbers } : W.pageSetup(o);
        const bytes = await W.htmlToPdf(Object.assign({ html: W.wrapDoc(html, { css: '.doc-title{font-size:24pt;margin-top:0}.doc-sub{font-size:13pt;color:#555}' }), title: U.base(it.name), onProgress: (f, l) => ctx.progress((i + f) / items.length, it.name + ': ' + l) }, setup));
        outs.push(P.outPdf(bytes, U.safeName(U.base(it.name)) + '.pdf'));
      }
      return outs;
    },
  });

  // ================= EXCEL TO PDF =================
  const esc = U.esc;
  W.sheetToHtml = function (ws, XLSX, { grid = true, header = true } = {}) {
    if (!ws['!ref']) return '<p><i>(empty sheet)</i></p>';
    const rg = XLSX.utils.decode_range(ws['!ref']); const merges = ws['!merges'] || []; const skip = new Set(); const span = new Map();
    merges.forEach((m) => { span.set(m.s.r + ',' + m.s.c, [m.e.r - m.s.r + 1, m.e.c - m.s.c + 1]); for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) if (r !== m.s.r || c !== m.s.c) skip.add(r + ',' + c); });
    // trim trailing empty rows/cols
    let maxR = rg.s.r, maxC = rg.s.c; for (let r = rg.s.r; r <= rg.e.r; r++) for (let c = rg.s.c; c <= rg.e.c; c++) { const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (cell && cell.v !== undefined && cell.v !== '') { if (r > maxR) maxR = r; if (c > maxC) maxC = c; } }
    let out = '<table class="sheet' + (grid ? '' : ' nogrid') + '">';
    for (let r = rg.s.r; r <= maxR; r++) {
      out += '<tr>';
      for (let c = rg.s.c; c <= maxC; c++) {
        const k = r + ',' + c; if (skip.has(k)) continue; const cell = ws[XLSX.utils.encode_cell({ r, c })]; const sp = span.get(k);
        const txt = cell ? (cell.w != null ? cell.w : cell.v != null ? String(cell.v) : '') : ''; const isNum = cell && cell.t === 'n';
        const tag = header && r === rg.s.r ? 'th' : 'td';
        out += `<${tag}${sp ? ` rowspan="${sp[0]}" colspan="${sp[1]}"` : ''}${isNum ? ' class="n"' : ''}>${esc(txt)}</${tag}>`;
      }
      out += '</tr>';
    }
    return out + '</table>';
  };
  const SHEET_CSS = 'body{font-size:9pt;line-height:1.3}h2.sn{font-size:13pt;margin:0 0 6px}table.sheet td,table.sheet th{padding:2px 6px;white-space:nowrap;border:1px solid #c9c9c9}table.sheet th{background:#efefea}table.sheet td.n{text-align:right}table.nogrid td,table.nogrid th{border-color:transparent}table.nogrid th{background:none}.sheetbox{break-before:page}.sheetbox:first-child{break-before:auto}';
  W.simpleTool({
    id: 'excel-to-pdf', cat: 'create', name: 'Excel to PDF', icon: 'sheet', action: 'Convert to PDF', actionIcon: 'sheet',
    desc: 'Print spreadsheet sheets, tables, and charts.', keys: 'xlsx xls ods spreadsheet workbook sheet table microsoft csv',
    badges: ['Tables & values'],
    files: { multi: false, min: 1, accept: '.xlsx,.xls,.xlsm,.ods,.csv,.tsv', kind: 'xlsx', title: 'Drop a spreadsheet (.xlsx, .xls, .ods, .csv)', dzIcon: 'sheet' },
    opts: [
      { id: 'sheets', type: 'text', label: 'Sheets to include (optional)', placeholder: 'All sheets — or names / numbers e.g. 1, Sales' },
      { id: 'grid', type: 'check', label: 'Show cell gridlines', value: true }, { id: 'header', type: 'check', label: 'Style the first row as a header', value: true },
      { id: 'fit', type: 'check', label: 'Shrink wide sheets to fit the page width', value: true }, { id: 'names', type: 'check', label: 'Print the sheet name above each sheet', value: true },
      ...W.pageFields({ orient: 'landscape', margin: 15 }), { id: 'note', type: 'info', html: 'Cell values and merged cells are printed as displayed. Charts, images and conditional colours aren’t included.' },
    ],
    async run(items, o, ctx) {
      const XLSX = await W.lib('xlsx'); const it = items[0]; const wb = XLSX.read(await it.buf(), { type: 'array', cellDates: true });
      let names = wb.SheetNames; if (o.sheets.trim()) { const want = o.sheets.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean); names = names.filter((n, i) => want.includes(n.toLowerCase()) || want.includes(String(i + 1))); if (!names.length) throw new Error('None of those sheet names/numbers exist. Sheets: ' + wb.SheetNames.join(', ')); }
      const setup = W.pageSetup(o); const contentW = (setup.page[0] - setup.margin[1] - setup.margin[3]) / W.PX;
      let scale = 1;
      const build = (s) => names.map((n) => `<div class="sheetbox">${o.names ? `<h2 class="sn">${esc(n)}</h2>` : ''}${W.sheetToHtml(wb.Sheets[n], XLSX, o)}</div>`).join('').replace(/<table/g, '<table style="font-size:' + (9 * s) + 'pt"') ;
      const css = (s) => SHEET_CSS.replace(/padding:2px 6px/, `padding:${(2 * s).toFixed(2)}px ${(6 * s).toFixed(2)}px`);
      if (o.fit) { // measure widest table, then shrink
        const fr = await W.mountFrame(W.wrapDoc(build(1), { css: css(1) }), 4000); try { const tabs = Array.from(fr.contentDocument.querySelectorAll('table')); const wmax = Math.max(...tabs.map((t) => t.getBoundingClientRect().width), 1); if (wmax > contentW) scale = Math.max(0.35, (contentW / wmax) * 0.985); } finally { fr.remove(); }
      }
      const bytes = await W.htmlToPdf(Object.assign({ html: W.wrapDoc(build(scale), { css: css(scale) }), title: U.base(it.name), onProgress: ctx.progress }, setup));
      return { outputs: [P.outPdf(bytes, U.safeName(U.base(it.name)) + '.pdf')], note: `${U.plural(names.length, 'sheet')}${scale < 1 ? ` · shrunk to ${Math.round(scale * 100)}% to fit` : ''}` };
    },
  });

  // ================= CSV <-> PDF =================
  W.csv = {
    parse(text) {
      text = text.replace(/^﻿/, ''); const first = text.split(/\r?\n/, 1)[0] || ''; const cand = [',', ';', '\t', '|']; const d = cand.map((c) => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
      const rows = []; let row = [], cur = '', q = false;
      for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === d) { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c; }
      if (cur !== '' || row.length) { row.push(cur); rows.push(row); } return rows.filter((r) => r.length > 1 || (r[0] || '').trim() !== '');
    },
    stringify: (rows) => rows.map((r) => r.map((v) => { v = String(v ?? ''); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n'),
  };
  W.simpleTool({
    id: 'csv-pdf', cat: 'create', name: 'CSV ↔ PDF', icon: 'table', action: 'Convert', actionIcon: 'table',
    desc: 'Convert tables to PDFs or extract them as CSV.', keys: 'csv tsv table data extract spreadsheet rows columns convert',
    files: { multi: false, min: 1, accept: '.csv,.tsv,.txt,.pdf,text/csv,application/pdf', kind: 'csv', title: 'Drop a CSV (→ PDF) or a PDF (→ CSV)', dzIcon: 'table' },
    opts: (items) => { const isPdf = items[0] && items[0].kind === 'pdf'; return isPdf ? [{ id: 'info', type: 'info', html: 'Tables are detected from the text layout of each page and saved as CSV. Scanned pages need OCR first.' }, { id: 'combine', type: 'check', label: 'Combine all pages into one CSV', value: true }] : [{ id: 'title', type: 'text', label: 'Title above the table (optional)' }, { id: 'header', type: 'check', label: 'First row is a header', value: true }, { id: 'zebra', type: 'check', label: 'Alternate row shading', value: true }, { id: 'fs', type: 'number', label: 'Font size', value: 10, min: 5, max: 20, unit: 'pt' }, ...W.pageFields({ orient: 'landscape', margin: 15 })]; },
    async run(items, o, ctx) {
      const it = items[0];
      if (it.kind === 'pdf') {
        const tabs = await W.pdf.extractTables(it, (f) => ctx.progress(f, 'Detecting tables')); const base = U.safeName(U.base(it.name));
        if (!tabs.some((t) => t.rows.length)) throw new Error('No table-like text was found. If this is a scan, run “Searchable PDF (OCR)” first.');
        if (o.combine) return [W.out(base + '.csv', new Blob(['﻿' + W.csv.stringify(tabs.flatMap((t) => t.rows))], { type: 'text/csv' }))];
        return tabs.filter((t) => t.rows.length).map((t) => W.out(`${base}-page-${t.page + 1}.csv`, new Blob(['﻿' + W.csv.stringify(t.rows)], { type: 'text/csv' })));
      }
      const rows = W.csv.parse(await it.file.text()); if (!rows.length) throw new Error('That file has no rows.');
      const w = Math.max(...rows.map((r) => r.length)); const body = rows.map((r, i) => '<tr>' + Array.from({ length: w }, (_, c) => { const v = r[c] ?? ''; const num = /^-?[\d,.]+%?$/.test(v.trim()) && v.trim() !== ''; return `<${o.header && i === 0 ? 'th' : 'td'}${num ? ' class="n"' : ''}>${esc(v)}</${o.header && i === 0 ? 'th' : 'td'}>`; }).join('') + '</tr>').join('');
      const css = `body{font-size:${o.fs}pt;line-height:1.3}table{width:100%}td,th{padding:3px 6px;border:1px solid #cfcfc8}th{background:#e9e9e2}td.n{text-align:right}${o.zebra ? 'tr:nth-child(even) td{background:#f7f7f3}' : ''}`;
      const bytes = await W.htmlToPdf(Object.assign({ html: W.wrapDoc((o.title ? `<h2>${esc(o.title)}</h2>` : '') + `<table>${body}</table>`, { css }), title: o.title || U.base(it.name), onProgress: ctx.progress }, W.pageSetup(o)));
      return { outputs: [P.outPdf(bytes, U.safeName(U.base(it.name)) + '.pdf')], note: `${rows.length} rows × ${w} columns` };
    },
  });

  // ================= EPUB TO PDF =================
  const MIMES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' };
  const joinPath = (base, rel) => { if (/^(data:|https?:)/i.test(rel)) return rel; const parts = (rel.startsWith('/') ? rel.slice(1) : base.replace(/[^/]*$/, '') + rel).split('/'); const out = []; for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(decodeURIComponent(p)); } return out.join('/'); };
  W.epubToHtml = async function (file, { ownCss = false } = {}) {
    const JSZip = await W.lib('jszip'); const z = await JSZip.loadAsync(await file.arrayBuffer());
    const cont = await z.file('META-INF/container.xml').async('string'); const opfPath = /full-path="([^"]+)"/.exec(cont)[1]; const opf = new DOMParser().parseFromString(await z.file(opfPath).async('string'), 'application/xml');
    const q = (d, sel) => Array.from(d.querySelectorAll(sel)); const man = {}; q(opf, 'manifest > item').forEach((i) => (man[i.getAttribute('id')] = { href: i.getAttribute('href'), type: i.getAttribute('media-type'), props: i.getAttribute('properties') || '' }));
    const spine = q(opf, 'spine > itemref').map((r) => man[r.getAttribute('idref')]).filter((m) => m && /html/.test(m.type));
    const meta = (n) => { const e = opf.getElementsByTagName('dc:' + n)[0] || opf.getElementsByTagNameNS('*', n)[0]; return e ? e.textContent.trim() : ''; };
    let css = ''; let chapters = [];
    for (const m of spine) {
      const path = joinPath(opfPath, m.href); const f = z.file(path); if (!f) continue; const txt = await f.async('string');
      let d = new DOMParser().parseFromString(txt, 'application/xhtml+xml'); if (d.querySelector('parsererror')) d = new DOMParser().parseFromString(txt, 'text/html');
      if (ownCss) for (const l of Array.from(d.querySelectorAll('link[rel~=stylesheet]'))) { const sp = joinPath(path, l.getAttribute('href') || ''); const sf = z.file(sp); if (sf) css += (await sf.async('string')) + '\n'; }
      const body = d.body || d.getElementsByTagName('body')[0]; if (!body) continue;
      body.querySelectorAll('script,style,link,iframe,object,nav[epub\\:type=toc],nav[*|type=toc]').forEach((n) => n.remove());
      for (const im of Array.from(body.querySelectorAll('img,image'))) { const attr = im.hasAttribute('src') ? 'src' : im.hasAttribute('href') ? 'href' : 'xlink:href'; const src = im.getAttribute(attr); if (!src) continue; const ip = joinPath(path, src.split('#')[0]); const ifile = z.file(ip); if (ifile) { const b64 = await ifile.async('base64'); const ext = ip.split('.').pop().toLowerCase(); im.setAttribute(attr === 'xlink:href' ? 'href' : attr, `data:${MIMES[ext] || 'image/png'};base64,${b64}`); } }
      chapters.push(`<section class="chapter">${stripScripts(body.innerHTML.replace(/ xmlns(:\w+)?="[^"]*"/g, ''))}</section>`);
    }
    return { html: chapters.join('\n'), css, title: meta('title') || U.base(file.name), author: meta('creator') };
  };
  W.simpleTool({
    id: 'ebook-to-pdf', cat: 'create', name: 'Ebook to PDF', icon: 'book-open', action: 'Convert to PDF', actionIcon: 'book-open',
    desc: 'Convert DRM-free ebooks with chapter structure.', keys: 'epub kindle book reader novel chapters',
    badges: ['.epub (no DRM)'],
    files: { multi: false, min: 1, accept: '.epub,application/epub+zip', kind: 'epub', title: 'Drop an .epub book', dzIcon: 'book-open' },
    opts: [
      { id: 'title', type: 'check', label: 'Add a title page', value: true }, { id: 'own', type: 'check', label: 'Use the book’s own styling (may look odd)', value: false },
      { id: 'fs', type: 'number', label: 'Body font size', value: 11, min: 8, max: 18, unit: 'pt' }, { id: 'serif', type: 'check', label: 'Serif typeface', value: true },
      ...W.pageFields({ size: 'A5', margin: 15, numbers: true }),
    ],
    async run(items, o, ctx) {
      const it = items[0]; ctx.progress(0.05, 'Reading book'); const bk = await W.epubToHtml(it.file, { ownCss: o.own });
      const css = `body{font-size:${o.fs}pt;line-height:1.55;${o.serif ? 'font-family:"Times New Roman","Liberation Serif",serif;' : ''}}.chapter{break-before:page}.chapter:first-of-type{break-before:auto}p{margin:0 0 .6em;text-align:justify}img{max-width:100%;max-height:600px}.tp{text-align:center;padding-top:30%;break-after:page}.tp h1{font-size:30pt;margin-bottom:.2em}${o.own ? bk.css : ''}`;
      const tp = o.title ? `<div class="tp"><h1>${esc(bk.title)}</h1><p style="text-align:center;font-size:14pt;color:#555">${esc(bk.author)}</p></div>` : '';
      const bytes = await W.htmlToPdf(Object.assign({ html: W.wrapDoc(tp + bk.html, { css }), title: bk.title, author: bk.author, onProgress: (f, l) => ctx.progress(0.1 + f * 0.9, l) }, W.pageSetup(o)));
      return [P.outPdf(bytes, U.safeName(bk.title) + '.pdf')];
    },
  });

  // ================= IMAGES TO PDF =================
  const exifOrient = (b) => { try { if (b[0] !== 0xFF || b[1] !== 0xD8) return 1; let i = 2; while (i < b.length) { if (b[i] !== 0xFF) break; const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3]; if (m === 0xE1 && b[i + 4] === 0x45 && b[i + 5] === 0x78) { const t = i + 10; const le = b[t] === 0x49; const r16 = (o) => le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]; const r32 = (o) => le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]); const ifd = t + r32(t + 4); const n = r16(ifd); for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (r16(e) === 0x0112) return r16(e + 8); } return 1; } i += 2 + len; } } catch { } return 1; };
  W.imagesToPdf = async function (files, o, ctx = { progress() { }, check() { } }) {
    const doc = await P.create(); const { rgb } = PDFLib; const bg = await P.rgb(o.bg || '#ffffff'); const mar = U.mmToPt(o.margin || 0);
    for (let i = 0; i < files.length; i++) {
      ctx.check(); ctx.progress(i / files.length, `Image ${i + 1} of ${files.length}`);
      const f = files[i].file || files[i]; let bytes = new Uint8Array(await f.arrayBuffer()); let emb, iw, ih;
      const isJpg = /jpe?g/i.test(f.type) || /\.jpe?g$/i.test(f.name), isPng = /png/i.test(f.type) || /\.png$/i.test(f.name);
      const orient = isJpg ? exifOrient(bytes) : 1;
      if (isJpg && orient === 1 && !o.recompress) { emb = await doc.embedJpg(bytes); }
      else if (isPng && !o.recompress) { emb = await doc.embedPng(bytes); }
      else {
        const im = await U.fileImage(f); let w = im.naturalWidth, hh = im.naturalHeight; const max = o.recompress ? +o.maxPx || 2400 : 6000; const sc = Math.min(1, max / Math.max(w, hh)); const c = W.canvas(w * sc, hh * sc); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(im._url);
        const png = isPng && !o.recompress; const blob = await U.canvasBlob(c, png ? 'image/png' : 'image/jpeg', (o.quality || 85) / 100); const b2 = new Uint8Array(await blob.arrayBuffer()); emb = png ? await doc.embedPng(b2) : await doc.embedJpg(b2);
      }
      iw = emb.width; ih = emb.height;
      let pw, ph;
      if (o.size === 'fit') { pw = iw * 0.75 + 2 * mar; ph = ih * 0.75 + 2 * mar; if (o.maxPage) { const s = Math.min(1, 1200 / Math.max(pw, ph)); pw *= s; ph *= s; } }
      else { [pw, ph] = P.SIZES[o.size || 'A4']; const land = o.orient === 'landscape' || (o.orient === 'auto' && iw > ih); if (land && pw < ph) [pw, ph] = [ph, pw]; if (!land && pw > ph) [pw, ph] = [ph, pw]; }
      const page = doc.addPage([pw, ph]); if (o.bg && o.bg.toLowerCase() !== '#ffffff') page.drawRectangle({ x: 0, y: 0, width: pw, height: ph, color: bg });
      const bw = pw - 2 * mar, bh = ph - 2 * mar; const s = o.fit === 'fill' ? Math.max(bw / iw, bh / ih) : Math.min(bw / iw, bh / ih, o.fit === 'shrink' ? 1 / 1 : Infinity);
      const dw = iw * s, dh = ih * s; page.drawImage(emb, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
      await U.tick();
    }
    return doc;
  };
  W.simpleTool({
    id: 'images-to-pdf', cat: 'create', name: 'Images to PDF', icon: 'images', action: 'Create PDF', actionIcon: 'images',
    desc: 'Turn images into a tidy, ordered PDF.', keys: 'jpg jpeg png photos pictures scan webp gif bmp convert combine album',
    files: { multi: true, min: 1, accept: 'image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif', kind: 'image', title: 'Drop images (JPG, PNG, WebP…)', hint: 'Drag rows to set the page order', dzIcon: 'images' },
    opts: [
      { id: 'size', type: 'select', label: 'Page size', options: [['fit', 'Same as the image'], ...P.sizeOpts], value: 'A4' },
      { type: 'row', show: (v) => v.size !== 'fit', children: [{ id: 'orient', type: 'select', label: 'Orientation', options: [['auto', 'Automatic'], ['portrait', 'Portrait'], ['landscape', 'Landscape']], value: 'auto' }, { id: 'fit', type: 'select', label: 'Image fit', options: [['contain', 'Fit inside the page'], ['fill', 'Fill the page (crop edges)']], value: 'contain' }] },
      { id: 'margin', type: 'number', label: 'Margin', value: 10, min: 0, max: 60, unit: 'mm' },
      { id: 'bg', type: 'color', label: 'Page colour', value: '#ffffff' },
      { id: 'recompress', type: 'check', label: 'Reduce file size (re-encode large images)', value: false },
      { id: 'quality', type: 'range', label: 'JPEG quality', min: 40, max: 98, value: 85, unit: '%', show: (v) => v.recompress }, { id: 'maxPx', type: 'range', label: 'Longest side', min: 800, max: 5000, step: 100, value: 2400, unit: ' px', show: (v) => v.recompress },
    ],
    async run(items, o, ctx) { const doc = await W.imagesToPdf(items, o, ctx); return [P.outPdf(await P.save(doc), items.length === 1 ? U.safeName(U.base(items[0].name)) + '.pdf' : 'images.pdf')]; },
  });
}
