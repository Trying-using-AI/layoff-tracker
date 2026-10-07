# Wrangl — free PDF & file tools that never leave your device

**Wrangl** is a single self-contained HTML file with **70 document tools** — merge, split, compress, edit, sign,
redact, OCR, convert to/from Word/Excel/PowerPoint/EPUB, invoices, whiteboard, P2P file sharing and more.
Open `dist/wrangl.html` in any modern browser (Chrome, Edge, Firefox, Safari). No server, no account, no uploads.
It works offline: the PDF engine, qpdf (WebAssembly), Tesseract OCR with the English model, fonts and icons are all inside the file.

## Build from source

```bash
npm install
npm run build        # → dist/wrangl.html (~9 MB, everything inlined)
npm test             # see tests/ (Playwright + a Python fixture generator)
```

* `src/js/*.js` – app code, concatenated in file-name order (`00-core` … `99-boot`)
* `src/css/*.css`, `src/template.html`, `src/logo.svg`
* `scripts/build.mjs` – packs libraries (gzip + base64, unpacked lazily in the browser), fonts and icons
* `tests/` – `make_fixtures.py` generates sample files; `t-*.mjs` drive the real UI in headless Chromium

## Hosting on GitHub Pages

`.github/workflows/pages.yml` publishes `wrangl/dist/wrangl.html` as the site's `index.html` whenever `wrangl/dist/` changes on `main`
(or when you run the workflow by hand). One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
The workflow ships the committed `dist/wrangl.html`, so run `npm run build` and commit the result after changing anything in `src/`.
The site is served from `https://<owner>.github.io/<repo>/`.

## Architecture in one minute

| Piece | What it does |
|---|---|
| `W.simpleTool({...})` | Declarative tool: file list → options form → `run(items, opts, ctx)` → results card. Also what the Workflow builder chains. |
| `W.Editor` | Visual PDF editor used by **Edit**, **Sign**, **Redact** and **Auto-redact**. |
| `W.htmlToPdf` | Lays HTML out with the browser, then replays it as *vector* PDF (selectable text, links, page breaks). Powers Word/Excel/PowerPoint/EPUB/Markdown/HTML/CSV/resume/invoice/receipt conversions. |
| `W.pdf.structure` | Reading-order analysis (headings, paragraphs, lists, tables) behind PDF → Word/HTML/Excel/EPUB. |
| `W.ocr` | Tesseract.js running from an inlined worker blob (no network for English). |
| `W.Peer` | Serverless WebRTC pairing (copy/paste or QR codes) used by *Send files directly* and *Whiteboard*. |

## Honest limits

* Converters from Office formats (Word, Excel, PowerPoint, EPUB) rebuild the document: text, tables, pictures and basic shapes
  are kept, but fonts, columns, charts, SmartArt and animations are simplified.
* PDF → Word/Excel/PowerPoint infers structure from text positions; complex layouts can need tidying.
* "Remove watermark" works on watermarks stored as separate text / marked layers / stamp objects — not on marks baked into a scan.
* Remove background and image-watermark removal are classical algorithms (no AI model): best on plain backgrounds.
* "Chat with PDFs" and "Summarize" work on-device (search + extractive); an optional bring-your-own-key AI mode sends text to the provider you pick.
* Audio transcription uses an optional Whisper model downloaded once from a public CDN; dictation uses your browser's speech service.
* The password/permissions features use standard PDF encryption (AES-256 via qpdf).

## Licences of bundled open-source components

pdf-lib (MIT), PDF.js (Apache-2.0), qpdf-wasm (Apache-2.0/ISC), Tesseract.js & core (Apache-2.0), JSZip (MIT), mammoth (BSD-2),
SheetJS CE (Apache-2.0), marked (MIT), PptxGenJS (MIT), qrcode-generator (MIT), Lucide icons (ISC), and the Bricolage Grotesque,
Instrument Sans, JetBrains Mono and handwriting typefaces (SIL OFL).
