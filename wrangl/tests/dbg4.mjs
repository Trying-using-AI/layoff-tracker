import { launch, HTML } from './lib.mjs';
const { browser, page } = await launch();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message, '\n', (e.stack || '').slice(0, 500)));
page.on('console', (m) => console.log('console:', m.type(), m.text().slice(0, 400)));
page.on('worker', (w) => console.log('worker created', w.url().slice(0, 80)));
await page.goto(HTML);
const r = await page.evaluate(async () => {
  try { const w = await W.ocr.worker('eng'); return 'worker ok'; } catch (e) { return 'ERR ' + (e.message || e) + ' ' + (e.stack || '').slice(0, 300); }
});
console.log(r);
await browser.close();
