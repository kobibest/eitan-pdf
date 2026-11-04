/*
 * דחיסת PDF: הקטנת הקובץ בלי לגעת בטקסט, בשדות ובמבנה.
 *
 * רמות:
 *   light  — בלי איבוד איכות: מחיקת אובייקטים שאף אחד לא משתמש בהם, איחוד עותקים זהים
 *            (גופן או תמונה שהוטמעו כמה פעמים, נפוץ אחרי מיזוג), דחיסת זרמים לא דחוסים
 *            והסרת תמונות ממוזערות של עמודים.
 *   medium — כל זה, ובנוסף התמונות מוקטנות ל-150 DPI ונשמרות מחדש כ-JPEG באיכות טובה.
 *   strong — תמונות ל-96 DPI ואיכות JPEG נמוכה יותר. מתאים למייל ולוואטסאפ.
 *
 * הטקסט נשאר טקסט (אפשר לחפש ולהעתיק), רק התמונות משתנות. תמונה שלא קטנה מספיק נשארת כמו שהיא.
 *
 * משותף לגרסת Windows/Mac ולאפליקציית האנדרואיד. עובד ב-Node (בדיקות) ובדפדפן (window.Compress).
 * הקידוד מחדש של התמונות נעשה ב-canvas של הדפדפן; ב-Node מעבירים opts.recode.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('pdf-lib'));
  } else {
    root.Compress = factory(root.PDFLib);
  }
})(typeof self !== 'undefined' ? self : this, function (PDFLib) {
  'use strict';

  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFStream, PDFRawStream, PDFNumber, PDFBool, decodePDFRawStream } = PDFLib;

  const LEVELS = {
    light: { images: false },
    medium: { images: true, dpi: 150, quality: 0.72 },
    strong: { images: true, dpi: 96, quality: 0.5 },
  };

  const N = (s) => PDFName.of(s);
  const MIN_PIXELS = 96 * 96; // תמונות קטנות (סמלים, לוגו) לא שווה לקודד מחדש
  const MIN_GAIN = 0.9; // מחליפים תמונה רק אם החדשה קטנה לפחות ב-10%

  /* ---------- עזרים ---------- */

  function filters(dict) {
    const f = dict.lookup(N('Filter'));
    if (!f) return [];
    if (f instanceof PDFName) return [f.decodeText()];
    if (f instanceof PDFArray) return f.asArray().map((x) => (x instanceof PDFName ? x.decodeText() : '?'));
    return ['?'];
  }

  const num = (dict, key) => {
    const v = dict.lookup(N(key));
    return v instanceof PDFNumber ? v.asNumber() : undefined;
  };

  /** מספר הרכיבים במרחב הצבע: 1 (אפור) או 3 (RGB). אחרת null — לא נוגעים בתמונה */
  function colorComponents(ctx, cs) {
    cs = ctx.lookup(cs);
    if (cs instanceof PDFName) {
      const n = cs.decodeText();
      return n === 'DeviceGray' || n === 'CalGray' ? 1 : n === 'DeviceRGB' || n === 'CalRGB' ? 3 : null;
    }
    if (cs instanceof PDFArray && cs.size() >= 1) {
      const kind = ctx.lookup(cs.get(0));
      const name = kind instanceof PDFName ? kind.decodeText() : '';
      if (name === 'CalGray') return 1;
      if (name === 'CalRGB') return 3;
      if (name === 'ICCBased') {
        const prof = ctx.lookup(cs.get(1));
        const n = prof instanceof PDFStream ? num(prof.dict, 'N') : undefined;
        return n === 1 || n === 3 ? n : null;
      }
    }
    return null;
  }

  /** מספר הרכיבים לפי כותרת ה-JPEG (SOF). CMYK (4) לא נתמך היטב בדפדפנים */
  function jpegComponents(b) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = (b[i + 2] << 8) | b[i + 3];
      if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return b[i + 9];
      i += 2 + len;
    }
    return 0;
  }

  /** ביטול מנבא PNG (Predictor 10–15) אחרי פענוח Flate */
  function unpredictPng(data, width, comps) {
    const rowLen = width * comps;
    const rows = Math.floor(data.length / (rowLen + 1));
    const out = new Uint8Array(rows * rowLen);
    let prev = new Uint8Array(rowLen);
    for (let r = 0; r < rows; r++) {
      const src = r * (rowLen + 1);
      const type = data[src];
      const cur = out.subarray(r * rowLen, (r + 1) * rowLen);
      for (let x = 0; x < rowLen; x++) {
        const raw = data[src + 1 + x];
        const a = x >= comps ? cur[x - comps] : 0;
        const b = prev[x];
        const c = x >= comps ? prev[x - comps] : 0;
        let v;
        if (type === 0) v = raw;
        else if (type === 1) v = raw + a;
        else if (type === 2) v = raw + b;
        else if (type === 3) v = raw + ((a + b) >> 1);
        else if (type === 4) {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        } else throw new Error('PNG predictor ' + type);
        cur[x] = v & 0xff;
      }
      prev = cur;
    }
    return out;
  }

  /** פיקסלים גולמיים (8 ביט לרכיב) מתמונת Flate, או null אם התמונה בפורמט שלא מטפלים בו */
  function rawPixels(stream, width, height, comps) {
    let parms = stream.dict.lookup(N('DecodeParms'));
    if (parms instanceof PDFArray) parms = parms.size() === 1 ? stream.dict.context.lookup(parms.get(0)) : null;
    const predictor = parms instanceof PDFDict ? num(parms, 'Predictor') || 1 : 1;
    if (predictor !== 1 && predictor < 10) return null; // מנבא TIFF — נדיר, מדלגים
    let data = decodePDFRawStream(stream).decode();
    if (predictor >= 10) {
      const colors = num(parms, 'Colors') || 1;
      const columns = num(parms, 'Columns') || 1;
      const bpc = num(parms, 'BitsPerComponent') || 8;
      if (colors !== comps || columns !== width || bpc !== 8) return null;
      data = unpredictPng(data, width, comps);
    }
    return data.length >= width * height * comps ? data : null;
  }

  /* ---------- קידוד מחדש בדפדפן ---------- */

  function canvasToJpeg(canvas, quality) {
    return new Promise((res, rej) => canvas.toBlob(
      (bl) => (bl ? bl.arrayBuffer().then((a) => res(new Uint8Array(a)), rej) : rej(new Error('toBlob failed'))),
      'image/jpeg', quality));
  }

  function loadJpeg(bytes) {
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('jpeg decode failed')); };
      img.src = url;
    });
  }

  /**
   * src: { jpeg } או { pixels, comps }; width/height של המקור; target: גודל היעד. מחזיר JPEG.
   */
  async function canvasRecode(src) {
    let source;
    if (src.jpeg) {
      source = await loadJpeg(src.jpeg);
    } else {
      const c0 = document.createElement('canvas');
      c0.width = src.width;
      c0.height = src.height;
      const ctx0 = c0.getContext('2d');
      const img = ctx0.createImageData(src.width, src.height);
      const d = img.data, p = src.pixels, n = src.width * src.height;
      if (src.comps === 1) for (let i = 0, j = 0; i < n; i++, j += 4) { d[j] = d[j + 1] = d[j + 2] = p[i]; d[j + 3] = 255; }
      else for (let i = 0, j = 0, k = 0; i < n; i++, j += 4, k += 3) { d[j] = p[k]; d[j + 1] = p[k + 1]; d[j + 2] = p[k + 2]; d[j + 3] = 255; }
      ctx0.putImageData(img, 0, 0);
      source = c0;
    }
    const c = document.createElement('canvas');
    c.width = src.targetWidth;
    c.height = src.targetHeight;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, c.width, c.height);
    if (source.close) source.close();
    if (source.width && source.getContext) source.width = source.height = 0;
    const jpg = await canvasToJpeg(c, src.quality);
    c.width = c.height = 0;
    return jpg;
  }

  /* ---------- התמונות ---------- */

  async function recompressImages(doc, cfg, recode, stats, onProgress) {
    const ctx = doc.context;
    // הגודל המקסימלי בפיקסלים: הצלע הארוכה של העמוד הגדול ביותר ב-DPI היעד
    let maxIn = 0;
    for (const p of doc.getPages()) { const { width, height } = p.getSize(); maxIn = Math.max(maxIn, width / 72, height / 72); }
    const maxPx = Math.max(300, Math.ceil(maxIn * cfg.dpi));

    // תמונות שמשמשות כמסכה של תמונה אחרת — נשארות כמו שהן
    const masks = new Set();
    const objs = ctx.enumerateIndirectObjects();
    for (const [, o] of objs) {
      if (!(o instanceof PDFStream)) continue;
      for (const k of ['SMask', 'Mask']) { const r = o.dict.get(N(k)); if (r instanceof PDFRef) masks.add(r.toString()); }
    }

    const candidates = objs.filter(([ref, o]) => o instanceof PDFRawStream && !masks.has(ref.toString())
      && o.dict.lookup(N('Subtype')) === N('Image'));
    stats.images = candidates.length;
    let i = 0;
    for (const [ref, img] of candidates) {
      if (onProgress) onProgress(++i, candidates.length);
      try {
        const out = await recompressOne(ctx, img, cfg, maxPx, recode);
        if (out) { ctx.assign(ref, out); stats.recompressed++; }
      } catch (e) {
        stats.skipped++; // תמונה שלא הצלחנו לפענח נשארת כמו שהיא
      }
    }
  }

  async function recompressOne(ctx, img, cfg, maxPx, recode) {
    const d = img.dict;
    const w = num(d, 'Width'), h = num(d, 'Height');
    if (!w || !h || w * h < MIN_PIXELS) return null;
    if (num(d, 'BitsPerComponent') !== 8) return null;
    if (d.lookup(N('ImageMask')) === PDFBool.True || d.has(N('Mask')) || d.has(N('Decode'))) return null;
    const comps = colorComponents(ctx, d.get(N('ColorSpace')));
    if (!comps) return null;
    const f = filters(d);
    let src;
    if (f.length === 1 && f[0] === 'DCTDecode') {
      if (![1, 3].includes(jpegComponents(img.contents))) return null;
      src = { jpeg: img.contents };
    } else if (f.length === 1 && f[0] === 'FlateDecode') {
      const pixels = rawPixels(img, w, h, comps);
      if (!pixels) return null;
      src = { pixels, comps };
    } else {
      return null; // JPX, JBIG2, CCITT ועוד — משאירים
    }
    const scale = Math.min(1, maxPx / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale));
    const jpg = await recode({ ...src, width: w, height: h, targetWidth: tw, targetHeight: th, quality: cfg.quality });
    if (!jpg || jpg.length >= img.contents.length * MIN_GAIN) return null;
    const dict = { Type: 'XObject', Subtype: 'Image', Width: tw, Height: th, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' };
    const out = ctx.stream(jpg, dict);
    for (const k of ['SMask', 'Interpolate', 'Intent', 'OC', 'StructParent']) { const v = d.get(N(k)); if (v) out.dict.set(N(k), v); }
    return out;
  }

  /* ---------- בלי איבוד איכות ---------- */

  /** הסרת תמונות ממוזערות (Thumb) ו-PieceInfo מהעמודים — תוכנות PDF מייצרות אותן לבד */
  function stripPageExtras(doc) {
    for (const p of doc.getPages()) {
      p.node.delete(N('Thumb'));
      p.node.delete(N('PieceInfo'));
    }
  }

  /** דחיסת זרמים שנשמרו בלי דחיסה */
  function flateUncompressed(ctx) {
    for (const [ref, o] of ctx.enumerateIndirectObjects()) {
      if (!(o instanceof PDFRawStream) || o.dict.has(N('Filter')) || o.contents.length < 128) continue;
      const type = o.dict.lookup(N('Type'));
      if (type === N('Metadata')) continue; // XMP נשאר קריא
      const lit = {};
      for (const [k, v] of o.dict.entries()) if (k !== N('Length')) lit[k.decodeText()] = v;
      const z = ctx.flateStream(o.contents, lit);
      if (z.contents.length < o.contents.length) ctx.assign(ref, z);
    }
  }

  function hashBytes(b) {
    let h = 0x811c9dc5;
    const step = b.length > 65536 ? Math.floor(b.length / 32768) : 1; // זרם גדול — דגימה, ההשוואה המלאה בהמשך
    for (let i = 0; i < b.length; i += step) { h ^= b[i]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + ':' + b.length;
  }

  function sameBytes(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /** החלפת הפניות לפי מפה (ref → ref) בכל האובייקטים */
  function rewriteRefs(ctx, map) {
    const fix = (v) => (v instanceof PDFRef && map.has(v.toString()) ? map.get(v.toString()) : v);
    const visit = (o) => {
      if (o instanceof PDFDict) {
        for (const [k, v] of o.entries()) { const nv = fix(v); if (nv !== v) o.set(k, nv); else visit(v); }
      } else if (o instanceof PDFArray) {
        for (let i = 0; i < o.size(); i++) { const v = o.get(i); const nv = fix(v); if (nv !== v) o.set(i, nv); else visit(v); }
      } else if (o instanceof PDFStream) visit(o.dict);
    };
    for (const [, o] of ctx.enumerateIndirectObjects()) visit(o);
    const t = ctx.trailerInfo;
    for (const k of ['Root', 'Info']) if (t[k]) t[k] = fix(t[k]);
  }

  /** איחוד זרמים זהים לגמרי (גופנים ותמונות שהוטמעו כמה פעמים) */
  function dedupeStreams(ctx) {
    const buckets = new Map();
    const map = new Map();
    for (const [ref, o] of ctx.enumerateIndirectObjects()) {
      if (!(o instanceof PDFRawStream) || o.contents.length < 256) continue;
      const key = hashBytes(o.contents) + '|' + o.dict.toString();
      const list = buckets.get(key);
      const same = list && list.find((x) => sameBytes(x.o.contents, o.contents));
      if (same) map.set(ref.toString(), same.ref);
      else if (list) list.push({ ref, o });
      else buckets.set(key, [{ ref, o }]);
    }
    if (!map.size) return 0;
    rewriteRefs(ctx, map);
    for (const id of map.keys()) ctx.delete(PDFRef.of(...id.split(' ').slice(0, 2).map(Number)));
    // תמונות שהפנו למסכות שהתאחדו נעשו זהות עכשיו — עוד סיבוב
    return map.size + dedupeStreams(ctx);
  }

  /** מחיקת אובייקטים שלא נגישים מהקטלוג או מ-Info */
  function collectGarbage(ctx) {
    const seen = new Set();
    const stack = [];
    const t = ctx.trailerInfo;
    for (const k of ['Root', 'Info']) if (t[k]) stack.push(t[k]);
    while (stack.length) {
      const o = stack.pop();
      if (o instanceof PDFRef) {
        const id = o.toString();
        if (seen.has(id)) continue;
        seen.add(id);
        const v = ctx.lookup(o);
        if (v) stack.push(v);
      } else if (o instanceof PDFDict) {
        for (const [, v] of o.entries()) stack.push(v);
      } else if (o instanceof PDFArray) {
        for (let i = 0; i < o.size(); i++) stack.push(o.get(i));
      } else if (o instanceof PDFStream) {
        stack.push(o.dict);
      }
    }
    let removed = 0;
    for (const [ref] of ctx.enumerateIndirectObjects()) {
      if (!seen.has(ref.toString())) { ctx.delete(ref); removed++; }
    }
    return removed;
  }

  /* ---------- הפעולה ---------- */

  /**
   * bytes: PDF לא מוצפן (אחרי שכל השינויים הוחלו). opts:
   *   level: 'light' | 'medium' | 'strong' (ברירת מחדל medium)
   *   recode(src) → Uint8Array JPEG — ברירת מחדל: canvas בדפדפן
   *   onProgress(done, total) — התקדמות התמונות
   * מחזיר { bytes, before, after, images, recompressed, unchanged }.
   * אם התוצאה לא קטנה מהמקור — מוחזר המקור (unchanged: true).
   */
  async function compress(bytes, opts = {}) {
    const level = LEVELS[opts.level] ? opts.level : 'medium';
    const cfg = LEVELS[level];
    const recode = opts.recode || (typeof document !== 'undefined' ? canvasRecode : null);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const ctx = doc.context;
    const stats = { images: 0, recompressed: 0, skipped: 0, merged: 0, removed: 0 };

    if (cfg.images && recode) await recompressImages(doc, cfg, recode, stats, opts.onProgress);
    stripPageExtras(doc);
    flateUncompressed(ctx);
    stats.merged = dedupeStreams(ctx);
    stats.removed = collectGarbage(ctx);
    doc.setProducer('איתןPDF');

    const out = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
    const before = bytes.length;
    if (out.length >= before) return { ...stats, bytes, before, after: before, unchanged: true, level };
    return { ...stats, bytes: out, before, after: out.length, unchanged: false, level };
  }

  /** גודל קריא: "2.4 MB" */
  function formatSize(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }

  return { compress, formatSize, LEVELS, _internal: { unpredictPng, jpegComponents } };
});
