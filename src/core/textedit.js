/*
 * עריכת הטקסט הקיים ב-PDF.
 *
 * מפרש את זרמי התוכן (content streams) של העמוד ומחשב לכל גליף: איזה תו הוא,
 * איפה הוא נמצא ובאיזה גודל. מזה בונים שורות לעריכה, ובשמירה מוחקים את הגליפים
 * של השורה הישנה מהזרם עצמו (לא כיסוי לבן). גליף שנמחק מוחלף בהיסט שקול
 * במערך TJ, כך שכל מה שאחריו נשאר בדיוק במקומו.
 *
 * הטקסט החדש לא נכתב כאן — הוא נכתב דרך hebrew.js (bidi) כמו כל טקסט אחר.
 *
 * עובד ב-Node (בדיקות) ובדפדפן (window.TextEdit).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('pdf-lib'), require('./hebrew.js'));
  } else {
    root.TextEdit = factory(root.PDFLib, root.HebrewPDF);
  }
})(typeof self !== 'undefined' ? self : this, function (PDFLib, H) {
  'use strict';

  const { PDFName, PDFArray, PDFDict, PDFRef, PDFNumber, PDFRawStream, PDFStream, decodePDFRawStream } = PDFLib;
  const N = (s) => PDFName.of(s);

  /* ---------- טוקנייזר לזרם תוכן ---------- */

  const WS = new Set([0, 9, 10, 12, 13, 32]);
  const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

  /**
   * מפרק זרם תוכן לפעולות: { op, args, start, end } כאשר start/end הם מיקומי בתים.
   * מחרוזות מוחזרות כ-{ str: Uint8Array }. מערכים כמערך JS. שמות כ-{ name }.
   */
  function parseOps(bytes) {
    const ops = [];
    let i = 0;
    const n = bytes.length;
    let args = [];
    let argStart = -1;
    const stack = []; // למערכים ומילונים מקוננים

    const push = (v, at) => {
      if (stack.length) stack[stack.length - 1].push(v);
      else {
        if (argStart < 0) argStart = at;
        args.push(v);
      }
    };

    while (i < n) {
      const c = bytes[i];
      if (WS.has(c)) { i++; continue; }
      if (c === 37) { // % הערה
        while (i < n && bytes[i] !== 10 && bytes[i] !== 13) i++;
        continue;
      }
      const at = i;
      if (c === 40) { // (מחרוזת)
        const out = [];
        let depth = 1;
        i++;
        while (i < n && depth > 0) {
          let b = bytes[i++];
          if (b === 92) { // \
            const e = bytes[i++];
            if (e === 110) out.push(10);
            else if (e === 114) out.push(13);
            else if (e === 116) out.push(9);
            else if (e === 98) out.push(8);
            else if (e === 102) out.push(12);
            else if (e >= 48 && e <= 55) {
              let v = e - 48;
              for (let k = 0; k < 2 && bytes[i] >= 48 && bytes[i] <= 55; k++) v = v * 8 + (bytes[i++] - 48);
              out.push(v & 255);
            } else if (e === 13) { if (bytes[i] === 10) i++; }
            else if (e === 10) { /* המשך שורה */ }
            else out.push(e);
            continue;
          }
          if (b === 40) depth++;
          else if (b === 41 && --depth === 0) break;
          out.push(b);
        }
        push({ str: Uint8Array.from(out) }, at);
        continue;
      }
      if (c === 60 && bytes[i + 1] === 60) { // << מילון
        stack.push([]);
        stack[stack.length - 1].isDict = true;
        stack[stack.length - 1].at = at;
        i += 2;
        continue;
      }
      if (c === 62 && bytes[i + 1] === 62) {
        const d = stack.pop();
        i += 2;
        push({ dict: d }, d.at);
        continue;
      }
      if (c === 60) { // <hex>
        i++;
        let hex = '';
        while (i < n && bytes[i] !== 62) {
          const ch = bytes[i++];
          if (!WS.has(ch)) hex += String.fromCharCode(ch);
        }
        i++;
        if (hex.length % 2) hex += '0';
        const out = new Uint8Array(hex.length / 2);
        for (let k = 0; k < out.length; k++) out[k] = parseInt(hex.substr(k * 2, 2), 16);
        push({ str: out }, at);
        continue;
      }
      if (c === 91) { const a = []; a.at = at; stack.push(a); i++; continue; }
      if (c === 93) { const a = stack.pop(); i++; push(a, a.at); continue; }
      if (c === 47) { // /שם
        i++;
        let s = '';
        while (i < n && !WS.has(bytes[i]) && !DELIM.has(bytes[i])) s += String.fromCharCode(bytes[i++]);
        push({ name: s.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) }, at);
        continue;
      }
      // מספר או אופרטור
      let s = '';
      while (i < n && !WS.has(bytes[i]) && !DELIM.has(bytes[i])) s += String.fromCharCode(bytes[i++]);
      if (!s) { i++; continue; } // תו לא צפוי — מדלגים
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) { push(parseFloat(s), at); continue; }
      if (s === 'true' || s === 'false') { push(s === 'true', at); continue; }
      if (s === 'null') { push(null, at); continue; }
      if (stack.length) { stack[stack.length - 1].push({ name: s }); continue; } // לא אמור לקרות
      // אופרטור
      if (s === 'BI') {
        // תמונה inline: מדלגים עד EI שמוקף ברווחים
        const start = at;
        let j = i;
        while (j < n) {
          if (bytes[j] === 73 && bytes[j + 1] === 68 && WS.has(bytes[j + 2])) { j += 3; break; } // ID
          j++;
        }
        while (j < n) {
          if (WS.has(bytes[j - 1]) && bytes[j] === 69 && bytes[j + 1] === 73 && (j + 2 >= n || WS.has(bytes[j + 2]))) { j += 2; break; }
          j++;
        }
        i = j;
        ops.push({ op: 'BI', args: [], start, end: i });
      } else {
        ops.push({ op: s, args, start: argStart >= 0 ? argStart : at, end: i });
      }
      args = [];
      argStart = -1;
    }
    return ops;
  }

  /* ---------- מטריצות ---------- */

  const mul = (a, b) => [
    a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
  ];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  /* ---------- פונטים ---------- */

  function lookup(doc, o) { return o instanceof PDFRef ? doc.context.lookup(o) : o; }
  function num(doc, o, def) {
    const v = lookup(doc, o);
    return v instanceof PDFNumber ? v.asNumber() : def;
  }
  function nameOf(doc, o) {
    const v = lookup(doc, o);
    return v instanceof PDFName ? v.decodeText() : null;
  }

  function streamBytes(doc, s) {
    const st = lookup(doc, s);
    if (st instanceof PDFRawStream) return decodePDFRawStream(st).decode();
    if (st && typeof st.getContents === 'function') return st.getContents();
    return new Uint8Array(0);
  }

  /** קריאת ToUnicode CMap → Map(קוד הקסדצימלי → מחרוזת) */
  function parseToUnicode(bytes) {
    const map = new Map();
    const txt = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    const hexToStr = (h) => {
      let s = '';
      for (let k = 0; k + 4 <= h.length; k += 4) s += String.fromCharCode(parseInt(h.substr(k, 4), 16));
      if (h.length === 2) s = String.fromCharCode(parseInt(h, 16));
      return s;
    };
    const blocks = (kw) => {
      const out = [];
      const re = new RegExp('begin' + kw + '([\\s\\S]*?)end' + kw, 'g');
      let m;
      while ((m = re.exec(txt))) out.push(m[1]);
      return out;
    };
    for (const b of blocks('bfchar')) {
      const re = /<([0-9a-fA-F\s]+)>\s*<([0-9a-fA-F\s]*)>/g;
      let m;
      while ((m = re.exec(b))) map.set(m[1].replace(/\s/g, '').toLowerCase(), hexToStr(m[2].replace(/\s/g, '')));
    }
    for (const b of blocks('bfrange')) {
      const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F\s]*>|\[[^\]]*\])/g;
      let m;
      while ((m = re.exec(b))) {
        const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16), w = m[1].length;
        if (hi - lo > 65535) continue;
        if (m[3][0] === '[') {
          const items = m[3].match(/<([0-9a-fA-F\s]*)>/g) || [];
          items.forEach((it, k) => map.set((lo + k).toString(16).padStart(w, '0'), hexToStr(it.slice(1, -1).replace(/\s/g, ''))));
        } else {
          const dst = m[3].slice(1, -1).replace(/\s/g, '');
          const base = dst.slice(0, -4), last = parseInt(dst.slice(-4), 16);
          for (let c = lo; c <= hi; c++) {
            map.set(c.toString(16).padStart(w, '0'), hexToStr(base + (last + c - lo).toString(16).padStart(4, '0')));
          }
        }
      }
    }
    return map;
  }

  /** שמות גליפים נפוצים → Unicode (לפונטים בלי ToUnicode) */
  function glyphNameToUnicode(name) {
    if (!name) return null;
    let m = name.match(/^uni([0-9A-Fa-f]{4,})$/);
    if (m) return String.fromCharCode(...m[1].match(/.{4}/g).map((h) => parseInt(h, 16)));
    m = name.match(/^u([0-9A-Fa-f]{4,6})$/);
    if (m) return String.fromCodePoint(parseInt(m[1], 16));
    m = name.match(/^afii(5766[4-9]|576[7-8]\d|5769[0])$/); // א..ת
    if (m) return String.fromCharCode(0x5d0 + (+m[1] - 57664));
    const basic = { space: ' ', period: '.', comma: ',', hyphen: '-', colon: ':', semicolon: ';', parenleft: '(', parenright: ')', quotedbl: '"', quotesingle: "'", slash: '/', percent: '%' };
    if (basic[name]) return basic[name];
    if (/^[A-Za-z]$/.test(name)) return name;
    const digits = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    if (digits.includes(name)) return String(digits.indexOf(name));
    return null;
  }

  function fontInfo(doc, ref, cache) {
    const key = ref instanceof PDFRef ? ref.toString() : ref;
    if (cache.has(key)) return cache.get(key);
    const f = lookup(doc, ref);
    const info = { ok: true, bytes: 1, widths: new Map(), dw: 0, scale: 0.001, toU: null, enc: null, name: '', ascent: 0.8, descent: -0.2, bold: false, reason: '' };
    cache.set(key, info);
    if (!(f instanceof PDFDict)) { info.ok = false; info.reason = 'font-missing'; return info; }
    const subtype = nameOf(doc, f.get(N('Subtype')));
    info.name = nameOf(doc, f.get(N('BaseFont'))) || '';
    info.subtype = subtype;
    let desc = null;
    if (subtype === 'Type0') {
      const enc = nameOf(doc, f.get(N('Encoding')));
      if (enc !== 'Identity-H') { info.ok = false; info.reason = 'encoding:' + enc; }
      info.bytes = 2;
      const dfs = lookup(doc, f.get(N('DescendantFonts')));
      const df = dfs instanceof PDFArray ? lookup(doc, dfs.get(0)) : null;
      if (df instanceof PDFDict) {
        info.dw = num(doc, df.get(N('DW')), 1000);
        const W = lookup(doc, df.get(N('W')));
        if (W instanceof PDFArray) {
          const arr = W.asArray().map((x) => lookup(doc, x));
          for (let k = 0; k < arr.length;) {
            const first = arr[k].asNumber();
            if (arr[k + 1] instanceof PDFArray) {
              arr[k + 1].asArray().forEach((w, j) => info.widths.set(first + j, num(doc, w, info.dw)));
              k += 2;
            } else {
              const last = arr[k + 1].asNumber(), w = arr[k + 2].asNumber();
              for (let c = first; c <= last; c++) info.widths.set(c, w);
              k += 3;
            }
          }
        }
        desc = lookup(doc, df.get(N('FontDescriptor')));
      } else info.dw = 1000;
    } else {
      if (subtype === 'Type3') {
        const fm = lookup(doc, f.get(N('FontMatrix')));
        info.scale = fm instanceof PDFArray ? num(doc, fm.get(0), 0.001) : 0.001;
        info.ascent = 0.8; info.descent = -0.2;
      }
      const W = lookup(doc, f.get(N('Widths')));
      const first = num(doc, f.get(N('FirstChar')), 0);
      if (W instanceof PDFArray) W.asArray().forEach((w, j) => info.widths.set(first + j, num(doc, w, 0)));
      desc = lookup(doc, f.get(N('FontDescriptor')));
      // קידוד: רק Differences — לשמות גליפים
      const enc = lookup(doc, f.get(N('Encoding')));
      if (enc instanceof PDFDict) {
        const diffs = lookup(doc, enc.get(N('Differences')));
        if (diffs instanceof PDFArray) {
          info.enc = new Map();
          let code = 0;
          for (const d of diffs.asArray()) {
            const v = lookup(doc, d);
            if (v instanceof PDFNumber) code = v.asNumber();
            else if (v instanceof PDFName) info.enc.set(code++, v.decodeText());
          }
        }
      }
    }
    if (subtype !== 'Type0' && subtype !== 'Type3' && !info.widths.size && !standardFont(info)) {
      info.ok = false; info.reason = 'no-widths';
    }
    if (desc instanceof PDFDict) {
      info.dw = info.dw || num(doc, desc.get(N('MissingWidth')), 0);
      const a = num(doc, desc.get(N('Ascent')), 0), d = num(doc, desc.get(N('Descent')), 0);
      if (subtype !== 'Type3' && a > 0) { info.ascent = a / 1000; info.descent = d < 0 ? d / 1000 : -0.2; }
      const flags = num(doc, desc.get(N('Flags')), 0);
      const weight = num(doc, desc.get(N('FontWeight')), 0);
      if ((flags & (1 << 18)) || weight >= 600) info.bold = true;
    }
    if (/bold|black|heavy|semibold|demi/i.test(info.name)) info.bold = true;
    const tu = f.get(N('ToUnicode'));
    if (tu) {
      try { info.toU = parseToUnicode(streamBytes(doc, tu)); } catch (e) { info.toU = null; }
    }
    return info;
  }

  /** אחד מ-14 הפונטים הסטנדרטיים (בלי Widths בקובץ): רוחב לפי המדדים של pdf-lib */
  const STD_ALIASES = [
    [/^(arial|helvetica)(mt)?$/, 'Helvetica'], [/^(arial|helvetica)(mt)?,?-?bold(mt)?$/, 'Helvetica-Bold'],
    [/^(arial|helvetica)(mt)?,?-?(italic|oblique)(mt)?$/, 'Helvetica-Oblique'], [/^(arial|helvetica)(mt)?,?-?bold(italic|oblique)(mt)?$/, 'Helvetica-BoldOblique'],
    [/^(times(newroman)?(ps)?(mt)?|times-roman)$/, 'Times-Roman'], [/^times(newroman)?(ps)?(mt)?,?-?bold(mt)?$/, 'Times-Bold'],
    [/^times(newroman)?(ps)?(mt)?,?-?italic(mt)?$/, 'Times-Italic'], [/^times(newroman)?(ps)?(mt)?,?-?bolditalic(mt)?$/, 'Times-BoldItalic'],
    [/^courier(new)?(ps)?(mt)?$/, 'Courier'], [/^courier(new)?(ps)?(mt)?,?-?bold(mt)?$/, 'Courier-Bold'],
    [/^courier(new)?(ps)?(mt)?,?-?(italic|oblique)(mt)?$/, 'Courier-Oblique'], [/^courier(new)?(ps)?(mt)?,?-?bold(italic|oblique)(mt)?$/, 'Courier-BoldOblique'],
    [/^symbol$/, 'Symbol'], [/^zapfdingbats$/, 'ZapfDingbats'],
  ];
  function standardFont(info) {
    if (!PDFLib.StandardFontEmbedder) return false;
    const base = info.name.replace(/^[A-Z]{6}\+/, '').replace(/\s/g, '').toLowerCase();
    const hit = STD_ALIASES.find(([re]) => re.test(base));
    if (!hit) return false;
    let emb;
    try { emb = PDFLib.StandardFontEmbedder.for(hit[1]); } catch (e) { return false; }
    const byCode = new Map();
    for (const [cp, v] of Object.entries(emb.encoding.unicodeMappings)) {
      if (!byCode.has(v[0])) byCode.set(v[0], { name: v[1], u: String.fromCodePoint(+cp) });
    }
    for (let code = 0; code < 256; code++) {
      const name = (info.enc && info.enc.get(code)) || (byCode.get(code) || {}).name;
      if (!name) continue;
      try { info.widths.set(code, emb.font.getWidthOfGlyph(name) || 0); } catch (e) { /* גליף לא קיים */ }
    }
    info.stdCodes = byCode;
    if (/bold/i.test(hit[1])) info.bold = true;
    return true;
  }

  function codesOf(info, bytes) {
    const out = [];
    if (info.bytes === 2) for (let k = 0; k + 1 < bytes.length; k += 2) out.push({ code: (bytes[k] << 8) | bytes[k + 1], raw: bytes.subarray(k, k + 2) });
    else for (let k = 0; k < bytes.length; k++) out.push({ code: bytes[k], raw: bytes.subarray(k, k + 1) });
    return out;
  }

  function unicodeOf(info, code) {
    const hex = code.toString(16).padStart(info.bytes * 2, '0');
    if (info.toU && info.toU.has(hex)) return info.toU.get(hex);
    if (info.enc && info.enc.has(code)) {
      const u = glyphNameToUnicode(info.enc.get(code));
      if (u != null) return u;
    }
    if (info.stdCodes && info.stdCodes.has(code)) return info.stdCodes.get(code).u;
    if (info.bytes === 1 && code >= 32 && code < 127 && !info.toU) return String.fromCharCode(code);
    return '�';
  }

  /* ---------- פירוש העמוד ---------- */

  function getResources(doc, dict) {
    const r = lookup(doc, dict.get(N('Resources')));
    return r instanceof PDFDict ? r : null;
  }

  function pageResources(doc, page) {
    // Resources יכול להיות מורש מעץ העמודים
    let node = page.node;
    while (node) {
      const r = lookup(doc, node.get(N('Resources')));
      if (r instanceof PDFDict) return r;
      node = lookup(doc, node.get(N('Parent')));
    }
    return null;
  }

  function pageContentBytes(doc, page) {
    const c = lookup(doc, page.node.get(N('Contents')));
    if (!c) return new Uint8Array(0);
    const parts = c instanceof PDFArray ? c.asArray().map((r) => streamBytes(doc, r)) : [streamBytes(doc, c)];
    const total = parts.reduce((s, p) => s + p.length + 1, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; out[o++] = 10; }
    return out;
  }

  /**
   * מנתח עמוד ומחזיר את כל הגליפים במרחב המשתמש של העמוד.
   * כל "צומת" הוא זרם: העמוד עצמו, או הפעלה מסוימת של Form XObject.
   */
  function analyzePage(doc, page) {
    const fontCache = new Map();
    const glyphs = [];
    const nodes = [];
    const problems = new Set();

    function run(node, bytes, resources, ctm0, depth) {
      node.ops = parseOps(bytes);
      node.bytes = bytes;
      node.resources = resources;
      nodes.push(node);
      let gs = { ctm: ctm0, Tc: 0, Tw: 0, Th: 1, TL: 0, font: null, fontRef: null, size: 0, rise: 0, Tr: 0, fill: [0, 0, 0] };
      const stack = [];
      let Tm = [1, 0, 0, 1, 0, 0], Tlm = [1, 0, 0, 1, 0, 0];
      const fonts = resources && lookup(doc, resources.get(N('Font')));
      const xobjs = resources && lookup(doc, resources.get(N('XObject')));

      const showString = (opIdx, bytesStr, glyphStart) => {
        const info = gs.font;
        if (!info) return glyphStart;
        if (!info.ok) problems.add(info.reason);
        let gi = glyphStart;
        for (const { code, raw } of codesOf(info, bytesStr)) {
          const w0 = (info.widths.has(code) ? info.widths.get(code) : info.dw) * info.scale;
          const isSpace = raw.length === 1 && code === 32;
          const tx = (w0 * gs.size + gs.Tc + (isSpace ? gs.Tw : 0)) * gs.Th;
          const trm = mul([gs.size * gs.Th, 0, 0, gs.size, 0, gs.rise], mul(Tm, gs.ctm));
          const [x0, y0] = apply(trm, 0, 0);
          const corners = [[0, info.descent], [w0, info.descent], [w0, info.ascent], [0, info.ascent]].map(([u, v]) => apply(trm, u, v));
          const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
          glyphs.push({
            node: node.id, op: opIdx, gi, code, raw,
            u: unicodeOf(info, code),
            x: x0, y: y0,
            adv: tx, w0,
            bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
            // כיוון קו הבסיס וגובה הגליף בפועל
            angle: Math.atan2(trm[1], trm[0]),
            size: Math.hypot(trm[2], trm[3]),
            advUser: Math.hypot(...[trm[0], trm[1]]) * w0,
            font: info, fontRef: gs.fontRef, fill: gs.fill, Tr: gs.Tr,
            gsize: gs.size, Tc: gs.Tc, Tw: isSpace ? gs.Tw : 0, Th: gs.Th,
          });
          gi++;
          Tm = mul([1, 0, 0, 1, tx, 0], Tm);
        }
        return gi;
      };

      node.ops.forEach((o, idx) => {
        const a = o.args;
        switch (o.op) {
          case 'q': stack.push({ ...gs }); break;
          case 'Q': if (stack.length) gs = stack.pop(); break;
          case 'cm': if (a.length === 6) gs.ctm = mul(a, gs.ctm); break;
          case 'BT': Tm = [1, 0, 0, 1, 0, 0]; Tlm = Tm; break;
          case 'Tc': gs.Tc = a[0] || 0; break;
          case 'Tw': gs.Tw = a[0] || 0; break;
          case 'Tz': gs.Th = (a[0] == null ? 100 : a[0]) / 100; break;
          case 'TL': gs.TL = a[0] || 0; break;
          case 'Ts': gs.rise = a[0] || 0; break;
          case 'Tr': gs.Tr = a[0] || 0; break;
          case 'Tf': {
            const ref = fonts && a[0] && fonts.get(N(a[0].name));
            gs.fontRef = a[0] && a[0].name;
            gs.font = ref ? fontInfo(doc, ref, fontCache) : null;
            if (!gs.font) problems.add('font-missing');
            gs.size = a[1] || 0;
            break;
          }
          case 'Td': Tlm = mul([1, 0, 0, 1, a[0], a[1]], Tlm); Tm = Tlm; break;
          case 'TD': gs.TL = -a[1]; Tlm = mul([1, 0, 0, 1, a[0], a[1]], Tlm); Tm = Tlm; break;
          case 'Tm': Tlm = a.slice(0, 6); Tm = Tlm; break;
          case 'T*': Tlm = mul([1, 0, 0, 1, 0, -gs.TL], Tlm); Tm = Tlm; break;
          case 'g': gs.fill = [a[0], a[0], a[0]]; break;
          case 'rg': gs.fill = a.slice(0, 3); break;
          case 'k': { const [c, m, y, k] = a; gs.fill = [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)]; break; }
          case 'sc': case 'scn': {
            const nums = a.filter((v) => typeof v === 'number');
            if (nums.length === 1) gs.fill = [nums[0], nums[0], nums[0]];
            else if (nums.length === 3) gs.fill = nums;
            else if (nums.length === 4) { const [c, m, y, k] = nums; gs.fill = [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)]; }
            break;
          }
          case 'Tj': if (a[0] && a[0].str) showString(idx, a[0].str, 0); break;
          case "'":
            Tlm = mul([1, 0, 0, 1, 0, -gs.TL], Tlm); Tm = Tlm;
            if (a[0] && a[0].str) showString(idx, a[0].str, 0);
            break;
          case '"':
            gs.Tw = a[0] || 0; gs.Tc = a[1] || 0;
            Tlm = mul([1, 0, 0, 1, 0, -gs.TL], Tlm); Tm = Tlm;
            if (a[2] && a[2].str) showString(idx, a[2].str, 0);
            break;
          case 'TJ': {
            let gi = 0;
            for (const el of a[0] || []) {
              if (typeof el === 'number') Tm = mul([1, 0, 0, 1, (-el / 1000) * gs.size * gs.Th, 0], Tm);
              else if (el && el.str) gi = showString(idx, el.str, gi);
            }
            break;
          }
          case 'Do': {
            if (depth > 8 || !xobjs || !a[0]) break;
            const ref = xobjs.get(N(a[0].name));
            const xo = lookup(doc, ref);
            if (!(xo instanceof PDFStream)) break;
            if (nameOf(doc, xo.dict.get(N('Subtype'))) !== 'Form') break;
            const mArr = lookup(doc, xo.dict.get(N('Matrix')));
            const m = mArr instanceof PDFArray ? mArr.asArray().map((v) => num(doc, v, 0)) : [1, 0, 0, 1, 0, 0];
            const child = { id: nodes.length, kind: 'form', parent: node.id, doOp: idx, name: a[0].name, ref, xo };
            run(child, streamBytes(doc, xo), getResources(doc, xo.dict) || resources, mul(m, gs.ctm), depth + 1);
            break;
          }
          default: break;
        }
      });
    }

    const root = { id: 0, kind: 'page' };
    run(root, pageContentBytes(doc, page), pageResources(doc, page), [1, 0, 0, 1, 0, 0], 0);
    return { glyphs, nodes, problems: [...problems] };
  }

  /* ---------- שורות ---------- */

  const MARK_RE = /\p{M}/u;

  /**
   * קיבוץ גליפים לשורות. כל שורה: { glyphs, visual, box:[x0,y0,x1,y1], origin, angle, size, bold, color, ok }
   * visual — הטקסט כפי שהוא מצויר משמאל לימין (חזותי). ההמרה ללוגי נעשית ב-hebrew.js.
   */
  function groupLines(glyphs) {
    const usable = glyphs.filter((g) => g.Tr !== 3 && g.Tr !== 7 && g.size > 0.5);
    // מסדרים לפי זווית וקו בסיס, בקואורדינטות מסובבות לכיוון השורה
    const items = usable.map((g) => {
      const c = Math.cos(-g.angle), s = Math.sin(-g.angle);
      const u = g.x * c - g.y * s, v = g.x * s + g.y * c;
      return { g, u, v, ang: Math.round(g.angle * 100) / 100 };
    });
    // סימני ניקוד מוצמדים לאות שהם יושבים עליה
    const base = items.filter((it) => !(MARK_RE.test(it.g.u) && it.g.u.length <= 2 && it.g.adv < it.g.size * 0.05));
    const baseSet = new Set(base);
    const marks = items.filter((it) => !baseSet.has(it));
    // שלב א: קיבוץ לפי זווית וקו בסיס בלבד
    base.sort((p, q) => p.ang - q.ang || q.v - p.v);
    const rows = [];
    for (const it of base) {
      const last = rows[rows.length - 1];
      if (last && last.ang === it.ang && Math.abs(last.v - it.v) <= it.g.size * 0.3) last.items.push(it);
      else rows.push({ ang: it.ang, v: it.v, items: [it] });
    }
    // שלב ב: בתוך כל קו בסיס — פיצול לטורים לפי פער אופקי גדול
    const lines = [];
    for (const r of rows) {
      r.items.sort((p, q) => p.u - q.u);
      let cur = null;
      for (const it of r.items) {
        if (cur && it.u - cur.u1 < it.g.size * 3) {
          cur.items.push(it);
          cur.u1 = Math.max(cur.u1, it.u + it.g.advUser);
        } else {
          cur = { ang: r.ang, v: it.v, u0: it.u, u1: it.u + it.g.advUser, items: [it] };
          lines.push(cur);
        }
      }
    }
    // סימן ניקוד שייך לאות שצוירה ממש לפניו בזרם (כך כותבים כל היוצרים המוכרים).
    // אם האות הזו רחוקה — לאות הקרובה ביותר על אותה שורה.
    const lineOf = new Map();
    for (const L of lines) for (const it of L.items) lineOf.set(it.g, { L, it });
    const order = new Map(usable.map((g, k) => [g, k]));
    for (const m of marks) {
      let target = null;
      for (let k = order.get(m.g) - 1; k >= 0 && k >= order.get(m.g) - 6; k--) {
        const hit = lineOf.get(usable[k]);
        if (!hit) continue; // סימן נוסף על אותה אות
        const near = Math.abs(hit.it.u + hit.it.g.advUser / 2 - m.u) < hit.it.g.size;
        if (near) target = hit;
        break;
      }
      if (!target) {
        let bd = Infinity;
        for (const L of lines) {
          if (L.ang !== m.ang || Math.abs(L.v - m.v) > m.g.size) continue;
          for (const it of L.items) {
            const d = Math.abs(it.u + it.g.advUser / 2 - m.u);
            if (d < bd) { bd = d; target = { L, it }; }
          }
        }
      }
      if (target) (target.it.marks = target.it.marks || []).push(m);
    }
    return lines.map((L) => {
      L.items.sort((p, q) => p.u - q.u);
      let visual = '';
      let prevEnd = null;
      const all = [];
      for (const it of L.items) {
        const sz = it.g.size;
        if (prevEnd != null && it.u - prevEnd > sz * 0.2 && !/\s$/.test(visual) && !/^\s/.test(it.g.u)) visual += ' ';
        visual += it.g.u;
        // ניקוד: בסדר חזותי הסימן בא אחרי האות (hebrew.js שומר מקבצים)
        if (it.marks) for (const m of it.marks) { visual += m.g.u; all.push(m.g); }
        all.push(it.g);
        prevEnd = Math.max(prevEnd == null ? -Infinity : prevEnd, it.u + it.g.advUser);
      }
      visual = visual.replace(/\s+$/, '').replace(/^\s+/, '');
      const bb = [Infinity, Infinity, -Infinity, -Infinity];
      for (const g of all) {
        bb[0] = Math.min(bb[0], g.bbox[0]); bb[1] = Math.min(bb[1], g.bbox[1]);
        bb[2] = Math.max(bb[2], g.bbox[2]); bb[3] = Math.max(bb[3], g.bbox[3]);
      }
      const first = L.items[0].g;
      const sizes = L.items.map((it) => it.g.size).sort((a, b) => a - b);
      const size = sizes[Math.floor(sizes.length / 2)];
      // הצבע והמשקל הנפוצים בשורה
      const boldCount = L.items.filter((it) => it.g.font.bold).length;
      const fillCount = new Map();
      for (const it of L.items) { const k = it.g.fill.map((v) => (+v).toFixed(3)).join(','); fillCount.set(k, (fillCount.get(k) || 0) + 1); }
      const fill = [...fillCount.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
      const ok = all.every((g) => g.font.ok) && !/�|[-]/.test(visual) && visual.trim().length > 0;
      // נקודת עיגון: תחילת השורה (שמאל) על קו הבסיס
      const c = Math.cos(L.ang), s = Math.sin(L.ang);
      const origin = [L.u0 * c - L.v * s, L.u0 * s + L.v * c];
      return {
        glyphs: all, visual, box: bb, origin, angle: L.ang, width: L.u1 - L.u0, size,
        bold: boldCount > L.items.length / 2, color: fill, ok,
        fontName: first.font.name,
      };
    });
  }

  /* ---------- טקסט לוגי ---------- */

  const PAIRS = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' };

  /** האם הסוגריים מאוזנים (כל סוגר נפתח לפני שנסגר) */
  function balanced(s) {
    const st = [];
    for (const ch of s) {
      if ('([{'.includes(ch)) st.push(ch);
      else if (')]}'.includes(ch)) { if (!st.length || PAIRS[st.pop()] !== ch) return false; }
    }
    return true; // סוגר פתוח בלי סגירה הוא תקין (שורה שנשברה באמצע סוגריים)
  }

  /**
   * הטקסט הלוגי של שורה (כפי שמקלידים אותו).
   * יש יוצרים (LibreOffice) שכותבים סוגר "(" ומציירים אותו הפוך בעצמם — ואז אחרי
   * ההמרה הסוגריים יוצאים הפוכים. מזהים את זה לפי סוגריים לא מאוזנים ומתקנים.
   */
  function lineText(line) {
    // ליגטורות לטיניות (ﬁ, ﬂ) → אותיות רגילות, כדי שאפשר יהיה לערוך אותן
    const visual = line.visual.replace(/[\uFB00-\uFB06]/g, (c) => c.normalize('NFKC'));
    const dir = H.hasRTL(visual) ? 'rtl' : 'ltr';
    let logical = H.toLogical(visual, dir);
    if (!balanced(logical)) {
      const swapped = logical.replace(/[()[\]{}]/g, (c) => PAIRS[c]);
      if (balanced(swapped)) logical = swapped;
    }
    return { text: logical, dir };
  }

  /* ---------- מחיקה ---------- */

  const hex = (bytes) => '<' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') + '>';
  const fmt = (v) => {
    const r = Math.round(v * 1000) / 1000;
    return (Object.is(r, -0) ? 0 : r).toString();
  };

  function serialize(v) {
    if (typeof v === 'number') return fmt(v);
    if (v && v.str) return hex(v.str);
    if (Array.isArray(v)) return '[' + v.map(serialize).join(' ') + ']';
    if (v && v.name != null) return '/' + v.name;
    return String(v);
  }

  /**
   * בונה TJ חדש שבו הגליפים שנמחקו מוחלפים בהיסט, כך ששאר הגליפים לא זזים.
   * elems: רשימת אלמנטים מקוריים (מחרוזות ומספרים), remove: Set של אינדקסי גליפים.
   */
  function rebuildTJ(elems, glyphsOfOp, remove, info) {
    const out = [];
    let gi = 0;
    const pushNum = (n) => {
      if (typeof out[out.length - 1] === 'number') out[out.length - 1] += n;
      else out.push(n);
    };
    for (const el of elems) {
      if (typeof el === 'number') { pushNum(el); continue; }
      if (!el || !el.str) continue;
      let cur = [];
      for (const { raw } of codesOf(info, el.str)) {
        const g = glyphsOfOp.get(gi);
        if (remove.has(gi) && g) {
          if (cur.length) { out.push({ str: Uint8Array.from(cur) }); cur = []; }
          // היסט שקול לרוחב הגליף כולל ריווח תווים/מילים
          const tx = g.w0 * g.gsize + g.Tc + g.Tw;
          if (g.gsize) pushNum(-(tx * 1000) / g.gsize);
        } else cur.push(...raw);
        gi++;
      }
      if (cur.length) out.push({ str: Uint8Array.from(cur) });
    }
    return out.map((v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v));
  }

  function encodeLatin1(s) {
    const out = new Uint8Array(s.length);
    for (let k = 0; k < s.length; k++) out[k] = s.charCodeAt(k) & 255;
    return out;
  }

  function spliceOps(bytes, replacements) {
    // replacements: [{start,end,text}] ממוינים
    replacements.sort((a, b) => a.start - b.start);
    const parts = [];
    let pos = 0;
    for (const r of replacements) {
      parts.push(bytes.subarray(pos, r.start), encodeLatin1(r.text));
      pos = r.end;
    }
    parts.push(bytes.subarray(pos));
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  let editSeq = 0;

  /**
   * מחיקת גליפים מהעמוד. glyphs: הגליפים מ-analyzePage שצריך למחוק.
   * Form XObject שמכיל גליף כזה משוכפל עם שם חדש (רק להפעלה הזו), כך שעמודים
   * אחרים או הפעלות אחרות של אותו אובייקט לא נפגעים.
   */
  function removeGlyphs(doc, page, analysis, toRemove) {
    const { nodes } = analysis;
    const byNode = new Map(); // nodeId → Map(op → Set(gi))
    for (const g of toRemove) {
      if (!byNode.has(g.node)) byNode.set(g.node, new Map());
      const m = byNode.get(g.node);
      if (!m.has(g.op)) m.set(g.op, new Set());
      m.get(g.op).add(g.gi);
    }
    const glyphIndex = new Map(); // `${node}:${op}` → Map(gi → glyph)
    for (const g of analysis.glyphs) {
      const k = g.node + ':' + g.op;
      if (!glyphIndex.has(k)) glyphIndex.set(k, new Map());
      glyphIndex.get(k).set(g.gi, g);
    }
    const reps = new Map(); // nodeId → [{start,end,text}]
    const addRep = (id, r) => { if (!reps.has(id)) reps.set(id, []); reps.get(id).push(r); };

    for (const [nodeId, opsMap] of byNode) {
      const node = nodes[nodeId];
      for (const [opIdx, set] of opsMap) {
        const o = node.ops[opIdx];
        const gmap = glyphIndex.get(nodeId + ':' + opIdx);
        const info = gmap.values().next().value.font;
        let elems, prefix = '';
        if (o.op === 'TJ') elems = o.args[0];
        else if (o.op === 'Tj') elems = [o.args[0]];
        else if (o.op === "'") { elems = [o.args[0]]; prefix = 'T* '; }
        else if (o.op === '"') { elems = [o.args[2]]; prefix = `${fmt(o.args[0])} Tw ${fmt(o.args[1])} Tc T* `; }
        else continue;
        const tj = rebuildTJ(elems, gmap, set, info);
        addRep(nodeId, { start: o.start, end: o.end, text: prefix + serialize(tj) + ' TJ' });
      }
    }

    // צמודים שהשתנו → כל ההורים שלהם צריכים להצביע לעותק החדש
    const changed = new Set(reps.keys());
    for (const id of [...changed]) {
      let n = nodes[id];
      while (n.kind === 'form') { changed.add(n.parent); n = nodes[n.parent]; }
    }
    // מעבדים מהעמוק אל השורש
    const order = [...changed].sort((a, b) => b - a);
    const newNames = new Map(); // nodeId → { name, ref }
    for (const id of order) {
      const node = nodes[id];
      // הפניות ל-XObject של ילדים שהשתנו
      for (const cid of changed) {
        const child = nodes[cid];
        if (child.kind === 'form' && child.parent === id) {
          const nn = newNames.get(cid);
          const o = node.ops[child.doOp];
          addRep(id, { start: o.start, end: o.end, text: `/${nn.name} Do` });
        }
      }
      const bytes = spliceOps(node.bytes, reps.get(id) || []);
      // משאבים: מוסיפים את שמות הילדים החדשים
      const kids = [...changed].filter((cid) => nodes[cid].kind === 'form' && nodes[cid].parent === id);
      let resources = node.resources;
      if (kids.length) {
        resources = resources ? resources.clone() : doc.context.obj({});
        const xo = lookup(doc, resources.get(N('XObject')));
        const xoNew = xo instanceof PDFDict ? xo.clone() : doc.context.obj({});
        for (const cid of kids) { const nn = newNames.get(cid); xoNew.set(N(nn.name), nn.ref); }
        resources.set(N('XObject'), xoNew);
      }
      if (node.kind === 'page') {
        const stream = doc.context.flateStream(bytes);
        page.node.set(N('Contents'), doc.context.register(stream));
        if (kids.length) page.node.set(N('Resources'), resources);
      } else {
        const dict = node.xo.dict.clone();
        for (const k of ['Length', 'Filter', 'DecodeParms', 'DL']) dict.delete(N(k));
        if (kids.length) dict.set(N('Resources'), resources);
        else if (!dict.get(N('Resources')) && node.resources) dict.set(N('Resources'), node.resources);
        const stream = doc.context.flateStream(bytes, Object.fromEntries([...dict.entries()].map(([k, v]) => [k.decodeText(), v])));
        const ref = doc.context.register(stream);
        newNames.set(id, { name: `EPedit${++editSeq}_${id}`, ref });
      }
    }
    return { removed: toRemove.length };
  }

  /** בחירת גליפים לפי מלבנים במרחב המשתמש: גליף נבחר אם מרכזו בתוך מלבן */
  function glyphsInBoxes(glyphs, boxes) {
    return glyphs.filter((g) => {
      const cx = (g.bbox[0] + g.bbox[2]) / 2, cy = (g.bbox[1] + g.bbox[3]) / 2;
      return boxes.some((b) => cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3]);
    });
  }

  return { parseOps, analyzePage, groupLines, lineText, removeGlyphs, glyphsInBoxes, parseToUnicode };
});
