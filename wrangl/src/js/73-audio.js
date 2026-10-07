// ===== Audio ↔ PDF: transcripts (dictation or on-device Whisper) and read-aloud =====
{
  const esc = U.esc;
  const mmss = (s) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60), r = s % 60; return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`; };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const LANGS = [['en-US', 'English (US)'], ['en-IN', 'English (India)'], ['en-GB', 'English (UK)'], ['hi-IN', 'Hindi'], ['es-ES', 'Spanish'], ['fr-FR', 'French'], ['de-DE', 'German'], ['it-IT', 'Italian'], ['pt-BR', 'Portuguese (Brazil)'], ['ja-JP', 'Japanese'], ['ko-KR', 'Korean'], ['zh-CN', 'Chinese (Mandarin)'], ['ar-SA', 'Arabic'], ['ru-RU', 'Russian'], ['ta-IN', 'Tamil'], ['bn-IN', 'Bengali']];
  const MODELS = [['Xenova/whisper-tiny.en', 'Tiny · English only (~40 MB, fastest)'], ['Xenova/whisper-base.en', 'Base · English only (~75 MB, more accurate)'], ['Xenova/whisper-tiny', 'Tiny · 99 languages (~40 MB)'], ['Xenova/whisper-base', 'Base · 99 languages (~75 MB)']];
  W.WHISPER_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2';

  async function decodeAudio(file, rate = 16000) {
    const buf = await file.arrayBuffer(); const AC = window.AudioContext || window.webkitAudioContext; const ctx = new AC();
    const audio = await ctx.decodeAudioData(buf.slice(0)); ctx.close && ctx.close();
    // mono + resample to `rate`
    const len = Math.ceil(audio.duration * rate); const off = new OfflineAudioContext(1, len, rate); const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start(); const out = await off.startRendering();
    return { data: out.getChannelData(0), duration: audio.duration, raw: audio };
  }
  function waveCanvas(audio, w = 900, hh = 120, color = '#E8472B') {
    const c = W.canvas(w, hh); const g = c.getContext('2d'); const d = audio.getChannelData(0); const step = Math.max(1, Math.floor(d.length / w)); g.fillStyle = color;
    for (let x = 0; x < w; x++) { let mn = 1, mx = -1; for (let j = 0; j < step; j++) { const v = d[x * step + j] || 0; if (v < mn) mn = v; if (v > mx) mx = v; } const y1 = (1 - mx) * hh / 2, y2 = (1 - mn) * hh / 2; g.fillRect(x, y1, 1, Math.max(1, y2 - y1)); }
    return c;
  }

  W.tool({
    id: 'audio-to-pdf', cat: 'create', name: 'Audio to PDF', icon: 'audio-lines', desc: 'Make an editable, timestamped transcript from audio.',
    keys: 'transcribe speech to text dictate voice record meeting lecture whisper subtitles mp3 wav', net: 'dictation may use your browser’s speech service',
    async render(root) {
      let segs = []; let mode = 'file'; let duration = 0; let source = ''; let waveUrl = null; let rec = null, t0 = 0;
      const results = h('div.results'); const prog = W.progress();
      const list = h('div.seg-list'); const empty = h('p.muted.small', 'No transcript yet.');
      const renderSegs = () => {
        const box = h('div.tr-rows');
        segs.forEach((s, i) => box.appendChild(h('div.tr-row',
          h('input.in.sm.tr-t', { value: mmss(s.t), 'aria-label': 'Time', oninput: (e) => { const m = /^(\d+):(\d{2})$/.exec(e.target.value); if (m) s.t = +m[1] * 60 + +m[2]; } }),
          h('textarea.in.tr-x', { value: s.text, rows: 1, 'aria-label': 'Text', oninput: (e) => { s.text = e.target.value; e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; } }),
          h('button.icon-btn', { title: 'Remove line', 'aria-label': 'Remove line', html: ic('x', 14), onclick: () => { segs.splice(i, 1); renderSegs(); } }))));
        list.innerHTML = ''; list.appendChild(segs.length ? box : empty);
        setTimeout(() => $$('.tr-x', list).forEach((t) => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }), 0);
      };
      // ---- source tabs
      const tabs = h('div.seg', ['file', 'dictate'].map((m) => h('button.seg-b' + (m === mode ? '.on' : ''), { dataset: { m }, onclick: () => { mode = m; $$('.seg-b', tabs).forEach((b) => b.classList.toggle('on', b.dataset.m === m)); fileBox.hidden = m !== 'file'; dictBox.hidden = m !== 'dictate'; } }, m === 'file' ? 'Audio file' : 'Dictate with microphone')));
      // file mode
      const model = h('select.in', MODELS.map(([v, l]) => h('option', { value: v }, l))); const lang = h('select.in', { hidden: true }, [['', 'Detect automatically'], ...LANGS.map(([v, l]) => [v.split('-')[0], l])].filter((x, i, a) => a.findIndex((y) => y[0] === x[0]) === i).map(([v, l]) => h('option', { value: v }, l)));
      model.onchange = () => (lang.hidden = /\.en$/.test(model.value));
      const player = h('audio', { controls: true, hidden: true, style: 'width:100%' }); const waveHost = h('div.wave'); let cur = null;
      const dzAudio = W.dropzone({ accept: 'audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac,.webm,.opus', multiple: false, title: 'Drop an audio file', hint: 'MP3, WAV, M4A, OGG, FLAC…', icon: 'audio-lines', onFiles: async (fs) => { cur = fs[0]; source = cur.name; player.src = URL.createObjectURL(cur); player.hidden = false; try { const a = await decodeAudio(cur); duration = a.duration; waveHost.innerHTML = ''; const wc = waveCanvas(a.raw); wc.className = 'wave-cv'; waveHost.appendChild(wc); waveUrl = wc; info.textContent = `${mmss(duration)} · ${U.fmtBytes(cur.size)}`; btnT.disabled = false; } catch (e) { W.toast('That audio file can’t be decoded by this browser.', 'err'); } } });
      const info = h('span.muted.small'); const btnT = h('button.btn.primary', { disabled: true, html: ic('wand-sparkles', 16) + '<span>Transcribe on this device</span>', onclick: transcribe });
      const fileBox = h('div.stack', dzAudio, player, waveHost, h('div.frow', h('div', h('label.lbl', 'Model'), model), h('div', h('label.lbl', 'Language'), lang)), h('div.row.gap.wrap', btnT, info),
        h('p.muted.small', 'Uses an open-source Whisper model that runs in your browser. The model (~40–75 MB) is downloaded once from a public CDN the first time you use this, then cached — your audio itself never leaves your device.'));
      // dictation mode
      const dlang = h('select.in', LANGS.map(([v, l]) => h('option', { value: v }, l))); const live = h('div.live', ''); const micBtn = h('button.btn.primary', { html: ic('mic', 16) + '<span>Start dictating</span>', onclick: toggleMic });
      const dictBox = h('div.stack', { hidden: true }, SR ? h('div.frow', h('div', h('label.lbl', 'Spoken language'), dlang), h('div', { style: 'align-self:end' }, micBtn)) : h('div.finfo', 'Your browser has no built-in dictation. Use Chrome, Edge or Safari, or transcribe an audio file instead.'), live, h('p.muted.small', 'Dictation uses your browser’s speech service (in Chrome and Edge this sends the audio to the browser vendor). For fully private transcription use an audio file with the on-device model.'));
      function toggleMic() {
        if (rec) { rec.stop(); return; }
        rec = new SR(); rec.lang = dlang.value; rec.continuous = true; rec.interimResults = true; t0 = performance.now(); source = 'Dictation'; if (!segs.length) renderSegs();
        rec.onresult = (e) => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) { segs.push({ t: (performance.now() - t0) / 1000, text: r[0].transcript.trim() }); renderSegs(); } else interim += r[0].transcript; } live.textContent = interim; };
        rec.onerror = (e) => { W.toast('Dictation error: ' + e.error, 'err'); }; rec.onend = () => { duration = (performance.now() - t0) / 1000; rec = null; micBtn.querySelector('span').textContent = 'Start dictating'; micBtn.classList.add('primary'); live.textContent = ''; };
        rec.start(); micBtn.querySelector('span').textContent = 'Stop'; micBtn.classList.remove('primary');
      }
      async function transcribe() {
        if (!cur) return; btnT.disabled = true; prog.set(0, 'Preparing audio'); results.innerHTML = '';
        try {
          const { data } = await decodeAudio(cur); prog.set(0.02, 'Loading speech engine');
          const tf = await import(/* @vite-ignore */ W.WHISPER_CDN); const { pipeline, env } = tf; env.allowLocalModels = false;
          const asr = await pipeline('automatic-speech-recognition', model.value, { dtype: 'q8', progress_callback: (p) => { if (p.status === 'progress') prog.set(0.05 + 0.5 * (p.progress || 0) / 100, `Downloading model · ${p.file ? p.file.split('/').pop() : ''}`); } });
          prog.set(0.6, 'Transcribing…'); const opts = { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true }; if (!/\.en$/.test(model.value)) { opts.task = 'transcribe'; if (lang.value) opts.language = lang.value; }
          const out = await asr(data, opts); prog.hide();
          segs = (out.chunks && out.chunks.length ? out.chunks.map((c) => ({ t: (c.timestamp && c.timestamp[0]) || 0, text: c.text.trim() })) : [{ t: 0, text: (out.text || '').trim() }]).filter((s) => s.text); renderSegs();
          if (!segs.length) W.toast('No speech was recognised in this file.', 'info', 5000);
        } catch (e) { prog.hide(); console.error(e); results.appendChild(h('div.errbox', h('b', 'Transcription failed'), h('p', /fetch|network|Failed to load/i.test(String(e.message)) ? 'The speech model could not be downloaded — check your internet connection (needed only the first time). ' + e.message : e.message))); }
        finally { btnT.disabled = false; }
      }
      // ---- output
      const opts = W.fields([{ id: 'title', type: 'text', label: 'Title', value: 'Transcript' }, { id: 'times', type: 'check', label: 'Show timestamps', value: true }, { id: 'wave', type: 'check', label: 'Include a waveform picture (audio files)', value: true }, ...W.pageFields({ margin: 20 })]);
      const go = h('button.btn.primary.lg', { html: ic('file-down', 18) + '<span>Create transcript PDF</span>', onclick: async () => {
        const clean = segs.filter((s) => s.text.trim()); if (!clean.length) { W.toast('Add or record some text first.', 'info'); return; } go.disabled = true; results.innerHTML = '';
        try { const o = opts.vals; const meta = [new Date().toLocaleString(), source, duration ? `Duration ${mmss(duration)}` : ''].filter(Boolean).map(esc).join(' · ');
          const html = W.wrapDoc(`<h1>${esc(o.title)}</h1><p style="color:#666;font-size:9.5pt">${meta}</p>${o.wave && waveUrl && mode === 'file' ? `<p><img src="${waveUrl.toDataURL()}" style="width:100%;height:60px"></p>` : ''}${clean.map((s) => `<p>${o.times ? `<b style="font-family:Courier New,monospace;color:#c0392b;font-size:9.5pt">[${mmss(s.t)}]</b> ` : ''}${esc(s.text)}</p>`).join('')}`);
          prog.set(0.1, 'Laying out'); const bytes = await W.htmlToPdf(Object.assign({ html, title: o.title, onProgress: (f, l) => prog.set(f, l) }, W.pageSetup(o))); prog.hide();
          await W.showResults(results, [P.outPdf(bytes, U.safeName(o.title) + '.pdf')], { tool: W.byId['audio-to-pdf'], note: `${U.plural(clean.length, 'segment')}` }); }
        catch (e) { prog.hide(); results.appendChild(h('div.errbox', h('b', 'Could not create the PDF'), h('p', W.friendlyError(e)))); } finally { go.disabled = false; } } });
      root.append(h('section.card.pad', h('h3.card-h', h('span.step', '1'), 'Audio source'), tabs, h('div', { style: 'margin-top:14px' }, fileBox, dictBox)),
        h('section.card.pad', h('h3.card-h', h('span.step', '2'), 'Transcript (editable)'), list, h('div.row.gap', h('button.btn.sm', { onclick: () => { segs.push({ t: segs.length ? segs[segs.length - 1].t + 5 : 0, text: '' }); renderSegs(); } }, '+ Add line'))),
        h('section.card.pad', h('h3.card-h', h('span.step', '3'), 'PDF'), opts.el), h('div.action-wrap', h('div.actions', go)), prog.el, results);
      renderSegs();
      const carried = W.takeCarry('audio-to-pdf'); if (carried.length) dzAudio.handle(carried);
    },
  });

  // ================= PDF TO AUDIO =================
  W.tool({
    id: 'pdf-to-audio', cat: 'convert', name: 'PDF to audio', icon: 'volume-2', desc: 'Listen with natural voices and save the audio.',
    keys: 'read aloud text to speech tts listen narrate voice audiobook speak', net: 'uses your browser’s built-in voices',
    async render(root) {
      const synth = window.speechSynthesis; let sents = [], idx = 0, playing = false, paused = false, token = 0; let item = null;
      const results = h('div.results'); const prog = W.progress();
      const fl = W.fileList({ multi: false, accept: '.pdf,application/pdf', kind: 'pdf', title: 'Drop a PDF to listen to', onChange: load });
      const voiceSel = h('select.in'); const rate = h('input', { type: 'range', min: 0.5, max: 2, step: 0.05, value: 1 }); const pitch = h('input', { type: 'range', min: 0.5, max: 1.5, step: 0.05, value: 1 }); const pages = h('input.in', { placeholder: 'All pages — or 1-5' });
      const view = h('div.tts-view', { tabindex: '0' }); const status = h('span.muted.small', '');
      const mkV = () => { const vs = (synth ? synth.getVoices() : []).slice().sort((a, b) => (b.localService - a.localService) || a.name.localeCompare(b.name)); voiceSel.innerHTML = ''; if (!vs.length) voiceSel.appendChild(h('option', { value: '' }, 'No voices available in this browser')); vs.forEach((v) => voiceSel.appendChild(h('option', { value: v.voiceURI }, `${v.name} — ${v.lang}${v.localService ? '' : ' (online)'}`))); const en = vs.find((v) => /^en(-|_)/i.test(v.lang) && v.localService) || vs[0]; if (en) voiceSel.value = en.voiceURI; };
      if (synth) { mkV(); synth.onvoiceschanged = mkV; }
      const play = h('button.btn.primary', { html: ic('play', 16) + '<span>Play</span>', onclick: toggle }); const stop = h('button.btn', { html: ic('square', 14) + '<span>Stop</span>', onclick: () => halt() }); const prev = h('button.icon-btn', { title: 'Previous sentence', 'aria-label': 'Previous sentence', html: ic('skip-back', 16), onclick: () => jump(-1) }); const next = h('button.icon-btn', { title: 'Next sentence', 'aria-label': 'Next sentence', html: ic('skip-forward', 16), onclick: () => jump(1) });
      const recBtn = h('button.btn', { html: ic('circle-dot', 15) + '<span>Record to a file (experimental)</span>', onclick: recordFile });
      const ctrl = h('section.card.pad', { hidden: true }, h('h3.card-h', h('span.step', '2'), 'Listen'),
        synth ? h('div', h('div.frow', h('div', h('label.lbl', 'Voice'), voiceSel), h('div', h('label.lbl', 'Pages'), pages)), h('div.frow', h('div', h('label.lbl', 'Speed'), rate), h('div', h('label.lbl', 'Pitch'), pitch))) : h('div.finfo', 'This browser has no speech synthesis.'),
        h('div.row.gap.wrap', { style: 'margin:12px 0' }, prev, play, next, stop, status), view, h('div.row.gap.wrap', { style: 'margin-top:12px' }, recBtn, h('button.btn', { html: ic('download', 15) + '<span>Download the text</span>', onclick: () => item && U.download(new Blob([sents.join(' ')], { type: 'text/plain' }), U.safeName(U.base(item.name)) + '.txt') })),
        h('p.muted.small', 'Browsers can’t save their built-in voices directly. “Record” captures this tab’s audio while it reads (Chrome/Edge: choose “This tab” and tick “Share tab audio”). Everything is processed on your device.'));
      root.append(h('section.card.pad', h('h3.card-h', h('span.step', '1'), 'Choose a PDF'), fl.el), ctrl, prog.el, results);
      const carried = W.takeCarry('pdf-to-audio'); if (carried.length) await fl.add(carried);
      async function load(items) {
        halt(); ctrl.hidden = !items.length; if (!items.length) return; item = items[0]; view.textContent = 'Reading the document…'; sents = [];
        try { const n = await P.pageCount(item); const sel = W.parseRanges(pages.value, n); const all = await P.plainText(item, { pages: sel }); let text = all.join('\n\n'); if (text.replace(/\s/g, '').length < 20) { view.textContent = 'No text layer found — running OCR…'; const parts = []; for (const i of sel.slice(0, 15)) { const c = await P.renderPage(item, i, { scale: 2.2 }); parts.push((await W.ocr.recognize(c, {})).text); } text = parts.join('\n\n'); }
          sents = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || []; sents = sents.map((s) => s.trim()).filter(Boolean).flatMap((s) => (s.length > 230 ? s.match(/.{1,220}(\s|$)/g).map((x) => x.trim()) : [s]));
          view.innerHTML = ''; sents.forEach((s, i) => view.appendChild(h('span.snt', { dataset: { i }, onclick: () => { jumpTo(i); } }, s + ' '))); status.textContent = `${sents.length} sentences · ~${Math.max(1, Math.round(sents.join(' ').split(/\s+/).length / 160))} min`; if (!sents.length) view.textContent = 'No text found.'; } catch (e) { view.textContent = 'Could not read this PDF: ' + e.message; }
      }
      pages.addEventListener('change', () => item && load([item]));
      function mark() { $$('.snt', view).forEach((s) => s.classList.toggle('on', +s.dataset.i === idx)); const cur = $(`.snt[data-i="${idx}"]`, view); cur && cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      function speakCur(my) {
        if (my !== token) return; if (idx >= sents.length) { halt(true); return; } mark();
        const u = new SpeechSynthesisUtterance(sents[idx]); const v = synth.getVoices().find((x) => x.voiceURI === voiceSel.value); if (v) { u.voice = v; u.lang = v.lang; } u.rate = +rate.value; u.pitch = +pitch.value;
        u.onend = () => { if (my === token && playing) { idx++; speakCur(my); } }; u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') { W.toast('Speech error: ' + e.error, 'err'); halt(); } };
        synth.speak(u);
      }
      function toggle() {
        if (!synth || !sents.length) return;
        if (playing && !paused) { synth.pause(); paused = true; play.querySelector('span').textContent = 'Resume'; return; }
        if (paused) { synth.resume(); paused = false; play.querySelector('span').textContent = 'Pause'; return; }
        playing = true; paused = false; const my = ++token; synth.cancel(); play.querySelector('span').textContent = 'Pause'; speakCur(my);
      }
      function halt(done) { token++; playing = false; paused = false; if (synth) synth.cancel(); play.querySelector('span').textContent = 'Play'; if (done) idx = 0; $$('.snt.on', view).forEach((s) => s.classList.remove('on')); }
      function jumpTo(i) { idx = U.clamp(i, 0, sents.length - 1); if (playing) { const my = ++token; synth.cancel(); paused = false; play.querySelector('span').textContent = 'Pause'; speakCur(my); } else mark(); }
      function jump(d) { jumpTo(idx + d); }
      async function recordFile() {
        if (!sents.length) return; if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) { W.toast('This browser can’t record tab audio.', 'err'); return; }
        let stream; try { stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, preferCurrentTab: true }); } catch { W.toast('Recording was cancelled.', 'info'); return; }
        if (!stream.getAudioTracks().length) { stream.getTracks().forEach((t) => t.stop()); W.toast('No audio was shared. Choose “This tab” and tick “Share tab audio”.', 'err', 6000); return; }
        const audio = new MediaStream(stream.getAudioTracks()); const chunks = []; const mr = new MediaRecorder(audio); mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        mr.onstop = async () => { stream.getTracks().forEach((t) => t.stop()); const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' }); results.innerHTML = ''; await W.showResults(results, [W.out(U.safeName(U.base(item.name)) + '-audio.webm', blob, 'audio/webm')], { tool: W.byId['pdf-to-audio'], note: 'Recorded while reading aloud' }); };
        mr.start(); idx = 0; playing = false; toggle(); const iv = setInterval(() => { if (!playing) { clearInterval(iv); if (mr.state !== 'inactive') mr.stop(); } }, 500);
      }
      return () => halt();
    },
  });
}
