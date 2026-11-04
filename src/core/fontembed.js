/*
 * הטמעת הגופנים של ה-PDF בקובץ ה-Word.
 *
 * כדי ש-Word יציג את הטקסט באותו גופן ובאותם רוחבים כמו במקור — גם במחשב שהגופן לא מותקן בו
 * (דוד ב-Mac, גופן מסחרי שהגיע עם המסמך) — בונים מהגופן שבתוך ה-PDF גופן TrueType תקין
 * ומטמיעים אותו ב-docx, כמו ש-Word עצמו עושה ב"הטמעת גופנים בקובץ".
 *
 * ב-PDF הגופן הוא בדרך כלל תת-קבוצה (רק האותיות שבשימוש), ולעתים בכמה עותקים (תת-קבוצה לכל סוג
 * קידוד). העותקים של אותו גופן מתאחדים לגופן אחד. מפת התווים (cmap) נבנית מחדש מהמיפוי
 * של ה-PDF לטקסט (ToUnicode / קידוד), וטבלאות שחסרות (שם, OS/2, post) נוספות.
 *
 * רק TrueType (FontFile2). גופן CFF/Type1 לא ניתן להטמעה ב-Word — שם נשאר הגופן החלופי.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('pdf-lib'), require('./textedit.js'), require('@pdf-lib/fontkit'));
  } else {
    root.FontEmbed = factory(root.PDFLib, root.TextEdit, root.fontkit);
  }
})(typeof self !== 'undefined' ? self : this, function (PDFLib, TE, fontkit) {
  'use strict';

  const { PDFName, PDFDict, PDFArray, PDFStream, PDFRef } = PDFLib;
  const N = (s) => PDFName.of(s);

  /* ---------- קריאת TrueType ---------- */

  function readFont(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const num = dv.getUint16(4);
    const tables = {};
    for (let i = 0; i < num; i++) {
      const o = 12 + i * 16;
      const tag = String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
      const off = dv.getUint32(o + 8), len = dv.getUint32(o + 12);
      if (off + len <= bytes.length) tables[tag] = bytes.subarray(off, off + len);
    }
    if (!tables.head || !tables.maxp || !tables.loca || !tables.glyf || !tables.hhea || !tables.hmtx) return null;
    const v = (t) => new DataView(t.buffer, t.byteOffset, t.byteLength);
    const numGlyphs = v(tables.maxp).getUint16(4);
    const longLoca = v(tables.head).getInt16(50) === 1;
    const upm = v(tables.head).getUint16(18);
    const nHM = v(tables.hhea).getUint16(34);
    const loca = [];
    const lv = v(tables.loca);
    for (let g = 0; g <= numGlyphs; g++) {
      const p = longLoca ? g * 4 : g * 2;
      if (p + (longLoca ? 4 : 2) > tables.loca.length) { loca.push(loca[loca.length - 1] || 0); continue; }
      loca.push(longLoca ? lv.getUint32(p) : lv.getUint16(p) * 2);
    }
    const hv = v(tables.hmtx);
    const metric = (g) => {
      const i = Math.min(g, nHM - 1);
      const adv = 4 * i + 2 <= tables.hmtx.length ? hv.getUint16(4 * i) : 0;
      const lsbPos = g < nHM ? 4 * g + 2 : 4 * nHM + 2 * (g - nHM);
      const lsb = lsbPos + 2 <= tables.hmtx.length ? hv.getInt16(lsbPos) : 0;
      return [adv, lsb];
    };
    const glyph = (g) => (g < numGlyphs && loca[g + 1] > loca[g] ? tables.glyf.subarray(loca[g], Math.min(loca[g + 1], tables.glyf.length)) : null);
    return { tables, numGlyphs, upm, glyph, metric, cmap: tables.cmap ? parseCmap(tables.cmap) : null };
  }

  /** קריאת cmap: מחזיר { '3,1': Map(code→gid), '3,0': ..., '1,0': ... } (פורמטים 0, 4, 6, 12) */
  function parseCmap(t) {
    const dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
    const out = {};
    const n = dv.getUint16(2);
    for (let i = 0; i < n; i++) {
      const pid = dv.getUint16(4 + i * 8), eid = dv.getUint16(6 + i * 8), off = dv.getUint32(8 + i * 8);
      if (off >= t.length) continue;
      const map = new Map();
      try {
        const fmt = dv.getUint16(off);
        if (fmt === 0) for (let c = 0; c < 256; c++) map.set(c, t[off + 6 + c]);
        else if (fmt === 6) {
          const first = dv.getUint16(off + 6), cnt = dv.getUint16(off + 8);
          for (let k = 0; k < cnt; k++) map.set(first + k, dv.getUint16(off + 10 + 2 * k));
        } else if (fmt === 4) {
          const segX2 = dv.getUint16(off + 6), seg = segX2 / 2;
          const ends = off + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
          for (let s = 0; s < seg; s++) {
            const end = dv.getUint16(ends + 2 * s), start = dv.getUint16(starts + 2 * s);
            const delta = dv.getInt16(deltas + 2 * s), ro = dv.getUint16(ranges + 2 * s);
            for (let c = start; c <= end && c !== 0xFFFF; c++) {
              let gid;
              if (!ro) gid = (c + delta) & 0xFFFF;
              else {
                const p = ranges + 2 * s + ro + 2 * (c - start);
                gid = p + 2 <= t.length ? dv.getUint16(p) : 0;
                if (gid) gid = (gid + delta) & 0xFFFF;
              }
              if (gid) map.set(c, gid);
            }
          }
        } else if (fmt === 12) {
          const groups = dv.getUint32(off + 12);
          for (let k = 0; k < groups; k++) {
            const p = off + 16 + 12 * k;
            const s = dv.getUint32(p), e = dv.getUint32(p + 4), g = dv.getUint32(p + 8);
            for (let c = s; c <= e && c - s < 65536; c++) map.set(c, g + c - s);
          }
        }
      } catch (e) { continue; }
      out[pid + ',' + eid] = map;
    }
    return out;
  }

  /** נקודות של גליף פשוט (בלי גליפים מורכבים) */
  function glyphPoints(data) {
    if (!data || data.length < 12) return null;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const nc = dv.getInt16(0);
    if (nc <= 0) return null;
    let p = 10;
    const ends = [];
    for (let i = 0; i < nc; i++) { ends.push(dv.getUint16(p)); p += 2; }
    const n = ends[nc - 1] + 1;
    const il = dv.getUint16(p); p += 2 + il;
    const flags = [];
    while (flags.length < n && p < data.length) {
      const f = data[p++];
      flags.push(f);
      if (f & 8) { let r = data[p++]; while (r-- > 0 && flags.length < n) flags.push(f); }
    }
    const xs = [], ys = [];
    let x = 0;
    for (const f of flags) {
      if (f & 2) { const d = data[p++]; x += f & 16 ? d : -d; } else if (!(f & 16)) { x += dv.getInt16(p); p += 2; }
      xs.push(x);
    }
    let y = 0;
    for (const f of flags) {
      if (f & 4) { const d = data[p++]; y += f & 32 ? d : -d; } else if (!(f & 32)) { y += dv.getInt16(p); p += 2; }
      ys.push(y);
    }
    return xs.map((v, k) => [v, ys[k]]);
  }

  /** צורת סוגר: 'open' (כמו "(" — נפתח ימינה) או 'close', לפי איפה שהקצה השמאלי של הגליף */
  function bracketShape(data) {
    const pts = glyphPoints(data);
    if (!pts || pts.length < 4) return null;
    const ys = pts.map((q) => q[1]);
    const yMin = Math.min(...ys), yMax = Math.max(...ys), mid = (yMin + yMax) / 2, h = yMax - yMin || 1;
    const xs = pts.map((q) => q[0]);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    // ב"(" הנקודה השמאלית ביותר באמצע הגובה, והנקודות העליונות/התחתונות ימינה ממנה
    const left = pts.filter((q) => q[0] - xMin < (xMax - xMin) * 0.08);
    const right = pts.filter((q) => xMax - q[0] < (xMax - xMin) * 0.08);
    const nearMid = (arr) => arr.length && arr.every((q) => Math.abs(q[1] - mid) < h * 0.35);
    if (nearMid(left) && !nearMid(right)) return 'open';
    if (nearMid(right) && !nearMid(left)) return 'close';
    // סוגר מרובע/מסולסל: רוב הנקודות בצד של הקו האנכי
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    if (Math.abs(cx - (xMin + xMax) / 2) > (xMax - xMin) * 0.08) return cx < (xMin + xMax) / 2 ? 'open' : 'close';
    return null;
  }

  /**
   * ב-PDF שנוצר ממסמך מימין לשמאל הסוגר מצויר בגליף ההפוך, ומפת הטקסט של ה-PDF מחזירה אותו לתו המקורי —
   * כך שהמיפוי "(" → גליף מצביע בפועל על צורת ")". Word ממילא מהפך סוגריים בטקסט מימין לשמאל, ולכן
   * בגופן המוטמע כל סוגר חייב להצביע על הצורה האמיתית שלו. בודקים לפי הצורה ומחליפים אם צריך.
   */
  function fixBrackets(uni, font) {
    for (const [o, c] of [[0x28, 0x29], [0x5B, 0x5D], [0x7B, 0x7D], [0x3C, 0x3E]]) {
      const go = uni.get(o), gc = uni.get(c);
      const so = go != null ? bracketShape(font.glyph(go)) : null;
      const sc = gc != null ? bracketShape(font.glyph(gc)) : null;
      if ((so === 'close' || so == null) && (sc === 'open' || sc == null) && (so === 'close' || sc === 'open')) {
        if (gc != null) uni.set(o, gc); else uni.delete(o);
        if (go != null) uni.set(c, go); else uni.delete(c);
      }
    }
  }

  /* ---------- כתיבת TrueType ---------- */

  const pad4 = (n) => (n + 3) & ~3;
  function checksum(bytes) {
    let sum = 0;
    const len = pad4(bytes.length);
    for (let i = 0; i < len; i += 4) {
      sum = (sum + (((bytes[i] || 0) << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0))) >>> 0;
    }
    return sum;
  }

  class W {
    constructor() { this.b = []; }
    u8(v) { this.b.push(v & 255); return this; }
    u16(v) { this.b.push((v >> 8) & 255, v & 255); return this; }
    i16(v) { return this.u16(v < 0 ? v + 65536 : v); }
    u32(v) { this.b.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); return this; }
    bytes(a) { for (const x of a) this.b.push(x); return this; }
    out() { return Uint8Array.from(this.b); }
  }

  /** cmap חדש: (3,1) פורמט 4 לכל ה-BMP, ו-(3,10) פורמט 12 אם יש תווים מעבר לו */
  function buildCmap(uni) {
    const entries = [...uni.entries()].filter(([u, g]) => g > 0).sort((a, b) => a[0] - b[0]);
    const bmp = entries.filter(([u]) => u < 0xFFFF);
    // מקטעים רציפים (קוד וגליף עולים יחד) → delta; אחרת מקטע לתו בודד
    const segs = [];
    for (const [u, g] of bmp) {
      const last = segs[segs.length - 1];
      if (last && u === last.end + 1 && g - u === last.delta) last.end = u;
      else segs.push({ start: u, end: u, delta: g - u });
    }
    segs.push({ start: 0xFFFF, end: 0xFFFF, delta: 1 });
    const segX2 = segs.length * 2;
    let sr = 1, es = 0;
    while (sr * 2 <= segs.length) { sr *= 2; es++; }
    const f4 = new W();
    f4.u16(4).u16(16 + segs.length * 8).u16(0).u16(segX2).u16(sr * 2).u16(es).u16(segX2 - sr * 2);
    for (const s of segs) f4.u16(s.end);
    f4.u16(0);
    for (const s of segs) f4.u16(s.start);
    for (const s of segs) f4.u16(s.delta & 0xFFFF);
    for (let k = 0; k < segs.length; k++) f4.u16(0);
    const t4 = f4.out();
    const big = entries.filter(([u]) => u > 0xFFFF);
    let t12 = null;
    if (big.length) {
      const f12 = new W();
      f12.u16(12).u16(0).u32(16 + entries.length * 12).u32(0).u32(entries.length);
      for (const [u, g] of entries) f12.u32(u).u32(u).u32(g);
      t12 = f12.out();
    }
    const n = t12 ? 2 : 1;
    const head = new W().u16(0).u16(n);
    head.u16(3).u16(1).u32(4 + 8 * n);
    if (t12) head.u16(3).u16(10).u32(4 + 8 * n + t4.length);
    return Uint8Array.from([...head.out(), ...t4, ...(t12 || [])]);
  }

  function buildName(family, sub, ps) {
    const recs = [[1, family], [2, sub], [3, `${family} ${sub}; EitanPDF`], [4, sub === 'Regular' ? family : `${family} ${sub}`], [6, ps]];
    const strs = recs.map(([, s]) => {
      const w = new W();
      for (const ch of s) w.u16(ch.charCodeAt(0));
      return w.out();
    });
    const w = new W().u16(0).u16(recs.length).u16(6 + recs.length * 12);
    let off = 0;
    recs.forEach(([id], k) => { w.u16(3).u16(1).u16(0x409).u16(id).u16(strs[k].length).u16(off); off += strs[k].length; });
    for (const s of strs) w.bytes(s);
    return w.out();
  }

  function buildOS2(src, { bold, italic, hhea, uni, avgWidth }) {
    const hv = new DataView(hhea.buffer, hhea.byteOffset, hhea.byteLength);
    const asc = hv.getInt16(4), desc = hv.getInt16(6), gap = hv.getInt16(8);
    const cps = [...uni.keys()].filter((u) => u < 0xFFFF).sort((a, b) => a - b);
    const hasHeb = cps.some((u) => u >= 0x590 && u <= 0x5FF);
    if (src && src.length >= 78) {
      // OS/2 מקורי: רק מוודאים שמותר להטמיע, ושהגופן מצהיר על עברית (אחרת Windows עלול להחליף אותו בטקסט עברי)
      const o = Uint8Array.from(src);
      const dv = new DataView(o.buffer);
      dv.setUint16(8, 0); // fsType: ניתן להתקנה
      if (hasHeb) {
        dv.setUint32(42, dv.getUint32(42) | (1 << 11)); // ulUnicodeRange1: עברית
        if (o.length >= 86) dv.setUint32(78, dv.getUint32(78) | (1 << 5)); // ulCodePageRange1: 1255
      }
      if (cps.length) { dv.setUint16(64, Math.min(cps[0], 0xFFFF)); dv.setUint16(66, Math.min(cps[cps.length - 1], 0xFFFF)); }
      return o;
    }
    const w = new W();
    w.u16(4).i16(avgWidth).u16(bold ? 700 : 400).u16(5).u16(0); // version, xAvgCharWidth, weight, width, fsType
    for (let k = 0; k < 10; k++) w.i16(0); // ySubscript…yStrikeoutPosition
    w.i16(0); // sFamilyClass
    for (let k = 0; k < 10; k++) w.u8(0); // panose
    w.u32(1 | (hasHeb ? 1 << 11 : 0)).u32(0).u32(0).u32(0); // ulUnicodeRange
    w.bytes([69, 80, 68, 70]); // achVendID 'EPDF'
    w.u16((bold ? 0x20 : 0) | (italic ? 0x01 : 0) | (!bold && !italic ? 0x40 : 0));
    w.u16(cps.length ? cps[0] : 32).u16(cps.length ? cps[cps.length - 1] : 32);
    w.i16(asc).i16(desc).i16(gap).u16(Math.max(0, asc)).u16(Math.max(0, -desc));
    w.u32(1 | (hasHeb ? 1 << 5 : 0)).u32(0); // ulCodePageRange
    w.i16(0).i16(0).u16(0).u16(32).u16(0); // sxHeight, sCapHeight, default, break, maxContext
    return w.out();
  }

  function buildPost(italic) {
    return new W().u32(0x00030000).u32(italic ? (-12 << 16) >>> 0 : 0).i16(-150).i16(100).u32(0).u32(0).u32(0).u32(0).u32(0).out();
  }

  /**
   * גופן אחד מאוחד מכמה תת-קבוצות של אותו גופן (אותו מספר גליפים: מספור הגליפים נשמר).
   * parts: [{ font: readFont(...), uni: Map(unicode→gid) }]
   */
  function assemble(parts, { family, bold, italic }) {
    const base = parts[0].font;
    const numGlyphs = base.numGlyphs;
    const uni = new Map();
    for (const p of parts) for (const [u, g] of p.uni) if (!uni.has(u) && g < numGlyphs) uni.set(u, g);
    // glyf/loca/hmtx: לכל גליף — מהתת-קבוצה הראשונה שבה הוא לא ריק
    const glyfParts = [];
    const loca = [0];
    const metrics = [];
    let total = 0;
    for (let g = 0; g < numGlyphs; g++) {
      let data = null, src = base;
      for (const p of parts) { const d = p.font.glyph(g); if (d) { data = d; src = p.font; break; } }
      metrics.push(src.metric(g));
      if (data) { glyfParts.push(data); total += data.length; if (data.length % 4) { const padN = 4 - (data.length % 4); glyfParts.push(new Uint8Array(padN)); total += padN; } }
      loca.push(total);
    }
    const glyf = new Uint8Array(total);
    let o = 0;
    for (const p of glyfParts) { glyf.set(p, o); o += p.length; }
    const lw = new W();
    for (const x of loca) lw.u32(x);
    const hm = new W();
    let sumW = 0, cnt = 0;
    for (const [adv, lsb] of metrics) { hm.u16(adv).i16(lsb); if (adv) { sumW += adv; cnt++; } }
    const T = base.tables;
    const head = Uint8Array.from(T.head);
    const hdv = new DataView(head.buffer);
    hdv.setUint32(8, 0); // checkSumAdjustment — מחושב בסוף
    hdv.setInt16(50, 1); // loca ארוך
    hdv.setUint16(44, (bold ? 1 : 0) | (italic ? 2 : 0)); // macStyle
    const hhea = Uint8Array.from(T.hhea);
    new DataView(hhea.buffer).setUint16(34, numGlyphs);
    const sub = bold && italic ? 'Bold Italic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular';
    const ps = (family.replace(/[^A-Za-z0-9]/g, '') || 'Font') + (sub === 'Regular' ? '' : '-' + sub.replace(' ', ''));
    const tables = {
      'OS/2': buildOS2(T['OS/2'], { bold, italic, hhea, uni, avgWidth: cnt ? Math.round(sumW / cnt) : 500 }),
      cmap: buildCmap(uni),
      glyf, head, hhea, hmtx: hm.out(), loca: lw.out(), maxp: T.maxp, name: buildName(family, sub, ps), post: buildPost(italic),
    };
    for (const t of ['cvt ', 'fpgm', 'prep', 'gasp']) if (T[t]) tables[t] = T[t];
    // הרכבה
    const tags = Object.keys(tables).sort();
    const n = tags.length;
    let sr = 1, es = 0;
    while (sr * 2 <= n) { sr *= 2; es++; }
    const dir = new W().u32(0x00010000).u16(n).u16(sr * 16).u16(es).u16(n * 16 - sr * 16);
    let off = 12 + n * 16;
    const body = [];
    for (const tag of tags) {
      const t = tables[tag];
      dir.bytes([...tag].map((c) => c.charCodeAt(0))).u32(checksum(t)).u32(off).u32(t.length);
      body.push(t);
      off += pad4(t.length);
    }
    const outBytes = new Uint8Array(off);
    outBytes.set(dir.out(), 0);
    let p = 12 + n * 16;
    const headAt = {};
    for (let k = 0; k < tags.length; k++) { outBytes.set(body[k], p); headAt[tags[k]] = p; p += pad4(body[k].length); }
    const adj = (0xB1B0AFBA - checksum(outBytes)) >>> 0;
    new DataView(outBytes.buffer).setUint32(headAt.head + 8, adj);
    return { bytes: outBytes, chars: uni.size };
  }

  /* ---------- CFF (Type1C) → TrueType ---------- */

  // הקידוד הסטנדרטי של Adobe (StandardEncoding) לקודים 32–126 — הקידוד המובנה של רוב גופני CFF
  const STD_NAMES = ('space exclam quotedbl numbersign dollar percent ampersand quoteright parenleft parenright asterisk plus comma hyphen period slash '
    + 'zero one two three four five six seven eight nine colon semicolon less equal greater question at '
    + 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore quoteleft '
    + 'a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde').split(' ');
  const stdName = (code) => (code >= 32 && code <= 126 ? STD_NAMES[code - 32] : null);

  /** גופן CFF חשוף (FontFile3) עטוף במעטפת OpenType מינימלית — כדי ש-fontkit יקרא את הגליפים */
  function openCFF(cff) {
    const tabs = { 'CFF ': cff };
    const head = new Uint8Array(54); const hv = new DataView(head.buffer);
    hv.setUint32(0, 0x10000); hv.setUint32(12, 0x5F0F3CF5); hv.setUint16(18, 1000);
    const maxp = new Uint8Array(6); new DataView(maxp.buffer).setUint32(0, 0x5000); new DataView(maxp.buffer).setUint16(4, 0xFFFF);
    const hhea = new Uint8Array(36); new DataView(hhea.buffer).setUint32(0, 0x10000);
    tabs.head = head; tabs.maxp = maxp; tabs.hhea = hhea;
    const tags = Object.keys(tabs).sort();
    const n = tags.length;
    const dir = new W().bytes([79, 84, 84, 79]).u16(n).u16(0).u16(0).u16(0);
    let off = 12 + 16 * n;
    for (const t of tags) { dir.bytes([...t].map((c) => c.charCodeAt(0))).u32(0).u32(off).u32(tabs[t].length); off += pad4(tabs[t].length); }
    const out = new Uint8Array(off);
    out.set(dir.out(), 0);
    let p = 12 + 16 * n;
    for (const t of tags) { out.set(tabs[t], p); p += pad4(tabs[t].length); }
    const f = fontkit.create(typeof Buffer !== 'undefined' ? Buffer.from(out) : out);
    return f;
  }

  /** מסלול של גליף (פקודות fontkit) → קווי מתאר של TrueType: נקודות על העקומה ומחוצה לה. עקומה מעוקבת → ריבועיות */
  function toQuadContours(cmds, scale) {
    const contours = [];
    let cur = null, last = null;
    const pt = (x, y, on) => cur.push([Math.round(x * scale), Math.round(y * scale), on]);
    for (const c of cmds) {
      const a = c.args;
      if (c.command === 'moveTo') { cur = []; contours.push(cur); pt(a[0], a[1], true); last = [a[0], a[1]]; }
      else if (!cur) continue;
      else if (c.command === 'lineTo') { pt(a[0], a[1], true); last = [a[0], a[1]]; }
      else if (c.command === 'quadraticCurveTo') { pt(a[0], a[1], false); pt(a[2], a[3], true); last = [a[2], a[3]]; }
      else if (c.command === 'bezierCurveTo') {
        const [x0, y0] = last, [x1, y1, x2, y2, x3, y3] = a;
        const len = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
        const n = Math.max(1, Math.min(6, Math.ceil(len / 120)));
        const B = (t) => {
          const u = 1 - t;
          return [u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3];
        };
        const D = (t) => {
          const u = 1 - t;
          return [3 * (u * u * (x1 - x0) + 2 * u * t * (x2 - x1) + t * t * (x3 - x2)), 3 * (u * u * (y1 - y0) + 2 * u * t * (y2 - y1) + t * t * (y3 - y2))];
        };
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          const p0 = B(t0), p1 = B(t1), d0 = D(t0), d1 = D(t1);
          // נקודת הבקרה: חיתוך המשיקים בקצוות (ואם הם מקבילים — אמצע)
          const h = t1 - t0;
          const q0 = [p0[0] + d0[0] * h / 2, p0[1] + d0[1] * h / 2], q1 = [p1[0] - d1[0] * h / 2, p1[1] - d1[1] * h / 2];
          pt((q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2, false);
          pt(p1[0], p1[1], true);
        }
        last = [x3, y3];
      } else if (c.command === 'closePath') { last = cur.length ? [cur[0][0] / scale, cur[0][1] / scale] : last; }
    }
    // סגירה: נקודה אחרונה שזהה לראשונה — מיותרת; כיוון: ב-TrueType קו המתאר החיצוני עם כיוון השעון (ב-CFF הפוך)
    return contours.filter((c) => c.length > 1).map((c) => {
      if (c.length > 1 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1] && c[c.length - 1][2]) c.pop();
      return c.reverse();
    }).filter((c) => c.length > 1);
  }

  /** גליף TrueType פשוט מקווי מתאר */
  function encodeGlyph(contours) {
    if (!contours.length) return { data: new Uint8Array(0), bbox: [0, 0, 0, 0], points: 0 };
    const all = contours.flat();
    const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const w = new W().i16(contours.length).i16(bbox[0]).i16(bbox[1]).i16(bbox[2]).i16(bbox[3]);
    let end = -1;
    for (const c of contours) { end += c.length; w.u16(end); }
    w.u16(0); // בלי הוראות רמזים
    for (const p of all) w.u8(p[2] ? 1 : 0);
    let px = 0, py = 0;
    for (const p of all) { w.i16(p[0] - px); px = p[0]; }
    for (const p of all) { w.i16(p[1] - py); py = p[1]; }
    const data = w.out();
    return { data, bbox, points: all.length };
  }

  /**
   * גופן TrueType מכמה תת-קבוצות CFF של אותו גופן. במספור הגליפים של CFF כל תת-קבוצה שונה,
   * ולכן מאחדים לפי תו: גליף לכל תו שמופיע באחת מהן.
   * parts: [{ cff: fontkit font, glyphs: Map(unicode → { gid, width }) , scale }]
   */
  function buildFromCFF(parts, { family, bold, italic, ascent, descent }) {
    const glyphs = [{ data: new Uint8Array(0), bbox: [0, 0, 0, 0], adv: 500, lsb: 0, points: 0, contours: 0 }]; // .notdef
    const uni = new Map();
    for (const p of parts) {
      for (const [u, info] of p.glyphs) {
        if (uni.has(u)) continue;
        let contours = [];
        try { contours = toQuadContours(p.cff.getGlyph(info.gid).path.commands, p.scale); } catch (e) { contours = []; }
        const g = encodeGlyph(contours);
        uni.set(u, glyphs.length);
        glyphs.push({ ...g, adv: Math.round(info.width), lsb: g.bbox[0], contours: contours.length });
      }
    }
    if (uni.size === 0) return null;
    const loca = new W();
    const glyfParts = [];
    let off = 0;
    for (const g of glyphs) { loca.u32(off); glyfParts.push(g.data); off += g.data.length; if (off % 4) { const pd = 4 - (off % 4); glyfParts.push(new Uint8Array(pd)); off += pd; } }
    loca.u32(off);
    const glyf = new Uint8Array(off);
    let q = 0;
    for (const d of glyfParts) { glyf.set(d, q); q += d.length; }
    const hm = new W();
    for (const g of glyphs) hm.u16(Math.max(0, g.adv)).i16(g.lsb);
    const bb = glyphs.filter((g) => g.points).reduce((a, g) => [Math.min(a[0], g.bbox[0]), Math.min(a[1], g.bbox[1]), Math.max(a[2], g.bbox[2]), Math.max(a[3], g.bbox[3])], [0, 0, 0, 0]);
    const head = new W().u32(0x10000).u32(0x10000).u32(0).u32(0x5F0F3CF5).u16(0x000B).u16(1000)
      .u32(0).u32(3850000000).u32(0).u32(3850000000).i16(bb[0]).i16(bb[1]).i16(bb[2]).i16(bb[3])
      .u16((bold ? 1 : 0) | (italic ? 2 : 0)).u16(8).i16(2).i16(1).i16(0).out();
    const asc = Math.round(ascent || bb[3] || 800), desc = Math.round(descent || bb[1] || -200);
    const advMax = Math.max(...glyphs.map((g) => g.adv));
    const hhea = new W().u32(0x10000).i16(asc).i16(desc).i16(0).u16(advMax).i16(Math.min(...glyphs.map((g) => g.lsb))).i16(0).i16(bb[2])
      .i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(glyphs.length).out();
    const maxPts = Math.max(...glyphs.map((g) => g.points)), maxCont = Math.max(...glyphs.map((g) => g.contours));
    const maxp = new W().u32(0x10000).u16(glyphs.length).u16(maxPts).u16(maxCont).u16(0).u16(0).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).out();
    const tables = { glyf, head, hhea, hmtx: hm.out(), loca: loca.out(), maxp };
    const fake = { tables, numGlyphs: glyphs.length, upm: 1000, glyph: (g) => (glyphs[g] && glyphs[g].data.length ? glyphs[g].data : null), metric: (g) => [glyphs[g].adv, glyphs[g].lsb] };
    return assemble([{ font: fake, uni }], { family, bold, italic });
  }

  /* ---------- איסוף הגופנים מה-PDF ---------- */

  const WIN_ANSI = (() => {
    const m = new Map();
    for (let c = 32; c < 127; c++) m.set(c, c);
    for (let c = 160; c < 256; c++) m.set(c, c);
    const hi = { 128: 0x20AC, 130: 0x201A, 131: 0x192, 132: 0x201E, 133: 0x2026, 134: 0x2020, 135: 0x2021, 136: 0x2C6, 137: 0x2030, 138: 0x160, 139: 0x2039, 140: 0x152, 142: 0x17D, 145: 0x2018, 146: 0x2019, 147: 0x201C, 148: 0x201D, 149: 0x2022, 150: 0x2013, 151: 0x2014, 152: 0x2DC, 153: 0x2122, 154: 0x161, 155: 0x203A, 156: 0x153, 158: 0x17E, 159: 0x178 };
    for (const [k, v] of Object.entries(hi)) m.set(+k, v);
    return m;
  })();

  /** כל מילוני הגופנים שבשימוש בעמודים (כולל בתוך Form XObject) */
  function fontDicts(doc, pageIndexes) {
    const out = new Map();
    const seen = new Set();
    const walkRes = (res, depth) => {
      if (!res || depth > 8) return;
      const fonts = TE.lookup(doc, res.get(N('Font')));
      if (fonts instanceof PDFDict) for (const [, ref] of fonts.entries()) {
        const d = TE.lookup(doc, ref);
        if (d instanceof PDFDict) out.set(ref instanceof PDFRef ? ref.toString() : d, d);
      }
      const xo = TE.lookup(doc, res.get(N('XObject')));
      if (xo instanceof PDFDict) for (const [, ref] of xo.entries()) {
        const key = String(ref);
        if (seen.has(key)) continue;
        seen.add(key);
        const s = TE.lookup(doc, ref);
        if (s instanceof PDFStream && TE.nameOf(doc, s.dict.get(N('Subtype'))) === 'Form') walkRes(TE.getResources(doc, s.dict), depth + 1);
      }
    };
    const pages = doc.getPages();
    for (const i of pageIndexes) walkRes(TE.pageResources(doc, pages[i]), 0);
    return [...out.values()];
  }

  /**
   * הגופנים להטמעה. familyOf(baseFontName) — אותה פונקציה שקובעת את שם הגופן בטקסט של ה-Word.
   * מחזיר [{ family, bold, italic, bytes, chars }]
   */
  function collect(doc, pageIndexes, familyOf, opts = {}) {
    const groups = new Map();
    for (const d of fontDicts(doc, pageIndexes)) {
      try {
        const sub = TE.nameOf(doc, d.get(N('Subtype')));
        const baseName = TE.nameOf(doc, d.get(N('BaseFont'))) || '';
        let fd = d;
        if (sub === 'Type0') {
          const arr = TE.lookup(doc, d.get(N('DescendantFonts')));
          fd = arr instanceof PDFArray ? TE.lookup(doc, arr.get(0)) : null;
          if (!(fd instanceof PDFDict)) continue;
        } else if (sub !== 'TrueType' && sub !== 'Type1') continue;
        const desc = TE.lookup(doc, fd.get(N('FontDescriptor')));
        if (!(desc instanceof PDFDict)) continue;
        const family = familyOf(baseName);
        if (/^(Symbol|Wingdings|Webdings|Marlett)/i.test(family)) continue;
        if (opts.skip && opts.skip(family)) continue;
        const flags0 = TE.num(doc, desc.get(N('Flags')), 0);
        const weight0 = TE.num(doc, desc.get(N('FontWeight')), 0);
        const weighted = /\s(SemiBold|DemiBold|ExtraBold|UltraBold|Black|Heavy|Medium|Light|ExtraLight|UltraLight|Thin|U)$/.test(family);
        const bold0 = !weighted && (/bold|black|heavy|semibold|demi/i.test(baseName) || weight0 >= 600 || !!(flags0 & (1 << 18)));
        const italic0 = /italic|oblique/i.test(baseName) || !!(flags0 & (1 << 6));
        // CFF פשוט (Type1C) — המרה ל-TrueType
        if (sub === 'Type1' && desc.get(N('FontFile3')) && fontkit) {
          const ff3 = TE.lookup(doc, desc.get(N('FontFile3')));
          if (TE.nameOf(doc, ff3.dict.get(N('Subtype'))) !== 'Type1C') continue;
          const cff = openCFF(TE.streamBytes(doc, ff3));
          const table = cff['CFF '];
          const fm = table.topDict.FontMatrix;
          const scale = fm && fm[0] ? fm[0] * 1000 : 1;
          const nameToGid = new Map();
          for (let g = 0; g < table.topDict.CharStrings.length; g++) { const nm = table.getGlyphName(g); if (nm) nameToGid.set(nm, g); }
          // רוחבים מה-PDF (לפי קוד) ושמות לפי הקידוד של ה-PDF (Differences) או של הגופן
          const widths = TE.lookup(doc, d.get(N('Widths')));
          const first = TE.num(doc, d.get(N('FirstChar')), 0);
          const enc = TE.lookup(doc, d.get(N('Encoding')));
          const diffs = new Map();
          if (enc instanceof PDFDict) {
            const arr = TE.lookup(doc, enc.get(N('Differences')));
            if (arr instanceof PDFArray) {
              let code = 0;
              for (const x of arr.asArray()) { const v = TE.lookup(doc, x); if (v instanceof PDFLib.PDFNumber) code = v.asNumber(); else if (v instanceof PDFName) diffs.set(code++, v.decodeText()); }
            }
          }
          const builtIn = new Map();
          try { const e = table.encoding; if (e && e.codes) e.codes.forEach((gid, i) => builtIn.set(i, gid)); } catch (e) { /* בלי קידוד מובנה */ }
          const toU = d.get(N('ToUnicode')) ? TE.parseToUnicode(TE.streamBytes(doc, d.get(N('ToUnicode')))) : null;
          const glyphs = new Map();
          const WIN = { 133: 0x2026, 145: 0x2018, 146: 0x2019, 147: 0x201C, 148: 0x201D, 149: 0x2022, 150: 0x2013, 151: 0x2014 };
          for (let code = 0; code < 256; code++) {
            let name = diffs.get(code);
            let gid = name ? nameToGid.get(name) : undefined;
            if (gid == null && builtIn.has(code)) gid = builtIn.get(code);
            // בלי Differences ובלי קידוד מובנה שנקרא: הקידוד הסטנדרטי (רווח, ספרות, אותיות לטיניות)
            if (gid == null && !name && stdName(code) && nameToGid.has(stdName(code))) { name = stdName(code); gid = nameToGid.get(name); }
            if (gid == null || gid === 0) continue;
            const gname = table.getGlyphName(gid);
            const hex = code.toString(16).padStart(2, '0');
            let str = toU && toU.has(hex) ? toU.get(hex) : TE.glyphNameToUnicode(name || gname);
            if (!str && WIN[code]) str = String.fromCodePoint(WIN[code]);
            if (!str || [...str].length !== 1) continue;
            const w = widths instanceof PDFArray && code - first >= 0 && code - first < widths.size() ? TE.num(doc, widths.get(code - first), 0) : 0;
            const u = str.codePointAt(0);
            if (!glyphs.has(u)) glyphs.set(u, { gid, width: w || 500 });
          }
          if (!glyphs.size) continue;
          const key = `${family}|${bold0 ? 1 : 0}|${italic0 ? 1 : 0}|cff`;
          if (!groups.has(key)) groups.set(key, { family, bold: bold0, italic: italic0, cffParts: [], ascent: TE.num(doc, desc.get(N('Ascent')), 0), descent: TE.num(doc, desc.get(N('Descent')), 0) });
          groups.get(key).cffParts.push({ cff, glyphs, scale });
          continue;
        }
        if (!desc.get(N('FontFile2'))) continue;
        const font = readFont(TE.streamBytes(doc, desc.get(N('FontFile2'))));
        if (!font) continue;
        const bold = bold0, italic = italic0;
        // unicode → גליף
        const toU = d.get(N('ToUnicode')) ? TE.parseToUnicode(TE.streamBytes(doc, d.get(N('ToUnicode')))) : null;
        const uni = new Map();
        const addU = (str, gid) => {
          if (!str || !gid) return;
          const cps = [...str];
          if (cps.length !== 1) return; // ליגטורה — לא נכנסת ל-cmap
          const cp = cps[0].codePointAt(0);
          if (!uni.has(cp)) uni.set(cp, gid);
        };
        if (sub === 'Type0') {
          const enc = TE.nameOf(doc, d.get(N('Encoding')));
          if (enc !== 'Identity-H' && enc !== 'Identity-V') continue;
          const c2g = TE.lookup(doc, fd.get(N('CIDToGIDMap')));
          const map = c2g instanceof PDFStream ? TE.streamBytes(doc, c2g) : null;
          const gidOf = (cid) => (map ? (2 * cid + 1 < map.length ? (map[2 * cid] << 8) | map[2 * cid + 1] : 0) : cid);
          // מפת התווים של הגופן עצמו (אם נשארה) קודמת: היא ממפה כל תו לצורה הנכונה שלו
          const own = font.cmap && (font.cmap['3,10'] || font.cmap['3,1'] || font.cmap['0,3'] || font.cmap['0,4']);
          if (own) for (const [u, g] of own) if (g && !uni.has(u)) uni.set(u, g);
          if (toU) for (const [hex, str] of toU) addU(str, gidOf(parseInt(hex, 16)));
          if (!own) fixBrackets(uni, font);
        } else {
          const cm = font.cmap || {};
          const sub30 = cm['3,0'], sub10 = cm['1,0'], sub31 = cm['3,1'];
          const gidOfCode = (c) => (sub30 && (sub30.get(0xF000 + c) || sub30.get(c))) || (sub10 && sub10.get(c)) || (sub31 && sub31.get(c)) || 0;
          for (let c = 0; c < 256; c++) {
            const gid = gidOfCode(c);
            if (!gid) continue;
            const hex = c.toString(16).padStart(2, '0');
            if (toU && toU.has(hex)) addU(toU.get(hex), gid);
            else if (WIN_ANSI.has(c)) addU(String.fromCodePoint(WIN_ANSI.get(c)), gid);
          }
        }
        if (!uni.size) continue;
        const key = `${family}|${bold ? 1 : 0}|${italic ? 1 : 0}`;
        if (!groups.has(key)) groups.set(key, { family, bold, italic, parts: [] });
        groups.get(key).parts.push({ font, uni });
      } catch (e) { /* גופן פגום — פשוט לא מוטמע */ }
    }
    const out = [];
    const ttFamilies = new Set([...groups.keys()].filter((k) => !k.endsWith('|cff')).map((k) => k.split('|').slice(0, 3).join('|')));
    for (const g of groups.values()) {
      if (g.cffParts) {
        // אותו גופן גם ב-TrueType — עדיף הוא
        if (ttFamilies.has(`${g.family}|${g.bold ? 1 : 0}|${g.italic ? 1 : 0}`)) continue;
        try {
          const r = buildFromCFF(g.cffParts, g);
          if (r) out.push({ family: g.family, bold: g.bold, italic: g.italic, bytes: r.bytes, chars: r.chars, cff: true, ascent: ascentOf(r.bytes) });
        } catch (e) { /* המרה נכשלה — בלי הטמעה */ }
        continue;
      }
      // תת-קבוצות של אותו גופן: אותו מספר גליפים ואותו גודל em. אחרת — רק הגדולה מביניהן
      const parts = g.parts.sort((a, b) => b.uni.size - a.uni.size);
      const same = parts.filter((p) => p.font.numGlyphs === parts[0].font.numGlyphs && p.font.upm === parts[0].font.upm);
      try {
        const r = assemble(same, g);
        out.push({ family: g.family, bold: g.bold, italic: g.italic, bytes: r.bytes, chars: r.chars, ascent: ascentOf(r.bytes) });
      } catch (e) { /* לא הצלחנו לבנות — בלי הטמעה */ }
    }
    return out;
  }

  /** הגובה מעל קו הבסיס שבו Word מתחיל את השורה (usWinAscent), כחלק מגודל הגופן */
  function ascentOf(bytes) {
    try {
      const f = readFont(bytes);
      const os2 = f.tables['OS/2'];
      const upm = f.upm || 1000;
      if (os2 && os2.length >= 78) return new DataView(os2.buffer, os2.byteOffset, os2.byteLength).getUint16(74) / upm;
      return new DataView(f.tables.hhea.buffer, f.tables.hhea.byteOffset).getInt16(4) / upm;
    } catch (e) { return null; }
  }

  /* ---------- הצפנה לפי התקן (obfuscated font, ECMA-376 17.8.1) ---------- */

  function newKey(rand = Math.random) {
    const h = () => Math.floor(rand() * 16).toString(16).toUpperCase();
    const s = (n) => Array.from({ length: n }, h).join('');
    return `{${s(8)}-${s(4)}-${s(4)}-${s(4)}-${s(12)}}`;
  }
  function obfuscate(bytes, key) {
    const hex = key.replace(/[{}-]/g, '');
    const kb = [];
    for (let i = 30; i >= 0; i -= 2) kb.push(parseInt(hex.substr(i, 2), 16));
    const out = Uint8Array.from(bytes);
    for (let i = 0; i < 32 && i < out.length; i++) out[i] ^= kb[i % 16];
    return out;
  }

  return { collect, readFont, parseCmap, assemble, buildCmap, obfuscate, newKey };
});
