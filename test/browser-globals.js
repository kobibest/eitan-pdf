/*
 * המנוע במצב "דפדפן": טוען את src/core כסקריפטים רגילים (בלי module / require),
 * בדיוק כמו ש-index.html של גרסת Windows ושל אפליקציית האנדרואיד (WebView) טוענים אותו,
 * ובונה מסמך עם טקסט עברי דרך window.PdfOps.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const SCRIPTS = [
  'node_modules/pdf-lib/dist/pdf-lib.min.js',
  'node_modules/@pdf-lib/fontkit/dist/fontkit.umd.min.js',
  'node_modules/bidi-js/dist/bidi.min.js',
  'src/core/hebrew.js',
  'src/core/textedit.js',
  'src/core/ops.js',
  'src/core/redact.js',
  'src/core/compress.js',
  'src/core/search.js',
];

async function run(fonts) {
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout, TextEncoder, TextDecoder, atob, btoa, structuredClone,
    crypto: require('crypto').webcrypto,
  });
  vm.runInContext('var self = globalThis; var window = globalThis;', ctx);
  for (const rel of SCRIPTS) vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });

  assert.strictEqual(vm.runInContext('typeof module', ctx), 'undefined');
  for (const name of ['PDFLib', 'fontkit', 'HebrewPDF', 'TextEdit', 'PdfOps', 'Redact', 'Compress', 'PdfSearch']) {
    assert.ok(vm.runInContext(`typeof ${name}`, ctx) === 'object', `חסר ${name} במצב דפדפן`);
  }
  // מערכים נוצרים בתוך ההקשר — כמו בדפדפן אמיתי
  const bytes = vm.runInContext('(b) => new Uint8Array(b)', ctx);
  const src = await vm.runInContext(`(async () => {
    const d = await PDFLib.PDFDocument.create();
    d.addPage([595, 842]);
    return d.save();
  })()`, ctx);
  const out = await vm.runInContext('PdfOps.buildDocument', ctx)(
    { a: src },
    [{ src: 'a', index: 0 }],
    { 'a:0': [{ type: 'text', x: 40, y: 40, w: 300, size: 18, color: '#0B2A82', text: 'נבדק ב-WebView (2026)', align: 'right' }] },
    {},
    { fonts: { regular: bytes(fonts.regular), bold: bytes(fonts.bold) } },
  );
  assert.ok(out.length > 1000);
  assert.strictEqual(vm.runInContext('HebrewPDF.toVisual', ctx)('שלום 123'), '123 םולש');
  return Buffer.from(out);
}

module.exports = { run };
