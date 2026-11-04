/*
 * המסמך הפתוח: רשימת קבצי מקור + רשימת עמודים (איזה עמוד מאיזה מקור, וסיבוב).
 * אותו מבנה כמו בגרסת Windows, כך שהשמירה עוברת דרך Ops.buildDocument של המנוע המשותף.
 */
import { openPdf, pdfjsLib, PDFJS_OPTS } from './pdf.js';
import { iso } from './ui.js';

const Ops = window.PdfOps;
let seq = 1;

export function isPdf(bytes) {
  // החתימה %PDF יכולה להופיע קצת אחרי תחילת הקובץ
  return new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF');
}

function hasBytes(bytes, needle) {
  const n = new TextEncoder().encode(needle);
  outer: for (let i = 0; i <= bytes.length - n.length; i++) {
    if (bytes[i] !== n[0]) continue;
    for (let k = 1; k < n.length; k++) if (bytes[i + k] !== n[k]) continue outer;
    return true;
  }
  return false;
}

export const baseName = (name) => String(name || 'מסמך').replace(/\.pdf$/i, '');

/**
 * טעינת קובץ מקור. קובץ מוצפן מפוענח (עם סיסמה אם צריך), כמו בדסקטופ;
 * ההגנה מוחלת מחדש בשמירה.
 * askPassword(name, wrong) → סיסמה או null.  מחזיר null אם המשתמש ביטל.
 */
export async function loadSource(file, askPassword) {
  let bytes = file.bytes;
  if (!isPdf(bytes)) throw new Error(`"${iso(file.name)}" אינו קובץ PDF.`);
  let security = null;
  if (hasBytes(bytes, '/Encrypt')) {
    let sec = null;
    try { sec = await Ops.inspectSecurity(bytes); } catch { sec = null; }
    if (sec && sec.encrypted) {
      let password = '';
      if (sec.needsPassword) {
        let wrong = false;
        for (;;) {
          password = await askPassword(file.name, wrong);
          if (password == null) return null;
          if (await Ops.checkPassword(bytes, password)) break;
          wrong = true;
        }
      }
      try {
        bytes = new Uint8Array(await Ops.decrypt(bytes, password));
      } catch (e) {
        throw new Error(`לא הצלחנו לפענח את "${iso(file.name)}": ${e.message}`);
      }
      const perms = sec.permissions;
      security = {
        password: sec.needsPassword ? password : '',
        permissions: perms && Ops.PERMISSION_KEYS.some((k) => perms[k] === false) ? perms : null,
      };
    }
  }
  let pdf;
  try {
    pdf = await openPdf(bytes);
  } catch {
    throw new Error(`לא הצלחנו לפתוח את "${iso(file.name)}". ייתכן שהקובץ פגום.`);
  }
  const src = { id: 's' + seq++, name: file.name, bytes, pdf, security, signatures: [] };
  // חתימות דיגיטליות קיימות — נבדקות ברקע (כמו בדסקטופ)
  src.signaturesReady = hasBytes(bytes, '/ByteRange') && window.DigiSig
    ? window.DigiSig.verify(bytes).then((list) => { src.signatures = list || []; }).catch(() => {})
    : Promise.resolve();
  return src;
}

export class Doc {
  /** first: מקור ראשון (מ-loadSource); file: { uri, writable, name } של הקובץ שנפתח */
  constructor(first, file) {
    this.sources = new Map();
    this.pages = [];
    this.name = baseName(file.name);
    this.origin = { uri: file.uri || null, writable: !!file.writable, name: file.name };
    this.security = first.security;
    this.dirty = false;
    this.history = [];
    this.stamps = {};      // pageKey -> [{ id, type: 'text'|'image', x, y, w, h, ... }] — כמו בדסקטופ
    this.formValues = {};  // srcId -> { fieldName: value }
    // סימן מים ומספרי עמודים — אותן ברירות מחדל כמו בדסקטופ
    this.extras = {
      watermark: { enabled: false, text: 'טיוטה', size: 64, opacity: 0.16, color: '#C23A2E' },
      pageNumbers: { enabled: false, position: 'bottom-center', format: 'עמוד {n} מתוך {total}', size: 10, skipFirst: false },
    };
    this.addSource(first, { initial: true });
  }

  addSource(src, { initial = false } = {}) {
    if (!initial) this.snapshot();
    this.sources.set(src.id, src);
    for (let i = 0; i < src.pdf.numPages; i++) this.pages.push({ key: `${src.id}:${i}`, src: src.id, index: i, rotate: 0 });
    if (!initial) this.dirty = true;
  }

  /* ---------- היסטוריה (ביטול) ---------- */

  snapshot() {
    this.history.push({
      pages: this.pages.map((p) => ({ ...p })),
      stamps: JSON.parse(JSON.stringify(this.stamps)),
      formValues: JSON.parse(JSON.stringify(this.formValues)),
      extras: JSON.parse(JSON.stringify(this.extras)),
      dirty: this.dirty,
    });
    if (this.history.length > 30) this.history.shift();
  }

  undo() {
    const h = this.history.pop();
    if (!h) return false;
    this.pages = h.pages;
    this.stamps = h.stamps;
    this.formValues = h.formValues;
    this.extras = h.extras;
    this.dirty = h.dirty;
    return true;
  }

  /* ---------- חותמות (חתימה / טקסט / תאריך) ---------- */

  addStamp(pageKey, item) {
    this.snapshot();
    (this.stamps[pageKey] = this.stamps[pageKey] || []).push(item);
    this.dirty = true;
  }

  findStamp(id) {
    for (const [key, list] of Object.entries(this.stamps)) {
      const it = list.find((x) => x.id === id);
      if (it) return { key, item: it };
    }
    return null;
  }

  /** שינוי חותמת. withHistory=false — לשינויים רציפים (גרירה) שכבר נשמרה לפניהם היסטוריה */
  updateStamp(id, patch, { withHistory = true } = {}) {
    const f = this.findStamp(id);
    if (!f) return;
    if (withHistory) this.snapshot();
    Object.assign(f.item, patch);
    this.dirty = true;
  }

  removeStamp(id) {
    const f = this.findStamp(id);
    if (!f) return;
    this.snapshot();
    this.stamps[f.key] = this.stamps[f.key].filter((x) => x.id !== id);
    this.dirty = true;
  }

  setExtras(kind, patch) {
    this.snapshot();
    Object.assign(this.extras[kind], patch);
    this.dirty = true;
  }

  /* ---------- טפסים ---------- */

  /** שדות הטופס שאפשר למלא במקור (נטען פעם אחת) */
  async fields(srcId) {
    const src = this.sources.get(srcId);
    if (!src.fields) {
      try {
        src.fields = (await Ops.getFormFields(src.bytes))
          .filter((f) => !f.readOnly && f.page >= 0 && f.rect && ['TextField', 'CheckBox', 'RadioGroup', 'Dropdown', 'OptionList'].includes(f.type));
      } catch {
        src.fields = [];
      }
    }
    return src.fields;
  }

  fieldValue(srcId, field) {
    const v = this.formValues[srcId];
    return v && field.name in v ? v[field.name] : field.value;
  }

  setFieldValue(srcId, name, value) {
    this.snapshot();
    (this.formValues[srcId] = this.formValues[srcId] || {})[name] = value;
    this.dirty = true;
  }

  /* ---------- פעולות על עמודים ---------- */

  rotate(keys, deg) {
    this.snapshot();
    for (const p of this.pages) if (keys.has(p.key)) p.rotate = (((p.rotate + deg) % 360) + 360) % 360;
    this.dirty = true;
  }

  remove(keys) {
    this.snapshot();
    this.pages = this.pages.filter((p) => !keys.has(p.key));
    this.dirty = true;
  }

  reorder(keysInOrder) {
    const byKey = new Map(this.pages.map((p) => [p.key, p]));
    const next = keysInOrder.map((k) => byKey.get(k)).filter(Boolean);
    if (next.length !== this.pages.length || next.every((p, i) => p === this.pages[i])) return false;
    this.snapshot();
    this.pages = next;
    this.dirty = true;
    return true;
  }

  /** עמודים לתצוגה: { key, pdf, index, rotate } */
  refs() {
    return this.pages.map((p) => ({ key: p.key, pdf: this.sources.get(p.src).pdf, index: p.index, rotate: p.rotate }));
  }

  /* ---------- שמירה ---------- */

  /**
   * בניית הקובץ דרך המנוע המשותף.
   * pages — ברירת מחדל: כל העמודים. protect=false — בלי הצפנה (לפני פיצול)
   */
  async build(fonts, { pages = this.pages, protect = true, onWarning, editFonts } = {}) {
    const sources = {};
    for (const s of this.sources.values()) sources[s.id] = s.bytes;
    const ex = this.extras;
    const redacted = pages.map((p, i) => [i, (this.stamps[p.key] || []).filter((it) => it.type === 'redact')]).filter(([, r]) => r.length);
    // מיקום החתימה הדיגיטלית הוא לא חותמת — היא נוצרת רק בחתימה עצמה
    const stamps = {};
    for (const [k, list] of Object.entries(this.stamps)) stamps[k] = list.filter((it) => it.type !== 'digisig');
    const out = await Ops.buildDocument(sources, pages.map((p) => ({ ...p })), stamps, this.formValues, {
      fonts,
      editFonts, // גופנים לתיבות טקסט (IBM Plex וגופנים מהטלפון) — ראו js/fonts.js
      // בהשחרה משטחים את הטפסים — אחרת הערכים נשארים בשדות שמתחת (כמו בדסקטופ)
      flattenForms: redacted.length > 0,
      watermark: ex.watermark.enabled && ex.watermark.text.trim() ? ex.watermark : null,
      pageNumbers: ex.pageNumbers.enabled ? ex.pageNumbers : null,
      onWarning,
    });
    // השחרה אמיתית — אותו מימוש כמו בדסקטופ (src/core/redact.js)
    const result = redacted.length ? await window.Redact.applyRedactions(out, redacted, { pdfjsLib, pdfjsOpts: PDFJS_OPTS }) : out;
    return protect ? this.protect(result) : result;
  }

  /** החלה מחדש של ההגנה שהייתה בקובץ המקורי (סיסמה / הגבלות) */
  async protect(bytes) {
    const st = this.security;
    if (!st || (!st.password && !st.permissions)) return bytes;
    return Ops.encrypt(bytes, { userPassword: st.password, permissions: st.permissions || undefined });
  }

  /* ---------- חתימה דיגיטלית ---------- */

  /** חתימות דיגיטליות קיימות במקורות שבשימוש */
  async existingSignatures() {
    const used = new Set(this.pages.map((p) => p.src));
    const srcs = [...this.sources.values()].filter((s) => used.has(s.id));
    await Promise.all(srcs.map((s) => s.signaturesReady));
    return srcs.flatMap((s) => s.signatures || []);
  }

  /** מיקום החתימה הדיגיטלית הגלויה (אם הוצבה) */
  findDigiSig() {
    for (let i = 0; i < this.pages.length; i++) {
      const it = (this.stamps[this.pages[i].key] || []).find((x) => x.type === 'digisig');
      if (it) return { item: it, pageIndex: i, key: this.pages[i].key };
    }
    return null;
  }

  /**
   * אם המסמך לא שונה (קובץ אחד, אותם עמודים, בלי תוספות) — חותמים על הקובץ המקורי עצמו,
   * בעדכון מצטבר, כך שחתימות קודמות נשארות תקפות. אותם תנאים כמו בדסקטופ.
   */
  canSignOriginal() {
    if (this.sources.size !== 1) return null;
    const src = [...this.sources.values()][0];
    if (src.security) return null; // פוענח — הבייטים כבר לא המקור
    if (this.pages.length !== src.pdf.numPages || this.pages.some((p, i) => p.src !== src.id || p.index !== i || p.rotate)) return null;
    if (Object.values(this.stamps).some((l) => l.some((it) => it.type !== 'digisig'))) return null;
    if (Object.values(this.formValues).some((v) => v && Object.keys(v).length)) return null;
    if (this.extras.watermark.enabled || this.extras.pageNumbers.enabled) return null;
    return src;
  }

  destroy() {
    for (const s of this.sources.values()) s.pdf.destroy();
    this.sources.clear();
  }
}
