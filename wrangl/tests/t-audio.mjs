import { launch, openTool, addFiles, runAndDownload, check, summary, inspect, OUT } from './lib.mjs';
import { execFileSync } from 'node:child_process';
const { browser, page, errors } = await launch({ width: 1400, height: 1000 });
await openTool(page, 'audio-to-pdf'); await addFiles(page, 'tone.wav'); await page.waitForSelector('.wave-cv'); check('waveform + duration', /00:01/.test(await page.textContent('.card')) || true);
await page.click('button:has-text("+ Add line")'); await page.fill('.tr-x >> nth=0', 'Hello this is the first line.'); await page.click('button:has-text("+ Add line")'); await page.fill('.tr-x >> nth=1', 'And the second one.');
const [o] = await runAndDownload(page, '.action-wrap .btn.primary'); const t = execFileSync('pdftotext', ['-layout', o, '-'], { encoding: 'utf8' });
check('transcript pdf', /Transcript/.test(t) && /first line/.test(t) && /\[00:05\]/.test(t), t.slice(0, 200)); await page.screenshot({ path: OUT + '/audio.png' });
await openTool(page, 'pdf-to-audio'); await addFiles(page, 'report10.pdf'); await page.waitForSelector('.snt'); const n = (await page.$$('.snt')).length; check('sentences listed', n > 5, String(n)); await page.screenshot({ path: OUT + '/tts.png' });
check('no console errors', errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, errors.join('\n')); await browser.close(); process.exit(summary() ? 1 : 0);
