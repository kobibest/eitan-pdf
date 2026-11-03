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

  console.log(`\n${passed} בדיקות עברו. קבצי פלט: ${OUT}`);
})().catch((e) => { console.error('✗', e); process.exit(1); });
