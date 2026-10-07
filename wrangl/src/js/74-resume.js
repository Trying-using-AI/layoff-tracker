// ===== Resume builder: six original templates, live preview, selectable-text PDF =====
{
  const esc = U.esc;
  const SAMPLE = {
    name: 'Aarav Mehta', title: 'Senior Product Designer', email: 'aarav.mehta@example.com', phone: '+91 98765 43210', location: 'Bengaluru, India', links: 'portfolio.example.com\nlinkedin.com/in/aarav-mehta',
    summary: 'Product designer with 8+ years of experience shipping consumer and B2B products used by millions. I turn messy problems into simple, accessible interfaces and enjoy working closely with engineers.',
    experience: [
      { role: 'Senior Product Designer', company: 'Lumen Labs', location: 'Bengaluru', start: '2021', end: 'Present', bullets: 'Led the redesign of the onboarding flow, lifting activation by 24%\nBuilt and documented a design system adopted by 6 product teams\nMentored 4 designers and ran weekly critique sessions' },
      { role: 'Product Designer', company: 'Fintrail', location: 'Mumbai', start: '2018', end: '2021', bullets: 'Designed the mobile investing experience from 0 → 1M users\nRan 30+ usability studies that shaped the quarterly roadmap' },
    ],
    education: [{ school: 'National Institute of Design', degree: 'M.Des, Interaction Design', dates: '2014 – 2016', details: '' }],
    skills: 'Figma, Prototyping, Design systems, User research, Accessibility, HTML/CSS',
    projects: [{ name: 'Open-source icon set', url: 'github.com/example/icons', desc: '1,200 icons, 8k GitHub stars, used by teams worldwide.' }],
    certs: 'Google UX Design Certificate (2020)', languages: 'English, Hindi, Kannada',
  };
  const EMPTY = { name: '', title: '', email: '', phone: '', location: '', links: '', summary: '', experience: [{ role: '', company: '', location: '', start: '', end: '', bullets: '' }], education: [{ school: '', degree: '', dates: '', details: '' }], skills: '', projects: [], certs: '', languages: '' };
  const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const list = (s) => lines(s).length ? `<ul>${lines(s).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '';
  const csv = (s) => String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const contact = (d, sep = ' · ') => [d.email, d.phone, d.location, ...lines(d.links)].filter(Boolean).map(esc).join(sep);
  const dates = (e) => [e.start, e.end].filter(Boolean).join(' – ');

  // each template: (data, accent, fs) => full HTML document
  const TEMPLATES = {
    classic: { name: 'Classic', desc: 'Serif, centred header, ruled sections', render: (d, a, fs) => doc(`
      body{font-family:"Times New Roman","Liberation Serif",serif;font-size:${10.5 * fs}pt;line-height:1.38;color:#111;padding:6px 8px}
      header{text-align:center;margin-bottom:10px}h1{font-size:${25 * fs}pt;margin:0;letter-spacing:.02em;color:${a}}.sub{font-size:${12 * fs}pt;color:#444;margin:2px 0}.ct{font-size:${9.5 * fs}pt;color:#444}
      h2{font-size:${11.5 * fs}pt;text-transform:uppercase;letter-spacing:.12em;border-bottom:1.2px solid ${a};padding-bottom:2px;margin:14px 0 6px;color:${a}}
      .row{display:flex;justify-content:space-between;gap:12px}.row b{font-size:${11 * fs}pt}.mut{color:#555;font-style:italic}ul{margin:3px 0 6px;padding-left:1.25em}li{margin:1px 0}p{margin:0 0 5px}.e{margin-bottom:8px}`,
      `<header><h1>${esc(d.name)}</h1>${d.title ? `<div class="sub">${esc(d.title)}</div>` : ''}<div class="ct">${contact(d)}</div></header>${body(d)}`) },
    modern: { name: 'Modern', desc: 'Sans-serif with an accent header bar', render: (d, a, fs) => doc(`
      body{font-family:Arial,"Liberation Sans",sans-serif;font-size:${9.8 * fs}pt;line-height:1.42;color:#1b1b1b}
      header{background:${a};color:#fff;padding:20px 26px;margin:-4px -4px 14px}h1{font-size:${26 * fs}pt;margin:0;letter-spacing:-.01em}.sub{font-size:${12 * fs}pt;opacity:.92;margin-top:2px}.ct{font-size:${9 * fs}pt;margin-top:8px;opacity:.95}
      main{padding:0 22px}h2{font-size:${10 * fs}pt;text-transform:uppercase;letter-spacing:.14em;color:${a};margin:14px 0 6px;font-weight:700}
      .row{display:flex;justify-content:space-between;gap:12px}.row b{font-size:${10.8 * fs}pt}.mut{color:#666}ul{margin:3px 0 6px;padding-left:1.2em}p{margin:0 0 5px}.e{margin-bottom:8px}`,
      `<header><h1>${esc(d.name)}</h1>${d.title ? `<div class="sub">${esc(d.title)}</div>` : ''}<div class="ct">${contact(d, ' &nbsp;|&nbsp; ')}</div></header><main>${body(d)}</main>`) },
    sidebar: { name: 'Sidebar', desc: 'Two columns with a coloured side panel', render: (d, a, fs) => doc(`
      body{font-family:Arial,"Liberation Sans",sans-serif;font-size:${9.6 * fs}pt;line-height:1.42;color:#1b1b1b;padding:0}
      .wrap{display:flex;min-height:1050px}aside{width:215px;background:${a};color:#fff;padding:26px 18px;flex:none}main{flex:1;padding:26px 24px}
      h1{font-size:${22 * fs}pt;margin:0 0 2px;line-height:1.1}.sub{font-size:${10.5 * fs}pt;opacity:.9;margin-bottom:14px}aside h3{font-size:${9 * fs}pt;text-transform:uppercase;letter-spacing:.14em;margin:16px 0 5px;border-bottom:1px solid rgba(255,255,255,.4);padding-bottom:3px}aside p,aside li{font-size:${9 * fs}pt;margin:0 0 3px}aside ul{padding-left:1.1em;margin:0}
      main h2{font-size:${11 * fs}pt;text-transform:uppercase;letter-spacing:.12em;color:${a};margin:0 0 6px;padding-bottom:3px;border-bottom:2px solid ${a}}main section{margin-bottom:14px}
      .row{display:flex;justify-content:space-between;gap:10px}.mut{color:#666}ul{margin:3px 0 6px;padding-left:1.2em}p{margin:0 0 5px}.e{margin-bottom:8px}.sk{display:block;margin:0 0 3px}`,
      `<div class="wrap"><aside><h1>${esc(d.name)}</h1>${d.title ? `<div class="sub">${esc(d.title)}</div>` : ''}<h3>Contact</h3>${[d.email, d.phone, d.location, ...lines(d.links)].filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('')}${d.skills ? `<h3>Skills</h3>${csv(d.skills).map((s) => `<span class="sk">${esc(s)}</span>`).join('')}` : ''}${d.languages ? `<h3>Languages</h3>${csv(d.languages).map((s) => `<span class="sk">${esc(s)}</span>`).join('')}` : ''}${d.certs ? `<h3>Certifications</h3>${lines(d.certs).map((s) => `<p>${esc(s)}</p>`).join('')}` : ''}</aside><main>${body(d, { skipSkills: true, skipLang: true, skipCerts: true })}</main></div>`) },
    minimal: { name: 'Minimal', desc: 'Airy, understated, lots of white space', render: (d, a, fs) => doc(`
      body{font-family:"Helvetica Neue",Arial,"Liberation Sans",sans-serif;font-size:${9.8 * fs}pt;line-height:1.5;color:#222;padding:14px 18px}
      h1{font-size:${28 * fs}pt;font-weight:300;margin:0;letter-spacing:-.01em}.sub{font-size:${11.5 * fs}pt;color:${a};margin:2px 0 6px}.ct{font-size:${9 * fs}pt;color:#777;margin-bottom:22px}
      h2{font-size:${8.5 * fs}pt;text-transform:uppercase;letter-spacing:.22em;color:#888;font-weight:600;margin:20px 0 8px}
      .row{display:flex;justify-content:space-between;gap:12px}.row b{font-weight:600}.mut{color:#888}ul{margin:3px 0 8px;padding-left:1.1em}li{margin:2px 0}p{margin:0 0 6px}.e{margin-bottom:11px}`,
      `<h1>${esc(d.name)}</h1>${d.title ? `<div class="sub">${esc(d.title)}</div>` : ''}<div class="ct">${contact(d, ' &nbsp;·&nbsp; ')}</div>${body(d)}`) },
    executive: { name: 'Executive', desc: 'Navy banner with refined serif headings', render: (d, a, fs) => doc(`
      body{font-family:Georgia,"Times New Roman","Liberation Serif",serif;font-size:${10 * fs}pt;line-height:1.42;color:#1a1a1a}
      header{background:${a};color:#fff;padding:22px 28px;margin:-4px -4px 16px;border-bottom:4px solid #c9a24d}h1{font-size:${27 * fs}pt;margin:0;font-weight:700;letter-spacing:.02em}.sub{font-size:${12.5 * fs}pt;color:#e8d6a6;margin-top:3px;font-style:italic}.ct{font-size:${9 * fs}pt;margin-top:8px;opacity:.92}
      main{padding:0 24px}h2{font-family:Arial,"Liberation Sans",sans-serif;font-size:${9.5 * fs}pt;text-transform:uppercase;letter-spacing:.18em;color:${a};margin:15px 0 6px;font-weight:700;border-left:4px solid #c9a24d;padding-left:8px}
      .row{display:flex;justify-content:space-between;gap:12px}.row b{font-size:${11 * fs}pt}.mut{color:#666;font-style:italic}ul{margin:3px 0 6px;padding-left:1.2em}p{margin:0 0 5px}.e{margin-bottom:8px}`,
      `<header><h1>${esc(d.name)}</h1>${d.title ? `<div class="sub">${esc(d.title)}</div>` : ''}<div class="ct">${contact(d, ' &nbsp;◆&nbsp; ')}</div></header><main>${body(d)}</main>`) },
    tech: { name: 'Tech', desc: 'Monospace accents and skill chips', render: (d, a, fs) => doc(`
      body{font-family:Arial,"Liberation Sans",sans-serif;font-size:${9.7 * fs}pt;line-height:1.45;color:#20242a;padding:6px 10px}
      h1{font-size:${25 * fs}pt;margin:0;letter-spacing:-.02em}.sub{font-family:"Courier New","Liberation Mono",monospace;color:${a};font-size:${10.5 * fs}pt;margin:3px 0 4px}.ct{font-size:${9 * fs}pt;color:#555}
      h2{font-family:"Courier New","Liberation Mono",monospace;font-size:${10.5 * fs}pt;color:${a};margin:16px 0 6px;padding-bottom:3px;border-bottom:1.5px dashed ${a}}h2:before{content:"# "}
      .row{display:flex;justify-content:space-between;gap:12px}.row b{font-size:${10.6 * fs}pt}.mut{color:#666;font-family:"Courier New","Liberation Mono",monospace;font-size:${9 * fs}pt}ul{margin:3px 0 6px;padding-left:1.2em}p{margin:0 0 5px}.e{margin-bottom:8px}
      .chip{display:inline-block;background:${a}1f;color:${a};border:1px solid ${a}55;border-radius:99px;padding:1px 9px;margin:0 5px 5px 0;font-size:${9 * fs}pt}`,
      `<h1>${esc(d.name)}</h1>${d.title ? `<div class="sub">&gt; ${esc(d.title)}</div>` : ''}<div class="ct">${contact(d, ' &nbsp;/&nbsp; ')}</div>${body(d, { chips: true })}`) },
  };
  function doc(css, inner) { return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0}${css}</style></head><body>${inner}</body></html>`; }
  function body(d, o = {}) {
    let s = '';
    if (d.summary) s += `<h2>Summary</h2><p>${esc(d.summary)}</p>`;
    const ex = d.experience.filter((e) => e.role || e.company); if (ex.length) s += `<section><h2>Experience</h2>${ex.map((e) => `<div class="e"><div class="row"><b>${esc(e.role)}${e.company ? ` · ${esc(e.company)}` : ''}</b><span class="mut">${esc(dates(e))}</span></div>${e.location ? `<div class="mut">${esc(e.location)}</div>` : ''}${list(e.bullets)}</div>`).join('')}</section>`;
    const pr = d.projects.filter((p) => p.name); if (pr.length) s += `<section><h2>Projects</h2>${pr.map((p) => `<div class="e"><div class="row"><b>${esc(p.name)}</b><span class="mut">${esc(p.url)}</span></div><p>${esc(p.desc)}</p></div>`).join('')}</section>`;
    const ed = d.education.filter((e) => e.school || e.degree); if (ed.length) s += `<section><h2>Education</h2>${ed.map((e) => `<div class="e"><div class="row"><b>${esc(e.school)}</b><span class="mut">${esc(e.dates)}</span></div><div>${esc(e.degree)}</div>${e.details ? `<p class="mut">${esc(e.details)}</p>` : ''}</div>`).join('')}</section>`;
    if (d.skills && !o.skipSkills) s += `<section><h2>Skills</h2>${o.chips ? csv(d.skills).map((k) => `<span class="chip">${esc(k)}</span>`).join('') : `<p>${csv(d.skills).map(esc).join(' · ')}</p>`}</section>`;
    if (d.certs && !o.skipCerts) s += `<section><h2>Certifications</h2>${lines(d.certs).map((c) => `<p>${esc(c)}</p>`).join('')}</section>`;
    if (d.languages && !o.skipLang) s += `<section><h2>Languages</h2><p>${csv(d.languages).map(esc).join(' · ')}</p></section>`;
    return s;
  }
  W.resumeTemplates = TEMPLATES;

  W.tool({
    id: 'resume', cat: 'create', name: 'Resume builder', icon: 'id-card', desc: 'Build a polished resume with six original templates.',
    keys: 'cv curriculum vitae job application template career latex ats professional',
    async render(root) {
      const saved = W.store.get('resume', null); let D = saved && saved.data ? saved.data : JSON.parse(JSON.stringify(EMPTY)); const S = Object.assign({ tpl: 'classic', accent: '#1f3a5f', size: 'A4', fs: 1 }, saved && saved.style);
      const persist = U.debounce(() => W.store.set('resume', { data: D, style: S }), 300);
      const prog = W.progress(); const results = h('div.results');
      const fr = h('iframe.rs-frame', { sandbox: '', title: 'Resume preview' }); const stage = h('div.rs-stage', fr);
      const upd = U.debounce(() => { const t = TEMPLATES[S.tpl]; const [pw, ph] = P.SIZES[S.size]; const wpx = pw / W.PX; fr.srcdoc = t.render(D, S.accent, S.fs); fr.style.width = wpx + 'px'; fr.style.height = ph / W.PX + 'px'; fit(); persist(); }, 120);
      const fit = () => { const w = stage.clientWidth || 600; const [pw, ph] = P.SIZES[S.size]; const sc = Math.min(1, (w - 2) / (pw / W.PX)); fr.style.transform = `scale(${sc})`; stage.style.height = ph / W.PX * sc + 'px'; };
      new ResizeObserver(fit).observe(stage);
      // ---- form
      const inp = (obj, key, label, { area = false, ph = '', help } = {}) => { const el = h(area ? 'textarea.in' : 'input.in', { value: obj[key] || '', placeholder: ph, rows: area ? 3 : null, oninput: () => { obj[key] = el.value; upd(); } }); return h('div.field', h('label.lbl', label), el, help && h('div.help', help)); };
      const form = h('div.rs-form');
      function draw() {
        form.innerHTML = '';
        const sec = (title, icon, ...kids) => h('details.rs-sec', { open: title === 'Basics' }, h('summary', h('span', { html: ic(icon, 16) }), title), h('div.rs-body', ...kids));
        form.append(
          sec('Basics', 'user', h('div.frow', inp(D, 'name', 'Full name', { ph: 'Your name' }), inp(D, 'title', 'Headline / job title')), h('div.frow', inp(D, 'email', 'Email'), inp(D, 'phone', 'Phone')), inp(D, 'location', 'Location'), inp(D, 'links', 'Links (one per line)', { area: true, ph: 'portfolio.example.com\nlinkedin.com/in/you' }), inp(D, 'summary', 'Summary', { area: true })),
          sec('Experience', 'briefcase', ...D.experience.map((e, i) => h('div.rs-entry', h('div.frow', inp(e, 'role', 'Role'), inp(e, 'company', 'Company')), h('div.frow', inp(e, 'location', 'Location'), inp(e, 'start', 'Start'), inp(e, 'end', 'End')), inp(e, 'bullets', 'Achievements (one per line)', { area: true }), h('button.btn.sm.ghost', { onclick: () => { D.experience.splice(i, 1); draw(); upd(); } }, 'Remove'))), h('button.btn.sm', { onclick: () => { D.experience.push({ role: '', company: '', location: '', start: '', end: '', bullets: '' }); draw(); } }, '+ Add position')),
          sec('Education', 'graduation-cap', ...D.education.map((e, i) => h('div.rs-entry', h('div.frow', inp(e, 'school', 'School'), inp(e, 'dates', 'Dates')), inp(e, 'degree', 'Degree'), inp(e, 'details', 'Details (optional)'), h('button.btn.sm.ghost', { onclick: () => { D.education.splice(i, 1); draw(); upd(); } }, 'Remove'))), h('button.btn.sm', { onclick: () => { D.education.push({ school: '', degree: '', dates: '', details: '' }); draw(); } }, '+ Add education')),
          sec('Skills & more', 'sparkles', inp(D, 'skills', 'Skills (comma separated)', { area: true }), inp(D, 'certs', 'Certifications (one per line)', { area: true }), inp(D, 'languages', 'Languages (comma separated)')),
          sec('Projects', 'folder-git-2', ...D.projects.map((p, i) => h('div.rs-entry', h('div.frow', inp(p, 'name', 'Name'), inp(p, 'url', 'Link')), inp(p, 'desc', 'Description', { area: true }), h('button.btn.sm.ghost', { onclick: () => { D.projects.splice(i, 1); draw(); upd(); } }, 'Remove'))), h('button.btn.sm', { onclick: () => { D.projects.push({ name: '', url: '', desc: '' }); draw(); } }, '+ Add project')));
      }
      draw();
      // ---- design controls
      const tplRow = h('div.rs-tpls'); const accent = h('input', { type: 'color', value: S.accent, oninput: () => { S.accent = accent.value; upd(); } });
      const mkTpls = () => { tplRow.innerHTML = ''; Object.entries(TEMPLATES).forEach(([id, t]) => tplRow.appendChild(h('button.rs-tpl' + (S.tpl === id ? '.on' : ''), { title: t.desc, onclick: () => { S.tpl = id; mkTpls(); upd(); } }, h('span.rs-tn', t.name), h('small', t.desc)))); };
      mkTpls();
      const size = h('select.in.sm', { onchange: () => { S.size = size.value; upd(); } }, ['A4', 'Letter'].map((s) => h('option', { value: s, selected: S.size === s }, s)));
      const fsR = h('input', { type: 'range', min: 0.8, max: 1.2, step: 0.02, value: S.fs, oninput: () => { S.fs = +fsR.value; upd(); } });
      const go = h('button.btn.primary.lg', { html: ic('file-down', 18) + '<span>Download PDF</span>', onclick: async () => {
        go.disabled = true; results.innerHTML = '';
        try { prog.set(0.05, 'Laying out'); const t = TEMPLATES[S.tpl]; const bytes = await W.htmlToPdf({ html: t.render(D, S.accent, S.fs), page: P.SIZES[S.size], margin: S.tpl === 'sidebar' ? [0, 0, 0, 0] : [26, 22, 26, 22], title: `${D.name || 'Resume'} — Resume`, author: D.name, onProgress: (f, l) => prog.set(f, l) }); prog.hide(); await W.showResults(results, [P.outPdf(bytes, U.safeName((D.name || 'resume') + '-resume') + '.pdf')], { tool: W.byId.resume, note: 'Text is selectable and ATS-friendly' }); }
        catch (e) { prog.hide(); console.error(e); results.appendChild(h('div.errbox', h('b', 'Something went wrong'), h('p', W.friendlyError(e)))); } finally { go.disabled = false; } } });
      root.classList.add('wide');
      root.append(
        h('div.rs-top', h('div.rs-tpl-wrap', h('b', 'Template'), tplRow), h('div.row.gap.wrap', h('label.small', 'Accent ', accent), h('label.small', 'Page ', size), h('label.small', 'Text size ', fsR), h('button.btn.sm', { onclick: () => { D = JSON.parse(JSON.stringify(SAMPLE)); draw(); upd(); } }, 'Load sample'), h('button.btn.sm.ghost', { onclick: async () => { if (await W.confirm('Clear everything?', 'This removes what you typed in the resume builder.', 'Clear')) { D = JSON.parse(JSON.stringify(EMPTY)); draw(); upd(); } } }, 'Clear'))),
        h('div.rs-grid', h('div', form), h('div.rs-prevcol', h('div.rs-sticky', stage, h('div.actions', { style: 'margin-top:12px' }, go), prog.el, results))));
      if (!saved) { D = JSON.parse(JSON.stringify(SAMPLE)); draw(); }
      upd(); setTimeout(fit, 50);
    },
  });
}
