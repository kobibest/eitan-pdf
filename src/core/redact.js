/*
 * השחרה אמיתית: כל עמוד עם השחרה מצויר מחדש כתמונה (200 DPI) עם המלבנים השחורים,
 * ומחליף את העמוד המקורי. בסוף כל המסמך מועתק לקובץ חדש, כך שהתוכן המקורי של
 * העמודים שהוחלפו (טקסט, תמונות, שכבות, הערות) לא נשאר בקובץ אפילו כאובייקט נסתר.
 *
 * משותף לגרסת Windows ולאפליקציית האנדרואיד. עובד ב-Node (בדיקות) ובדפדפן (window.Redact).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('pdf-lib'));
  } else {
    root.Redact = factory(root.PDFLib);
  }
})(typeof self !== 'undefined' ? self : this, function (PDFLib) {
  'use strict';

  const { PDFDocument } = PDFLib;
  const DPI = 200;

  /**
   * ציור עמוד עם המלבנים לתמונת JPEG, בדפדפן (pdf.js + canvas).
   * מחזיר { jpg: Uint8Array, width, height } — הגודל ביחידות PDF של העמוד המוצג.
   */
  function canvasRenderer(pdfjsLib, pdf) {
    return async (idx, boxes) => {
      const pg = await pdf.getPage(idx + 1);
      const vp = pg.getViewport({ scale: DPI / 72, rotation: pg.rotate });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width);
      c.height = Math.ceil(vp.height);
      const ctx2d = c.getContext('2d');
      ctx2d.fillStyle = '#fff';
      ctx2d.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: ctx2d, viewport: vp, annotationMode: pdfjsLib.AnnotationMode.ENABLE }).promise;
      ctx2d.fillStyle = '#000';
      const k = DPI / 72;
      for (const b of boxes) ctx2d.fillRect(Math.floor(b.x * k), Math.floor(b.y * k), Math.ceil(b.w * k) + 1, Math.ceil(b.h * k) + 1);
      const jpg = await new Promise((res, rej) => c.toBlob((bl) => (bl ? bl.arrayBuffer().then((a) => res(new Uint8Array(a))) : rej(new Error('toBlob failed'))), 'image/jpeg', 0.9));
      c.width = c.height = 0;
      return { jpg, width: vp.width / k, height: vp.height / k };
    };
  }

  /**
   * bytes: הקובץ אחרי שכל שאר השינויים הוחלו.
   * redacted: [[pageIndex, [{ x, y, w, h }]]] — מלבנים ביחידות PDF, ראשית בפינה השמאלית-עליונה של העמוד המוצג.
   * opts: { pdfjsLib, pdfjsOpts } בדפדפן, או { render(idx, boxes) → { jpg, width, height } } (בדיקות).
   */
  async function applyRedactions(bytes, redacted, opts) {
    const o = opts || {};
    const doc = await PDFDocument.load(bytes);
    let pdf = null;
    let render = o.render;
    if (!render) {
      pdf = await o.pdfjsLib.getDocument({ ...(o.pdfjsOpts || {}), data: bytes.slice() }).promise;
      render = canvasRenderer(o.pdfjsLib, pdf);
    }
    try {
      for (const [idx, boxes] of redacted) {
        const { jpg, width, height } = await render(idx, boxes);
        const img = await doc.embedJpg(jpg);
        const np = doc.insertPage(idx, [width, height]);
        np.drawImage(img, { x: 0, y: 0, width, height });
        doc.removePage(idx + 1);
      }
    } finally {
      if (pdf) pdf.destroy();
    }
    // העתקה למסמך נקי: רק מה שנגיש מהעמודים עובר. שאריות העמודים המקוריים נשמטות
    const clean = await PDFDocument.create();
    const copied = await clean.copyPages(doc, doc.getPageIndices());
    copied.forEach((p) => clean.addPage(p));
    clean.setProducer('איתןPDF');
    return clean.save();
  }

  return { applyRedactions, DPI };
});
