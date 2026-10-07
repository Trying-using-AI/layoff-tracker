import { launch, openTool, addFiles, OUT } from './lib.mjs';
const { browser, page, errors } = await launch({ width: 1400, height: 1000 });
page.on('console', (m) => console.log('console:', m.type(), m.text().slice(0, 300)));
await openTool(page, 'fill-forms'); await addFiles(page, 'form.pdf');
await page.waitForTimeout(2500);
console.log(await page.evaluate(() => document.querySelector('.ff') ? document.querySelector('.ff').outerHTML.slice(0, 800) : 'no .ff'));
console.log('errors', errors);
await page.screenshot({ path: OUT + '/fill.png' });
await browser.close();
