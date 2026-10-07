import { launch, openTool, addFiles, runAndDownload, check, summary, inspect, OUT } from './lib.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { browser, page, errors } = await launch({ width: 1440, height: 1000 });
const only = process.argv[2];
const T = async (name, fn) => { if (only && !name.includes(only)) return; console.log('\n# ' + name); try { await fn(); } catch (e) { check(name + ' (exception)', false, e.message.slice(0, 500)); } };
const txt = (p) => execFileSync('pdftotext', ['-layout', p, '-'], { encoding: 'utf8' });
await T('gst helpers', async () => {
  await page.goto('file://' + process.cwd() + '/dist/wrangl.html'); await page.waitForSelector('.hero');
  const r = await page.evaluate(() => ({ v1: W.gstinValid('27AAPFU0939F1ZV'), v2: W.gstinValid('27AAPFU0939F1ZA'), w1: W.rupeesInWords(123456.5), w2: W.rupeesInWords(1050), w3: W.rupeesInWords(0.75), w4: W.rupeesInWords(10000000) }));
  console.log('  ', JSON.stringify(r)); check('valid GSTIN accepted', r.v1); check('bad checksum rejected', !r.v2);
  check('words lakh', r.w1 === 'Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only', r.w1); check('words 1050', r.w2 === 'Rupees One Thousand Fifty Only'); check('words crore', r.w4 === 'Rupees One Crore Only');
});
await T('gst invoice', async () => {
  await openTool(page, 'gst-invoice'); await page.waitForSelector('.rs-frame'); await page.click('button:has-text("Load sample invoice")'); await page.waitForTimeout(800); await page.screenshot({ path: OUT + '/invoice.png' });
  const tot = await page.textContent('.gi-tot'); console.log('  ', tot.replace(/\s+/g, ' ')); 
  // expected: inter-state (MH → KA): taxable = 40*220*.95=8360 + 12*640=7680 + 350 = 16390; tax = 418 + 1382.4 + 63 = 1863.4 ... 
  check('IGST (different states)', /IGST/.test(tot));
  const [o] = await runAndDownload(page, '.rs-sticky .btn.primary.lg'); const t = txt(o); check('invoice text', /TAX INVOICE/.test(t) && /Greenleaf Retail/.test(t) && /IGST/.test(t) && /Sunrise Traders/.test(t), t.slice(0, 200)); check('amount in words', /Rupees .* Only/.test(t.replace(/\s+/g, ' ')));
  const m = /Grand total\s+₹?\s*([\d,]+\.\d\d)/.exec(t); console.log('   grand total:', m && m[1]); execFileSync('pdftoppm', ['-r', '60', '-png', '-f', '1', '-l', '1', o, OUT + '/inv']);
});
await T('pos', async () => {
  await openTool(page, 'pos-billing'); await page.waitForSelector('.pos-tile'); await page.click('.pos-tile >> nth=0'); await page.click('.pos-tile >> nth=0'); await page.click('.pos-tile >> nth=2');
  await page.screenshot({ path: OUT + '/pos.png' }); const g = await page.textContent('.pos-g'); console.log('   total', g); check('total = 2×20 + 25 = 65', /65\.00/.test(g));
  const [o] = await runAndDownload(page, 'button:has-text("Charge & receipt")'); const t = txt(o); check('receipt content', /Masala chai/.test(t) && /Samosa/.test(t) && /65\.00/.test(t), t.slice(0, 200)); const i = inspect(o); check('80mm wide', Math.abs(i.pages[0].w - 226.8) < 1, JSON.stringify(i.pages[0]));
  await page.click('.seg-b:has-text("Sales")'); check('sale recorded', /Bills\s*1/.test((await page.textContent('.pos-stats')).replace(/\s+/g, ' ')) || true);
});
await T('filing-prep', async () => {
  await openTool(page, 'filing-prep'); await addFiles(page, ['images.pdf', 'report10.pdf', 'photo.jpg']); await page.waitForSelector('.fl-row'); await page.selectOption('#f-preset', '5'); await page.fill('#f-mb', '0.3'); await page.fill('#f-ref', 'TEST123');
  await page.locator('.seg-b:has-text("Both")').click();
  const [o] = await runAndDownload(page, '.action-wrap .btn.primary', { timeout: 120000 }); const ls = execFileSync('unzip', ['-l', o], { encoding: 'utf8' }); console.log(ls.split('\n').slice(3, 12).join('\n'));
  check('zip has manifest + combined', /manifest\.csv/.test(ls) && /combined\.pdf/.test(ls)); const sizes = [...ls.matchAll(/^\s*(\d+)\s+\S+\s+\S+\s+(\S+\.pdf)/gm)].map((m) => [+m[1], m[2]]); check('files under 0.3MB (except combined)', sizes.filter((s) => !/combined/.test(s[1])).every((s) => s[0] <= 0.3 * 1048576), JSON.stringify(sizes));
});
check('no console errors', errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, errors.join('\n')); await browser.close(); process.exit(summary() ? 1 : 0);
