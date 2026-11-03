/*
 * בדיקה של החתימה הדיגיטלית כפי שהיא רצה באפליקציה:
 * טוענים את www/ (אחרי build-web) בסביבה של דפדפן — בלי require ובלי crypto של Node —
 * יוצרים תעודה, חותמים, ומאמתים גם בתוך הסביבה וגם עם digisig.js של גרסת Windows
 * (שרץ עם crypto האמיתי של Node). כך מוודאים שהחתימה מהטלפון תקינה גם מחוץ לאפליקציה.
 *
 * הרצה: npm test (בתיקיית mobile)
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(MOBILE, '..');
const WWW = path.join(MOBILE, 'www');
const require = createRequire(import.meta.url);
const Desktop = require(path.join(ROOT, 'src/core/digisig.js'));
const { PDFDocument } = require(path.join(ROOT, 'node_modules/pdf-lib'));

if (!fs.existsSync(path.join(WWW, 'core/digisig.bundle.js'))) {
  console.error('חסר www/ — הריצו קודם node scripts/build-web.mjs');
  process.exit(1);
}

const ctx = vm.createContext({
  console, setTimeout, clearTimeout, TextEncoder, TextDecoder, atob, btoa, structuredClone,
  crypto: webcrypto,
});
vm.runInContext('var self = globalThis; var window = globalThis;', ctx);
assert.strictEqual(vm.runInContext('typeof require + typeof process + typeof Buffer', ctx), 'undefinedundefinedundefined');
for (const rel of ['vendor/pdf-lib.min.js', 'vendor/fontkit.umd.min.js', 'vendor/bidi.min.js', 'core/hebrew.js', 'core/textedit.js', 'core/ops.js', 'core/digisig.bundle.js']) {
  vm.runInContext(fs.readFileSync(path.join(WWW, rel), 'utf8'), ctx, { filename: rel });
}
const D = vm.runInContext('DigiSig', ctx);
const u8 = vm.runInContext('(b) => new Uint8Array(b)', ctx); // מערכים מתוך הסביבה, כמו בדפדפן

let passed = 0;
async function ok(name, fn) {
  await fn();
  passed++;
  console.log('✓', name);
}

const fonts = {
  regular: u8(fs.readFileSync(path.join(ROOT, 'assets/fonts/Alef-Regular.ttf'))),
  bold: u8(fs.readFileSync(path.join(ROOT, 'assets/fonts/Alef-Bold.ttf'))),
};
const src = await (async () => {
  const d = await PDFDocument.create();
  d.addPage([595, 842]);
  d.addPage([842, 595]);
  return u8(await d.save());
})();

let p12, signed;

await ok('יצירת תעודה אישית בתוך ה-WebView', async () => {
  p12 = D.createSelfSigned({ name: 'קובי איתן', email: 'test@example.com', password: '1234' });
  const info = D.p12Info(p12, '1234');
  assert.strictEqual(info.name, 'קובי איתן');
  assert.strictEqual(info.selfSigned, true);
  assert.strictEqual(info.expired, false);
  // אותה תעודה נקראת גם בדסקטופ
  assert.strictEqual(Desktop.p12Info(Buffer.from(p12), '1234').name, 'קובי איתן');
});

await ok('סיסמה שגויה — הודעה בעברית', async () => {
  assert.throws(() => D.p12Info(p12, 'wrong'), /הסיסמה של קובץ התעודה שגויה/);
});

await ok('חתימה גלויה בעברית, ואימות בתוך ה-WebView', async () => {
  signed = await D.signPdf(src, D.p12Signer(p12, '1234'), {
    pageIndex: 1,
    rect: { x: 560, y: 380, w: 220, h: 70 },
    name: 'קובי איתן',
    reason: 'אישור החוזה',
    location: 'מודיעין עילית',
    appearance: { fonts, signer: 'קובי איתן', date: '03/11/2026 10:30', reason: 'אישור החוזה', location: 'מודיעין עילית', color: '#1F35B5' },
  });
  const res = await D.verify(signed);
  assert.strictEqual(res.length, 1);
  assert.strictEqual(res[0].intact, true, res[0].error);
  assert.strictEqual(res[0].coversWholeFile, true);
  assert.strictEqual(res[0].certSubject, 'קובי איתן');
  assert.strictEqual(res[0].reason, 'אישור החוזה');
  fs.mkdirSync(path.join(MOBILE, 'test-out'), { recursive: true });
  fs.writeFileSync(path.join(MOBILE, 'test-out/signed-mobile.pdf'), signed);
});

await ok('החתימה מהטלפון תקינה גם באימות של גרסת Windows (crypto של Node)', async () => {
  const res = await Desktop.verify(Buffer.from(signed));
  assert.strictEqual(res.length, 1);
  assert.strictEqual(res[0].intact, true, res[0].error);
  assert.strictEqual(res[0].coversWholeFile, true);
  assert.strictEqual(res[0].selfSigned, true);
});

await ok('שינוי בקובץ אחרי החתימה מתגלה', async () => {
  const t = u8(signed);
  t[300] ^= 1;
  const res = await D.verify(t);
  assert.strictEqual(res[0].intact, false);
});

await ok('חתימה שנייה (תעודה שנוצרה בדסקטופ) מצטברת ושומרת על הראשונה', async () => {
  const other = u8(Desktop.createSelfSigned({ name: 'Second Signer', password: '' }));
  const twice = await D.signPdf(signed, D.p12Signer(other, ''), { pageIndex: 0, rect: null, name: 'Second Signer' });
  for (const res of [await D.verify(twice), await Desktop.verify(Buffer.from(twice))]) {
    assert.strictEqual(res.length, 2);
    assert.ok(res.every((r) => r.intact), JSON.stringify(res.map((r) => r.error)));
    assert.strictEqual(JSON.stringify(res.map((r) => r.coversWholeFile)), '[false,true]');
  }
});

console.log(`\n${passed} בדיקות חתימה דיגיטלית עברו.`);
