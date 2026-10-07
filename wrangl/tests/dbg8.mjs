import { launch, openTool, addFiles } from './lib.mjs';
const { browser, page, errors } = await launch({ width: 1300, height: 900 });
page.on('console', (m) => console.log('console:', m.type(), m.text().slice(0, 200)));
await openTool(page, 'encrypt'); await addFiles(page, 'a.pdf'); await page.fill('#f-pw', 'Sup3r-secret!'); await page.fill('#f-pw2', 'Sup3r-secret!');
await page.click('.action-wrap .btn.primary'); await page.waitForSelector('.res, .errbox', { timeout: 30000 });
console.log(await page.evaluate(() => document.querySelector('.res, .errbox').innerText.slice(0, 300)));
console.log(await page.$$eval('.res-row button', (b) => b.map((x) => x.textContent)));
await browser.close();
