import { launch, openTool, addFiles, runAndDownload, check, summary, inspect, OUT } from './lib.mjs';
import fs from 'node:fs';
const { browser, page, errors } = await launch();
const only = process.argv[2];
const T = async (name, fn) => { if (only && !name.includes(only)) return; console.log('\n# ' + name); try { await fn(); } catch (e) { check(name + ' (exception)', false, e.message.slice(0, 400)); } };
await T('organize', async () => {
  await openTool(page, 'organize'); await addFiles(page, 'report10.pdf');
  await page.waitForSelector('.og-card');
  check('10 cards', (await page.$$('.og-card')).length === 10);
  await page.click('.og-card >> nth=0'); await page.click('.og-card >> nth=2', { modifiers: ['Control'] });
  await page.click('button:has-text("Remove")');
  check('8 left', (await page.$$('.og-card')).length === 8);
  await page.click('.og-card >> nth=0'); await page.click('button:has-text("Rotate right")');
  // drag card 1 after card 5
  const a = await page.locator('.og-card').nth(0).boundingBox(), b = await page.locator('.og-card').nth(4).boundingBox();
  await page.locator('.og-card').nth(0).dragTo(page.locator('.og-card').nth(4), { targetPosition: { x: b.width - 8, y: b.height / 2 } });
  await page.click('button:has-text("Blank page")');
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/organize.png' });
  const [o] = await runAndDownload(page, '.og-host .btn.primary.lg'); const i = inspect(o);
  check('9 pages', i.n === 9, JSON.stringify(i.pages.map((p) => p.text.slice(0, 20))));
  console.log('   order:', i.pages.map((p) => (p.text.match(/Report page (\d+)|Chapter (\d)/) || ['blank'])[0] + (p.rot ? '@' + p.rot : '')).join(' | '));
  check('contains removed? no page1/page3', !i.pages.some((p) => /Report page 3\b/.test(p.text)));
});
await T('crop', async () => {
  await openTool(page, 'crop-resize'); await addFiles(page, 'report10.pdf');
  await page.waitForSelector('.crop-rect');
  await page.click('button:has-text("Auto-detect margins")');
  await page.waitForTimeout(500);
  const top = await page.inputValue('#f-top'); console.log('   auto top mm:', top);
  check('auto margin found', parseFloat(top) > 5);
  await page.screenshot({ path: OUT + '/crop.png' });
  const [o] = await runAndDownload(page); const i = inspect(o);
  check('cropped smaller than A4', i.pages[0].w < 590 && i.pages[0].h < 840, JSON.stringify(i.pages[0]));
});
await T('resize', async () => {
  await openTool(page, 'crop-resize'); await addFiles(page, 'a.pdf');
  await page.click('.seg-b:has-text("Resize pages")'); await page.selectOption('#f-size', 'Letter');
  const [o] = await runAndDownload(page); const i = inspect(o);
  check('letter size', Math.abs(i.pages[0].w - 612) < 1 && Math.abs(i.pages[0].h - 792) < 1, JSON.stringify(i.pages[0]));
});
await T('compress lossless', async () => {
  await openTool(page, 'compress'); await addFiles(page, 'report10.pdf');
  const [o] = await runAndDownload(page); const i = inspect(o);
  check('still 10 pages', i.n === 10); console.log('   size', fs.statSync(o).size, 'vs', fs.statSync('tests/fixtures/report10.pdf').size);
});
await T('compress strong', async () => {
  await openTool(page, 'compress'); await addFiles(page, 'images.pdf');
  await page.click('.seg-b:has-text("Strong")');
  const [o] = await runAndDownload(page); const i = inspect(o);
  const a = fs.statSync('tests/fixtures/images.pdf').size, b = fs.statSync(o).size; console.log('   size', a, '->', b);
  check('smaller by >40%', b < a * 0.6); check('3 pages intact', i.n === 3 && /Photo 1/.test(i.pages[0].text), JSON.stringify(i.pages[0]));
});
await T('compress extreme', async () => {
  await openTool(page, 'compress'); await addFiles(page, 'images.pdf');
  await page.click('.seg-b:has-text("Extreme")');
  const [o] = await runAndDownload(page); const a = fs.statSync('tests/fixtures/images.pdf').size, b = fs.statSync(o).size; console.log('   size', a, '->', b);
  check('smaller', b < a * 0.5);
});
check('no console errors', errors.length === 0, errors.join('\n'));
await browser.close();
process.exit(summary() ? 1 : 0);
