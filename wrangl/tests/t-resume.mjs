import { launch, openTool, runAndDownload, check, summary, inspect, OUT } from './lib.mjs';
import { execFileSync } from 'node:child_process';
const { browser, page, errors } = await launch({ width: 1440, height: 1000 });
await openTool(page, 'resume'); await page.waitForSelector('.rs-frame'); await page.waitForTimeout(600); await page.screenshot({ path: OUT + '/resume.png' });
for (const t of ['Classic', 'Modern', 'Sidebar', 'Minimal', 'Executive', 'Tech']) {
  await page.click(`.rs-tpl:has-text("${t}")`); await page.waitForTimeout(400);
  const [o] = await runAndDownload(page, '.rs-sticky .btn.primary'); const i = inspect(o); const tx = execFileSync('pdftotext', ['-layout', o, '-'], { encoding: 'utf8' });
  check(`${t}: name, experience, skills`, /Aarav Mehta/.test(tx) && /Lumen Labs/.test(tx) && /Figma/.test(tx), tx.slice(0, 120)); console.log('   pages', i.n);
  execFileSync('pdftoppm', ['-r', '45', '-png', '-f', '1', '-l', '1', o, OUT + '/resume-' + t.toLowerCase()]);
}
check('no console errors', errors.length === 0, errors.join('\n')); await browser.close(); process.exit(summary() ? 1 : 0);
