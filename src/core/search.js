/*
 * חיפוש טקסט בקובץ, מעל קורא הטקסט של העורך (textedit.js): אותן שורות בסדר לוגי נכון,
 * כך שעברית, מספרים ואנגלית בתוך עברית, וניקוד נמצאים כמו שמקלידים אותם.
 *
 * ההתאמה: בלי הבדל בין אותיות גדולות וקטנות, בלי ניקוד וטעמים, גרש/גרשיים וסוגי מקפים
 * כאחד, וכל רצף רווחים כרווח אחד. התוצאה: מלבנים (במרחב המשתמש של העמוד) סביב הגליפים
 * של המילים שנמצאו בלבד.
 *
 * משותף לגרסת Windows/Mac ולאפליקציית האנדרואיד. עובד ב-Node (בדיקות) ובדפדפן (window.PdfSearch).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./hebrew.js'), require('./textedit.js'));
  } else {
    root.PdfSearch = factory(root.HebrewPDF, root.TextEdit);
  }
})(typeof self !== 'undefined' ? self : this, function (H, TextEdit) {
  'use strict';

  const MARK_RE = /\p{M}/u; // ניקוד, טעמים וסימנים מצטרפים
  const FOLD = {
    '״': '"', '“': '"', '”': '"', '„': '"', '″': '"',
    '׳': "'", '‘': "'", '’': "'", '‚': "'", '′': "'", '`': "'",
    '־': '-', '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '−': '-',
  };

  /** נרמול תו אחד לחיפוש: '' = מתעלמים ממנו, ' ' = רווח */
  function foldChar(c) {
    if (/\s/.test(c)) return ' ';
    if (FOLD[c]) return FOLD[c];
    if (c === '־') return '-';
    if (MARK_RE.test(c)) return '';
    const n = c.normalize('NFKC'); // ליגטורות (ﬁ) ואותיות ברוחב מלא
    return n.toLowerCase();
  }

  /** נרמול טקסט לחיפוש (למשל מה שהמשתמש הקליד) */
  function normalize(text) {
    let out = '';
    for (const c of String(text || '')) {
      const f = foldChar(c);
      if (f === ' ' && (out === '' || out.endsWith(' '))) continue;
      out += f;
    }
    return out.trim();
  }

  const indexCache = new WeakMap();

  /**
   * אינדקס של שורה: { text, glyph } — text הוא הטקסט המנורמל בסדר לוגי, ו-glyph[i] הוא
   * האינדקס של הגליף (ב-line.glyphs) שממנו הגיע התו i, או -1.
   */
  function indexLine(line, lines) {
    if (indexCache.has(line)) return indexCache.get(line);
    // תווים חזותיים עם הגליף של כל אחד (ליגטורה נפרשת לכמה אותיות עם אותו גליף)
    const vis = [];
    const vmap = line.vmap || [];
    let k = 0;
    for (const c of line.visual) {
      const g = vmap.length ? vmap[k] : -1;
      k += c.length;
      const exp = /[ﬀ-ﬆ]/.test(c) ? c.normalize('NFKC') : c;
      for (const e of exp) vis.push({ c: e, g });
    }
    const visual = vis.map((v) => v.c).join('');
    const dir = H.hasRTL(visual) ? 'rtl' : 'ltr';
    const { text: logical, from } = H.reorderWithMap(visual, dir);
    // הסוגריים — כמו בעורך (יש יוצרים ששומרים אותם הפוכים)
    let text = logical;
    try {
      const t = TextEdit.lineText(line, lines).text;
      if (t.length === logical.length) text = t;
    } catch (e) { /* נשארים עם הלוגי */ }
    let norm = '';
    const glyph = [];
    let i = 0;
    for (const c of text) {
      const src = from[i];
      i += c.length;
      const f = foldChar(c);
      if (!f) continue;
      if (f === ' ' && (norm === '' || norm.endsWith(' '))) continue;
      for (let q = 0; q < f.length; q++) { norm += f[q]; glyph.push(src == null || !vis[src] ? -1 : vis[src].g); }
    }
    const res = { text: norm, glyph, plain: text };
    indexCache.set(line, res);
    return res;
  }

  /** מלבנים סביב הגליפים: גליפים סמוכים (בסדר השורה) מתאחדים למלבן אחד */
  function rectsFor(line, glyphIdx) {
    const uniq = [...new Set(glyphIdx.filter((g) => g >= 0))];
    if (!uniq.length) return [line.box.slice()];
    // סדר לאורך השורה: לפי המיקום של הגליף ב-vmap
    const pos = new Map();
    (line.vmap || []).forEach((g, k) => { if (g >= 0 && !pos.has(g)) pos.set(g, k); });
    uniq.sort((a, b) => (pos.get(a) ?? 0) - (pos.get(b) ?? 0));
    const runs = [];
    let cur = null, last = -2;
    for (const g of uniq) {
      const p = pos.get(g) ?? 0;
      const b = line.glyphs[g].bbox;
      // רווח אחד (או ניקוד) בין גליפים עדיין נחשב רצוף
      if (cur && p - last <= 2) {
        cur[0] = Math.min(cur[0], b[0]); cur[1] = Math.min(cur[1], b[1]);
        cur[2] = Math.max(cur[2], b[2]); cur[3] = Math.max(cur[3], b[3]);
      } else {
        cur = [b[0], b[1], b[2], b[3]];
        runs.push(cur);
      }
      last = p;
    }
    return runs;
  }

  /**
   * חיפוש בשורות של עמוד אחד (התוצאה של TextEdit.groupLines).
   * מחזיר [{ line, lineIndex, rects: [[x0,y0,x1,y1]...], snippet }] בסדר הקריאה.
   */
  function findInLines(lines, query) {
    const q = normalize(query);
    if (!q) return [];
    const out = [];
    lines.forEach((line, lineIndex) => {
      const idx = indexLine(line, lines);
      let from = 0;
      for (;;) {
        const at = idx.text.indexOf(q, from);
        if (at < 0) break;
        out.push({ line, lineIndex, rects: rectsFor(line, idx.glyph.slice(at, at + q.length)), snippet: idx.plain });
        from = at + q.length;
      }
    });
    return out;
  }

  /** קריאת השורות של עמוד ב-pdf-lib (נוח לבדיקות; הממשקים משתמשים במטמון משלהם) */
  function pageLines(doc, pageIndex) {
    return TextEdit.groupLines(TextEdit.analyzePage(doc, doc.getPage(pageIndex)).glyphs);
  }

  return { normalize, indexLine, findInLines, pageLines };
});
