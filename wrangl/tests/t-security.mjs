import { launch, openTool, addFiles, runAndDownload, check, summary, inspect, OUT } from './lib.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const { browser, page, errors } = await launch({ width: 1400, height: 1000 });
const only = process.argv[2];
const T = async (name, fn) => { if (only && !name.includes(only)) return; console.log('\n# ' + name); try { await fn(); } catch (e) { check(name + ' (exception)', false, e.message.slice(0, 500)); } };
const raw = (p) => execFileSync('pdftotext', ['-layout', p, '-'], { encoding: 'utf8' });
await T('encrypt', async () => {
  await openTool(page, 'encrypt'); await addFiles(page, 'a.pdf'); await page.fill('#f-pw', 'Sup3r-secret!'); await page.fill('#f-pw2', 'Sup3r-secret!');
  const [o] = await runAndDownload(page); const b = fs.readFileSync(o); check('has /Encrypt', b.includes('/Encrypt'));
  const i = inspect(o, 'Sup3r-secret!'); check('opens with password, 3 pages', i.n === 3 && i.pages[0].text === 'A1', JSON.stringify(i).slice(0, 150)); check('wrong password fails', inspect(o, 'nope').decrypted === false);
  const v = execFileSync('python3', ['-c', `import pypdf;r=pypdf.PdfReader('${o}');print(r.trailer['/Encrypt'].get('/V'), r.trailer['/Encrypt'].get('/R'))`], { encoding: 'utf8' }); check('AES-256 (V5 R6)', /^5 6/.test(v), v);
});
await T('encrypt mismatch', async () => { await openTool(page, 'encrypt'); await addFiles(page, 'a.pdf'); await page.fill('#f-pw', 'abc'); await page.fill('#f-pw2', 'abd'); await page.click('.action-wrap .btn.primary'); await page.waitForTimeout(300); check('mismatch toast, no result', !(await page.$('.res')) && /match/.test(await page.textContent('#toasts'))); });
await T('remove-password', async () => {
  await openTool(page, 'remove-password'); await addFiles(page, 'locked.pdf'); await page.waitForSelector('.modal input[type=password]');
  await page.fill('.modal input[type=password]', 'wrong'); await page.click('.modal button:has-text("Unlock")'); await page.waitForTimeout(500);
  check('wrong pw asks again', !!(await page.$('.modal input[type=password]')));
  await page.fill('.modal input[type=password]', 'secret123'); await page.click('.modal button:has-text("Unlock")'); await page.waitForSelector('.fl-row');
  const [o] = await runAndDownload(page); const i = inspect(o); check('unlocked, no encryption', !i.encrypted && i.n === 3 && i.pages[0].text === 'A1', JSON.stringify(i).slice(0, 120));
});
await T('unlock restrictions', async () => {
  await openTool(page, 'unlock'); await addFiles(page, 'restricted.pdf'); await page.waitForSelector('.fl-row');
  const [o] = await runAndDownload(page); const i = inspect(o); check('now unencrypted', !i.encrypted && i.n === 3, JSON.stringify(i).slice(0, 100));
});
await T('auto-redact', async () => {
  await openTool(page, 'auto-redact'); await addFiles(page, 'pii.pdf'); await page.waitForSelector('.pii-counts .chip', { timeout: 20000 });
  const chips = await page.$$eval('.pii-counts .chip', (c) => c.map((x) => x.textContent)); console.log('   found:', chips.join(' | '));
  check('email found', chips.some((c) => /Email.*1/.test(c))); check('aadhaar found', chips.some((c) => /Aadhaar.*1/.test(c))); check('PAN found', chips.some((c) => /PAN.*1/.test(c))); check('card found', chips.some((c) => /card.*1/i.test(c))); check('SSN found', chips.some((c) => /Social.*1/.test(c))); check('phone found', chips.some((c) => /Phone.*1/.test(c)));
  await page.screenshot({ path: OUT + '/autoredact.png' });
  const [o] = await runAndDownload(page, '.ed-save .btn.primary', { timeout: 90000 }); const t = raw(o);
  check('email gone', !/priya\.sharma/.test(t)); check('PAN gone', !/ABCDE1234F/.test(t)); check('card gone', !/4111/.test(t)); check('SSN gone', !/123-45-6789/.test(t)); check('safe text kept', /Nothing sensitive/.test(t) && /Customer record/.test(t), t);
});
await T('privacy scan', async () => {
  await openTool(page, 'privacy-scan'); await addFiles(page, 'risky.pdf'); await page.waitForSelector('.scan-card');
  const txt = await page.textContent('.scan-card'); console.log('   ', txt.replace(/\s+/g, ' ').slice(0, 300)); check('flags JavaScript', /JavaScript/.test(txt)); check('flags attachment', /secret\.txt/.test(txt)); check('flags personal data', /Personal data|Email/.test(txt)); check('flags metadata', /Jane Doe/.test(txt));
  await page.screenshot({ path: OUT + '/privacy.png' });
  const [o] = await runAndDownload(page, 'button:has-text("Create cleaned copy")'.replace(/.*/, '.card .btn.primary')); 
});
await T('fingerprint', async () => {
  await openTool(page, 'fingerprint'); await addFiles(page, ['a.pdf', 'b.pdf']); await page.waitForSelector('.fp', { timeout: 20000 }); await page.waitForTimeout(800);
  const t = await page.textContent('.fp'); const want = crypto.createHash('sha256').update(fs.readFileSync('tests/fixtures/a.pdf')).digest('hex'); check('sha256 matches node', t.includes(want)); const md5 = crypto.createHash('md5').update(fs.readFileSync('tests/fixtures/a.pdf')).digest('hex'); check('md5 matches', t.includes(md5));
  await page.fill('input[placeholder^="Paste an expected"]', want); await page.waitForTimeout(1500); check('verify match chip', /matches/.test(await page.textContent('.fp')));
  check('comparison shows different', /different/.test(await page.textContent('#toolbody')));
});
check('no console errors', errors.filter((e) => !/Failed to load resource|can't find startxref|invalid password|Incorrect password|Error: /.test(e)).length === 0, errors.join('\n'));
await browser.close();
process.exit(summary() ? 1 : 0);
