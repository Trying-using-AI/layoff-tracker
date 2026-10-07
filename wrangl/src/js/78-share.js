// ===== Share & collaborate: serverless WebRTC peer link, file transfer, shared whiteboard =====
{
  const esc = U.esc;
  const b64u = (u8) => U.b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = (s) => U.fromB64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  async function pack(obj) { const raw = new TextEncoder().encode(JSON.stringify(obj)); const cs = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw')); return 'W1.' + b64u(new Uint8Array(await new Response(cs).arrayBuffer())); }
  async function unpack(code) { code = String(code || '').replace(/\s+/g, ''); if (!code.startsWith('W1.')) throw new Error('That doesn’t look like a Wrangl connection code.'); const ds = new Blob([unb64u(code.slice(3))]).stream().pipeThrough(new DecompressionStream('deflate-raw')); return JSON.parse(await new Response(ds).text()); }

  class Peer {
    constructor({ stun = true } = {}) {
      this.pc = new RTCPeerConnection({ iceServers: stun ? [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] : [] });
      this.state = 'new'; this.listeners = []; this.stateCbs = []; this.queue = [];
      this.pc.onconnectionstatechange = () => { this.state = this.pc.connectionState; this.stateCbs.forEach((f) => f(this.state)); };
    }
    onstate(f) { this.stateCbs.push(f); } onmsg(f) { this.listeners.push(f); }
    bind(dc) { this.dc = dc; dc.binaryType = 'arraybuffer'; dc.bufferedAmountLowThreshold = 1 << 20; dc.onmessage = (e) => this.listeners.forEach((f) => f(e.data)); dc.onopen = () => { this.open = true; this.stateCbs.forEach((f) => f('open')); }; dc.onclose = () => { this.open = false; this.stateCbs.forEach((f) => f('closed')); }; }
    async ice() { if (this.pc.iceGatheringState === 'complete') return; await new Promise((res) => { const done = () => { if (this.pc.iceGatheringState === 'complete') { this.pc.removeEventListener('icegatheringstatechange', done); res(); } }; this.pc.addEventListener('icegatheringstatechange', done); setTimeout(res, 6000); }); }
    async host() { this.bind(this.pc.createDataChannel('wrangl', { ordered: true })); await this.pc.setLocalDescription(await this.pc.createOffer()); await this.ice(); this.role = 'host'; return pack({ t: 'offer', sdp: this.pc.localDescription.sdp }); }
    async join(code) { const o = await unpack(code); if (o.t !== 'offer') throw new Error('That is a reply code. Paste the code your friend generated first.'); this.pc.ondatachannel = (e) => this.bind(e.channel); await this.pc.setRemoteDescription({ type: 'offer', sdp: o.sdp }); await this.pc.setLocalDescription(await this.pc.createAnswer()); await this.ice(); this.role = 'guest'; return pack({ t: 'answer', sdp: this.pc.localDescription.sdp }); }
    async accept(code) { const o = await unpack(code); if (o.t !== 'answer') throw new Error('That is not a reply code.'); await this.pc.setRemoteDescription({ type: 'answer', sdp: o.sdp }); }
    send(x) { if (!this.dc || this.dc.readyState !== 'open') return false; this.dc.send(typeof x === 'string' || x instanceof ArrayBuffer ? x : JSON.stringify(x)); return true; }
    async sendBuf(buf) { const dc = this.dc; if (dc.bufferedAmount > 4 << 20) await new Promise((r) => { dc.onbufferedamountlow = () => { dc.onbufferedamountlow = null; r(); }; }); dc.send(buf); }
    async securityCode() { const fp = (s) => ((/a=fingerprint:\S+ ([0-9A-F:]+)/i.exec(s || '') || [])[1] || ''); const l = fp(this.pc.localDescription && this.pc.localDescription.sdp), r = fp(this.pc.remoteDescription && this.pc.remoteDescription.sdp); if (!l || !r) return ''; const h2 = await U.sha('SHA-256', new TextEncoder().encode([l, r].sort().join('|'))); return h2.slice(0, 8).toUpperCase().replace(/(.{4})/, '$1-'); }
    close() { try { this.pc.close(); } catch { } }
  }
  W.Peer = Peer;

  /** Pairing UI: resolves the transport when connected. onReady(peer) */
  function connectPanel(onReady, { intro = '' } = {}) {
    const box = h('div.cp'); let peer = null;
    const copy = (ta) => h('button.btn.sm', { html: ic('copy', 14) + '<span>Copy</span>', onclick: async (e) => { if (await U.copy(ta.value)) { const s = e.currentTarget.querySelector('span'); s.textContent = 'Copied'; setTimeout(() => (s.textContent = 'Copy'), 1400); } } });
    const stunChk = h('input', { type: 'checkbox', checked: true });
    const start = h('div.cp-start', intro && h('p.muted', intro), h('div.row.gap.wrap', h('button.btn.primary.lg', { html: ic('radio', 18) + '<span>Start a connection</span>', onclick: doHost }), h('button.btn.lg', { html: ic('log-in', 18) + '<span>Join with a code</span>', onclick: doJoin })), h('label.chk', { style: 'margin-top:12px' }, stunChk, h('span.chk-box'), h('span.small', 'Use a public STUN server to connect across networks (only reveals your IP address to it). Untick to connect on the same Wi-Fi only.')));
    box.appendChild(start);
    function show(...kids) { box.innerHTML = ''; box.append(...kids); }
    function wire(p) { p.onstate(async (s) => { if (s === 'open') { const code = await p.securityCode(); onReady(p, code); } else if (s === 'failed') W.toast('The connection failed. Make sure both sides pasted the right codes (and try again).', 'err', 6000); }); }
    async function doHost() {
      peer = new Peer({ stun: stunChk.checked }); wire(peer); show(h('p', h('b', 'Step 1 · '), 'Creating your code…'));
      try { const code = await peer.host(); const ta = h('textarea.in.cp-code', { readonly: true, rows: 4, value: code, onclick: (e) => e.target.select() }); const reply = h('textarea.in.cp-code', { rows: 4, placeholder: 'Paste your friend’s reply code here' });
        show(h('div.cp-step', h('b', 'Step 1 · Send this code to your friend'), h('span.muted.small', 'Any chat app works. The code contains no files — only how to reach your browser.'), ta, h('div.row.gap', copy(ta), h('button.btn.sm', { onclick: () => showQr(code) }, 'Show as QR'))), h('div.cp-step', h('b', 'Step 2 · Paste their reply code'), reply, h('button.btn.primary', { onclick: async (e) => { const b = e.currentTarget; try { b.disabled = true; await peer.accept(reply.value); b.textContent = 'Connecting…'; } catch (er) { b.disabled = false; W.toast(er.message, 'err'); } } }, 'Connect')), h('button.btn.ghost.sm', { onclick: reset }, 'Cancel'));
      } catch (e) { W.toast('Could not create a connection: ' + e.message, 'err'); reset(); }
    }
    function doJoin() {
      const inp = h('textarea.in.cp-code', { rows: 4, placeholder: 'Paste the code your friend sent you' });
      show(h('div.cp-step', h('b', 'Paste the code from your friend'), inp, h('button.btn.primary', { onclick: async (e) => { const b = e.currentTarget; b.disabled = true; try { peer = new Peer({ stun: stunChk.checked }); wire(peer); const code = await peer.join(inp.value); const ta = h('textarea.in.cp-code', { readonly: true, rows: 4, value: code, onclick: (ev) => ev.target.select() }); show(h('div.cp-step', h('b', 'Now send this reply code back to your friend'), h('span.muted.small', 'As soon as they paste it and press Connect, you’ll be linked.'), ta, h('div.row.gap', copy(ta), h('button.btn.sm', { onclick: () => showQr(code) }, 'Show as QR')), h('p.muted.small', 'Waiting for your friend…')), h('button.btn.ghost.sm', { onclick: reset }, 'Cancel')); } catch (er) { b.disabled = false; peer = null; W.toast(er.message, 'err', 6000); } } }, 'Create reply code')), h('button.btn.ghost.sm', { onclick: reset }, 'Back'));
    }
    async function showQr(code) { const qr = await W.lib('qr'); const q = qr(0, 'L'); q.addData(code); q.make(); W.modal({ title: 'Scan with the other device', body: h('div', { style: 'text-align:center' }, h('img', { src: q.createDataURL(3, 4), style: 'width:100%;max-width:420px;image-rendering:pixelated', alt: 'QR code' }), h('p.muted.small', 'Point the other device’s camera at this, copy the text it shows, and paste it into Wrangl there.')), actions: [{ label: 'Close', primary: true }] }); }
    function reset() { if (peer) peer.close(); peer = null; show(start); }
    box.reset = reset; return box;
  }
  W.connectPanel = connectPanel;

  // ================= SEND FILES DIRECTLY =================
  W.tool({
    id: 'p2p-share', cat: 'share', name: 'Send files directly', icon: 'send-horizontal', desc: 'Share encrypted files with another browser.',
    keys: 'p2p webrtc transfer airdrop send share file peer to peer direct large no upload encrypted chat',
    net: 'direct browser-to-browser link',
    async render(root) {
      let peer = null; const CH = 16 * 1024; const inbox = []; let cur = null; const queue = [];
      const status = h('div.p2p-status'); const sentList = h('div.p2p-list'); const recvList = h('div.p2p-list'); const chat = h('div.p2p-chat'); const msgIn = h('input.in', { placeholder: 'Type a message…', onkeydown: (e) => { if (e.key === 'Enter') sendMsg(); } });
      const live = h('div.p2p-live', { hidden: true }, h('section.card.pad', h('h3.card-h', 'Send files'), W.dropzone({ accept: '', multiple: true, title: 'Drop files to send', hint: 'any type, any size your browser can hold', icon: 'send', onFiles: (fs) => fs.forEach((f) => enqueue(f)) }), sentList), h('section.card.pad', h('h3.card-h', 'Received'), recvList, h('p.muted.small', 'Received files stay in this tab’s memory — download what you need before closing it.')), h('section.card.pad', h('h3.card-h', 'Messages'), chat, h('div.row.gap', msgIn, h('button.btn.primary', { onclick: sendMsg }, 'Send'))));
      const panel = connectPanel((p, code) => { peer = p; panel.hidden = true; live.hidden = false; status.innerHTML = ''; status.append(h('span.chip.ok', { html: ic('lock', 13) + '<span>Connected · end-to-end encrypted</span>' }), code ? h('span.chip', { title: 'Ask your friend to read you their code — it should match' }, 'Security code ' + code) : null, h('button.btn.sm.ghost', { onclick: () => { p.close(); location.reload(); } }, 'Disconnect')); p.onmsg(onData); p.onstate((s) => { if (s === 'closed' || s === 'disconnected' || s === 'failed') status.append(h('span.chip', 'Disconnected')); }); }, { intro: 'Pair two browsers once, then send as many files as you like — straight between the devices, with no server in the middle and no size limit besides memory.' });
      root.append(h('section.card.pad', status, panel), live);
      const carried = W.takeCarry('p2p-share');
      const addLine = (who, text) => { chat.appendChild(h('div.msgl.' + who, text)); chat.scrollTop = chat.scrollHeight; };
      function sendMsg() { const t = msgIn.value.trim(); if (!t || !peer) return; peer.send({ t: 'msg', text: t }); addLine('me', t); msgIn.value = ''; }
      function enqueue(file) { const row = h('div.p2p-row', h('span.fl-name', file.name), h('span.muted.small', U.fmtBytes(file.size)), h('div.ptrack', h('div.pbar'))); sentList.appendChild(row); queue.push({ file, row }); pump(); }
      let busy = false; async function pump() { if (busy) return; busy = true; while (queue.length) { const { file, row } = queue.shift(); const id = U.uid(); const bar = $('.pbar', row); peer.send({ t: 'file', id, name: file.name, size: file.size, type: file.type }); let off = 0; try { while (off < file.size) { const buf = await file.slice(off, off + CH).arrayBuffer(); await peer.sendBuf(buf); off += buf.byteLength; bar.style.width = (off / file.size * 100) + '%'; if (off % (CH * 64) === 0) await U.tick(); } peer.send({ t: 'end', id }); row.append(h('span.chip.ok', 'Sent')); } catch (e) { row.append(h('span.chip', 'Failed')); } } busy = false; }
      function onData(d) {
        if (typeof d === 'string') { const m = JSON.parse(d);
          if (m.t === 'msg') addLine('them', m.text);
          else if (m.t === 'file') { const row = h('div.p2p-row', h('span.fl-name', m.name), h('span.muted.small', U.fmtBytes(m.size)), h('div.ptrack', h('div.pbar'))); recvList.appendChild(row); cur = { m, parts: [], got: 0, row, bar: $('.pbar', row) }; }
          else if (m.t === 'end' && cur) { const c = cur; cur = null; const blob = new Blob(c.parts, { type: c.m.type || 'application/octet-stream' }); c.row.append(h('button.btn.sm.primary', { onclick: () => U.download(blob, c.m.name) }, 'Download')); W.toast(`Received ${c.m.name}`, 'ok'); }
        } else if (cur) { cur.parts.push(d); cur.got += d.byteLength; cur.bar.style.width = (cur.got / cur.m.size * 100) + '%'; }
      }
      if (carried.length) { /* files carried in will be sent once connected */ W.toast('Connect first, then drop your files.', 'info'); }
    },
  });

  // ================= WHITEBOARD =================
  const PALETTE = ['#111111', '#E8472B', '#F59E0B', '#16A34A', '#0EA5E9', '#4F46E5', '#C026D3', '#FFFFFF'];
  W.tool({
    id: 'whiteboard', cat: 'share', name: 'Shared whiteboard', icon: 'presentation', desc: 'Draw and work together in an instant shared room.',
    keys: 'draw sketch collaborate canvas diagram brainstorm board paint annotate live room team whiteboard',
    net: 'optional direct link',
    async render(root) {
      root.classList.add('wide'); const ME = U.uid(); const strokes = []; let redo = []; let net = null; let bc = null; let tool = 'pen', color = '#111111', width = 4, bg = 'white'; let cur = null; const remote = new Map();
      const WW = 1600, HH = 1000; const ink = W.canvas(WW, HH); const view = h('canvas.wb-cv', { width: WW, height: HH }); const cursors = h('div.wb-cursors');
      const status = h('span.chip', 'Solo — only you');
      const draw = (g, s) => { if (!s.pts.length) return; g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.globalAlpha = s.a == null ? 1 : s.a; g.strokeStyle = s.color; g.fillStyle = s.color; g.lineWidth = s.w; g.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over'; const p = s.pts;
        if (s.tool === 'pen' || s.tool === 'marker' || s.tool === 'eraser') { if (p.length === 1) { g.beginPath(); g.arc(p[0][0], p[0][1], s.w / 2, 0, 7); g.fill(); } else { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length - 1; i++) g.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2); g.lineTo(p[p.length - 1][0], p[p.length - 1][1]); g.stroke(); } }
        else if (s.tool === 'line' || s.tool === 'arrow') { const [a, b] = [p[0], p[p.length - 1]]; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); if (s.tool === 'arrow') { const an = Math.atan2(b[1] - a[1], b[0] - a[0]), L = Math.max(14, s.w * 4); g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(b[0] - L * Math.cos(an - 0.4), b[1] - L * Math.sin(an - 0.4)); g.lineTo(b[0] - L * Math.cos(an + 0.4), b[1] - L * Math.sin(an + 0.4)); g.closePath(); g.fill(); } }
        else if (s.tool === 'rect' || s.tool === 'ellipse') { const [a, b] = [p[0], p[p.length - 1]]; if (s.tool === 'rect') g.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); else { g.beginPath(); g.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, 7); g.stroke(); } }
        else if (s.tool === 'text') { g.font = `${Math.max(16, s.w * 5)}px Instrument Sans, Arial, sans-serif`; g.textBaseline = 'top'; (s.text || '').split('\n').forEach((l, i) => g.fillText(l, p[0][0], p[0][1] + i * Math.max(16, s.w * 5) * 1.25)); }
        g.restore(); };
      const paint = () => { const g = view.getContext('2d'); g.fillStyle = bg === 'dark' ? '#17191f' : '#ffffff'; g.fillRect(0, 0, WW, HH); if (bg === 'grid' || bg === 'dots') { g.strokeStyle = '#d7dbe6'; g.fillStyle = '#c4c9d8'; g.lineWidth = 1; for (let x = 0; x < WW; x += 40) for (let y = 0; y < HH; y += 40) { if (bg === 'dots') g.fillRect(x - 1, y - 1, 2.5, 2.5); } if (bg === 'grid') { for (let x = 0; x < WW; x += 40) { g.beginPath(); g.moveTo(x + .5, 0); g.lineTo(x + .5, HH); g.stroke(); } for (let y = 0; y < HH; y += 40) { g.beginPath(); g.moveTo(0, y + .5); g.lineTo(WW, y + .5); g.stroke(); } } } g.drawImage(ink, 0, 0); if (cur) draw(g, cur); };
      const replay = () => { const g = ink.getContext('2d'); g.clearRect(0, 0, WW, HH); strokes.forEach((s) => draw(g, s)); paint(); };
      const emit = (m) => { const msg = Object.assign({ t: 'wb', from: ME }, m); if (bc) bc.postMessage(msg); if (net) net.send(msg); };
      const add = (s, local) => { if (strokes.some((x) => x.id === s.id)) return; strokes.push(s); draw(ink.getContext('2d'), s); paint(); if (local) emit({ op: 'add', s }); };
      const onNet = (m) => { if (!m || m.t !== 'wb' || m.from === ME) return; if (m.op === 'add') add(m.s, false); else if (m.op === 'del') { const i = strokes.findIndex((x) => x.id === m.id); if (i >= 0) { strokes.splice(i, 1); replay(); } } else if (m.op === 'clear') { strokes.length = 0; replay(); } else if (m.op === 'sync') { m.strokes.forEach((s) => { if (!strokes.some((x) => x.id === s.id)) strokes.push(s); }); replay(); } else if (m.op === 'hello') emit({ op: 'sync', strokes }); else if (m.op === 'cursor') { let c = remote.get(m.from); if (!c) { c = h('div.wb-cur', h('i'), h('span', 'Guest')); cursors.appendChild(c); remote.set(m.from, c); } c.style.left = m.x / WW * 100 + '%'; c.style.top = m.y / HH * 100 + '%'; c.style.setProperty('--c', m.c); clearTimeout(c._t); c._t = setTimeout(() => { c.remove(); remote.delete(m.from); }, 4000); } };
      const pos = (e) => { const r = view.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * WW, (e.clientY - r.top) / r.height * HH]; };
      let lastCur = 0;
      view.addEventListener('pointerdown', async (e) => { const p = pos(e); if (tool === 'text') { const t = await W.ask('Add text', 'What should it say?', { ok: 'Add' }); if (t) add({ id: U.uid(), owner: ME, tool: 'text', color, w: width, pts: [p], text: t, a: 1 }, true); return; } view.setPointerCapture(e.pointerId); cur = { id: U.uid(), owner: ME, tool, color, w: tool === 'marker' ? width * 3 : tool === 'eraser' ? width * 4 : width, a: tool === 'marker' ? 0.4 : 1, pts: [p] }; redo = []; paint(); });
      view.addEventListener('pointermove', (e) => { const p = pos(e); if (cur) { if (['pen', 'marker', 'eraser'].includes(cur.tool)) { const l = cur.pts[cur.pts.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 1.5) cur.pts.push(p); } else cur.pts = [cur.pts[0], p]; paint(); } if ((bc || net) && performance.now() - lastCur > 60) { lastCur = performance.now(); emit({ op: 'cursor', x: p[0], y: p[1], c: color === '#FFFFFF' ? '#888' : color }); } });
      const end = () => { if (!cur) return; const s = cur; cur = null; if (s.tool === 'eraser' || s.pts.length) { strokes.push(s); draw(ink.getContext('2d'), s); emit({ op: 'add', s }); } paint(); }; view.addEventListener('pointerup', end); view.addEventListener('pointercancel', end);
      const undo = () => { for (let i = strokes.length - 1; i >= 0; i--) if (strokes[i].owner === ME) { const [s] = strokes.splice(i, 1); redo.push(s); emit({ op: 'del', id: s.id }); replay(); return; } };
      const redoF = () => { const s = redo.pop(); if (s) add(s, true); };
      const tools = [['pen', 'pencil', 'Pen'], ['marker', 'highlighter', 'Marker'], ['eraser', 'eraser', 'Eraser'], ['line', 'minus', 'Line'], ['arrow', 'move-up-right', 'Arrow'], ['rect', 'square', 'Rectangle'], ['ellipse', 'circle', 'Ellipse'], ['text', 'type', 'Text']];
      const bar = h('div.ed-bar', ...tools.map(([id, icon, label]) => h('button.ed-tool' + (id === tool ? '.on' : ''), { dataset: { tool: id }, title: label, onclick: () => { tool = id; $$('.ed-tool', bar).forEach((b) => b.classList.toggle('on', b.dataset.tool === id)); } }, h('span', { html: ic(icon, 17) }), h('span', label))), h('span.og-sep'), h('div.wb-pal', PALETTE.map((c) => h('button.swatch' + (c === color ? '.on' : ''), { style: `background:${c}`, 'aria-label': 'Colour ' + c, onclick: (e) => { color = c; $$('.swatch', bar).forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); } })), h('input', { type: 'color', value: '#e8472b', title: 'Custom colour', oninput: (e) => { color = e.target.value; $$('.swatch', bar).forEach((b) => b.classList.remove('on')); } })), h('input', { type: 'range', min: 1, max: 24, value: width, title: 'Thickness', style: 'width:90px', oninput: (e) => (width = +e.target.value) }), h('span.og-sep'), h('button.icon-btn', { title: 'Undo', 'aria-label': 'Undo', html: ic('undo-2', 17), onclick: undo }), h('button.icon-btn', { title: 'Redo', 'aria-label': 'Redo', html: ic('redo-2', 17), onclick: redoF }), h('button.icon-btn', { title: 'Clear board', 'aria-label': 'Clear board', html: ic('trash-2', 17), onclick: async () => { if (await W.confirm('Clear the board?', 'This removes everyone’s drawings.', 'Clear')) { strokes.length = 0; redo = []; replay(); emit({ op: 'clear' }); } } }), h('select.in.sm', { title: 'Background', onchange: (e) => { bg = e.target.value; paint(); } }, [['white', 'White'], ['grid', 'Grid'], ['dots', 'Dots'], ['dark', 'Dark']].map(([v, l]) => h('option', { value: v }, l))));
      // collaboration
      const room = h('input.in.sm', { placeholder: 'room name', style: 'width:140px' });
      const join = h('button.btn.sm', { onclick: () => { if (!room.value.trim()) return; if (bc) bc.close(); bc = new BroadcastChannel('wrangl-wb-' + room.value.trim().toLowerCase()); bc.onmessage = (e) => onNet(e.data); status.textContent = 'Room “' + room.value.trim() + '” — other tabs of this browser'; status.className = 'chip ok'; emit({ op: 'hello' }); } }, 'Join room on this device');
      const cp = connectPanel((p, code) => { net = p; p.onmsg((d) => { if (typeof d === 'string') { try { onNet(JSON.parse(d)); } catch { } } }); status.textContent = 'Connected to a friend' + (code ? ' · code ' + code : ''); status.className = 'chip ok'; cpWrap.hidden = true; emit({ op: 'hello' }); emit({ op: 'sync', strokes }); }, {});
      const cpWrap = h('details.rs-sec', { style: 'margin:0' }, h('summary', h('span', { html: ic('users', 16) }), 'Draw together'), h('div.rs-body', h('div.row.gap.wrap', h('b.small', 'Same computer:'), room, join), h('hr'), h('b.small', 'Across the internet (direct link, no server):'), cp));
      const dl = h('div.row.gap.wrap', h('button.btn', { html: ic('image-down', 16) + '<span>Save PNG</span>', onclick: async () => { paint(); U.download(await U.canvasBlob(view, 'image/png'), 'whiteboard-' + U.stamp() + '.png'); } }), h('button.btn', { html: ic('file-down', 16) + '<span>Save as PDF</span>', onclick: async () => { const doc = await P.create(); const im = await doc.embedPng(await W.canvasBytes(view)); const page = doc.addPage([842, 842 * HH / WW]); page.drawImage(im, { x: 0, y: 0, width: 842, height: 842 * HH / WW }); U.download(new Blob([await P.save(doc)], { type: 'application/pdf' }), 'whiteboard-' + U.stamp() + '.pdf'); } }), status);
      root.append(bar, h('div.wb-stage', view, cursors), dl, cpWrap); paint();
      return () => { if (bc) bc.close(); if (net) net.close(); };
    },
  });
}
