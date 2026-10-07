import { launch, HTML } from './lib.mjs';
const { browser, page, errors } = await launch();
await page.goto(HTML);
await page.waitForTimeout(1500);
console.log(errors.join('\n') || 'no errors');
console.log((await page.content()).slice(0, 600).replace(/\s+/g,' '));
console.log(await page.evaluate(() => document.getElementById('app').innerHTML.slice(0,300)));
await browser.close();
