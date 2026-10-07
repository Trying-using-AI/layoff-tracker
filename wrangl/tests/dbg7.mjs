import { launch, HTML, OUT } from './lib.mjs';
const { browser, page } = await launch({ width: 1360, height: 900 });
await page.goto(HTML); await page.waitForSelector('.hero'); await page.keyboard.press('Control+k'); await page.waitForSelector('#palette'); await page.waitForTimeout(500);
console.log(await page.evaluate(() => { const p = document.getElementById('palette'); const cs = getComputedStyle(p); return { top: cs.top, bottom: cs.bottom, height: cs.height, ph: cs.paddingTop, rows: cs.gridTemplateRows, cls: p.className, alignContent: cs.alignContent, ov: cs.overflowY }; }));
await browser.close();
