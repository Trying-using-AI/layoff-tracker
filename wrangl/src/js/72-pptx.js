// ===== PowerPoint (.pptx) → HTML slides → PDF =====
{
  const EMU = 9525; // EMU per CSS px
  const esc = U.esc;
  const kids = (n, name) => Array.from(n ? n.children : []).filter((c) => c.nodeName === name);
  const kid = (n, name) => kids(n, name)[0] || null;
  const desc = (n, name) => (n ? Array.from(n.getElementsByTagName(name)) : []);
  const num = (n, a, d = 0) => { const v = n && n.getAttribute(a); return v == null || v === '' ? d : parseFloat(v); };
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp' };

  function hsl2rgb(h, s, l) { const f = (n) => { const k = (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); }; return [f(0), f(8), f(4)].map((x) => Math.round(x * 255)); }
  function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; }

  async function load(file) {
    const JSZip = await W.lib('jszip'); const z = await JSZip.loadAsync(await file.arrayBuffer());
    const cache = new Map();
    const parse = async (path) => { if (cache.has(path)) return cache.get(path); const f = z.file(path); const d = f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null; cache.set(path, d); return d; };
    const dirOf = (p) => p.replace(/[^/]*$/, '');
    const norm = (base, t) => { if (t.startsWith('/')) return t.slice(1); const parts = (dirOf(base) + t).split('/'); const out = []; for (const x of parts) { if (x === '..') out.pop(); else if (x !== '.') out.push(x); } return out.join('/'); };
    const rels = async (path) => { const d = await parse(path.replace(/([^/]+)$/, '_rels/$1.rels')); const m = {}; if (d) desc(d, 'Relationship').forEach((r) => (m[r.getAttribute('Id')] = { target: norm(path, r.getAttribute('Target')), type: r.getAttribute('Type') })); return m; };
    const media = async (path) => { const f = z.file(path); if (!f) return null; const ext = path.split('.').pop().toLowerCase(); return `data:${MIME[ext] || 'image/png'};base64,` + await f.async('base64'); };
    return { z, parse, rels, media, norm };
  }

  W.pptxToHtml = async function (file, { onProgress } = {}) {
    const P2 = await load(file); const pres = await P2.parse('ppt/presentation.xml'); if (!pres) throw new Error('This doesn’t look like a PowerPoint (.pptx) file.');
    const sz = pres.getElementsByTagName('p:sldSz')[0]; const SW = num(sz, 'cx', 9144000), SH = num(sz, 'cy', 6858000); const pw = SW / EMU, ph = SH / EMU;
    const presRels = await P2.rels('ppt/presentation.xml'); const slidePaths = desc(pres, 'p:sldId').map((s) => presRels[s.getAttribute('r:id')] && presRels[s.getAttribute('r:id')].target).filter(Boolean);
    const themeDoc = await P2.parse(Object.values(presRels).find((r) => /theme$/.test(r.type))?.target || 'ppt/theme/theme1.xml'); const theme = {};
    if (themeDoc) { const cs = themeDoc.getElementsByTagName('a:clrScheme')[0]; if (cs) Array.from(cs.children).forEach((c) => { const v = c.firstElementChild; theme[c.nodeName.replace('a:', '')] = v ? (v.getAttribute('val') && v.nodeName === 'a:srgbClr' ? v.getAttribute('val') : v.getAttribute('lastClr') || '000000') : '000000'; }); }
    const fontsNode = themeDoc && themeDoc.getElementsByTagName('a:majorFont')[0];
    const slides = [];
    for (let si = 0; si < slidePaths.length; si++) {
      onProgress && onProgress(si / slidePaths.length, `Slide ${si + 1} of ${slidePaths.length}`);
      const sp = slidePaths[si]; const sdoc = await P2.parse(sp); if (!sdoc) continue; const srels = await P2.rels(sp);
      const layoutPath = Object.values(srels).find((r) => /slideLayout$/.test(r.type))?.target; const ldoc = layoutPath ? await P2.parse(layoutPath) : null; const lrels = layoutPath ? await P2.rels(layoutPath) : {};
      const masterPath = Object.values(lrels).find((r) => /slideMaster$/.test(r.type))?.target; const mdoc = masterPath ? await P2.parse(masterPath) : null; const mrels = masterPath ? await P2.rels(masterPath) : {};
      const clrMap = {}; const cm = mdoc && mdoc.getElementsByTagName('p:clrMap')[0]; if (cm) Array.from(cm.attributes).forEach((a) => (clrMap[a.name] = a.value));
      // ---- colour resolution
      const resolve = (el) => {
        if (!el) return null; let base = null, alpha = 1;
        const c = Array.from(el.children).find((x) => /^a:(srgbClr|schemeClr|sysClr|prstClr|hslClr|scrgbClr)$/.test(x.nodeName)); if (!c) return null;
        if (c.nodeName === 'a:srgbClr') base = c.getAttribute('val'); else if (c.nodeName === 'a:sysClr') base = c.getAttribute('lastClr') || '000000';
        else if (c.nodeName === 'a:schemeClr') { let v = c.getAttribute('val'); if (clrMap[v]) v = clrMap[v]; base = theme[v] || (v === 'phClr' ? '888888' : '000000'); } else if (c.nodeName === 'a:prstClr') base = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '00FF00', blue: '0000FF' }[c.getAttribute('val')] || '000000'; else return null;
        let [r, g, b] = [0, 2, 4].map((i) => parseInt(base.substr(i, 2), 16));
        for (const m of Array.from(c.children)) { const v = num(m, 'val') / 100000; const n = m.nodeName; if (n === 'a:alpha') alpha = v; else if (n === 'a:lumMod' || n === 'a:lumOff') { /* handled below */ } }
        const lm = kid(c, 'a:lumMod'), lo = kid(c, 'a:lumOff'); if (lm || lo) { let [hh, s, l] = rgb2hsl(r, g, b); if (lm) l *= num(lm, 'val') / 100000; if (lo) l += num(lo, 'val') / 100000; [r, g, b] = hsl2rgb(hh, s, U.clamp(l, 0, 1)); }
        const sh = kid(c, 'a:shade'); if (sh) { const k = num(sh, 'val') / 100000; r *= k; g *= k; b *= k; } const ti = kid(c, 'a:tint'); if (ti) { const k = num(ti, 'val') / 100000; r = 255 - (255 - r) * k; g = 255 - (255 - g) * k; b = 255 - (255 - b) * k; }
        return alpha < 1 ? `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})` : `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
      };
      const fillOf = (spPr) => { if (!spPr) return null; if (kid(spPr, 'a:noFill')) return 'none'; const s = kid(spPr, 'a:solidFill'); if (s) return resolve(s); const g = kid(spPr, 'a:gradFill'); if (g) { const gs = desc(g, 'a:gs')[0]; return gs ? resolve(gs) : null; } return null; };
      // ---- placeholder lookups
      const phOf = (sp) => { const ph = desc(sp, 'p:ph')[0]; return ph ? { type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') } : null; };
      const findPh = (doc, ph) => { if (!doc || !ph) return null; return desc(doc, 'p:sp').find((s) => { const p = phOf(s); return p && ((ph.idx && p.idx === ph.idx) || (p.type === ph.type && (!ph.idx || !p.idx))); }) || desc(doc, 'p:sp').find((s) => { const p = phOf(s); return p && p.type === ph.type; }) || null; };
      const xfrmOf = (sp) => { const x = desc(sp, 'a:xfrm')[0] || (sp && sp.getElementsByTagName('p:xfrm')[0]); if (!x) return null; const off = kid(x, 'a:off'), ext = kid(x, 'a:ext'); if (!off || !ext) return null; return { x: num(off, 'x'), y: num(off, 'y'), w: num(ext, 'cx'), h: num(ext, 'cy'), rot: num(x, 'rot') / 60000, flipH: x.getAttribute('flipH') === '1', flipV: x.getAttribute('flipV') === '1' }; };
      const txStyle = (kind, lvl) => { const ts = mdoc && mdoc.getElementsByTagName('p:txStyles')[0]; const st = ts && kid(ts, kind); return st ? kid(st, `a:lvl${lvl + 1}pPr`) : null; };
      const bgOf = (doc) => { const bg = doc && doc.getElementsByTagName('p:bg')[0]; if (!bg) return null; const pr = kid(bg, 'p:bgPr'); if (pr) { const f = fillOf(pr); if (f) return f; } const ref = kid(bg, 'p:bgRef'); return ref ? resolve(ref) : null; };
      const bg = bgOf(sdoc) || bgOf(ldoc) || bgOf(mdoc) || '#fff';
      // ---- text
      const lstOf = (sp) => { const tb = sp && kid(sp, 'p:txBody'); return tb ? kid(tb, 'a:lstStyle') : null; };
      const lvlProps = (chain, lvl) => chain.map((n) => n && kid(n, `a:lvl${lvl + 1}pPr`)).filter(Boolean);
      const firstAttr = (nodes, get) => { for (const n of nodes) { const v = get(n); if (v != null && v !== '') return v; } return null; };
      async function textHtml(sp, phInfo, ctxChain, scale) {
        const tb = kid(sp, 'p:txBody'); if (!tb) return ''; const body = kid(tb, 'a:bodyPr'); const own = lstOf(sp);
        const isTitle = phInfo && /title/i.test(phInfo.type); const styleKind = phInfo ? (isTitle ? 'p:titleStyle' : phInfo.type === 'body' || phInfo.type === 'subTitle' || !phInfo.type ? 'p:bodyStyle' : 'p:otherStyle') : 'p:otherStyle';
        let html = '';
        for (const p of kids(tb, 'a:p')) {
          const pPr = kid(p, 'a:pPr'); const lvl = num(pPr, 'lvl', 0); const chain = [pPr, ...lvlProps(ctxChain, lvl), own && kid(own, `a:lvl${lvl + 1}pPr`), txStyle(styleKind, lvl)].filter(Boolean);
          const algn = firstAttr(chain, (n) => n.getAttribute && n.getAttribute('algn')) || 'l'; const marL = num(chain.find((n) => n.getAttribute && n.getAttribute('marL') != null), 'marL', phInfo && !isTitle ? 0 : 0) / EMU, indent = num(chain.find((n) => n.getAttribute && n.getAttribute('indent') != null), 'indent', 0) / EMU;
          const bu = chain.map((n) => kid(n, 'a:buChar') || kid(n, 'a:buAutoNum') || kid(n, 'a:buNone')).find(Boolean);
          let marker = ''; if (bu && bu.nodeName === 'a:buChar') marker = bu.getAttribute('char') || '•'; else if (bu && bu.nodeName === 'a:buAutoNum') marker = '1.';
          const lnSpcN = chain.map((n) => kid(n, 'a:lnSpc')).find(Boolean); const lnSpc = lnSpcN && kid(lnSpcN, 'a:spcPct') ? num(kid(lnSpcN, 'a:spcPct'), 'val') / 100000 : null;
          const spcBef = chain.map((n) => kid(n, 'a:spcBef')).find(Boolean), spcAft = chain.map((n) => kid(n, 'a:spcAft')).find(Boolean);
          const sp2px = (n) => { if (!n) return 0; const pts = kid(n, 'a:spcPts'); return pts ? num(pts, 'val') / 100 * 1.3333 : 0; };
          let runs = '', any = false; let maxSz = 0;
          for (const r of Array.from(p.children)) {
            if (!/^a:(r|fld|br)$/.test(r.nodeName)) continue; if (r.nodeName === 'a:br') { runs += '<br>'; continue; }
            const rPr = kid(r, 'a:rPr'); const t = (kid(r, 'a:t') || {}).textContent || ''; if (!t) continue; any = true;
            const rc = [rPr, ...chain.map((n) => kid(n, 'a:defRPr')), ...lvlProps(ctxChain, lvl).map((n) => kid(n, 'a:defRPr'))].filter(Boolean);
            let szv = firstAttr(rc, (n) => n.getAttribute('sz')); const size = (szv ? +szv / 100 : phInfo && isTitle ? 44 : 18) * scale; maxSz = Math.max(maxSz, size);
            const b = firstAttr(rc, (n) => n.getAttribute('b')) === '1', i = firstAttr(rc, (n) => n.getAttribute('i')) === '1', u = firstAttr(rc, (n) => n.getAttribute('u')); const strike = firstAttr(rc, (n) => n.getAttribute('strike'));
            let color = null; for (const n of rc) { const sf = kid(n, 'a:solidFill'); if (sf) { color = resolve(sf); break; } } if (!color) color = isTitle || !phInfo ? 'rgb(0,0,0)' : 'rgb(0,0,0)';
            const font = rc.map((n) => kid(n, 'a:latin')).find(Boolean); const fam = font ? font.getAttribute('typeface') : '';
            const base = firstAttr(rc, (n) => n.getAttribute('baseline')); const sup = base && +base > 0;
            runs += `<span style="font-size:${(size * 1.3333).toFixed(2)}px;${b ? 'font-weight:700;' : ''}${i ? 'font-style:italic;' : ''}${(u && u !== 'none') || strike === 'sngStrike' ? `text-decoration:${u && u !== 'none' ? 'underline' : ''} ${strike === 'sngStrike' ? 'line-through' : ''};` : ''}color:${color};${/times|georgia|garamond|cambria|serif/i.test(fam) ? 'font-family:Times New Roman;' : /courier|consolas|mono/i.test(fam) ? 'font-family:Courier New;' : ''}${sup ? 'vertical-align:super;font-size:70%;' : ''}">${esc(t)}</span>`;
          }
          const endSz = (kid(p, 'a:endParaRPr') ? num(kid(p, 'a:endParaRPr'), 'sz', 1800) / 100 : 18) * scale;
          if (!any && !/<br>/.test(runs)) { html += `<div style="height:${((maxSz || endSz) * 1.3333 * 1.1).toFixed(1)}px"></div>`; continue; }
          const hang = Math.max(18, -indent || 22);
          html += `<div class="pp" style="text-align:${{ l: 'left', ctr: 'center', r: 'right', just: 'justify' }[algn] || 'left'};margin-left:${(marL + (marker && indent < 0 ? 0 : Math.max(0, indent))).toFixed(1)}px;${lnSpc ? `line-height:${lnSpc * 1.2};` : 'line-height:1.2;'}margin-top:${sp2px(spcBef).toFixed(1)}px;margin-bottom:${sp2px(spcAft).toFixed(1)}px;position:relative">${marker ? `<span class="bu" style="position:absolute;left:-${hang}px;width:${hang - 4}px;text-align:left;font-size:${(maxSz * 1.3333).toFixed(1)}px">${esc(marker === '1.' ? '•' : marker)}</span>` : ''}${runs}</div>`;
        }
        return html;
      }
      // ---- shape → html
      const out = []; let zi = 0;
      const emitShape = async (sp, tf, ctxDocs, opts = {}) => {
        const kind = sp.nodeName; const ph = phOf(sp); const spPr = kid(sp, 'p:spPr') || kid(sp, 'p:grpSpPr');
        let box = xfrmOf(kid(sp, 'p:spPr') || sp) || (kind === 'p:graphicFrame' ? xfrmOf(sp) : null);
        const layoutPh = ph ? findPh(ldoc, ph) : null, masterPh = ph ? findPh(mdoc, ph) : null;
        if (!box && ph) box = (layoutPh && xfrmOf(kid(layoutPh, 'p:spPr'))) || (masterPh && xfrmOf(kid(masterPh, 'p:spPr')));
        if (!box) return; const m = tf; const x = (m.ox + (box.x - m.cx) * m.sx) / EMU, y = (m.oy + (box.y - m.cy) * m.sy) / EMU, w = box.w * m.sx / EMU, hh = box.h * m.sy / EMU;
        const geom = spPr && kid(spPr, 'a:prstGeom'); const prst = geom ? geom.getAttribute('prst') : 'rect';
        let fill = fillOf(spPr); if (fill == null && ph) { const lf = layoutPh && fillOf(kid(layoutPh, 'p:spPr')); fill = lf || null; }
        const ln = spPr && kid(spPr, 'a:ln'); let border = ''; if (ln && !kid(ln, 'a:noFill')) { const lc = resolve(kid(ln, 'a:solidFill')); const lw = Math.max(1, num(ln, 'w', 12700) / EMU); if (lc) border = `border:${lw.toFixed(1)}px solid ${lc};`; }
        const radius = prst === 'ellipse' ? 'border-radius:50%;' : prst === 'roundRect' ? `border-radius:${(Math.min(w, hh) * (geom && kid(geom, 'a:avLst') && kid(kid(geom, 'a:avLst'), 'a:gd') ? Math.min(0.5, num({ getAttribute: () => (kid(kid(geom, 'a:avLst'), 'a:gd').getAttribute('fmla') || '').replace(/[^\d]/g, '') }, 'x') / 100000) : 0.1667)).toFixed(1)}px;` : '';
        zi++;
        if (kind === 'p:pic') {
          const blip = desc(sp, 'a:blip')[0]; const rid = blip && blip.getAttribute('r:embed'); const rel = rid && ctxDocs.rels[rid]; const url = rel && await P2.media(rel.target); if (url) out.push(`<img src="${url}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${hh}px;z-index:${zi};${box.flipH ? '' : ''}">`); return;
        }
        if (kind === 'p:graphicFrame') {
          const tbl = desc(sp, 'a:tbl')[0]; if (!tbl) return; const cols = desc(kid(tbl, 'a:tblGrid'), 'a:gridCol').map((c) => num(c, 'w') / EMU * m.sx);
          let th = '<table style="border-collapse:collapse;table-layout:fixed;width:100%;">'; th += '<colgroup>' + cols.map((c) => `<col style="width:${c}px">`).join('') + '</colgroup>';
          for (const tr of kids(tbl, 'a:tr')) { th += `<tr style="height:${num(tr, 'h') / EMU * m.sy}px">`; for (const tc of kids(tr, 'a:tc')) { if (tc.getAttribute('hMerge') === '1' || tc.getAttribute('vMerge') === '1') continue; const cs = tc.getAttribute('gridSpan'), rs = tc.getAttribute('rowSpan'); const tcPr = kid(tc, 'a:tcPr'); const cf = fillOf(tcPr); const txt = Array.from(kid(tc, 'a:txBody').getElementsByTagName('a:t')).map((t) => esc(t.textContent)).join(' '); th += `<td${cs ? ` colspan="${cs}"` : ''}${rs ? ` rowspan="${rs}"` : ''} style="border:1px solid #bbb;padding:4px 8px;font-size:${14 * m.sx * 1}px;${cf && cf !== 'none' ? `background:${cf};` : ''}">${txt}</td>`; } th += '</tr>'; }
          out.push(`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;z-index:${zi}">${th}</table></div>`); return;
        }
        if (kind === 'p:cxnSp') { const lc = ln && resolve(kid(ln, 'a:solidFill')) || '#888'; const lw = Math.max(1, num(ln, 'w', 12700) / EMU); if (w < 2) out.push(`<div style="position:absolute;left:${x}px;top:${y}px;width:0;height:${hh}px;border-left:${lw}px solid ${lc};z-index:${zi}"></div>`); else if (hh < 2) out.push(`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:0;border-top:${lw}px solid ${lc};z-index:${zi}"></div>`); return; }
        // text shape
        const tb = kid(sp, 'p:txBody'); const body = tb && kid(tb, 'a:bodyPr'); const bodyL = (layoutPh && kid(layoutPh, 'p:txBody') && kid(kid(layoutPh, 'p:txBody'), 'a:bodyPr')) || null;
        const na = body && kid(body, 'a:normAutofit') || bodyL && kid(bodyL, 'a:normAutofit'); const scale = na && na.getAttribute('fontScale') ? num(na, 'fontScale') / 100000 : 1;
        const inset = (a, d) => { const n = [body, bodyL].find((b) => b && b.getAttribute(a) != null); return (n ? num(n, a) : d) / EMU; };
        const anchor = (body && body.getAttribute('anchor')) || (bodyL && bodyL.getAttribute('anchor')) || (ph && /ctrTitle|title/.test(ph.type) ? 'ctr' : 't');
        const chain = [lstOf(layoutPh), lstOf(masterPh)]; if (ph && !layoutPh && mdoc) { /* body placeholder default */ }
        const inner = tb ? await textHtml(sp, ph, chain, scale) : '';
        const hasText = /<span/.test(inner);
        if ((fill == null || fill === 'none') && !border && !hasText) return;
        out.push(`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${hh}px;z-index:${zi};box-sizing:border-box;${fill && fill !== 'none' ? `background:${fill};` : ''}${border}${radius}padding:${inset('tIns', 45720)}px ${inset('rIns', 91440)}px ${inset('bIns', 45720)}px ${inset('lIns', 91440)}px;display:flex;flex-direction:column;justify-content:${{ t: 'flex-start', ctr: 'center', b: 'flex-end' }[anchor] || 'flex-start'};overflow:hidden">${inner}</div>`);
      };
      const walkTree = async (container, tf, ctxDocs, { skipPh = false } = {}) => {
        for (const node of Array.from(container.children)) {
          const n = node.nodeName;
          if (n === 'p:sp' || n === 'p:pic' || n === 'p:graphicFrame' || n === 'p:cxnSp') { if (skipPh && phOf(node)) continue; await emitShape(node, tf, ctxDocs); }
          else if (n === 'p:grpSp') { const g = kid(node, 'p:grpSpPr'); const gx = g && kid(g, 'a:xfrm'); if (gx) { const off = kid(gx, 'a:off'), ext = kid(gx, 'a:ext'), co = kid(gx, 'a:chOff'), ce = kid(gx, 'a:chExt'); const sx = num(ce, 'cx') ? num(ext, 'cx') / num(ce, 'cx') : 1, sy = num(ce, 'cy') ? num(ext, 'cy') / num(ce, 'cy') : 1; await walkTree(node, { ox: tf.ox + (num(off, 'x') - tf.cx) * tf.sx, oy: tf.oy + (num(off, 'y') - tf.cy) * tf.sy, cx: num(co, 'x'), cy: num(co, 'y'), sx: tf.sx * sx, sy: tf.sy * sy }, ctxDocs, { skipPh }); } }
        }
      };
      const ident = { ox: 0, oy: 0, cx: 0, cy: 0, sx: 1, sy: 1 };
      if (mdoc && mdoc.getElementsByTagName('p:spTree')[0]) await walkTree(mdoc.getElementsByTagName('p:spTree')[0], ident, { rels: mrels }, { skipPh: true });
      if (ldoc && ldoc.getElementsByTagName('p:spTree')[0] && (!sdoc.documentElement.getAttribute('showMasterSp') || true)) await walkTree(ldoc.getElementsByTagName('p:spTree')[0], ident, { rels: lrels }, { skipPh: true });
      await walkTree(sdoc.getElementsByTagName('p:spTree')[0], ident, { rels: srels });
      // background image fill
      slides.push(`<div class="slide" style="position:relative;width:${pw}px;height:${ph}px;overflow:hidden;background:${bg};">${out.join('')}</div>`);
    }
    return { slides, w: pw, h: ph, title: (await P2.parse('docProps/core.xml')) && ((await P2.parse('docProps/core.xml')).getElementsByTagName('dc:title')[0] || {}).textContent };
  };

  W.simpleTool({
    id: 'pptx-to-pdf', cat: 'create', name: 'PowerPoint to PDF', icon: 'presentation', action: 'Convert to PDF', actionIcon: 'presentation',
    desc: 'Turn slides into a document ready to share.', keys: 'pptx ppt slides deck powerpoint presentation convert keynote',
    badges: ['.pptx'],
    files: { multi: true, min: 1, accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'pptx', title: 'Drop PowerPoint files (.pptx)', dzIcon: 'presentation' },
    opts: [{ id: 'note', type: 'info', html: 'Slide text, pictures, tables, shapes and backgrounds are reproduced. Animations, charts, SmartArt, videos and embedded fonts aren’t supported.' }],
    async run(items, o, ctx) {
      const outs = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i]; const { slides, w, h: hh, title } = await W.pptxToHtml(it.file, { onProgress: (f, l) => ctx.progress((i + f * 0.5) / items.length, `${it.name}: ${l}`) });
        if (!slides.length) throw new Error('No slides found in ' + it.name);
        const bytes = await W.htmlToPdf({ html: `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}.slide{display:block;margin:0 0 4px 0;font-family:Arial,sans-serif}.pp{white-space:normal}</style></head><body>${slides.join('')}</body></html>`, pageSel: '.slide', frameW: Math.ceil(w) + 20, title: title || U.base(it.name), onProgress: (f, l) => ctx.progress((i + 0.5 + f * 0.5) / items.length, `${it.name}: ${l}`) });
        outs.push(P.outPdf(bytes, U.safeName(U.base(it.name)) + '.pdf'));
      }
      return outs;
    },
  });
}
