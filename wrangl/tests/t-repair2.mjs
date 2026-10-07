import { launch, openTool, addFiles, runAndDownload, check, summary, inspect } from './lib.mjs';
const { browser, page } = await launch();
for (const f of ['broken2.pdf']) { await openTool(page, 'repair'); await addFiles(page, f); const [o] = await runAndDownload(page, '.action-wrap .btn.primary', { timeout: 90000 }); check(f + ' repaired', inspect(o).n === 10, JSON.stringify(inspect(o)).slice(0, 100)); }
await openTool(page, 'repair'); await addFiles(page, 'garbage.pdf'); await page.click('.action-wrap .btn.primary'); await page.waitForSelector('.errbox, .res'); check('garbage → friendly error', /too damaged/.test(await page.textContent('.errbox')));
await browser.close(); process.exit(summary() ? 1 : 0);
