import { launch, openTool, HTML } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(HTML);
const r = await page.evaluate(async () => {
  const out = {};
  try { const w = new Worker(URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' }))); out.blobWorker = await new Promise((res) => { w.onmessage = () => res('ok'); w.onerror = (e) => res('err ' + e.message); setTimeout(() => res('timeout'), 2000); }); } catch (e) { out.blobWorker = 'throw ' + e.message; }
  const lib = await W.lib('pdfjs'); out.src = lib.GlobalWorkerOptions.workerSrc;
  const { PDFDocument } = await W.lib('pdflib'); const res = await fetch('file:///home/user/layoff-tracker/wrangl/tests/fixtures/form.pdf').catch((e) => null);
  return out;
});
console.log(r);
await browser.close();
