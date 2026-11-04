// הגופנים שמותקנים במחשב — לעריכת טקסט בכל גופן, לא רק בשניים שמגיעים עם התוכנה.
// סורק את תיקיות הגופנים של המערכת והמשתמש, קורא מכל קובץ את שם המשפחה, המשקל והאם יש בו עברית,
// ומקבץ לפי משפחה: קובץ רגיל וקובץ מודגש. התוצאה נשמרת במטמון (לפי נתיב, גודל ותאריך), כך שרק הסריקה הראשונה איטית.
// קובצי TTC (כמה גופנים בקובץ אחד) לא נכללים — אי אפשר להטמיע אותם ב-PDF כמו שהם.
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const MAX_SIZE = 40 * 1024 * 1024; // גופנים ענקיים (סינית וכו') — מדלגים

function fontDirs() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const win = process.env.WINDIR || 'C:\\Windows';
    return [path.join(win, 'Fonts'), process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts')].filter(Boolean);
  }
  if (process.platform === 'darwin') return ['/System/Library/Fonts', '/System/Library/Fonts/Supplemental', '/Library/Fonts', path.join(home, 'Library', 'Fonts')];
  return ['/usr/share/fonts', '/usr/local/share/fonts', path.join(home, '.fonts'), path.join(home, '.local', 'share', 'fonts')];
}

async function walk(dir, out, depth = 0) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth < 4) await walk(p, out, depth + 1); } else if (/\.(ttf|otf)$/i.test(e.name)) out.push(p);
  }
}

/** פרטי קובץ גופן אחד, או null אם הוא לא קריא */
function describe(fontkit, bytes) {
  try {
    const f = fontkit.create(bytes);
    if (!f || f.fonts) return null; // אוסף
    const rec = (f.name && f.name.records) || {};
    const pick = (r) => r && (r.en || r['en-US'] || Object.values(r)[0]);
    const family = String(pick(rec.preferredFamily) || f.familyName || '').trim();
    if (!family || family.startsWith('.')) return null; // גופני מערכת נסתרים (macOS)
    const os2 = f['OS/2'] || {};
    const sel = os2.fsSelection || {};
    return {
      family,
      weight: os2.usWeightClass || (sel.bold ? 700 : 400),
      italic: !!(sel.italic || sel.oblique || f.italicAngle),
      hebrew: f.hasGlyphForCodePoint(0x05D0) && f.hasGlyphForCodePoint(0x05EA),
      latin: f.hasGlyphForCodePoint(0x61),
    };
  } catch {
    return null;
  }
}

let listing = null;

/**
 * רשימת המשפחות: [{ family, hebrew, regular: נתיב, bold: נתיב|null }], ממוינת לפי שם.
 * cacheFile — קובץ JSON למטמון.
 */
function list(cacheFile) {
  if (!listing) listing = scan(cacheFile).catch((e) => { listing = null; throw e; });
  return listing;
}

async function scan(cacheFile) {
  const fontkit = require('@pdf-lib/fontkit');
  let cache = {};
  try { cache = JSON.parse(await fs.readFile(cacheFile, 'utf8')); } catch { /* אין עדיין */ }
  const files = [];
  for (const d of fontDirs()) await walk(d, files);
  const next = {};
  const faces = [];
  for (const file of files) {
    let st;
    try { st = await fs.stat(file); } catch { continue; }
    if (st.size > MAX_SIZE) continue;
    const stamp = `${st.size}:${Math.round(st.mtimeMs)}`;
    let info = cache[file] && cache[file].stamp === stamp ? cache[file].info : undefined;
    if (info === undefined) {
      try { info = describe(fontkit, await fs.readFile(file)); } catch { info = null; }
    }
    next[file] = { stamp, info };
    if (info) faces.push({ ...info, file });
  }
  try { await fs.writeFile(cacheFile, JSON.stringify(next)); } catch { /* לא קריטי */ }

  const byFamily = new Map();
  for (const f of faces) {
    if (!byFamily.has(f.family)) byFamily.set(f.family, []);
    byFamily.get(f.family).push(f);
  }
  const out = [];
  for (const [family, list] of byFamily) {
    const upright = list.filter((f) => !f.italic);
    const pool = upright.length ? upright : list;
    const near = (w, cands) => cands.slice().sort((a, b) => Math.abs(a.weight - w) - Math.abs(b.weight - w))[0];
    const regular = near(400, pool);
    const bolds = pool.filter((f) => f.weight >= 600 && f !== regular);
    const bold = bolds.length ? near(700, bolds) : null;
    out.push({ family, hebrew: regular.hebrew, regular: regular.file, bold: bold ? bold.file : null });
  }
  out.sort((a, b) => a.family.localeCompare(b.family, 'he'));
  return out;
}

/** הקבצים של משפחה (רק כאלה שהופיעו בסריקה — לא קוראים נתיב שרירותי מהממשק) */
async function read(cacheFile, family, bold) {
  const all = await list(cacheFile);
  const f = all.find((x) => x.family === family);
  if (!f) throw new Error(`הגופן "${family}" לא נמצא במחשב`);
  const file = bold && f.bold ? f.bold : f.regular;
  return { bytes: new Uint8Array(await fs.readFile(file)), bold: !!(bold && f.bold) };
}

module.exports = { list, read, describe };
