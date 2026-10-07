import { launch, openTool, addFiles, runAndDownload, check, summary, inspect, OUT } from './lib.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { browser, page, errors } = await launch({ width: 1400, height: 1000 });
const only = process.argv[2];
const T = async (name, fn) => { if (only && !name.includes(only)) return; console.log('\n# ' + name); try { await fn(); } catch (e) { check(name + ' (exception)', false, e.message.slice(0, 500)); } };
const raw = (p) => execFileSync('pdftotext', ['-raw', p, '-'], { encoding: 'utf8' });
const pageBox = async (i = 0) => (await page.locator('.ep').nth(i).boundingBox());
await T('edit: text, shapes, edit existing, save', async () => {
  await openTool(page, 'edit'); await addFiles(page, 'report10.pdf');
  await page.waitForSelector('.ep-cv'); await page.waitForTimeout(800);
  // text tool
  await page.click('.ed-tool[data-tool=text]');
  let b = await pageBox(0);
  await page.mouse.click(b.x + 120, b.y + 300); await page.keyboard.type('Hello from Wrangl'); await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  // rectangle
  await page.click('.ed-tool[data-tool=rect]'); await page.mouse.move(b.x + 100, b.y + 400); await page.mouse.down(); await page.mouse.move(b.x + 260, b.y + 460, { steps: 5 }); await page.mouse.up();
  // draw
  await page.click('.ed-tool[data-tool=draw]'); await page.mouse.move(b.x + 300, b.y + 400); await page.mouse.down(); for (let i = 0; i < 20; i++) await page.mouse.move(b.x + 300 + i * 6, b.y + 400 + Math.sin(i / 2) * 20); await page.mouse.up();
  // highlight
  await page.click('.ed-tool[data-tool=highlight]'); await page.mouse.move(b.x + 72, b.y + 700); await page.mouse.down(); await page.mouse.move(b.x + 300, b.y + 725, { steps: 4 }); await page.mouse.up();
  // edit existing text
  await page.click('.ed-tool[data-tool=edittext]'); await page.waitForSelector('.etr');
  const runs = await page.$$('.etr'); console.log('   text runs on first pages:', runs.length);
  // click the first run (title)
  await page.locator('.ep').nth(0).locator('.etr').first().click(); await page.waitForTimeout(150);
  await page.keyboard.press('Control+a'); await page.keyboard.type('EDITED TITLE'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/editor.png' });
  const nobj = await page.evaluate(() => 0);
  const [o] = await runAndDownload(page, '.ed-save .btn.primary');
  const t = raw(o); const i = inspect(o);
  check('10 pages', i.n === 10); check('new text present', /Hello from Wrangl/.test(t)); check('edited title present', /EDITED TITLE/.test(t), t.slice(0, 200));
  execFileSync('pdftoppm', ['-r', '70', '-png', '-f', '1', '-l', '1', o, OUT + '/edited']);
});
await T('sign', async () => {
  await openTool(page, 'sign'); await addFiles(page, 'a.pdf');
  await page.waitForSelector('.sig-cv'); await page.waitForTimeout(500);
  const cv = await page.locator('.sig-cv').boundingBox();
  await page.mouse.move(cv.x + 60, cv.y + 120); await page.mouse.down(); for (let i = 0; i < 30; i++) await page.mouse.move(cv.x + 60 + i * 12, cv.y + 100 + Math.sin(i / 3) * 40); await page.mouse.up();
  await page.click('button:has-text("Use this signature")'); await page.waitForTimeout(500);
  check('signature placed', (await page.$$('.eo-img')).length === 1);
  await page.screenshot({ path: OUT + '/sign.png' });
  const [o] = await runAndDownload(page, '.ed-save .btn.primary'); check('saved', inspect(o).n === 3);
  execFileSync('pdftoppm', ['-r', '40', '-png', '-f', '1', '-l', '1', o, OUT + '/signed']);
});
await T('redact search', async () => {
  await openTool(page, 'redact'); await addFiles(page, 'report10.pdf');
  await page.waitForSelector('.red-card'); await page.waitForTimeout(500);
  await page.fill('.red-card textarea', 'alpha3\ntest@example.com'); await page.click('button:has-text("Find & mark")'); await page.waitForTimeout(1500);
  const marks = await page.$$eval('.eo-svg rect', (r) => r.length); console.log('   marks:', marks); check('marks created', marks >= 11);
  await page.screenshot({ path: OUT + '/redact.png' });
  const [o] = await runAndDownload(page, '.ed-save .btn.primary', { timeout: 120000 }); const t = raw(o);
  check('secret email removed', !/test@example\.com/.test(t), t.slice(0, 200)); check('alpha3 removed', !/alpha3/.test(t)); check('other text kept', /alpha2/.test(t) && /Loremipsum|Lorem ipsum/.test(t.replace(/\s+/g, ' ')), t.slice(0, 100));
});
await T('fill forms', async () => {
  await openTool(page, 'fill-forms'); await addFiles(page, 'form.pdf');
  await page.waitForSelector('.ff-fields input'); const ins = await page.$$('.ff-fields input.in'); console.log('   inputs:', ins.length);
  await ins[0].fill('Ada Lovelace'); await ins[1].fill('ada@example.com'); await page.locator('.ff-fields label.chk').first().click();
  await page.waitForTimeout(1200); await page.screenshot({ path: OUT + '/fill.png' });
  const [o] = await runAndDownload(page, '.ff .btn.primary');
  const t = raw(o); check('name in pdf', /Ada Lovelace/.test(t), t); check('email in pdf', /ada@example\.com/.test(t));
});
check('no console errors', errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, errors.join('\n'));
await browser.close();
process.exit(summary() ? 1 : 0);
