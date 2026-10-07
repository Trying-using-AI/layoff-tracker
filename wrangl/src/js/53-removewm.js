// ===== Remove PDF watermark: content-stream surgery with pdf-lib =====
{
  const toStr = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return s; };
  const toBytes = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
  const wsC = (c) => c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0';
  const delim = '()<>[]{}/%';

  function tokenize(s) {
    const toks = []; let i = 0; const n = s.length;
    while (i < n) {
      const c = s[i];
      if (wsC(c)) { i++; continue; }
      if (c === '%') { while (i < n && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
      const st = i;
      if (c === '(') { let d = 1; i++; while (i < n && d > 0) { const ch = s[i]; if (ch === '\\') i += 2; else { if (ch === '(') d++; else if (ch === ')') d--; i++; } } toks.push({ t: 'str', v: s.slice(st, i), s: st, e: i }); continue; }
      if (c === '<') { if (s[i + 1] === '<') { toks.push({ t: '<<', s: st, e: i + 2 }); i += 2; continue; } while (i < n && s[i] !== '>') i++; i++; toks.push({ t: 'hex', v: s.slice(st, i), s: st, e: i }); continue; }
      if (c === '>') { if (s[i + 1] === '>') { toks.push({ t: '>>', s: st, e: i + 2 }); i += 2; } else i++; continue; }
      if (c === '[') { toks.push({ t: '[', s: st, e: i + 1 }); i++; continue; }
      if (c === ']') { toks.push({ t: ']', s: st, e: i + 1 }); i++; continue; }
      if (c === '{' || c === '}' || c === ')') { i++; continue; }
      if (c === '/') { i++; while (i < n && !wsC(s[i]) && !delim.includes(s[i])) i++; toks.push({ t: 'name', v: s.slice(st + 1, i), s: st, e: i }); continue; }
      while (i < n && !wsC(s[i]) && !delim.includes(s[i])) i++;
      const v = s.slice(st, i);
      if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(v)) { toks.push({ t: 'num', v: parseFloat(v), s: st, e: i }); continue; }
      if (v === 'BI') {
        const m = /\sID[\s]/.exec(s.slice(i)); let j = m ? i + m.index + m[0].length : n;
        const m2 = /[\s]EI(?=[\s]|$)/.exec(s.slice(j)); const end = m2 ? j + m2.index + m2[0].length : n;
        toks.push({ t: 'op', v: 'BI', s: st, e: end }); i = end; continue;
      }
      toks.push({ t: 'op', v, s: st, e: i });
    }
    return toks;
  }
  /** group tokens into operations */
  function operations(toks) {
    const ops = []; let args = []; let depth = 0; let first = -1;
    for (const t of toks) {
      if (t.t === '[' || t.t === '<<') depth++;
      if (t.t === ']' || t.t === '>>') depth = Math.max(0, depth - 1);
      if (t.t === 'op' && depth === 0) { ops.push({ op: t.v, args, s: args.length ? args[0].s : t.s, e: t.e }); args = []; continue; }
      args.push(t);
    }
    return ops;
  }
  function decodeStr(tok) {
    if (tok.t === 'hex') { const h2 = tok.v.slice(1, -1).replace(/\s+/g, ''); let o = ''; for (let i = 0; i + 1 < h2.length; i += 2) { const cc = parseInt(h2.substr(i, 2), 16); o += cc >= 32 && cc < 127 ? String.fromCharCode(cc) : ''; } return o; }
    const body = tok.v.slice(1, -1); let o = '';
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch !== '\\') { o += ch; continue; }
      const nx = body[++i];
      if (nx === 'n') o += '\n'; else if (nx === 'r') o += '\r'; else if (nx === 't') o += '\t'; else if (nx === 'b' || nx === 'f') o += ' ';
      else if (/[0-7]/.test(nx)) { let oct = nx; while (oct.length < 3 && /[0-7]/.test(body[i + 1] || '')) oct += body[++i]; o += String.fromCharCode(parseInt(oct, 8)); }
      else if (nx === '\n' || nx === '\r') { } else o += nx;
    }
    return o;
  }
  const norm = (s) => s.toLowerCase().replace(/[\s ]+/g, '');

  async function streamBytes(doc, obj) {
    const { PDFRawStream, decodePDFRawStream } = PDFLib; const r = doc.context.lookup(obj);
    if (!r) return new Uint8Array();
    if (r instanceof PDFRawStream) return decodePDFRawStream(r).decode();
    return r.getContents ? r.getContents() : new Uint8Array();
  }
  async function pageContents(doc, page) {
    const { PDFName, PDFArray } = PDFLib; const c = page.node.get(PDFName.of('Contents')); if (!c) return '';
    const look = doc.context.lookup(c); const parts = [];
    if (look instanceof PDFArray) { for (let i = 0; i < look.size(); i++) parts.push(toStr(await streamBytes(doc, look.get(i)))); } else parts.push(toStr(await streamBytes(doc, c)));
    return parts.join('\n');
  }

  /** returns {ranges:[[s,e]], stats} */
  async function scan(doc, content, res, o, depthLimit = 1) {
    const { PDFName, PDFDict, PDFRawStream } = PDFLib; const ctx = doc.context;
    const ops = operations(tokenize(content)); const ranges = []; const stats = { text: 0, marked: 0, forms: 0, images: 0 };
    const target = norm(o.text || '');
    const dict = (d, k) => { try { const v = d && d.get(PDFName.of(k)); return v ? ctx.lookup(v) : null; } catch { return null; } };
    const xo = dict(res, 'XObject'), gsd = dict(res, 'ExtGState'), props = dict(res, 'Properties');
    const stack = []; let alpha = 1; let bt = null; let btText = ''; const mc = [];
    for (let i = 0; i < ops.length; i++) {
      const p = ops[i];
      switch (p.op) {
        case 'q': stack.push(alpha); break;
        case 'Q': if (stack.length) alpha = stack.pop(); break;
        case 'gs': { const nm = p.args[0] && p.args[0].v; const g = gsd && nm ? dict(gsd, nm) : null; if (g instanceof PDFDict) { const ca = dict(g, 'ca'); alpha = ca && ca.asNumber ? ca.asNumber() : alpha; } break; }
        case 'BT': bt = p; btText = ''; break;
        case 'Tj': case "'": case '"': if (bt) { const st = p.args.filter((a) => a.t === 'str' || a.t === 'hex'); st.forEach((a) => (btText += decodeStr(a))); } break;
        case 'TJ': if (bt) p.args.forEach((a) => { if (a.t === 'str' || a.t === 'hex') btText += decodeStr(a); }); break;
        case 'ET': if (bt) { if (target && norm(btText).includes(target)) { ranges.push([bt.s, p.e]); stats.text++; } bt = null; } break;
        case 'BMC': mc.push({ s: p.s, kill: false }); break;
        case 'BDC': {
          let kill = false; const tag = p.args[0] && p.args[0].v;
          if (o.auto) {
            if (tag === 'Artifact') kill = p.args.some((a) => a.t === 'name' && a.v === 'Watermark');
            else if (tag === 'OC' && p.args[1] && p.args[1].t === 'name' && props) { const g = dict(props, p.args[1].v); const nm = g && dict(g, 'Name'); const label = nm && nm.decodeText ? nm.decodeText() : ''; kill = /water|draft|confiden|stamp|copy|sample|preview/i.test(label); }
          }
          mc.push({ s: p.s, kill }); break;
        }
        case 'EMC': { const m = mc.pop(); if (m && m.kill) { ranges.push([m.s, p.e]); stats.marked++; } break; }
        case 'Do': {
          const nm = p.args[0] && p.args[0].v; const x = xo && nm ? dict(xo, nm) : null; if (!x || !x.dict) break;
          const sub = x.dict.get(PDFName.of('Subtype'));
          if (String(sub) === '/Form') {
            let kill = false;
            if (o.auto && (x.dict.get(PDFName.of('PieceInfo')) || false) && /watermark/i.test(JSON.stringify(Object.keys(x.dict.dict ? [...x.dict.dict.keys()].map(String) : [])))) kill = true;
            if (!kill && target && depthLimit > 0) {
              const body = toStr(await streamBytes(doc, x)); const r2 = dict(x.dict, 'Resources') || res;
              const inner = await scan(doc, body, r2, Object.assign({}, o, { auto: false }), depthLimit - 1);
              if (inner.stats.text > 0) kill = true;
            }
            if (!kill && o.auto && x.dict) { const body = toStr(await streamBytes(doc, x)); if (/\/Artifact\s*<<[^>]*\/Watermark/.test(body) && !/BT[\s\S]*ET/.test(body.replace(/\/Artifact[\s\S]*?EMC/g, ''))) kill = true; }
            if (kill) { ranges.push([p.s, p.e]); stats.forms++; }
          } else if (String(sub) === '/Image' && o.images && alpha < 0.999) { ranges.push([p.s, p.e]); stats.images++; }
          break;
        }
      }
    }
    return { ranges, stats };
  }

  W.simpleTool({
    id: 'remove-watermark', cat: 'edit', name: 'Remove PDF watermark', icon: 'eraser', action: 'Remove watermark', actionIcon: 'eraser',
    desc: 'Remove separate text or image marks while preserving the rest of the page.', keys: 'delete clear stamp draft confidential logo unwatermark',
    files: Object.assign({ multi: false, title: 'Drop a PDF with a watermark' }, PDF_FILES),
    badges: ['Best effort'],
    opts: [
      { id: 'text', type: 'text', label: 'Watermark text (recommended)', placeholder: 'e.g. DRAFT or CONFIDENTIAL', help: 'Every text block containing these words is removed (case-insensitive). Leave empty to rely on the automatic options below.' },
      { id: 'auto', type: 'check', label: 'Also remove tagged watermark layers and artifacts automatically', value: true },
      { id: 'images', type: 'check', label: 'Remove semi-transparent images (logos / stamps drawn with opacity < 100%)', value: false },
      { id: 'annots', type: 'check', label: 'Remove watermark and stamp annotations', value: true },
      P.pagesField({ label: 'Only these pages (optional)' }),
      { id: 'note', type: 'info', html: 'Watermarks that are baked into a scanned picture or flattened into the page image can’t be separated — use <a href="#/t/redact">Redact PDF</a> to cover them instead.' },
    ],
    async run(items, o, ctx) {
      const it = items[0]; const doc = await P.load(it); const n = doc.getPageCount(); const sel = W.parseRanges(o.pages, n);
      const { PDFName, PDFDict, PDFArray } = PDFLib; const total = { text: 0, marked: 0, forms: 0, images: 0, annots: 0 };
      for (let k = 0; k < sel.length; k++) {
        ctx.check(); ctx.progress(k / sel.length, `Page ${sel[k] + 1}`);
        const page = doc.getPage(sel[k]); const resRaw = page.node.get(PDFName.of('Resources')); const res = resRaw ? doc.context.lookup(resRaw) : null;
        const content = await pageContents(doc, page);
        if (content) {
          const { ranges, stats } = await scan(doc, content, res, o);
          if (ranges.length) {
            ranges.sort((a, b) => a[0] - b[0]); const merged = []; for (const r of ranges) { const l = merged[merged.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else merged.push(r.slice()); }
            let out = '', pos = 0; for (const [s, e] of merged) { out += content.slice(pos, s) + ' '; pos = e; } out += content.slice(pos);
            const ref = doc.context.register(doc.context.flateStream(toBytes(out))); page.node.set(PDFName.of('Contents'), ref);
            for (const key in stats) total[key] += stats[key];
          }
        }
        if (o.annots) {
          const a = page.node.Annots(); if (a) {
            const keep = []; const target = (o.text || '').toLowerCase();
            for (let i = 0; i < a.size(); i++) {
              const d = a.lookup(i, PDFDict); const st = String(d.get(PDFName.of('Subtype')));
              const c = d.get(PDFName.of('Contents')); const txt = c && c.decodeText ? c.decodeText().toLowerCase() : '';
              if (st === '/Watermark' || ((st === '/Stamp' || st === '/FreeText') && (!target || txt.includes(target)) && (target || st === '/Stamp'))) total.annots++; else keep.push(a.get(i));
            }
            if (keep.length !== a.size()) { if (keep.length) page.node.set(PDFName.of('Annots'), doc.context.obj(keep)); else page.node.delete(PDFName.of('Annots')); }
          }
        }
        if (k % 8 === 7) await U.tick();
      }
      const cnt = total.text + total.marked + total.forms + total.images + total.annots;
      if (!cnt) throw new Error('No removable watermark was found. If the mark is part of a scanned image it can’t be removed — cover it with “Redact PDF” instead. If it is text, check the spelling.');
      const bytes = await W.pdf.optimize(await P.save(doc));
      return { outputs: [P.outPdf(bytes, P.suffixName(it, '-clean'))], note: `Removed ${cnt} watermark element${cnt > 1 ? 's' : ''} (${total.text} text, ${total.marked} marked layers, ${total.forms} stamp forms, ${total.images} images, ${total.annots} annotations)` };
    },
  });
}
