/* יצירת קבצי PDF לדוגמה בעברית (לבדיקות ולצילומי מסך): node test/make-fixtures.js */
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const H = require('../src/core/hebrew.js');

const DIR = path.join(__dirname, 'fixtures');
const font = (n) => fs.readFileSync(path.join(__dirname, '../assets/fonts', n));
const ink = rgb(0.12, 0.14, 0.19);
const grey = rgb(0.45, 0.48, 0.52);

const PARAS = [
  'הואיל והמשכיר הוא הבעלים של הדירה המתוארת בנספח א\' להסכם זה, והואיל והשוכר מעוניין לשכור את הדירה לתקופה של 12 חודשים החל מיום 01/01/2027;',
  'דמי השכירות החודשיים יעמדו על סך של 6,450 ש"ח (שישה אלף ארבע מאות וחמישים שקלים חדשים), וישולמו עד ה-5 בכל חודש בהעברה בנקאית.',
  'השוכר יפקיד בידי המשכיר ערבות בנקאית בסך 19,350 ש"ח (שלושה חודשי שכירות) להבטחת קיום התחייבויותיו לפי הסכם זה.',
  'השוכר מתחייב לשמור על הדירה במצב תקין ולהחזירה בתום תקופת השכירות כפי שקיבל אותה, למעט בלאי סביר הנובע משימוש רגיל.',
  'כל שינוי בהסכם זה ייעשה בכתב ובחתימת שני הצדדים. לפרטים נוספים: טלפון 03-5551234 או דוא"ל office@example.co.il.',
];

async function contract() {
  const d = await PDFDocument.create();
  const reg = await H.embedFont(d, font('Alef-Regular.ttf'), fontkit);
  const bold = await H.embedFont(d, font('Alef-Bold.ttf'));
  for (let pn = 1; pn <= 3; pn++) {
    const p = d.addPage([595.28, 841.89]);
    let y = 780;
    if (pn === 1) {
      H.drawText(p, 'הסכם שכירות בלתי מוגנת', { x: 60, y, width: 475, size: 24, font: bold, color: ink, align: 'center' });
      y -= 46;
      H.drawText(p, 'שנערך ונחתם בתל אביב ביום 15 בדצמבר 2026', { x: 60, y, width: 475, size: 12, font: reg, color: grey, align: 'center' });
      y -= 50;
    } else {
      H.drawText(p, `סעיף ${pn + 3}`, { x: 60, y, width: 475, size: 16, font: bold, color: ink });
      y -= 36;
    }
    for (let i = 0; i < 5; i++) {
      const t = `${(pn - 1) * 5 + i + 1}. ${PARAS[(i + pn) % PARAS.length]}`;
      const r = H.drawText(p, t, { x: 60, y, width: 475, size: 12.5, font: reg, color: ink, lineHeight: 1.6 });
      y -= r.height + 14;
    }
    if (pn === 3) {
      y -= 30;
      p.drawLine({ start: { x: 355, y: y - 40 }, end: { x: 535, y: y - 40 }, thickness: 0.8, color: grey });
      p.drawLine({ start: { x: 60, y: y - 40 }, end: { x: 240, y: y - 40 }, thickness: 0.8, color: grey });
      H.drawText(p, 'המשכיר', { x: 355, y: y - 46, width: 180, size: 11, font: reg, color: grey, align: 'center' });
      H.drawText(p, 'השוכר', { x: 60, y: y - 46, width: 180, size: 11, font: reg, color: grey, align: 'center' });
    }
    H.drawText(p, `עמוד ${pn} מתוך 3`, { x: 60, y: 40, width: 475, size: 9, font: reg, color: grey, align: 'center' });
  }
  return d.save();
}

async function form() {
  const d = await PDFDocument.create();
  const reg = await H.embedFont(d, font('Alef-Regular.ttf'), fontkit);
  const bold = await H.embedFont(d, font('Alef-Bold.ttf'));
  const p = d.addPage([595.28, 841.89]);
  H.drawText(p, 'טופס בקשה להחזר הוצאות', { x: 60, y: 785, width: 475, size: 22, font: bold, color: ink });
  H.drawText(p, 'יש למלא את כל השדות ולצרף קבלות מקוריות.', { x: 60, y: 748, width: 475, size: 11, font: reg, color: grey });
  const f = d.getForm();
  const rows = [
    ['שם מלא', 'full_name', 690], ['מספר זהות', 'id_number', 640], ['מחלקה', 'department', 590], ['סכום לתשלום (ש"ח)', 'amount', 540],
  ];
  for (const [label, name, y] of rows) {
    H.drawText(p, label, { x: 400, y: y + 20, width: 135, size: 12, font: reg, color: ink });
    const t = f.createTextField(name);
    t.addToPage(p, { x: 120, y, width: 270, height: 24, borderColor: rgb(0.7, 0.72, 0.75), borderWidth: 0.8 });
    t.setFontSize(12);
  }
  H.drawText(p, 'פירוט ההוצאה', { x: 400, y: 510, width: 135, size: 12, font: reg, color: ink });
  const notes = f.createTextField('details');
  notes.enableMultiline();
  notes.addToPage(p, { x: 60, y: 380, width: 475, height: 110, borderColor: rgb(0.7, 0.72, 0.75), borderWidth: 0.8 });
  notes.setFontSize(11);
  const c = f.createCheckBox('confirm');
  c.addToPage(p, { x: 517, y: 340, width: 16, height: 16, borderColor: rgb(0.5, 0.52, 0.55), borderWidth: 0.8 });
  H.drawText(p, 'אני מצהיר/ה שכל הפרטים נכונים', { x: 260, y: 356, width: 248, size: 12, font: reg, color: ink });
  p.drawLine({ start: { x: 355, y: 250 }, end: { x: 535, y: 250 }, thickness: 0.8, color: grey });
  H.drawText(p, 'חתימת העובד/ת', { x: 355, y: 244, width: 180, size: 11, font: reg, color: grey, align: 'center' });
  return d.save();
}

async function annex() {
  const d = await PDFDocument.create();
  const reg = await H.embedFont(d, font('Alef-Regular.ttf'), fontkit);
  const bold = await H.embedFont(d, font('Alef-Bold.ttf'));
  const p = d.addPage([841.89, 595.28]);
  H.drawText(p, 'נספח א\' — טבלת תשלומים', { x: 50, y: 545, width: 741, size: 20, font: bold, color: ink });
  const cols = ['חודש', 'סכום', 'תאריך פירעון', 'אסמכתא'];
  const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט'];
  const cw = 741 / 4;
  cols.forEach((c, i) => H.drawText(p, c, { x: 50 + 741 - (i + 1) * cw, y: 490, width: cw - 10, size: 12, font: bold, color: ink }));
  months.forEach((m, r) => {
    const y = 460 - r * 44;
    p.drawLine({ start: { x: 50, y: y + 12 }, end: { x: 791, y: y + 12 }, thickness: 0.4, color: rgb(0.8, 0.82, 0.84) });
    const vals = [m, '6,450 ש"ח', `05/${String(r + 1).padStart(2, '0')}/2027`, `TR-${48210 + r}`];
    vals.forEach((v, i) => H.drawText(p, v, { x: 50 + 741 - (i + 1) * cw, y, width: cw - 10, size: 12, font: reg, color: ink }));
  });
  const p2 = d.addPage([595.28, 841.89]);
  H.drawText(p2, 'נספח ב\' — תיאור הדירה', { x: 60, y: 780, width: 475, size: 20, font: bold, color: ink });
  H.drawText(p2, 'דירת 4 חדרים בקומה 3, רחוב הרצל 42, תל אביב. שטח: 96 מ"ר, מרפסת שמש של 12 מ"ר, חניה מקורה ומחסן.', { x: 60, y: 730, width: 475, size: 13, font: reg, color: ink, lineHeight: 1.6 });
  return d.save();
}

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, 'הסכם שכירות.pdf'), await contract());
  fs.writeFileSync(path.join(DIR, 'טופס החזר הוצאות.pdf'), await form());
  fs.writeFileSync(path.join(DIR, 'נספחים.pdf'), await annex());
  console.log('נוצרו קבצי דוגמה ב-' + DIR);
})();
