import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// WRANGL_URL + WRANGL_LIVE_FILE: serve a downloaded copy of the live site under its real https origin (TLS stays verified; nothing else is fetched).
export const HTML = process.env.WRANGL_URL || 'file://' + path.join(root, 'dist/wrangl.html');
export const FIX = path.join(root, 'tests/fixtures');
export const OUT = path.join(root, 'tests/out');
fs.mkdirSync(OUT, { recursive: true });
export async function launch({ width = 1360, height = 900, dark = false, extra = {} } = {}) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', ...(extra.args || [])] });
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, colorScheme: dark ? 'dark' : 'light', ...extra.ctx });
  const external = [];
  if (process.env.WRANGL_URL) {
    const origin = new URL(process.env.WRANGL_URL).origin; const body = fs.readFileSync(process.env.WRANGL_LIVE_FILE);
    await ctx.route('**/*', (route) => { const u = route.request().url(); if (new URL(u).origin === origin) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body }); external.push(u); return route.abort(); });
  }
  const page = await ctx.newPage(); page.external = external;
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return { browser, ctx, page, errors };
}
export async function openTool(page, id) {
  await page.goto('about:blank');
  await page.goto(HTML + '#/t/' + id);
  await page.waitForSelector('#toolbody');
  await page.waitForTimeout(150);
}
/** click the dropzone and give it files */
export async function addFiles(page, files, sel = '.dz:not(.compact)') {
  const list = (Array.isArray(files) ? files : [files]).map((f) => (path.isAbsolute(f) ? f : path.join(FIX, f)));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(sel)]);
  await chooser.setFiles(list);
}
export async function runAndDownload(page, btnSel = '.action-wrap .btn.primary', { all = false, timeout = 60000 } = {}) {
  await page.click(btnSel);
  await page.waitForSelector('.res, .errbox', { timeout });
  if (await page.$('.errbox')) throw new Error('Tool error: ' + (await page.textContent('.errbox')));
  const outs = [];
  const n = await page.$$eval('.res-row', (r) => r.length);
  for (let i = 0; i < n; i++) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.res-row').nth(i).locator('button:has-text("Download")').click()]);
    const p = path.join(OUT, dl.suggestedFilename());
    await dl.saveAs(p); outs.push(p);
    if (!all) break;
  }
  return outs;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const failures = [];
export function check(name, cond, info = '') { if (cond) { pass++; console.log('  ✓', name); } else { fail++; failures.push(name); console.log('  ✗', name, info); } }
export function summary() { console.log(`\n${pass} passed, ${fail} failed`); if (fail) console.log('FAILED:', failures.join(' | ')); return fail; }
import { execFileSync } from 'node:child_process';
export function inspect(p, pw) { try { return JSON.parse(execFileSync('python3', [path.join(root, 'tests/pdfinfo.py'), p, ...(pw ? [pw] : [])], { encoding: 'utf8' })); } catch (e) { return { error: String(e.stderr || e.message).slice(-300) }; } }
