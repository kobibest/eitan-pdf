/*
 * המרת PDF לקובץ Word (DOCX), בלי אינטרנט.
 *
 * הטקסט נקרא דרך textedit.js — אותו מנוע שמשמש לעריכת הטקסט הקיים — ולכן העברית
 * יוצאת בסדר הלוגי (כפי שמקלידים), עם ניקוד, מספרים, אנגלית וסוגריים במקום הנכון.
 *
 * מה נשמר: פסקאות (שורות שנשברו מתחברות בחזרה), יישור, הזחות, ריווח, גודל, גופן,
 * הדגשה, נטוי וצבע (גם בתוך שורה), כותרות (כך שתוכן העניינים ב-Word עובד),
 * טבלאות (לפי טורים של טקסט), תמונות במקומן בזרימה, וגודל וכיוון של כל עמוד.
 * עמוד סרוק (בלי טקסט), או עמוד שהטקסט שלו לא קריא, נכנס כתמונה של העמוד.
 *
 * את התמונות עצמן המנוע לא מצייר: הוא מבקש אותן מהממשק (renderImage), שמצייר את
 * האזור ב-pdf.js. כך כל סוג תמונה יוצא נכון (מסכות, CMYK, JBIG2 וכו').
 *
 * עובד ב-Node (בדיקות) ובדפדפן (window.Docx).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('pdf-lib'), require('./hebrew.js'), require('./textedit.js'), require('fflate'));
  } else {
    root.Docx = factory(root.PDFLib, root.HebrewPDF, root.TextEdit, root.fflate);
  }
})(typeof self !== 'undefined' ? self : this, function (PDFLib, H, TE, fflate) {
  'use strict';

  const { PDFDocument, PDFName, PDFArray, PDFStream } = PDFLib;
  const N = (s) => PDFName.of(s);
  const RTL_RE = /[֐-׿؀-ۿיִ-﷿ﹰ-﻿]/;
  const LTR_RE = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

  /* ---------- גאומטריה ---------- */

  const mul = (a, b) => [
    a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
  ];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const median = (arr) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /** תיבת העמוד הנראית (CropBox, ואם אין — MediaBox) */
  function pageBox(page) {
    let b;
    try { b = page.getCropBox ? page.getCropBox() : page.getMediaBox(); } catch (e) { b = page.getMediaBox(); }
    return [b.x, b.y, b.x + b.width, b.y + b.height];
  }

  /* ---------- תמונות בעמוד ---------- */

  /** כל התמונות שמצוירות בעמוד (כולל בתוך Form XObject), עם התיבה שלהן במרחב העמוד */
  function findImages(doc, page) {
    const out = [];
    const walk = (bytes, resources, ctm0, depth) => {
      let ops;
      try { ops = TE.parseOps(bytes); } catch (e) { return; }
      const xobjs = resources && TE.lookup(doc, resources.get(N('XObject')));
      const stack = [];
      let m = ctm0;
      for (const o of ops) {
        const a = o.args;
        if (o.op === 'q') stack.push(m);
        else if (o.op === 'Q') { if (stack.length) m = stack.pop(); }
        else if (o.op === 'cm' && a.length === 6) m = mul(a, m);
        else if (o.op === 'Do' && xobjs && a[0] && a[0].name) {
          const xo = TE.lookup(doc, xobjs.get(N(a[0].name)));
          if (!(xo instanceof PDFStream)) continue;
          const sub = TE.nameOf(doc, xo.dict.get(N('Subtype')));
          if (sub === 'Image') {
            const pts = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => apply(m, x, y));
            const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
            const filter = TE.lookup(doc, xo.dict.get(N('Filter')));
            const filters = filter instanceof PDFArray ? filter.asArray().map((f) => TE.nameOf(doc, f)) : [TE.nameOf(doc, filter)];
            out.push({
              box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
              px: [TE.num(doc, xo.dict.get(N('Width')), 0), TE.num(doc, xo.dict.get(N('Height')), 0)],
              photo: filters.includes('DCTDecode') || filters.includes('JPXDecode'),
            });
          } else if (sub === 'Form' && depth < 8) {
            const mArr = TE.lookup(doc, xo.dict.get(N('Matrix')));
            const fm = mArr instanceof PDFArray ? mArr.asArray().map((v) => TE.num(doc, v, 0)) : [1, 0, 0, 1, 0, 0];
            walk(TE.streamBytes(doc, xo), TE.getResources(doc, xo.dict) || resources, mul(fm, m), depth + 1);
          }
        }
      }
    };
    walk(TE.pageContentBytes(doc, page), TE.pageResources(doc, page), [1, 0, 0, 1, 0, 0], 0);
    return out;
  }

  /* ---------- גופנים וסגנון ---------- */

  const KNOWN_FONTS = {
    arial: 'Arial', helvetica: 'Arial', arialnarrow: 'Arial Narrow', timesnewroman: 'Times New Roman', times: 'Times New Roman',
    couriernew: 'Courier New', courier: 'Courier New', calibri: 'Calibri', cambria: 'Cambria', tahoma: 'Tahoma', verdana: 'Verdana',
    segoeui: 'Segoe UI', david: 'David', davidlibre: 'David Libre', miriam: 'Miriam', miriamfixed: 'Miriam Fixed', narkisim: 'Narkisim',
    frankruehl: 'FrankRuehl', frankruehllibre: 'Frank Ruhl Libre', gisha: 'Gisha', aharoni: 'Aharoni', levenim: 'Levenim MT', levenimmt: 'Levenim MT',
    guttmanyad: 'Guttman Yad', rod: 'Rod', alef: 'Alef', ibmplexsanshebrew: 'IBM Plex Sans Hebrew', assistant: 'Assistant',
    heebo: 'Heebo', rubik: 'Rubik', opensans: 'Open Sans', noto: 'Noto Sans', notosanshebrew: 'Noto Sans Hebrew', dejavusans: 'DejaVu Sans',
    liberationsans: 'Liberation Sans', liberationserif: 'Liberation Serif', symbol: 'Symbol', wingdings: 'Wingdings',
  };
  const fontCache = new Map();
  /** שם גופן ב-PDF ("ABCDEF+Arial-BoldMT") → שם משפחה ב-Word ("Arial") */
  function fontFamily(name) {
    if (fontCache.has(name)) return fontCache.get(name);
    let n = String(name || '').replace(/^[A-Z]{6}\+/, '');
    n = n.split(/[,-]/)[0].replace(/(PS)?MT$/, '').replace(/PS$/, '');
    const keyOf = (v) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
    const full = keyOf(n);
    n = n.replace(/(Bold|Italic|Oblique|Regular|Medium|Light|SemiBold|Semibold|Black|Heavy|Book|Roman)+$/, '') || n;
    const key = keyOf(n);
    let fam;
    if (KNOWN_FONTS[full]) fam = KNOWN_FONTS[full];
    else if (KNOWN_FONTS[key]) fam = KNOWN_FONTS[key];
    else if (!n || /^(F|T|TT|C)\d+/i.test(n) || /^\d/.test(n) || n.length < 3) fam = 'Arial';
    else fam = n.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
    fontCache.set(name, fam);
    return fam;
  }

  const hex = (rgb) => rgb.map((v) => Math.round(clamp(+v || 0, 0, 1) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

  function styleOf(g) {
    const fam = fontFamily(g.font.name);
    const color = g.Tr === 3 || g.Tr === 7 ? '000000' : hex(g.fill || [0, 0, 0]);
    return {
      b: !!g.font.bold, i: /italic|oblique/i.test(g.font.name || ''),
      sz: Math.max(2, Math.round(g.size * 2)), // חצאי נקודות
      color: color === '000000' || /^(0[0-9A-F]){3}$/.test(color) && parseInt(color.slice(0, 2), 16) < 26 ? null : color,
      font: fam,
    };
  }
  const styleKey = (s) => [s.b ? 1 : 0, s.i ? 1 : 0, s.sz, s.color || '', s.font].join('|');

  const PAIRS = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{' };
  const swapBrackets = (t) => t.replace(/[()[\]{}]/g, (c) => PAIRS[c]);

  /**
   * הטקסט הלוגי של שורה, מחולק לקטעים לפי סגנון (למשל "הנדון:" מודגש ואחריו טקסט רגיל).
   * כל קטע חזותי מומר בנפרד ומסודר לפי כיוון השורה. אם החיבור לא נותן בדיוק את הטקסט
   * של השורה כולה (למשל מספר מודגש באמצע משפט בעברית) — השורה כולה בסגנון הנפוץ בה.
   */
  function lineRuns(L, lines) {
    const { text, dir } = TE.lineText(L, lines);
    // vmap (מ-textedit.js): לכל תו — האינדקס של הגליף שלו, או -1 לרווח שנוסף בגלל פער (מקבל את הסגנון של התו שלפניו)
    const glyphOf = (k) => {
      for (let j = k; j >= 0; j--) if (L.vmap[j] >= 0) return L.glyphs[L.vmap[j]];
      for (let j = k + 1; j < L.vmap.length; j++) if (L.vmap[j] >= 0) return L.glyphs[L.vmap[j]];
      return L.glyphs[0];
    };
    const styles = L.vmap ? L.vmap.map((_, k) => styleOf(glyphOf(k))) : [];
    const counts = new Map();
    for (const s of styles) { const k = styleKey(s); counts.set(k, (counts.get(k) || 0) + 1); }
    let major = styles[0] || styleOf(L.glyphs[0]);
    let best = 0;
    for (const s of styles) { const c = counts.get(styleKey(s)); if (c > best) { best = c; major = s; } }
    const single = [{ text, style: major }];
    if (counts.size < 2 || !L.vmap || L.vmap.length !== L.visual.length || /[ﬀ-ﬆ]/.test(L.visual)) return { text, dir, runs: single, style: major };
    const segs = [];
    for (let k = 0; k < L.visual.length; k++) {
      const s = styles[k];
      const last = segs[segs.length - 1];
      if (last && styleKey(last.style) === styleKey(s)) last.vis += L.visual[k];
      else segs.push({ vis: L.visual[k], style: s });
    }
    // רווח בגבול בין קטעים שייך לקטע הרגיל, לא למודגש (שלא יופיע קו תחתון/הדגשה על רווח)
    const rawLogical = H.toLogical(L.visual, dir);
    const swapped = rawLogical !== text && swapBrackets(rawLogical) === text;
    const order = dir === 'rtl' ? segs.slice().reverse() : segs;
    const parts = order.map((sg) => {
      let t = H.toLogical(sg.vis, dir);
      if (swapped) t = swapBrackets(t);
      return { text: t, style: sg.style };
    });
    if (parts.map((p) => p.text).join('') !== text) return { text, dir, runs: single, style: major };
    return { text, dir, runs: parts.filter((p) => p.text), style: major };
  }

  /* ---------- ניתוח עמוד ---------- */

  /**
   * מבנה העמוד: { kind:'text', blocks, ... } או { kind:'image' } לעמוד סרוק / לא קריא.
   * blocks: פסקאות, טבלאות ותמונות, מלמעלה למטה.
   */
  function analyzePage(doc, page) {
    const box = pageBox(page);
    const rotate = ((page.getRotation().angle % 360) + 360) % 360;
    let analysis;
    try { analysis = TE.analyzePage(doc, page); } catch (e) { analysis = { glyphs: [] }; }
    let all = TE.groupLines(analysis.glyphs, { hidden: true }).filter((L) => L.visual.trim());
    const chars = (ls) => ls.reduce((n, L) => n + L.visual.replace(/\s/g, '').length, 0);
    const total = chars(all);
    const bad = chars(all.filter((L) => !L.ok));
    const base = { box, rotate };
    if (!total) return { ...base, kind: 'image', reason: 'scan' };
    if (bad > total * 0.3) return { ...base, kind: 'image', reason: 'unreadable' };
    all = all.filter((L) => L.ok);

    // הכיוון השולט של הטקסט בעמוד (בדרך כלל 0; עמוד שנסרק לרוחב — 90)
    const angW = new Map();
    for (const L of all) angW.set(L.angle, (angW.get(L.angle) || 0) + L.visual.length);
    const angle = [...angW.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const c = Math.cos(-angle), s = Math.sin(-angle);
    const toFrame = (x, y) => [x * c - y * s, x * s + y * c];
    const corners = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].map(([x, y]) => toFrame(x, y));
    const frame = {
      u0: Math.min(...corners.map((p) => p[0])), u1: Math.max(...corners.map((p) => p[0])),
      v0: Math.min(...corners.map((p) => p[1])), v1: Math.max(...corners.map((p) => p[1])),
    };

    // שורות בכיוון השולט — בזרימה הרגילה; שורות בזווית אחרת (חותמת אלכסונית) — בסוף העמוד
    const lines = [];
    const odd = [];
    for (const L of all) {
      const r = lineRuns(L, all);
      if (!r.text.trim()) continue;
      const m = { u0: L.u0, u1: L.u1, v: L.v, size: L.size, dir: r.dir, text: r.text, runs: r.runs, style: r.style, bold: L.bold };
      m.top = m.v + m.size * 0.85;
      m.bottom = m.v - m.size * 0.25;
      (Math.abs(L.angle - angle) < 0.02 ? lines : odd).push(m);
    }
    const rtlChars = lines.filter((L) => L.dir === 'rtl').reduce((n, L) => n + L.text.length, 0);
    const dir = rtlChars * 2 >= lines.reduce((n, L) => n + L.text.length, 0) ? 'rtl' : 'ltr';
    const bodySize = median(lines.flatMap((L) => Array(Math.min(50, L.text.length)).fill(L.size))) || 11;

    // אזור הטקסט (השוליים)
    const col = {
      l: Math.min(...lines.map((L) => L.u0)), r: Math.max(...lines.map((L) => L.u1)),
      t: Math.max(...lines.map((L) => L.top)), b: Math.min(...lines.map((L) => L.bottom)),
    };

    // תמונות: לא תמונת רקע שמכסה את רוב העמוד (סריקה עם שכבת טקסט, נייר מכתבים) ולא קישוטים זעירים
    const pageArea = (frame.u1 - frame.u0) * (frame.v1 - frame.v0);
    const seen = new Set();
    const images = [];
    for (const im of findImages(doc, page)) {
      const pts = [[im.box[0], im.box[1]], [im.box[2], im.box[1]], [im.box[2], im.box[3]], [im.box[0], im.box[3]]].map(([x, y]) => toFrame(x, y));
      const f = { u0: Math.min(...pts.map((p) => p[0])), u1: Math.max(...pts.map((p) => p[0])), v0: Math.min(...pts.map((p) => p[1])), v1: Math.max(...pts.map((p) => p[1])) };
      // חיתוך לגבולות העמוד
      f.u0 = Math.max(f.u0, frame.u0); f.u1 = Math.min(f.u1, frame.u1); f.v0 = Math.max(f.v0, frame.v0); f.v1 = Math.min(f.v1, frame.v1);
      const w = f.u1 - f.u0, h = f.v1 - f.v0;
      if (w < 6 || h < 6) continue;
      if (w * h > pageArea * 0.45) continue;
      const key = [f.u0, f.u1, f.v0, f.v1].map((v) => Math.round(v)).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      images.push({ type: 'image', box: im.box, w, h, u0: f.u0, u1: f.u1, top: f.v1, bottom: f.v0, px: im.px, photo: im.photo });
    }

    const blocks = layoutBlocks(lines, col, dir, bodySize);
    // תמונה נכנסת לפני הבלוק הראשון שמתחיל מתחתיה
    for (const im of images.sort((a, b) => b.top - a.top)) {
      const k = blocks.findIndex((b) => b.top < im.top - 1);
      if (k < 0) blocks.push(im); else blocks.splice(k, 0, im);
    }
    if (odd.length) {
      const extra = buildParagraphs(odd.sort((a, b) => b.v - a.v || a.u0 - b.u0), { l: col.l, r: col.r }, dir, bodySize);
      blocks.push(...extra);
    }
    return { ...base, kind: 'text', angle, frame, col, dir, bodySize, blocks, images: images.length };
  }

  /* ---------- שורות → טבלאות ופסקאות ---------- */

  /** קיבוץ שורות שעל אותו קו בסיס לשורה אחת בעמוד, עם קטעים (תאים אפשריים) משמאל לימין */
  function toRows(lines) {
    const sorted = lines.slice().sort((a, b) => b.v - a.v);
    const rows = [];
    for (const L of sorted) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last.v - L.v) <= Math.min(last.size, L.size) * 0.4) { last.segs.push(L); last.size = Math.max(last.size, L.size); }
      else rows.push({ v: L.v, size: L.size, segs: [L] });
    }
    for (const r of rows) {
      r.segs.sort((a, b) => a.u0 - b.u0);
      r.top = Math.max(...r.segs.map((L) => L.top));
      r.bottom = Math.min(...r.segs.map((L) => L.bottom));
    }
    return rows;
  }

  /** כמה קטעים על אותו קו בסיס שאינם טבלה ("שם: ____   תאריך: ____") — שורה אחת, עם טאב ביניהם */
  function joinRow(r, dir) {
    if (r.segs.length === 1) return r.segs[0];
    const segs = dir === 'rtl' ? r.segs.slice().reverse() : r.segs;
    const runs = [];
    segs.forEach((L, k) => {
      if (k) runs.push({ text: '\t', style: L.runs[0].style });
      runs.push(...L.runs);
    });
    const big = segs.reduce((a, b) => (b.text.length > a.text.length ? b : a));
    return {
      ...big, u0: Math.min(...segs.map((L) => L.u0)), u1: Math.max(...segs.map((L) => L.u1)),
      top: r.top, bottom: r.bottom, runs, text: segs.map((L) => L.text).join('\t'), tabbed: true,
    };
  }

  /** טורים מתוך הקטעים של שורות מרובות קטעים: איחוד של טווחים חופפים */
  function columnsOf(rows) {
    const iv = rows.flatMap((r) => r.segs.map((L) => [L.u0, L.u1, L.size])).sort((a, b) => a[0] - b[0]);
    const cols = [];
    for (const [a, b, sz] of iv) {
      const last = cols[cols.length - 1];
      if (last && a <= last.r + sz * 0.3) last.r = Math.max(last.r, b);
      else cols.push({ l: a, r: b });
    }
    return cols;
  }
  const colIndex = (cols, L) => {
    let best = -1, ov = 0;
    cols.forEach((c, k) => {
      const o = Math.min(c.r, L.u1) - Math.max(c.l, L.u0);
      if (o > ov) { ov = o; best = k; }
    });
    return best;
  };

  function layoutBlocks(lines, col, dir, bodySize) {
    const rows = toRows(lines);
    const blocks = [];
    let flow = [];
    const flush = () => {
      if (!flow.length) return;
      blocks.push(...buildParagraphs(flow.map((r) => joinRow(r, dir)), { l: col.l, r: col.r }, dir, bodySize));
      flow = [];
    };
    let i = 0;
    while (i < rows.length) {
      const t = rows[i].segs.length >= 2 ? tryTable(rows, i, dir, bodySize) : null;
      if (t) {
        flush();
        blocks.push(t.table);
        i = t.next;
      } else {
        flow.push(rows[i]);
        i++;
      }
    }
    flush();
    return blocks;
  }

  /**
   * טבלה: לפחות שתי שורות רצופות עם כמה קטעים מופרדים (פער גדול), שהטורים שלהן מסתדרים.
   * שורה עם קטע אחד צמודה מתחת — המשך של תא (טקסט שנשבר בתוך התא).
   */
  function tryTable(rows, i, dir, bodySize) {
    const group = [rows[i]];
    let multi = 1;
    let j = i + 1;
    while (j < rows.length) {
      const prev = group[group.length - 1];
      const r = rows[j];
      const gap = prev.v - r.v;
      const sz = Math.max(prev.size, r.size);
      // שורות טבלה מרווחות: פער גדול מותר כשהשורה באותו מבנה (אותו מספר תאים) ובקצב קבוע
      const sameShape = r.segs.length >= 2 && r.segs.length === group[0].segs.length;
      // הקצב נקבע מהשורה השנייה ואילך (אחרי שורת הכותרת המרווח יכול להיות שונה)
      const pitch = group.length >= 3 ? group[group.length - 2].v - prev.v : 0;
      const okGap = gap <= sz * 3.2 || (sameShape && gap <= sz * 7 && (!pitch || gap < pitch * 1.35));
      if (!okGap) break;
      if (r.segs.length >= 2) { group.push(r); multi++; j++; continue; }
      const cols = columnsOf(group.filter((g) => g.segs.length >= 2));
      const k = colIndex(cols, r.segs[0]);
      const fits = k >= 0 && r.segs[0].u0 >= cols[k].l - r.size && r.segs[0].u1 <= cols[k].r + r.size;
      if (gap < r.size * 1.6 && fits) { group.push(r); j++; continue; }
      break;
    }
    // שורות בודדות בסוף הקבוצה לא שייכות לטבלה
    while (group.length && group[group.length - 1].segs.length < 2) { group.pop(); j--; }
    if (multi < 2) return null;
    const multiRows = group.filter((g) => g.segs.length >= 2);
    const cols = columnsOf(multiRows);
    // טורים שכנים שאף שורה לא משתמשת בשניהם (כותרת ממורכזת מעל נתונים מיושרים לצד) — טור אחד
    for (let k = 0; k < cols.length - 1;) {
      const both = group.some((r) => {
        const ks = new Set(r.segs.map((L) => colIndex(cols, L)));
        return ks.has(k) && ks.has(k + 1);
      });
      if (!both) { cols[k].r = cols[k + 1].r; cols.splice(k + 1, 1); } else k++;
    }
    if (cols.length < 2 || cols.length > 12) return null;
    // כל קטע בשורה צריך ליפול לטור משלו ברוב השורות
    let good = 0;
    for (const r of multiRows) {
      const ks = r.segs.map((L) => colIndex(cols, L));
      if (new Set(ks).size === ks.length) good++;
    }
    if (good < multiRows.length * 0.7) return null;

    // בניית שורות הטבלה: שורה חדשה בכל שורה מרובת קטעים, אלא אם היא צמודה לקודמת (המשך תאים)
    const trs = [];
    let prev = null;
    for (const r of group) {
      const cont = prev && (r.segs.length < 2 || (prev.v - r.v < r.size * 1.35 && trs[trs.length - 1].cells.some((c) => !c.length)));
      if (!cont) trs.push({ cells: cols.map(() => []), top: r.top, v: r.v });
      const tr = trs[trs.length - 1];
      for (const L of r.segs) tr.cells[Math.max(0, colIndex(cols, L))].push(L);
      prev = r;
    }
    // גבולות הטורים: באמצע הרווח בין טור לטור
    const bounds = cols.map((c, k) => ({
      l: k === 0 ? c.l : (cols[k - 1].r + c.l) / 2,
      r: k === cols.length - 1 ? c.r : (c.r + cols[k + 1].l) / 2,
    }));
    const pad = 4;
    bounds[0].l -= pad; bounds[bounds.length - 1].r += pad;
    const table = {
      type: 'table', dir, top: group[0].top, bottom: group[group.length - 1].bottom,
      u0: bounds[0].l, u1: bounds[bounds.length - 1].r,
      cols: bounds,
      rows: trs.map((tr, k) => ({
        // גובה השורה כמו במקור: המרחק לשורה הבאה (האחרונה — כמו הקודמת לה)
        height: k < trs.length - 1 ? tr.v - trs[k + 1].v : (k ? trs[k - 1].v - tr.v : 0),
        cells: tr.cells.map((cl, k) => buildParagraphs(cl.sort((a, b) => b.v - a.v || a.u0 - b.u0), { l: bounds[k].l + pad, r: bounds[k].r - pad }, dir, bodySize, true)),
      })),
    };
    return { table, next: j };
  }

  const BULLET_RE = /^\s*([•·▪■◦●○\-–—*]|\(?\d{1,3}[.)]|\(?[א-ת][.)]|[a-z][.)])\s/;

  /**
   * פסקאות מתוך שורות (מלמעלה למטה) בתוך אזור {l, r}.
   * שורה מצטרפת לפסקה כשהיא באותו כיוון וגודל, צמודה מתחת (ריווח שורות קבוע),
   * מתחילה באותו קצה, והשורה הקודמת הגיעה כמעט עד הקצה השני (לא שורה אחרונה של פסקה).
   */
  function buildParagraphs(lines, region, pageDir, bodySize, inCell) {
    const width = Math.max(1, region.r - region.l);
    const paras = [];
    const lead = (L, dir) => (dir === 'rtl' ? region.r - L.u1 : L.u0 - region.l); // מרחק מהקצה שבו השורה מתחילה
    const trail = (L, dir) => (dir === 'rtl' ? L.u0 - region.l : region.r - L.u1);
    let cur = null;
    for (const L of lines) {
      if (cur) {
        const P = cur.lines[cur.lines.length - 1];
        const pitch = P.v - L.v;
        const sz = Math.max(P.size, L.size);
        const tol = Math.max(3, sz * 0.6);
        let join = L.dir === cur.dir && Math.abs(P.size - L.size) <= sz * 0.15 && pitch > sz * 0.8 && pitch <= sz * 1.8;
        if (join && cur.lines.length >= 2) join = Math.abs(pitch - cur.pitch) <= sz * 0.25;
        if (join) {
          const centered = Math.abs((P.u0 + P.u1) / 2 - (L.u0 + L.u1) / 2) < tol && lead(P, cur.dir) > sz * 2 && trail(P, cur.dir) > sz * 2;
          const sameLead = cur.lines.length >= 2
            ? Math.abs(lead(L, cur.dir) - lead(cur.lines[1], cur.dir)) < tol
            : lead(L, cur.dir) <= lead(P, cur.dir) + tol && lead(P, cur.dir) - lead(L, cur.dir) < sz * 5;
          // השורה הקודמת מלאה: הגיעה עד קרוב לקצה האזור, או לפחות עד הקצה של השורה הבאה
          const full = trail(P, cur.dir) < Math.max(sz * 4, width * 0.12) || trail(P, cur.dir) <= trail(L, cur.dir) + tol;
          join = (centered || (sameLead && full)) && !BULLET_RE.test(L.text) && !L.tabbed && !P.tabbed;
        }
        if (join) {
          cur.lines.push(L);
          cur.pitch = (cur.lines[0].v - L.v) / (cur.lines.length - 1);
          continue;
        }
      }
      cur = { type: 'para', dir: L.dir, lines: [L], pitch: 0 };
      paras.push(cur);
    }

    for (const p of paras) finishParagraph(p, region, bodySize, inCell);
    // ריווח לפני כל פסקה, לפי המרחק מהפסקה הקודמת
    let prev = null;
    for (const p of paras) {
      const first = p.lines[0];
      const natural = (p.pitch || first.size * 1.2);
      if (prev) {
        const gap = prev.lines[prev.lines.length - 1].v - first.v - natural;
        p.before = clamp(gap, 0, 144);
      } else p.before = null; // הפסקה הראשונה ברצף — הריווח נקבע לפי הבלוק שלפניה
      prev = p;
    }
    return paras;
  }

  function finishParagraph(p, region, bodySize, inCell) {
    const { lines, dir } = p;
    const first = lines[0];
    p.top = Math.max(...lines.map((L) => L.top));
    p.bottom = Math.min(...lines.map((L) => L.bottom));
    p.u0 = Math.min(...lines.map((L) => L.u0));
    p.u1 = Math.max(...lines.map((L) => L.u1));
    p.size = median(lines.map((L) => L.size));
    const width = region.r - region.l;
    const sz = p.size;
    const tol = Math.max(3, sz * 0.6);
    const nearL = (u) => u - region.l < tol;
    const nearR = (u) => region.r - u < tol;
    const body = lines.length > 1 ? lines.slice(0, -1) : lines; // שורות "מלאות"

    // יישור
    const mid = (p.u0 + p.u1) / 2;
    const centered = Math.abs(mid - (region.l + region.r) / 2) < Math.max(sz * 1.5, width * 0.03)
      && !nearL(p.u0) && !nearR(p.u1) && (lines.length === 1 || lines.every((L) => Math.abs((L.u0 + L.u1) / 2 - mid) < tol * 1.5));
    const bothEdges = lines.length > 2 && body.every((L) => Math.abs(L.u0 - body[0].u0) < tol && Math.abs(L.u1 - body[0].u1) < tol)
      && Math.abs(lines[1].u0 - p.u0) < tol && Math.abs(lines[1].u1 - p.u1) < tol;
    if (centered) p.align = 'center';
    else if (bothEdges) p.align = 'both';
    else if (dir === 'rtl') p.align = nearL(p.u0) && !nearR(p.u1) && lines.length === 1 ? 'left' : 'right';
    else p.align = nearR(p.u1) && !nearL(p.u0) && lines.length === 1 ? 'right' : 'left';
    // שורה אחת: יישור לפי הצד הקרוב, כשהיא רחוקה מצד ההתחלה (תאריך משמאל במכתב בעברית)
    if (!centered && lines.length === 1 && !inCell) {
      const dl = p.u0 - region.l, dr = region.r - p.u1;
      if (dir === 'rtl' && dl < dr * 0.25 && dr > width * 0.3) p.align = 'left';
      if (dir === 'ltr' && dr < dl * 0.25 && dl > width * 0.3) p.align = 'right';
    }

    // הזחות (בנקודות, פיזית: מימין / משמאל)
    p.indR = 0; p.indL = 0; p.first = 0;
    if (p.align !== 'center') {
      const ref = lines.length > 1 ? lines[1] : first;
      if (dir === 'rtl' || p.align === 'right') {
        if (p.align !== 'left') p.indR = Math.max(0, region.r - Math.max(...lines.slice(lines.length > 1 ? 1 : 0).map((L) => L.u1)));
      }
      if (dir === 'ltr' || p.align === 'left') {
        if (p.align !== 'right') p.indL = Math.max(0, Math.min(...lines.slice(lines.length > 1 ? 1 : 0).map((L) => L.u0)) - region.l);
      }
      if (p.align === 'both') {
        p.indR = Math.max(0, region.r - Math.max(...body.slice(1).concat(lines.slice(-1)).map((L) => L.u1)));
        p.indL = Math.max(0, Math.min(...body.map((L) => L.u0)) - region.l);
      }
      // שורה ראשונה מוזחת (או תלויה)
      if (lines.length > 1) p.first = dir === 'rtl' ? ref.u1 - first.u1 : first.u0 - ref.u0;
      if (Math.abs(p.first) < sz * 0.4) p.first = 0;
      if (p.indR < sz * 0.5) p.indR = 0;
      if (p.indL < sz * 0.5) p.indL = 0;
    }

    // טקסט: חיבור השורות ברווח; מקף בסוף שורה באנגלית שנשברה באמצע מילה — מתחבר
    const runs = [];
    lines.forEach((L, k) => {
      const lr = L.runs.map((r) => ({ ...r }));
      if (k > 0 && runs.length) {
        const prevRun = runs[runs.length - 1];
        if (dir === 'ltr' && /[a-z]-$/.test(prevRun.text) && /^[a-z]/.test(lr[0].text)) prevRun.text = prevRun.text.slice(0, -1);
        else runs.push({ text: ' ', style: prevRun.style });
      }
      runs.push(...lr);
    });
    // איחוד קטעים צמודים באותו סגנון
    p.runs = [];
    for (const r of runs) {
      const last = p.runs[p.runs.length - 1];
      if (last && styleKey(last.style) === styleKey(r.style)) last.text += r.text;
      else if (last && /^\s+$/.test(r.text)) last.text += r.text;
      else p.runs.push({ text: r.text, style: r.style });
    }
    p.text = p.runs.map((r) => r.text).join('');
    // כותרת: גופן גדול בבירור מגוף הטקסט, פסקה קצרה
    p.heading = 0;
    if (!inCell && p.text.length < 200 && lines.length <= 3) {
      if (sz >= bodySize * 1.6) p.heading = 1;
      else if (sz >= bodySize * 1.25 || (first.bold && sz >= bodySize * 1.1)) p.heading = 2;
    }
  }

  /* ---------- כתיבת XML ---------- */

  const esc = (s) => String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tw = (pt) => Math.round(pt * 20); // twips
  const emu = (pt) => Math.round(pt * 12700);

  /**
   * פיצול טקסט לקטעים לפי כתב: מילים באנגלית ומספרים בקטע משמאל לימין, השאר בקטע מימין לשמאל.
   * כך Word מסדר כל קטע בגופן ובכיוון הנכונים (כמו שהוא עצמו שומר טקסט מעורב).
   */
  function splitScript(text, paraDir) {
    if (paraDir === 'ltr' && !RTL_RE.test(text)) return [{ text, rtl: false }];
    if (paraDir === 'rtl' && !LTR_RE.test(text) && !/\d/.test(text)) return [{ text, rtl: true }];
    const out = [];
    const re = /[A-Za-z0-9À-ɏͰ-ϿЀ-ӿ](?:[^֐-׿؀-ۿיִ-﷿ﹰ-﻿]*[A-Za-z0-9À-ɏͰ-ϿЀ-ӿ%])?/g;
    let at = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > at) out.push({ text: text.slice(at, m.index), rtl: true });
      out.push({ text: m[0], rtl: false });
      at = m.index + m[0].length;
    }
    if (at < text.length) out.push({ text: text.slice(at), rtl: true });
    // בפסקה משמאל לימין: רק קטעים עם אותיות עבריות הם RTL
    return out.filter((r) => r.text).map((r) => ({ text: r.text, rtl: paraDir === 'rtl' ? r.rtl : RTL_RE.test(r.text) }));
  }

  function rPr(st, rtl) {
    let x = '';
    if (st.font) x += `<w:rFonts w:ascii="${esc(st.font)}" w:hAnsi="${esc(st.font)}" w:cs="${esc(st.font)}"/>`;
    if (st.b) x += '<w:b/><w:bCs/>';
    if (st.i) x += '<w:i/><w:iCs/>';
    if (st.color) x += `<w:color w:val="${st.color}"/>`;
    if (st.sz) x += `<w:sz w:val="${st.sz}"/><w:szCs w:val="${st.sz}"/>`;
    if (rtl) x += '<w:rtl/>';
    return x ? `<w:rPr>${x}</w:rPr>` : '';
  }

  function runsXml(runs, dir) {
    let x = '';
    for (const r of runs) {
      r.text.split('\t').forEach((chunk, k) => {
        if (k) x += `<w:r>${rPr(r.style, dir === 'rtl')}<w:tab/></w:r>`;
        for (const part of splitScript(chunk, dir)) {
          if (part.text) x += `<w:r>${rPr(r.style, part.rtl)}<w:t xml:space="preserve">${esc(part.text)}</w:t></w:r>`;
        }
      });
    }
    return x;
  }

  /** מאפייני פסקה. בפסקה מימין לשמאל ב-Word, "left" הוא צד ההתחלה (ימין) — ולכן ההיפוך */
  function pPr(p, extra) {
    const rtl = p.dir === 'rtl';
    let x = '';
    if (p.heading) x += `<w:pStyle w:val="Heading${p.heading}"/>`;
    if (rtl) x += '<w:bidi/>';
    const sp = [];
    sp.push(`w:before="${tw(p.before || 0)}"`, 'w:after="0"');
    if (p.lines && p.lines.length > 1 && p.pitch) sp.push(`w:line="${tw(p.pitch)}"`, 'w:lineRule="atLeast"');
    x += `<w:spacing ${sp.join(' ')}/>`;
    const startInd = rtl ? p.indR : p.indL;
    const endInd = rtl ? p.indL : p.indR;
    const ind = [];
    if (startInd) ind.push(`w:left="${tw(startInd)}"`);
    if (endInd) ind.push(`w:right="${tw(endInd)}"`);
    if (p.first > 0) ind.push(`w:firstLine="${tw(p.first)}"`);
    else if (p.first < 0) ind.push(`w:hanging="${tw(-p.first)}"`);
    // בפסקה מימין לשמאל left/right מתפרשים לוגית (התחלה/סוף), ובמשמאל לימין — פיזית; בשני המקרים left = התחלה
    if (ind.length) x += `<w:ind ${ind.join(' ')}/>`;
    const phys = p.align || (rtl ? 'right' : 'left');
    const jc = phys === 'center' ? 'center' : phys === 'both' ? 'both' : rtl ? (phys === 'right' ? 'left' : 'right') : phys;
    x += `<w:jc w:val="${jc}"/>`;
    if (p.heading) x += `<w:outlineLvl w:val="${p.heading - 1}"/>`;
    return `<w:pPr>${x}${extra || ''}</w:pPr>`;
  }

  function paraXml(p, extra) {
    return `<w:p>${pPr(p, extra)}${runsXml(p.runs, p.dir)}</w:p>`;
  }

  function imageXml(ctx, img, wPt, hPt, align, dir) {
    const id = ++ctx.drawId;
    const rid = img.rid;
    const cx = emu(wPt), cy = emu(hPt);
    const rtl = dir === 'rtl';
    const jc = align === 'center' ? 'center' : rtl ? (align === 'left' ? 'right' : 'left') : align;
    return `<w:p><w:pPr>${rtl ? '<w:bidi/>' : ''}<w:spacing w:before="${tw(img.before || 0)}" w:after="0"/><w:jc w:val="${jc}"/></w:pPr><w:r><w:drawing>`
      + `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="תמונה ${id}"/>`
      + '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
      + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="image${id}"/><pic:cNvPicPr/></pic:nvPicPr>`
      + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
      + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
      + '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  }

  function tableXml(t, region) {
    const rtl = t.dir === 'rtl';
    const order = rtl ? t.cols.map((_, k) => t.cols.length - 1 - k) : t.cols.map((_, k) => k);
    const widths = order.map((k) => Math.max(tw(20), tw(t.cols[k].r - t.cols[k].l)));
    const total = widths.reduce((a, b) => a + b, 0);
    const indPt = rtl ? region.r - t.u1 : t.u0 - region.l;
    const border = (n) => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`;
    let x = '<w:tbl><w:tblPr>' + (rtl ? '<w:bidiVisual/>' : '') + `<w:tblW w:w="${total}" w:type="dxa"/>`
      + (indPt > 4 ? `<w:tblInd w:w="${tw(indPt)}" w:type="dxa"/>` : '')
      + `<w:tblBorders>${['top', rtl ? 'right' : 'left', 'bottom', rtl ? 'left' : 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>`
      + '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar>'
      + '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>';
    x += '<w:tblGrid>' + widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('') + '</w:tblGrid>';
    for (const row of t.rows) {
      x += '<w:tr>' + (row.height > 0 ? `<w:trPr><w:trHeight w:val="${tw(row.height)}" w:hRule="atLeast"/></w:trPr>` : '');
      order.forEach((k, n) => {
        const paras = row.cells[k];
        x += `<w:tc><w:tcPr><w:tcW w:w="${widths[n]}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>`;
        if (paras.length) {
          paras.forEach((p, idx) => { if (idx === 0) p.before = 0; p.indL = 0; p.indR = 0; p.first = 0; x += paraXml(p); });
        } else x += `<w:p><w:pPr>${rtl ? '<w:bidi/>' : ''}<w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`;
        x += '</w:tc>';
      });
      x += '</w:tr>';
    }
    return x + '</w:tbl>';
  }

  function sectPr(sec) {
    const land = sec.w > sec.h;
    const m = sec.margins;
    return `<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="${tw(sec.w)}" w:h="${tw(sec.h)}"${land ? ' w:orient="landscape"' : ''}/>`
      + `<w:pgMar w:top="${tw(m.t)}" w:right="${tw(m.r)}" w:bottom="${tw(m.b)}" w:left="${tw(m.l)}" w:header="${tw(Math.min(m.t, 36))}" w:footer="${tw(Math.min(m.b, 36))}" w:gutter="0"/>`
      + `${sec.dir === 'rtl' ? '<w:bidi/>' : ''}</w:sectPr>`;
  }

  /* ---------- הרכבת המסמך ---------- */

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="he-IL"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:unhideWhenUsed/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="1"/></w:pPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

  const SETTINGS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:themeFontLang w:val="en-US" w:bidi="he-IL"/></w:settings>`;

  function packageFiles(bodyXml, media, title) {
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const files = {};
    const exts = new Set(media.map((m) => m.ext));
    files['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${exts.has('png') ? '<Default Extension="png" ContentType="image/png"/>' : ''}${exts.has('jpeg') ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
    files['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
    files['docProps/core.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title || '')}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
    files['docProps/app.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>EitanPDF</Application></Properties>`;
    files['word/_rels/document.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${media.map((m) => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('')}</Relationships>`;
    files['word/styles.xml'] = STYLES;
    files['word/settings.xml'] = SETTINGS;
    files['word/document.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${bodyXml}</w:body></w:document>`;
    const zip = {};
    for (const [k, v] of Object.entries(files)) zip[k] = [fflate.strToU8(v), { level: 6 }];
    for (const m of media) zip['word/media/' + m.name] = [m.bytes, { level: 0 }];
    return fflate.zipSync(zip, { mtime: new Date() });
  }

  /**
   * המרה. opts:
   *   renderImage({ pageIndex, box, dpi, photo }) → { bytes, type: 'png'|'jpeg' } | null — ציור אזור בעמוד
   *   pages: [אינדקסים] — רק העמודים האלה (ברירת מחדל: הכל)
   *   onProgress(done, total), title
   * מחזיר { bytes, stats: { pages, textPages, imagePages, images, tables, unreadable } }
   */
  async function convert(pdfBytes, opts = {}) {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
    // שדות טופס: הערכים שמולאו נמצאים בהערות (widgets), לא בתוכן העמוד — משטחים בעותק
    try { const form = doc.getForm(); if (form.getFields().length) form.flatten(); } catch (e) { /* אין טופס או טופס שבור */ }
    const pages = doc.getPages();
    const want = opts.pages && opts.pages.length ? opts.pages.filter((i) => i >= 0 && i < pages.length) : pages.map((_, i) => i);
    const stats = { pages: want.length, textPages: 0, imagePages: 0, images: 0, tables: 0, unreadable: 0 };
    const media = [];
    const ctx = { drawId: 0 };
    const addMedia = (r) => {
      const ext = r.type === 'png' ? 'png' : 'jpeg';
      const m = { rid: 'rIdImg' + (media.length + 1), name: `image${media.length + 1}.${ext}`, ext, bytes: r.bytes };
      media.push(m);
      return m.rid;
    };
    const render = async (req) => {
      if (!opts.renderImage) return null;
      try { const r = await opts.renderImage(req); return r && r.bytes && r.bytes.length ? r : null; } catch (e) { return null; }
    };

    let body = '';
    for (let n = 0; n < want.length; n++) {
      const pageIndex = want[n];
      const page = pages[pageIndex];
      const model = analyzePage(doc, page);
      const last = n === want.length - 1;
      let xml = '';
      let sec;
      if (model.kind === 'image') {
        // עמוד סרוק / לא קריא: תמונה של העמוד כולו
        stats.imagePages++;
        if (model.reason === 'unreadable') stats.unreadable++;
        const [x0, y0, x1, y1] = model.box;
        const rot = model.rotate % 180 !== 0;
        const W = rot ? y1 - y0 : x1 - x0, Hh = rot ? x1 - x0 : y1 - y0;
        const margin = 14;
        sec = { w: W, h: Hh, margins: { t: margin, b: margin, l: margin, r: margin }, dir: 'rtl' };
        const r = await render({ pageIndex, box: model.box, dpi: 150, photo: true, full: true });
        if (r) {
          const s = Math.min((W - margin * 2) / W, (Hh - margin * 2 - 4) / Hh);
          xml += imageXml(ctx, { rid: addMedia(r) }, W * s, Hh * s, 'center', 'rtl');
          stats.images++;
        }
        xml += `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${last ? '' : sectPr(sec)}</w:pPr></w:p>`;
      } else {
        stats.textPages++;
        const { frame, col, dir } = model;
        const W = frame.u1 - frame.u0, Hh = frame.v1 - frame.v0;
        // שוליים: לפי אזור הטקסט, קצת רחב יותר — הגופנים ב-Word לא בדיוק באותו רוחב
        const m = {
          l: clamp(col.l - frame.u0 - 3, 10, W * 0.35), r: clamp(frame.u1 - col.r - 3, 10, W * 0.35),
          t: clamp(frame.v1 - col.t, 12, 72), b: clamp(col.b - frame.v0, 12, 54),
        };
        sec = { w: W, h: Hh, margins: m, dir };
        const region = { l: col.l, r: col.r };
        let prevBottom = null;
        for (const b of model.blocks) {
          const before = prevBottom == null ? 0 : clamp(prevBottom - b.top - (b.type === 'para' ? 0 : 2), 0, 144);
          if (b.type === 'para') {
            if (b.before == null) b.before = prevBottom == null ? 0 : clamp(prevBottom - b.lines[0].top, 0, 144);
            xml += paraXml(b);
          } else if (b.type === 'table') {
            stats.tables++;
            xml += tableXml(b, region);
          } else if (b.type === 'image') {
            const maxW = col.r - col.l + 6;
            let w = b.w, h = b.h;
            if (w > maxW) { h *= maxW / w; w = maxW; }
            const intrinsic = b.px[0] && b.w ? (b.px[0] / b.w) * 72 : 150;
            const r = await render({ pageIndex, box: b.box, dpi: clamp(Math.round(intrinsic), 96, 220), photo: b.photo });
            if (r) {
              const mid = (b.u0 + b.u1) / 2;
              const align = Math.abs(mid - (col.l + col.r) / 2) < (col.r - col.l) * 0.1 ? 'center' : (mid > (col.l + col.r) / 2 ? 'right' : 'left');
              xml += imageXml(ctx, { rid: addMedia(r), before }, w, h, align, dir);
              stats.images++;
            }
          }
          prevBottom = b.bottom;
        }
        if (!model.blocks.length) xml += '<w:p/>';
        // סוף העמוד: שבירת מקטע עם הגודל והשוליים של העמוד הזה
        if (!last) {
          const lastBlock = model.blocks[model.blocks.length - 1];
          if (lastBlock && lastBlock.type === 'para' && xml.endsWith('</w:p>')) {
            xml = xml.replace(/<\/w:pPr>((?:(?!<w:p>)[\s\S])*)<\/w:p>$/, (all, rest) => `${sectPr(sec)}</w:pPr>${rest}</w:p>`);
          } else {
            xml += `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${sectPr(sec)}</w:pPr></w:p>`;
          }
        } else if (model.blocks.length && model.blocks[model.blocks.length - 1].type === 'table') xml += '<w:p/>';
      }
      body += xml;
      if (last) body += sectPr(sec).replace('<w:type w:val="nextPage"/>', '');
      if (opts.onProgress) opts.onProgress(n + 1, want.length);
      // לתת לממשק לנשום בין עמודים
      await new Promise((res) => setTimeout(res, 0));
    }
    if (!want.length) body = '<w:p/>' + sectPr({ w: 595, h: 842, margins: { t: 72, b: 72, l: 72, r: 72 }, dir: 'rtl' });
    return { bytes: packageFiles(body, media, opts.title), stats };
  }

  return { convert, analyzePage, findImages, fontFamily, splitScript, _internal: { buildParagraphs, toRows, lineRuns } };
});
