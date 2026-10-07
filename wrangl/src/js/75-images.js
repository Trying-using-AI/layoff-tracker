// ===== Image tools: remove background, remove image watermark, thumbmark cut-out =====
{
  const IMG_ACCEPT = 'image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif';
  // ---------- helpers ----------
  function boxBlur(src, w, h, r) { // separable moving average on a Float32Array
    if (r < 1) return src; const tmp = new Float32Array(src.length), out = new Float32Array(src.length); const k = 2 * r + 1;
    for (let y = 0; y < h; y++) { let s = 0; const o = y * w; for (let x = -r; x <= r; x++) s += src[o + U.clamp(x, 0, w - 1)]; for (let x = 0; x < w; x++) { tmp[o + x] = s / k; s += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[U.clamp(y, 0, h - 1) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = s / k; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
    return out;
  }
  W.boxBlur = boxBlur;
  const checker = (c, size = 12) => { const g = c.getContext('2d'); g.save(); g.globalCompositeOperation = 'destination-over'; for (let y = 0; y < c.height; y += size) for (let x = 0; x < c.width; x += size) { g.fillStyle = ((x / size + y / size) & 1) ? '#d9d9d9' : '#f4f4f4'; g.fillRect(x, y, size, size); } g.restore(); };
  async function loadWork(file, max = 1600) {
    const im = await U.fileImage(file); const sc = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)); const c = W.canvas(im.naturalWidth * sc, im.naturalHeight * sc); const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, c.width, c.height);
    return { im, work: c, scale: sc, w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height) };
  }
  function trimAlpha(c, pad = 2) { const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } if (x1 < 0) return c; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(c.width - 1, x1 + pad); y1 = Math.min(c.height - 1, y1 + pad); const o = W.canvas(x1 - x0 + 1, y1 - y0 + 1); o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height); return o; }
  W.trimAlpha = trimAlpha;

  // ================= REMOVE BACKGROUND =================
  function kmeansBorder(img) {
    const { data, width: w, height: h } = img; const pts = []; const ring = Math.max(2, Math.round(Math.min(w, h) * 0.012));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (x < ring || y < ring || x >= w - ring || y >= h - ring) { if ((x + y) % 3) continue; const o = (y * w + x) * 4; pts.push([data[o], data[o + 1], data[o + 2]]); } }
    let cs = [pts[0], pts[(pts.length / 3) | 0], pts[(pts.length * 2 / 3) | 0]]; for (let it = 0; it < 8; it++) { const sum = cs.map(() => [0, 0, 0, 0]); pts.forEach((p) => { let b = 0, bd = 1e9; cs.forEach((c, i) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; b = i; } }); sum[b][0] += p[0]; sum[b][1] += p[1]; sum[b][2] += p[2]; sum[b][3]++; }); cs = sum.map((s, i) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : cs[i])); }
    // keep clusters that cover >8% of the border
    const cnt = cs.map(() => 0); pts.forEach((p) => { let b = 0, bd = 1e9; cs.forEach((c, i) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; b = i; } }); cnt[b]++; });
    const keep = cs.filter((c, i) => cnt[i] > pts.length * 0.08); return keep.length ? keep : [cs[0]];
  }
  W.removeBgAlpha = function (img, { centers, tol = 40, soft = 1.5, global = false }) {
    const { data, width: w, height: h } = img; const N = w * h; const dist = new Float32Array(N);
    for (let i = 0; i < N; i++) { const o = i * 4; let m = 1e9; for (const c of centers) { const d = Math.hypot(data[o] - c[0], data[o + 1] - c[1], data[o + 2] - c[2]); if (d < m) m = d; } dist[i] = m; }
    const T = tol * 1.7 + 6; const bg = new Uint8Array(N);
    if (global) { for (let i = 0; i < N; i++) if (dist[i] < T) bg[i] = 1; }
    else { const q = new Int32Array(N); let qs = 0, qe = 0; const push = (i) => { if (!bg[i] && dist[i] < T) { bg[i] = 1; q[qe++] = i; } }; for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); } for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); } while (qs < qe) { const i = q[qs++]; const x = i % w, y = (i / w) | 0; if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w); } }
    let a = new Float32Array(N); for (let i = 0; i < N; i++) a[i] = bg[i] ? 0 : 1;
    // soft edge: blur the binary mask, then pull the ramp towards colour distance so thin similar-coloured fringes drop out
    const r = Math.round(soft); if (r >= 1) { a = boxBlur(boxBlur(a, w, h, r), w, h, Math.max(1, r >> 1)); }
    const out = new Uint8ClampedArray(N); const c0 = centers[0];
    for (let i = 0; i < N; i++) { let v = a[i]; if (v > 0 && v < 1) { const ramp = U.clamp((dist[i] - T * 0.35) / (T * 0.9), 0, 1); v = Math.min(v, Math.max(ramp, v * 0.35)); v = v * v * (3 - 2 * v); } out[i] = Math.round(v * 255); }
    return { alpha: out, dist, bg };
  };
  W.tool({
    id: 'remove-bg', cat: 'images', name: 'Remove background', icon: 'eraser', desc: 'Make a clean cutout, refine its edges, and export PNG.',
    keys: 'cutout transparent png background remove erase isolate product photo sticker backdrop', badges: ['Best on plain backgrounds'],
    async render(root) {
      root.classList.add('wide');
      let S = null; const params = { tol: 35, soft: 2, global: false, tool: 'erase', brush: 28, bgMode: 'transparent', bgColor: '#ffffff', trim: true };
      const results = h('div.results'); const prog = W.progress();
      const dz = W.dropzone({ accept: IMG_ACCEPT, multiple: false, title: 'Drop a picture', hint: 'Product photos, portraits on plain backgrounds, logos…', icon: 'image-plus', onFiles: (f) => open(f[0]) });
      const disp = h('canvas.rb-cv'); const cursor = h('div.rb-cursor'); const stage = h('div.rb-stage', disp, cursor);
      const fields = W.fields([
        { id: 'tol', type: 'range', label: 'Tolerance (how different from the background counts as subject)', min: 5, max: 100, value: params.tol },
        { id: 'soft', type: 'range', label: 'Edge softness', min: 0, max: 10, value: params.soft, unit: ' px' },
        { id: 'global', type: 'check', label: 'Also remove matching colours inside the subject (holes, between arms…)', value: false },
        { id: 'tool', type: 'seg', label: 'Touch-up brush', options: [['erase', 'Erase more'], ['keep', 'Bring back'], ['pick', 'Pick background colour']], value: 'erase' },
        { id: 'brush', type: 'range', label: 'Brush size', min: 4, max: 120, value: params.brush, unit: ' px', show: (v) => v.tool !== 'pick' },
        { id: 'bgMode', type: 'seg', label: 'Output background', options: [['transparent', 'Transparent'], ['color', 'Solid colour']], value: 'transparent' },
        { id: 'bgColor', type: 'color', label: 'Colour', value: '#ffffff', show: (v) => v.bgMode === 'color' },
        { id: 'trim', type: 'check', label: 'Crop to the subject', value: true },
      ], { onChange: (v, id) => { Object.assign(params, v); if (['tol', 'soft', 'global'].includes(id)) recompute(); else render(); } });
      const side = h('div.rb-side', h('section.card.pad', h('h3.card-h', 'Adjust'), fields.el, h('div.row.gap.wrap', { style: 'margin-top:12px' }, h('button.btn.sm', { onclick: autoBg }, 'Re-detect background'), h('button.btn.sm', { onclick: () => { S.edits.fill(0); render(); } }, 'Reset brush strokes'))), h('div.actions', h('button.btn.primary.lg', { html: ic('download', 18) + '<span>Save PNG</span>', onclick: save }), h('button.btn.ghost', { onclick: () => { S = null; main.hidden = true; dz.hidden = false; results.innerHTML = ''; } }, 'New picture')), prog.el);
      const main = h('div.rb-main', { hidden: true }, h('div.rb-view', stage, h('p.muted.small', 'Tip: paint over leftover bits with “Erase more”, or paint missing parts back with “Bring back”.')), side);
      root.append(dz, main, results);
      async function open(file) {
        const w = await loadWork(file); S = Object.assign(w, { edits: new Uint8Array(w.w * w.h), name: file.name, centers: null, auto: null });
        dz.hidden = true; main.hidden = false; disp.width = w.w; disp.height = w.h; autoBg();
      }
      function autoBg() { S.centers = kmeansBorder(S.data); recompute(); }
      function recompute() { S.auto = W.removeBgAlpha(S.data, { centers: S.centers, tol: params.tol, soft: params.soft, global: params.global }); render(); }
      function finalAlpha() { const a = S.auto.alpha, e = S.edits, out = new Uint8ClampedArray(a.length); for (let i = 0; i < a.length; i++) out[i] = e[i] === 1 ? 0 : e[i] === 2 ? 255 : a[i]; return out; }
      function compose(w, h2, data, alpha, centers, bgMode, bgColor) {
        const out = new ImageData(w, h2); const o = out.data; const c0 = centers[0]; const bgc = P.hexToRgb01(bgColor).map((x) => x * 255);
        for (let i = 0; i < w * h2; i++) { const a = alpha[i] / 255; let r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; if (a > 0 && a < 1) { r = U.clamp((r - (1 - a) * c0[0]) / a, 0, 255); g = U.clamp((g - (1 - a) * c0[1]) / a, 0, 255); b = U.clamp((b - (1 - a) * c0[2]) / a, 0, 255); } if (bgMode === 'color') { o[i * 4] = r * a + bgc[0] * (1 - a); o[i * 4 + 1] = g * a + bgc[1] * (1 - a); o[i * 4 + 2] = b * a + bgc[2] * (1 - a); o[i * 4 + 3] = 255; } else { o[i * 4] = r; o[i * 4 + 1] = g; o[i * 4 + 2] = b; o[i * 4 + 3] = alpha[i]; } }
        return out;
      }
      let raf = 0;
      function render() { if (!S) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const id = compose(S.w, S.h, S.data.data, finalAlpha(), S.centers, 'transparent', '#fff'); const g = disp.getContext('2d'); g.clearRect(0, 0, S.w, S.h); g.putImageData(id, 0, 0); if (params.bgMode === 'color') { g.save(); g.globalCompositeOperation = 'destination-over'; g.fillStyle = params.bgColor; g.fillRect(0, 0, S.w, S.h); g.restore(); } else checker(disp, 16); }); }
      // brush interaction
      let painting = false;
      const pos = (e) => { const r = disp.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * S.w, (e.clientY - r.top) / r.height * S.h]; };
      const paint = (x, y) => { const rad = params.brush / 2 * (S.w / disp.getBoundingClientRect().width); const v = params.tool === 'erase' ? 1 : 2; const x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(S.w - 1, Math.ceil(x + rad)), y0 = Math.max(0, Math.floor(y - rad)), y1 = Math.min(S.h - 1, Math.ceil(y + rad)); for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if ((xx - x) ** 2 + (yy - y) ** 2 <= rad * rad) S.edits[yy * S.w + xx] = v; };
      disp.addEventListener('pointerdown', (e) => { if (!S) return; const [x, y] = pos(e); if (params.tool === 'pick') { let r = 0, g = 0, b = 0, n = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const px = U.clamp(Math.round(x) + dx, 0, S.w - 1), py = U.clamp(Math.round(y) + dy, 0, S.h - 1), o = (py * S.w + px) * 4; r += S.data.data[o]; g += S.data.data[o + 1]; b += S.data.data[o + 2]; n++; } S.centers = [[r / n, g / n, b / n]]; recompute(); return; } painting = true; disp.setPointerCapture(e.pointerId); paint(x, y); render(); });
      disp.addEventListener('pointermove', (e) => { if (!S) return; const r = disp.getBoundingClientRect(); cursor.style.cssText = `display:${params.tool === 'pick' ? 'none' : 'block'};left:${e.clientX - r.left}px;top:${e.clientY - r.top}px;width:${params.brush * (r.width / S.w) * (S.w / r.width)}px;height:${params.brush}px`; if (painting) { const [x, y] = pos(e); paint(x, y); render(); } });
      disp.addEventListener('pointerup', () => (painting = false)); disp.addEventListener('pointerleave', () => { painting = false; cursor.style.display = 'none'; });
      async function save() {
        prog.set(null, 'Rendering at full size…'); await U.tick();
        try {
          const aSmall = finalAlpha(); const full = W.canvas(S.im.naturalWidth, S.im.naturalHeight); const g = full.getContext('2d', { willReadFrequently: true }); g.drawImage(S.im, 0, 0);
          let out;
          if (S.scale < 1) { // upscale the mask smoothly, then apply to the full-res image
            const mc = W.canvas(S.w, S.h); const mg = mc.getContext('2d'); const mi = mg.createImageData(S.w, S.h); for (let i = 0; i < aSmall.length; i++) { mi.data[i * 4 + 3] = aSmall[i]; mi.data[i * 4] = mi.data[i * 4 + 1] = mi.data[i * 4 + 2] = 255; } mg.putImageData(mi, 0, 0);
            const big = W.canvas(full.width, full.height); const bg = big.getContext('2d'); bg.imageSmoothingQuality = 'high'; bg.drawImage(mc, 0, 0, big.width, big.height); const ba = bg.getImageData(0, 0, big.width, big.height).data; const fi = g.getImageData(0, 0, full.width, full.height); const al = new Uint8ClampedArray(full.width * full.height); for (let i = 0; i < al.length; i++) al[i] = ba[i * 4 + 3];
            g.putImageData(compose(full.width, full.height, fi.data, al, S.centers, params.bgMode, params.bgColor), 0, 0); out = full;
          } else { const fi = g.getImageData(0, 0, full.width, full.height); g.putImageData(compose(full.width, full.height, fi.data, aSmall, S.centers, params.bgMode, params.bgColor), 0, 0); out = full; }
          if (params.trim && params.bgMode === 'transparent') out = trimAlpha(out);
          const blob = await U.canvasBlob(out, 'image/png'); prog.hide(); results.innerHTML = ''; await W.showResults(results, [Object.assign(W.out(U.safeName(U.base(S.name)) + '-cutout.png', blob), { meta: `${out.width}×${out.height}px` })], { tool: W.byId['remove-bg'], note: 'Transparent PNG' });
        } catch (e) { prog.hide(); console.error(e); results.appendChild(h('div.errbox', h('b', 'Could not save'), h('p', e.message))); }
      }
      const carried = W.takeCarry('remove-bg'); if (carried.length) await open(carried[0]);
    },
  });

  // ================= REMOVE IMAGE WATERMARK =================
  function inpaint(img, mask, w, h) { // push-pull diffusion fill. mask: Uint8 (1 = fill)
    const levels = []; let cur = { w, h, r: new Float32Array(w * h), g: new Float32Array(w * h), b: new Float32Array(w * h), k: new Float32Array(w * h) };
    for (let i = 0; i < w * h; i++) if (!mask[i]) { cur.r[i] = img.data[i * 4]; cur.g[i] = img.data[i * 4 + 1]; cur.b[i] = img.data[i * 4 + 2]; cur.k[i] = 1; }
    levels.push(cur);
    while (cur.w > 2 && cur.h > 2) { const nw = (cur.w + 1) >> 1, nh = (cur.h + 1) >> 1; const nx = { w: nw, h: nh, r: new Float32Array(nw * nh), g: new Float32Array(nw * nh), b: new Float32Array(nw * nh), k: new Float32Array(nw * nh) }; for (let y = 0; y < cur.h; y++) for (let x = 0; x < cur.w; x++) { const i = y * cur.w + x, j = (y >> 1) * nw + (x >> 1), k = cur.k[i]; if (k > 0) { nx.r[j] += cur.r[i] * k; nx.g[j] += cur.g[i] * k; nx.b[j] += cur.b[i] * k; nx.k[j] += k; } } for (let j = 0; j < nw * nh; j++) if (nx.k[j] > 0) { nx.r[j] /= nx.k[j]; nx.g[j] /= nx.k[j]; nx.b[j] /= nx.k[j]; nx.k[j] = Math.min(1, nx.k[j] / 2); } levels.push(nx); cur = nx; }
    for (let l = levels.length - 2; l >= 0; l--) { const lo = levels[l + 1], hi = levels[l]; for (let y = 0; y < hi.h; y++) for (let x = 0; x < hi.w; x++) { const i = y * hi.w + x; if (hi.k[i] >= 1) continue; const j = (y >> 1) * lo.w + (x >> 1); const a = hi.k[i], bk = 1 - a; hi.r[i] = hi.r[i] * a + lo.r[j] * bk; hi.g[i] = hi.g[i] * a + lo.g[j] * bk; hi.b[i] = hi.b[i] * a + lo.b[j] * bk; } }
    const o = levels[0]; return o;
  }
  W.tool({
    id: 'remove-image-watermark', cat: 'images', name: 'Remove image watermark', icon: 'wand', desc: 'Select a mark and rebuild its background or copy a clean nearby area.',
    keys: 'logo text stamp object eraser retouch heal inpaint clone remove people date stamp', badges: ['Works best on simple backgrounds'],
    async render(root) {
      root.classList.add('wide'); let S = null; const rects = []; const params = { method: 'smart', detect: true, sens: 28, grow: 3, grain: true, source: 'above' };
      const results = h('div.results'); const prog = W.progress();
      const dz = W.dropzone({ accept: IMG_ACCEPT, multiple: false, title: 'Drop a picture with a mark to remove', icon: 'image-plus', onFiles: (f) => open(f[0]) });
      const disp = h('canvas.rb-cv'); const box = h('div.rw-sel', { hidden: true }); const stage = h('div.rb-stage', disp, box);
      const fields = W.fields([
        { id: 'method', type: 'seg', label: 'Method', options: [['smart', 'Smart fill'], ['clone', 'Copy nearby area']], value: 'smart' },
        { id: 'detect', type: 'check', label: 'Find the mark inside my selection (keeps the texture around it)', value: true, show: (v) => v.method === 'smart' },
        { id: 'sens', type: 'range', label: 'Detection strength', min: 6, max: 90, value: 28, show: (v) => v.method === 'smart' && v.detect },
        { id: 'grow', type: 'range', label: 'Grow the mark by', min: 0, max: 12, value: 3, unit: ' px', show: (v) => v.method === 'smart' && v.detect },
        { id: 'grain', type: 'check', label: 'Add matching grain', value: true, show: (v) => v.method === 'smart' },
        { id: 'source', type: 'seg', label: 'Copy from', options: [['above', 'Above'], ['below', 'Below'], ['left', 'Left'], ['right', 'Right']], value: 'above', show: (v) => v.method === 'clone' },
      ], { onChange: (v) => Object.assign(params, v) });
      const count = h('span.muted.small', 'Drag on the picture to select the area with the mark.');
      const side = h('div.rb-side', h('section.card.pad', h('h3.card-h', 'Remove'), count, fields.el, h('div.row.gap.wrap', { style: 'margin-top:12px' }, h('button.btn.primary', { html: ic('wand-sparkles', 16) + '<span>Remove selected areas</span>', onclick: apply }), h('button.btn', { onclick: undo }, 'Undo'), h('button.btn.ghost', { onclick: () => { rects.length = 0; draw(); } }, 'Clear selection'))), h('div.actions', h('button.btn.primary.lg', { html: ic('download', 18) + '<span>Save picture</span>', onclick: save }), h('button.btn.ghost', { onclick: () => { S = null; main.hidden = true; dz.hidden = false; results.innerHTML = ''; } }, 'New picture')), prog.el);
      const main = h('div.rb-main', { hidden: true }, h('div.rb-view', stage), side); root.append(dz, main, results); const hist = [];
      async function open(file) { const im = await U.fileImage(file); S = { im, name: file.name, w: im.naturalWidth, h: im.naturalHeight, type: /png/i.test(file.type) ? 'image/png' : 'image/jpeg' }; S.cv = W.canvas(S.w, S.h); S.cv.getContext('2d', { willReadFrequently: true }).drawImage(im, 0, 0); dz.hidden = true; main.hidden = false; hist.length = 0; rects.length = 0; draw(); }
      function draw() { disp.width = S.w; disp.height = S.h; const g = disp.getContext('2d'); g.drawImage(S.cv, 0, 0); g.save(); g.lineWidth = Math.max(2, S.w / 400); g.strokeStyle = '#E8472B'; g.fillStyle = 'rgba(232,71,43,.2)'; rects.forEach((r) => { g.fillRect(r.x, r.y, r.w, r.h); g.strokeRect(r.x, r.y, r.w, r.h); }); g.restore(); count.textContent = rects.length ? `${U.plural(rects.length, 'area')} selected` : 'Drag on the picture to select the area with the mark.'; }
      let drag = null; const pos = (e) => { const r = disp.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * S.w, (e.clientY - r.top) / r.height * S.h]; };
      disp.addEventListener('pointerdown', (e) => { if (!S) return; disp.setPointerCapture(e.pointerId); const [x, y] = pos(e); drag = { x, y, r: { x, y, w: 0, h: 0 } }; rects.push(drag.r); });
      disp.addEventListener('pointermove', (e) => { if (!drag) return; const [x, y] = pos(e); Object.assign(drag.r, { x: Math.min(drag.x, x), y: Math.min(drag.y, y), w: Math.abs(x - drag.x), h: Math.abs(y - drag.y) }); draw(); });
      disp.addEventListener('pointerup', () => { if (drag && (drag.r.w < 4 || drag.r.h < 4)) rects.splice(rects.indexOf(drag.r), 1); drag = null; draw(); });
      function undo() { const p = hist.pop(); if (p) { S.cv.getContext('2d').putImageData(p, 0, 0); draw(); } else W.toast('Nothing to undo.', 'info'); }
      async function apply() {
        if (!rects.length) { W.toast('Select an area first.', 'info'); return; } prog.set(null, 'Working…'); await U.tick();
        const g = S.cv.getContext('2d', { willReadFrequently: true }); hist.push(g.getImageData(0, 0, S.w, S.h));
        for (const r0 of rects) {
          const pad = Math.max(8, Math.round(Math.max(r0.w, r0.h) * 0.25)); const x0 = Math.max(0, Math.floor(r0.x - pad)), y0 = Math.max(0, Math.floor(r0.y - pad)), x1 = Math.min(S.w, Math.ceil(r0.x + r0.w + pad)), y1 = Math.min(S.h, Math.ceil(r0.y + r0.h + pad)); const w = x1 - x0, hh = y1 - y0;
          const img = g.getImageData(x0, y0, w, hh); const sx = Math.floor(r0.x - x0), sy = Math.floor(r0.y - y0), sw = Math.ceil(r0.w), sh = Math.ceil(r0.h);
          if (params.method === 'clone') { const dx = params.source === 'left' ? -sw : params.source === 'right' ? sw : 0, dy = params.source === 'above' ? -sh : params.source === 'below' ? sh : 0; const src = g.getImageData(Math.floor(U.clamp(r0.x + dx, 0, S.w - sw)), Math.floor(U.clamp(r0.y + dy, 0, S.h - sh)), sw, sh); const feather = Math.max(2, Math.round(Math.min(sw, sh) * 0.08)); const dst = g.getImageData(Math.floor(r0.x), Math.floor(r0.y), sw, sh); for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const e = Math.min(x, y, sw - 1 - x, sh - 1 - y); const a = Math.min(1, (e + 1) / feather); const o = (y * sw + x) * 4; for (let k = 0; k < 3; k++) dst.data[o + k] = src.data[o + k] * a + dst.data[o + k] * (1 - a); } g.putImageData(dst, Math.floor(r0.x), Math.floor(r0.y)); continue; }
          const mask = new Uint8Array(w * hh);
          if (params.detect) { // mark = pixels that differ from the local average background
            const L = new Float32Array(w * hh); for (let i = 0; i < w * hh; i++) L[i] = img.data[i * 4] * 0.3 + img.data[i * 4 + 1] * 0.59 + img.data[i * 4 + 2] * 0.11;
            const bgL = boxBlur(boxBlur(L, w, hh, Math.max(3, Math.round(Math.min(sw, sh) * 0.35))), w, hh, 3); const thr = params.sens * 0.8;
            for (let y = sy; y < sy + sh; y++) for (let x = sx; x < sx + sw; x++) { const i = y * w + x; if (Math.abs(L[i] - bgL[i]) > thr) mask[i] = 1; }
            if (params.grow > 0) { const m2 = new Float32Array(mask); const bl = boxBlur(m2, w, hh, params.grow); for (let i = 0; i < mask.length; i++) mask[i] = bl[i] > 0.04 ? 1 : 0; for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (x < sx || y < sy || x >= sx + sw || y >= sy + sh) mask[y * w + x] = 0; }
          } else for (let y = sy; y < sy + sh; y++) for (let x = sx; x < sx + sw; x++) mask[y * w + x] = 1;
          const filled = inpaint(img, mask, w, hh);
          // grain: noise with the std-dev of the unmasked surroundings
          let sd = 0, n = 0, mean = 0; if (params.grain) { const L2 = []; for (let i = 0; i < w * hh; i += 3) if (!mask[i]) L2.push(img.data[i * 4 + 1]); mean = L2.reduce((a, b) => a + b, 0) / (L2.length || 1); sd = Math.sqrt(L2.reduce((a, b) => a + (b - mean) ** 2, 0) / (L2.length || 1)); sd = Math.min(sd * 0.12, 6); }
          for (let i = 0; i < w * hh; i++) if (mask[i]) { const nz = params.grain ? (Math.random() - 0.5) * 2 * sd : 0; img.data[i * 4] = U.clamp(filled.r[i] + nz, 0, 255); img.data[i * 4 + 1] = U.clamp(filled.g[i] + nz, 0, 255); img.data[i * 4 + 2] = U.clamp(filled.b[i] + nz, 0, 255); }
          g.putImageData(img, x0, y0);
        }
        rects.length = 0; draw(); prog.hide();
      }
      async function save() { const isPng = S.type === 'image/png'; const blob = await U.canvasBlob(S.cv, isPng ? 'image/png' : 'image/jpeg', 0.95); results.innerHTML = ''; await W.showResults(results, [W.out(U.safeName(U.base(S.name)) + '-clean.' + (isPng ? 'png' : 'jpg'), blob)], { tool: W.byId['remove-image-watermark'] }); }
      const carried = W.takeCarry('remove-image-watermark'); if (carried.length) await open(carried[0]);
    },
  });

  // ================= THUMBMARK =================
  W.thumbCutout = function (img, { thr = 55, contrast = 1.4, smooth = 1, ink = '#1a2a6c', width = 600 }) {
    const w = img.width, hh = img.height; const gray = new Float32Array(w * hh); for (let i = 0; i < w * hh; i++) gray[i] = img.data[i * 4] * 0.3 + img.data[i * 4 + 1] * 0.59 + img.data[i * 4 + 2] * 0.11;
    const bg = boxBlur(boxBlur(gray, w, hh, Math.max(8, Math.round(Math.min(w, hh) / 14))), w, hh, 6); const a = new Float32Array(w * hh); const sc = 255 / Math.max(20, 100 - thr * 0.6);
    for (let i = 0; i < w * hh; i++) { const d = (bg[i] - gray[i]) * sc * contrast - thr * 1.1; a[i] = U.clamp(d / 140, 0, 1); }
    const sm = smooth >= 1 ? boxBlur(a, w, hh, Math.round(smooth)) : a; const [r, g, b] = P.hexToRgb01(ink).map((x) => Math.round(x * 255)); const c = W.canvas(w, hh); const g2 = c.getContext('2d'); const id = g2.createImageData(w, hh);
    for (let i = 0; i < w * hh; i++) { const v = U.clamp((sm[i] - 0.18) / 0.55, 0, 1); id.data[i * 4] = r; id.data[i * 4 + 1] = g; id.data[i * 4 + 2] = b; id.data[i * 4 + 3] = Math.round(v * v * (3 - 2 * v) * 255); }
    g2.putImageData(id, 0, 0); let out = trimAlpha(c, 6); if (out.width > width) { const s = width / out.width; const o2 = W.canvas(width, out.height * s); o2.getContext('2d').drawImage(out, 0, 0, o2.width, o2.height); out = o2; } return out;
  };
  W.tool({
    id: 'thumbmark', cat: 'edit', name: 'Thumbmark maker', icon: 'fingerprint', desc: 'Clean a photo of your own ink thumbmark into a cutout.',
    keys: 'thumb print fingerprint ink stamp signature seal impression photo cutout transparent',
    async render(root) {
      let S = null; const p = { thr: 55, contrast: 1.4, smooth: 1, ink: '#1a2a6c', width: 600 };
      const results = h('div.results'); const dz = W.dropzone({ accept: IMG_ACCEPT, multiple: false, title: 'Drop a photo of your inked thumb', hint: 'A phone photo of a thumbprint on white paper works best', icon: 'fingerprint', onFiles: (f) => open(f[0]) });
      const inCv = h('canvas.tm-cv'), outCv = h('canvas.tm-cv.tm-out'); const outWrap = h('div.tm-out-wrap', outCv);
      const fields = W.fields([{ id: 'thr', type: 'range', label: 'Ink threshold', min: 5, max: 120, value: p.thr }, { id: 'contrast', type: 'range', label: 'Contrast', min: 0.6, max: 3, step: 0.1, value: p.contrast }, { id: 'smooth', type: 'range', label: 'Smoothing', min: 0, max: 5, value: p.smooth }, { id: 'ink', type: 'color', label: 'Ink colour', value: p.ink }, { id: 'width', type: 'select', label: 'Output width', options: [[300, '300 px'], [600, '600 px'], [1000, '1000 px']], value: 600 }], { onChange: (v) => { Object.assign(p, v); draw(); } });
      const main = h('div.tm-main', { hidden: true }, h('div.tm-pair', h('figure', inCv, h('figcaption', 'Your photo')), h('figure', outWrap, h('figcaption', 'Cutout'))), h('section.card.pad', fields.el, h('div.row.gap.wrap', { style: 'margin-top:14px' }, h('button.btn.primary', { html: ic('download', 16) + '<span>Save PNG</span>', onclick: save }), h('button.btn', { html: ic('signature', 16) + '<span>Save to my signatures</span>', onclick: toSig }), h('button.btn.ghost', { onclick: () => { main.hidden = true; dz.hidden = false; } }, 'Another photo'))));
      root.append(dz, main, results); let last = null;
      async function open(file) { const im = await U.fileImage(file); const sc = Math.min(1, 1100 / Math.max(im.naturalWidth, im.naturalHeight)); const c = W.canvas(im.naturalWidth * sc, im.naturalHeight * sc); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); S = { c, name: file.name, data: c.getContext('2d').getImageData(0, 0, c.width, c.height) }; inCv.width = c.width; inCv.height = c.height; inCv.getContext('2d').drawImage(c, 0, 0); dz.hidden = true; main.hidden = false; draw(); }
      const draw = U.debounce(() => { if (!S) return; last = W.thumbCutout(S.data, p); outCv.width = last.width; outCv.height = last.height; const g = outCv.getContext('2d'); g.clearRect(0, 0, last.width, last.height); g.drawImage(last, 0, 0); }, 60);
      async function save() { if (!last) return; results.innerHTML = ''; await W.showResults(results, [Object.assign(W.out('thumbmark.png', await U.canvasBlob(last, 'image/png')), { meta: `${last.width}×${last.height}px` })], { tool: W.byId.thumbmark, note: 'Transparent PNG — place it with Sign PDF or Edit PDF' }); }
      function toSig() { if (!last) return; const s = W.store.get('sigs', []); s.unshift({ id: U.uid(), url: last.toDataURL('image/png'), w: last.width, h: last.height }); W.store.set('sigs', s.slice(0, 8)); W.toast('Saved — find it under “Saved on this device” in Sign PDF.', 'ok', 4500); }
      const carried = W.takeCarry('thumbmark'); if (carried.length) await open(carried[0]);
    },
  });
}
