/*
 * פעולות PDF: הרכבה (איחוד/סידור/סיבוב/מחיקה), פיצול, מילוי טפסים,
 * חותמות (טקסט/חתימה/תאריך), סימן מים, מספור עמודים ותמונות ל-PDF.
 * כל הפעולות מקומיות לחלוטין — שום קובץ לא יוצא מהמחשב.
 *
 * עובד ב-Node (בדיקות) ובדפדפן (window.PdfOps).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('pdf-lib'), require('@pdf-lib/fontkit'), require('./hebrew.js'), require('./textedit.js'));
  } else {
    root.PdfOps = factory(root.PDFLib, root.fontkit, root.HebrewPDF, root.TextEdit);
  }
})(typeof self !== 'undefined' ? self : this, function (PDFLib, fontkit, H, TE) {
  'use strict';

  const { PDFDocument, PDFName, PDFHexString, PDFDict, PDFStream, degrees, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix, StandardFonts, LineCapStyle } = PDFLib;

  const LOAD_OPTS = { ignoreEncryption: true, updateMetadata: false };

  /**
   * טעינת מסמך. קבצים מוצפנים נטענים מפוענחים כשיש סיסמה; בלי סיסמה — רק לזיהוי
   * (קובץ מוצפן שלא פוענח לא אמור להגיע לכאן: בפתיחה מפענחים אותו בעזרת decrypt).
   */
  async function load(bytes, password) {
    if (password != null) return PDFDocument.load(bytes, { password, updateMetadata: false });
    return PDFDocument.load(bytes, LOAD_OPTS);
  }

  /* ---------- סיסמה והרשאות ---------- */

  const PERMISSION_KEYS = ['printing', 'copying', 'modifying', 'annotating', 'fillingForms', 'documentAssembly'];

  /** הרשאות מתוך מילון ההצפנה (שדה P). ביטים לפי תקן PDF, טבלה 22 */
  function readPermissions(doc) {
    const enc = doc.context.lookup(doc.context.trailerInfo.Encrypt);
    if (!(enc instanceof PDFDict)) return null;
    const pObj = enc.get(PDFName.of('P'));
    const p = pObj && typeof pObj.asNumber === 'function' ? pObj.asNumber() | 0 : -1;
    const bit = (n) => (p & (1 << (n - 1))) !== 0;
    return {
      printing: bit(3) ? (bit(12) ? 'highResolution' : 'lowResolution') : false,
      modifying: bit(4), copying: bit(5), annotating: bit(6), fillingForms: bit(9), documentAssembly: bit(11),
    };
  }

  /**
   * מצב האבטחה של קובץ: { encrypted, needsPassword, permissions }
   * needsPassword=false בקובץ מוצפן = קובץ עם הגבלות בלבד, שנפתח בלי סיסמה.
   */
  async function inspectSecurity(bytes) {
    const raw = await PDFDocument.load(bytes, LOAD_OPTS);
    if (!raw.isEncrypted) return { encrypted: false, needsPassword: false, permissions: null };
    const permissions = readPermissions(raw);
    try {
      await PDFDocument.load(bytes, { password: '', updateMetadata: false });
      return { encrypted: true, needsPassword: false, permissions };
    } catch (e) {
      return { encrypted: true, needsPassword: true, permissions };
    }
  }

  /** האם הסיסמה פותחת את הקובץ */
  async function checkPassword(bytes, password) {
    try { await PDFDocument.load(bytes, { password, updateMetadata: false }); return true; } catch (e) { return false; }
  }

  /**
   * הסרת ההצפנה: מחזיר קובץ רגיל. זורק 'סיסמה שגויה' כשהסיסמה לא מתאימה.
   * (לקובץ עם הגבלות בלבד — password='')
   */
  async function decrypt(bytes, password) {
    const raw = await PDFDocument.load(bytes, LOAD_OPTS);
    if (!raw.isEncrypted) return bytes;
    const encRef = raw.context.trailerInfo.Encrypt;
    let doc;
    try {
      doc = await PDFDocument.load(bytes, { password: password || '', updateMetadata: false });
    } catch (e) {
      throw new Error('הסיסמה שגויה');
    }
    // טבלאות הפניה ישנות (XRef) נשארות כאובייקטים ומחזירות את סימון ההצפנה — מוחקים אותן
    const ctx = doc.context;
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      const dict = obj instanceof PDFDict ? obj : obj instanceof PDFStream ? obj.dict : null;
      if (dict && dict.get(PDFName.of('Type')) === PDFName.of('XRef')) ctx.delete(ref);
    }
    if (encRef instanceof PDFLib.PDFRef) ctx.delete(encRef);
    delete ctx.trailerInfo.Encrypt;
    return doc.save();
  }

  function randomPassword() {
    const a = new Uint8Array(18);
    (typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto : require('crypto').webcrypto).getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * הצפנה (AES-256).
   * opts: { userPassword, ownerPassword, permissions: { printing, copying, modifying, annotating, fillingForms, documentAssembly } }
   * בלי userPassword — הקובץ נפתח לכולם ורק ההגבלות חלות. בלי ownerPassword — נוצרת סיסמה אקראית,
   * כדי שאי אפשר יהיה לבטל את ההגבלות עם סיסמת הפתיחה.
   */
  async function encrypt(bytes, opts) {
    const o = opts || {};
    const doc = await load(bytes);
    const perms = {};
    for (const k of PERMISSION_KEYS) {
      const v = o.permissions ? o.permissions[k] : undefined;
      perms[k] = k === 'printing' ? (v === false ? false : v === 'lowResolution' ? 'lowResolution' : 'highResolution') : v !== false;
    }
    const restricted = PERMISSION_KEYS.some((k) => perms[k] === false || (k === 'printing' && perms[k] !== 'highResolution'));
    const userPassword = o.userPassword || '';
    if (!userPassword && !restricted) return bytes;
    const ownerPassword = o.ownerPassword || (restricted ? randomPassword() : userPassword);
    doc.encrypt({ userPassword, ownerPassword, permissions: perms });
    return doc.save();
  }

  /* ---------- טווחי עמודים ---------- */

  /**
   * "1-3, 5, 8-" → [[0,1,2],[4],[7..n-1]] (אינדקסים מאפס). זורק שגיאה בעברית על קלט לא תקין.
   */
  function parseRanges(input, total) {
    const parts = String(input || '').split(/[,;،\s]+/).filter(Boolean);
    if (!parts.length) throw new Error('לא הוזנו טווחי עמודים');
    return parts.map((p) => {
      const m = p.match(/^(\d*)\s*[-–]\s*(\d*)$/);
      let a, b;
      if (m) {
        a = m[1] ? +m[1] : 1;
        b = m[2] ? +m[2] : total;
      } else if (/^\d+$/.test(p)) {
        a = b = +p;
      } else throw new Error(`הטווח "${p}" לא תקין. דוגמה תקינה: 1-3, 5, 8-`);
      if (a < 1 || b > total || a > b) throw new Error(`הטווח "${p}" מחוץ למסמך (יש ${total} עמודים)`);
      const out = [];
      for (let i = a; i <= b; i++) out.push(i - 1);
      return out;
    });
  }

  function chunk(total, every) {
    const n = Math.max(1, Math.floor(every));
    const out = [];
    for (let i = 0; i < total; i += n) out.push(Array.from({ length: Math.min(n, total - i) }, (_, k) => i + k));
    return out;
  }

  /* ---------- מערכת קואורדינטות של התצוגה ---------- */

  /**
   * מריץ ציור בתוך "מסגרת תצוגה": ראשית בפינה השמאלית-תחתונה של העמוד כפי שהוא נראה
   * על המסך (אחרי סיבוב), ציר X ימינה וציר Y למעלה. כך חותמות שהמשתמש מיקם בתצוגה
   * נוחתות בדיוק באותו מקום גם בעמודים מסובבים.
   */
  function withViewFrame(page, fn) {
    const box = page.getCropBox();
    const { x: x0, y: y0, width: w, height: h } = box;
    const r = ((page.getRotation().angle % 360) + 360) % 360;
    let m, viewW, viewH;
    if (r === 90) { m = [0, 1, -1, 0, x0 + w, y0]; viewW = h; viewH = w; }
    else if (r === 180) { m = [-1, 0, 0, -1, x0 + w, y0 + h]; viewW = w; viewH = h; }
    else if (r === 270) { m = [0, -1, 1, 0, x0, y0 + h]; viewW = h; viewH = w; }
    else { m = [1, 0, 0, 1, x0, y0]; viewW = w; viewH = h; }
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...m));
    try {
      fn(viewW, viewH);
    } finally {
      page.pushOperators(popGraphicsState());
    }
  }

  /** גודל העמוד כפי שהוא מוצג (אחרי סיבוב) */
  function viewSize(page) {
    const { width, height } = page.getCropBox();
    const r = ((page.getRotation().angle % 360) + 360) % 360;
    return r === 90 || r === 270 ? { width: height, height: width } : { width, height };
  }

  function hexToRgb(hex) {
    const h = String(hex || '#000000').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  function dataUrlToBytes(dataUrl) {
    const b64 = dataUrl.split(',')[1];
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return Uint8Array.from(Buffer.from(b64, 'base64'));
  }

  async function embedImage(doc, src) {
    const bytes = typeof src === 'string' ? dataUrlToBytes(src) : src;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    return isPng ? doc.embedPng(bytes) : doc.embedJpg(bytes);
  }

  /** סימוני V / X: נתיבים בתיבה של 24×24 (כמו ה-SVG בעורך), עובי קו ביחידות התיבה */
  const MARK_PATHS = {
    check: 'M4 12.5 9.5 18 20 6',
    x: 'M5.5 5.5 18.5 18.5M18.5 5.5 5.5 18.5',
  };
  const MARK_STROKE = 3;

  /**
   * ציור חותמות על עמוד. קואורדינטות ביחידות PDF, ראשית בפינה השמאלית-עליונה של התצוגה.
   * stamp: { type: 'text'|'image'|'rect'|'mark', x, y, w, h, text, size, color, align, image(dataUrl|bytes), opacity, shape('check'|'x') }
   */
  async function drawStamps(doc, page, stamps, fonts) {
    const images = [];
    for (const s of stamps) if (s.type === 'image') images.push(await embedImage(doc, s.image));
    let imgIdx = 0;
    withViewFrame(page, (vw, vh) => {
      for (const s of stamps) {
        if (s.type === 'image') {
          const img = images[imgIdx++];
          page.drawImage(img, { x: s.x, y: vh - s.y - s.h, width: s.w, height: s.h, opacity: s.opacity == null ? 1 : s.opacity });
        } else if (s.type === 'text' && s.text) {
          H.drawText(page, s.text, {
            x: s.x, y: vh - s.y, width: s.w, size: s.size || 14,
            font: s.bold ? fonts.bold : fonts.regular,
            color: hexToRgb(s.color), align: s.align, opacity: s.opacity,
          });
        } else if (s.type === 'rect') {
          page.drawRectangle({ x: s.x, y: vh - s.y - s.h, width: s.w, height: s.h, color: hexToRgb(s.color || '#ffffff') });
        } else if (s.type === 'mark') {
          // וקטורי: חד בכל זום ובהדפסה
          page.drawSvgPath(MARK_PATHS[s.shape] || MARK_PATHS.check, {
            x: s.x, y: vh - s.y, scale: s.w / 24,
            borderColor: hexToRgb(s.color), borderWidth: MARK_STROKE,
            borderLineCap: LineCapStyle.Round,
          });
        }
      }
    });
  }

  /** שורות הטקסט של חתימה דיגיטלית גלויה */
  function digiSigLines(s) {
    const lines = [`נחתם דיגיטלית ע"י ${s.signer || ''}`.trim()];
    if (s.date) lines.push(`בתאריך ${s.date}`);
    if (s.reason) lines.push(`סיבה: ${s.reason}`);
    if (s.location) lines.push(`מקום: ${s.location}`);
    return lines;
  }

  /** מראה גלוי לחתימה דיגיטלית: מסגרת, תמונת חתימה (אם יש) ופרטי החותם */
  function drawDigiSig(page, vh, s, fonts, img) {
    const color = hexToRgb(s.color || '#1F35B5');
    const bw = 0.8;
    const y0 = vh - s.y - s.h;
    page.drawRectangle({ x: s.x + bw / 2, y: y0 + bw / 2, width: s.w - bw, height: s.h - bw, borderColor: color, borderWidth: bw, color: rgb(1, 1, 1), opacity: 0.85, borderOpacity: 1 });
    const pad = Math.max(3, Math.min(6, s.h * 0.08));
    let textW = s.w - pad * 2;
    if (img) {
      const iw = Math.min(s.w * 0.4, (s.h - pad * 2) * (img.width / img.height));
      const ih = iw * (img.height / img.width);
      page.drawImage(img, { x: s.x + pad, y: y0 + (s.h - ih) / 2, width: iw, height: ih });
      textW -= iw + pad;
    }
    const lines = digiSigLines(s);
    const lh = 1.25;
    const widest = Math.max(...lines.map((l) => fonts.regular.widthOfTextAtSize(H.toVisual(l), 1)));
    const size = Math.max(4, Math.min(11, (s.h - pad * 2) / (lines.length * lh), textW / widest));
    const blockH = lines.length * lh * size;
    H.drawText(page, lines.join('\n'), {
      x: s.x + s.w - pad - textW, y: vh - s.y - Math.max(pad, (s.h - blockH) / 2), width: textW + 0.5, size,
      font: fonts.regular, color, align: 'right', lineHeight: lh,
    });
  }

  /**
   * מראה החתימה הדיגיטלית על עמוד שלם בגודל המסגרת (בשביל מראה הווידג'ט).
   * s: { w, h, signer, date, reason, location, image, color }
   */
  async function renderDigiSig(doc, page, s, fonts) {
    const img = s.image ? await embedImage(doc, s.image) : null;
    drawDigiSig(page, s.h, { ...s, x: 0, y: 0 }, fonts, img);
  }

  /**
   * המרת מלבן בקואורדינטות התצוגה (ראשית בפינה השמאלית-עליונה, אחרי סיבוב)
   * למלבן PDF בקואורדינטות העמוד — בשביל ווידג'ט החתימה.
   */
  function viewRectToPage(page, r) {
    const { x: x0, y: y0, width: w, height: hgt } = page.getCropBox();
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    const vh = rot === 90 || rot === 270 ? w : hgt;
    const pts = [[r.x, vh - r.y], [r.x + r.w, vh - r.y - r.h]].map(([vx, vy]) => {
      if (rot === 90) return [x0 + w - vy, y0 + vx];
      if (rot === 180) return [x0 + w - vx, y0 + hgt - vy];
      if (rot === 270) return [x0 + vy, y0 + hgt - vx];
      return [x0 + vx, y0 + vy];
    });
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  async function loadFonts(doc, fontBytes) {
    const regular = await H.embedFont(doc, fontBytes.regular, fontkit);
    const bold = fontBytes.bold ? await H.embedFont(doc, fontBytes.bold) : regular;
    return { regular, bold };
  }

  /* ---------- עריכת טקסט קיים ---------- */

  /**
   * החלפת שורות קיימות בעמוד. edits: פריטי { type:'edit' } שנוצרו ב-TextEdit.editFromLine
   * ועודכנו בממשק (text, size, bold, color, align, font).
   * השורה המקורית נמחקת מזרם התוכן (לא מכוסה), והחדשה נכתבת דרך hebrew.js.
   * שורה שלא ניתן למחוק (פונט לא נתמך, השורה לא נמצאה) — מכוסה בצבע הרקע, עם אזהרה.
   */
  async function applyTextEdits(doc, page, edits, o) {
    // שורה משתנה אם הטקסט השתנה, או שהמשתמש שינה עיצוב (גודל, מודגש, צבע, יישור, פונט)
    const changed = edits.filter((e) => e.text !== e.original || e.restyled);
    if (!changed.length) return;
    const analysis = TE.analyzePage(doc, page);
    const lines = TE.groupLines(analysis.glyphs);
    const toRemove = [];
    const fallback = [];
    for (const e of changed) {
      const L = TE.findLine(lines, e);
      if (L && L.ok) toRemove.push(...L.glyphs);
      else {
        fallback.push(e);
        if (o.onWarning) o.onWarning(L ? `השורה "${e.original}" כתובה בפונט שלא ניתן למחוק ממנו, ולכן היא כוסתה במקום להימחק` : `השורה "${e.original}" לא נמצאה בעמוד — היא כוסתה במקום להימחק`);
      }
    }
    if (toRemove.length) TE.removeGlyphs(doc, page, analysis, toRemove);

    const cache = new Map();
    const fontFor = async (e) => {
      const fam = (o.editFonts && o.editFonts[e.font === 'alef' ? 'alef' : 'plex']) || o.fonts;
      const key = (e.font === 'alef' ? 'alef' : 'plex') + (e.bold ? 'b' : '');
      if (!cache.has(key)) cache.set(key, await H.embedFont(doc, e.bold && fam.bold ? fam.bold : fam.regular, fontkit));
      return cache.get(key);
    };
    for (const e of changed) {
      const c = Math.cos(e.angle), s = Math.sin(e.angle);
      const at = (u, v) => [u * c - v * s, u * s + v * c];
      if (fallback.includes(e)) {
        const [x0, y0, x1, y1] = e.box;
        page.drawRectangle({ x: x0 - 1, y: y0 - 1, width: x1 - x0 + 2, height: y1 - y0 + 2, color: hexToRgb(e.bg || '#ffffff') });
      }
      if (!e.text.trim()) continue; // שורה שנמחקה
      const font = await fontFor(e);
      const size = e.size;
      const lines = String(e.text).split(/\r?\n/);
      lines.forEach((logical, k) => {
        const dir = H.hasRTL(logical) ? 'rtl' : 'ltr';
        const visual = H.toVisual(logical, dir);
        const w = font.widthOfTextAtSize(visual, size);
        let u = e.u0;
        if (e.align === 'right') u = e.u1 - w;
        else if (e.align === 'center') u = (e.u0 + e.u1) / 2 - w / 2;
        const [x, y] = at(u, e.v - k * size * 1.25);
        H.drawVisualLine(page, visual, x, y, {
          font, size, color: hexToRgb(e.color),
          rotate: e.angle ? PDFLib.radians(e.angle) : undefined,
        });
      });
    }
  }

  /* ---------- טפסים ---------- */

  /** סוג שדה — לפי instanceof, כי בגרסה המכווצת של pdf-lib שמות המחלקות משתנים */
  function fieldType(f) {
    if (f instanceof PDFLib.PDFTextField) return 'TextField';
    if (f instanceof PDFLib.PDFCheckBox) return 'CheckBox';
    if (f instanceof PDFLib.PDFRadioGroup) return 'RadioGroup';
    if (f instanceof PDFLib.PDFDropdown) return 'Dropdown';
    if (f instanceof PDFLib.PDFOptionList) return 'OptionList';
    if (f instanceof PDFLib.PDFButton) return 'Button';
    if (f instanceof PDFLib.PDFSignature) return 'Signature';
    return 'Unknown';
  }

  /** רשימת שדות הטופס במסמך */
  async function getFormFields(bytes) {
    const doc = await load(bytes);
    let form;
    try { form = doc.getForm(); } catch (e) { return []; }
    const pages = doc.getPages();
    const pageIndexOf = (widget) => {
      const ref = widget.P();
      if (ref) {
        const idx = pages.findIndex((p) => p.ref === ref);
        if (idx >= 0) return idx;
      }
      for (let i = 0; i < pages.length; i++) {
        const annots = pages[i].node.Annots();
        if (annots && annots.asArray().some((a) => a === widget.dict || doc.context.lookup(a) === widget.dict)) return i;
      }
      return -1;
    };
    return form.getFields().map((f) => {
      const type = fieldType(f);
      const widgets = f.acroField.getWidgets();
      const w = widgets[0];
      const rect = w ? w.getRectangle() : null;
      const out = { name: f.getName(), type, page: w ? pageIndexOf(w) : -1, rect, readOnly: f.isReadOnly() };
      try {
        if (type === 'TextField') { out.value = f.getText() || ''; out.multiline = f.isMultiline(); out.maxLength = f.getMaxLength(); }
        else if (type === 'CheckBox') out.value = f.isChecked();
        else if (type === 'RadioGroup') { out.options = f.getOptions(); out.value = f.getSelected() || ''; }
        else if (type === 'Dropdown' || type === 'OptionList') { out.options = f.getOptions(); out.value = (f.getSelected() || [])[0] || ''; }
      } catch (e) { /* שדה פגום — מדלגים על הערך */ }
      return out;
    });
  }

  /** גודל גופן לשדה: מה שמוגדר בו, או 11 כשהוא "אוטומטי" (0) או מוגזם */
  function fieldFontSize(field) {
    const da = field.acroField.getDefaultAppearance() || '';
    const m = da.match(/([\d.]+)\s+Tf/);
    const size = m ? +m[1] : 0;
    return size > 0 && size <= 24 ? size : 11;
  }

  /** מראה לשדה רב-שורות: שורות חזותיות מוכנות, מיושרות לימין בעברית */
  function multilineProvider(lines, rtl) {
    return (field, widget, font) => {
      const rect = widget.getRectangle();
      const ap = widget.getAppearanceCharacteristics();
      const bs = widget.getBorderStyle();
      const bw = (bs && bs.getWidth()) || 0;
      const rotation = PDFLib.reduceRotation(ap && ap.getRotation());
      const { width, height } = PDFLib.adjustDimsForRotation(rect, rotation);
      const size = fieldFontSize(field);
      const pad = bw + 2;
      const lineHeight = size * 1.2;
      const align = field.acroField.getQuadding();
      const textLines = lines.map((text, i) => {
        const w = font.widthOfTextAtSize(text, size);
        let x = pad;
        if (align === 2 || (align !== 1 && rtl)) x = width - pad - w;
        else if (align === 1) x = (width - w) / 2;
        return { text, encoded: font.encodeText(text), x, y: height - pad - size - i * lineHeight, width: w, height: size };
      });
      return [
        ...PDFLib.rotateInPlace({ ...rect, rotation }),
        ...PDFLib.drawTextField({
          x: bw / 2, y: bw / 2, width: width - bw, height: height - bw, borderWidth: bw,
          borderColor: PDFLib.componentsToColor(ap && ap.getBorderColor()),
          color: PDFLib.componentsToColor(ap && ap.getBackgroundColor()),
          textColor: rgb(0, 0, 0), font: font.name, fontSize: size, textLines, padding: 2,
        }),
      ];
    };
  }

  /**
   * מילוי טופס. ערכי טקסט עבריים נשמרים בסדר הלוגי הנכון (כך שהעתקה/חיפוש עובדים),
   * ומראה השדה נבנה בסדר חזותי — כדי שהעברית לא תתהפך.
   */
  async function fillForm(bytes, values, opts) {
    const o = opts || {};
    const doc = await load(bytes);
    const fonts = await loadFonts(doc, o.fonts);
    const form = doc.getForm();
    for (const [name, value] of Object.entries(values || {})) {
      let f;
      try { f = form.getField(name); } catch (e) { continue; }
      const type = fieldType(f);
      try {
        if (type === 'TextField') {
          const logical = String(value == null ? '' : value);
          const rtl = H.hasRTL(logical);
          const multiline = f.isMultiline();
          let visual;
          if (multiline) {
            // שוברים שורות בעצמנו לפני ההיפוך — אחרת pdf-lib שובר את השורה ההפוכה וסדר השורות מתבלגן
            const size = fieldFontSize(f);
            f.setFontSize(size);
            const rect = f.acroField.getWidgets()[0].getRectangle();
            const lines = H.wrapLines(logical, rect.width - 6, (s) => fonts.regular.widthOfTextAtSize(s, size));
            visual = lines.map((l) => H.toVisual(l)).join('\n');
          } else {
            visual = H.toVisual(logical);
          }
          if (rtl && f.acroField.getQuadding() !== 1) f.setAlignment(PDFLib.TextAlignment.Right);
          const max = f.getMaxLength();
          if (max != null && visual.length > max) f.setMaxLength(undefined);
          f.setText(visual);
          if (multiline) f.updateAppearances(fonts.regular, multilineProvider(visual.split('\n'), rtl));
          else f.updateAppearances(fonts.regular);
          f.acroField.setValue(PDFHexString.fromText(logical));
        } else if (type === 'CheckBox') {
          value ? f.check() : f.uncheck();
        } else if (type === 'RadioGroup') {
          if (value) f.select(String(value));
        } else if (type === 'Dropdown' || type === 'OptionList') {
          if (value) f.select(String(value));
          f.updateAppearances(fonts.regular);
        }
      } catch (e) {
        if (o.onWarning) o.onWarning(`לא הצלחנו למלא את השדה "${name}": ${e.message}`);
      }
    }
    // שהצגים ישתמשו במראה שבנינו ולא יבנו מחדש (ואז יהפכו את העברית)
    form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFLib.PDFBool.False);
    if (o.flatten) {
      form.flatten({ updateFieldAppearances: false });
      // pdf-lib משאיר אחרי השטחה הפניות יתומות לווידג'טים שנמחקו — מנקים אותן
      for (const page of doc.getPages()) {
        const annots = page.node.Annots();
        if (!annots) continue;
        for (let i = annots.size() - 1; i >= 0; i--) {
          const ref = annots.get(i);
          if (ref instanceof PDFLib.PDFRef && !doc.context.lookup(ref)) annots.remove(i);
        }
        if (annots.size() === 0) page.node.delete(PDFName.of('Annots'));
      }
    }
    return doc.save();
  }

  /* ---------- הרכבת מסמך מסביבת העבודה ---------- */

  /**
   * sources: { [srcId]: Uint8Array }
   * pages: [{ src, index, rotate }]  (rotate = סיבוב נוסף שהמשתמש ביקש, במעלות)
   * stamps: { [pageKey]: stamp[] } כאשר pageKey = `${src}:${index}` (ובעמוד ריק: `blank:n`)
   * formValues: { [srcId]: { fieldName: value } }
   * options: { fonts: {regular, bold}, flattenForms, watermark, pageNumbers, onWarning }
   */
  async function buildDocument(sources, pages, stamps, formValues, options) {
    const o = options || {};
    const srcIds = [...new Set(pages.filter((p) => p.src !== 'blank').map((p) => p.src))];
    const prepared = {};
    for (const id of srcIds) {
      const values = (formValues || {})[id];
      prepared[id] = values && Object.keys(values).length
        ? await fillForm(sources[id], values, { fonts: o.fonts, flatten: o.flattenForms || srcIds.length > 1, onWarning: o.onWarning })
        : sources[id];
    }

    // מקרה "קובץ אחד בסדר המקורי" — עובדים על הקובץ עצמו ושומרים טפסים חיים
    let doc;
    const single = srcIds.length === 1 && !pages.some((p) => p.src === 'blank');
    const loaded = {};
    if (single) {
      const base = await load(prepared[srcIds[0]]);
      const count = base.getPageCount();
      const identity = pages.length === count && pages.every((p, i) => p.index === i);
      if (identity) doc = base;
      else loaded[srcIds[0]] = base;
    }
    let outPages;
    if (doc) {
      outPages = doc.getPages();
    } else {
      doc = await PDFDocument.create();
      for (const id of srcIds) if (!loaded[id]) loaded[id] = await load(prepared[id]);
      outPages = [];
      // מעתיקים בקבוצות לפי מקור — מהיר יותר ושומר משאבים משותפים
      const copies = {};
      for (const id of srcIds) {
        const wanted = pages.filter((p) => p.src === id).map((p) => p.index);
        const copied = await doc.copyPages(loaded[id], wanted);
        copies[id] = new Map(wanted.map((idx, k) => [idx, copied[k]]));
      }
      const used = new Set();
      for (const p of pages) {
        let pg;
        if (p.src === 'blank') {
          pg = doc.addPage([p.width || 595.28, p.height || 841.89]);
        } else {
          pg = copies[p.src].get(p.index);
          if (used.has(pg)) {
            // אותו עמוד פעמיים — מעתיקים שוב
            [pg] = await doc.copyPages(loaded[p.src], [p.index]);
          }
          used.add(pg);
          doc.addPage(pg);
        }
        outPages.push(pg);
      }
    }

    const fonts = await loadFonts(doc, o.fonts);
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const pg = outPages[i];
      if (p.rotate) pg.setRotation(degrees((((pg.getRotation().angle + p.rotate) % 360) + 360) % 360));
      const key = p.key || `${p.src}:${p.index}`;
      const list = (stamps || {})[key];
      if (list && list.length) {
        const edits = list.filter((s) => s.type === 'edit');
        if (edits.length) await applyTextEdits(doc, pg, edits, o);
        const rest = list.filter((s) => s.type !== 'edit');
        if (rest.length) await drawStamps(doc, pg, rest, fonts);
      }
    }
    if (o.watermark && o.watermark.text) applyWatermark(doc, fonts, o.watermark);
    if (o.pageNumbers && o.pageNumbers.enabled) applyPageNumbers(doc, fonts, o.pageNumbers);
    doc.setProducer('איתןPDF');
    return doc.save();
  }

  function applyWatermark(doc, fonts, wm) {
    const size = wm.size || 60;
    const color = hexToRgb(wm.color || '#c0392b');
    const opacity = wm.opacity == null ? 0.18 : wm.opacity;
    const visual = H.toVisual(wm.text);
    const font = wm.bold === false ? fonts.regular : fonts.bold;
    const tw = font.widthOfTextAtSize(visual, size);
    for (const page of doc.getPages()) {
      withViewFrame(page, (vw, vh) => {
        const ang = (wm.angle == null ? 35 : wm.angle) * Math.PI / 180;
        const cx = vw / 2, cy = vh / 2;
        const x = cx - (Math.cos(ang) * tw) / 2 + (Math.sin(ang) * size) / 3;
        const y = cy - (Math.sin(ang) * tw) / 2 - (Math.cos(ang) * size) / 3;
        page.drawText(visual, { x, y, size, font, color, opacity, rotate: degrees(wm.angle == null ? 35 : wm.angle) });
      });
    }
  }

  function applyPageNumbers(doc, fonts, pn) {
    const pages = doc.getPages();
    const total = pn.total || pages.length;
    const size = pn.size || 11;
    const fmt = pn.format || 'עמוד {n} מתוך {total}';
    const start = pn.start || 1;
    pages.forEach((page, i) => {
      if (pn.skipFirst && i === 0) return;
      const text = fmt.replace('{n}', String(i + start)).replace('{total}', String(total + start - 1));
      withViewFrame(page, (vw, vh) => {
        const margin = 24;
        const top = pn.position && pn.position.startsWith('top');
        const y = top ? vh - margin + size * 0.2 : margin + size * 1.1;
        const align = pn.position && pn.position.endsWith('right') ? 'right' : pn.position && pn.position.endsWith('left') ? 'left' : 'center';
        H.drawText(page, text, { x: margin, y, width: vw - margin * 2, size, font: fonts.regular, color: hexToRgb(pn.color || '#444444'), align });
      });
    });
  }

  /* ---------- פיצול ---------- */

  /** groups: [[0,1,2],[3]...] → מערך קבצים */
  async function splitDocument(bytes, groups) {
    const src = await load(bytes);
    const out = [];
    for (const g of groups) {
      const d = await PDFDocument.create();
      const copied = await d.copyPages(src, g);
      copied.forEach((p) => d.addPage(p));
      out.push(await d.save());
    }
    return out;
  }

  /* ---------- תמונות ל-PDF ---------- */

  /** images: [{ bytes, type: 'png'|'jpg' }] → PDF, עמוד A4 לכל תמונה (לרוחב/לאורך לפי התמונה) */
  async function imagesToPdf(images, opts) {
    const o = opts || {};
    const doc = await PDFDocument.create();
    const margin = o.margin == null ? 20 : o.margin;
    for (const im of images) {
      const img = await embedImage(doc, im.bytes);
      const landscape = img.width > img.height;
      const [pw, ph] = o.fit === 'image' ? [img.width, img.height] : landscape ? [841.89, 595.28] : [595.28, 841.89];
      const page = doc.addPage([pw, ph]);
      const m = o.fit === 'image' ? 0 : margin;
      const scale = Math.min((pw - m * 2) / img.width, (ph - m * 2) / img.height);
      const w = img.width * scale, h = img.height * scale;
      page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
    return doc.save();
  }

  async function pageCount(bytes) {
    return (await load(bytes)).getPageCount();
  }

  return {
    load, parseRanges, chunk, buildDocument, splitDocument, imagesToPdf, getFormFields, fillForm,
    viewSize, withViewFrame, pageCount, hexToRgb, StandardFonts, applyTextEdits, MARK_PATHS, MARK_STROKE,
    inspectSecurity, checkPassword, decrypt, encrypt, PERMISSION_KEYS, viewRectToPage, digiSigLines, renderDigiSig, loadFonts,
  };
});
