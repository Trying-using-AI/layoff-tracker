// ===== Workflow builder: chain tools once, run the whole sequence =====
{
  const esc = U.esc;
  const FLOW = ['merge', 'alternate-mix', 'split', 'rotate', 'flip', 'nup', 'crop-resize', 'compress', 'watermark', 'page-numbers', 'bates', 'headers-footers', 'flatten', 'change-colors', 'metadata', 'remove-watermark', 'encrypt', 'remove-password', 'unlock', 'ocr', 'repair', 'pdf-to-handwriting',
    'pdf-to-images', 'extract-text', 'extract-images', 'pdf-to-html', 'pdf-to-word', 'pdf-to-excel', 'pdf-to-pptx', 'pdf-to-ebook', 'pdf-to-zip', 'summarize'];
  const FINAL_ONLY = new Set(['pdf-to-images', 'extract-text', 'extract-images', 'pdf-to-html', 'pdf-to-word', 'pdf-to-excel', 'pdf-to-pptx', 'pdf-to-ebook', 'pdf-to-zip', 'summarize']);
  const PRESETS = [
    { name: 'Number & compress', steps: [{ tool: 'page-numbers', vals: {} }, { tool: 'compress', vals: { level: 'balanced' } }] },
    { name: 'Confidential copy', steps: [{ tool: 'watermark', vals: { text: 'CONFIDENTIAL', opacity: 22 } }, { tool: 'page-numbers', vals: { fmt: '{n} / {N}' } }, { tool: 'metadata', vals: { wipe: true } }] },
    { name: 'Searchable & small', steps: [{ tool: 'ocr', vals: {} }, { tool: 'compress', vals: { level: 'balanced' } }] },
    { name: 'Tidy a scan', steps: [{ tool: 'change-colors', vals: { mode: 'gray', text: true } }, { tool: 'ocr', vals: { skip: false } }, { tool: 'compress', vals: { level: 'strong' } }] },
  ];
  const eligible = () => FLOW.map((id) => W.byId[id]).filter((t) => t && typeof t.run === 'function');

  W.tool({
    id: 'workflow', cat: 'scan', name: 'Build a workflow', icon: 'workflow', desc: 'Chain tools once. Run the whole sequence on your files.',
    keys: 'automate batch pipeline chain steps macro recipe repeat multiple tools sequence',
    async render(root) {
      const steps = []; let running = false; const results = h('div.results'); const prog = W.progress();
      const fl = W.fileList({ multi: true, accept: '.pdf,application/pdf', kind: 'pdf', title: 'Drop the PDFs to process', hint: 'The same steps run on all of them (or merge them in step 1)' });
      const list = h('div.wf-steps'); const run = h('button.btn.primary.lg', { html: ic('play', 18) + '<span>Run workflow</span>', onclick: runAll });
      const addSel = h('select.in', { 'aria-label': 'Add a step' }, h('option', { value: '' }, '＋ Add a step…'), ...W.cats.map((c) => { const ts = eligible().filter((t) => t.cat === c.id); return ts.length ? h('optgroup', { label: c.name }, ts.map((t) => h('option', { value: t.id }, t.name + (FINAL_ONLY.has(t.id) ? ' (final step)' : '')))) : null; }));
      addSel.addEventListener('change', () => { if (addSel.value) { addStep(addSel.value); addSel.value = ''; } });
      const pre = h('select.in', { 'aria-label': 'Start from a preset' }, h('option', { value: '' }, 'Start from a preset…'), PRESETS.map((p, i) => h('option', { value: i }, p.name)), h('optgroup', { label: 'My workflows', id: 'wf-saved' }));
      pre.addEventListener('change', () => { const v = pre.value; if (v === '') return; const saved = W.store.get('workflows', []); const def = /^s:/.test(v) ? saved.find((s) => s.name === v.slice(2)) : PRESETS[+v]; if (def) { steps.length = 0; def.steps.forEach((s) => addStep(s.tool, s.vals, true)); redraw(); } pre.value = ''; });
      const refreshSaved = () => { const g = $('#wf-saved', pre); g.innerHTML = ''; W.store.get('workflows', []).forEach((s) => g.appendChild(h('option', { value: 's:' + s.name }, s.name))); }; refreshSaved();
      root.append(h('section.card.pad', h('h3.card-h', h('span.step', '1'), 'Files'), fl.el),
        h('section.card.pad', h('h3.card-h', h('span.step', '2'), 'Steps'), h('div.row.gap.wrap', { style: 'margin-bottom:12px' }, pre, addSel, h('button.btn.sm', { onclick: save }, 'Save this workflow…'), h('button.btn.sm.ghost', { onclick: delSaved }, 'Delete a saved one…')), list, h('p.muted.small', 'Each step receives the previous step’s files. Steps that create non-PDF files (images, Word, text…) must come last.')),
        h('div.action-wrap', h('div.actions', run)), prog.el, results);
      function addStep(id, vals = {}, silent) {
        const t = W.byId[id]; if (!t) return; let spec = []; try { spec = typeof t.opts === 'function' ? t.opts(fl.items, {}, {}) : (t.opts || []); } catch { spec = []; }
        spec = spec.filter((f) => f.type !== 'info').map((f) => (vals[f.id] !== undefined ? Object.assign({}, f, { value: vals[f.id] }) : f));
        const fields = W.fields(spec); steps.push({ id, t, fields, open: false }); if (!silent) redraw();
      }
      function redraw() {
        list.innerHTML = ''; if (!steps.length) list.appendChild(h('div.empty', h('span', { html: ic('workflow', 26) }), h('p', 'No steps yet — add one above or start from a preset.')));
        steps.forEach((s, i) => { const c = W.catById[s.t.cat]; const final = FINAL_ONLY.has(s.id); const last = i === steps.length - 1;
          const st = h('div.wf-state', { dataset: { i } });
          list.appendChild(h('div.wf-step' + (final && !last ? '.bad' : ''), { style: `--h:${c.hue}` }, h('div.wf-head', h('span.step', String(i + 1)), h('span.tile.sm', { html: ic(s.t.icon, 16) }), h('b', s.t.name), final && !last ? h('span.chip', 'must be last') : null, st, h('div.row', { style: 'margin-left:auto' }, h('button.icon-btn', { title: 'Options', 'aria-label': 'Options', html: ic('sliders-horizontal', 16), onclick: () => { s.open = !s.open; redraw(); } }), h('button.icon-btn', { title: 'Move up', 'aria-label': 'Move up', disabled: !i, html: ic('arrow-up', 16), onclick: () => { [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; redraw(); } }), h('button.icon-btn', { title: 'Move down', 'aria-label': 'Move down', disabled: last, html: ic('arrow-down', 16), onclick: () => { [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; redraw(); } }), h('button.icon-btn', { title: 'Remove', 'aria-label': 'Remove step', html: ic('x', 16), onclick: () => { steps.splice(i, 1); redraw(); } }))), s.open ? h('div.wf-opts', s.fields.el.children.length ? s.fields.el : h('p.muted.small', 'This step has no options.')) : null));
        });
      }
      function save() { if (!steps.length) { W.toast('Add some steps first.', 'info'); return; } W.ask('Save workflow', 'Name', { ok: 'Save' }).then((n) => { if (!n) return; const all = W.store.get('workflows', []).filter((x) => x.name !== n); all.push({ name: n, steps: steps.map((s) => ({ tool: s.id, vals: Object.assign({}, s.fields.vals) })) }); W.store.set('workflows', all); refreshSaved(); W.toast('Saved “' + n + '”', 'ok'); }); }
      function delSaved() { const all = W.store.get('workflows', []); if (!all.length) { W.toast('You have no saved workflows.', 'info'); return; } W.ask('Delete saved workflow', 'Name of the workflow to delete', { value: all[0].name, ok: 'Delete' }).then((n) => { if (n == null) return; W.store.set('workflows', all.filter((x) => x.name !== n)); refreshSaved(); }); }
      async function runAll() {
        if (running) return; if (!fl.items.length) { W.toast('Add at least one PDF first.', 'info'); return; } if (!steps.length) { W.toast('Add at least one step.', 'info'); return; }
        const bad = steps.findIndex((s, i) => FINAL_ONLY.has(s.id) && i < steps.length - 1); if (bad >= 0) { W.toast(`“${steps[bad].t.name}” creates non-PDF files, so it has to be the last step.`, 'err', 6000); return; }
        running = true; run.disabled = true; results.innerHTML = ''; $$('.wf-state', list).forEach((e) => (e.textContent = '')); let items = fl.items.slice(); let outputs = [];
        try {
          await W.lib('pdflib');
          for (let i = 0; i < steps.length; i++) {
            const s = steps[i]; const el = $(`.wf-state[data-i="${i}"]`, list); el.innerHTML = '<span class="chip">running…</span>'; const vals = Object.assign({}, s.fields.vals);
            const min = (s.t.files && s.t.files.min != null ? s.t.files.min : 1); if (items.length < min) throw new Error(`Step ${i + 1} (${s.t.name}) needs at least ${min} files but got ${items.length}.`);
            if (s.t.validate) { const msg = s.t.validate(items, vals, {}); if (msg) throw new Error(`Step ${i + 1} (${s.t.name}): ${msg}`); }
            const ctx = { progress: (f, l) => prog.set((i + (f == null ? 0.5 : f)) / steps.length, `Step ${i + 1}/${steps.length} · ${s.t.name}${l ? ' — ' + l : ''}`), check: () => { }, tool: s.t, api: { fl: { items }, vals } };
            const res = await s.t.run(items, vals, ctx); outputs = Array.isArray(res) ? res : res.outputs;
            el.innerHTML = `<span class="chip ok">✓ ${U.plural(outputs.length, 'file')}</span>`;
            if (i < steps.length - 1) { items = []; for (const o of outputs) { const it = new W.Item(W.file(o.blob, o.name, o.blob.type)); if (it.kind === 'pdf') { try { await P.prepare(it); } catch { } } items.push(it); } }
          }
          prog.hide(); await W.showResults(results, outputs, { tool: W.byId.workflow, note: `${steps.length} step${steps.length > 1 ? 's' : ''} completed on ${U.plural(fl.items.length, 'file')}` });
        } catch (e) { prog.hide(); console.error(e); results.appendChild(h('div.errbox', h('b', 'The workflow stopped'), h('p', W.friendlyError(e)))); }
        finally { running = false; run.disabled = false; }
      }
      redraw();
      const carried = W.takeCarry('workflow'); if (carried.length) await fl.add(carried);
    },
  });
}
