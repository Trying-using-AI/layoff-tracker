import { launch, HTML, check, summary, OUT } from './lib.mjs';
const { browser, page, errors } = await launch({ width: 1360, height: 900 });
await page.goto(HTML); await page.waitForSelector('.hero');
const ids = await page.evaluate(() => W.tools.map((t) => [t.id, t.cat, t.name]));
console.log('tools:', ids.length); const byCat = {}; ids.forEach(([, c]) => (byCat[c] = (byCat[c] || 0) + 1)); console.log(byCat);
for (const [id, cat, name] of ids) {
  const before = errors.length; await page.evaluate((id) => { location.hash = '#/t/' + id; }, id); await page.waitForSelector('#toolbody *', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(250);
  const ok = await page.evaluate(() => !!document.querySelector('#toolbody') && document.querySelector('#toolbody').children.length > 0 && !document.querySelector('.errbox'));
  check(`${name} opens`, ok && errors.length === before, errors.slice(before).join(' | ').slice(0, 200));
}
await browser.close(); process.exit(summary() ? 1 : 0);
