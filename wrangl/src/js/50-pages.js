// ===== Page management tools =====
{
  const PDF_FILES = { accept: '.pdf,application/pdf', kind: 'pdf' };
  const sep = (a, b) => (a ? '' : '');

  // ---- helper: copy selected page indexes from src (pdf-lib doc) into a fresh doc ----
  async function subset(src, idxs) {
    const out = await P.create();
    const pages = await out.copyPages(src, idxs);
    pages.forEach((p) => out.addPage(p));
    return out;
  }
  P.subset = subset;

  // ================= MERGE =================
  W.simpleTool({
    id: 'merge', cat: 'pages', name: 'Merge PDFs', icon: 'combine', action: 'Merge PDFs', actionIcon: 'combine',
    desc: 'Bring several PDFs together in the order you choose.', keys: 'combine join concatenate append bookmarks',
    files: Object.assign({ multi: true, min: 2, title: 'Drop PDFs to merge', hint: 'or click to browse — drag rows to reorder', extra: (it) => h('input.in.sm.range-in', { placeholder: 'Pages: all', title: 'Optional page range for this file, e.g. 1-3, 5', 'aria-label': 'Pages of ' + it.name, value: it.range || '', style: 'width:130px', oninput: (e) => { it.range = e.target.value; } }) }, PDF_FILES),
    opts: [
      { id: 'bookmarks', type: 'check', label: 'Add a bookmark for each file', value: true },
      { id: 'name', type: 'text', label: 'Output file name', value: 'merged', placeholder: 'merged' },
    ],
    async run(items, o, ctx) {
      const out = await P.create(); const marks = [];
      for (let i = 0; i < items.length; i++) {
        ctx.check(); ctx.progress(i / items.length, `Reading ${items[i].name}`);
        const src = await P.load(items[i]);
        const idx = W.parseRanges(items[i].range, src.getPageCount());
        const start = out.getPageCount();
        const pages = await out.copyPages(src, idx); pages.forEach((p) => out.addPage(p));
        marks.push({ title: U.base(items[i].name), page: start });
        await U.tick();
      }
      if (o.bookmarks) P.addOutline(out, marks);
      ctx.progress(0.95, 'Saving');
      const bytes = await P.save(out);
      return { outputs: [P.outPdf(bytes, U.safeName(o.name || 'merged') + '.pdf')], note: `${U.plural(out.getPageCount(), 'page')} from ${items.length} files` };
    },
  });

  // ================= ALTERNATE & MIX =================
  W.simpleTool({
    id: 'alternate-mix', cat: 'pages', name: 'Alternate & mix', icon: 'shuffle', action: 'Mix pages', actionIcon: 'shuffle',
    desc: 'Interleave pages from separate scans or documents.', keys: 'interleave duplex front back scans collate zip riffle',
    files: Object.assign({ multi: true, min: 2, title: 'Drop two or more PDFs', hint: 'e.g. a stack of fronts and a stack of backs', extra: (it) => h('label.chk', { title: 'Read this file back-to-front (for back sides that were scanned in reverse)' }, h('input', { type: 'checkbox', checked: !!it.reverse, onchange: (e) => { it.reverse = e.target.checked; } }), h('span.chk-box'), h('span.small', 'Reverse')) }, PDF_FILES),
    opts: [
      { id: 'take', type: 'number', label: 'Pages taken from each file per turn', value: 1, min: 1, max: 50 },
      { id: 'tail', type: 'seg', label: 'When one file runs out', options: [['rest', 'Keep going with the others'], ['stop', 'Stop at the shortest']], value: 'rest' },
    ],
    async run(items, o, ctx) {
      const out = await P.create();
      const docs = []; for (const it of items) { const d = await P.load(it); const idx = Array.from({ length: d.getPageCount() }, (_, i) => i); if (it.reverse) idx.reverse(); docs.push({ d, idx, p: 0 }); }
      const total = docs.reduce((a, x) => a + x.idx.length, 0);
      let done = 0;
      loop: for (; ;) {
        let any = false;
        for (const x of docs) {
          if (x.p >= x.idx.length) { if (o.tail === 'stop') break loop; continue; }
          const take = x.idx.slice(x.p, x.p + o.take); x.p += take.length;
          const pages = await out.copyPages(x.d, take); pages.forEach((p) => out.addPage(p)); any = true; done += take.length;
        }
        ctx.progress(done / total, 'Mixing'); ctx.check();
        if (!any) break;
      }
      return [P.outPdf(await P.save(out), 'mixed.pdf')];
    },
  });

  // ================= SPLIT =================
  const splitName = (items, suffix) => `${P.baseName(items)}${suffix}.pdf`;
  W.simpleTool({
    id: 'split', cat: 'pages', name: 'Split PDF', icon: 'scissors', action: 'Split PDF', actionIcon: 'scissors',
    desc: 'Extract ranges or give every page its own file.', keys: 'extract pages separate cut remove delete',
    files: Object.assign({ multi: false, title: 'Drop a PDF to split' }, PDF_FILES),
    opts: (items) => [
      { id: 'mode', type: 'seg', label: 'Split by', options: [['ranges', 'Page ranges'], ['every', 'Every N pages'], ['each', 'Every page'], ['parts', 'Equal parts']], value: 'ranges' },
      { id: 'ranges', type: 'text', label: 'Ranges', placeholder: `e.g. 1-3, 4-6, 9${items[0] && items[0].info.pages ? '   (document has ' + items[0].info.pages + ' pages)' : ''}`, help: 'Each comma-separated range becomes its own PDF.', show: (v) => v.mode === 'ranges' },
      { id: 'combine', type: 'check', label: 'Combine all those pages into a single PDF', show: (v) => v.mode === 'ranges' },
      { id: 'remove', type: 'check', label: 'Remove those pages instead (keep everything else)', show: (v) => v.mode === 'ranges' },
      { id: 'n', type: 'number', label: 'Pages per file', value: 2, min: 1, show: (v) => v.mode === 'every' },
      { id: 'parts', type: 'number', label: 'Number of parts', value: 2, min: 2, show: (v) => v.mode === 'parts' },
    ],
    validate: (items, v) => (v.mode === 'ranges' && !v.ranges.trim() ? 'Enter at least one page range, e.g. 1-3, 5' : null),
    async run(items, o, ctx) {
      const it = items[0]; const src = await P.load(it); const n = src.getPageCount(); const base = U.safeName(U.base(it.name));
      const jobs = []; // {name, idx}
      if (o.mode === 'ranges') {
        const groups = o.ranges.split(',').map((s) => s.trim()).filter(Boolean);
        const all = groups.flatMap((g) => W.parseRanges(g, n));
        if (o.remove) { const rm = new Set(all); jobs.push({ name: `${base}-trimmed.pdf`, idx: Array.from({ length: n }, (_, i) => i).filter((i) => !rm.has(i)) }); if (!jobs[0].idx.length) throw new Error('That would remove every page.'); }
        else if (o.combine || groups.length === 1) jobs.push({ name: `${base}-extract.pdf`, idx: all });
        else groups.forEach((g) => jobs.push({ name: `${base}_${g.replace(/\s+/g, '').replace(/[^\w-]/g, '')}.pdf`, idx: W.parseRanges(g, n) }));
      } else if (o.mode === 'every') {
        const k = Math.max(1, o.n | 0); for (let s = 0; s < n; s += k) jobs.push({ name: `${base}-${s + 1}-${Math.min(n, s + k)}.pdf`, idx: Array.from({ length: Math.min(k, n - s) }, (_, i) => s + i) });
      } else if (o.mode === 'each') {
        const w = String(n).length; for (let i = 0; i < n; i++) jobs.push({ name: `${base}-page-${String(i + 1).padStart(w, '0')}.pdf`, idx: [i] });
      } else {
        const parts = Math.min(n, Math.max(2, o.parts | 0)); const size = Math.ceil(n / parts);
        for (let s = 0, p = 1; s < n; s += size, p++) jobs.push({ name: `${base}-part-${p}.pdf`, idx: Array.from({ length: Math.min(size, n - s) }, (_, i) => s + i) });
      }
      const outs = [];
      for (let i = 0; i < jobs.length; i++) { ctx.check(); ctx.progress(i / jobs.length, `Creating file ${i + 1} of ${jobs.length}`); const d = await subset(src, jobs[i].idx); outs.push(P.outPdf(await P.save(d), jobs[i].name)); await U.tick(); }
      return { outputs: outs, note: `${U.plural(outs.length, 'file')} created` };
    },
  });

  // ================= SPLIT BY TEXT =================
  W.simpleTool({
    id: 'split-text', cat: 'pages', name: 'Split by text', icon: 'text-search', action: 'Split by text', actionIcon: 'text-search',
    desc: 'Start a new file wherever your matching text appears.', keys: 'separator invoice delimiter find search batch',
    files: Object.assign({ multi: false, title: 'Drop a PDF to split' }, PDF_FILES),
    opts: [
      { id: 'text', type: 'text', label: 'Split where a page contains…', placeholder: 'e.g. Invoice No. or Chapter', help: 'Text is read from each page. Scanned pages without a text layer need OCR first.' },
      { id: 'match', type: 'seg', label: 'Match', options: [['contains', 'Contains'], ['starts', 'Page starts with'], ['regex', 'Regular expression']], value: 'contains' },
      { id: 'where', type: 'seg', label: 'The matching page', options: [['start', 'Starts a new file'], ['end', 'Ends the file']], value: 'start' },
      { id: 'case', type: 'check', label: 'Match case' },
      { id: 'useName', type: 'check', label: 'Name files after the matched line', value: true },
      { id: 'keepFront', type: 'check', label: 'Keep pages before the first match', value: true },
    ],
    validate: (it, v) => (!v.text.trim() ? 'Enter the text to split on.' : null),
    async run(items, o, ctx) {
      const it = items[0]; const pages = await P.text(it, { onProgress: (f) => ctx.progress(f * 0.5, 'Reading text') });
      const flags = o.case ? '' : 'i';
      let re; try { re = o.match === 'regex' ? new RegExp(o.text, flags) : null; } catch (e) { throw new Error('That regular expression isn’t valid: ' + e.message); }
      const norm = (s) => (o.case ? s : s.toLowerCase());
      const matchLine = (pg) => {
        const lines = P.lines(pg).map((l) => l.text.trim()); const text = lines.join('\n');
        if (o.match === 'regex') { const m = re.exec(text); return m ? (lines.find((l) => re.test(l)) || m[0]) : null; }
        if (o.match === 'starts') return norm(text.trim()).startsWith(norm(o.text.trim())) ? lines[0] : null;
        return norm(text).includes(norm(o.text)) ? (lines.find((l) => norm(l).includes(norm(o.text))) || o.text) : null;
      };
      const hits = pages.map(matchLine);
      if (!hits.some(Boolean)) throw new Error('No page contains that text. Check the spelling, or run OCR if the PDF is a scan.');
      const groups = []; let cur = null;
      pages.forEach((pg, i) => {
        const hit = hits[i];
        if (o.where === 'start') { if (hit) { cur = { idx: [i], title: hit }; groups.push(cur); } else { if (!cur) { if (!o.keepFront) return; cur = { idx: [], title: null }; groups.push(cur); } cur.idx.push(i); } }
        else { if (!cur) { cur = { idx: [], title: hit }; groups.push(cur); } cur.idx.push(i); if (hit) { cur.title = hit; cur = null; } }
      });
      const src = await P.load(it); const base = U.safeName(U.base(it.name)); const outs = []; const used = new Set();
      for (let k = 0; k < groups.length; k++) {
        ctx.check(); ctx.progress(0.5 + 0.5 * k / groups.length, `Creating file ${k + 1} of ${groups.length}`);
        let nm = `${base}-${k + 1}`;
        if (o.useName && groups[k].title) { nm = U.safeName(groups[k].title).slice(0, 60) || nm; if (used.has(nm)) nm += '-' + (k + 1); }
        used.add(nm);
        outs.push(P.outPdf(await P.save(await subset(src, groups[k].idx)), nm + '.pdf')); await U.tick();
      }
      return { outputs: outs, note: `${U.plural(outs.length, 'file')} created from ${hits.filter(Boolean).length} matches` };
    },
  });

  // ================= SPLIT BY BOOKMARKS =================
  async function readOutline(item) {
    const doc = await P.doc(item); const ol = await doc.getOutline();
    if (!ol || !ol.length) return null;
    const out = [];
    const walk = async (nodes, depth) => {
      for (const n of nodes) {
        let page = null;
        try {
          let dest = n.dest; if (typeof dest === 'string') dest = await doc.getDestination(dest);
          if (Array.isArray(dest)) { const ref = dest[0]; page = typeof ref === 'object' && ref !== null ? await doc.getPageIndex(ref) : (typeof ref === 'number' ? ref : null); }
        } catch { }
        out.push({ title: n.title, depth, page });
        if (n.items && n.items.length) await walk(n.items, depth + 1);
      }
    };
    await walk(ol, 0); return out;
  }
  W.pdf.outline = readOutline;
  W.simpleTool({
    id: 'split-bookmarks', cat: 'pages', name: 'Split by bookmarks', icon: 'bookmark', action: 'Split by bookmarks', actionIcon: 'bookmark',
    desc: 'Use your document outline to separate chapters.', keys: 'chapters outline sections toc table of contents',
    files: Object.assign({ multi: false, title: 'Drop a PDF that has bookmarks' }, PDF_FILES),
    opts: [{ id: 'level', type: 'select', label: 'Split at bookmark level', options: [[0, 'Top level (chapters)'], [1, 'Second level'], [2, 'Third level']], value: 0 }],
    setup(root, api) { api.note = h('div.finfo', { hidden: true }); api.panelHost.appendChild(api.note); },
    async onFiles(items, api) {
      const note = api.note; note.hidden = true; if (!items.length) return;
      const ol = await readOutline(items[0]);
      note.hidden = false; note.innerHTML = ol ? `Found <b>${ol.length}</b> bookmarks (${ol.filter((x) => x.depth === 0).length} at the top level).` : '<b>No bookmarks found</b> in this PDF. Try “Split by text” instead.';
    },
    async run(items, o, ctx) {
      const it = items[0]; const ol = await readOutline(it);
      if (!ol) throw new Error('This PDF has no bookmarks (outline).');
      const level = +o.level; const src = await P.load(it); const n = src.getPageCount();
      const marks = ol.filter((x) => x.depth <= level && x.page != null);
      // use the deepest requested level present; start with chosen level only
      const cut = ol.filter((x) => x.depth === level && x.page != null);
      const use = cut.length ? cut : marks;
      if (!use.length) throw new Error('No bookmarks at that level — try a different level.');
      const starts = use.map((m) => m.page); const outs = []; const base = U.safeName(U.base(it.name)); const used = new Set();
      for (let k = 0; k < use.length; k++) {
        const s = starts[k]; let e = n - 1; for (let j = k + 1; j < use.length; j++) if (starts[j] > s) { e = starts[j] - 1; break; }
        if (e < s) e = s;
        ctx.check(); ctx.progress(k / use.length, use[k].title);
        let nm = U.safeName(use[k].title).slice(0, 70) || `section-${k + 1}`; if (used.has(nm)) nm += '-' + (k + 1); used.add(nm);
        const idx = Array.from({ length: e - s + 1 }, (_, i) => s + i);
        outs.push(P.outPdf(await P.save(await subset(src, idx)), `${String(k + 1).padStart(2, '0')}-${nm}.pdf`));
        await U.tick();
      }
      return { outputs: outs, note: `${U.plural(outs.length, 'file')} (one per bookmark)` };
    },
  });

  // ================= SPLIT IN HALF =================
  W.simpleTool({
    id: 'split-half', cat: 'pages', name: 'Split in half', icon: 'columns-2', action: 'Split in half', actionIcon: 'columns-2',
    desc: 'Divide the document or cut book scans into two pages.', keys: 'book spread scan two-page left right halve',
    files: Object.assign({ multi: false, title: 'Drop a PDF to halve' }, PDF_FILES),
    opts: [
      { id: 'mode', type: 'seg', label: 'What to split', options: [['pages', 'Cut every page in two'], ['doc', 'Split the document into two files']], value: 'pages' },
      { id: 'dir', type: 'seg', label: 'Cut direction', options: [['v', 'Down the middle (left | right)'], ['h', 'Across the middle (top / bottom)']], value: 'v', show: (v) => v.mode === 'pages' },
      { id: 'order', type: 'seg', label: 'Reading order', options: [['ltr', 'Left page first'], ['rtl', 'Right page first (manga / RTL books)']], value: 'ltr', show: (v) => v.mode === 'pages' && v.dir === 'v' },
      { id: 'only', type: 'check', label: 'Only cut landscape pages (leave portrait pages as they are)', value: false, show: (v) => v.mode === 'pages' },
      { id: 'pages', type: 'text', label: 'Pages to cut', placeholder: 'All pages', show: (v) => v.mode === 'pages' },
    ],
    async run(items, o, ctx) {
      const it = items[0]; const src = await P.load(it); const n = src.getPageCount(); const base = U.safeName(U.base(it.name));
      if (o.mode === 'doc') {
        const mid = Math.ceil(n / 2); if (n < 2) throw new Error('Needs at least 2 pages.');
        const a = await subset(src, Array.from({ length: mid }, (_, i) => i)), b = await subset(src, Array.from({ length: n - mid }, (_, i) => mid + i));
        return [P.outPdf(await P.save(a), `${base}-first-half.pdf`), P.outPdf(await P.save(b), `${base}-second-half.pdf`)];
      }
      const sel = new Set(W.parseRanges(o.pages, n)); const out = await P.create();
      for (let i = 0; i < n; i++) {
        ctx.check(); ctx.progress(i / n, `Page ${i + 1} of ${n}`);
        const sp = src.getPage(i); const info = P.viewInfo(sp);
        const cut = sel.has(i) && (!o.only || info.w > info.h);
        if (!cut) { const [cp] = await out.copyPages(src, [i]); out.addPage(cp); continue; }
        const { emb } = await P.embed(out, sp);
        const e = { emb, info };
        const halves = o.dir === 'v' ? [[0, 0, info.w / 2, info.h], [info.w / 2, 0, info.w / 2, info.h]] : [[0, info.h / 2, info.w, info.h / 2], [0, 0, info.w, info.h / 2]];
        if (o.dir === 'v' && o.order === 'rtl') halves.reverse();
        for (const [x, y, w, h2] of halves) { const pg = out.addPage([w, h2]); P.place(pg, e, P.moveM(-x, -y)); }
        await U.tick();
      }
      return [P.outPdf(await P.save(out), `${base}-split.pdf`)];
    },
  });

  // ================= SPLIT BY FILE SIZE =================
  W.simpleTool({
    id: 'split-size', cat: 'pages', name: 'Split by file size', icon: 'file-stack', action: 'Split by size', actionIcon: 'file-stack',
    desc: 'Make parts that fit an attachment size limit.', keys: 'email attachment limit megabytes mb upload max size chunks',
    files: Object.assign({ multi: false, title: 'Drop a large PDF' }, PDF_FILES),
    opts: [
      { id: 'mb', type: 'number', label: 'Maximum size of each part', value: 5, min: 0.1, step: 0.1, unit: 'MB', help: 'Common limits: email 20–25 MB, many web forms 5–10 MB.' },
    ],
    async run(items, o, ctx) {
      const it = items[0]; const src = await P.load(it); const n = src.getPageCount(); const limit = o.mb * 1048576; const base = U.safeName(U.base(it.name));
      const trial = async (a, b) => { const d = await subset(src, Array.from({ length: b - a }, (_, i) => a + i)); return P.save(d); };
      const outs = []; let start = 0, part = 1;
      while (start < n) {
        ctx.check(); ctx.progress(start / n, `Building part ${part}`);
        // grow exponentially then binary-search the largest chunk under the limit
        let lo = 1, hi = 1, best = await trial(start, start + 1);
        if (best.length > limit) { outs.push({ bytes: best, a: start, b: start + 1, over: true }); start += 1; part++; continue; }
        while (start + hi < n) { const nh = Math.min(n - start, hi * 2); const t = await trial(start, start + nh); if (t.length <= limit) { lo = nh; hi = nh; best = t; if (start + nh >= n) break; } else { hi = nh; break; } }
        let a = lo, bnd = (start + hi >= n && hi === lo) ? lo : hi;
        while (bnd - a > 1) { const mid = (a + bnd) >> 1; const t = await trial(start, start + mid); if (t.length <= limit) { a = mid; best = t; } else bnd = mid; }
        outs.push({ bytes: best, a: start, b: start + a }); start += a; part++; await U.tick();
      }
      const w = String(outs.length).length;
      const res = outs.map((x, i) => P.outPdf(x.bytes, `${base}-part-${String(i + 1).padStart(w, '0')}.pdf`));
      const overs = outs.filter((x) => x.over).length;
      return { outputs: res, note: `${U.plural(res.length, 'part')} (pages ${outs.map((x) => `${x.a + 1}–${x.b}`).join(', ')})${overs ? ` — ${overs} single page${overs > 1 ? 's' : ''} already exceed the limit` : ''}` };
    },
  });

  // ================= ROTATE =================
  W.simpleTool({
    id: 'rotate', cat: 'pages', name: 'Rotate pages', icon: 'rotate-cw', action: 'Rotate', actionIcon: 'rotate-cw',
    desc: 'Straighten a page or turn the entire document.', keys: 'turn sideways landscape portrait orientation upside down',
    files: Object.assign({ multi: false, title: 'Drop a PDF to rotate' }, PDF_FILES),
    opts: [
      { id: 'angle', type: 'seg', label: 'Rotate clockwise by', options: [[90, '90°'], [180, '180°'], [270, '270° (90° left)']], value: 90 },
      P.pagesField({ help: 'Leave empty to rotate every page. Try “odd”, “even”, or 2-4.' }),
    ],
    setup(root, api) {
      const strip = h('div.rot-strip'); api.panelHost.appendChild(strip);
      const draw = async () => {
        strip.innerHTML = ''; const it = api.fl.items[0]; if (!it) return;
        let sel; try { sel = new Set(W.parseRanges(api.vals.pages, it.info.pages)); } catch { sel = new Set(); }
        const n = Math.min(it.info.pages, 12);
        for (let i = 0; i < n; i++) {
          const cell = h('div.rot-cell' + (sel.has(i) ? '.on' : ''), h('div.rot-pg'), h('span', String(i + 1))); strip.appendChild(cell);
          W.pdf.thumb(it, i, 110).then((img) => { const pg = $('.rot-pg', cell); pg.innerHTML = ''; pg.appendChild(img); pg.style.transform = sel.has(i) ? `rotate(${api.vals.angle}deg)` : ''; });
        }
        if (it.info.pages > n) strip.appendChild(h('div.rot-more', `+${it.info.pages - n} more`));
      };
      api.redraw = U.debounce(draw, 40);
    },
    onFiles: (items, api) => api.redraw && api.redraw(),
    onOpt: (v, id, api) => api.redraw && api.redraw(),
    async run(items, o, ctx) {
      const it = items[0]; const doc = await P.load(it); const n = doc.getPageCount(); const sel = W.parseRanges(o.pages, n);
      const { degrees } = PDFLib;
      sel.forEach((i) => { const pg = doc.getPage(i); pg.setRotation(degrees(((pg.getRotation().angle + +o.angle) % 360 + 360) % 360)); });
      return [P.outPdf(await P.save(doc), P.suffixName(it, '-rotated'))];
    },
  });

  // ================= FLIP =================
  W.simpleTool({
    id: 'flip', cat: 'pages', name: 'Flip pages', icon: 'flip-horizontal-2', action: 'Flip pages', actionIcon: 'flip-horizontal-2',
    desc: 'Mirror pages horizontally, vertically, or both.', keys: 'mirror reverse reflect',
    files: Object.assign({ multi: false, title: 'Drop a PDF to flip' }, PDF_FILES),
    opts: [
      { id: 'axis', type: 'seg', label: 'Mirror', options: [['h', 'Horizontally (left ↔ right)'], ['v', 'Vertically (top ↕ bottom)'], ['both', 'Both']], value: 'h' },
      P.pagesField(),
    ],
    async run(items, o, ctx) {
      const it = items[0]; const src = await P.load(it); const n = src.getPageCount(); const sel = new Set(W.parseRanges(o.pages, n)); const out = await P.create();
      for (let i = 0; i < n; i++) {
        ctx.check(); ctx.progress(i / n, `Page ${i + 1} of ${n}`);
        if (!sel.has(i)) { const [cp] = await out.copyPages(src, [i]); out.addPage(cp); continue; }
        const e = await P.embed(out, src.getPage(i)); const { w, h: hh } = e.info; const pg = out.addPage([w, hh]);
        const M = o.axis === 'h' ? [-1, 0, 0, 1, w, 0] : o.axis === 'v' ? [1, 0, 0, -1, 0, hh] : [-1, 0, 0, -1, w, hh];
        P.place(pg, e, M); await U.tick();
      }
      return [P.outPdf(await P.save(out), P.suffixName(it, '-flipped'))];
    },
  });

  // ================= PAGES PER SHEET (N-UP) =================
  const NUP = { 2: [2, 1], 4: [2, 2], 6: [3, 2], 8: [4, 2], 9: [3, 3], 12: [4, 3], 16: [4, 4] };
  W.simpleTool({
    id: 'nup', cat: 'pages', name: 'Pages per sheet', icon: 'layout-grid', action: 'Arrange pages', actionIcon: 'layout-grid',
    desc: 'Arrange several pages neatly on a printed sheet.', keys: 'n-up nup handout booklet thumbnails print multiple pages 2-up 4-up imposition',
    files: Object.assign({ multi: false, title: 'Drop a PDF to arrange' }, PDF_FILES),
    opts: [
      { id: 'per', type: 'select', label: 'Pages per sheet', options: [[2, '2'], [4, '4'], [6, '6'], [8, '8'], [9, '9'], [12, '12'], [16, '16']], value: 4 },
      { id: 'booklet', type: 'check', label: 'Booklet order (fold the printed stack in half) — uses 2 per sheet, double-sided', value: false },
      { type: 'row', children: [
        { id: 'size', type: 'select', label: 'Sheet size', options: P.sizeOpts, value: 'A4' },
        { id: 'orient', type: 'select', label: 'Sheet orientation', options: [['auto', 'Automatic'], ['portrait', 'Portrait'], ['landscape', 'Landscape']], value: 'auto' },
      ] },
      { type: 'row', children: [
        { id: 'margin', type: 'number', label: 'Margin', value: 10, min: 0, unit: 'mm' },
        { id: 'gap', type: 'number', label: 'Gap between pages', value: 4, min: 0, unit: 'mm' },
      ] },
      { id: 'order', type: 'seg', label: 'Page order', options: [['row', 'Across, then down'], ['col', 'Down, then across']], value: 'row' },
      { id: 'border', type: 'check', label: 'Draw a thin border around each page', value: true },
    ],
    async run(items, o, ctx) {
      const it = items[0]; const src = await P.load(it); const n = src.getPageCount(); const out = await P.create();
      let per = +o.per; let order = []; // list of source indexes or null (blank)
      if (o.booklet) {
        per = 2; const total = Math.ceil(n / 4) * 4;
        for (let s = 0; s < total / 2; s += 2) { const a = total - 1 - s, b = s; const c = s + 1, d = total - 2 - s; order.push(a < n ? a : null, b < n ? b : null, c < n ? c : null, d < n ? d : null); }
      } else order = Array.from({ length: n }, (_, i) => i);
      let [cols, rows] = NUP[per];
      let [sw, sh] = P.SIZES[o.size];
      const land = o.orient === 'landscape' || (o.orient === 'auto' && cols > rows) || o.booklet;
      if (land && sw < sh) [sw, sh] = [sh, sw]; if (!land && sw > sh) [sw, sh] = [sh, sw];
      const mar = U.mmToPt(o.margin), gap = U.mmToPt(o.gap);
      const cw = (sw - 2 * mar - gap * (cols - 1)) / cols, ch = (sh - 2 * mar - gap * (rows - 1)) / rows;
      const { rgb } = PDFLib; const cache = new Map();
      for (let s = 0; s < order.length; s += per) {
        ctx.check(); ctx.progress(s / order.length, `Sheet ${s / per + 1} of ${Math.ceil(order.length / per)}`);
        const pg = out.addPage([sw, sh]);
        for (let k = 0; k < per; k++) {
          const idx = order[s + k]; if (idx == null) continue;
          let e = cache.get(idx); if (!e) { e = await P.embed(out, src.getPage(idx)); cache.set(idx, e); }
          const r = o.order === 'row' ? Math.floor(k / cols) : k % rows, c = o.order === 'row' ? k % cols : Math.floor(k / rows);
          const sc = Math.min(cw / e.info.w, ch / e.info.h); const w = e.info.w * sc, hh = e.info.h * sc;
          const x = mar + c * (cw + gap) + (cw - w) / 2, y = sh - mar - (r + 1) * ch - r * gap + (ch - hh) / 2;
          P.place(pg, e, [sc, 0, 0, sc, x, y]);
          if (o.border) pg.drawRectangle({ x, y, width: w, height: hh, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
        }
        if (cache.size > 24) cache.clear();
        await U.tick();
      }
      return { outputs: [P.outPdf(await P.save(out), P.suffixName(it, o.booklet ? '-booklet' : `-${per}up`))], note: `${U.plural(Math.ceil(order.length / per), 'sheet')} (${per} per sheet)` };
    },
  });

  // ================= PDF TO ZIP =================
  W.simpleTool({
    id: 'pdf-to-zip', cat: 'pages', name: 'PDF to ZIP', icon: 'file-archive', action: 'Create ZIP', actionIcon: 'file-archive',
    desc: 'Bundle documents or export page images in one archive.', keys: 'archive compress bundle zip pages images',
    files: Object.assign({ multi: true, min: 1, title: 'Drop PDFs to bundle' }, PDF_FILES),
    opts: [
      { id: 'mode', type: 'seg', label: 'Put in the ZIP', options: [['files', 'The PDFs as they are'], ['pages', 'Every page as its own PDF'], ['images', 'Every page as an image']], value: 'files' },
      { id: 'fmt', type: 'seg', label: 'Image format', options: [['image/jpeg', 'JPG'], ['image/png', 'PNG']], value: 'image/jpeg', show: (v) => v.mode === 'images' },
      { id: 'dpi', type: 'select', label: 'Image resolution', options: [[72, '72 dpi (screen)'], [150, '150 dpi (good)'], [220, '220 dpi (sharp)'], [300, '300 dpi (print)']], value: 150, show: (v) => v.mode === 'images' },
    ],
    async run(items, o, ctx) {
      const JSZip = await W.lib('jszip'); const z = new JSZip(); let k = 0; const total = items.length;
      for (let f = 0; f < items.length; f++) {
        const it = items[f]; const base = U.safeName(U.base(it.name)); const folder = items.length > 1 && o.mode !== 'files' ? z.folder(base) : z;
        if (o.mode === 'files') { z.file(it.name, it.file); }
        else if (o.mode === 'pages') { const src = await P.load(it); const n = src.getPageCount(); const w = String(n).length; for (let i = 0; i < n; i++) { ctx.check(); ctx.progress((f + i / n) / total, `${it.name}: page ${i + 1}/${n}`); folder.file(`${base}-page-${String(i + 1).padStart(w, '0')}.pdf`, await P.save(await subset(src, [i]))); await U.tick(); } }
        else { const n = await P.pageCount(it); const w = String(n).length; const ext = o.fmt === 'image/png' ? 'png' : 'jpg'; for (let i = 0; i < n; i++) { ctx.check(); ctx.progress((f + i / n) / total, `${it.name}: page ${i + 1}/${n}`); const b = await P.pageBlob(it, i, { dpi: +o.dpi, type: o.fmt, q: 0.88 }); folder.file(`${base}-page-${String(i + 1).padStart(w, '0')}.${ext}`, b.blob); k++; } }
      }
      ctx.progress(0.98, 'Zipping');
      const blob = await z.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      return [W.out(`${items.length === 1 ? U.safeName(U.base(items[0].name)) : 'documents'}${o.mode === 'files' ? '' : '-' + o.mode}.zip`, blob, 'application/zip')];
    },
  });
}
