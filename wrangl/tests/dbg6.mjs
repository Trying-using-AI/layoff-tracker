import { launch, openTool, addFiles } from './lib.mjs';
const { browser, page, errors } = await launch({ width: 1300, height: 950 });
await openTool(page, 'workflow'); await addFiles(page, 'report10.pdf'); await page.selectOption('select[aria-label="Add a step"]', 'pdf-to-images'); await page.selectOption('select[aria-label="Add a step"]', 'rotate');
console.log(await page.$$eval('.wf-step', (e) => e.map((x) => x.className + '|' + x.textContent.slice(0, 60))));
await page.click('.action-wrap .btn.primary'); await page.waitForTimeout(500); console.log('toasts:', await page.evaluate(() => document.getElementById('toasts') && document.getElementById('toasts').textContent)); console.log(errors);
await browser.close();
