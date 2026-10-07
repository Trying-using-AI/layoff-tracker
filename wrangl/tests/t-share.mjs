import { launch, openTool, check, summary, OUT, HTML } from './lib.mjs';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const { browser, ctx, page: A, errors } = await launch({ width: 1300, height: 950, extra: { args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] } });
const only = process.argv[2];
const T = async (name, fn) => { if (only && !name.includes(only)) return; console.log('\n# ' + name); try { await fn(); } catch (e) { check(name + ' (exception)', false, e.message.slice(0, 500)); } };
await T('p2p send', async () => {
  const B = await ctx.newPage(); B.on('pageerror', (e) => errors.push('B ' + e.message));
  await openTool(A, 'p2p-share'); await openTool(B, 'p2p-share');
  await A.uncheck?.('input[type=checkbox]').catch(() => {}); await A.locator('label.chk').first().click(); await B.locator('label.chk').first().click(); // STUN off for sandbox
  await A.click('button:has-text("Start a connection")'); await A.waitForSelector('textarea[readonly]', { timeout: 15000 }); const offer = await A.inputValue('textarea[readonly]'); console.log('   offer length', offer.length);
  await B.click('button:has-text("Join with a code")'); await B.fill('textarea', offer); await B.click('button:has-text("Create reply code")'); await B.waitForSelector('textarea[readonly]', { timeout: 15000 }); const answer = await B.inputValue('textarea[readonly]');
  await A.fill('textarea:not([readonly])', answer); await A.click('button:has-text("Connect")');
  await A.waitForSelector('.p2p-live:not([hidden])', { timeout: 20000 }); await B.waitForSelector('.p2p-live:not([hidden])', { timeout: 20000 }); check('both sides connected', true);
  const codeA = await A.textContent('.p2p-status'), codeB = await B.textContent('.p2p-status'); const ma = /Security code ([0-9A-F-]+)/.exec(codeA), mb = /Security code ([0-9A-F-]+)/.exec(codeB); check('matching security codes', ma && mb && ma[1] === mb[1], `${ma && ma[1]} vs ${mb && mb[1]}`);
  // send a 3 MB random file from A → B
  const big = Buffer.alloc(3 * 1024 * 1024); for (let i = 0; i < big.length; i++) big[i] = (i * 31 + 7) & 255; fs.writeFileSync('tests/tmp/big.bin', big);
  const [ch] = await Promise.all([A.waitForEvent('filechooser'), A.click('.p2p-live .dz')]); await ch.setFiles(['tests/tmp/big.bin']);
  await B.waitForSelector('.p2p-row button:has-text("Download")', { timeout: 30000 }); const [dl] = await Promise.all([B.waitForEvent('download'), B.click('.p2p-row button:has-text("Download")')]); const p = OUT + '/received.bin'; await dl.saveAs(p);
  check('3 MB file identical', Buffer.compare(fs.readFileSync(p), big) === 0);
  await A.fill('.p2p-live input.in', 'hello from A'); await A.keyboard.press('Enter'); await B.waitForSelector('.msgl.them:has-text("hello from A")'); check('chat message delivered', true);
  await A.screenshot({ path: OUT + '/p2p.png' });
});
await T('whiteboard', async () => {
  const B = await ctx.newPage(); await openTool(A, 'whiteboard'); await openTool(B, 'whiteboard');
  await A.click('summary:has-text("Draw together")'); await B.click('summary:has-text("Draw together")'); await A.fill('input[placeholder="room name"]', 'testroom'); await B.fill('input[placeholder="room name"]', 'testroom'); await A.click('button:has-text("Join room on this device")'); await B.click('button:has-text("Join room on this device")');
  const bb = await A.locator('.wb-cv').boundingBox(); await A.mouse.move(bb.x + 200, bb.y + 200); await A.mouse.down(); for (let i = 0; i < 25; i++) await A.mouse.move(bb.x + 200 + i * 14, bb.y + 200 + Math.sin(i / 3) * 60); await A.mouse.up();
  await A.waitForTimeout(600);
  const dark = async (pg) => pg.evaluate(() => { const c = document.querySelector('.wb-cv'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 80 && d[i + 1] < 80) n++; return n; });
  const na = await dark(A), nb = await dark(B); console.log('   dark px A/B', na, nb); check('stroke drawn locally', na > 200); check('stroke synced to the other tab', nb > 200 && Math.abs(na - nb) < na * 0.1);
  await A.screenshot({ path: OUT + '/wb.png' });
  await B.click('button[aria-label="Clear board"]'); await B.click('.modal button:has-text("Clear")'); await A.waitForTimeout(500); check('clear synced', (await dark(A)) === 0);
});
check('no console errors', errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, errors.join('\n')); await browser.close(); process.exit(summary() ? 1 : 0);
