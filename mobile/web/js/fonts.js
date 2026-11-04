/*
 * גופנים לתיבות טקסט: שניים שמגיעים עם האפליקציה (Alef, IBM Plex) וכל מה שמותקן בטלפון.
 * מזהה גופן: 'alef' | 'plex' | 'sys:<משפחה>' — אותם מזהים כמו בדסקטופ, והמנוע המשותף
 * (Ops.buildDocument) מקבל את קובצי הגופנים ב-editFonts[מזהה].
 * כדי שהתצוגה תהיה כמו בקובץ השמור, גופן מהטלפון נטען לדף מאותם בייטים (FontFace).
 */
import { listFonts, readFont, readAsset } from './native.js';

export const BUILTIN = [
  { id: 'alef', label: 'Alef', css: "'Alef'" },
  { id: 'plex', label: 'IBM Plex Sans Hebrew', css: "'Plex'" },
];

export const isDevice = (id) => typeof id === 'string' && id.startsWith('sys:');
const familyOf = (id) => id.slice(4);
const cssName = (family) => 'EPF ' + family.replace(/["\\]/g, '');

export function fontLabel(id) {
  if (isDevice(id)) return familyOf(id);
  return (BUILTIN.find((f) => f.id === id) || BUILTIN[0]).label;
}

export function fontCss(id) {
  if (isDevice(id)) return `"${cssName(familyOf(id))}", 'Alef'`;
  return (BUILTIN.find((f) => f.id === id) || BUILTIN[0]).css;
}

let listP = null;
/** [{ family, hebrew, bold }] (נטען פעם אחת) */
export function deviceFonts() {
  if (!listP) listP = listFonts().catch((e) => { console.warn('רשימת הגופנים', e); listP = null; return []; });
  return listP;
}

const bytesCache = new Map(); // `${family}|${bold}` → Promise<{ bytes, bold }>
function fontBytes(family, bold) {
  const k = family + '|' + !!bold;
  if (!bytesCache.has(k)) bytesCache.set(k, readFont(family, bold).catch((e) => { bytesCache.delete(k); throw e; }));
  return bytesCache.get(k);
}

const faces = new Map(); // `${family}|${weight}` → Promise
/** טעינת גופן מהטלפון לדף (לתצוגה ולמדידה). מודגש בלי קובץ מודגש — הקובץ הרגיל, כמו בשמירה */
export function ensureFace(id, bold) {
  if (!isDevice(id)) return document.fonts.load(`${bold ? 700 : 400} 16px ${fontCss(id)}`).catch(() => {});
  const family = familyOf(id);
  const weight = bold ? 700 : 400;
  const k = family + '|' + weight;
  if (!faces.has(k)) {
    faces.set(k, (async () => {
      const { bytes } = await fontBytes(family, bold);
      const face = new FontFace(cssName(family), bytes, { weight: String(weight) });
      await face.load();
      document.fonts.add(face);
    })().catch((e) => { faces.delete(k); console.warn('טעינת גופן', family, e); }));
  }
  return faces.get(k);
}

let plexP = null;
/** קובצי הגופנים לשמירה: IBM Plex וכל גופן מהטלפון שמופיע בתיבות הטקסט של המסמך */
export async function editFontsFor(doc, onWarning) {
  if (!plexP) plexP = Promise.all([readAsset('fonts/IBMPlexSansHebrew-Regular.ttf'), readAsset('fonts/IBMPlexSansHebrew-Bold.ttf')]).then(([regular, bold]) => ({ regular, bold }));
  const out = { plex: await plexP };
  for (const list of Object.values(doc.stamps)) {
    for (const it of list) {
      if (it.type !== 'text' || !isDevice(it.font)) continue;
      const family = familyOf(it.font);
      try {
        const f = out[it.font] || (out[it.font] = { regular: (await fontBytes(family, false)).bytes });
        if (it.bold && !f.bold) { const r = await fontBytes(family, true); f.bold = r.bold ? r.bytes : f.regular; }
      } catch (e) {
        if (onWarning) onWarning(`הגופן "${family}" לא נמצא בטלפון — הטקסט נכתב ב-Alef`);
      }
    }
  }
  return out;
}
