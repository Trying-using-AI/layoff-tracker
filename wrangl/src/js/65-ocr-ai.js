// ===== OCR, summarising, chat with PDFs, compare, repair =====
{
  const esc = U.esc;
  // ---------- OCR (Tesseract, fully offline for English) ----------
  const OCR_LANGS = [['eng', 'English (built in, works offline)'], ['hin', 'Hindi (downloads once)'], ['spa', 'Spanish'], ['fra', 'French'], ['deu', 'German'], ['ita', 'Italian'], ['por', 'Portuguese'], ['rus', 'Russian'], ['ara', 'Arabic'], ['chi_sim', 'Chinese (Simplified)'], ['jpn', 'Japanese'], ['kor', 'Korean'], ['tam', 'Tamil'], ['ben', 'Bengali'], ['tur', 'Turkish'], ['nld', 'Dutch']];
  W.OCR_LANGS = OCR_LANGS;
  const ocr = W.ocr = { _w: null, _lang: null, _cb: null };
  ocr.worker = async function (lang = 'eng') {
    if (ocr._w && ocr._lang === lang) return ocr._w;
    if (ocr._w) { try { await ocr._w.terminate(); } catch { } ocr._w = null; }
    const T = await W.lib('tesseract');
    const td = new TextDecoder(); const workerText = td.decode(await W.libBytes('tessworker')); const coreText = td.decode(await W.libBytes('tesscore')); const langB64 = U.b64(await W.libBytes('tessdata'));
    // Everything the worker needs is inlined into ONE blob script: importScripts() of other blob: URLs is blocked for file:// pages.
    const preamble = String.raw`const __core = ${JSON.stringify(coreText)};
const __lang = Uint8Array.from(atob(${JSON.stringify(langB64)}), (c) => c.charCodeAt(0));
const __f = self.fetch.bind(self);
self.fetch = (u, o) => { const s = String((u && u.url) || u); const m = /\/([A-Za-z_]+)\.traineddata(\.gz)?(\?.*)?$/.exec(s); if (m) { if (m[1] === 'eng') return Promise.resolve(new Response(__lang, { status: 200 })); return __f('https://cdn.jsdelivr.net/npm/@tesseract.js-data/' + m[1] + '/4.0.0_best_int/' + m[1] + '.traineddata.gz'); } return __f(u, o); };
const __is = self.importScripts.bind(self);
self.importScripts = (...us) => { for (const u of us) { if (/core\.js$/.test(String(u))) (0, eval)(__core); else __is(u); } };
`;
    const workerPath = URL.createObjectURL(new Blob([preamble, '\n', workerText], { type: 'text/javascript' }));
    const w = await T.createWorker(lang, 1, { workerPath, workerBlobURL: false, corePath: 'tesseract-core.js', langPath: 'https://offline.invalid/tessdata', cacheMethod: 'none', gzip: true, logger: (m) => ocr._cb && ocr._cb(m) });
    ocr._w = w; ocr._lang = lang; return w;
  };
  /** source: canvas/blob. returns {text, words:[{text,x0,y0,x1,y1,conf}], lines:[{text,x0,y0,x1,y1}], w, h} */
  ocr.recognize = async function (source, { lang = 'eng', onProgress } = {}) {
    onProgress && onProgress(0, 'Loading OCR engine');
    ocr._cb = (m) => { if (!onProgress) return; if (m.status === 'recognizing text') onProgress(0.15 + 0.85 * m.progress, 'Recognising text'); else if (/loading|initializ/.test(m.status)) onProgress(0.1 * (m.progress || 0), m.status); };
    const w = await ocr.worker(lang);
    const { data } = await w.recognize(source, {}, { blocks: true, text: true });
    const words = [], lines = [];
    const walk = (blocks) => (blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => { lines.push({ text: l.text.trim(), x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1 }); (l.words || []).forEach((wd) => words.push({ text: wd.text, x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1, conf: wd.confidence })); })));
    walk(data.blocks);
    onProgress && onProgress(1, 'Done');
    return { text: data.text || '', words, lines, w: source.width, h: source.height };
  };
  ocr.stop = async () => { if (ocr._w) { try { await ocr._w.terminate(); } catch { } ocr._w = null; } };

  W.simpleTool({
    id: 'ocr', cat: 'ai', name: 'Searchable PDF (OCR)', icon: 'scan-text', action: 'Make searchable', actionIcon: 'scan-text',
    desc: 'Add a searchable text layer to scanned pages.', keys: 'ocr scan recognize text searchable copy select tesseract image to text',
    files: Object.assign({ multi: false, title: 'Drop a scanned PDF' }, PDF_FILES),
    opts: [
      { id: 'lang', type: 'select', label: 'Language of the document', options: OCR_LANGS, value: 'eng', help: 'English works fully offline. Other languages download a small language file the first time (needs internet once).' },
      { id: 'dpi', type: 'select', label: 'Scan quality', options: [[150, '150 dpi (fast)'], [200, '200 dpi (balanced)'], [300, '300 dpi (small print)']], value: 200 },
      { id: 'skip', type: 'check', label: 'Skip pages that already have text', value: true },
      { id: 'txt', type: 'check', label: 'Also save the recognised text as a .txt file', value: false },
      P.pagesField(),
    ],
    async run(items, o, ctx) {
      const it = items[0]; const n = await P.pageCount(it); const sel = W.parseRanges(o.pages, n); const doc = await P.load(it); const font = await P.std(doc, 'Helvetica'); const texts = o.skip ? await P.text(it, { pages: sel }) : null;
      const { pushGraphicsState, popGraphicsState, concatTransformationMatrix } = PDFLib; let done = 0, words = 0, skipped = 0; const all = [];
      for (let k = 0; k < sel.length; k++) {
        ctx.check(); const i = sel[k]; const base = k / sel.length, span = 1 / sel.length;
        if (texts && texts[k].items.map((t) => t.str).join('').replace(/\s/g, '').length > 25) { skipped++; continue; }
        const c = await P.renderPage(it, i, { scale: o.dpi / 72 });
        const r = await ocr.recognize(c, { lang: o.lang, onProgress: (f, l) => ctx.progress(base + span * f, `Page ${i + 1}: ${l}`) });
        const s = o.dpi / 72; const page = doc.getPage(i); const info = P.viewInfo(page); const inv = W.invAff(info.m);
        page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...inv));
        await P.invisibleText(doc, page, r.words.filter((w) => w.text.trim() && w.conf > 20).map((w) => ({ text: w.text, x: w.x0 / s, y: w.y0 / s, w: (w.x1 - w.x0) / s, h: (w.y1 - w.y0) / s })), font);
        page.pushOperators(popGraphicsState()); done++; words += r.words.length; all.push(r.text.trim()); await U.tick();
      }
      if (!done) { if (skipped) throw new Error('Every selected page already has a text layer. Untick “Skip pages that already have text” to OCR them anyway.'); throw new Error('Nothing to recognise.'); }
      const outs = [P.outPdf(await P.save(doc), P.suffixName(it, '-ocr'))]; if (o.txt) outs.push(W.out(U.safeName(U.base(it.name)) + '.txt', new Blob([all.join('\n\n')], { type: 'text/plain' })));
      return { outputs: outs, note: `${U.plural(done, 'page')} recognised · ${words.toLocaleString()} words${skipped ? ` · ${skipped} skipped` : ''}` };
    },
  });

  // ---------- text analysis helpers ----------
  const STOP = new Set('a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves also may must shall one two within upon per via etc however therefore thus'.split(' '));
  const words = (t) => (t.toLowerCase().match(/[a-z][a-z'’-]{2,}/g) || []).filter((w) => !STOP.has(w));
  W.keywords = function (text, n = 12) { const f = new Map(); words(text).forEach((w) => f.set(w, (f.get(w) || 0) + 1)); return [...f].sort((a, b) => b[1] - a[1]).slice(0, n).map(([word, count]) => ({ word, count })); };
  const sentences = (text) => text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9“"‘'(])/).map((s) => s.trim()).filter((s) => s.length > 25 && s.length < 400 && /[a-z]/i.test(s));
  W.sentences = sentences;
  W.summarize = function (text, { sentences: n = 5 } = {}) {
    const ss = sentences(text); if (ss.length <= n) return ss;
    const f = new Map(); words(text).forEach((w) => f.set(w, (f.get(w) || 0) + 1)); const max = Math.max(...f.values());
    const scored = ss.map((s, i) => { const ws = words(s); if (ws.length < 4) return { s, i, sc: 0 }; let sc = ws.reduce((a, w) => a + (f.get(w) || 0) / max, 0) / Math.sqrt(ws.length); sc *= 1 + Math.max(0, 0.35 - i / ss.length); if (/\d/.test(s)) sc *= 1.05; return { s, i, sc }; });
    return scored.sort((a, b) => b.sc - a.sc).slice(0, n).sort((a, b) => a.i - b.i).map((x) => x.s);
  };
  // ---------- optional LLM (bring your own key) ----------
  const LLM = W.llm = {
    cfg: () => Object.assign({ provider: 'off', key: '', model: '', base: 'https://api.openai.com/v1', remember: false }, W.store.get('llm', {})),
    save(c) { W.store.set('llm', c.remember ? c : Object.assign({}, c, { key: '' })); LLM._session = c; },
    get() { return LLM._session || LLM.cfg(); },
    async ask(system, user, maxTokens = 1200) {
      const c = LLM.get(); if (c.provider === 'off' || !c.key) throw new Error('No AI key set.');
      if (c.provider === 'anthropic') {
        const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: c.model || 'claude-haiku-4-5-20251001', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }) });
        const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'The AI provider returned an error.'); return (j.content || []).map((x) => x.text || '').join('');
      }
      const r = await fetch(c.base.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + c.key }, body: JSON.stringify({ model: c.model || 'gpt-4o-mini', max_tokens: maxTokens, temperature: 0.2, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
      const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'The AI provider returned an error.'); return j.choices[0].message.content;
    },
    panel(onChange) {
      const c = LLM.get(); const st = Object.assign({}, c); const wrap = h('div.llm');
      const sel = h('select.in', { onchange: () => { st.provider = sel.value; sync(); } }, [['off', 'No AI — private on-device mode'], ['anthropic', 'Claude (Anthropic API key)'], ['openai', 'OpenAI-compatible (OpenAI, OpenRouter, Ollama…)']].map(([v, l]) => h('option', { value: v, selected: v === st.provider }, l)));
      const key = h('input.in', { type: 'password', placeholder: 'API key (stays in this tab unless you tick “remember”)', value: st.key, autocomplete: 'off', oninput: () => { st.key = key.value; sync(); } });
      const model = h('input.in', { placeholder: 'Model (optional)', value: st.model, oninput: () => { st.model = model.value; sync(); } });
      const base = h('input.in', { placeholder: 'Base URL', value: st.base, oninput: () => { st.base = base.value; sync(); } });
      const rem = h('input', { type: 'checkbox', checked: st.remember, onchange: () => { st.remember = rem.checked; sync(); } });
      const note = h('p.muted.small', { hidden: true }, 'With an AI provider selected, your questions and the relevant excerpts are sent to that provider (and nothing else leaves your device). Keys are never sent anywhere else.');
      function sync() { base.hidden = st.provider !== 'openai'; key.hidden = model.hidden = st.provider === 'off'; rem.parentElement.parentElement.hidden = st.provider === 'off'; note.hidden = st.provider === 'off'; LLM.save(st); onChange && onChange(st); }
      wrap.append(h('label.lbl', 'Answers from'), sel, key, h('div.frow', model, base), h('label.chk', rem, h('span.chk-box'), h('span.small', 'Remember key on this device')), note); sync(); return wrap;
    },
  };

  // ================= SUMMARIZE =================
  W.simpleTool({
    id: 'summarize', cat: 'ai', name: 'Summarize PDF', icon: 'align-left', action: 'Summarize', actionIcon: 'sparkles',
    desc: 'Get an overview, key points, or a detailed summary.', keys: 'summary tldr digest key points abstract overview condense ai',
    net: 'AI is optional',
    files: Object.assign({ multi: true, min: 1, title: 'Drop PDFs to summarize' }, PDF_FILES),
    opts: [
      { id: 'len', type: 'seg', label: 'Length', options: [[3, 'Short'], [6, 'Medium'], [12, 'Detailed']], value: 6 },
      { id: 'kw', type: 'check', label: 'Include key terms', value: true },
      { id: 'ai', type: 'info', html: '' },
    ],
    setup(root, api) { const slot = $('.finfo', root); const p = LLM.panel(); slot.replaceWith(h('div.card.pad', { style: 'background:var(--surface2)' }, p)); },
    async run(items, o, ctx) {
      const outs = [];
      for (let f = 0; f < items.length; f++) {
        const it = items[f]; const pages = await P.plainText(it, { onProgress: (x) => ctx.progress((f + x * 0.5) / items.length, 'Reading ' + it.name) }); let text = pages.join('\n\n');
        if (text.replace(/\s/g, '').length < 80) { ctx.progress(0.5, 'No text layer — running OCR'); const parts = []; const n = await P.pageCount(it); for (let i = 0; i < Math.min(n, 12); i++) { const c = await P.renderPage(it, i, { scale: 2.2 }); parts.push((await ocr.recognize(c, { onProgress: (x, l) => ctx.progress((f + 0.5 + 0.5 * (i + x) / Math.min(n, 12)) / items.length, 'OCR: ' + l) })).text); } text = parts.join('\n\n'); }
        if (!text.trim()) throw new Error('Could not find any text in ' + it.name);
        const c = LLM.get(); let md; const kw = W.keywords(text, 12);
        if (c.provider !== 'off' && c.key) { ctx.progress(0.8, 'Asking your AI provider'); md = await LLM.ask('You summarise documents faithfully and concisely. Use Markdown. Do not invent facts.', `Summarise the document below in ${o.len <= 3 ? 'about 3 bullet points' : o.len <= 6 ? 'a short overview paragraph followed by 5–7 key points' : 'a detailed structured summary with headings and bullet points'}.\n\n${text.slice(0, 60000)}`); }
        else { const s = W.summarize(text, { sentences: o.len }); md = (o.len > 3 ? `**Overview**\n\n${s.slice(0, 2).join(' ')}\n\n**Key points**\n\n` : '') + s.slice(o.len > 3 ? 2 : 0).map((x) => '- ' + x).join('\n'); }
        if (o.kw) md += `\n\n**Key terms:** ${kw.map((k) => k.word).join(', ')}`;
        const title = `Summary of ${it.name}`; const wordsN = (text.match(/\S+/g) || []).length;
        const full = `# ${title}\n\n_${U.plural(pages.length, 'page')}, ${wordsN.toLocaleString()} words · ${c.provider !== 'off' && c.key ? 'summarised by your AI provider' : 'summarised on this device (extractive)'}_\n\n${md}\n`;
        const o1 = W.out(U.safeName(U.base(it.name)) + '-summary.md', new Blob([full], { type: 'text/markdown' }));
        const prev = h('div.summary-view', { html: (await W.mdToHtml(full)) }); o1.view = h('div', prev, h('div.row.gap', copyBtnLocal(() => full))); outs.push(o1);
      }
      return outs;
    },
  });
  function copyBtnLocal(getText) { return h('button.btn.sm', { html: ic('copy', 14) + '<span>Copy</span>', onclick: async (e) => { const b = e.currentTarget; if (await U.copy(getText())) { b.querySelector('span').textContent = 'Copied'; setTimeout(() => (b.querySelector('span').textContent = 'Copy'), 1400); } } }); }

  // ================= CHAT WITH PDFS =================
  W.tool({
    id: 'chat', cat: 'ai', name: 'Chat with PDFs', icon: 'messages-square', desc: 'Ask questions and get answers grounded in your documents.',
    keys: 'ask question answer qa search document assistant ai rag converse', net: 'AI is optional',
    async render(root) {
      const docs = []; let chunks = []; let df = new Map(); let avg = 1;
      const fl = W.fileList({ multi: true, accept: '.pdf,application/pdf', kind: 'pdf', title: 'Drop the PDFs you want to ask about', onChange: () => reindex() });
      const log = h('div.chat-log'); const input = h('textarea.in', { rows: 2, placeholder: 'Ask a question about your documents…', onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } } });
      const status = h('div.muted.small', 'Add at least one PDF to start.'); const sendBtn = h('button.btn.primary', { html: ic('send', 16) + '<span>Ask</span>', onclick: send, disabled: true });
      const chatCard = h('section.card.pad', { hidden: true }, h('h3.card-h', h('span.step', '2'), 'Ask'), status, log, h('div.chat-in', input, sendBtn));
      root.append(h('section.card.pad', h('h3.card-h', h('span.step', '1'), 'Your documents'), fl.el), chatCard, h('section.card.pad', h('h3.card-h', 'Answer engine'), LLM.panel()));
      const carried = W.takeCarry('chat'); if (carried.length) await fl.add(carried);
      const tokenize = (t) => t.toLowerCase().match(/[a-z0-9][a-z0-9'’-]*/g) || [];
      async function reindex() {
        chunks = []; chatCard.hidden = !fl.items.length; if (!fl.items.length) return; status.textContent = 'Reading documents…'; sendBtn.disabled = true;
        for (const it of fl.items) {
          if (!it._chunks) {
            const pages = await P.plainText(it); const cs = [];
            pages.forEach((pt, pi) => { const t = pt.replace(/\s+/g, ' ').trim(); if (!t) return; const size = 900, step = 650; for (let s = 0; s < t.length; s += step) { const part = t.slice(s, s + size); if (part.length > 60 || s === 0) cs.push({ file: it.name, page: pi + 1, text: part, toks: tokenize(part) }); if (s + size >= t.length) break; } });
            it._chunks = cs; it._ocrNeeded = !cs.length;
          }
          chunks.push(...it._chunks);
        }
        df = new Map(); chunks.forEach((c) => new Set(c.toks).forEach((t) => df.set(t, (df.get(t) || 0) + 1))); avg = chunks.reduce((a, c) => a + c.toks.length, 0) / Math.max(1, chunks.length);
        const noText = fl.items.filter((i) => i._ocrNeeded).map((i) => i.name);
        status.innerHTML = `Ready — ${chunks.length} passages from ${U.plural(fl.items.length, 'document')}.` + (noText.length ? ` <b>${U.esc(noText.join(', '))}</b> has no text layer; run it through <a href="#/t/ocr">OCR</a> first.` : ''); sendBtn.disabled = !chunks.length;
      }
      function search(q, k = 5) {
        const qt = tokenize(q).filter((t) => !STOP.has(t)); const N = chunks.length; const k1 = 1.4, b = 0.75;
        return chunks.map((c) => { const tf = new Map(); c.toks.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1)); let s = 0; qt.forEach((t) => { const f = tf.get(t) || 0; if (!f) return; const idf = Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5)); s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * c.toks.length / avg)); }); return { c, s }; }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k);
      }
      const msg = (who, node) => { const m = h('div.msg.' + who, node); log.appendChild(m); m.scrollIntoView({ block: 'nearest' }); return m; };
      async function send() {
        const q = input.value.trim(); if (!q || !chunks.length) return; input.value = ''; msg('me', h('p', q)); const hits = search(q, 5); const thinking = msg('bot', h('p.muted', 'Thinking…')); sendBtn.disabled = true;
        try {
          if (!hits.length) { thinking.replaceChildren(h('p', 'I couldn’t find anything about that in these documents. Try different words.')); return; }
          const c = LLM.get();
          if (c.provider !== 'off' && c.key) {
            const ctxText = hits.map((x, i) => `[${i + 1}] (${x.c.file}, page ${x.c.page})\n${x.c.text}`).join('\n\n');
            const ans = await LLM.ask('Answer using ONLY the excerpts. Cite sources like [1]. If the answer is not in the excerpts, say so.', `Excerpts:\n${ctxText}\n\nQuestion: ${q}`, 900);
            thinking.replaceChildren(h('div.prose', { html: await W.mdToHtml(ans) }), sources(hits));
          } else {
            const qt = new Set(tokenize(q).filter((t) => !STOP.has(t))); const best = [];
            hits.slice(0, 3).forEach((x) => W.sentences(x.c.text).forEach((s) => { const st = tokenize(s); const ov = st.filter((t) => qt.has(t)).length; if (ov) best.push({ s, ov: ov / Math.sqrt(st.length), x }); }));
            best.sort((a, b) => b.ov - a.ov); const top = best.slice(0, 3);
            thinking.replaceChildren(h('p', { html: '<b>Best matches</b> <span class="muted small">(on-device search — add an AI key above for written answers)</span>' }), ...(top.length ? top.map((b) => h('blockquote', b.s, h('cite', ` — ${b.x.c.file}, page ${b.x.c.page}`))) : [h('p', hits[0].c.text.slice(0, 400) + '…')]), sources(hits));
          }
        } catch (e) { thinking.replaceChildren(h('p.err-t', 'Error: ' + e.message)); } finally { sendBtn.disabled = false; input.focus(); }
      }
      const sources = (hits) => h('details.srcs', h('summary', `Sources (${hits.length})`), hits.map((x, i) => h('div.src', h('b', `[${i + 1}] ${x.c.file} · page ${x.c.page}`), h('p', x.c.text.slice(0, 320) + (x.c.text.length > 320 ? '…' : '')))));
    },
  });

  // ================= COMPARE =================
  function myers(a, b) { // returns list of ops {t:'=',a,b} {t:'-',a} {t:'+',b} using LCS DP with trimming (fast for typical docs)
    let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++; let e = 0; while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
    const A = a.slice(s, a.length - e), B = b.slice(s, b.length - e); const n = A.length, m = B.length; const ops = [];
    for (let i = 0; i < s; i++) ops.push({ t: '=', v: a[i] });
    if (n * m > 4e6) { A.forEach((v) => ops.push({ t: '-', v })); B.forEach((v) => ops.push({ t: '+', v })); }
    else { const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1)); for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]); let i = 0, j = 0; while (i < n && j < m) { if (A[i] === B[j]) { ops.push({ t: '=', v: A[i] }); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) ops.push({ t: '-', v: A[i++] }); else ops.push({ t: '+', v: B[j++] }); } while (i < n) ops.push({ t: '-', v: A[i++] }); while (j < m) ops.push({ t: '+', v: B[j++] }); }
    for (let i = a.length - e; i < a.length; i++) ops.push({ t: '=', v: a[i] });
    return ops;
  }
  W.diffWords = (a, b) => { const A = a.split(/(\s+)/).filter((x) => x), B = b.split(/(\s+)/).filter((x) => x); return myers(A, B); };
  W.simpleTool({
    id: 'compare', cat: 'ai', name: 'Compare PDFs', icon: 'diff', action: 'Compare', actionIcon: 'diff',
    desc: 'See changes in text and page appearance side by side.', keys: 'diff difference changes versions revision redline compare two documents',
    files: Object.assign({ multi: true, min: 2, max: 2, title: 'Drop two PDFs: original first, revised second', hint: 'Drag rows to swap which is “original”' }, PDF_FILES),
    opts: [{ id: 'visual', type: 'check', label: 'Also compare how the pages look (pixel differences)', value: true }, { id: 'ignoreWs', type: 'check', label: 'Ignore differences in spacing and line breaks', value: true }],
    async run(items, o, ctx) {
      const [A, B] = items; const ta = await P.plainText(A, { onProgress: (f) => ctx.progress(f * 0.2, 'Reading original') }), tb = await P.plainText(B, { onProgress: (f) => ctx.progress(0.2 + f * 0.2, 'Reading revised') });
      const flat = (t) => (o.ignoreWs ? t.join('\n').replace(/\s+/g, ' ').split(/(?<=[.!?:;])\s+/) : t.join('\n').split('\n')); const la = flat(ta), lb = flat(tb); const ops = myers(la, lb);
      let add = 0, del = 0; const rows = []; // group consecutive -/+ into change blocks with word diff
      for (let i = 0; i < ops.length;) { if (ops[i].t === '=') { rows.push({ t: '=', v: ops[i].v }); i++; continue; } const dels = [], adds = []; while (i < ops.length && ops[i].t !== '=') { (ops[i].t === '-' ? dels : adds).push(ops[i].v); i++; } del += dels.length; add += adds.length; rows.push({ t: 'c', a: dels.join(' '), b: adds.join(' ') }); }
      const html = rows.map((r) => { if (r.t === '=') return `<p class="same">${esc(r.v)}</p>`; if (!r.a) return `<p class="ins">${esc(r.b)}</p>`; if (!r.b) return `<p class="del">${esc(r.a)}</p>`; return '<p class="chg">' + W.diffWords(r.a, r.b).map((d) => d.t === '=' ? esc(d.v) : d.t === '-' ? `<del>${esc(d.v)}</del>` : `<ins>${esc(d.v)}</ins>`).join('') + '</p>'; }).join('');
      const css = 'p{margin:0 0 .5em}.same{color:#666}.ins{background:#e3f6e7;border-left:3px solid #1d9b4a;padding:2px 8px}.del{background:#fde8e8;border-left:3px solid #d33;padding:2px 8px;text-decoration:line-through;color:#933}.chg{border-left:3px solid #e8a200;padding:2px 8px;background:#fff8e4}del{background:#fbc9c9;text-decoration:line-through}ins{background:#bfeccc;text-decoration:none}';
      const changed = rows.filter((r) => r.t === 'c').length;
      // visual
      const vis = []; if (o.visual) { const n = Math.min(await P.pageCount(A), await P.pageCount(B), 40); for (let i = 0; i < n; i++) { ctx.progress(0.4 + 0.55 * i / n, `Comparing page ${i + 1}`); const ca = await P.renderPage(A, i, { width: 520 }), cb = await P.renderPage(B, i, { width: 520 }); const w = Math.max(ca.width, cb.width), hh = Math.max(ca.height, cb.height); const out = W.canvas(w, hh); const g = out.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh); g.globalAlpha = 0.28; g.drawImage(cb, 0, 0); g.globalAlpha = 1; const ga = ca.getContext('2d').getImageData(0, 0, ca.width, ca.height), gb = cb.getContext('2d').getImageData(0, 0, cb.width, cb.height); const id = g.getImageData(0, 0, w, hh); let diff = 0; for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const pa = x < ca.width && y < ca.height ? (y * ca.width + x) * 4 : -1, pb = x < cb.width && y < cb.height ? (y * cb.width + x) * 4 : -1; const la2 = pa < 0 ? 255 : (ga.data[pa] + ga.data[pa + 1] + ga.data[pa + 2]) / 3, lb2 = pb < 0 ? 255 : (gb.data[pb] + gb.data[pb + 1] + gb.data[pb + 2]) / 3; if (Math.abs(la2 - lb2) > 40) { diff++; const o2 = (y * w + x) * 4; id.data[o2] = 232; id.data[o2 + 1] = 40; id.data[o2 + 2] = 40; id.data[o2 + 3] = 255; } } g.putImageData(id, 0, 0); vis.push({ i, diff, pct: diff / (w * hh) * 100, canvas: out }); await U.tick(); } }
      const sumHtml = `<div class="cmp-sum"><b>${add}</b> passages added · <b>${del}</b> removed · <b>${changed}</b> edited${o.visual ? ` · <b>${vis.filter((v) => v.pct > 0.05).length}</b> of ${vis.length} pages look different` : ''}</div>`;
      const view = h('div.cmp', { html: `${sumHtml}<style>.cmp p{margin:0 0 6px;font-size:14px;line-height:1.5}${css.replace(/(^|\})([^{]+)\{/g, (m, a, s) => a + s.split(',').map((x) => '.cmp ' + x.trim()).join(',') + '{')}</style><div class="cmp-text">${html}</div>` });
      if (vis.length) { const g = h('div.cmp-vis'); vis.filter((v) => v.pct > 0.02).forEach((v) => g.appendChild(h('figure', v.canvas, h('figcaption', `Page ${v.i + 1} — ${v.pct.toFixed(1)}% changed`)))); view.appendChild(h('h4', { style: 'margin:14px 0 6px' }, 'Pages that look different')); view.appendChild(vis.some((v) => v.pct > 0.02) ? g : h('p.muted', 'The pages look identical.')); }
      const report = await W.htmlToPdf({ html: W.wrapDoc(`<h1>Comparison report</h1><p><b>Original:</b> ${esc(A.name)}<br><b>Revised:</b> ${esc(B.name)}</p><p>${add} added · ${del} removed · ${changed} edited</p>${html}`, { css }), onProgress: () => { }, title: 'Comparison report' });
      const out1 = P.outPdf(report, 'comparison-report.pdf'); out1.view = view;
      return { outputs: [out1], note: `${add} added · ${del} removed · ${changed} edited` };
    },
  });

  W.pdf.salvageTrailer = function (bytes) {
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const cut = s.lastIndexOf('endobj'); if (cut > 0) s = s.slice(0, cut + 6);
    const re = /(?:^|[\r\n\s])(\d+)\s+(\d+)\s+obj\b/g; const objs = new Map(); let m;
    while ((m = re.exec(s))) { const start = m.index + m[0].indexOf(m[1]); objs.set(+m[1], { off: start, gen: +m[2] }); }
    if (!objs.size) return null; let root = 0;
    for (const [num, o] of objs) { const seg = s.slice(o.off, o.off + 600); if (/\/Type\s*\/Catalog/.test(seg)) root = num; }
    if (!root) return null; const max = Math.max(...objs.keys());
    let out = s.replace(/\s*$/, '') + '\nxref\n0 ' + (max + 1) + '\n'; const xrefOff = out.indexOf('\nxref\n') + 1; out = out; let tbl = '0000000000 65535 f \n';
    for (let i = 1; i <= max; i++) { const o = objs.get(i); tbl += o ? String(o.off).padStart(10, '0') + ' ' + String(o.gen).padStart(5, '0') + ' n \n' : '0000000000 00000 f \n'; }
    out += tbl + 'trailer\n<< /Size ' + (max + 1) + ' /Root ' + root + ' 0 R >>\nstartxref\n' + xrefOff + '\n%%EOF\n';
    const u = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) u[i] = out.charCodeAt(i) & 255; return u;
  };

  // ================= REPAIR =================
  W.simpleTool({
    id: 'repair', cat: 'ai', name: 'Repair PDF', icon: 'wrench', action: 'Repair', actionIcon: 'wrench',
    desc: 'Recover readable pages from damaged documents.', keys: 'fix corrupt broken damaged recover unreadable error cannot open xref',
    files: Object.assign({ multi: false, title: 'Drop a damaged PDF', allowBroken: true }, PDF_FILES),
    opts: [{ id: 'rebuild', type: 'check', label: 'If the structure can’t be fixed, rebuild from page pictures (last resort)', value: true }],
    async run(items, o, ctx) {
      const it = items[0]; const bytes = await it.buf(); const base = P.suffixName(it, '-repaired'); const tried = [];
      // 1. qpdf reconstructs the cross-reference table
      ctx.progress(0.15, 'Rebuilding the file structure'); const r = await P.qpdf(['/in.pdf', '/out.pdf'], { '/in.pdf': bytes });
      if (r.out['/out.pdf'] && r.out['/out.pdf'].length > 200) {
        try { const d = await P.loadBytes(r.out['/out.pdf']); const n = d.getPageCount(); if (n > 0) return { outputs: [P.outPdf(r.out['/out.pdf'], base)], note: `Structure rebuilt — ${U.plural(n, 'page')} recovered` + (r.log ? `<br><span class="muted small">${esc(r.log.split('\n').slice(0, 2).join(' · '))}</span>` : '') }; } catch (e) { tried.push('qpdf: ' + e.message); }
      } else tried.push('qpdf: ' + (r.log.split('\n')[0] || 'failed'));
      // 1b. file cut off before the xref/trailer: scan for objects and write a fresh trailer
      ctx.progress(0.3, 'Looking for lost objects');
      try {
        const salv = W.pdf.salvageTrailer(bytes);
        if (salv) { const r2 = await P.qpdf(['/in.pdf', '/out.pdf'], { '/in.pdf': salv }); const fixed = r2.out['/out.pdf'] || salv; const d = await P.loadBytes(fixed, { throwOnInvalidObject: false }); const n = d.getPageCount(); if (n > 0) return { outputs: [P.outPdf(await P.save(d), base)], note: `Rebuilt the missing index — ${U.plural(n, 'page')} recovered` }; }
      } catch (e) { tried.push('salvage: ' + e.message); }
      // 2. lenient pdf-lib copy of whatever pages parse
      ctx.progress(0.4, 'Copying readable pages');
      try { const src = await P.loadBytes(bytes, { ignoreEncryption: true, throwOnInvalidObject: false }); const out = await P.create(); let ok = 0; for (let i = 0; i < src.getPageCount(); i++) { try { const [cp] = await out.copyPages(src, [i]); out.addPage(cp); ok++; } catch { } } if (ok) return { outputs: [P.outPdf(await P.save(out), base)], note: `${ok} of ${src.getPageCount()} pages copied` }; } catch (e) { tried.push('copy: ' + e.message); }
      // 3. pdf.js is very forgiving – render pages to pictures
      if (o.rebuild) {
        ctx.progress(0.5, 'Reading with the tolerant viewer'); const pdfjs = await W.lib('pdfjs'); let doc; try { doc = await pdfjs.getDocument({ data: bytes.slice() }).promise; } catch (e) { tried.push('viewer: ' + e.message); }
        if (doc) { const out = await P.create(); let ok = 0; for (let i = 1; i <= doc.numPages; i++) { try { ctx.progress(0.5 + 0.45 * i / doc.numPages, `Rendering page ${i}`); const pg = await doc.getPage(i); const vp = pg.getViewport({ scale: 1 }); const c = await P.render(pg, { scale: 2 }); const im = await out.embedJpg(await W.canvasBytes(c, 'image/jpeg', 0.9)); const p = out.addPage([vp.width, vp.height]); p.drawImage(im, { x: 0, y: 0, width: vp.width, height: vp.height }); ok++; } catch { } } if (ok) return { outputs: [P.outPdf(await P.save(out), base)], note: `Rebuilt ${ok} of ${doc.numPages} pages from pictures (text is no longer selectable — run OCR to restore it)` }; }
      }
      throw new Error('This file is too damaged to recover. ' + tried.join(' · '));
    },
  });
}
