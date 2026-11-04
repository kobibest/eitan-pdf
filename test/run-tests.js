/* בדיקות אוטומטיות למנוע: node test/run-tests.js [תיקיית פלט] */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { PDFDocument, degrees, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const H = require('../src/core/hebrew.js');
const Ops = require('../src/core/ops.js');
const T = require('../src/core/textedit.js');
const P = require('pdf-lib');
const DS = require('../src/core/digisig.js');

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

  await ok('סימון V / X בעמוד רגיל ובעמוד מסובב', async () => {
    const marks = [
      { type: 'mark', shape: 'check', x: 60, y: 60, w: 16, h: 16, color: '#1B2430' },
      { type: 'mark', shape: 'x', x: 100, y: 60, w: 16, h: 16, color: '#C23A2E' },
      { type: 'mark', shape: 'check', x: 140, y: 50, w: 40, h: 40, color: '#1F35B5' },
    ];
    const pages = [{ src: 'a', index: 0 }, { src: 'a', index: 1, rotate: 90 }];
    const out = await Ops.buildDocument({ a }, pages, { 'a:0': marks, 'a:1': marks.map((m) => ({ ...m })) }, {}, { fonts });
    assert.strictEqual((await PDFDocument.load(out)).getPageCount(), 2);
    fs.writeFileSync(path.join(OUT, 'marks.pdf'), out);
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


  /* ---------- עריכת טקסט קיים ---------- */

  const FIX = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n));
  const plex = {
    regular: fs.readFileSync(path.join(__dirname, '../assets/fonts/IBMPlexSansHebrew-Regular.ttf')),
    bold: fs.readFileSync(path.join(__dirname, '../assets/fonts/IBMPlexSansHebrew-Bold.ttf')),
  };
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  async function linesOf(bytes, pageIdx) {
    const d = await PDFDocument.load(bytes);
    const a = T.analyzePage(d, d.getPage(pageIdx));
    const lines = T.groupLines(a.glyphs);
    return lines.map((L) => ({ text: T.lineText(L, lines).text, box: L.box.map((v) => v.toFixed(1)).join(','), ok: L.ok }));
  }

  const editFonts = { plex, alef: fonts };

  /** יצירת פריט עריכה לשורה, כפי שהממשק יעשה */
  async function makeEdit(bytes, pageIdx, lineIdx, text, extra) {
    const d = await PDFDocument.load(bytes);
    const lines = T.groupLines(T.analyzePage(d, d.getPage(pageIdx)).glyphs);
    return { id: 'e' + lineIdx, ...T.editFromLine(lines[lineIdx], lines), text, ...(extra || {}) };
  }

  /** עריכה דרך המסלול האמיתי של שמירה: buildDocument עם פריטי edit */
  async function replaceLine(bytes, pageIdx, lineIdx, text, extra) {
    const d = await PDFDocument.load(bytes);
    const n = d.getPageCount();
    const e = await makeEdit(bytes, pageIdx, lineIdx, text, extra);
    const pages = Array.from({ length: n }, (_, i) => ({ src: 's', index: i }));
    return Ops.buildDocument({ s: bytes }, pages, { [`s:${pageIdx}`]: [e] }, {}, { fonts, editFonts });
  }

  /** בודק: הישנה נעלמה, החדשה נקראת בסדר לוגי נכון, כל שאר השורות זהות (טקסט ומיקום), pdf.js פותח */
  async function checkEdit(bytes, pageIdx, lineIdx, text, extra) {
    const before = await linesOf(bytes, pageIdx);
    const out = await replaceLine(bytes, pageIdx, lineIdx, text, extra);
    const after = await linesOf(out, pageIdx);
    const others = before.filter((_, i) => i !== lineIdx).map((l) => l.text + '|' + l.box);
    const afterKeys = after.map((l) => l.text + '|' + l.box);
    for (const o of others) assert.ok(afterKeys.includes(o), 'שורה אחרת השתנתה: ' + o);
    const oldKey = before[lineIdx].text + '|' + before[lineIdx].box;
    assert.ok(!afterKeys.includes(oldKey), 'השורה הישנה עדיין בקובץ: ' + before[lineIdx].text);
    assert.ok(after.some((l) => l.text === text), 'השורה החדשה לא נקראת נכון: ' + text + '\n' + after.map((l) => l.text).join('\n'));
    const doc = await pdfjs.getDocument({ data: new Uint8Array(out), verbosity: 0 }).promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i);
      await pg.getTextContent();
      await pg.getOperatorList();
    }
    await doc.destroy();
    return out;
  }

  await ok('עריכה: המרה מחזותי ללוגי והלוך-חזור', () => {
    for (const s of ['המחיר 1,250.50 ש"ח', 'טלפון 050-1234567 (נייד)', 'שלום world 2026', 'שָׁלוֹם', 'Hello 123', 'סעיף 3(ב) להסכם']) {
      const v = H.toVisual(s);
      assert.strictEqual(H.toLogical(v), s);
      assert.ok(H.roundTrips(v, s));
    }
  });

  await ok('עריכה: חילוץ שורות בסדר לוגי — החוזה שלנו, LibreOffice ו-Chromium', async () => {
    const c = await linesOf(FIX('הסכם שכירות.pdf'), 0);
    assert.strictEqual(c[0].text, 'הסכם שכירות בלתי מוגנת');
    assert.ok(c.some((l) => l.text.includes('6,450 ש"ח (שישה אלף')));
    // שורת המשך שמתחילה באמצע סוגריים
    assert.ok(c.some((l) => l.text === 'חדשים), וישולמו עד ה-5 בכל חודש בהעברה בנקאית.'), c.map((l) => l.text).join('\n'));
    const lo = await linesOf(FIX('libreoffice-letter.pdf'), 0);
    assert.ok(lo.some((l) => l.text === 'לכבוד: משרד עו"ד כהן ושות\' (סניף ת"א)'), lo.map((l) => l.text).join('\n'));
    assert.ok(lo.some((l) => l.text === 'הנדון: חשבונית מס\' 2026/118 על סך 12,300.50 ₪'));
    assert.ok(lo.some((l) => l.text === 'בברכה, קובי איתן — Eitan M. Ltd'));
    const ch = await linesOf(FIX('chromium.pdf'), 0);
    assert.ok(ch.some((l) => l.text === 'טלפון 03-5551234 (משרד) או office@example.co.il'), ch.map((l) => l.text).join('\n'));
    assert.ok(ch.every((l) => l.ok));
  });

  await ok('עריכה: החלפת שורה בחוזה — השאר לא זז', async () => {
    const out = await checkEdit(FIX('הסכם שכירות.pdf'), 0, 2, 'דמי השכירות יעמדו על 6,950 ש"ח (כולל מע"מ) לחודש');
    fs.writeFileSync(path.join(OUT, 'edit-contract.pdf'), out);
  });

  await ok('עריכה: גופן מהמחשב — נכתב בו, ואם חסרות בו אותיות — ב-IBM Plex עם אזהרה', async () => {
    const src = FIX('הסכם שכירות.pdf');
    const d = await PDFDocument.load(src);
    const n = d.getPageCount();
    const pages = Array.from({ length: n }, (_, i) => ({ src: 's', index: i }));
    const fontsUsed = async (out) => {
      const doc = await PDFDocument.load(out);
      const names = [];
      doc.context.enumerateIndirectObjects().forEach(([, o]) => { const b = o.get && o.get(require('pdf-lib').PDFName.of('BaseFont')); if (b) names.push(String(b)); });
      return names.join(' ');
    };
    // "גופן מהמחשב" — כאן Alef, בשם משפחה אחר
    const sysFonts = { ...editFonts, 'sys:Test Family': { regular: fonts.regular, bold: fonts.bold } };
    const warn = [];
    const e = await makeEdit(src, 0, 2, 'דמי השכירות יעמדו על 7,000 ש"ח', { font: 'sys:Test Family' });
    const out = await Ops.buildDocument({ s: src }, pages, { 's:0': [e] }, {}, { fonts, editFonts: sysFonts, onWarning: (w) => warn.push(w) });
    assert.ok(/Alef/.test(await fontsUsed(out)), 'הגופן שנבחר לא הוטמע');
    assert.deepStrictEqual(warn, []);
    // תו שאין ב-Alef אבל יש ב-Plex (½) → כל השורה ב-Plex, עם אזהרה
    const e2 = await makeEdit(src, 0, 2, 'דמי השכירות: ½ מהסכום', { font: 'sys:Test Family' });
    const out2 = await Ops.buildDocument({ s: src }, pages, { 's:0': [e2] }, {}, { fonts, editFonts: sysFonts, onWarning: (w) => warn.push(w) });
    assert.ok(/Plex/.test(await fontsUsed(out2)), 'לא עבר ל-Plex');
    assert.strictEqual(warn.length, 1, warn.join('\n'));
    const after = await linesOf(out2, 0);
    assert.ok(after.some((l) => l.text === 'דמי השכירות: ½ מהסכום'), after.map((l) => l.text).join('\n'));
  });

  await ok('תיבת טקסט בגופן מהמחשב; בלי גופן — Alef', async () => {
    const d = await PDFDocument.create();
    d.addPage([595, 842]);
    const src = await d.save();
    const names = async (out) => {
      const doc = await PDFDocument.load(out);
      const n = [];
      doc.context.enumerateIndirectObjects().forEach(([, o]) => { const b = o.get && o.get(require('pdf-lib').PDFName.of('BaseFont')); if (b) n.push(String(b)); });
      return n.join(' ');
    };
    const box = (extra) => ({ 'a:0': [{ type: 'text', x: 40, y: 60, w: 300, size: 16, color: '#000000', text: 'שלום עולם', align: 'right', ...extra }] });
    const sysFonts = { ...editFonts, 'sys:My Font': plex };
    const out = await Ops.buildDocument({ a: src }, [{ src: 'a', index: 0 }], box({ font: 'sys:My Font' }), {}, { fonts, editFonts: sysFonts });
    assert.ok(/Plex/.test(await names(out)), await names(out)); // Alef מוטמע תמיד (גופן הבסיס)
    const out2 = await Ops.buildDocument({ a: src }, [{ src: 'a', index: 0 }], box({}), {}, { fonts, editFonts: sysFonts });
    assert.ok(!/Plex/.test(await names(out2)), await names(out2));
    // גופן שלא נטען (לא נמצא במחשב) → Alef
    const out3 = await Ops.buildDocument({ a: src }, [{ src: 'a', index: 0 }], box({ font: 'sys:Missing' }), {}, { fonts, editFonts });
    assert.ok(!/Plex/.test(await names(out3)), await names(out3));
  });

  await ok('גופני המחשב: זיהוי משפחה, משקל ועברית מתוך קובץ הגופן', () => {
    const SF = require('../src/main/sysfonts.js');
    const fk = require('@pdf-lib/fontkit');
    const r = SF.describe(fk, fs.readFileSync(path.join(__dirname, '..', 'assets', 'fonts', 'IBMPlexSansHebrew-Bold.ttf')));
    assert.strictEqual(r.family, 'IBM Plex Sans Hebrew');
    assert.ok(r.weight >= 700 && !r.italic && r.hebrew && r.latin, JSON.stringify(r));
    assert.strictEqual(SF.describe(fk, new Uint8Array([1, 2, 3])), null);
  });

  await ok('עריכה: קבצי LibreOffice ו-Chromium (פסקה מיושרת, ₪, אנגלית)', async () => {
    fs.writeFileSync(path.join(OUT, 'edit-lo.pdf'), await checkEdit(FIX('libreoffice-letter.pdf'), 0, 2, 'הנדון: חשבונית מס\' 2026/119 על סך 9,870 ₪ (מעודכן)'));
    await checkEdit(FIX('libreoffice-letter.pdf'), 0, 4, 'להסכם מיום 3.1.2026 ובכפוף לתנאים בנספח ג\'.');
    await checkEdit(FIX('libreoffice-html.pdf'), 0, 2, 'טלפון 03-7654321 (בית) או kobi@eitan-m.co.il');
    await checkEdit(FIX('chromium.pdf'), 0, 6, 'שקיבל אותה, למעט בלאי סביר.');
    fs.writeFileSync(path.join(OUT, 'edit-chromium.pdf'), await checkEdit(FIX('chromium.pdf'), 0, 4, 'English edited 2027'));
  });

  // קובץ עם המקרים הקשים: טופס משותף, עמוד מסובב, TJ עם שני טורים, ' ו-", פונט סטנדרטי, ניקוד
  const edge = await (async () => {
    const d = await PDFDocument.create();
    const font = await H.embedFont(d, fonts.regular, fontkit);
    const helv = await d.embedFont(StandardFonts.Helvetica);
    const enc = (t) => font.encodeText(H.toVisual(t)).toString();
    const form = d.context.register(d.context.flateStream(`BT /F1 14 Tf 20 20 Td ${enc('טקסט בתוך טופס משותף')} Tj ET`,
      { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 300, 60], Resources: { Font: { F1: font.ref } } }));
    const mk = (content, rot) => {
      const p = d.addPage([595, 842]);
      p.node.set(P.PDFName.of('Resources'), d.context.obj({ Font: { F1: font.ref, F2: helv.ref }, XObject: { X1: form } }));
      p.node.set(P.PDFName.of('Contents'), d.context.register(d.context.flateStream(content)));
      if (rot) p.setRotation(degrees(rot));
      return p;
    };
    mk(`q 1 0 0 1 100 700 cm /X1 Do Q q 1 0 0 1 100 500 cm /X1 Do Q BT /F1 12 Tf 100 400 Td ${enc('שורה רגילה בעמוד')} Tj ET`);
    mk('q 1 0 0 1 100 700 cm /X1 Do Q');
    mk(`BT /F1 16 Tf 0 1 -1 0 300 100 Tm ${enc('כותרת בעמוד מסובב 2026')} Tj ET`, 90);
    mk(`BT /F1 12 Tf 14 TL 60 700 Td [${enc('טור שמאל')} -20000 ${enc('טור ימין')}] TJ T* ${enc('שורה שנייה')} ' 2 0 ${enc('שורה שלישית עם ריווח')} " ET`);
    mk('BT /F2 12 Tf 60 700 Td (Standard font line) Tj ET');
    const p6 = d.addPage([595, 842]);
    H.drawText(p6, 'שָׁלוֹם עֲלֵיכֶם, מָה שְׁלוֹמְךָ?', { x: 60, y: 760, width: 475, size: 20, font });
    H.drawText(p6, 'שורה רגילה מתחת', { x: 60, y: 720, width: 475, size: 14, font });
    return d.save();
  })();

  await ok('עריכה: טופס (XObject) משותף — רק המופע שנערך משתנה, עמוד 2 לא נפגע', async () => {
    const out = await checkEdit(edge, 0, 0, 'טופס ערוך — רק המופע העליון');
    const p1 = await linesOf(out, 0);
    assert.strictEqual(p1.filter((l) => l.text === 'טקסט בתוך טופס משותף').length, 1);
    assert.deepStrictEqual((await linesOf(out, 1)).map((l) => l.text), ['טקסט בתוך טופס משותף']);
  });

  await ok('עריכה: עמוד מסובב, שני טורים ב-TJ אחד, אופרטורים \' ו-"', async () => {
    await checkEdit(edge, 2, 0, 'כותרת חדשה (גרסה 3)');
    const cols = await checkEdit(edge, 3, 1, 'ימין חדש');
    assert.ok((await linesOf(cols, 3)).some((l) => l.text === 'טור שמאל'));
    await checkEdit(edge, 3, 3, 'שלישית קצרה');
  });

  await ok('עריכה: פונט סטנדרטי בלי Widths וניקוד', async () => {
    const std = await linesOf(edge, 4);
    assert.ok(std[0].ok && std[0].text === 'Standard font line');
    await checkEdit(edge, 4, 0, 'Edited standard line');
    assert.strictEqual((await linesOf(edge, 5))[0].text, 'שָׁלוֹם עֲלֵיכֶם, מָה שְׁלוֹמְךָ?');
    await checkEdit(edge, 5, 0, 'בָּרוּךְ הַבָּא');
  });

  await ok('עריכה: יישור לפי השורות השכנות (ימין, שמאל, מרכז, פסקה מיושרת)', async () => {
    const al = async (b, li) => (await makeEdit(b, 0, li, 'x')).align;
    assert.strictEqual(await al(FIX('הסכם שכירות.pdf'), 3), 'right');
    assert.strictEqual(await al(FIX('הסכם שכירות.pdf'), 0), 'center');
    assert.strictEqual(await al(FIX('libreoffice-html.pdf'), 2), 'left'); // ב-LibreOffice HTML הפסקאות מיושרות לשמאל
    assert.strictEqual(await al(FIX('libreoffice-letter.pdf'), 3), 'right'); // שורה בפסקה מיושרת לשני הצדדים, עברית
    // השורה החדשה מתחילה באותו קצה שמאלי כמו המקור
    const out = await replaceLine(FIX('libreoffice-html.pdf'), 0, 2, 'טלפון חדש');
    const L = (await linesOf(out, 0)).find((l) => l.text === 'טלפון חדש');
    assert.ok(Math.abs(+L.box.split(',')[0] - 113.3) < 1.5, L.box);
  });

  await ok('עריכה: בלי שינוי בטקסט — הקובץ לא נוגע בשורה', async () => {
    const src = FIX('libreoffice-letter.pdf');
    const e = await makeEdit(src, 0, 2, null);
    e.text = e.original;
    const out = await Ops.buildDocument({ s: src }, [{ src: 's', index: 0 }], { 's:0': [e] }, {}, { fonts, editFonts });
    const a = await PDFDocument.load(src), b = await PDFDocument.load(out);
    const bytesOf = (d) => {
      const c = d.context.lookup(d.getPage(0).node.get(P.PDFName.of('Contents')));
      const list = c instanceof P.PDFArray ? c.asArray().map((r) => d.context.lookup(r)) : [c];
      return Buffer.concat(list.map((st) => Buffer.from(st instanceof P.PDFRawStream ? P.decodePDFRawStream(st).decode() : st.getContents())));
    };
    assert.ok(bytesOf(a).equals(bytesOf(b)));
    // שינוי עיצוב בלבד (בלי שינוי טקסט) כן מחליף את השורה
    const r = await makeEdit(src, 0, 2, null);
    Object.assign(r, { text: r.original, restyled: true, bold: true });
    const out2 = await Ops.buildDocument({ s: src }, [{ src: 's', index: 0 }], { 's:0': [r] }, {}, { fonts, editFonts });
    assert.ok(!bytesOf(await PDFDocument.load(out2)).equals(bytesOf(a)));
    assert.ok((await linesOf(out2, 0)).some((l) => l.text === r.original));
  });

  await ok('עריכה: כמה שורות באותו עמוד, מחיקת שורה, וגיבוי לפונט לא נתמך', async () => {
    const src = FIX('הסכם שכירות.pdf');
    const e1 = await makeEdit(src, 0, 2, 'שורה ראשונה חדשה');
    const e2 = await makeEdit(src, 0, 4, ''); // מחיקה
    const e3 = await makeEdit(src, 0, 6, 'שורה שלישית חדשה (2027)');
    const out = await Ops.buildDocument({ s: src }, [0, 1, 2].map((i) => ({ src: 's', index: i })), { 's:0': [e1, e2, e3] }, {}, { fonts, editFonts });
    const t = (await linesOf(out, 0)).map((l) => l.text);
    assert.ok(t.includes('שורה ראשונה חדשה') && t.includes('שורה שלישית חדשה (2027)'));
    assert.ok(!t.some((x) => x.startsWith('2. השוכר יפקיד')));
    assert.strictEqual(t.length, 13 - 1);

    // פונט Type1 לא מוכר בלי Widths: אי אפשר למחוק — מכסים ומזהירים
    const d = await PDFDocument.create();
    const fref = d.context.register(d.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'MysteryFont' }));
    const pg = d.addPage([595, 842]);
    pg.node.set(P.PDFName.of('Resources'), d.context.obj({ Font: { F9: fref } }));
    pg.node.set(P.PDFName.of('Contents'), d.context.register(d.context.flateStream('BT /F9 12 Tf 60 700 Td (Mystery line) Tj ET')));
    const myst = await d.save();
    const lines = await linesOf(myst, 0);
    assert.strictEqual(lines[0].ok, false);
    const warnings = [];
    const em = await makeEdit(myst, 0, 0, 'שורה חלופית');
    const out2 = await Ops.buildDocument({ s: myst }, [{ src: 's', index: 0 }], { 's:0': [em] }, {}, { fonts, editFonts, onWarning: (w) => warnings.push(w) });
    assert.ok(warnings.length === 1 && /כוסתה/.test(warnings[0]));
    assert.ok((await linesOf(out2, 0)).some((l) => l.text.includes('שורה חלופית')));
  });

  await ok('עריכה: יחד עם איחוד, סיבוב, סימן מים, טופס וחותמת', async () => {
    const src = FIX('הסכם שכירות.pdf');
    const e = await makeEdit(src, 1, 1, 'סעיף מתוקן בעמוד השני');
    const stampText = { type: 'text', x: 40, y: 40, w: 300, size: 14, color: '#1a3d8f', text: 'אושר', align: 'right' };
    const pages = [{ src: 'f', index: 0 }, { src: 's', index: 1, rotate: 90 }, { src: 'a', index: 0 }];
    const out = await Ops.buildDocument({ s: src, a, f: form }, pages, { 's:1': [e, stampText] }, { f: { full_name: 'קובי איתן' } }, {
      fonts, editFonts, watermark: { text: 'טיוטה', size: 50 }, pageNumbers: { enabled: true },
    });
    const t = (await linesOf(out, 1)).map((l) => l.text);
    assert.ok(t.includes('סעיף מתוקן בעמוד השני'), t.join('\n'));
    assert.ok(t.includes('אושר') && t.includes('טיוטה'));
    fs.writeFileSync(path.join(OUT, 'edit-combined.pdf'), out);
  });

  await ok('עריכה: המנוע עובד גם עם pdf-lib המכווץ שבממשק', async () => {
    const min = require(path.join(__dirname, '../node_modules/pdf-lib/dist/pdf-lib.min.js'));
    const fakeSelf = { PDFLib: min, HebrewPDF: H };
    // טוענים את הקובץ כמו בדפדפן (בלי module), עם pdf-lib המכווץ
    new Function('self', 'module', fs.readFileSync(path.join(__dirname, '../src/core/textedit.js'), 'utf8'))(fakeSelf, undefined);
    const TE = fakeSelf.TextEdit;
    assert.ok(TE);
    for (const f of ['libreoffice-letter.pdf', 'chromium.pdf']) {
      const d = await min.PDFDocument.load(FIX(f));
      const lines = TE.groupLines(TE.analyzePage(d, d.getPage(0)).glyphs);
      const ref = await linesOf(FIX(f), 0);
      assert.deepStrictEqual(lines.map((l) => TE.lineText(l).text), ref.map((l) => l.text));
      const an = TE.analyzePage(d, d.getPage(0));
      TE.removeGlyphs(d, d.getPage(0), an, TE.groupLines(an.glyphs)[1].glyphs);
      const after = await linesOf(await d.save(), 0);
      assert.strictEqual(after.length, ref.length - 1);
    }
  });

  /* ---------- אבטחה ---------- */
  await ok('הצפנה בסיסמה: בלי סיסמה/סיסמה שגויה נכשל, סיסמה נכונה פותחת', async () => {
    const enc = await Ops.encrypt(a, { userPassword: 'סוד123', ownerPassword: 'owner' });
    fs.writeFileSync(path.join(OUT, 'encrypted.pdf'), enc);
    const sec = await Ops.inspectSecurity(enc);
    assert.strictEqual(sec.encrypted, true);
    assert.strictEqual(sec.needsPassword, true);
    assert.strictEqual(await Ops.checkPassword(enc, 'wrong'), false);
    assert.strictEqual(await Ops.checkPassword(enc, 'סוד123'), true);
    await assert.rejects(() => Ops.decrypt(enc, 'wrong'), /שגויה/);
    const dec = await Ops.decrypt(enc, 'סוד123');
    const d = await PDFDocument.load(dec);
    assert.strictEqual(d.isEncrypted, false);
    assert.strictEqual(d.getPageCount(), 3);
    assert.strictEqual((await Ops.inspectSecurity(dec)).encrypted, false);
  });

  await ok('הגבלות בלבד: נפתח בלי סיסמה, ההרשאות נקראות, פענוח מתקן את השמירה', async () => {
    const enc = await Ops.encrypt(a, { permissions: { printing: false, copying: false } });
    fs.writeFileSync(path.join(OUT, 'restricted.pdf'), enc);
    const sec = await Ops.inspectSecurity(enc);
    assert.strictEqual(sec.encrypted, true);
    assert.strictEqual(sec.needsPassword, false);
    assert.strictEqual(sec.permissions.printing, false);
    assert.strictEqual(sec.permissions.copying, false);
    assert.strictEqual(sec.permissions.modifying, true);
    // זה הבאג הישן: בלי פענוח, עריכה ושמירה של קובץ כזה יצאו פגומות
    const dec = await Ops.decrypt(enc, '');
    const out = await Ops.buildDocument({ x: dec }, [{ src: 'x', index: 2 }, { src: 'x', index: 0 }], {}, {}, { fonts });
    const d = await PDFDocument.load(out);
    assert.strictEqual(d.getPageCount(), 2);
    assert.strictEqual(d.isEncrypted, false);
  });

  await ok('בלי סיסמה ובלי הגבלות — הקובץ לא משתנה', async () => {
    assert.strictEqual(await Ops.encrypt(a, {}), a);
  });

  /* ---------- חתימה דיגיטלית ---------- */
  const p12 = DS.createSelfSigned({ name: 'קובי איתן', email: 'kobi@example.com', password: 'pw1234' });
  const sigPng = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'fixtures/signature.png')).toString('base64');

  await ok('תעודה אישית: שם בעברית, סיסמה שגויה נדחית', () => {
    const info = DS.p12Info(p12, 'pw1234');
    assert.strictEqual(info.name, 'קובי איתן');
    assert.strictEqual(info.selfSigned, true);
    assert.strictEqual(info.expired, false);
    assert.throws(() => DS.p12Info(p12, 'nope'), /שגויה/);
  });

  let signed;
  await ok('חתימה דיגיטלית גלויה (עמוד רגיל + מסובב) ובדיקה', async () => {
    const appearance = { fonts, signer: 'קובי איתן', date: '03/11/2026 10:30', reason: 'אישור החוזה', image: sigPng };
    signed = await DS.signPdf(b, DS.p12Signer(p12, 'pw1234'), { pageIndex: 0, rect: { x: 560, y: 380, w: 220, h: 70 }, name: 'קובי איתן', reason: 'אישור החוזה', appearance });
    fs.writeFileSync(path.join(OUT, 'signed.pdf'), signed);
    const res = await DS.verify(signed);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].intact, true, res[0].error);
    assert.strictEqual(res[0].coversWholeFile, true);
    assert.strictEqual(res[0].certSubject, 'קובי איתן');
    assert.strictEqual(res[0].reason, 'אישור החוזה');
    assert.strictEqual(res[0].selfSigned, true);
    // החתימה היא עדכון מצטבר: הקובץ המקורי נשאר כמו שהוא בתחילת הקובץ החתום
    assert.ok(Buffer.from(signed.subarray(0, b.length)).equals(Buffer.from(b)));
  });

  await ok('שינוי אחרי החתימה מתגלה', async () => {
    const t = Buffer.from(signed);
    t[200] ^= 1;
    const res = await DS.verify(t);
    assert.strictEqual(res[0].intact, false);
    assert.match(res[0].error, /שונה/);
  });

  await ok('חתימה שנייה מצטברת שומרת על הראשונה', async () => {
    const p12b = DS.createSelfSigned({ name: 'Second Signer', password: '' });
    const twice = await DS.signPdf(signed, DS.p12Signer(p12b, ''), { pageIndex: 0, rect: null, name: 'Second Signer' });
    fs.writeFileSync(path.join(OUT, 'signed-twice.pdf'), twice);
    const res = await DS.verify(twice);
    assert.strictEqual(res.length, 2);
    assert.ok(res.every((r) => r.intact), JSON.stringify(res.map((r) => r.error)));
    assert.deepStrictEqual(res.map((r) => r.coversWholeFile), [false, true]);
    assert.strictEqual((await Ops.getFormFields(twice)).filter((f) => f.type === 'Signature').length, 2);
  });

  await ok('מסמך לא חתום — אין חתימות', async () => {
    assert.deepStrictEqual(await DS.verify(a), []);
  });

  await ok('השחרה: העמוד מוחלף בתמונה והטקסט המקורי לא נשאר בקובץ', async () => {
    const R = require('../src/core/redact.js');
    const d = await PDFDocument.create();
    const f = await d.embedFont(StandardFonts.Helvetica);
    for (const label of ['KEEP-ONE', 'TOPSECRET', 'KEEP-THREE']) d.addPage([595, 842]).drawText(label, { x: 50, y: 700, size: 24, font: f });
    const src = await d.save({ useObjectStreams: false });
    const hex = (t) => Buffer.from(t).toString('hex').toUpperCase();
    // כל הזרמים בקובץ, מפוענחים — כדי לחפש גם בתוכן דחוס
    const streams = async (bytes) => {
      const d = await PDFDocument.load(bytes);
      let txt = '';
      for (const [, o] of d.context.enumerateIndirectObjects()) {
        if (o instanceof P.PDFRawStream) { try { txt += Buffer.from(P.decodePDFRawStream(o).decode()).toString('latin1') + '\n'; } catch (e) { /* תמונה וכד' */ } }
      }
      return txt;
    };
    assert.ok((await streams(src)).includes(hex('TOPSECRET')), 'הטקסט צריך להופיע בקובץ המקורי');
    const jpg = fs.readFileSync(path.join(__dirname, 'fixtures/redacted-page.jpg'));
    const calls = [];
    const out = await R.applyRedactions(src, [[1, [{ x: 40, y: 120, w: 200, h: 40 }]]], {
      render: async (idx, boxes) => { calls.push([idx, boxes.length]); return { jpg, width: 595, height: 842 }; },
    });
    assert.deepStrictEqual(calls, [[1, 1]]);
    fs.writeFileSync(path.join(OUT, 'redacted.pdf'), out);
    const plain = await streams(out);
    assert.ok(!plain.includes(hex('TOPSECRET')), 'הטקסט המושחר נשאר בקובץ');
    assert.ok(plain.includes(hex('KEEP-ONE')) && plain.includes(hex('KEEP-THREE')), 'שאר העמודים נפגעו');
    const r = await PDFDocument.load(out);
    assert.strictEqual(r.getPageCount(), 3);
    assert.deepStrictEqual(r.getPage(1).getSize(), { width: 595, height: 842 });
  });

  await ok('דחיסה בלי איבוד: עותקים זהים מתאחדים ואובייקטים יתומים נמחקים', async () => {
    const C = require('../src/core/compress.js');
    const d = await PDFDocument.create();
    const f = await d.embedFont(StandardFonts.Helvetica);
    const png = fs.readFileSync(path.join(__dirname, 'fixtures/signature.png'));
    for (let i = 0; i < 3; i++) {
      const p = d.addPage([595, 842]);
      p.drawText(`COMPRESS-${i + 1}`, { x: 50, y: 780, size: 20, font: f });
      p.drawImage(await d.embedPng(png), { x: 50, y: 500, width: 200, height: 75 }); // אותה תמונה שלוש פעמים
    }
    d.context.register(d.context.flateStream(new Uint8Array(50000).fill(7))); // זבל שאף אחד לא מפנה אליו
    const src = await d.save();
    const countImages = async (b) => (await PDFDocument.load(b)).context.enumerateIndirectObjects()
      .filter(([, o]) => o instanceof P.PDFRawStream && o.dict.lookup(P.PDFName.of('Subtype')) === P.PDFName.of('Image')).length;
    assert.strictEqual(await countImages(src), 6); // 3 תמונות + 3 מסכות שקיפות
    const r = await C.compress(src, { level: 'light' });
    assert.ok(!r.unchanged && r.after < r.before, `${r.before} → ${r.after}`);
    assert.strictEqual(await countImages(r.bytes), 2);
    assert.ok(r.merged >= 4 && r.removed >= 1, JSON.stringify(r));
    fs.writeFileSync(path.join(OUT, 'compressed-light.pdf'), r.bytes);
    const out = await PDFDocument.load(r.bytes);
    assert.strictEqual(out.getPageCount(), 3);
    let txt = '';
    for (const [, o] of out.context.enumerateIndirectObjects()) {
      if (o instanceof P.PDFRawStream && !o.dict.has(P.PDFName.of('Subtype'))) { try { txt += Buffer.from(P.decodePDFRawStream(o).decode()).toString('latin1'); } catch (e) { /* */ } }
    }
    assert.ok(txt.includes(Buffer.from('COMPRESS-3').toString('hex').toUpperCase()), 'הטקסט נעלם');
  });

  await ok('דחיסת תמונות: פענוח Flate עם מנבא PNG, הקטנה לגודל העמוד, מסכה נשמרת', async () => {
    const C = require('../src/core/compress.js');
    const zlib = require('zlib');
    const W = 2400, Hh = 8;
    const pixels = Buffer.alloc(W * Hh * 3);
    let seed = 12345;
    for (let i = 0; i < pixels.length; i++) { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; pixels[i] = seed >>> 24; } // רעש — לא נדחס
    // מנבא PNG: כל שורה עם סוג סינון אחר (0–4)
    const rows = [];
    for (let y = 0; y < Hh; y++) {
      const type = y % 5;
      const row = Buffer.alloc(W * 3 + 1);
      row[0] = type;
      for (let x = 0; x < W * 3; x++) {
        const cur = pixels[y * W * 3 + x];
        const a = x >= 3 ? pixels[y * W * 3 + x - 3] : 0;
        const b = y ? pixels[(y - 1) * W * 3 + x] : 0;
        const c = y && x >= 3 ? pixels[(y - 1) * W * 3 + x - 3] : 0;
        const pr = a + b - c, pa = Math.abs(pr - a), pb = Math.abs(pr - b), pc = Math.abs(pr - c);
        const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][type];
        row[x + 1] = (cur - pred) & 0xff;
      }
      rows.push(row);
    }
    const d = await PDFDocument.create();
    const page = d.addPage([595, 842]);
    const ctx = d.context;
    const smask = ctx.register(ctx.flateStream(new Uint8Array(W * Hh).fill(200), { Type: 'XObject', Subtype: 'Image', Width: W, Height: Hh, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }));
    const imgStream = ctx.stream(zlib.deflateSync(Buffer.concat(rows)), {
      Type: 'XObject', Subtype: 'Image', Width: W, Height: Hh, ColorSpace: 'DeviceRGB', BitsPerComponent: 8,
      Filter: 'FlateDecode', DecodeParms: { Predictor: 15, Colors: 3, Columns: W, BitsPerComponent: 8 }, SMask: smask,
    });
    const imgRef = ctx.register(imgStream);
    page.node.setXObject(P.PDFName.of('Im1'), imgRef);
    const src = await d.save();
    const jpg = fs.readFileSync(path.join(__dirname, 'fixtures/redacted-page.jpg'));
    assert.strictEqual(C._internal.jpegComponents(jpg), 3);
    const calls = [];
    const r = await C.compress(src, {
      level: 'medium',
      recode: async (s) => { calls.push(s); return new Uint8Array(jpg); },
    });
    assert.strictEqual(calls.length, 1, 'רק התמונה עצמה, לא המסכה');
    assert.ok(Buffer.from(calls[0].pixels.subarray(0, W * Hh * 3)).equals(pixels), 'הפיקסלים פוענחו לא נכון');
    assert.strictEqual(calls[0].targetWidth, Math.ceil((842 / 72) * 150)); // 150 DPI לפי הצלע הארוכה של העמוד
    assert.strictEqual(r.recompressed, 1);
    const out = await PDFDocument.load(r.bytes);
    const im = out.context.lookup(out.getPage(0).node.Resources().lookup(P.PDFName.of('XObject')).get(P.PDFName.of('Im1')));
    assert.strictEqual(im.dict.lookup(P.PDFName.of('Filter')), P.PDFName.of('DCTDecode'));
    assert.ok(im.dict.get(P.PDFName.of('SMask')) instanceof P.PDFRef, 'המסכה הלכה לאיבוד');
    assert.ok(Buffer.from(im.contents).equals(jpg));
    // רמה קלה לא נוגעת בתמונות
    const light = await C.compress(src, { level: 'light', recode: async () => { throw new Error('לא אמור להיקרא'); } });
    assert.strictEqual(light.recompressed, 0);
  });

  await ok('דחיסה: EXIF מוסר (בלי סיבוב), מסכות ותמונות עם Decode לא נוגעים, חיסכון זניח = "כבר דחוס"', async () => {
    const C = require('../src/core/compress.js');
    const jpg = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures/redacted-page.jpg')));
    const exif = new Uint8Array([0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
    const withExif = new Uint8Array([...jpg.subarray(0, 2), ...exif, ...jpg.subarray(2)]);
    const stripped = C._internal.stripExif(withExif);
    assert.ok(Buffer.from(stripped).equals(Buffer.from(jpg)), 'EXIF לא הוסר נכון');
    assert.ok(Buffer.from(C._internal.stripExif(jpg)).equals(Buffer.from(jpg)));

    const d = await PDFDocument.create();
    const ctx = d.context;
    const W = 400, Hh = 400;
    const noise = new Uint8Array(W * Hh); for (let i = 0; i < noise.length; i++) noise[i] = (Math.imul(i, 2654435761) >>> 24);
    const stencil = ctx.register(ctx.flateStream(new Uint8Array(W / 8 * Hh).fill(0xaa), { Type: 'XObject', Subtype: 'Image', Width: W, Height: Hh, ImageMask: true, BitsPerComponent: 1 }));
    const inv = ctx.register(ctx.flateStream(noise, { Type: 'XObject', Subtype: 'Image', Width: W, Height: Hh, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Decode: [1, 0] }));
    const idx = ctx.register(ctx.flateStream(noise, { Type: 'XObject', Subtype: 'Image', Width: W, Height: Hh, ColorSpace: ['Indexed', 'DeviceRGB', 255, P.PDFHexString.of('00'.repeat(768))], BitsPerComponent: 8 }));
    const pg = d.addPage([595, 842]);
    pg.node.setXObject(P.PDFName.of('S'), stencil); pg.node.setXObject(P.PDFName.of('D'), inv); pg.node.setXObject(P.PDFName.of('X'), idx);
    const src = await d.save();
    const r = await C.compress(src, { level: 'strong', recode: async () => { throw new Error('לא אמור להיקרא'); } });
    assert.strictEqual(r.recompressed, 0);
    assert.strictEqual(r.skipped, 0);
    // הקובץ כבר קטן ונקי — אין עותק חדש
    assert.ok(r.unchanged && r.bytes === src);
  });

  await ok('חיפוש: reorderWithMap זהה ל-toVisual ומחזיר מאיפה הגיע כל תו', () => {
    const samples = ['שלום עולם', 'המחיר 1,250.50 ש"ח', '(שלום) [x]', 'שָׁלוֹם 123 abc', 'Plain English', 'טלפון 03-5551234 (משרד) או office@example.co.il', 'א-ב, 2026/118 ₪', ''];
    for (const t of samples) {
      for (const dir of ['rtl', 'ltr']) {
        const r = H.reorderWithMap(t, dir);
        assert.strictEqual(r.text, H.toVisual(t, dir), t);
        assert.strictEqual(r.from.length, r.text.length);
        assert.deepStrictEqual([...r.from].sort((a, b) => a - b), Array.from(t, (_, k) => k), 'כל תו מופיע פעם אחת');
      }
    }
  });

  await ok('חיפוש: עברית, מספרים, גרשיים, רווחים, אותיות גדולות, סוגריים — בקבצים אמיתיים', async () => {
    const PS = require('../src/core/search.js');
    const load = async (f) => PDFDocument.load(fs.readFileSync(path.join(__dirname, 'fixtures', f)));
    const count = (doc, q) => doc.getPages().reduce((n, _, i) => n + PS.findInLines(PS.pageLines(doc, i), q).length, 0);
    const lease = await load('הסכם שכירות.pdf');
    assert.strictEqual(count(lease, 'השכירות'), 6);
    assert.strictEqual(count(lease, '6,450 ש"ח'), count(lease, '6,450 ש״ח')); // גרשיים עבריים = מירכאות
    assert.ok(count(lease, '6,450 ש"ח') >= 1);
    assert.strictEqual(count(lease, '  הסכם   שכירות '), count(lease, 'הסכם שכירות'));
    assert.strictEqual(count(lease, 'אין-כזה-דבר'), 0);
    assert.strictEqual(count(lease, ''), 0);
    const chrome = await load('chromium.pdf');
    assert.strictEqual(count(chrome, 'OFFICE@EXAMPLE.CO.IL'), 1);
    assert.strictEqual(count(chrome, '03-5551234 (משרד)'), 1);
    assert.strictEqual(count(chrome, 'plain english'), 1);
    const lo = await load('libreoffice-letter.pdf');
    assert.strictEqual(count(lo, '(סניף ת"א)'), 1); // LibreOffice שומר סוגריים הפוכים
    assert.strictEqual(count(lo, '12,300.50 ₪'), 1);
    // המלבן הוא של המילה בלבד, בתוך השורה
    const [m] = PS.findInLines(PS.pageLines(lease, 0), 'השכירות');
    assert.strictEqual(m.rects.length, 1);
    const [r] = m.rects, b = m.line.box;
    assert.ok(r[0] >= b[0] - 0.5 && r[2] <= b[2] + 0.5 && r[1] >= b[1] - 0.5 && r[3] <= b[3] + 0.5, 'מחוץ לשורה');
    assert.ok(r[2] - r[0] < (b[2] - b[0]) / 3, 'המלבן רחב מדי — כל השורה ולא המילה');
  });

  await ok('חיפוש: ניקוד לא מפריע, ועמוד מסובב/סרוק לא שובר', async () => {
    const PS = require('../src/core/search.js');
    const d = await PDFDocument.create();
    d.addPage([595, 842]);
    const src = await d.save();
    const out = await Ops.buildDocument({ a: src, b: src }, [{ src: 'a', index: 0, rotate: 90 }, { src: 'b', index: 0 }], {
      'a:0': [{ type: 'text', x: 40, y: 60, w: 400, size: 20, color: '#000000', text: 'בְּרֵאשִׁית בָּרָא שָׁלוֹם 2026', align: 'right' }],
    }, {}, { fonts });
    const doc = await PDFDocument.load(out);
    const lines = PS.pageLines(doc, 0);
    assert.strictEqual(PS.findInLines(lines, 'שלום').length, 1, PS.indexLine(lines[0], lines).plain);
    assert.strictEqual(PS.findInLines(lines, 'שָׁלוֹם').length, 1);
    assert.strictEqual(PS.findInLines(lines, 'בראשית ברא').length, 1);
    assert.strictEqual(PS.findInLines(lines, 'שלום 2026').length, 1);
    assert.deepStrictEqual(PS.pageLines(doc, 1), []); // עמוד בלי טקסט
  });

  await ok('תיבת טקסט עם רקע ושקיפות: מלבן בגובה השורות, מתחת לטקסט', async () => {
    const d = await PDFDocument.create();
    d.addPage([595, 842]);
    const src = await d.save();
    const out = await Ops.buildDocument({ a: src }, [{ src: 'a', index: 0 }], {
      'a:0': [{ type: 'text', x: 100, y: 100, w: 200, size: 20, color: '#000000', text: 'שורה ראשונה\nשורה שנייה', align: 'right', bg: '#FFF176', bgOpacity: 0.5 }],
    }, {}, { fonts });
    const doc = await PDFDocument.load(out);
    const page = doc.getPage(0);
    const zlib = require('zlib');
    const all = page.node.normalizedEntries().Contents.asArray().map((r) => {
      const b = Buffer.from(doc.context.lookup(r).getContents());
      try { return zlib.inflateSync(b).toString('latin1'); } catch (e) { return b.toString('latin1'); }
    }).join('\n');
    // pdf-lib: הזזה לפינה העליונה ואז נתיב 0,0 → w,0 → w,h
    const m = all.match(/gs\n1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm[\s\S]*?0 0 m\n([\d.]+) 0 l\n[\d.]+ ([\d.]+) l/);
    assert.ok(m, 'אין מלבן רקע');
    const [x, top, w, h] = m.slice(1).map(Number);
    assert.ok(Math.abs(x - 98) < 0.01 && Math.abs(w - 204) < 0.01, `x/w: ${x} ${w}`);
    assert.ok(Math.abs(h - (2 * 1.25 * 20 + 4)) < 0.01, 'גובה: ' + h); // שתי שורות + 2 מכל צד
    assert.ok(Math.abs(top - (842 - 100 + 2)) < 0.01, 'למעלה: ' + top);
    const tj = all.search(/T[jJ]\b/);
    assert.ok(tj > all.indexOf(' m\n'), 'הרקע צריך להיות מתחת לטקסט');
    const gs = page.node.Resources().lookup(require('pdf-lib').PDFName.of('ExtGState'));
    assert.ok(gs && /\/ca 0\.5\b/.test(String([...gs.asMap().values()].map((v) => String(doc.context.lookup(v))).join(' '))), 'שקיפות חסרה');
  });

  /* ---------- המרה ל-Word ---------- */
  const Docx = require('../src/core/docx.js');
  const { unzipSync, strFromU8 } = require('fflate');
  const PNG1 = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const fixture = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n));
  /** המרה + פתיחת ה-ZIP. מחזיר את document.xml, את הפסקאות כטקסט, ואת בקשות הציור */
  async function toWord(bytes, name, opts = {}) {
    const asked = [];
    const r = await Docx.convert(bytes, { ...opts, renderImage: async (q) => { asked.push(q); return { bytes: PNG1, type: 'png' }; } });
    fs.writeFileSync(path.join(OUT, name), r.bytes);
    const zip = unzipSync(r.bytes);
    const xml = strFromU8(zip['word/document.xml']);
    const paras = [...xml.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map((m) => [...m[1].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>|<w:tab\/>/g)].map((t) => (t[1] == null ? '\t' : t[1])).join('').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    // החבילה תקינה: כל קובץ שמוזכר בקשרים קיים, וכל סוג תמונה רשום
    const rels = strFromU8(zip['word/_rels/document.xml.rels']);
    for (const [, t] of rels.matchAll(/Target="([^"]+)"/g)) assert.ok(zip['word/' + t], 'חסר בחבילה: ' + t);
    const types = strFromU8(zip['[Content_Types].xml']);
    for (const k of Object.keys(zip)) if (/\.(png|jpeg)$/.test(k)) assert.ok(types.includes(`Extension="${k.split('.').pop()}"`), 'סוג לא רשום: ' + k);
    return { r, zip, xml, paras, asked };
  }

  await ok('Word: עברית בסדר לוגי, שורות שנשברו מתחברות לפסקה, כותרת וכיוון מימין לשמאל', async () => {
    const { xml, paras, r } = await toWord(fixture('הסכם שכירות.pdf'), 'word-agreement.docx');
    assert.strictEqual(r.stats.textPages, 3);
    assert.ok(paras.includes('הסכם שכירות בלתי מוגנת'), 'הכותרת');
    assert.ok(/<w:pStyle w:val="Heading1"\/>[\s\S]*?הסכם שכירות בלתי מוגנת/.test(xml), 'הכותרת מסומנת כ-Heading1');
    // פריט ממוספר: טאב אחרי המספר (מיושר לרווח התלוי)
    const p1 = paras.map((t) => t.replace('\t', ' ')).find((t) => t.startsWith('1. דמי השכירות'));
    assert.ok(p1, 'פסקה 1');
    // שתי שורות במקור — פסקה אחת ב-Word, עם המספרים במקום
    assert.ok(p1.includes('6,450 ש"ח (שישה אלף ארבע מאות וחמישים שקלים חדשים)'), p1);
    assert.ok(p1.includes('ה-5 בכל חודש'), p1);
    assert.ok(xml.includes('<w:bidi/>') && xml.includes('<w:rtl/>'));
    // מספרים ואנגלית בקטע נפרד, בלי rtl
    assert.ok(/<w:r>(?:(?!<w:r>).)*?<w:t xml:space="preserve">office@example\.co\.il<\/w:t>/.test(xml));
    assert.ok(!/<w:rtl\/><\/w:rPr><w:t xml:space="preserve">office@example/.test(xml));
    // שלושה עמודים רגילים באותו גודל — זורמים ברצף במקטע אחד (שורה שגולשת לא יוצרת עמוד ריק)
    assert.strictEqual((xml.match(/<w:sectPr>/g) || []).length, 1);
  });

  await ok('Word: הדגשה בתוך שורה נשמרת ("הנדון:" מודגש, השאר רגיל)', async () => {
    const { xml, paras } = await toWord(fixture('libreoffice-letter.pdf'), 'word-letter.docx');
    assert.ok(paras.some((t) => t.startsWith('הנדון: חשבונית מס')), paras.join('\n'));
    const m = xml.match(/<w:p>(?:(?!<w:p>)[\s\S])*?הנדון:[\s\S]*?<\/w:p>/)[0];
    assert.ok(/<w:b\/><w:bCs\/>(?:(?!<w:r>).)*?הנדון:/.test(m), 'הנדון מודגש');
    assert.ok(/<w:r><w:rPr>(?:(?!<w:b\/>)(?!<\/w:rPr>).)*<\/w:rPr><w:t xml:space="preserve"> ?חשבונית/.test(m), 'ההמשך לא מודגש');
  });

  await ok('Word: טבלה מזוהה לפי טורים, מימין לשמאל, עם גובה שורות כמו במקור', async () => {
    const { xml, r, paras } = await toWord(fixture('נספחים.pdf'), 'word-table.docx');
    assert.strictEqual(r.stats.tables, 1);
    const tbl = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/)[0];
    assert.ok(tbl.includes('<w:bidiVisual/>'));
    assert.strictEqual((tbl.match(/<w:gridCol /g) || []).length, 4);
    assert.strictEqual((tbl.match(/<w:tr>/g) || []).length, 9);
    assert.ok(/w:trHeight/.test(tbl));
    // השורה הראשונה: הכותרות, מהטור הימני
    const firstRow = tbl.match(/<w:tr>[\s\S]*?<\/w:tr>/)[0];
    const cells = [...firstRow.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((c) => [...c[1].matchAll(/<w:t[^>]*>([^<]*)</g)].map((t) => t[1]).join(''));
    assert.deepStrictEqual(cells, ['חודש', 'סכום', 'תאריך פירעון', 'אסמכתא']);
    assert.ok(paras.some((t) => t.startsWith('דירת 4 חדרים בקומה 3')));
  });

  await ok('Word: עמוד סרוק נכנס כתמונה, תמונה בעמוד טקסט נכנסת במקומה', async () => {
    const d = await PDFDocument.load(fixture('הסכם שכירות.pdf'));
    const sig = await d.embedPng(fixture('signature.png'));
    d.getPage(0).drawImage(sig, { x: 200, y: 330, width: 200, height: 80 });
    const scan = await d.embedJpg(fixture('redacted-page.jpg'));
    const q = d.addPage([842, 595]);
    q.drawImage(scan, { x: 0, y: 0, width: 842, height: 595 });
    const { r, zip, xml, asked } = await toWord(await d.save(), 'word-images.docx');
    assert.strictEqual(r.stats.imagePages, 1);
    assert.strictEqual(r.stats.images, 2);
    const region = asked.find((a) => !a.full);
    assert.strictEqual(region.pageIndex, 0);
    assert.deepStrictEqual(region.box.map(Math.round), [200, 330, 400, 410]);
    const full = asked.find((a) => a.full);
    assert.strictEqual(full.pageIndex, 3);
    assert.ok(zip['word/media/image1.png'] && zip['word/media/image2.png']);
    // התמונה בין הפסקה החמישית לכותרת התחתונה; העמוד הסרוק — לרוחב
    assert.ok(/office@example[\s\S]*01\/01\/2027[\s\S]*<w:drawing>/.test(xml));
    assert.ok(/w:orient="landscape"/.test(xml));
  });

  await ok('Word: רק העמודים שנבחרו, וטקסט שלא ניתן לקרוא לא נכנס כג׳יבריש', async () => {
    const { r, paras } = await toWord(fixture('הסכם שכירות.pdf'), 'word-pages.docx', { pages: [1] });
    assert.strictEqual(r.stats.pages, 1);
    assert.ok(!paras.includes('הסכם שכירות בלתי מוגנת'));
    // גופן בלי ToUnicode ובלי קידוד מוכר: העמוד נכנס כתמונה
    const d = await PDFDocument.create();
    const p = d.addPage([300, 200]);
    const font = d.context.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: 'Weird', Encoding: 'Custom-H', DescendantFonts: [] });
    p.node.set(P.PDFName.of('Resources'), d.context.obj({ Font: { F1: d.context.register(font) } }));
    p.node.set(P.PDFName.of('Contents'), d.context.register(d.context.stream('BT /F1 12 Tf 20 100 Td <00410042> Tj ET')));
    const w = await toWord(await d.save(), 'word-unreadable.docx');
    assert.strictEqual(w.r.stats.unreadable, 1);
  });

  /** עמוד A4 עם גרפיקה (draw על עמוד pdf-lib) וטקסט עברי (חותמות טקסט של התוכנה, קואורדינטות מלמעלה) */
  async function pageWith(draw, texts) {
    const d = await PDFDocument.create();
    const pg = d.addPage([595, 842]);
    draw(pg);
    const stamps = texts.map(([x, y, w, text, extra]) => ({ type: 'text', x, y, w, size: 11, color: '#000000', text, align: 'right', ...(extra || {}) }));
    return Ops.buildDocument({ a: await d.save() }, [{ src: 'a', index: 0 }], { 'a:0': stamps }, {}, { fonts });
  }

  await ok('Word: כותרת תחתונה עם מספר עמוד הופכת לשדות של Word, והלוגו/הכותרת לא חוזרים בגוף', async () => {
    const { zip, xml } = await toWord(fixture('הסכם שכירות.pdf'), 'word-footer.docx');
    const ftr = strFromU8(zip['word/footer1.xml']);
    assert.ok(ftr.includes('w:instr=" PAGE "') && ftr.includes('w:instr=" NUMPAGES "'), ftr);
    assert.ok(!/עמוד <\/w:t>|מתוך/.test(xml.replace(/<w:ftr[\s\S]*<\/w:ftr>/, '')), 'מספור העמודים נשאר בגוף');
    assert.ok(xml.includes('w:footerReference'));
  });

  await ok('Word: טבלה עם קווים — רשת, תא ממוזג לרוחב, רקע אפור, טקסט בכל תא', async () => {
    const { rgb } = P;
    const xs = [100, 250, 400, 500], ys = [742, 712, 682, 652];
    const out = await pageWith((pg) => {
      pg.drawRectangle({ x: 100, y: 712, width: 400, height: 30, color: rgb(0.85, 0.85, 0.85) });
      for (const y of ys) pg.drawLine({ start: { x: 100, y }, end: { x: 500, y }, thickness: 0.75 });
      for (const x of xs) pg.drawLine({ start: { x, y: x === 250 ? 712 : 742 }, end: { x, y: 652 }, thickness: 0.75 }); // בשורה הראשונה אין קו ב-250
    }, [
      [260, 108, 235, 'מחירון פירות'],
      [405, 138, 90, 'תפוח'], [255, 138, 140, '5'], [105, 138, 140, 'ירוק'],
      [405, 168, 90, 'בננה'], [255, 168, 140, '7'], [105, 168, 140, 'צהוב'],
    ]);
    const { xml, r } = await toWord(out, 'word-ruled.docx');
    assert.strictEqual(r.stats.tables, 1);
    const tbl = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/)[0];
    assert.strictEqual((tbl.match(/<w:gridCol /g) || []).length, 3);
    assert.strictEqual((tbl.match(/<w:tr>/g) || []).length, 3);
    assert.ok(/<w:gridSpan w:val="2"\/>/.test(tbl), 'תא ממוזג');
    assert.ok(/<w:shd [^>]*w:fill="D9D9D9"/.test(tbl), 'רקע');
    assert.ok(/w:color="000000"/.test(tbl), 'קווי טבלה');
    const row = (k) => [...tbl.match(/<w:tr>[\s\S]*?<\/w:tr>/g)[k].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((c) => [...c[1].matchAll(/<w:t[^>]*>([^<]*)</g)].map((t) => t[1]).join(''));
    // מימין לשמאל: הטור הימני ראשון
    assert.deepStrictEqual(row(1), ['תפוח', '5', 'ירוק']);
    assert.deepStrictEqual(row(2), ['בננה', '7', 'צהוב']);
    assert.ok(row(0).some((t) => t.includes('מחירון פירות')));
  });

  await ok('Word: תבליטים הופכים לרשימה של Word עם רווח תלוי, ושורת ההמשך מתחברת לפריט', async () => {
    const out = await pageWith(() => {}, [
      [60, 100, 480, 'פתיחה רגילה לפני הרשימה.'],
      [60, 130, 480, '• פריט ראשון ארוך שממשיך בשורה הבאה ומגיע עד הקצה השמאלי של העמוד בערך'],
      [60, 145, 462, 'וזה ההמשך של הפריט הראשון.'],
      [60, 160, 480, '• פריט שני קצר.'],
    ]);
    const { xml, zip, paras } = await toWord(out, 'word-list.docx');
    assert.ok(zip['word/numbering.xml'], 'אין numbering.xml');
    assert.ok(strFromU8(zip['word/numbering.xml']).includes('w:lvlText w:val="•"'));
    const items = [...xml.matchAll(/<w:p><w:pPr>(?:(?!<\/w:pPr>).)*<w:numPr>[\s\S]*?<\/w:p>/g)].map((m) => m[0]);
    assert.strictEqual(items.length, 2, xml);
    assert.ok(/w:hanging="\d+"/.test(items[0]));
    const first = paras.find((t) => t.startsWith('פריט ראשון'));
    assert.ok(first && first.includes('וזה ההמשך של הפריט הראשון'), paras.join('\n'));
    assert.ok(!paras.some((t) => t.startsWith('•')), 'סימן התבליט נשאר בטקסט');
  });

  await ok('Word: שדה שמולא על קו ("שם: ____" ומעליו שם) — בלי קווים בתוך השם, עם קו תחתון', async () => {
    const out = await pageWith(() => {}, [
      [300, 100, 240, 'שם: ________________________'],
      [330, 100, 150, 'ישראל ישראלי', { align: 'center' }],
    ]);
    const { xml, paras } = await toWord(out, 'word-field.docx');
    const p = paras.find((t) => t.includes('שם:'));
    assert.ok(p && p.includes('ישראל ישראלי') && !/[א-ת]_|_[א-ת]/.test(p), p);
    assert.ok(/<w:u w:val="single"\/>(?:(?!<w:t).)*<w:t xml:space="preserve">ישראל/.test(xml), 'אין קו תחתון לשם');
  });

  await ok('Word: עמוד מעוצב — רקע (גרפיקה בלי טקסט) מאחורי תיבות טקסט במקום המדויק', async () => {
    const { rgb } = P;
    const out = await pageWith((pg) => {
      pg.drawRectangle({ x: 0, y: 500, width: 595, height: 342, color: rgb(0.1, 0.3, 0.7) });
      pg.drawRectangle({ x: 60, y: 100, width: 200, height: 200, color: rgb(0.9, 0.8, 0.2) });
    }, [[60, 60, 480, 'כותרת על רקע כחול'], [300, 400, 240, 'טקסט בחלק הלבן']]);
    const asked = [];
    let stripped = null;
    const r = await Docx.convert(out, { renderImage: async (q) => { asked.push(q); if (q.pdf) stripped = q.pdf; return { bytes: PNG1, type: 'png' }; } });
    fs.writeFileSync(path.join(OUT, 'word-designed.docx'), r.bytes);
    assert.strictEqual(r.stats.designedPages, 1);
    const xml = strFromU8(unzipSync(r.bytes)['word/document.xml']);
    assert.ok(xml.includes('behindDoc="1"'), 'אין רקע');
    assert.strictEqual((xml.match(/<wps:txbx>/g) || []).length, 2);
    assert.ok(xml.includes('כותרת על רקע כחול'));
    // תמונת הרקע מצוירת מעותק בלי טקסט, שבו הגרפיקה נשארה
    assert.ok(stripped && asked.some((q) => q.full && q.pdf));
    const sd = await PDFDocument.load(stripped);
    assert.strictEqual(T.groupLines(T.analyzePage(sd, sd.getPage(0)).glyphs).length, 0, 'נשאר טקסט ברקע');
    assert.ok(Docx._internal.scanGraphics(sd, sd.getPage(0)).fills.length >= 2, 'הגרפיקה נעלמה');
  });

  await ok('קריאת טקסט: שם גליף עם סיומת וריאנט (parenleft.loclIWR) וקודי פיסוק בלי שם', () => {
    const cmap = T.parseToUnicode; // נוכחות
    assert.ok(cmap);
    // דרך המנוע: גופן Type1 עם Differences
    return (async () => {
      const d = await PDFDocument.create();
      const p = d.addPage([300, 200]);
      const f = d.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', FirstChar: 32, LastChar: 160, Widths: Array(129).fill(500),
        Encoding: { Type: 'Encoding', Differences: [40, 'parenleft.loclIWR', 'afii57664'] } });
      p.node.set(P.PDFName.of('Resources'), d.context.obj({ Font: { F1: d.context.register(f) } }));
      p.node.set(P.PDFName.of('Contents'), d.context.register(d.context.stream('BT /F1 12 Tf 20 100 Td <28299396> Tj ET')));
      const doc = await PDFDocument.load(await d.save());
      const L = T.groupLines(T.analyzePage(doc, doc.getPage(0)).glyphs);
      assert.strictEqual(L[0].visual, '(א“–'); // 0x93 = “, 0x96 = –
    })();
  });

  await ok('Word: הגופנים של ה-PDF מוטמעים בקובץ (TrueType תקין, עברית ממופה, מוצפן לפי התקן)', async () => {
    const FE = require('../src/core/fontembed.js');
    const { zip } = await toWord(fixture('הסכם שכירות.pdf'), 'word-fonts.docx');
    const table = strFromU8(zip['word/fontTable.xml']);
    const rels = strFromU8(zip['word/_rels/fontTable.xml.rels']);
    assert.ok(strFromU8(zip['word/settings.xml']).includes('<w:embedTrueTypeFonts/>'));
    assert.ok(strFromU8(zip['[Content_Types].xml']).includes('Extension="odttf"'));
    const m = table.match(/<w:font w:name="([^"]+)">(?:(?!<\/w:font>).)*?<w:embedRegular r:id="([^"]+)" w:fontKey="(\{[^}]+\})"/);
    assert.ok(m, table);
    const target = rels.match(new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`))[1];
    // ההצפנה הפיכה: XOR של 32 הבתים הראשונים במפתח
    const raw = FE.obfuscate(zip['word/' + target], m[3]);
    const font = FE.readFont(raw);
    assert.ok(font && font.numGlyphs > 0, 'הגופן לא נקרא');
    for (const t of ['cmap', 'name', 'OS/2', 'post', 'glyf', 'loca', 'head', 'hhea', 'hmtx', 'maxp']) assert.ok(font.tables[t], 'חסרה טבלה ' + t);
    const cmap = font.cmap['3,1'];
    const alef = cmap.get(0x5D0);
    assert.ok(alef && font.glyph(alef), 'א לא ממופה לגליף');
    // הטקסט בקובץ משתמש באותו שם משפחה
    assert.ok(strFromU8(zip['word/document.xml']).includes(`w:cs="${m[1]}"`));
  });

  await ok('Word: פיצול לפי כתב ושמות גופנים', () => {
    assert.deepStrictEqual(Docx.splitScript('המחיר 1,250.50 ש"ח', 'rtl'), [{ text: 'המחיר ', rtl: true }, { text: '1,250.50', rtl: false }, { text: ' ש"ח', rtl: true }]);
    assert.deepStrictEqual(Docx.splitScript('Hello שלום', 'ltr'), [{ text: 'Hello', rtl: false }, { text: ' שלום', rtl: true }]);
    assert.strictEqual(Docx.fontFamily('ABCDEF+Arial-BoldMT'), 'Arial');
    assert.strictEqual(Docx.fontFamily('TimesNewRomanPS-ItalicMT'), 'Times New Roman');
    assert.strictEqual(Docx.fontFamily('IBMPlexSansHebrew-SemiBold'), 'IBM Plex Sans Hebrew SemiBold'); // משקל שאינו רגיל/מודגש — חלק משם המשפחה, כמו ב-Windows
    assert.strictEqual(Docx.fontFamily('Arial-BoldMT'), 'Arial');
    assert.strictEqual(Docx.fontFamily('Arial-BlackMT'), 'Arial Black');
    assert.strictEqual(Docx.fontFamily('F12'), 'Arial');
  });

  await ok('Word: נפתח ב-LibreOffice והטקסט העברי חוזר כמו שהוא', async () => {
    const { execFileSync } = require('child_process');
    let soffice = null;
    for (const c of ['soffice', 'libreoffice']) { try { execFileSync('which', [c]); soffice = c; break; } catch (e) { /* אין */ } }
    if (!soffice) { console.log('  (אין LibreOffice במחשב — מדלגים)'); return; }
    const dir = fs.mkdtempSync(path.join(OUT, 'lo-'));
    fs.copyFileSync(path.join(OUT, 'word-agreement.docx'), path.join(dir, 'a.docx'));
    execFileSync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', dir, path.join(dir, 'a.docx')], { stdio: 'ignore', timeout: 120000 });
    const back = await PDFDocument.load(fs.readFileSync(path.join(dir, 'a.pdf')));
    const lines = T.groupLines(T.analyzePage(back, back.getPage(0)).glyphs);
    const texts = lines.map((L) => T.lineText(L, lines).text);
    assert.ok(texts.includes('הסכם שכירות בלתי מוגנת'), texts.join('\n'));
    assert.ok(texts.some((t) => t.includes('6,450')), texts.join('\n'));
  });

  await ok('תמונות: רזולוציה נכתבת ל-JPEG ול-PNG, ושמות עמודים ממוספרים', () => {
    const R = require('../src/core/rasterize.js');
    assert.strictEqual(R.crc32(Buffer.from('IEND')), 0xAE426082);
    const png = R.setDpi(PNG1, 150);
    const i = Buffer.from(png).indexOf('pHYs');
    assert.ok(i > 0);
    assert.strictEqual(Buffer.from(png).readUInt32BE(i + 4), Math.round(150 / 0.0254));
    assert.strictEqual(Buffer.from(png).readUInt32BE(i + 13), R.crc32(png.subarray(i, i + 13)));
    assert.strictEqual(Buffer.from(R.setDpi(png, 300)).indexOf('pHYs', i + 4), -1, 'pHYs אחד בלבד');
    const jfif = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xFF, 0xD9]);
    const j = R.setDpi(jfif, 300);
    assert.deepStrictEqual([...j.subarray(13, 18)], [1, 1, 44, 1, 44]);
    assert.deepStrictEqual(R.pageNames('חוזה', [1, 2, 10], 'jpg'), ['חוזה - עמוד 01.jpg', 'חוזה - עמוד 02.jpg', 'חוזה - עמוד 10.jpg']);
    assert.deepStrictEqual(R.pageNames('חוזה', [3, 120], 'png'), ['חוזה - עמוד 003.png', 'חוזה - עמוד 120.png']);
  });

  await ok('המנוע נטען במצב דפדפן (כמו ב-WebView של אנדרואיד) וכותב עברית', async () => {
    const out = await require('./browser-globals.js').run(fonts);
    fs.writeFileSync(path.join(OUT, 'browser-globals.pdf'), out);
    const d = await PDFDocument.load(out);
    assert.strictEqual(d.getPageCount(), 1);
  });

  console.log(`\n${passed} בדיקות עברו. קבצי פלט: ${OUT}`);
})().catch((e) => { console.error('✗', e); process.exit(1); });
