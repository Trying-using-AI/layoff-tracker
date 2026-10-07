// Builds one self-contained HTML file: dist/wrangl.html
// Everything (libraries, fonts, icons, app code) is inlined so it works offline from file://
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => path.join(root, 'node_modules', p);
const read = (p, enc) => fs.readFileSync(p, enc);
const args = new Set(process.argv.slice(2));

// ---------- packed libraries (gzip + base64, decompressed lazily in the browser) ----------
const LIBS = {
  pdflib:   { file: nm('pdf-lib/dist/pdf-lib.min.js') },
  pdfjs:    { file: nm('pdfjs-dist/build/pdf.min.js') },
  pdfworker:{ file: nm('pdfjs-dist/build/pdf.worker.min.js') },
  jszip:    { file: nm('jszip/dist/jszip.min.js') },
  marked:   { file: nm('marked/lib/marked.umd.js') },
  mammoth:  { file: nm('mammoth/mammoth.browser.min.js') },
  xlsx:     { file: nm('xlsx/dist/xlsx.mini.min.js') },
  qr:       { file: nm('qrcode-generator/dist/qrcode.js') },
  pptxgen:  { file: nm('pptxgenjs/dist/pptxgen.bundle.js') },
  qpdf:     { file: nm('@neslinesli93/qpdf-wasm/dist/qpdf.js') },
  qpdfwasm: { file: nm('@neslinesli93/qpdf-wasm/dist/qpdf.wasm') },
  tesseract:{ file: nm('tesseract.js/dist/tesseract.min.js') },
  tessworker:{ file: nm('tesseract.js/dist/worker.min.js') },
  tesscore: { file: nm('tesseract.js-core/tesseract-core-simd-lstm.wasm.js') },
  tessdata: { file: nm('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), raw: true },
};
// handwriting fonts (latin subset, woff2) — lazily registered in the page
for (const f of ['caveat', 'kalam', 'homemade-apple', 'reenie-beanie', 'shadows-into-light', 'patrick-hand', 'indie-flower', 'dancing-script', 'la-belle-aurore', 'covered-by-your-grace']) {
  LIBS['hw-' + f] = { file: nm(`@fontsource/${f}/files/${f}-latin-400-normal.woff2`), raw: true };
}
// optional extras (added if present)
const extra = path.join(root, 'vendor');
if (fs.existsSync(extra)) {
  for (const f of fs.readdirSync(extra)) {
    const name = f.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    LIBS['x' + name] = { file: path.join(extra, f), raw: /\.gz$/.test(f) };
  }
}

let libsHtml = '';
let libBytes = 0;
for (const [name, o] of Object.entries(LIBS)) {
  if (!fs.existsSync(o.file)) { console.warn('! missing lib', name, o.file); continue; }
  let buf = read(o.file);
  const gz = o.raw ? buf : zlib.gzipSync(buf, { level: 9 });
  const b64 = gz.toString('base64');
  libBytes += b64.length;
  libsHtml += `<script type="application/x-wrangl-lib" id="lib-${name}"${o.raw ? ' data-raw="1"' : ''}>${b64}</script>\n`;
}

// ---------- fonts ----------
const font = (p) => 'data:font/woff2;base64,' + read(p).toString('base64');
const fontsCss = `
@font-face{font-family:'Bricolage Grotesque';font-style:normal;font-weight:200 800;font-display:swap;src:url(${font(nm('@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2'))}) format('woff2');}
@font-face{font-family:'Instrument Sans';font-style:normal;font-weight:400 700;font-display:swap;src:url(${font(nm('@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2'))}) format('woff2');}
@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:100 800;font-display:swap;src:url(${font(nm('@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'))}) format('woff2');}
`;

// ---------- app JS / CSS ----------
const jsDir = path.join(root, 'src/js');
const jsFiles = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort();
let js = jsFiles.map((f) => `\n// ===== ${f} =====\n` + read(path.join(jsDir, f), 'utf8')).join('\n');

const cssDir = path.join(root, 'src/css');
const css = fs.readdirSync(cssDir).filter((f) => f.endsWith('.css')).sort().map((f) => read(path.join(cssDir, f), 'utf8')).join('\n');

// ---------- icons (lucide, ISC) : include every quoted token that is an icon name ----------
const iconDir = nm('lucide-static/icons');
const iconNames = new Set(fs.readdirSync(iconDir).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)));
const used = new Set(['file', 'file-text', 'x', 'check', 'chevron-down']);
for (const m of js.matchAll(/['"`]([a-z0-9]+(?:-[a-z0-9]+)*)['"`]/g)) if (iconNames.has(m[1])) used.add(m[1]);
const iconsJson = {};
for (const n of [...used].sort()) {
  const svg = read(path.join(iconDir, n + '.svg'), 'utf8');
  const inner = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '').replace(/\s+/g, ' ').trim();
  iconsJson[n] = inner;
}

if (/<\/script/i.test(js)) { console.error('app JS contains </script — escape it'); process.exit(1); }

let tpl = read(path.join(root, 'src/template.html'), 'utf8');
const logo = read(path.join(root, 'src/logo.svg'), 'utf8').replace(/\s+/g, ' ').trim();
const faviconUri = 'data:image/svg+xml;base64,' + Buffer.from(logo).toString('base64');
tpl = tpl
  .replace('/*@FONTS@*/', () => fontsCss)
  .replace('/*@CSS@*/', () => css)
  .replace('<!--@LIBS@-->', () => libsHtml)
  .replace('/*@ICONS@*/', () => 'const ICONS=' + JSON.stringify(iconsJson) + ';')
  .replace('/*@JS@*/', () => js)
  .replace('@FAVICON@', () => faviconUri)
  .replace('@LOGO@', () => logo);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist/wrangl.html');
fs.writeFileSync(out, tpl);
console.log(`built ${path.relative(root, out)}  ${(tpl.length / 1048576).toFixed(2)} MB  (libs ${(libBytes / 1048576).toFixed(2)} MB, icons ${used.size}, js files ${jsFiles.length})`);
