import { launch, openTool, addFiles, runAndDownload, check, summary, OUT } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const { browser, page, errors } = await launch();
const raw = (p) => execFileSync('pdftotext', ['-raw', p, '-'], { encoding: 'utf8' }).replace(/\s+/g, '');
// 1. add watermark
await openTool(page, 'watermark'); await addFiles(page, 'report10.pdf'); await page.fill('#f-text', 'SECRETMARK');
const [wm] = await runAndDownload(page); check('watermark added', /SECRETMARK/.test(raw(wm)));
// 2. remove by text
await openTool(page, 'remove-watermark'); await addFiles(page, wm); await page.fill('#f-text', 'secretmark');
const [clean] = await runAndDownload(page);
const t = raw(clean); check('watermark gone', !/SECRETMARK/.test(t)); check('body text intact', /Reportpage2/.test(t) || /Loremipsum/.test(t));
console.log('  note:', (await page.textContent('.res-head .muted')).slice(0, 120));
// 3. remove by auto (no text)
await openTool(page, 'remove-watermark'); await addFiles(page, wm);
const [clean2] = await runAndDownload(page); check('auto removal (artifact tag)', !/SECRETMARK/.test(raw(clean2)));
// 4. nothing to remove -> friendly error
await openTool(page, 'remove-watermark'); await addFiles(page, 'a.pdf'); await page.click('.action-wrap .btn.primary'); await page.waitForSelector('.errbox');
check('friendly error', /No removable watermark/.test(await page.textContent('.errbox')));
check('no console errors', errors.filter((e) => !/Failed to load resource|No removable watermark/.test(e)).length === 0, errors.join('\n'));
await browser.close(); process.exit(summary() ? 1 : 0);
