/* בדיקות אוטומטיות למנוע: node test/run-tests.js [תיקיית פלט] */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { PDFDocument, degrees, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const H = require('../src/core/hebrew.js');
const Ops = require('../src/core/ops.js');

const OUT = process.argv[2] || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const fonts = {
  regular: fs.readFileSync(path.join(__dirname, '../assets/fonts/Alef-Regular.ttf')),
  bold: fs.readFileSync(path.join(__dirname, '../assets/fonts/Alef-Bold.ttf')),
};
let passed = 0;
function ok(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log('✓', name); });
}

async function makeDoc(label, n, rotation) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < n; i++) {
    const p = d.addPage([595, 842]);
    p.drawText(`${label} page ${i + 1}`, { x: 50, y: 780, size: 28, font: f });
    if (rotation) p.setRotation(degrees(rotation));
  }
  return d.save();
}

async function makeForm() {
  const d = await PDFDocument.create();
  const p = d.addPage([595, 842]);
  const form = d.getForm();
  const t = form.createTextField('full_name');
  t.addToPage(p, { x: 300, y: 700, width: 250, height: 26 });
  const t2 = form.createTextField('notes');
  t2.enableMultiline();
  t2.addToPage(p, { x: 50, y: 520, width: 500, height: 120 });
  const c = form.createCheckBox('agree');
  c.addToPage(p, { x: 520, y: 650, width: 18, height: 18 });
  return d.save();
}

(async () => {
  await ok('bidi: מספרים נשארים משמאל לימין בתוך עברית', () => {
    assert.strictEqual(H.toVisual('המחיר 1,250.50 ש"ח'), 'ח"ש 1,250.50 ריחמה');
    assert.strictEqual(H.toVisual('טלפון 050-1234567'), '050-1234567 ןופלט');
  });
  await ok('bidi: סוגריים משתקפים', () => {
    assert.strictEqual(H.toVisual('(שלום)'), '(םולש)');
  });
  await ok('bidi: ניקוד נשאר צמוד לאות', () => {
    assert.strictEqual(H.toVisual('שָׁלוֹם'), 'םוֹלשָׁ');
  });
  await ok('bidi: אנגלית בלבד לא משתנה', () => {
    assert.strictEqual(H.toVisual('Hello 123'), 'Hello 123');
  });
  await ok('טווחי עמודים', () => {
    assert.deepStrictEqual(Ops.parseRanges('1-3, 5, 8-', 9), [[0, 1, 2], [4], [7, 8]]);
    assert.throws(() => Ops.parseRanges('4-2', 9), /מחוץ/);
    assert.deepStrictEqual(Ops.chunk(5, 2), [[0, 1], [2, 3], [4]]);
  });

  const a = await makeDoc('A', 3);
  const b = await makeDoc('B', 2, 90);
  const form = await makeForm();

  await ok('איחוד + סידור + סיבוב + מחיקה + עמוד ריק', async () => {
    const pages = [
      { src: 'b', index: 1 }, { src: 'a', index: 0, rotate: 90 }, { src: 'blank', key: 'blank:1' },
      { src: 'a', index: 2 }, { src: 'b', index: 0 },
    ];
    const out = await Ops.buildDocument({ a, b }, pages, {}, {}, { fonts });
    const d = await PDFDocument.load(out);
    assert.strictEqual(d.getPageCount(), 5);
    assert.strictEqual(d.getPage(1).getRotation().angle, 90);
    assert.strictEqual(d.getPage(0).getRotation().angle, 90);
    fs.writeFileSync(path.join(OUT, 'merge.pdf'), out);
  });

  await ok('חותמות טקסט/חתימה בעמוד רגיל ובעמוד מסובב', async () => {
    const sig = fs.readFileSync(path.join(__dirname, 'fixtures/signature.png'));
    const stampText = { type: 'text', x: 40, y: 40, w: 300, size: 20, color: '#1a3d8f', text: 'נחתם ב-02/11/2026 בשעה 10:30', align: 'right' };
    const stampSig = { type: 'image', x: 380, y: 120, w: 160, h: 60, image: 'data:image/png;base64,' + sig.toString('base64') };
    const pages = [{ src: 'a', index: 0 }, { src: 'b', index: 0 }];
    const stamps = { 'a:0': [stampText, stampSig], 'b:0': [{ ...stampText }, { ...stampSig }] };
    const out = await Ops.buildDocument({ a, b }, pages, stamps, {}, { fonts });
    fs.writeFileSync(path.join(OUT, 'stamps.pdf'), out);
  });

  await ok('מילוי טופס בעברית — ערך לוגי נשמר, מראה חזותי', async () => {
    const fields = await Ops.getFormFields(form);
    assert.deepStrictEqual(fields.map((f) => f.name), ['full_name', 'notes', 'agree']);
    assert.strictEqual(fields[0].page, 0);
    const values = { full_name: 'קובי איתן', notes: 'הלוואה של 850,000 ש"ח ל-25 שנה (מסלול פריים)\nשורה שנייה', agree: true };
    const out = await Ops.buildDocument({ f: form }, [{ src: 'f', index: 0 }], {}, { f: values }, { fonts });
    const back = await Ops.getFormFields(out);
    assert.strictEqual(back[0].value, 'קובי איתן');
    assert.strictEqual(back[2].value, true);
    fs.writeFileSync(path.join(OUT, 'form-live.pdf'), out);
    const flat = await Ops.buildDocument({ f: form }, [{ src: 'f', index: 0 }], {}, { f: values }, { fonts, flattenForms: true });
    assert.strictEqual((await Ops.getFormFields(flat)).length, 0);
    fs.writeFileSync(path.join(OUT, 'form-flat.pdf'), flat);
  });

  await ok('סימן מים + מספור עמודים בעברית', async () => {
    const pages = [{ src: 'a', index: 0 }, { src: 'b', index: 0 }, { src: 'a', index: 1 }];
    const out = await Ops.buildDocument({ a, b }, pages, {}, {}, {
      fonts, watermark: { text: 'טיוטה — לא לשימוש', size: 54 }, pageNumbers: { enabled: true, position: 'bottom-center' },
    });
    fs.writeFileSync(path.join(OUT, 'watermark.pdf'), out);
  });

  await ok('פיצול לפי טווחים', async () => {
    const parts = await Ops.splitDocument(a, Ops.parseRanges('1-2,3', 3));
    assert.strictEqual(parts.length, 2);
    assert.strictEqual((await PDFDocument.load(parts[0])).getPageCount(), 2);
  });

  await ok('תמונות ל-PDF', async () => {
    const png = fs.readFileSync(path.join(__dirname, 'fixtures/signature.png'));
    const out = await Ops.imagesToPdf([{ bytes: png }, { bytes: png }]);
    assert.strictEqual((await PDFDocument.load(out)).getPageCount(), 2);
  });

  console.log(`\n${passed} בדיקות עברו. קבצי פלט: ${OUT}`);
})().catch((e) => { console.error('✗', e); process.exit(1); });
