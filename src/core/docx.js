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
    module.exports = factory(require('pdf-lib'), require('./hebrew.js'), require('./textedit.js'), require('fflate'), require('./fontembed.js'));
  } else {
    root.Docx = factory(root.PDFLib, root.HebrewPDF, root.TextEdit, root.fflate, root.FontEmbed);
  }
})(typeof self !== 'undefined' ? self : this, function (PDFLib, H, TE, fflate, FontEmbed) {
  'use strict';

  const { PDFDocument, PDFName, PDFArray, PDFStream } = PDFLib;
  const N = (s) => PDFName.of(s);
  // ההקשר של ההמרה הנוכחית (רשימות, מקדמי גופנים). ההמרה רצה עד הסוף לפני שמתחילה אחרת באותו חלון
  let CUR = { lists: new Map(), fontScale: null };
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

  /**
   * סריקת הגרפיקה של העמוד (כולל בתוך Form XObject), במרחב העמוד:
   *   images — תמונות עם התיבה שלהן
   *   hs / vs — קווים אופקיים ואנכיים (קווי טבלה: קו מצויר, או מלבן מלא דק)
   *   fills  — מלבנים מלאים בצבע (רקע של תא)
   */
  function scanGraphics(doc, page) {
    const out = { images: [], hs: [], vs: [], fills: [] };
    const addSeg = (x0, y0, x1, y1) => {
      if (Math.abs(y1 - y0) < 0.8 && Math.abs(x1 - x0) > 3) out.hs.push({ y: (y0 + y1) / 2, a: Math.min(x0, x1), b: Math.max(x0, x1) });
      else if (Math.abs(x1 - x0) < 0.8 && Math.abs(y1 - y0) > 3) out.vs.push({ x: (x0 + x1) / 2, a: Math.min(y0, y1), b: Math.max(y0, y1) });
    };
    const white = (c) => c && c.every((v) => v > 0.97);
    const walk = (bytes, resources, ctm0, depth) => {
      let ops;
      try { ops = TE.parseOps(bytes); } catch (e) { return; }
      const xobjs = resources && TE.lookup(doc, resources.get(N('XObject')));
      const stack = [];
      let gs = { m: ctm0, fill: [0, 0, 0], stroke: [0, 0, 0] };
      let path = []; // { rect:[x,y,w,h] } או { pts:[[x,y]...], closed }
      let sub = null;
      const color = (a, n) => {
        const nums = a.filter((v) => typeof v === 'number');
        if (n === 1 || nums.length === 1) return [nums[0], nums[0], nums[0]];
        if (nums.length === 3) return nums;
        if (nums.length === 4) { const [c, m, y, k] = nums; return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)]; }
        return null;
      };
      const paint = (stroke, fill) => {
        for (const p of path) {
          if (p.rect) {
            const [x, y, w, h] = p.rect;
            const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => apply(gs.m, px, py));
            const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
            const bx = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
            const W = bx[2] - bx[0], Hh = bx[3] - bx[1];
            if (fill && !white(gs.fill)) {
              // מלבן מלא דק = קו; מלבן גדול = רקע
              if (Hh <= 2.5 && W > 3) out.hs.push({ y: (bx[1] + bx[3]) / 2, a: bx[0], b: bx[2] });
              else if (W <= 2.5 && Hh > 3) out.vs.push({ x: (bx[0] + bx[2]) / 2, a: bx[1], b: bx[3] });
              else if (W > 2.5 && Hh > 2.5) out.fills.push({ box: bx, color: gs.fill });
            }
            if (stroke && !white(gs.stroke)) {
              addSeg(bx[0], bx[1], bx[2], bx[1]); addSeg(bx[2], bx[1], bx[2], bx[3]);
              addSeg(bx[2], bx[3], bx[0], bx[3]); addSeg(bx[0], bx[3], bx[0], bx[1]);
            }
          } else {
            if (stroke && !white(gs.stroke)) {
              // רק הקטעים הישרים (גם במלבן עם פינות מעוגלות)
              for (const [p0, p1] of p.segs) {
                const q0 = apply(gs.m, p0[0], p0[1]), q1 = apply(gs.m, p1[0], p1[1]);
                addSeg(q0[0], q0[1], q1[0], q1[1]);
              }
            }
            // צורה מלאה כלשהי (עקומות, מצולע): נרשמת לפי התיבה שלה — רק לזיהוי עמוד "מעוצב"
            if (fill && !white(gs.fill) && p.ext.length > 2) {
              const pts = p.ext.map(([px, py]) => apply(gs.m, px, py));
              const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
              const bx = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
              if (bx[2] - bx[0] > 2.5 && bx[3] - bx[1] > 2.5) out.fills.push({ box: bx, color: gs.fill, shape: true });
            }
          }
        }
        path = []; sub = null;
      };
      for (const o of ops) {
        const a = o.args;
        switch (o.op) {
          case 'q': stack.push({ ...gs }); break;
          case 'Q': if (stack.length) gs = stack.pop(); break;
          case 'cm': if (a.length === 6) gs.m = mul(a, gs.m); break;
          case 'g': case 'rg': case 'k': case 'sc': case 'scn': { const c = color(a, o.op === 'g' ? 1 : 0); if (c) gs.fill = c; break; }
          case 'G': case 'RG': case 'K': case 'SC': case 'SCN': { const c = color(a, o.op === 'G' ? 1 : 0); if (c) gs.stroke = c; break; }
          case 're': if (a.length === 4) path.push({ rect: a.slice() }); sub = null; break;
          case 'm': sub = { start: [a[0], a[1]], cur: [a[0], a[1]], ext: [[a[0], a[1]]], segs: [] }; path.push(sub); break;
          case 'l': if (sub) { sub.segs.push([sub.cur, [a[0], a[1]]]); sub.cur = [a[0], a[1]]; sub.ext.push(sub.cur); } break;
          case 'c': case 'v': case 'y':
            // עקומה: לא קו טבלה, אבל נכנסת לתיבה של הצורה
            if (sub && a.length >= 2) { for (let k = 0; k + 1 < a.length; k += 2) sub.ext.push([a[k], a[k + 1]]); sub.cur = [a[a.length - 2], a[a.length - 1]]; }
            break;
          case 'h': if (sub) { sub.segs.push([sub.cur, sub.start]); sub.cur = sub.start; } break;
          case 'S': case 's': paint(true, false); break;
          case 'f': case 'F': case 'f*': paint(false, true); break;
          case 'B': case 'B*': case 'b': case 'b*': paint(true, true); break;
          case 'n': path = []; sub = null; break;
          case 'Do': {
            if (!xobjs || !a[0] || !a[0].name) break;
            const xo = TE.lookup(doc, xobjs.get(N(a[0].name)));
            if (!(xo instanceof PDFStream)) break;
            const st = TE.nameOf(doc, xo.dict.get(N('Subtype')));
            if (st === 'Image') {
              const pts = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => apply(gs.m, x, y));
              const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
              const filter = TE.lookup(doc, xo.dict.get(N('Filter')));
              const filters = filter instanceof PDFArray ? filter.asArray().map((f) => TE.nameOf(doc, f)) : [TE.nameOf(doc, filter)];
              out.images.push({
                box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
                px: [TE.num(doc, xo.dict.get(N('Width')), 0), TE.num(doc, xo.dict.get(N('Height')), 0)],
                photo: filters.includes('DCTDecode') || filters.includes('JPXDecode'),
              });
            } else if (st === 'Form' && depth < 8) {
              const mArr = TE.lookup(doc, xo.dict.get(N('Matrix')));
              const fm = mArr instanceof PDFArray ? mArr.asArray().map((v) => TE.num(doc, v, 0)) : [1, 0, 0, 1, 0, 0];
              walk(TE.streamBytes(doc, xo), TE.getResources(doc, xo.dict) || resources, mul(fm, gs.m), depth + 1);
            }
            break;
          }
          default: break;
        }
      }
    };
    walk(TE.pageContentBytes(doc, page), TE.pageResources(doc, page), [1, 0, 0, 1, 0, 0], 0);
    return out;
  }

  /** כל התמונות שמצוירות בעמוד, עם התיבה שלהן במרחב העמוד */
  function findImages(doc, page) { return scanGraphics(doc, page).images; }

  /* ---------- טבלאות עם קווים ---------- */

  /** איחוד קווים על אותו ציר שנוגעים או חופפים */
  function mergeSegs(list, key) {
    const sorted = list.slice().sort((p, q) => p[key] - q[key] || p.a - q.a);
    const out = [];
    for (const sg of sorted) {
      const last = out.find((o) => Math.abs(o[key] - sg[key]) <= 1.2 && sg.a <= o.b + 2 && sg.b >= o.a - 2);
      if (last) { last.a = Math.min(last.a, sg.a); last.b = Math.max(last.b, sg.b); last[key] = (last[key] + sg[key]) / 2; }
      else out.push({ ...sg });
    }
    return out;
  }
  const clusterVals = (vals, tol) => {
    const s = vals.slice().sort((a, b) => a - b);
    const out = [];
    for (const v of s) {
      const last = out[out.length - 1];
      if (last && v - last.max <= tol) { last.max = v; last.sum += v; last.n++; } else out.push({ min: v, max: v, sum: v, n: 1 });
    }
    return out.map((c) => c.sum / c.n);
  };

  /**
   * טבלאות מתוך קווים מצוירים: קבוצות של קווים אופקיים ואנכיים שנחתכים זה בזה.
   * כל טבלה: רשת (xs עולה, ys יורד), ותאים — כולל תאים ממוזגים (כשאין קו ביניהם).
   */
  function ruledTables(g) {
    const hs = mergeSegs(g.hs, 'y').filter((h) => h.b - h.a > 6);
    const vs = mergeSegs(g.vs, 'x').filter((v) => v.b - v.a > 4);
    if (hs.length < 2 || vs.length < 2) return [];
    const T = 2.5;
    const meets = (h, v) => v.x >= h.a - T && v.x <= h.b + T && h.y >= v.a - T && h.y <= v.b + T;
    // רכיבים קשירים בגרף קווים
    const seenH = new Set(), seenV = new Set();
    const tables = [];
    for (let i = 0; i < hs.length; i++) {
      if (seenH.has(i)) continue;
      const comp = { h: [], v: [] };
      const queue = [['h', i]];
      seenH.add(i);
      while (queue.length) {
        const [t, k] = queue.pop();
        if (t === 'h') {
          comp.h.push(hs[k]);
          vs.forEach((v, j) => { if (!seenV.has(j) && meets(hs[k], v)) { seenV.add(j); queue.push(['v', j]); } });
        } else {
          comp.v.push(vs[k]);
          hs.forEach((h, j) => { if (!seenH.has(j) && meets(h, vs[k])) { seenH.add(j); queue.push(['h', j]); } });
        }
      }
      if (comp.h.length < 2 || comp.v.length < 2) continue;
      const xs = clusterVals(comp.v.map((v) => v.x), 3.5);
      const ys = clusterVals(comp.h.map((h) => h.y), 3.5).reverse(); // מלמעלה למטה
      if (xs.length < 2 || ys.length < 2) continue;
      if (xs[xs.length - 1] - xs[0] < 30 || ys[0] - ys[ys.length - 1] < 8) continue;
      const cols = xs.length - 1, rows = ys.length - 1;
      if (cols * rows < 2 || cols > 40 || rows > 200) continue; // מסגרת בודדת — לא טבלה
      const hasV = (x, yTop, yBot) => {
        const mid = (yTop + yBot) / 2;
        return comp.v.some((v) => Math.abs(v.x - x) <= T + 1 && v.a <= mid + 1 && v.b >= mid - 1);
      };
      const hasH = (y, xL, xR) => {
        const mid = (xL + xR) / 2;
        return comp.h.some((h) => Math.abs(h.y - y) <= T + 1 && h.a <= mid + 1 && h.b >= mid - 1);
      };
      // איחוד תאים בלי קו מפריד
      const parent = Array.from({ length: rows * cols }, (_, k) => k);
      const find = (k) => (parent[k] === k ? k : (parent[k] = find(parent[k])));
      const union = (a, b) => { parent[find(a)] = find(b); };
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (c + 1 < cols && !hasV(xs[c + 1], ys[r], ys[r + 1])) union(r * cols + c, r * cols + c + 1);
          if (r + 1 < rows && !hasH(ys[r + 1], xs[c], xs[c + 1])) union(r * cols + c, (r + 1) * cols + c);
        }
      }
      const groups = new Map();
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const k = find(r * cols + c);
        if (!groups.has(k)) groups.set(k, { r0: r, r1: r, c0: c, c1: c, n: 0 });
        const gr = groups.get(k);
        gr.r0 = Math.min(gr.r0, r); gr.r1 = Math.max(gr.r1, r); gr.c0 = Math.min(gr.c0, c); gr.c1 = Math.max(gr.c1, c); gr.n++;
      }
      let cells = [...groups.values()];
      // תא ממוזג חייב להיות מלבן; אחרת — בלי מיזוגים
      if (cells.some((cl) => (cl.r1 - cl.r0 + 1) * (cl.c1 - cl.c0 + 1) !== cl.n)) {
        cells = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ r0: r, r1: r, c0: c, c1: c, n: 1 });
      }
      // טבלה שכולה תא אחד ממוזג (מסגרת עם קווים פנימיים חלקיים) — לא טבלה
      if (cells.length < 2) continue;
      for (const cl of cells) {
        cl.box = [xs[cl.c0], ys[cl.r1 + 1], xs[cl.c1 + 1], ys[cl.r0]];
        // רקע: מלבן מלא שמכסה את מרכז התא ולא גדול בהרבה ממנו
        const cx = (cl.box[0] + cl.box[2]) / 2, cy = (cl.box[1] + cl.box[3]) / 2;
        const area = (cl.box[2] - cl.box[0]) * (cl.box[3] - cl.box[1]);
        const f = g.fills.filter((fl) => fl.box[0] <= cx && fl.box[2] >= cx && fl.box[1] <= cy && fl.box[3] >= cy
          && (fl.box[2] - fl.box[0]) * (fl.box[3] - fl.box[1]) < area * 2.5).pop();
        if (f) cl.shade = hex(f.color);
        cl.glyphs = [];
      }
      const box = [xs[0], ys[rows], xs[cols], ys[0]];
      // רקע צבוע בתוך הטבלה שהקצוות שלו לא על קווי הרשת (כותרת מצוירת כמלבנים, לא כקווים) —
      // המבנה של הטבלה לא נקרא במלואו, ובזרימה רגילה היא תצא שונה מהמקור
      const nearAny = (v, arr) => arr.some((a) => Math.abs(a - v) < 3);
      const misfit = g.fills.some((f) => f.box[0] >= box[0] - 2 && f.box[2] <= box[2] + 2 && f.box[1] >= box[1] - 2 && f.box[3] <= box[3] + 2
        && !(nearAny(f.box[0], xs) && nearAny(f.box[2], xs) && nearAny(f.box[1], ys) && nearAny(f.box[3], ys)));
      tables.push({ xs, ys, rows, cols, cells, box, misfit });
    }
    // טבלה בתוך טבלה (מסגרת חיצונית) — משאירים את הפנימית הגדולה ביותר... פשוט: מוותרים על חופפות
    return tables.filter((t, i) => !tables.some((o, j) => j !== i && o.box[0] <= t.box[0] + 1 && o.box[2] >= t.box[2] - 1
      && o.box[1] <= t.box[1] + 1 && o.box[3] >= t.box[3] - 1 && (o.cells.length > t.cells.length || (o.cells.length === t.cells.length && j < i))));
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
    // "Arial-BoldMT" → בסיס "Arial", סגנון "BoldMT". משקלים שאינם רגיל/מודגש/נטוי (Medium, Black, U…)
    // נשארים חלק משם המשפחה — כך Windows קורא להם, וכך גופן מוטמע במשקל כזה לא מתערבב עם הרגיל
    const cut = n.search(/[,-]/);
    const baseRaw = (cut >= 0 ? n.slice(0, cut) : n).replace(/(PS)?MT$/, '').replace(/PS$/, '');
    const styleRaw = cut >= 0 ? n.slice(cut + 1) : '';
    const words = styleRaw.replace(/(Semi|Demi|Extra|Ultra)[\s-]?(Bold|Light)/gi, '$1$2').replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/(Semi|Demi|Extra|Ultra) (Bold|Light)/g, '$1$2').split(/[\s,-]+/).filter(Boolean)
      .filter((w) => !/^(Bold|Italic|Oblique|Regular|Roman|MT|PS|PSMT|BoldMT|ItalicMT|BoldItalicMT|Book|Normal)$/i.test(w));
    const keyOf = (v) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
    let base = baseRaw.replace(/(Bold|Italic|Oblique|Regular|Roman)+$/, '') || baseRaw;
    let fam, fallback = false;
    if (KNOWN_FONTS[keyOf(baseRaw)]) fam = KNOWN_FONTS[keyOf(baseRaw)];
    else if (KNOWN_FONTS[keyOf(base)]) fam = KNOWN_FONTS[keyOf(base)];
    else if (!base || /^(F|T|TT|C)\d+/i.test(base) || /^\d/.test(base) || base.length < 3) { fam = 'Arial'; fallback = true; }
    else fam = base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
    if (words.length && !fallback) fam += ' ' + words.join(' ');
    fontCache.set(name, fam);
    return fam;
  }

  const WEIGHT_FAMILY = /\s(SemiBold|DemiBold|ExtraBold|UltraBold|Black|Heavy|Medium|Light|ExtraLight|UltraLight|Thin|U)$/;
  const hex = (rgb) => rgb.map((v) => Math.round(clamp(+v || 0, 0, 1) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

  /** רוחב ממוצע של תו ב-Arial (ביחידות em) — לפי סוג התו */
  const arialEm = (ch) => (/[\u0590-\u05FF]/.test(ch) ? 0.53 : /[a-z]/.test(ch) ? 0.5 : /[A-Z]/.test(ch) ? 0.66 : /\d/.test(ch) ? 0.556 : /\s/.test(ch) ? 0.278 : 0.33);
  const COMMON = new Set(Object.values({ a: 'Arial', b: 'Times New Roman', c: 'Courier New', d: 'Calibri', e: 'Cambria', f: 'Tahoma', g: 'Verdana', h: 'Segoe UI', i: 'David', j: 'Miriam', k: 'Narkisim', l: 'FrankRuehl', m: 'Gisha', n: 'Aharoni', o: 'Levenim MT', p: 'Guttman Yad', q: 'Rod', r: 'Arial Narrow', s: 'Miriam Fixed', t: 'Symbol', u: 'Wingdings' }));

  /**
   * גופן לא נפוץ (שכנראה לא מותקן אצל מי שיפתח את הקובץ) וצר בהרבה מ-Arial: Word יציג אותו בגופן חלופי
   * רחב יותר, והטקסט יתפוס הרבה יותר מקום. מודדים כמה הוא צר בפועל ומקטינים את הגודל באותו יחס.
   * מחזיר Map: שם גופן ב-PDF → מקדם (1 = בלי שינוי).
   */
  function fontScales(glyphs) {
    const acc = new Map();
    for (const g of glyphs) {
      if (!g.u || !g.size || g.size < 1) continue;
      const name = g.font.name;
      if (COMMON.has(fontFamily(name)) || (CUR.embedded && CUR.embedded.has(fontFamily(name)))) continue; // גופן מוטמע — מוצג בדיוק כמו במקור
      const a = acc.get(name) || { real: 0, arial: 0 };
      a.real += g.advUser / g.size;
      a.arial += [...g.u].reduce((n, ch) => n + arialEm(ch), 0);
      acc.set(name, a);
    }
    const out = new Map();
    for (const [name, a] of acc) {
      if (a.arial < 20) continue; // מעט מדי טקסט כדי למדוד
      const r = a.real / a.arial;
      if (r < 0.85) out.set(name, clamp(r * 1.05, 0.55, 1));
    }
    return out;
  }

  function styleOf(g) {
    const fam = fontFamily(g.font.name);
    const k = (CUR.fontScale && CUR.fontScale.get(g.font.name)) || 1;
    const color = g.Tr === 3 || g.Tr === 7 ? '000000' : hex(g.fill || [0, 0, 0]);
    return {
      // משקל שכבר בשם המשפחה ("… SemiBold", "Arial Black") — בלי הדגשה נוספת (Word היה מעבה אותו שוב)
      b: !!g.font.bold && !WEIGHT_FAMILY.test(fam), i: /italic|oblique/i.test(g.font.name || ''),
      sz: Math.max(2, Math.round(g.size * k * 2)), // חצאי נקודות
      color: color === '000000' || /^(0[0-9A-F]){3}$/.test(color) && parseInt(color.slice(0, 2), 16) < 26 ? null : color,
      font: fam,
    };
  }
  const styleKey = (s) => [s.b ? 1 : 0, s.i ? 1 : 0, s.u ? 1 : 0, s.sz, s.color || '', s.font].join('|');

  /**
   * שדה שמולא על קו של קווים תחתונים ("שם: ______" ומעליו "יעקב איתן"): שתי שכבות טקסט באותו מקום,
   * ובשורה הן יוצאות משולבות ("י_ע_ק_ב"). מזהים רצף קווים תחתונים שיש בתוכו אותיות, מוחקים את הקווים,
   * והטקסט שמולא מקבל קו תחתון. רצף קווים בלי טקסט (שדה ריק) נשאר כמו שהוא.
   * מחזיר שורה חדשה (visual/vmap מעודכנים) ו-under: אינדקסים ב-visual החדש שיקבלו קו תחתון.
   */
  function cleanFilledFields(L) {
    const v = L.visual;
    if (!L.vmap || L.vmap.length !== v.length || !/_[^_\s]_|[^_\s]_[^_\s]/.test(v)) return { L, under: null };
    const groups = [];
    for (let k = 0; k < v.length; k++) {
      if (v[k] !== '_') continue;
      const last = groups[groups.length - 1];
      if (last && k - last.end <= 3) last.end = k; else groups.push({ start: k, end: k });
    }
    const drop = new Set(), under = new Set();
    for (const g of groups) {
      const inner = [];
      for (let k = g.start; k <= g.end; k++) if (v[k] !== '_' && v[k].trim()) inner.push(k);
      if (!inner.length) continue;
      // אות שמולאה ממש בקצה הקו (צמודה, בלי רווח) — שייכת לשדה
      while (g.end + 1 < v.length && v[g.end + 1].trim() && v[g.end + 1] !== '_' && !/[:：]/.test(v[g.end + 1])) g.end++;
      while (g.start > 0 && v[g.start - 1].trim() && v[g.start - 1] !== '_' && !/[:：]/.test(v[g.start - 1])) g.start--;
      for (let k = g.start; k <= g.end; k++) (v[k] === '_' ? drop : under).add(k);
    }
    if (!drop.size) return { L, under: null };
    const chars = [];
    for (let k = 0; k < v.length; k++) {
      if (drop.has(k)) continue;
      const c = { ch: v[k], vm: L.vmap[k], u: under.has(k) && !!v[k].trim() };
      const prev = chars[chars.length - 1];
      if (/\s/.test(c.ch) && (!prev || /\s/.test(prev.ch))) continue; // בלי רווחים כפולים
      chars.push(c);
    }
    while (chars.length && /\s/.test(chars[chars.length - 1].ch)) chars.pop();
    const out = { ...L, visual: chars.map((c) => c.ch).join(''), vmap: chars.map((c) => c.vm) };
    return { L: out, under: new Set(chars.map((c, k) => (c.u ? k : -1)).filter((k) => k >= 0)) };
  }

  const PAIRS = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{' };
  const swapBrackets = (t) => t.replace(/[()[\]{}]/g, (c) => PAIRS[c]);

  /**
   * הטקסט הלוגי של שורה, מחולק לקטעים לפי סגנון (למשל "הנדון:" מודגש ואחריו טקסט רגיל).
   * כל קטע חזותי מומר בנפרד ומסודר לפי כיוון השורה. אם החיבור לא נותן בדיוק את הטקסט
   * של השורה כולה (למשל מספר מודגש באמצע משפט בעברית) — השורה כולה בסגנון הנפוץ בה.
   */
  function lineRuns(L0, lines) {
    const { L, under } = cleanFilledFields(L0);
    const { text, dir } = TE.lineText(L, lines);
    // vmap (מ-textedit.js): לכל תו — האינדקס של הגליף שלו, או -1 לרווח שנוסף בגלל פער (מקבל את הסגנון של התו שלפניו)
    const glyphOf = (k) => {
      for (let j = k; j >= 0; j--) if (L.vmap[j] >= 0) return L.glyphs[L.vmap[j]];
      for (let j = k + 1; j < L.vmap.length; j++) if (L.vmap[j] >= 0) return L.glyphs[L.vmap[j]];
      return L.glyphs[0];
    };
    const styles = L.vmap ? L.vmap.map((_, k) => {
      const st = styleOf(glyphOf(k));
      return under && under.has(k) ? { ...st, u: true } : st;
    }) : [];
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

  /**
   * פיצול שורה בפער רחב (הרבה יותר מרווח בין מילים) — שדות נפרדים של טופס שנראים כמו שורה אחת.
   * רק לבנייה במיקום מדויק; בזרימה רגילה פער כזה הוא טאב.
   */
  function splitWide(L) {
    if (!L.vmap || L.vmap.length !== L.visual.length || Math.abs(L.angle) > 0.02) return [L];
    const glyphAt = (k) => (L.vmap[k] >= 0 ? L.glyphs[L.vmap[k]] : null);
    const cuts = [];
    let prev = null, prevK = -1;
    for (let k = 0; k < L.visual.length; k++) {
      const g = glyphAt(k);
      if (!g || /\s/.test(g.u) || /\p{M}/u.test(g.u)) continue;
      if (prev && g !== prev) {
        const gap = g.x - (prev.x + prev.advUser);
        if (gap > Math.max(prev.size, g.size) * 1.1) cuts.push([prevK, k]);
      }
      prev = g; prevK = k;
    }
    if (!cuts.length) return [L];
    const out = [];
    let start = 0;
    const piece = (a, b) => {
      let vis = L.visual.slice(a, b), vm = L.vmap.slice(a, b);
      const lead = vis.length - vis.replace(/^\s+/, '').length;
      vis = vis.slice(lead).replace(/\s+$/, ''); vm = vm.slice(lead, lead + vis.length);
      const gs = vm.filter((i) => i >= 0).map((i) => L.glyphs[i]);
      if (!vis || !gs.length) return;
      const u0 = Math.min(...gs.map((g) => g.x)), u1 = Math.max(...gs.map((g) => g.x + g.advUser));
      out.push({ ...L, visual: vis, vmap: vm, u0, u1 });
    };
    for (const [a, b] of cuts) { piece(start, a + 1); start = b; }
    piece(start, L.visual.length);
    return out.length ? out : [L];
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
    const boxToFrame = (bx) => {
      const pts = [[bx[0], bx[1]], [bx[2], bx[1]], [bx[2], bx[3]], [bx[0], bx[3]]].map(([x, y]) => toFrame(x, y));
      return { u0: Math.min(...pts.map((p) => p[0])), u1: Math.max(...pts.map((p) => p[0])), v0: Math.min(...pts.map((p) => p[1])), v1: Math.max(...pts.map((p) => p[1])) };
    };
    const frame = boxToFrame(box);
    const pageArea = (frame.u1 - frame.u0) * (frame.v1 - frame.v0);

    // כיוון וגודל הטקסט הרגיל — מכל השורות בעמוד
    const rtlW = all.filter((L) => H.hasRTL(L.visual)).reduce((n, L) => n + L.visual.length, 0);
    const dir = rtlW * 2 >= all.reduce((n, L) => n + L.visual.length, 0) ? 'rtl' : 'ltr';
    const bodySize = median(all.flatMap((L) => Array(Math.min(50, L.visual.length)).fill(L.size))) || 11;

    // גופנים צרים שלא יהיו אצל הקורא — הקטנה יחסית (ראו fontScales)
    CUR.fontScale = fontScales(analysis.glyphs);
    const toModel = (L) => {
      const r = lineRuns(L, all);
      if (!r.text.trim()) return null;
      const m = { u0: L.u0, u1: L.u1, v: L.v, size: L.size, dir: r.dir, text: r.text, runs: r.runs, style: r.style, bold: L.bold, angle: L.angle };
      m.top = m.v + m.size * 0.85;
      m.bottom = m.v - m.size * 0.25;
      return m;
    };

    // גרפיקה: תמונות, קווים, מלבנים צבועים. טבלאות עם קווים — רק בטקסט ישר
    const gfx = scanGraphics(doc, page);
    const tables = Math.abs(angle) < 0.02 ? ruledTables(gfx) : [];
    let flowRaw = all;
    if (tables.length) {
      // כל גליף בתוך טבלה הולך לתא שלו; השורות נבנות בכל תא בנפרד (כדי שטקסט של תאים שכנים לא יתחבר)
      const rest = [];
      for (const gl of analysis.glyphs) {
        const cx = (gl.bbox[0] + gl.bbox[2]) / 2, cy = (gl.bbox[1] + gl.bbox[3]) / 2;
        let cell = null;
        for (const t of tables) {
          if (cx < t.box[0] - 1 || cx > t.box[2] + 1 || cy < t.box[1] - 1 || cy > t.box[3] + 1) continue;
          cell = t.cells.find((cl) => cx >= cl.box[0] - 0.5 && cx <= cl.box[2] + 0.5 && cy >= cl.box[1] - 0.5 && cy <= cl.box[3] + 0.5);
          if (cell) break;
        }
        if (cell) cell.glyphs.push(gl); else rest.push(gl);
      }
      flowRaw = TE.groupLines(rest, { hidden: true }).filter((L) => L.visual.trim() && L.ok);
    }

    const lines = [];
    const odd = [];
    for (const L of flowRaw) {
      const m = toModel(L);
      if (m) (Math.abs(L.angle - angle) < 0.02 ? lines : odd).push(m);
    }

    // אזור הטקסט (השוליים): שורות וטבלאות
    const ext = lines.map((L) => [L.u0, L.u1, L.top, L.bottom]).concat(tables.map((t) => [t.box[0], t.box[2], t.box[3], t.box[1]]));
    if (!ext.length) ext.push([frame.u0 + 36, frame.u1 - 36, frame.v1 - 36, frame.v0 + 36]);
    const col = {
      l: Math.min(...ext.map((e) => e[0])), r: Math.max(...ext.map((e) => e[1])),
      t: Math.max(...ext.map((e) => e[2])), b: Math.min(...ext.map((e) => e[3])),
    };

    // בלוקי טבלה: פסקאות בכל תא, יישור אנכי לפי מיקום הטקסט בתא
    const tableBlocks = tables.map((t) => {
      for (const cl of t.cells) {
        const ls = TE.groupLines(cl.glyphs, { hidden: true }).filter((L) => L.visual.trim() && L.ok).map(toModel).filter(Boolean)
          .sort((p, q) => q.v - p.v || p.u0 - q.u0);
        cl.paras = ls.length ? buildParagraphs(ls, { l: cl.box[0] + 2, r: cl.box[2] - 2 }, dir, bodySize, true) : [];
        if (ls.length) {
          const top = Math.max(...ls.map((L) => L.top)), bot = Math.min(...ls.map((L) => L.bottom));
          const h = cl.box[3] - cl.box[1];
          const above = cl.box[3] - top, below = bot - cl.box[1];
          cl.valign = Math.abs(above - below) < h * 0.2 ? 'center' : above < below ? 'top' : 'bottom';
        }
        delete cl.glyphs;
      }
      return { type: 'table', ruled: true, dir, t, top: t.box[3], bottom: t.box[1], u0: t.box[0], u1: t.box[2] };
    });

    // תמונות: לא תמונת רקע שמכסה את רוב העמוד (סריקה עם שכבת טקסט, נייר מכתבים) ולא קישוטים זעירים
    const seen = new Set();
    const images = [];
    let imageArea = 0;
    for (const im of gfx.images) {
      const f = boxToFrame(im.box);
      f.u0 = Math.max(f.u0, frame.u0); f.u1 = Math.min(f.u1, frame.u1); f.v0 = Math.max(f.v0, frame.v0); f.v1 = Math.min(f.v1, frame.v1);
      const w = f.u1 - f.u0, h = f.v1 - f.v0;
      if (w < 6 || h < 6) continue;
      imageArea += w * h;
      if (w * h > pageArea * 0.45) continue;
      const key = [f.u0, f.u1, f.v0, f.v1].map((v) => Math.round(v)).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      images.push({ type: 'image', box: im.box, w, h, u0: f.u0, u1: f.u1, top: f.v1, bottom: f.v0, px: im.px, photo: im.photo });
    }

    // עמוד "מעוצב": רקעים וצורות צבעוניים מחוץ לטבלאות, או טקסט על גבי תמונה גדולה.
    // בעמוד כזה הגרפיקה נכנסת כתמונת רקע, והטקסט במסגרות במיקום המדויק (ראו convert).
    const inTable = (bx) => tables.some((t) => bx[0] >= t.box[0] - 2 && bx[2] <= t.box[2] + 2 && bx[1] >= t.box[1] - 2 && bx[3] <= t.box[3] + 2);
    const fillArea = gfx.fills.filter((f) => !inTable(f.box)).reduce((n, f) => {
      const ff = boxToFrame(f.box);
      return n + Math.max(0, Math.min(ff.u1, frame.u1) - Math.max(ff.u0, frame.u0)) * Math.max(0, Math.min(ff.v1, frame.v1) - Math.max(ff.v0, frame.v0));
    }, 0);
    const textOverImage = lines.some((L) => images.some((im) => L.u0 < im.u1 && L.u1 > im.u0 && L.v < im.top && L.v > im.bottom));
    // עמוד "מורכב": תוכן שיושב זה לצד זה (שדות של טופס, טורים) מחוץ לטבלאות — זרימה אחת של טקסט לא יכולה
    // לשחזר אותו, ולכן גם הוא נבנה במיקום מדויק
    const blocks = layoutBlocks(lines, col, dir, bodySize);
    // שורות שכבר זוהו כטבלה (לפי טורים) לא נחשבות "זו לצד זו"
    const inTextTable = new Set();
    for (const b of blocks) if (b.type === 'table') for (const row of b.rows) for (const cell of row.cells) for (const p of cell) for (const L of p.lines) inTextTable.add(L);
    const rowsAll = toRows(lines.filter((L) => !inTextTable.has(L)));
    const sideBySide = rowsAll.filter((r) => r.segs.length >= 2).length;
    // טבלאות זו לצד זו, או טבלה שהמבנה שלה לא נקרא במלואו — גם הן במיקום מדויק
    const tablesSide = tables.some((a, i) => tables.some((b, j) => j !== i && a.box[1] < b.box[3] - 4 && b.box[1] < a.box[3] - 4 && (a.box[2] <= b.box[0] + 2 || b.box[2] <= a.box[0] + 2)));
    const complex = (rowsAll.length >= 4 && sideBySide >= 3 && sideBySide > rowsAll.length * 0.2) || tablesSide || tables.some((t) => t.misfit);
    const designed = complex || fillArea > pageArea * 0.05 || imageArea > pageArea * 0.45 || (textOverImage && imageArea > pageArea * 0.08);

    // טבלאות ותמונות נכנסות לפני הבלוק הראשון שמתחיל מתחתיהן
    const insert = (x) => {
      const k = blocks.findIndex((b) => b.top < x.top - 1);
      if (k < 0) blocks.push(x); else blocks.splice(k, 0, x);
    };
    for (const tb of tableBlocks.sort((a, b) => b.top - a.top)) insert(tb);
    for (const im of images.sort((a, b) => b.top - a.top)) insert(im);
    const oddParas = odd.length ? buildParagraphs(odd.sort((a, b) => b.v - a.v || a.u0 - b.u0), { l: col.l, r: col.r }, dir, bodySize) : [];
    blocks.push(...oddParas);
    // לבנייה במיקום מדויק: כל קטע טקסט לחוד (בלי לאחד קטעים שעל אותה שורה), פסקאות רק משורות שבאמת ממשיכות זו את זו
    const sorted = flowRaw.filter((L) => Math.abs(L.angle - angle) < 0.02).flatMap(splitWide).map(toModel).filter(Boolean)
      .sort((a, b) => b.v - a.v || a.u0 - b.u0);
    const exact = buildParagraphs(sorted, { l: col.l, r: col.r }, dir, bodySize).concat(tableBlocks, oddParas);
    return { ...base, kind: 'text', angle, frame, col, dir, bodySize, blocks, exact, images: images.length, designed, tables: tables.length };
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
  // תבליט בסימן (לא מספור) — הופך לרשימה של Word. כולל תבליטים של Symbol/Wingdings (אזור פרטי)
  const SYMBOL_BULLET_RE = /^\s*([•·▪■◦●○‣⁃–\uF0A7\uF0B7\uF0D8\uF076])\s+/;
  // רווח תלוי מקובל (רבע אינץ') — כשאין שורת המשך שממנה אפשר למדוד
  const DEFAULT_HANG = 18;

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
          const centered = Math.abs((P.u0 + P.u1) / 2 - (L.u0 + L.u1) / 2) < tol && lead(P, cur.dir) > sz * 2 && trail(P, cur.dir) > sz * 2
            && !BULLET_RE.test(P.text);
          // פריט ברשימה (תבליט או מספור): שורת ההמשך מתחילה פנימה יותר — ברווח התלוי
          const hanging = cur.lines.length === 1 && BULLET_RE.test(P.text)
            && lead(L, cur.dir) > lead(P, cur.dir) + sz * 0.5 && lead(L, cur.dir) - lead(P, cur.dir) < sz * 6;
          const sameLead = cur.lines.length >= 2
            ? Math.abs(lead(L, cur.dir) - lead(cur.lines[1], cur.dir)) < tol
            : hanging || (lead(L, cur.dir) <= lead(P, cur.dir) + tol && lead(P, cur.dir) - lead(L, cur.dir) < sz * 5);
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

    // הרווח התלוי של רשימות בקטע הזה: נמדד מפריטים עם שורת המשך, ומשמש גם לפריטים של שורה אחת
    const hangs = paras.filter((p) => p.lines.length > 1 && BULLET_RE.test(p.lines[0].text))
      .map((p) => lead(p.lines[1], p.dir) - lead(p.lines[0], p.dir)).filter((h) => h > 0);
    const hang = hangs.length ? median(hangs) : DEFAULT_HANG;
    for (const p of paras) finishParagraph(p, region, bodySize, inCell, hang);
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

  function finishParagraph(p, region, bodySize, inCell, hang = DEFAULT_HANG) {
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

    const item = BULLET_RE.test(first.text);
    // יישור. שורה כמעט ברוחב מלא שהשוליים שלה במקרה שווים (תבליט עם הזחה) — לא ממורכזת
    const mid = (p.u0 + p.u1) / 2;
    const centered = !item && (p.u1 - p.u0) < width * 0.85 && Math.abs(mid - (region.l + region.r) / 2) < Math.max(sz * 1.5, width * 0.03)
      && !nearL(p.u0) && !nearR(p.u1) && (lines.length === 1 || lines.every((L) => Math.abs((L.u0 + L.u1) / 2 - mid) < tol * 1.5));
    const bothEdges = lines.length > 2 && body.every((L) => Math.abs(L.u0 - body[0].u0) < tol && Math.abs(L.u1 - body[0].u1) < tol)
      && Math.abs(lines[1].u0 - p.u0) < tol && Math.abs(lines[1].u1 - p.u1) < tol;
    // פריט ברשימה מיושר לשני הצדדים כשכל השורות המלאות מגיעות לאותו קצה
    const trailEdge = (L) => (dir === 'rtl' ? L.u0 : L.u1);
    const itemBoth = item && lines.length > 1 && body.every((L) => Math.abs(trailEdge(L) - trailEdge(body[0])) < tol)
      && (dir === 'rtl' ? nearL(body[0].u0) : nearR(body[0].u1));
    if (centered) p.align = 'center';
    else if (bothEdges || itemBoth) p.align = 'both';
    else if (dir === 'rtl') p.align = !item && nearL(p.u0) && !nearR(p.u1) && lines.length === 1 ? 'left' : 'right';
    else p.align = !item && nearR(p.u1) && !nearL(p.u0) && lines.length === 1 ? 'right' : 'left';
    // שורה אחת: יישור לפי הצד הקרוב, כשהיא רחוקה מצד ההתחלה (תאריך משמאל במכתב בעברית)
    if (!centered && !item && lines.length === 1 && !inCell) {
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
      // פריט ברשימה: ההזחה היא של הטקסט, והסימן/המספר יושב ברווח התלוי לפניו
      if (item) {
        const leadOf = (L) => (dir === 'rtl' ? region.r - L.u1 : L.u0 - region.l);
        const h = lines.length > 1 ? Math.max(0, leadOf(lines[1]) - leadOf(first)) : hang;
        const textStart = leadOf(first) + h;
        if (dir === 'rtl') p.indR = textStart; else p.indL = textStart;
        p.first = -h;
        if (p.align === 'both') { if (dir === 'rtl') p.indL = Math.max(0, Math.min(...body.map((L) => L.u0)) - region.l); else p.indR = Math.max(0, region.r - Math.max(...body.map((L) => L.u1))); }
        if (p.indL < sz * 0.5) p.indL = 0;
        if (p.indR < sz * 0.5) p.indR = 0;
      }
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
    // תבליט בסימן → רשימה של Word (הסימן מגיע מהגדרת הרשימה). מספור → טאב אחרי המספר, שייושר לרווח התלוי
    if (item && p.runs.length) {
      const m = p.runs[0].text.match(SYMBOL_BULLET_RE);
      if (m) {
        p.list = m[1] === '–' ? '–' : m[1] === '◦' || m[1] === '○' ? 'o' : m[1] === '▪' || m[1] === '■' || m[1] === '\uF0A7' ? '▪' : '•';
        p.runs[0].text = p.runs[0].text.slice(m[0].length);
      } else p.runs[0].text = p.runs[0].text.replace(/^(\s*\S+?)\s+/, '$1\t');
      p.runs = p.runs.filter((r) => r.text);
    }
    p.text = p.runs.map((r) => r.text).join('');
    // כותרת: גופן גדול בבירור מגוף הטקסט, פסקה קצרה
    p.heading = 0;
    if (!inCell && !p.list && p.text.length < 200 && lines.length <= 3) {
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
    if (st.u) x += '<w:u w:val="single"/>';
    if (rtl) x += '<w:rtl/>';
    return x ? `<w:rPr>${x}</w:rPr>` : '';
  }


  function runsXml(runs, dir) {
    let x = '';
    for (const r of runs) {
      // שדה (מספר עמוד / סך העמודים) בכותרת התחתונה
      if (r.br) { x += '<w:r><w:br/></w:r>'; continue; }
      if (r.field) { x += `<w:fldSimple w:instr=" ${r.field} "><w:r>${rPr(r.style, false)}<w:t>${esc(r.text)}</w:t></w:r></w:fldSimple>`; continue; }
      r.text.split('\t').forEach((chunk, k) => {
        if (k) x += `<w:r>${rPr(r.style, dir === 'rtl')}<w:tab/></w:r>`;
        for (const part of splitScript(chunk, dir)) {
          if (part.text) x += `<w:r>${rPr(r.style, part.rtl)}<w:t xml:space="preserve">${esc(part.text)}</w:t></w:r>`;
        }
      });
    }
    return x;
  }

  /** מספר הרשימה של Word לסימן התבליט (רשימה אחת לכל סימן) */
  function listId(sym) {
    if (!CUR.lists.has(sym)) CUR.lists.set(sym, CUR.lists.size + 1);
    return CUR.lists.get(sym);
  }

  /** מאפייני פסקה. בפסקה מימין לשמאל ב-Word, "left" הוא צד ההתחלה (ימין) — ולכן ההיפוך */
  function pPr(p, extra) {
    const rtl = p.dir === 'rtl';
    let x = '';
    if (p.heading) x += `<w:pStyle w:val="Heading${p.heading}"/>`;
    // עמוד מעוצב: הפסקה במסגרת במיקום המדויק בעמוד
    if (p.frame) x += `<w:framePr w:w="${tw(p.frame.w)}" w:hSpace="0" w:wrap="around" w:vAnchor="page" w:hAnchor="page" w:x="${tw(p.frame.x)}" w:y="${tw(p.frame.y)}"/>`;
    if (p.list) x += `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${listId(p.list)}"/></w:numPr>`;
    if (rtl) x += '<w:bidi/>';
    const sp = [];
    sp.push(`w:before="${tw(p.frame ? 0 : p.before || 0)}"`, 'w:after="0"');
    // גובה שורה מדויק כמו במקור: ריווח השורות בפסקה, ובשורה בודדת — 1.2 מהגופן הגדול בה.
    // "atLeast" או "auto" נותנים ל-Word להוסיף ריווח משלו, והמסמך מתארך (וגולש לעמוד הבא)
    const big = p.runs && p.runs.length ? Math.max(...p.runs.map((r) => (r.style && r.style.sz ? r.style.sz / 2 : p.size || 11))) : (p.size || 11);
    const lineH = p.lines && p.lines.length > 1 && p.pitch ? Math.max(p.pitch, big * 1.05) : big * 1.2;
    if (p.single) sp.push('w:line="240"', 'w:lineRule="auto"'); // שורה בתיבה: קו הבסיס בגובה ה-ascent של הגופן
    else if (p.lines) sp.push(`w:line="${tw(lineH)}"`, 'w:lineRule="exact"');
    x += `<w:spacing ${sp.join(' ')}/>`;
    const startInd = p.frame ? 0 : rtl ? p.indR : p.indL;
    const endInd = p.frame ? 0 : rtl ? p.indL : p.indR;
    const ind = [];
    // בפסקה מימין לשמאל left/right מתפרשים לוגית (התחלה/סוף), ובמשמאל לימין — פיזית; בשני המקרים left = התחלה
    if (startInd || p.list) ind.push(`w:left="${tw(startInd || 0)}"`);
    if (endInd) ind.push(`w:right="${tw(endInd)}"`);
    if (p.first > 0) ind.push(`w:firstLine="${tw(p.first)}"`);
    else if (p.first < 0) ind.push(`w:hanging="${tw(-p.first)}"`);
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

  const picXml = (id, rid, cx, cy) => '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="image${id}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
    + '</a:graphicData></a:graphic>';

  function imageXml(ctx, img, wPt, hPt, align, dir) {
    const id = ++ctx.drawId;
    const cx = emu(wPt), cy = emu(hPt);
    const rtl = dir === 'rtl';
    const jc = align === 'center' ? 'center' : rtl ? (align === 'left' ? 'right' : 'left') : align;
    return `<w:p><w:pPr>${rtl ? '<w:bidi/>' : ''}<w:spacing w:before="${tw(img.before || 0)}" w:after="0"/><w:jc w:val="${jc}"/></w:pPr><w:r><w:drawing>`
      + `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="תמונה ${id}"/>`
      + '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
      + picXml(id, img.rid, cx, cy) + '</wp:inline></w:drawing></w:r></w:p>';
  }

  /**
   * תמונה צפה במיקום מדויק בעמוד (לא תופסת מקום בזרימה): תמונת רקע של עמוד מעוצב (מאחורי הטקסט),
   * או תמונה בכותרת העליונה (לוגו ליד טקסט).
   */
  const TINY_P = '<w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>';
  function anchorXml(ctx, rid, wPt, hPt, xPt = 0, yPt = 0, behind = true, hAlign = null) {
    return `<w:p>${TINY_P}${anchorRun(ctx, rid, wPt, hPt, xPt, yPt, behind, hAlign)}</w:p>`;
  }
  function anchorRun(ctx, rid, wPt, hPt, xPt = 0, yPt = 0, behind = true, hAlign = null) {
    const id = ++ctx.drawId;
    const cx = emu(wPt), cy = emu(hPt);
    return '<w:r><w:drawing>'
      + `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${behind ? 1 : 2}" behindDoc="${behind ? 1 : 0}" locked="1" layoutInCell="1" allowOverlap="1">`
      // מיקום אופקי ביישור (ימין/שמאל/מרכז) נקרא אותו דבר בכל תוכנה; היסט מספרי מתהפך במסמך מימין לשמאל בחלק מהן
      + `<wp:simplePos x="0" y="0"/>${hAlign ? `<wp:positionH relativeFrom="margin"><wp:align>${hAlign}</wp:align></wp:positionH>` : `<wp:positionH relativeFrom="page"><wp:posOffset>${emu(xPt)}</wp:posOffset></wp:positionH>`}`
      + `<wp:positionV relativeFrom="page"><wp:posOffset>${emu(yPt)}</wp:posOffset></wp:positionV>`
      // רקע — בלי השפעה על הטקסט; תמונה בכותרת — הטקסט של העמוד עוקף אותה (לא עולה עליה)
      + `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>${behind ? '<wp:wrapNone/>' : '<wp:wrapSquare wrapText="bothSides"/>'}<wp:docPr id="${id}" name="${behind ? 'רקע' : 'תמונה'} ${id}"/>`
      + '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
      + picXml(id, rid, cx, cy) + '</wp:anchor></w:drawing></w:r>';
  }

  /**
   * תיבת טקסט במיקום מדויק בעמוד (עמוד מעוצב). בלי גלישת שורות: השורות נשארות כמו במקור
   * (שבירת שורה בתוך הפסקה), כך שגופן חלופי לא מפרק את העיצוב. התיבה גדלה לגובה התוכן.
   */
  function textBoxRun(ctx, innerXml, xPt, yPt, wPt, hPt) {
    const id = ++ctx.drawId;
    const cx = emu(wPt), cy = emu(hPt);
    return '<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing>'
      + `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${10 + id}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">`
      + `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${emu(xPt)}</wp:posOffset></wp:positionH>`
      + `<wp:positionV relativeFrom="page"><wp:posOffset>${emu(yPt)}</wp:posOffset></wp:positionV>`
      + `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${id}" name="טקסט ${id}"/><wp:cNvGraphicFramePr/>`
      + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp>'
      + `<wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr>`
      + `<wps:txbx><w:txbxContent>${innerXml}</w:txbxContent></wps:txbx>`
      + '<wps:bodyPr rot="0" vert="horz" wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t" anchorCtr="0"><a:spAutoFit/></wps:bodyPr>'
      + '</wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice></mc:AlternateContent></w:r>';
  }

  const BORDER = (n, color) => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="${color}"/>`;
  const NO_BORDER = (n) => `<w:${n} w:val="nil"/>`;

  /** תחילת טבלה: כיוון, רוחב, מיקום (בזרימה — הזחה; בעמוד מעוצב — צפה במקום המדויק), גבולות */
  function tblPrXml(b, widths, region, opt) {
    const rtl = b.dir === 'rtl';
    const total = widths.reduce((a, c) => a + c, 0);
    let x = '<w:tblPr>';
    if (opt.float) {
      // מיקום אופקי ביישור (בכותרת) — נקרא אותו דבר בכל תוכנה גם במסמך מימין לשמאל
      const h = opt.float.xSpec ? `w:horzAnchor="margin" w:tblpXSpec="${opt.float.xSpec}"` : `w:horzAnchor="page" w:tblpX="${tw(opt.float.x)}"`;
      x += `<w:tblpPr w:leftFromText="0" w:rightFromText="0" w:vertAnchor="page" ${h} w:tblpY="${tw(opt.float.y)}"/><w:tblOverlap w:val="overlap"/>`;
    }
    if (rtl) x += '<w:bidiVisual/>';
    x += `<w:tblW w:w="${total}" w:type="dxa"/>`;
    const indPt = rtl ? region.r - b.u1 : b.u0 - region.l;
    if (!opt.float && indPt > 4) x += `<w:tblInd w:w="${tw(indPt)}" w:type="dxa"/>`;
    const sides = ['top', rtl ? 'right' : 'left', 'bottom', rtl ? 'left' : 'right', 'insideH', 'insideV'];
    x += `<w:tblBorders>${sides.map((n) => (opt.borders ? BORDER(n, opt.borders) : NO_BORDER(n))).join('')}</w:tblBorders>`;
    x += '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="57" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar>';
    x += '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>';
    return x;
  }

  const cellParas = (paras, rtl) => {
    if (!paras.length) return `<w:p><w:pPr>${rtl ? '<w:bidi/>' : ''}<w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`;
    return paras.map((p, idx) => {
      if (idx === 0) p.before = 0;
      if (!p.list) { p.indL = 0; p.indR = 0; p.first = 0; }
      return paraXml(p);
    }).join('');
  };

  /** טבלה שזוהתה לפי טורים של טקסט (בלי קווים במקור) */
  function tableXml(t, region, opt = {}) {
    const rtl = t.dir === 'rtl';
    const order = rtl ? t.cols.map((_, k) => t.cols.length - 1 - k) : t.cols.map((_, k) => k);
    const widths = order.map((k) => Math.max(tw(20), tw(t.cols[k].r - t.cols[k].l)));
    let x = '<w:tbl>' + tblPrXml(t, widths, region, { borders: opt.layout ? null : 'BFBFBF', float: opt.float });
    x += '<w:tblGrid>' + widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('') + '</w:tblGrid>';
    for (const row of t.rows) {
      x += '<w:tr>' + (row.height > 0 ? `<w:trPr><w:trHeight w:val="${tw(row.height)}" w:hRule="atLeast"/></w:trPr>` : '');
      order.forEach((k, n) => {
        x += `<w:tc><w:tcPr><w:tcW w:w="${widths[n]}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${cellParas(row.cells[k], rtl)}</w:tc>`;
      });
      x += '</w:tr>';
    }
    return x + '</w:tbl>';
  }

  /**
   * טבלה עם קווים: רשת לפי הקווים, תאים ממוזגים (gridSpan לרוחב, vMerge לגובה),
   * רקע התאים וגובה השורות כמו במקור. בעמוד מעוצב — בלי קווים ורקע (הם כבר בתמונת הרקע).
   */
  function ruledTableXml(b, region, opt = {}) {
    const { t } = b;
    const rtl = b.dir === 'rtl';
    const order = rtl ? Array.from({ length: t.cols }, (_, k) => t.cols - 1 - k) : Array.from({ length: t.cols }, (_, k) => k);
    const widths = order.map((c) => Math.max(tw(4), tw(t.xs[c + 1] - t.xs[c])));
    const at = (r, c) => t.cells.find((cl) => r >= cl.r0 && r <= cl.r1 && c >= cl.c0 && c <= cl.c1);
    let x = '<w:tbl>' + tblPrXml(b, widths, region, { borders: opt.layout ? null : '000000', float: opt.float });
    x += '<w:tblGrid>' + widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('') + '</w:tblGrid>';
    for (let r = 0; r < t.rows; r++) {
      x += `<w:tr><w:trPr><w:trHeight w:val="${tw(Math.max(4, t.ys[r] - t.ys[r + 1]))}" w:hRule="${opt.layout ? 'exact' : 'atLeast'}"/></w:trPr>`;
      for (let n = 0; n < order.length;) {
        const cl = at(r, order[n]);
        const span = cl.c1 - cl.c0 + 1;
        const w = widths.slice(n, n + span).reduce((a, c) => a + c, 0);
        let pr = `<w:tcW w:w="${w}" w:type="dxa"/>`;
        if (span > 1) pr += `<w:gridSpan w:val="${span}"/>`;
        if (cl.r1 > cl.r0) pr += r === cl.r0 ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>';
        if (cl.shade && !opt.layout) pr += `<w:shd w:val="clear" w:color="auto" w:fill="${cl.shade}"/>`;
        pr += `<w:vAlign w:val="${cl.valign || 'center'}"/>`;
        x += `<w:tc><w:tcPr>${pr}</w:tcPr>${r === cl.r0 ? cellParas(cl.paras || [], rtl) : `<w:p><w:pPr>${rtl ? '<w:bidi/>' : ''}<w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`}</w:tc>`;
        n += span;
      }
      x += '</w:tr>';
    }
    return x + '</w:tbl>';
  }

  function sectPr(sec) {
    const land = sec.w > sec.h;
    const m = sec.margins;
    const refs = sec.refs ? `<w:headerReference w:type="default" r:id="${sec.refs.h}"/><w:footerReference w:type="default" r:id="${sec.refs.f}"/>` : '';
    return `<w:sectPr>${refs}<w:type w:val="nextPage"/><w:pgSz w:w="${tw(sec.w)}" w:h="${tw(sec.h)}"${land ? ' w:orient="landscape"' : ''}/>`
      + `<w:pgMar w:top="${tw(m.t)}" w:right="${tw(m.r)}" w:bottom="${tw(m.b)}" w:left="${tw(m.l)}" w:header="${tw(m.h != null ? m.h : Math.min(m.t, 36))}" w:footer="${tw(m.f != null ? m.f : Math.min(m.b, 36))}" w:gutter="0"/>`
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
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

  const SETTINGS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">%EMBED%<w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:themeFontLang w:val="en-US" w:bidi="he-IL"/></w:settings>`;

  const NS = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const relsXml = (list) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((r) => `<Relationship Id="${r.id}" Type="${REL}/${r.type}" Target="${r.target}"/>`).join('')}</Relationships>`;

  function numberingXml(lists) {
    let abs = '', nums = '';
    for (const [sym, id] of lists) {
      abs += `<w:abstractNum w:abstractNumId="${id - 1}"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${esc(sym)}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="${sym === 'o' ? 'Courier New' : 'Arial'}" w:hAnsi="${sym === 'o' ? 'Courier New' : 'Arial'}" w:cs="Arial" w:hint="default"/></w:rPr></w:lvl></w:abstractNum>`;
      nums += `<w:num w:numId="${id}"><w:abstractNumId w:val="${id - 1}"/></w:num>`;
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${abs}${nums}</w:numbering>`;
  }

  /**
   * parts: { body, headers: [{ name, xml, rels }], footers: [...], docRels: [...] }, media, lists
   */
  function packageFiles(parts, media, lists, title, fonts = []) {
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const files = {};
    const exts = new Set(media.map((m) => m.ext));
    const over = (name, type) => `<Override PartName="/word/${name}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${type}+xml"/>`;
    files['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${exts.has('png') ? '<Default Extension="png" ContentType="image/png"/>' : ''}${exts.has('jpeg') ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : ''}${over('document.xml', 'document.main')}${over('styles.xml', 'styles')}${over('settings.xml', 'settings')}${lists.size ? over('numbering.xml', 'numbering') : ''}${fonts.length ? '<Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/>' + over('fontTable.xml', 'fontTable') : ''}${parts.headers.map((h) => over(h.name, 'header')).join('')}${parts.footers.map((f) => over(f.name, 'footer')).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
    files['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`;
    files['docProps/core.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title || '')}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
    files['docProps/app.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>EitanPDF</Application></Properties>`;
    const docRels = [{ id: 'rIdStyles', type: 'styles', target: 'styles.xml' }, { id: 'rIdSettings', type: 'settings', target: 'settings.xml' }]
      .concat(lists.size ? [{ id: 'rIdNumbering', type: 'numbering', target: 'numbering.xml' }] : [])
      .concat(fonts.length ? [{ id: 'rIdFontTable', type: 'fontTable', target: 'fontTable.xml' }] : [])
      .concat(parts.headers.map((h) => ({ id: h.id, type: 'header', target: h.name })))
      .concat(parts.footers.map((f) => ({ id: f.id, type: 'footer', target: f.name })))
      .concat(parts.docRels);
    files['word/_rels/document.xml.rels'] = relsXml(docRels);
    for (const hf of parts.headers.concat(parts.footers)) {
      const tag = hf.name.startsWith('header') ? 'hdr' : 'ftr';
      files['word/' + hf.name] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:${tag} ${NS}>${hf.xml || '<w:p/>'}</w:${tag}>`;
      if (hf.rels.length) files[`word/_rels/${hf.name}.rels`] = relsXml(hf.rels);
    }
    files['word/styles.xml'] = STYLES;
    files['word/settings.xml'] = SETTINGS.replace('%EMBED%', fonts.length ? '<w:embedTrueTypeFonts/><w:saveSubsetFonts/>' : '');
    // גופנים מוטמעים: fontTable + קבצי odttf (מוצפנים לפי התקן במפתח של כל גופן)
    const fontZip = {};
    if (fonts.length) {
      const fam = new Map();
      const rels = [];
      fonts.forEach((f, k) => {
        const key = FontEmbed.newKey();
        const name = `font${k + 1}.odttf`;
        rels.push({ id: `rIdF${k + 1}`, type: 'font', target: 'fonts/' + name });
        fontZip['word/fonts/' + name] = FontEmbed.obfuscate(f.bytes, key);
        const slot = f.bold && f.italic ? 'embedBoldItalic' : f.bold ? 'embedBold' : f.italic ? 'embedItalic' : 'embedRegular';
        if (!fam.has(f.family)) fam.set(f.family, {});
        fam.get(f.family)[slot] = `<w:${slot} r:id="rIdF${k + 1}" w:fontKey="${key}"/>`;
      });
      const order = ['embedRegular', 'embedBold', 'embedItalic', 'embedBoldItalic'];
      files['word/fontTable.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${REL}">${[...fam].map(([name, slots]) => `<w:font w:name="${esc(name)}"><w:charset w:val="B1"/><w:family w:val="auto"/><w:pitch w:val="variable"/>${order.map((o) => slots[o] || '').join('')}</w:font>`).join('')}</w:fonts>`;
      files['word/_rels/fontTable.xml.rels'] = relsXml(rels);
    }
    if (lists.size) files['word/numbering.xml'] = numberingXml(lists);
    files['word/document.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${parts.body}</w:body></w:document>`;
    const zip = {};
    for (const [k, v] of Object.entries(files)) zip[k] = [fflate.strToU8(v), { level: 6 }];
    for (const m of media) zip['word/media/' + m.name] = [m.bytes, { level: 0 }];
    for (const [k, v] of Object.entries(fontZip)) zip[k] = [v, { level: 6 }];
    return fflate.zipSync(zip, { mtime: new Date() });
  }

  /* ---------- גרפיקה בלי טקסט (לתמונת הרקע של עמוד מעוצב) ---------- */

  /**
   * מוחק מזרם תוכן רק את פקודות ציור הטקסט (Tj, TJ, ', "). כל השאר נשאר — גם בתוך BT…ET,
   * כי צבעים ומצב גרפי שנקבעים בתוך קטע טקסט ממשיכים לחול על הצורות שאחריו.
   */
  function stripTextOps(bytes) {
    let ops;
    try { ops = TE.parseOps(bytes); } catch (e) { return bytes; }
    const parts = [];
    let pos = 0;
    for (const o of ops) {
      if (o.op === 'Tj' || o.op === 'TJ' || o.op === "'" || o.op === '"') {
        parts.push(bytes.subarray(pos, o.start));
        pos = o.end;
      }
    }
    parts.push(bytes.subarray(pos));
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length + 1, 0));
    let k = 0;
    for (const p of parts) { out.set(p, k); k += p.length; out[k++] = 10; }
    return out;
  }

  /** עותק של המסמך שבו בעמודים שנבחרו נשארת רק הגרפיקה (בלי טקסט ובלי הערות) */
  async function graphicsOnly(doc, pageIndexes) {
    const copy = await PDFDocument.load(await doc.save(), { ignoreEncryption: true, updateMetadata: false });
    const ctx = copy.context;
    const replaced = new Map();
    const fixForms = (resources, depth) => {
      const xobjs = resources && TE.lookup(copy, resources.get(N('XObject')));
      if (!xobjs || depth > 8 || typeof xobjs.keys !== 'function') return;
      for (const key of xobjs.keys()) {
        const ref = xobjs.get(key);
        const xo = TE.lookup(copy, ref);
        if (!(xo instanceof PDFStream) || TE.nameOf(copy, xo.dict.get(N('Subtype'))) !== 'Form') continue;
        const id = String(ref);
        if (!replaced.has(id)) {
          const st = ctx.flateStream(stripTextOps(TE.streamBytes(copy, xo)));
          for (const [k, v] of xo.dict.entries()) if (!['Length', 'Filter', 'DecodeParms'].includes(k.decodeText())) st.dict.set(k, v);
          replaced.set(id, ctx.register(st));
          fixForms(TE.getResources(copy, xo.dict), depth + 1);
        }
        xobjs.set(key, replaced.get(id));
      }
    };
    const pages = copy.getPages();
    for (const i of pageIndexes) {
      const page = pages[i];
      page.node.set(N('Contents'), ctx.register(ctx.flateStream(stripTextOps(TE.pageContentBytes(copy, page)))));
      page.node.delete(N('Annots'));
      fixForms(TE.pageResources(copy, page), 0);
    }
    return copy.save();
  }

  /* ---------- כותרת עליונה ותחתונה שחוזרות בכל עמוד ---------- */

  const normText = (t) => String(t).replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  function blockKey(b, frame) {
    const pos = (v) => Math.round(v / 6);
    if (b.type === 'para') return `P|${normText(b.text)}|${pos(frame.v1 - b.top)}`;
    if (b.type === 'image') return `I|${pos(b.w)}x${pos(b.h)}|${pos(b.u0 - frame.u0)}|${pos(frame.v1 - b.top)}`;
    if (b.type === 'table') {
      const txt = b.ruled ? b.t.cells.map((cl) => (cl.paras || []).map((p) => p.text).join(' ')).join('|') : b.rows.map((r) => r.cells.map((c) => c.map((p) => p.text).join(' ')).join('|')).join('/');
      return `T|${normText(txt)}|${pos(frame.v1 - b.top)}`;
    }
    return null;
  }

  /** מספר העמוד (וסך העמודים) בטקסט של הכותרת התחתונה → שדות של Word */
  function pageFields(runs, pageNo, total) {
    const out = [];
    for (const r of runs) {
      const parts = r.text.split(/(\d+)/);
      for (const part of parts) {
        if (!part) continue;
        if (/^\d+$/.test(part) && +part === pageNo) out.push({ text: part, style: r.style, field: 'PAGE' });
        else if (/^\d+$/.test(part) && +part === total && total !== pageNo) out.push({ text: part, style: r.style, field: 'NUMPAGES' });
        else out.push({ text: part, style: r.style });
      }
    }
    return out;
  }

  /**
   * המרה. opts:
   *   renderImage({ pageIndex, box, dpi, photo, pdf? }) → { bytes, type: 'png'|'jpeg' } | null — ציור אזור בעמוד
   *     (כש-pdf קיים — לצייר מהמסמך הזה ולא מהמקורי: עותק עם גרפיקה בלבד, לתמונת רקע)
   *   pages: [אינדקסים] — רק העמודים האלה (ברירת מחדל: הכל)
   *   onProgress(done, total), title
   * מחזיר { bytes, stats: { pages, textPages, imagePages, designedPages, images, tables, unreadable } }
   */
  async function convert(pdfBytes, opts = {}) {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
    // שדות טופס: הערכים שמולאו נמצאים בהערות (widgets), לא בתוכן העמוד — משטחים בעותק
    try { const form = doc.getForm(); if (form.getFields().length) form.flatten(); } catch (e) { /* אין טופס או טופס שבור */ }
    const pages = doc.getPages();
    const want = opts.pages && opts.pages.length ? opts.pages.filter((i) => i >= 0 && i < pages.length) : pages.map((_, i) => i);
    const stats = { pages: want.length, textPages: 0, imagePages: 0, designedPages: 0, images: 0, tables: 0, unreadable: 0 };
    CUR = { lists: new Map(), fontScale: null, embedded: new Set() };
    // גופני ה-PDF (TrueType) מוטמעים בקובץ — Word יציג אותם בדיוק, גם במחשב שאין בו את הגופן
    let fonts = [];
    if (opts.embedFonts !== false && FontEmbed) {
      try { fonts = FontEmbed.collect(doc, want, fontFamily); } catch (e) { fonts = []; }
      CUR.embedded = new Set(fonts.map((f) => f.family));
      CUR.ascent = new Map(fonts.filter((f) => f.ascent).map((f) => [f.family, f.ascent]));
    }
    stats.embeddedFonts = fonts.length;
    const media = [];
    const ctx = { drawId: 0 };
    const docRels = [];
    const addMedia = (r, rels) => {
      const ext = r.type === 'png' ? 'png' : 'jpeg';
      const m = { rid: 'rIdImg' + (media.length + 1), name: `image${media.length + 1}.${ext}`, ext, bytes: r.bytes };
      media.push(m);
      rels.push({ id: m.rid, type: 'image', target: 'media/' + m.name });
      return m.rid;
    };
    const render = async (req) => {
      if (!opts.renderImage) return null;
      try { const r = await opts.renderImage(req); return r && r.bytes && r.bytes.length ? r : null; } catch (e) { return null; }
    };
    const tick = async (k, n) => {
      if (opts.onProgress) opts.onProgress(k, n);
      await new Promise((res) => setTimeout(res, 0)); // לתת לממשק לנשום
    };

    // שלב א: ניתוח כל העמודים
    const models = [];
    for (let n = 0; n < want.length; n++) {
      const m = analyzePage(doc, pages[want[n]]);
      m.pageIndex = want[n];
      // עמוד מעוצב רק כשהטקסט ישר והעמוד לא מסובב (המיקום במסגרות הוא לפי העמוד)
      if (m.kind === 'text') m.layout = !!m.designed && m.rotate === 0 && Math.abs(m.angle) < 0.02;
      models.push(m);
      await tick(n + 0.5, want.length);
    }

    // מסמך שרוב העמודים בו מעוצבים (טופס, עלון) — כל העמודים באותה שיטה, כדי שייראו אחידים
    const textModels = models.filter((m) => m.kind === 'text');
    if (textModels.length >= 2 && textModels.filter((m) => m.layout).length >= textModels.length * 0.5) {
      for (const m of textModels) if (m.rotate === 0 && Math.abs(m.angle) < 0.02) m.layout = true;
    }

    // שלב ב: כותרת עליונה ותחתונה — מה שחוזר באותו מקום ברוב העמודים הרגילים
    const flow = models.filter((m) => m.kind === 'text' && !m.layout);
    let running = null;
    if (flow.length >= 2) {
      const count = new Map();
      for (const m of flow) {
        const Hh = m.frame.v1 - m.frame.v0;
        const keys = new Set();
        for (const b of m.blocks) {
          const top = b.top >= m.frame.v1 - Hh * 0.2 && b.bottom >= m.frame.v1 - Hh * 0.3;
          const bottom = b.bottom <= m.frame.v0 + Hh * 0.15 && b.top <= m.frame.v0 + Hh * 0.22;
          if (!top && !bottom) continue;
          const k = blockKey(b, m.frame);
          if (k) { b.hfKey = k; b.hfZone = top ? 'h' : 'f'; keys.add(k); }
        }
        for (const k of keys) count.set(k, (count.get(k) || 0) + 1);
      }
      const need = Math.max(2, Math.ceil(flow.length * 0.6));
      const keys = new Set([...count].filter(([, c]) => c >= need).map(([k]) => k));
      if (keys.size) {
        running = { h: [], f: [], template: null };
        for (const m of flow) {
          const mine = m.blocks.filter((b) => keys.has(b.hfKey));
          if (!running.template && mine.length) {
            running.template = m;
            running.h = mine.filter((b) => b.hfZone === 'h');
            running.f = mine.filter((b) => b.hfZone === 'f');
          }
          m.blocks = m.blocks.filter((b) => !keys.has(b.hfKey));
          // הבלוק הראשון אחרי הכותרת מתחיל בראש אזור הטקסט
          if (m.blocks[0] && m.blocks[0].type === 'para') m.blocks[0].before = 0;
          m.hasRunning = true;
        }
      }
    }

    // תוכן של רצף בלוקים (גוף העמוד, או כותרת עליונה/תחתונה)
    const blocksXml = async (blocks, model, rels, layout, inHeader) => {
      const { col, dir, frame } = model;
      const region = { l: col.l, r: col.r };
      let xml = '';
      // עמוד מעוצב: כל פסקה — תיבת טקסט במקום המדויק (גם פסקאות בתוך טבלה: הקווים כבר בתמונת הרקע)
      // שורה = תיבה. המיקום האנכי לפי קו הבסיס המקורי ולפי הגובה האמיתי של הגופן (כשהוא מוטמע),
      // כך שאין הצטברות של סטייה משורה לשורה
      const lineBox = (L, align, dir) => {
        const runs = L.runs.map((r) => ({ ...r }));
        const sizes = runs.map((r) => (r.style && r.style.sz ? r.style.sz / 2 : L.size));
        const big = Math.max(...sizes, 1);
        const asc = Math.max(...runs.map((r, k) => ((CUR.ascent && r.style && CUR.ascent.get(r.style.font)) || 0.9) * sizes[k]));
        const w = (L.u1 - L.u0) * 1.25 + 12;
        const toEnd = align === 'right' || (dir === 'rtl' && align !== 'left' && align !== 'center');
        const x = align === 'center' ? (L.u0 + L.u1) / 2 - w / 2 : toEnd ? L.u1 - w : L.u0;
        const inner = { dir, runs, align: align === 'both' ? (dir === 'rtl' ? 'right' : 'left') : align, before: 0, indL: 0, indR: 0, first: 0, heading: 0, frame: null, single: true };
        ctx.boxes.push(textBoxRun(ctx, paraXml(inner), clamp(x - frame.u0, 0, frame.u1 - frame.u0 - 10),
          Math.max(0, frame.v1 - L.v - asc), Math.min(w, frame.u1 - frame.u0), big * 1.3));
      };
      const paraBox = (b) => {
        // יישור לפי הפסקה: שורה בפסקה מיושרת לשני הצדדים — לפי צד ההתחלה
        const align = b.align === 'center' ? 'center' : b.align === 'both' ? (b.dir === 'rtl' ? 'right' : 'left') : b.align;
        for (const L of b.lines) lineBox(L, align, L.dir || b.dir);
      };
      if (layout) {
        for (const b of blocks) {
          if (b.type === 'para') paraBox(b);
          else if (b.type === 'table' && b.ruled) { stats.tables++; for (const cl of b.t.cells) (cl.paras || []).forEach(paraBox); }
          else if (b.type === 'table') { stats.tables++; for (const row of b.rows) for (const cell of row.cells) cell.forEach(paraBox); }
        }
        return '';
      }
      let prevBottom = null, prevType = null;
      for (const b of blocks) {
        const gap = prevBottom == null ? 0 : clamp(prevBottom - b.top, 0, 144);
        if (b.type === 'para') {
          if (layout) {
            // תיבת טקסט במקום המדויק. רוחב קצת גדול יותר (הגופן ב-Word לא תמיד באותו רוחב), לכיוון שבו הטקסט נגמר
            const w = (b.u1 - b.u0) * 1.15 + 8;
            const toEnd = b.align === 'right' || (b.dir === 'rtl' && b.align !== 'left' && b.align !== 'center');
            const x = b.align === 'center' ? (b.u0 + b.u1) / 2 - w / 2 : toEnd ? b.u1 - w : b.u0;
            const runs = [];
            b.lines.forEach((L, k) => {
              if (k) runs.push({ br: true });
              let lr = L.runs.map((r) => ({ ...r }));
              if (k === 0 && b.list && lr[0]) { lr[0].text = lr[0].text.replace(SYMBOL_BULLET_RE, ''); lr = lr.filter((r) => r.text); }
              runs.push(...lr);
            });
            const align = b.align === 'both' ? (b.dir === 'rtl' ? 'right' : 'left') : b.align;
            const inner = { ...b, runs, align, before: 0, indL: 0, indR: 0, first: 0, heading: 0, frame: null };
            if (b.list) { if (b.dir === 'rtl') inner.indR = -b.first; else inner.indL = -b.first; inner.first = b.first; }
            const lineH = b.lines.length > 1 && b.pitch ? b.pitch : b.size * 1.2;
            ctx.boxes.push(textBoxRun(ctx, paraXml(inner), clamp(x - frame.u0, 0, frame.u1 - frame.u0 - 10),
              Math.max(0, frame.v1 - b.top - b.size * 0.1), Math.min(w, frame.u1 - frame.u0), lineH * b.lines.length));
          } else {
            if (b.before == null || prevType !== 'para') b.before = prevBottom == null ? 0 : clamp(prevBottom - b.lines[0].top, 0, 144);
            xml += paraXml(b);
          }
        } else if (b.type === 'table') {
          stats.tables++;
          let float = layout ? { x: b.u0 - frame.u0, y: frame.v1 - b.top } : null;
          if (inHeader) {
            const mid = (b.u0 + b.u1) / 2, third = (col.r - col.l) / 3;
            float = { xSpec: mid > col.r - third ? 'right' : mid < col.l + third ? 'left' : 'center', y: frame.v1 - b.top };
          }
          if (!layout && gap > 4 && prevType) xml += `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${tw(Math.min(gap, 144))}" w:lineRule="exact"/></w:pPr></w:p>`;
          xml += b.ruled ? ruledTableXml(b, region, { layout, float }) : tableXml(b, region, { layout, float });
          // אחרי טבלה צריך פסקה לפני טבלה נוספת (אחרת Word מאחד אותן)
          xml += '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>';
        } else if (b.type === 'image' && !layout) {
          const maxW = col.r - col.l + 6;
          let w = b.w, h = b.h;
          if (w > maxW) { h *= maxW / w; w = maxW; }
          const intrinsic = b.px[0] && b.w ? (b.px[0] / b.w) * 72 : 150;
          const r = await render({ pageIndex: model.pageIndex, box: b.box, dpi: clamp(Math.round(intrinsic), 96, 220), photo: b.photo });
          if (r && inHeader) {
            // בכותרת: צפה במקום המדויק, כדי שלא תדחוף את הטקסט שלצידה ואת גוף העמוד
            const mid = (b.u0 + b.u1) / 2, third = (col.r - col.l) / 3;
            const hAlign = mid > col.r - third ? 'right' : mid < col.l + third ? 'left' : 'center';
            xml += anchorXml(ctx, addMedia(r, rels), b.w, b.h, 0, frame.v1 - b.top, false, hAlign);
            stats.images++;
          } else if (r) {
            const mid = (b.u0 + b.u1) / 2;
            const align = Math.abs(mid - (col.l + col.r) / 2) < (col.r - col.l) * 0.1 ? 'center' : (mid > (col.l + col.r) / 2 ? 'right' : 'left');
            xml += imageXml(ctx, { rid: addMedia(r, rels), before: gap }, w, h, align, dir);
            stats.images++;
          }
        }
        prevBottom = b.bottom;
        prevType = b.type;
      }
      return xml;
    };

    const parts = { headers: [], footers: [], docRels };
    if (running) {
      const tm = running.template;
      const hRels = [], fRels = [];
      const footer = running.f.map((b) => (b.type === 'para' ? { ...b, runs: pageFields(b.runs, tm.pageIndex + 1, pages.length) } : b));
      parts.headers.push({ id: 'rIdHdr1', name: 'header1.xml', xml: await blocksXml(running.h, tm, hRels, false, true), rels: hRels });
      parts.footers.push({ id: 'rIdFtr1', name: 'footer1.xml', xml: await blocksXml(footer, tm, fRels, false), rels: fRels });
      // עמודים בלי הכותרת (סרוקים / מעוצבים) מקבלים כותרת ריקה — אחרת Word ממשיך את הקודמת
      parts.headers.push({ id: 'rIdHdr0', name: 'header2.xml', xml: '', rels: [] });
      parts.footers.push({ id: 'rIdFtr0', name: 'footer2.xml', xml: '', rels: [] });
      running.hTop = running.h.length ? Math.max(...running.h.map((b) => b.top)) : null;
      // הגוף מתחיל מתחת לכל מה שבכותרת (גם תמונה צפה — לא כל תוכנה מזיזה את הטקסט סביבה)
      running.hBottom = running.h.length ? Math.min(...running.h.map((b) => b.bottom)) : null;
      running.fTop = running.f.length ? Math.max(...running.f.map((b) => b.top)) : null;
      running.fBottom = running.f.length ? Math.min(...running.f.map((b) => b.bottom)) : null;
    }

    // גרפיקה בלי טקסט לעמודים המעוצבים
    const designed = models.filter((m) => m.layout).map((m) => m.pageIndex);
    const gfxPdf = designed.length && opts.renderImage ? await graphicsOnly(doc, designed) : null;

    // שלב ג: כתיבת העמודים.
    // עמודים רגילים רצופים באותו גודל זורמים ברצף (מקטע אחד): כך שורה שגלשה לא יוצרת עמוד כמעט ריק.
    // שבירת עמוד נשארת רק איפה שהעמוד במקור נגמר מוקדם בכוונה (פרק חדש וכו').
    let body = '';
    let groupSec = null;
    let pendingBreak = false;
    const BREAK = '<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>';
    const dims = (m) => (m.kind === 'text' ? [m.frame.u1 - m.frame.u0, m.frame.v1 - m.frame.v0] : [0, 0]);
    for (let n = 0; n < models.length; n++) {
      const model = models[n];
      const { pageIndex } = model;
      const last = n === models.length - 1;
      let xml = '';
      let sec;
      const refs = running ? (model.hasRunning ? { h: 'rIdHdr1', f: 'rIdFtr1' } : { h: 'rIdHdr0', f: 'rIdFtr0' }) : null;
      if (model.kind === 'image') {
        // עמוד סרוק / לא קריא: תמונה של העמוד כולו
        stats.imagePages++;
        if (model.reason === 'unreadable') stats.unreadable++;
        const [x0, y0, x1, y1] = model.box;
        const rot = model.rotate % 180 !== 0;
        const W = rot ? y1 - y0 : x1 - x0, Hh = rot ? x1 - x0 : y1 - y0;
        const margin = 14;
        sec = { w: W, h: Hh, margins: { t: margin, b: margin, l: margin, r: margin }, dir: 'rtl', refs };
        const r = await render({ pageIndex, box: model.box, dpi: 150, photo: true, full: true });
        if (r) {
          const s = Math.min((W - margin * 2) / W, (Hh - margin * 2 - 4) / Hh);
          xml += imageXml(ctx, { rid: addMedia(r, docRels) }, W * s, Hh * s, 'center', 'rtl');
          stats.images++;
        }
        xml += `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${last ? '' : sectPr(sec)}</w:pPr></w:p>`;
      } else if (model.layout) {
        // עמוד מעוצב: הגרפיקה כתמונת רקע, הטקסט במסגרות ובטבלאות צפות במקום המדויק
        stats.textPages++;
        stats.designedPages++;
        const { frame } = model;
        const W = frame.u1 - frame.u0, Hh = frame.v1 - frame.v0;
        sec = { w: W, h: Hh, margins: { t: 14, b: 14, l: 14, r: 14, h: 0, f: 0 }, dir: 'ltr', refs };
        const bg = await render({ pageIndex, box: model.box, dpi: 150, photo: true, full: true, pdf: gfxPdf });
        ctx.boxes = [];
        const tablesXml = await blocksXml(model.exact || model.blocks, model, docRels, true);
        // פסקה אחת שמחזיקה את הרקע ואת כל תיבות הטקסט — כך כולן נשארות בעמוד הזה
        xml += `<w:p>${TINY_P}${bg ? anchorRun(ctx, addMedia(bg, docRels), W, Hh) : ''}${ctx.boxes.join('')}</w:p>`;
        if (bg) stats.images++;
        xml += tablesXml;
        xml += `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${last ? '' : sectPr(sec)}</w:pPr></w:p>`;
      } else {
        stats.textPages++;
        const { frame, col, dir } = model;
        const W = frame.u1 - frame.u0, Hh = frame.v1 - frame.v0;
        // אזור הגוף אחרי הוצאת הכותרות
        const bodyTop = model.blocks.length ? Math.max(...model.blocks.map((b) => b.top)) : col.t;
        const bodyBottom = model.blocks.length ? Math.min(...model.blocks.map((b) => b.bottom)) : col.b;
        // שוליים: לפי אזור הטקסט, קצת רחב יותר — הגופנים ב-Word לא בדיוק באותו רוחב
        const m = {
          l: clamp(col.l - frame.u0 - 3, 10, W * 0.35), r: clamp(frame.u1 - col.r - 3, 10, W * 0.35),
          t: clamp(frame.v1 - bodyTop, 12, running && running.hTop != null ? 160 : 72),
          b: clamp(Math.min(bodyBottom - frame.v0, 42), 12, 42),
        };
        if (running && model.hasRunning) {
          if (running.hTop != null) { m.h = clamp(frame.v1 - running.hTop, 6, m.t); }
          if (running.fBottom != null) { m.f = clamp(running.fBottom - frame.v0, 6, m.b); }
          // הגוף מתחת לכותרת העליונה ומעל התחתונה
          if (running.hBottom != null) m.t = Math.max(m.t, Math.min(160, frame.v1 - running.hBottom + 4));
          // הגוף יכול לרדת עד הכותרת התחתונה (לא רק עד איפה שהטקסט נגמר במקור) — מרווח ביטחון לגופנים של Word
          if (running.fTop != null) m.b = clamp(running.fTop - frame.v0 + 6, 12, 120);
        }
        sec = { w: W, h: Hh, margins: m, dir, refs };
        if (pendingBreak) xml += BREAK;
        pendingBreak = false;
        if (!groupSec) groupSec = sec;
        xml += await blocksXml(model.blocks, model, docRels, false);
        if (!model.blocks.length) xml += '<w:p/>';
        const next = models[n + 1];
        const nd = next ? dims(next) : null;
        const flowsOn = next && next.kind === 'text' && !next.layout && !!next.hasRunning === !!model.hasRunning
          && Math.abs(nd[0] - W) < 2 && Math.abs(nd[1] - Hh) < 2;
        if (flowsOn) {
          // העמוד במקור נגמר הרבה לפני התחתית — שבירת עמוד לפני הבא
          if (bodyBottom - frame.v0 > Hh * 0.3) pendingBreak = true;
        } else if (!last) {
          // סוף רצף: שבירת מקטע עם הגודל והשוליים של הרצף
          sec = groupSec;
          groupSec = null;
          if (xml.endsWith('</w:p>') && /<w:pPr>(?:(?!<w:p>)[\s\S])*<\/w:pPr>(?:(?!<w:p>)[\s\S])*<\/w:p>$/.test(xml.slice(xml.lastIndexOf('<w:p>')))) {
            xml = xml.replace(/<\/w:pPr>((?:(?!<w:p>)[\s\S])*)<\/w:p>$/, (all, rest) => `${sectPr(sec)}</w:pPr>${rest}</w:p>`);
          } else {
            xml += `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${sectPr(sec)}</w:pPr></w:p>`;
          }
        } else if (groupSec) sec = groupSec;
      }
      body += xml;
      if (last) body += sectPr(sec).replace('<w:type w:val="nextPage"/>', '');
      await tick(n + 1, want.length);
    }
    if (!want.length) body = '<w:p/>' + sectPr({ w: 595, h: 842, margins: { t: 72, b: 72, l: 72, r: 72 }, dir: 'rtl' });
    parts.body = body;
    const bytes = packageFiles(parts, media, CUR.lists, opts.title, fonts);
    return { bytes, stats };
  }

  return { convert, analyzePage, findImages, fontFamily, splitScript, _internal: { buildParagraphs, toRows, lineRuns, scanGraphics, ruledTables, graphicsOnly, stripTextOps } };
});
