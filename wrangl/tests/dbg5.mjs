import { launch, HTML } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(HTML);
const r = await page.evaluate(async () => {
  const td = new TextDecoder(); const workerText = td.decode(await W.libBytes('tessworker')); const coreText = td.decode(await W.libBytes('tesscore'));
  const out = {};
  out.coreHead = coreText.slice(0, 80); out.workerHead = workerText.slice(0, 60); out.coreLen = coreText.length; out.workerLen = workerText.length;
  // try the eval of core in main thread (global scope)
  try { (0, eval)(coreText); out.coreEval = typeof TesseractCore; } catch (e) { out.coreEval = 'ERR ' + e.message; }
  // try worker: preamble + worker
  const mk = (src) => new Promise((res) => { const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))); w.onerror = (e) => res('err line ' + e.lineno + ':' + e.colno + ' ' + e.message); setTimeout(() => res('no error'), 1500); });
  out.workerOnly = await mk(workerText);
  out.preambleOnly = await mk('const __core = ' + JSON.stringify(coreText) + ';\nconsole.log("ok");');
  return out;
});
console.log(r);
await browser.close();
