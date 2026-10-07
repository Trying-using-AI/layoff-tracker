// ===== Security & privacy: protect, unlock, auto-redact, privacy scanner, fingerprint =====
{
  const esc = U.esc;
  const strength = (pw) => { let s = 0; if (pw.length >= 8) s++; if (pw.length >= 12) s++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++; return Math.min(4, s); };

  // ================= PROTECT (encrypt) =================
  W.simpleTool({
    id: 'encrypt', cat: 'security', name: 'Protect PDF', icon: 'lock-keyhole', action: 'Protect with password', actionIcon: 'lock-keyhole',
    desc: 'Add AES-256 password protection.', keys: 'password encrypt secure lock aes protect restrict permissions print copy',
    files: Object.assign({ multi: true, title: 'Drop PDFs to protect' }, PDF_FILES),
    opts: [
      { id: 'pw', type: 'password', label: 'Password to open the file', placeholder: 'Choose a strong password' },
      { id: 'meter', type: 'info', html: '' },
      { id: 'pw2', type: 'password', label: 'Repeat password', placeholder: 'Repeat' },
      { id: 'owner', type: 'password', label: 'Owner password (optional)', placeholder: 'Needed to change the restrictions later', help: 'Leave empty to generate a random one — you won’t need it unless you want to edit the permissions.' },
      { id: 'h', type: 'heading', label: 'What people can do with the file' },
      { type: 'row', children: [{ id: 'print', type: 'check', label: 'Print', value: true }, { id: 'copy', type: 'check', label: 'Copy text & images', value: true }, { id: 'modify', type: 'check', label: 'Edit / reorder pages', value: false }, { id: 'annot', type: 'check', label: 'Add comments', value: true }, { id: 'forms', type: 'check', label: 'Fill forms', value: true }] },
    ],
    setup(root) { const slot = $$('.finfo', root).find((x) => x.closest('.field') && x.closest('.field').dataset.id === 'meter'); const pw = $('#f-pw', root); if (!slot || !pw) return; const upd = () => { const s = strength(pw.value); slot.hidden = !pw.value; slot.innerHTML = `Strength: <b>${['Very weak', 'Weak', 'Okay', 'Good', 'Strong'][s]}</b> <span style="display:inline-block;vertical-align:middle;width:90px;height:6px;border-radius:9px;background:var(--line2);margin-left:6px;overflow:hidden"><i style="display:block;height:100%;width:${(s + 1) * 20}%;background:${['#c62828', '#e65100', '#b7791f', '#2e7d32', '#1b5e20'][s]}"></i></span>`; }; pw.addEventListener('input', upd); upd(); },
    validate: (it, v) => (!v.pw ? 'Enter a password.' : v.pw !== v.pw2 ? 'The two passwords don’t match.' : null),
    async run(items, o, ctx) {
      const outs = []; const owner = o.owner || U.uid() + U.uid() + U.uid();
      for (let i = 0; i < items.length; i++) {
        ctx.check(); const it = items[i]; ctx.progress(i / items.length, `Encrypting ${it.name}`);
        const bytes = await it.buf();
        const args = ['--encrypt', `--user-password=${o.pw}`, `--owner-password=${owner}`, '--bits=256', `--print=${o.print ? 'full' : 'none'}`, `--modify=${o.modify ? 'all' : 'none'}`, `--extract=${o.copy ? 'y' : 'n'}`, `--annotate=${o.annot ? 'y' : 'n'}`, `--form=${o.forms ? 'y' : 'n'}`, '--accessibility=y', '--', '/in.pdf', '/out.pdf'];
        const r = await P.qpdf(args, { '/in.pdf': bytes }); if (!r.out['/out.pdf'] || (r.code !== 0 && r.code !== 3)) throw new Error('Encryption failed: ' + r.log.split('\n')[0]);
        outs.push(P.outPdf(r.out['/out.pdf'], P.suffixName(it, '-protected')));
      }
      return { outputs: outs, note: `AES-256 encrypted · open with your password${o.owner ? '' : ' (a random owner password was set — the permissions can’t be changed later)'}` };
    },
  });

  // ================= REMOVE PASSWORD / RESTRICTIONS =================
  const decryptTool = (id, name, desc, keys, restrictionsOnly) => W.simpleTool({
    id, cat: 'security', name, icon: restrictionsOnly ? 'lock-open' : 'key-round', action: restrictionsOnly ? 'Remove restrictions' : 'Remove password', actionIcon: 'lock-open', desc, keys,
    files: Object.assign({ multi: true, title: restrictionsOnly ? 'Drop a PDF that won’t print, copy or edit' : 'Drop a password-protected PDF', hint: restrictionsOnly ? 'No password needed if it opens normally' : 'You’ll be asked for its password' }, PDF_FILES),
    opts: [{ id: 'note', type: 'info', html: restrictionsOnly ? 'Removes printing, copying and editing restrictions from PDFs that you can open without a password. Only use this on documents you own or are allowed to modify.' : 'Enter the document’s password when asked. We save an unlocked copy — the original file is not changed.' }],
    async run(items, o, ctx) {
      const outs = [];
      for (const it of items) {
        ctx.check(); const bytes = await it.buf(); const was = it.wasEncrypted || it.decrypted;
        const r = await P.qpdf(['--decrypt', '/in.pdf', '/out.pdf'], { '/in.pdf': bytes });
        const out = r.out['/out.pdf']; if (!out || (r.code !== 0 && r.code !== 3)) throw new Error('Could not unlock this file: ' + r.log.split('\n')[0]);
        outs.push(Object.assign(P.outPdf(out, P.suffixName(it, restrictionsOnly ? '-unrestricted' : '-unlocked')), { meta: was ? 'unlocked' : 'it was not protected — copy saved' }));
      }
      return outs;
    },
  });
  decryptTool('remove-password', 'Remove password', 'Save an unencrypted copy using your document password.', 'decrypt unlock open password remove protection', false);
  decryptTool('unlock', 'Remove restrictions', 'Remove printing, editing, or copying restrictions.', 'unrestrict print copy edit permissions owner password unlock', true);

  // ================= AUTO-REDACT PII =================
  const verhoeffD = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
  const verhoeffP = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
  const verhoeff = (num) => { let c = 0; num.split('').reverse().forEach((d, i) => { c = verhoeffD[c][verhoeffP[i % 8][+d]]; }); return c === 0; };
  const luhn = (n) => { let s = 0, alt = false; for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } s += d; alt = !alt; } return s % 10 === 0; };
  W.PII = [
    { id: 'email', label: 'Email addresses', on: true, re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
    { id: 'phone', label: 'Phone numbers', on: true, re: /(?<![\w.])(?:\+?\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?|\d{2,5}[\s-]?)?\d{3,5}[\s-]?\d{4,5}(?![\w.])/g, ok: (m) => { const d = m.replace(/\D/g, ''); return d.length >= 10 && d.length <= 13 && !/^(19|20)\d{6}/.test(d); } },
    { id: 'card', label: 'Credit / debit card numbers', on: true, re: /\b(?:\d[ -]?){13,19}\b/g, ok: (m) => { const d = m.replace(/\D/g, ''); return d.length >= 13 && d.length <= 19 && luhn(d); } },
    { id: 'aadhaar', label: 'Aadhaar numbers (India)', on: true, re: /\b\d{4}\s?\d{4}\s?\d{4}\b/g, ok: (m) => { const d = m.replace(/\s/g, ''); return d.length === 12 && /^[2-9]/.test(d) && verhoeff(d); } },
    { id: 'pan', label: 'PAN (India)', on: true, re: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
    { id: 'gstin', label: 'GSTIN (India)', on: false, re: /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g },
    { id: 'ifsc', label: 'IFSC / bank codes', on: false, re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
    { id: 'ssn', label: 'US Social Security numbers', on: true, re: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g },
    { id: 'iban', label: 'IBAN', on: false, re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g },
    { id: 'ip', label: 'IP addresses', on: false, re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
    { id: 'url', label: 'Web links', on: false, re: /\bhttps?:\/\/[^\s)>\]]+/gi },
    { id: 'dob', label: 'Dates (dd/mm/yyyy, yyyy-mm-dd)', on: false, re: /\b(?:\d{1,2}[\/.-]\d{1,2}[\/.-](?:19|20)\d{2}|(?:19|20)\d{2}-\d{2}-\d{2})\b/g },
  ];
  W.PII.matcher = (def) => (text) => { const out = []; def.re.lastIndex = 0; let m; while ((m = def.re.exec(text))) { if (m[0] === '') { def.re.lastIndex++; continue; } if (!def.ok || def.ok(m[0])) out.push([m.index, m.index + m[0].length]); } return out.length ? out : null; };
  W.tool({
    id: 'auto-redact', cat: 'security', name: 'Auto-redact personal data', icon: 'scan-eye', desc: 'Review detected identifiers before permanent removal.',
    keys: 'pii personal data sensitive email phone aadhaar pan ssn credit card privacy blackout gdpr anonymize', badges: ['Permanent'],
    render: (root) => W.editorShell(root, {
      id: 'auto-redact', mode: 'redact', suffix: '-redacted', saveLabel: 'Apply redactions & save', dzTitle: 'Drop a PDF to scan for personal data',
      afterLoad(ed, item) {
        const sel = new Set(W.PII.filter((p) => p.on).map((p) => p.id)); const counts = h('div.pii-counts'); const status = h('span.muted.small', '');
        const o = { dpi: 200, color: '#000000', keepText: true };
        const checks = W.PII.map((p) => h('label.chk', h('input', { type: 'checkbox', checked: p.on, onchange: (e) => { e.target.checked ? sel.add(p.id) : sel.delete(p.id); } }), h('span.chk-box'), h('span.small', p.label)));
        let cache = null;
        const scan = h('button.btn.primary.sm', { html: ic('scan-search', 14) + '<span>Scan document</span>', onclick: async () => {
          scan.disabled = true; status.textContent = 'Scanning…'; counts.innerHTML = '';
          try {
            ed.objs.filter((x) => x.type === 'redact' && x.pii).forEach((x) => ed.removeObj(x.id, true));
            cache = cache || await P.text(item); let total = 0; const per = []; const taken = [];
            const order = ['card', 'aadhaar', 'ssn', 'pan', 'gstin', 'ifsc', 'iban', 'email', 'url', 'ip', 'dob', 'phone'];
            const overlap = (a, b) => a.page === b.page && Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > Math.min(a.w, b.w) * 0.4 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > Math.min(a.h, b.h) * 0.4;
            for (const def of W.PII.filter((p) => sel.has(p.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))) { let hits = await W.pdf.findText(item, W.PII.matcher(def), { pgs: cache }); hits = hits.filter((r) => !taken.some((t) => overlap(r, t))); taken.push(...hits); hits.forEach((r) => { const ob = { id: U.uid(), type: 'redact', page: r.page, x: r.x, y: r.y, w: r.w, h: r.h, text: r.text, pii: def.id }; ed.objs.push(ob); ed.draw(ob); }); total += hits.length; per.push([def.label, hits.length]); }
            if (total) ed.commit(); per.filter((x) => x[1]).forEach(([l, n]) => counts.appendChild(h('span.chip', `${l}: ${n}`)));
            status.textContent = total ? `Found ${total} item${total > 1 ? 's' : ''}. Click any box and press Delete to keep that text, or draw extra boxes.` : 'Nothing found with the selected categories (scanned pages need OCR first).';
          } finally { scan.disabled = false; }
        } });
        ed.extra.appendChild(h('div.card.pad.red-card', h('div.row.gap.wrap', h('b', 'What should we look for?'), status), h('div.pii-grid', checks), h('div.row.gap.wrap', scan), counts,
          h('div.row.gap.wrap', h('label.small', 'Box colour ', h('input', { type: 'color', value: '#000000', oninput: (e) => { o.color = e.target.value; } })), h('label.chk', h('input', { type: 'checkbox', checked: true, onchange: (e) => { o.keepText = e.target.checked; } }), h('span.chk-box'), h('span.small', 'Keep the rest of the text searchable'))),
          h('p.muted.small', 'Detection uses patterns (and check-digits for cards and Aadhaar), so always review the marked boxes. Redacted pages are rebuilt as pictures — the hidden text is removed from the file.')));
        ed.redactOpts = o; ed.setTool('redact'); scan.click();
      },
      async exporter(ed, item, prog) { const rects = ed.objs.filter((x) => x.type === 'redact'); if (!rects.length) throw new Error('Nothing is marked yet. Scan the document or drag over what you want to hide.'); return W.pdf.applyRedactions(item, rects, Object.assign({ onProgress: prog }, ed.redactOpts)); },
    }),
  });

  // ================= PRIVACY SCANNER =================
  const geoJpeg = (b) => { try { if (b[0] !== 0xFF || b[1] !== 0xD8) return false; let i = 2; while (i < b.length - 4) { if (b[i] !== 0xFF) break; const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3]; if (m === 0xE1 && b[i + 4] === 0x45 && b[i + 5] === 0x78) { const t = i + 10, le = b[t] === 0x49; const r16 = (o) => le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]; const r32 = (o) => le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216 : b[o] * 16777216 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]); const ifd = t + r32(t + 4), n = r16(ifd); for (let k = 0; k < n; k++) if (r16(ifd + 2 + k * 12) === 0x8825) return true; return false; } i += 2 + len; } } catch { } return false; };
  W.tool({
    id: 'privacy-scan', cat: 'security', name: 'Privacy scanner', icon: 'radar', desc: 'Find personal data, metadata, and hidden document risks.',
    keys: 'metadata hidden javascript attachments comments exif gps author leak sanitize clean audit scrub sensitive',
    async render(root) {
      const results = h('div.results'); const prog = W.progress(); let item = null, report = null;
      const dz = W.dropzone({ accept: '.pdf,application/pdf', multiple: false, title: 'Drop a PDF to inspect', onFiles: (fs) => open(fs[0]) }); root.append(dz, prog.el, results);
      const carried = W.takeCarry('privacy-scan'); if (carried.length) await open(carried[0]);
      async function open(file) {
        const it = new W.Item(file); try { await P.prepare(it); } catch (e) { if (!e.cancelled) W.toast('That file can’t be read as a PDF.', 'err'); return; } item = it; results.innerHTML = ''; prog.set(null, 'Inspecting…');
        try { report = await scan(it); } catch (e) { prog.hide(); results.appendChild(h('div.errbox', h('b', 'Scan failed'), h('p', W.friendlyError(e)))); return; } prog.hide(); render();
      }
      async function scan(it) {
        const doc = await P.load(it); const ctx = doc.context; const { PDFName, PDFDict, PDFArray, PDFRawStream } = PDFLib; const R = { meta: [], risks: [], pii: [], links: [], fields: 0, annots: { total: 0, comments: 0 }, attachments: [], js: 0, imagesGps: 0, pages: doc.getPageCount() };
        const info = { Title: doc.getTitle(), Author: doc.getAuthor(), Subject: doc.getSubject(), Keywords: doc.getKeywords(), Creator: doc.getCreator(), Producer: doc.getProducer(), Created: doc.getCreationDate() && doc.getCreationDate().toLocaleString(), Modified: doc.getModificationDate() && doc.getModificationDate().toLocaleString() };
        Object.entries(info).forEach(([k, v]) => { if (v) R.meta.push([k, String(v)]); });
        const cat = doc.catalog; R.xmp = !!cat.get(PDFName.of('Metadata'));
        const names = cat.lookup(PDFName.of('Names'), PDFDict);
        if (names) { const ef = names.lookup(PDFName.of('EmbeddedFiles'), PDFDict); if (ef) { const arr = ef.lookup(PDFName.of('Names')); if (arr instanceof PDFArray) for (let i = 0; i < arr.size(); i += 2) { const nm = arr.lookup(i); R.attachments.push(nm && nm.decodeText ? nm.decodeText() : 'attachment'); } } if (names.get(PDFName.of('JavaScript'))) R.js++; }
        if (cat.get(PDFName.of('OpenAction'))) { const oa = cat.lookup(PDFName.of('OpenAction')); if (oa instanceof PDFDict && /JavaScript|Launch|URI/.test(String(oa.get(PDFName.of('S'))))) R.js++; }
        if (cat.get(PDFName.of('AA'))) R.js++;
        try { const form = doc.getForm(); R.fields = form.getFields().length; R.filled = form.getFields().filter((f) => { try { return (f.getText && f.getText()) || (f.isChecked && f.isChecked()); } catch { return false; } }).length; } catch { }
        doc.getPages().forEach((p) => { const a = p.node.Annots(); if (!a) return; for (let i = 0; i < a.size(); i++) { const d = a.lookup(i, PDFDict); const st = String(d.get(PDFName.of('Subtype'))); R.annots.total++; if (/Text|Highlight|Underline|StrikeOut|Squiggly|FreeText|Popup|Caret|Ink|Stamp/.test(st)) R.annots.comments++; if (st === '/Link') { const act = d.lookup(PDFName.of('A'), PDFDict); const u = act && act.get(PDFName.of('URI')); if (u && u.decodeText) R.links.push(u.decodeText()); if (act && /JavaScript|Launch/.test(String(act.get(PDFName.of('S'))))) R.js++; } } });
        for (const [, o] of ctx.enumerateIndirectObjects()) { if (o instanceof PDFRawStream && String(o.dict.get(PDFName.of('Subtype'))) === '/Image' && /DCTDecode/.test(String(o.dict.get(PDFName.of('Filter'))))) { if (geoJpeg(o.contents)) R.imagesGps++; } }
        const pages = await P.text(it); const text = pages.map((p) => P.lines(p).map((l) => l.text).join('\n')).join('\n'); R.words = (text.match(/\S+/g) || []).length; R.scanned = R.words < 5;
        for (const def of W.PII) { const m = W.PII.matcher(def)(text); if (m) R.pii.push([def.label, m.length, m.slice(0, 3).map(([a, b]) => text.slice(a, b))]); }
        const risk = (lvl, t, d) => R.risks.push({ lvl, t, d });
        if (R.js) risk('high', 'Embedded JavaScript or launch actions', `${R.js} item(s) can run code when the file is opened.`);
        if (R.attachments.length) risk('high', 'Attached files', R.attachments.join(', '));
        if (R.imagesGps) risk('high', 'GPS location in photos', `${R.imagesGps} embedded photo(s) contain location data.`);
        if (R.pii.length) risk('med', 'Personal data in the text', R.pii.map((p) => `${p[0]} (${p[1]})`).join(' · '));
        if (R.meta.some(([k]) => /Author|Creator|Producer/.test(k)) || R.xmp) risk('med', 'Document metadata', R.meta.filter(([k]) => /Author|Title|Creator|Producer/.test(k)).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'XMP metadata present');
        if (R.annots.comments) risk('med', 'Comments & markup', `${R.annots.comments} annotation(s) may contain notes or reviewer names.`);
        if (R.fields && R.filled) risk('med', 'Filled-in form fields', `${R.filled} of ${R.fields} fields contain answers.`);
        if (R.links.length) risk('low', 'Outgoing links', R.links.slice(0, 5).join(' · ') + (R.links.length > 5 ? ` … (+${R.links.length - 5})` : ''));
        R.score = R.risks.reduce((a, r) => a + { high: 30, med: 12, low: 3 }[r.lvl], 0); return R;
      }
      function render() {
        results.innerHTML = ''; const R = report; const lvl = R.score >= 40 ? ['High exposure', 'err'] : R.score >= 12 ? ['Some exposure', 'warn'] : ['Looks clean', 'ok'];
        const clean = { meta: true, xmp: true, js: true, att: true, annots: false, links: false, forms: false, outline: false };
        const opt = (k, label, on) => h('label.chk', h('input', { type: 'checkbox', checked: on, onchange: (e) => (clean[k] = e.target.checked) }), h('span.chk-box'), h('span', label));
        const card = h('div.card.pad.scan-card', h('div.scan-head', h('span.scan-pill.' + lvl[1], lvl[0]), h('div', h('b', item.name), h('div.muted.small', `${U.plural(R.pages, 'page')} · ${R.words.toLocaleString()} words${R.scanned ? ' · looks scanned (no text layer)' : ''}`))),
          R.risks.length ? h('div.risk-list', R.risks.map((r) => h('div.risk.' + r.lvl, h('b', r.t), h('span', r.d)))) : h('p', 'No hidden data, personal data or active content was detected.'),
          R.meta.length ? h('details', h('summary', `Metadata (${R.meta.length} fields)`), h('table.kv', R.meta.map(([k, v]) => h('tr', h('th', k), h('td', v))))) : null,
          R.pii.length ? h('details', h('summary', 'Personal data found'), h('table.kv', R.pii.map(([l, n, ex]) => h('tr', h('th', l), h('td', `${n} × — e.g. ${ex.join(', ')}`))))) : null);
        const cleanCard = h('div.card.pad', h('h3.card-h', 'Clean this file'), h('div.opts-grid', opt('meta', 'Remove document properties (author, title, dates…)', true), opt('xmp', 'Remove XMP metadata & thumbnails', true), opt('js', 'Remove JavaScript and launch actions', true), opt('att', 'Remove attached files', true), opt('annots', 'Remove comments & markup', false), opt('links', 'Remove hyperlinks', false), opt('forms', 'Flatten form fields', false), opt('outline', 'Remove bookmarks', false)),
          h('div.row.gap.wrap', { style: 'margin-top:12px' }, h('button.btn.primary', { html: ic('shield-check', 16) + '<span>Create cleaned copy</span>', onclick: async (e) => { const btn = e.currentTarget; btn.disabled = true; try { const bytes = await doClean(clean); const out = h('div'); await W.showResults(out, [P.outPdf(bytes, P.suffixName(item, '-clean'))], { tool: W.byId['privacy-scan'], note: 'Metadata and hidden content removed' }); cleanCard.appendChild(out); } catch (er) { W.toast(er.message, 'err'); } finally { btn.disabled = false; } } }), h('button.btn', { onclick: () => W.go('auto-redact', [item.file]) }, 'Redact personal data…'), h('button.btn.ghost', { onclick: () => { item = null; results.innerHTML = ''; dz.hidden = false; } }, 'Scan another file')));
        dz.hidden = true; results.append(card, cleanCard);
      }
      async function doClean(c) {
        const doc = await P.load(item); const { PDFName, PDFDict } = PDFLib; const cat = doc.catalog;
        if (c.meta) { doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]); doc.setCreator(''); doc.setProducer(''); const info = doc.context.lookup(doc.context.trailerInfo.Info); if (info && info.keys) info.keys().slice().forEach((k) => info.delete(k)); }
        if (c.xmp) { cat.delete(PDFName.of('Metadata')); doc.getPages().forEach((p) => { p.node.delete(PDFName.of('Metadata')); p.node.delete(PDFName.of('Thumb')); p.node.delete(PDFName.of('PieceInfo')); }); cat.delete(PDFName.of('PieceInfo')); }
        if (c.js) { const names = cat.lookup(PDFName.of('Names'), PDFDict); if (names) names.delete(PDFName.of('JavaScript')); cat.delete(PDFName.of('OpenAction')); cat.delete(PDFName.of('AA')); doc.getPages().forEach((p) => { p.node.delete(PDFName.of('AA')); const a = p.node.Annots(); if (a) for (let i = 0; i < a.size(); i++) { const d = a.lookup(i, PDFDict); d.delete(PDFName.of('AA')); const act = d.lookup(PDFName.of('A'), PDFDict); if (act && /JavaScript|Launch/.test(String(act.get(PDFName.of('S'))))) d.delete(PDFName.of('A')); } }); }
        if (c.att) { const names = cat.lookup(PDFName.of('Names'), PDFDict); if (names) names.delete(PDFName.of('EmbeddedFiles')); doc.getPages().forEach((p) => { const a = p.node.Annots(); if (!a) return; const keep = []; for (let i = 0; i < a.size(); i++) { const d = a.lookup(i, PDFDict); if (String(d.get(PDFName.of('Subtype'))) !== '/FileAttachment') keep.push(a.get(i)); } p.node.set(PDFName.of('Annots'), doc.context.obj(keep)); }); }
        if (c.forms) { try { doc.getForm().flatten(); } catch { } }
        if (c.annots || c.links) doc.getPages().forEach((p) => { const a = p.node.Annots(); if (!a) return; const keep = []; for (let i = 0; i < a.size(); i++) { const d = a.lookup(i, PDFDict); const st = String(d.get(PDFName.of('Subtype'))); const isLink = st === '/Link', isWidget = st === '/Widget'; if ((isLink && c.links) || (!isLink && !isWidget && c.annots)) continue; keep.push(a.get(i)); } if (keep.length) p.node.set(PDFName.of('Annots'), doc.context.obj(keep)); else p.node.delete(PDFName.of('Annots')); });
        if (c.outline) cat.delete(PDFName.of('Outlines'));
        const bytes = await doc.save({ useObjectStreams: true }); return W.pdf.optimize(bytes);
      }
    },
  });

  // ================= FINGERPRINT =================
  function md5(bytes) { // compact MD5
    const K = new Uint32Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]; for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
    const len = bytes.length, padded = new Uint8Array(((len + 8 >> 6) + 1) << 6); padded.set(bytes); padded[len] = 0x80; const dv = new DataView(padded.buffer); dv.setUint32(padded.length - 8, len << 3, true); dv.setUint32(padded.length - 4, Math.floor(len / 536870912), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476; const M = new Uint32Array(16);
    for (let off = 0; off < padded.length; off += 64) { for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true); let A = a0, B = b0, C = c0, D = d0; for (let i = 0; i < 64; i++) { let F, g; if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; } F = (F + A + K[i] + M[g]) >>> 0; A = D; D = C; C = B; const s = S[(i >> 4) * 4 + (i % 4)]; B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0; } a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0; }
    const out = new Uint8Array(16), o = new DataView(out.buffer); o.setUint32(0, a0, true); o.setUint32(4, b0, true); o.setUint32(8, c0, true); o.setUint32(12, d0, true); return Array.from(out).map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  W.tool({
    id: 'fingerprint', cat: 'security', name: 'Document fingerprint', icon: 'fingerprint', desc: 'Hash files and check whether their contents changed.',
    keys: 'hash sha256 checksum md5 verify integrity tamper compare digest sha1 sha512 authenticity',
    async render(root) {
      const out = h('div.results');
      const fl = W.fileList({ multi: true, accept: '*', kind: 'any', title: 'Drop any files to fingerprint', hint: 'PDFs also get a “content fingerprint” that ignores metadata', noThumb: false, onChange: refresh });
      const expect = h('input.in', { placeholder: 'Paste an expected hash here to verify (optional)', oninput: () => refresh() });
      root.append(h('section.card.pad', h('h3.card-h', h('span.step', '1'), 'Files'), fl.el), h('section.card.pad', h('h3.card-h', h('span.step', '2'), 'Verify against a known hash'), expect), out);
      const carried = W.takeCarry('fingerprint'); if (carried.length) await fl.add(carried);
      let token = 0;
      async function refresh() {
        const my = ++token; out.innerHTML = ''; if (!fl.items.length) return; const rows = []; const want = expect.value.trim().toLowerCase().replace(/\s+/g, '');
        for (const it of fl.items) {
          const buf = await it.buf(); const r = { it, md5: md5(buf), sha1: await U.sha('SHA-1', buf), sha256: await U.sha('SHA-256', buf), sha384: await U.sha('SHA-384', buf), sha512: await U.sha('SHA-512', buf) };
          if (it.kind === 'pdf') { try { const pages = await P.plainText(it); const norm = pages.map((p) => p.replace(/\s+/g, ' ').trim().toLowerCase()); r.content = await U.sha('SHA-256', new TextEncoder().encode(norm.join('\n\f\n'))); r.pageHashes = await Promise.all(norm.map((t) => U.sha('SHA-256', new TextEncoder().encode(t)))); r.words = norm.join(' ').split(/\s+/).filter(Boolean).length; } catch { } }
          rows.push(r); if (my !== token) return;
        }
        out.innerHTML = '';
        rows.forEach((r) => {
          const match = want ? [r.md5, r.sha1, r.sha256, r.sha384, r.sha512, r.content].find((x) => x === want) : null; const line = (lab, v) => h('div.hash-row', h('span.hl', lab), h('code', v), h('button.icon-btn', { title: 'Copy', 'aria-label': 'Copy ' + lab, html: ic('copy', 14), onclick: () => { U.copy(v); W.toast(lab + ' copied', 'ok', 1200); } }));
          out.appendChild(h('div.card.pad.fp', h('div.row.gap.wrap', h('b', r.it.name), h('span.muted.small', U.fmtBytes(r.it.size)), want ? h('span.chip' + (match ? '.ok' : ''), match ? '✓ matches' : '✗ no match') : null), line('SHA-256', r.sha256), line('SHA-1', r.sha1), line('SHA-384', r.sha384), line('SHA-512', r.sha512), line('MD5', r.md5), r.content ? line('Content', r.content) : null, r.content ? h('details', h('summary', `Per-page fingerprints (${r.pageHashes.length})`), r.pageHashes.map((x, i) => line('p' + (i + 1), x))) : null));
        });
        if (rows.length === 2) { const [a, b] = rows; const same = a.sha256 === b.sha256; const sameC = a.content && b.content && a.content === b.content; out.appendChild(h('div.card.pad', h('b', 'Comparison'), h('p', same ? '✓ The two files are byte-for-byte identical.' : sameC ? '≈ The files differ, but their readable content is identical (only metadata or structure changed).' : '✗ The files are different.' + (a.pageHashes && b.pageHashes ? ` Pages with changed text: ${a.pageHashes.map((x, i) => (x !== b.pageHashes[i] ? i + 1 : 0)).filter(Boolean).slice(0, 20).join(', ') || '—'}` : '')))); }
        const report = rows.map((r) => `${r.it.name}\n  size    ${r.it.size}\n  sha256  ${r.sha256}\n  sha1    ${r.sha1}\n  md5     ${r.md5}${r.content ? `\n  content ${r.content}` : ''}`).join('\n\n');
        out.appendChild(h('div.row.gap', h('button.btn', { html: ic('download', 15) + '<span>Download fingerprint report</span>', onclick: () => U.download(new Blob([`Wrangl fingerprint report\n${new Date().toISOString()}\n\n${report}\n`], { type: 'text/plain' }), 'fingerprints.txt') })));
      }
    },
  });
}
