/*
 * ציור עמודי PDF לתמונות (JPG / PNG), משותף לדסקטופ ולאנדרואיד.
 *
 * מצייר דרך pdf.js על canvas, על רקע לבן (אחרת עמוד שקוף יוצא שחור ב-JPEG),
 * כולל הסיבוב של העמוד, השדות שמולאו והחותמות. כותב לקובץ את הרזולוציה (DPI),
 * כך שתוכנות הדפסה ו-Word יודעות את הגודל האמיתי.
 *
 * פועל רק בדפדפן (צריך canvas). window.Rasterize.
 * הפונקציות הטהורות (setDpi, crc32, pageNames) נבדקות גם ב-Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rasterize = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // תקרות גודל: canvas גדול מדי מפיל את הדפדפן (בטלפון — עוד קודם)
  const LIMITS = { side: 16000, area: 48e6 };

  /* ---------- רזולוציה בקובץ ---------- */

  let CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        CRC_TABLE[n] = c >>> 0;
      }
    }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /** כתיבת הרזולוציה ל-JPEG (כותרת JFIF) או ל-PNG (מקטע pHYs). קובץ אחר — כמו שהוא */
  function setDpi(bytes, dpi) {
    const d = Math.round(dpi);
    if (!d || d < 1) return bytes;
    // JPEG עם JFIF: FFD8 FFE0 len 'JFIF\0' ver(2) units(1) X(2) Y(2)
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
      if (bytes[2] === 0xFF && bytes[3] === 0xE0 && bytes[6] === 0x4A && bytes[7] === 0x46 && bytes[8] === 0x49 && bytes[9] === 0x46) {
        const out = bytes.slice();
        out[13] = 1; out[14] = d >> 8; out[15] = d & 255; out[16] = d >> 8; out[17] = d & 255;
        return out;
      }
      return bytes;
    }
    // PNG: חתימה (8) + IHDR (25) → pHYs מיד אחרי IHDR (מחליף pHYs קיים אם יש)
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!sig.every((v, i) => bytes[i] === v)) return bytes;
    const ppm = Math.round(d / 0.0254);
    const chunk = new Uint8Array(21);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9);
    chunk.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
    dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    // הסרת pHYs קיים
    const parts = [];
    let i = 8;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (i + 8 <= bytes.length) {
      const len = view.getUint32(i);
      const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
      const end = i + 12 + len;
      if (type !== 'pHYs') parts.push(bytes.subarray(i, end));
      if (type === 'IHDR') parts.push(chunk);
      i = end;
      if (type === 'IEND') break;
    }
    const total = 8 + parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    out.set(sig, 0);
    let o = 8;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  /* ---------- שמות קבצים ---------- */

  /** "שם - עמוד 01.jpg" — מספור באותו אורך, כדי שהסדר בתיקייה יהיה נכון */
  function pageNames(base, pageNumbers, ext) {
    const width = String(Math.max(...pageNumbers, 1)).length;
    return pageNumbers.map((n) => `${base} - עמוד ${String(n).padStart(Math.max(2, width), '0')}.${ext}`);
  }

  /* ---------- ציור ---------- */

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  /** קנה מידה שמתאים לתקרות; מחזיר { scale, reduced } */
  function fit(wPt, hPt, dpi, limits) {
    const L = { ...LIMITS, ...(limits || {}) };
    let s = dpi / 72;
    const w = wPt * s, h = hPt * s;
    let k = Math.min(1, L.side / w, L.side / h, Math.sqrt(L.area / (w * h)));
    return { scale: s * k, reduced: k < 0.999 };
  }

  async function encode(canvas, format, quality, dpi) {
    const type = format === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('לא הצלחתי ליצור תמונה (העמוד גדול מדי?)'))), type, format === 'png' ? undefined : quality || 0.9));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return setDpi(bytes, dpi);
  }

  function release(canvas) { canvas.width = 0; canvas.height = 0; }

  async function draw(page, viewport, canvas, opts, transform) {
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const params = { canvasContext: ctx, viewport, background: '#ffffff' };
    if (transform) params.transform = transform;
    if (opts.pdfjsLib && opts.pdfjsLib.AnnotationMode) params.annotationMode = opts.pdfjsLib.AnnotationMode.ENABLE;
    await page.render(params).promise;
  }

  /**
   * עמוד אחד לתמונה. pdf — מסמך pdf.js פתוח; pageNumber — מ-1.
   * opts: { dpi, format: 'jpeg'|'png', quality, pdfjsLib, limits }
   * מחזיר { bytes, width, height, dpi, reduced }
   */
  async function renderPage(pdf, pageNumber, opts = {}) {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1, rotation: page.rotate });
    const { scale, reduced } = fit(base.width, base.height, opts.dpi || 150, opts.limits);
    const vp = page.getViewport({ scale, rotation: page.rotate });
    const canvas = makeCanvas(vp.width, vp.height);
    try {
      await draw(page, vp, canvas, opts);
      const dpi = scale * 72;
      const bytes = await encode(canvas, opts.format, opts.quality, dpi);
      return { bytes, width: canvas.width, height: canvas.height, dpi, reduced };
    } finally {
      release(canvas);
      page.cleanup();
    }
  }

  /**
   * כמה עמודים לתמונה ארוכה אחת, זה מתחת לזה (לשליחה בוואטסאפ).
   * כל העמודים באותו רוחב; אם התמונה יוצאת גדולה מהתקרות — מוקטנת כולה.
   */
  async function renderLong(pdf, pageNumbers, opts = {}) {
    const L = { ...LIMITS, ...(opts.limits || {}) };
    const pages = [];
    for (const n of pageNumbers) {
      const page = await pdf.getPage(n);
      const vp = page.getViewport({ scale: 1, rotation: page.rotate });
      pages.push({ page, w: vp.width, h: vp.height });
    }
    const widthPt = Math.max(...pages.map((p) => p.w));
    const gapPt = 8;
    // כל עמוד מותאם לרוחב המשותף
    const heightPt = pages.reduce((s, p) => s + p.h * (widthPt / p.w), 0) + gapPt * (pages.length - 1);
    let scale = (opts.dpi || 150) / 72;
    const k = Math.min(1, L.side / (widthPt * scale), L.side / (heightPt * scale), Math.sqrt(L.area / (widthPt * heightPt * scale * scale)));
    scale *= k;
    const out = makeCanvas(widthPt * scale, heightPt * scale);
    const octx = out.getContext('2d', { alpha: false });
    octx.fillStyle = '#E6E9EF';
    octx.fillRect(0, 0, out.width, out.height);
    let y = 0;
    try {
      for (const p of pages) {
        const s = scale * (widthPt / p.w);
        const vp = p.page.getViewport({ scale: s, rotation: p.page.rotate });
        const c = makeCanvas(vp.width, vp.height);
        await draw(p.page, vp, c, opts);
        octx.drawImage(c, 0, Math.round(y));
        y += c.height + gapPt * scale;
        release(c);
        p.page.cleanup();
        if (opts.onProgress) opts.onProgress();
      }
      const bytes = await encode(out, opts.format, opts.quality, scale * 72);
      return { bytes, width: out.width, height: out.height, dpi: scale * 72, reduced: k < 0.999 };
    } finally {
      release(out);
    }
  }

  /**
   * אזור בעמוד (תיבה במרחב של העמוד ב-PDF: [x0,y0,x1,y1]) — לתמונות שבתוך קובץ ה-Word.
   * pageIndex — מ-0. מחזיר { bytes, type } כמו ש-Docx.convert מצפה.
   */
  async function renderRegion(pdf, pageIndex, box, opts = {}) {
    const page = await pdf.getPage(pageIndex + 1);
    try {
      const wPt = Math.abs(box[2] - box[0]), hPt = Math.abs(box[3] - box[1]);
      const { scale } = fit(wPt, hPt, opts.dpi || 150, opts.limits || { side: 6000, area: 20e6 });
      const vp = page.getViewport({ scale, rotation: page.rotate });
      const r = vp.convertToViewportRectangle(box);
      const x0 = Math.min(r[0], r[2]), y0 = Math.min(r[1], r[3]);
      const w = Math.abs(r[2] - r[0]), h = Math.abs(r[3] - r[1]);
      if (w < 1 || h < 1) return null;
      const canvas = makeCanvas(w, h);
      try {
        await draw(page, vp, canvas, opts, [1, 0, 0, 1, -x0, -y0]);
        const format = opts.format || 'png';
        return { bytes: await encode(canvas, format, opts.quality || 0.88, scale * 72), type: format === 'png' ? 'png' : 'jpeg' };
      } finally {
        release(canvas);
      }
    } finally {
      page.cleanup();
    }
  }

  /**
   * הפונקציה שההמרה ל-Word (Docx.convert) מקבלת כ-renderImage.
   * pdf — המסמך הפתוח; open(bytes) — פותח מסמך נוסף ב-pdf.js (העותק עם הגרפיקה בלבד, לתמונות רקע).
   * close() סוגר את המסמכים הנוספים בסוף.
   */
  function wordImages(pdf, { pdfjsLib, open, limits, maxDpi } = {}) {
    const extra = new Map();
    const fn = async (q) => {
      let src = pdf;
      if (q.pdf) {
        if (!extra.has(q.pdf)) extra.set(q.pdf, open(q.pdf));
        src = await extra.get(q.pdf);
      }
      const dpi = maxDpi ? Math.min(q.dpi, maxDpi) : q.dpi;
      return renderRegion(src, q.pageIndex, q.box, { dpi, format: q.photo ? 'jpeg' : 'png', quality: 0.85, pdfjsLib, limits });
    };
    fn.close = async () => { for (const p of extra.values()) { try { (await p).destroy(); } catch (e) { /* כבר נסגר */ } } };
    return fn;
  }

  return { renderPage, renderLong, renderRegion, wordImages, setDpi, crc32, pageNames, LIMITS };
});
