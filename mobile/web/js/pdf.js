// pdf.js — הגדרה אחת לכל האפליקציה
import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

export const PDFJS_OPTS = {
  cMapUrl: new URL('../vendor/pdfjs/cmaps/', import.meta.url).href,
  cMapPacked: true,
  standardFontDataUrl: new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href,
  isEvalSupported: false,
};

/** פתיחה ב-pdf.js. מעבירים עותק — pdf.js מעביר את הזיכרון ל-worker */
export function openPdf(bytes) {
  return pdfjsLib.getDocument({ ...PDFJS_OPTS, data: bytes.slice() }).promise;
}

export { pdfjsLib };
