import { launch, openTool, addFiles, runAndDownload, check, summary, inspect, OUT } from './lib.mjs';
import { execFileSync } from 'node:child_process';
const { browser, page, errors } = await launch({ width: 1400, height: 1000 });
await openTool(page, 'pptx-to-pdf'); await addFiles(page, 'sample.pptx');
const [o] = await runAndDownload(page, '.action-wrap .btn.primary', { timeout: 90000 }); const i = inspect(o); const t = execFileSync('pdftotext', ['-layout', o, '-'], { encoding: 'utf8' });
console.log(JSON.stringify(i.pages.map((p) => [p.w, p.h])));
check('3 slides', i.n === 3); check('title text', /Deck Title/.test(t) && /A subtitle/.test(t)); check('bullets', /First point/.test(t) && /Third point/.test(t)); check('textbox', /A custom text box/.test(t)); check('16:9 page', Math.abs(i.pages[0].w / i.pages[0].h - 16 / 9) < 0.02);
execFileSync('pdftoppm', ['-r', '40', '-png', o, OUT + '/pptx']);
check('no console errors', errors.length === 0, errors.join('\n')); await browser.close(); process.exit(summary() ? 1 : 0);
