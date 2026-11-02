/*
 * מנוע עברית לכתיבה לתוך PDF.
 *
 * PDF לא מכיר כיווניות: הוא מצייר גליפים משמאל לימין בדיוק בסדר שקיבל.
 * לכן כל טקסט שנכתב לקובץ עובר כאן ממחרוזת "לוגית" (כפי שמקלידים)
 * למחרוזת "חזותית" (כפי שצריך לצייר), לפי אלגוריתם Unicode Bidi:
 *   - עברית מתהפכת, מספרים ואנגלית בתוך משפט עברי נשארים משמאל לימין
 *   - סוגריים ותווים "משוקפים" מתהפכים ( ) [ ] < >
 *   - ניקוד וטעמים נשארים צמודים לאות שלהם (אשכולות גרפמים)
 *
 * הקובץ עובד גם ב-Node (בדיקות) וגם בדפדפן (window.HebrewPDF).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('bidi-js'));
  } else {
    root.HebrewPDF = factory(root.bidi_js);
  }
})(typeof self !== 'undefined' ? self : this, function (bidiFactory) {
  'use strict';

  const bidi = bidiFactory();
  const MARK_RE = /\p{M}/u;
  const RTL_RE = /[֐-׿؀-ۿיִ-﷿ﹰ-﻿]/;

  /** האם יש בטקסט תווים מימין לשמאל */
  function hasRTL(text) {
    return RTL_RE.test(text || '');
  }

  /** פיצול למקבצים: אות בסיס + כל סימני הניקוד שאחריה */
  function clusters(text) {
    const out = [];
    let i = 0;
    while (i < text.length) {
      const start = i;
      const cp = text.codePointAt(i);
      i += cp > 0xffff ? 2 : 1;
      while (i < text.length) {
        const next = text.codePointAt(i);
        if (!MARK_RE.test(String.fromCodePoint(next))) break;
        i += next > 0xffff ? 2 : 1;
      }
      out.push({ start, end: i });
    }
    return out;
  }

  /**
   * המרת שורה אחת מסדר לוגי לסדר חזותי.
   * @param {string} text שורה (בלי ירידות שורה)
   * @param {'rtl'|'ltr'|'auto'} direction כיוון הפסקה. ברירת מחדל: auto (לפי התו החזק הראשון)
   */
  function toVisual(text, direction) {
    if (!text) return '';
    let dir = direction || 'auto';
    if (dir === 'auto') dir = detectDirection(text);
    if (dir === 'ltr' && !hasRTL(text)) return text;

    const embedding = bidi.getEmbeddingLevels(text, dir);
    const { levels } = embedding;
    const mirrors = bidi.getMirroredCharactersMap(text, levels);

    // כל מקבץ מקבל את רמת אות הבסיס שלו
    const cl = clusters(text).map((c) => {
      let s = '';
      for (let k = c.start; k < c.end; k++) s += mirrors.has(k) ? mirrors.get(k) : text[k];
      return { s, level: levels[c.start] };
    });

    // כלל L2 של Unicode Bidi: הפיכת רצפים מהרמה הגבוהה ביותר עד הרמה האי-זוגית הנמוכה ביותר
    let max = 0;
    let minOdd = Infinity;
    for (const c of cl) {
      if (c.level > max) max = c.level;
      if (c.level % 2 === 1 && c.level < minOdd) minOdd = c.level;
    }
    for (let lvl = max; lvl >= minOdd && minOdd !== Infinity; lvl--) {
      let i = 0;
      while (i < cl.length) {
        if (cl[i].level >= lvl) {
          let j = i;
          while (j < cl.length && cl[j].level >= lvl) j++;
          const rev = cl.slice(i, j).reverse();
          for (let k = 0; k < rev.length; k++) cl[i + k] = rev[k];
          i = j;
        } else i++;
      }
    }
    return cl.map((c) => c.s).join('');
  }

  /** כיוון לפי התו החזק הראשון */
  function detectDirection(text) {
    for (const ch of text) {
      if (RTL_RE.test(ch)) return 'rtl';
      if (/[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/.test(ch)) return 'ltr';
    }
    return 'rtl';
  }

  /**
   * שבירת טקסט לשורות לפי רוחב, בסדר לוגי (לפני ההיפוך), כדי שמילים לא יתערבבו בין שורות.
   * @param {(s:string)=>number} measure פונקציה שמחזירה רוחב של מחרוזת
   */
  function wrapLines(text, maxWidth, measure) {
    const result = [];
    for (const para of String(text || '').split(/\r?\n/)) {
      if (!maxWidth || measure(para) <= maxWidth) {
        result.push(para);
        continue;
      }
      const words = para.split(/(\s+)/);
      let line = '';
      for (const w of words) {
        const candidate = line + w;
        if (line && measure(candidate.trim()) > maxWidth) {
          result.push(line.trim());
          line = w.trimStart();
        } else line = candidate;
      }
      if (line.trim() || !result.length) result.push(line.trim());
    }
    return result;
  }

  /**
   * הטמעת פונט עברי במסמך.
   * חשוב: fontkit הופך בעצמו כל טקסט עברי (והופך גם את המספרים שבתוכו — זה הבאג
   * הקלאסי של "מספרים הפוכים" ב-PDF עברי). אנחנו כבר מסדרים את הטקסט חזותית,
   * לכן נועלים את fontkit על כיוון משמאל לימין.
   */
  async function embedFont(pdfDoc, fontBytes, fontkitLib) {
    if (fontkitLib) pdfDoc.registerFontkit(fontkitLib);
    const pdfFont = await pdfDoc.embedFont(fontBytes, { subset: true });
    const raw = pdfFont.embedder && pdfFont.embedder.font;
    if (raw && !raw.__ltrPatched) {
      const original = raw.layout.bind(raw);
      raw.layout = (str, features, script, language) => original(str, features, script, language, 'ltr');
      raw.__ltrPatched = true;
    }
    pdfFont.__raw = raw;
    return pdfFont;
  }

  /** ציור שורה חזותית אחת. אם יש ניקוד — גליף אחר גליף, עם מיקום הסימנים מהפונט */
  function drawVisualLine(page, visual, x, y, o) {
    const raw = o.font.__raw;
    if (!raw || o.rotate || !MARK_RE.test(visual)) {
      const d = { x, y, size: o.size, font: o.font };
      if (o.color) d.color = o.color;
      if (o.opacity != null) d.opacity = o.opacity;
      if (o.rotate) d.rotate = o.rotate;
      page.drawText(visual, d);
      return;
    }
    const run = raw.layout(visual);
    const scale = o.size / raw.unitsPerEm;
    let pen = x;
    let baseX = x;
    let baseAdv = 0;
    run.glyphs.forEach((g, i) => {
      const pos = run.positions[i];
      const s = String.fromCodePoint(...g.codePoints);
      const isMark = pos.xAdvance === 0 && MARK_RE.test(s);
      if (!isMark) {
        baseX = pen;
        baseAdv = pos.xAdvance;
      }
      if (s.trim()) {
        let gx = pen + pos.xOffset * scale;
        // סימן שהפונט לא מיקם (למשל דגש אחרי תנועה) — ממרכזים מעל האות
        if (isMark && pos.xOffset === 0 && pos.yOffset === 0 && g.bbox) {
          gx = baseX + (baseAdv / 2 - (g.bbox.minX + g.bbox.maxX) / 2) * scale;
        }
        const d = { x: gx, y: y + pos.yOffset * scale, size: o.size, font: o.font };
        if (o.color) d.color = o.color;
        if (o.opacity != null) d.opacity = o.opacity;
        page.drawText(s, d);
      }
      pen += pos.xAdvance * scale;
    });
  }

  /**
   * ציור טקסט (עברית/אנגלית/מעורב, כמה שורות) על עמוד pdf-lib.
   * x,y הם הפינה השמאלית-עליונה של תיבת הטקסט ביחידות PDF.
   * @param {object} opts { x, y, size, font, color, width, align: 'right'|'left'|'center', lineHeight, direction, opacity, rotate }
   */
  function drawText(page, text, opts) {
    const { font, size = 14, color, opacity, rotate } = opts;
    const lineHeight = (opts.lineHeight || 1.25) * size;
    const measure = (s) => font.widthOfTextAtSize(s, size);
    const lines = wrapLines(text, opts.width, measure);
    const dir = opts.direction || detectDirection(text);
    const align = opts.align || (dir === 'rtl' ? 'right' : 'left');
    // קו הבסיס מחושב בדיוק כמו בדפדפן (CSS line-height), כדי שמה שרואים בתצוגה זה מה שנשמר
    const raw = font.__raw;
    const asc = raw ? raw.ascent / raw.unitsPerEm : 0.9;
    const desc = raw ? -raw.descent / raw.unitsPerEm : 0.25;
    const lh = opts.lineHeight || 1.25;
    let y = opts.y - ((lh - (asc + desc)) / 2 + asc) * size;
    for (const logical of lines) {
      const visual = toVisual(logical, dir);
      const w = measure(visual);
      let x = opts.x;
      if (opts.width) {
        if (align === 'right') x = opts.x + opts.width - w;
        else if (align === 'center') x = opts.x + (opts.width - w) / 2;
      }
      drawVisualLine(page, visual, x, y, { size, font, color, opacity, rotate });
      y -= lineHeight;
    }
    return { lines: lines.length, height: lines.length * lineHeight };
  }

  /** מדידת גובה טקסט מראש (לתיבות) */
  function measureBlock(text, font, size, width, lineHeight) {
    const lines = wrapLines(text, width, (s) => font.widthOfTextAtSize(s, size));
    const lw = Math.max(0, ...lines.map((l) => font.widthOfTextAtSize(toVisual(l), size)));
    return { lines: lines.length, width: lw, height: lines.length * (lineHeight || 1.25) * size };
  }

  return { toVisual, hasRTL, detectDirection, wrapLines, drawText, measureBlock, clusters, embedFont, drawVisualLine };
});
