// שילוב ב-Windows: קליק ימני על PDF, תמונות ממוזערות בסייר, "פתח באמצעות".
// הכל נרשם תחת HKCU (המשתמש הנוכחי בלבד) — לא נדרשות הרשאות מנהל.
const { app, shell } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs/promises');

const ROOT = 'HKCU\\Software\\Classes';
const VERBS = [
  { key: 'PdfIvrit.Open', label: 'פתיחה באיתןPDF', arg: '--open' },
  { key: 'PdfIvrit.Merge', label: 'מיזוג באיתןPDF', arg: '--merge' },
  { key: 'PdfIvrit.Split', label: 'פיצול באיתןPDF', arg: '--split' },
];
// קליק ימני על תמונות וקובצי Word: המרה ל-PDF
const TOPDF_VERB = { key: 'PdfIvrit.ToPdf', label: 'המרה ל-PDF באיתןPDF', arg: '--topdf' };
const TOPDF_EXTS = ['.jpg', '.jpeg', '.png', '.docx', '.doc', '.rtf', '.odt'];
const THUMB_CLSID = '{6B0C5A9E-3F1D-4E8B-9A7C-2D5E1F4A8B30}';
const THUMB_IID = '{e357fccd-a995-4576-b01f-234630154e96}';
const PROGID = 'PdfIvrit.Document';

function reg(args) {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true }, (err, stdout) => resolve({ ok: !err, out: stdout || '' }));
  });
}
const add = (key, name, value, type = 'REG_SZ') =>
  reg(['add', key, ...(name === null ? ['/ve'] : ['/v', name]), '/t', type, '/d', value, '/f']);
const del = (key) => reg(['delete', key, '/f']);
const query = async (key, name) => {
  const r = await reg(['query', key, ...(name === null ? ['/ve'] : name ? ['/v', name] : [])]);
  return r.ok ? r.out : null;
};

/** תיקיית הנתונים הקבועה של התוכנה (רכיבי מערכת, עותק נייד) */
function dataDir() {
  return path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'EitanPDF');
}

/**
 * גרסת Microsoft Store (חבילת MSIX): Windows מנהל את השילוב בעצמו לפי המניפסט —
 * כתיבה ל-HKCU\Software\Classes מתוך חבילה לא מגיעה לסייר, ואין לה משמעות אחרי עדכון מהחנות.
 */
const isStore = () => !!process.windowsStore;
const STORE_NOTE = 'בגרסה מחנות Microsoft, ‏Windows מנהל את השילוב בעצמו: איתןPDF מופיע ב"פתח באמצעות" של קובצי PDF. '
  + 'כדי שכל PDF ייפתח בה: הגדרות Windows ← אפליקציות ← אפליקציות ברירת מחדל ← איתןPDF.';

/** האם התוכנה מותקנת (Installer) ולא רצה כקובץ נייד */
const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_FILE;

/** מוודא שיש לתוכנה מיקום קבוע ומחזיר את הנתיב לקובץ ההפעלה */
async function ensureInstalled() {
  if (!app.isPackaged) return { exe: process.execPath, args: [app.getAppPath()], dir: dataDir() };
  if (!isPortable()) return { exe: process.execPath, args: [], dir: path.dirname(process.execPath) };
  // גרסה ניידת: מעתיקים לתיקייה קבועה כדי שהשילוב ימשיך לעבוד גם אם הקובץ שהורד יימחק
  const dir = path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'Programs', 'EitanPDF');
  const target = path.join(dir, 'EitanPDF.exe');
  const src = process.env.PORTABLE_EXECUTABLE_FILE;
  await fs.mkdir(dir, { recursive: true });
  if (path.resolve(src).toLowerCase() !== path.resolve(target).toLowerCase()) {
    let need = true;
    try {
      const [a, b] = await Promise.all([fs.stat(src), fs.stat(target)]);
      need = a.size !== b.size || a.mtimeMs > b.mtimeMs;
    } catch (e) { /* עדיין לא הועתק */ }
    if (need) await fs.copyFile(src, target);
  }
  return { exe: target, args: [], dir };
}

/**
 * רכיב התמונות הממוזערות מועתק לתיקייה לפי גרסה. הסייר מחזיק את ה-DLL נעול,
 * כך שעדכון לעולם לא דורס את הקובץ שבשימוש — הוא כותב גרסה חדשה ליד ורושם אותה.
 */
async function ensureNative() {
  const src = path.join(process.resourcesPath, 'native', process.arch === 'arm64' ? 'thumbs-arm64' : 'thumbs');
  const base = path.join(dataDir(), 'shell');
  const dst = path.join(base, app.getVersion());
  await fs.mkdir(dst, { recursive: true });
  for (const f of await fs.readdir(src)) {
    try { await fs.copyFile(path.join(src, f), path.join(dst, f)); } catch (e) { /* כבר קיים ונעול — אותה גרסה */ }
  }
  // ניקוי גרסאות ישנות שכבר לא בשימוש (מה שנעול נשאר לפעם הבאה)
  try {
    for (const v of await fs.readdir(base)) if (v !== app.getVersion()) await fs.rm(path.join(base, v), { recursive: true, force: true }).catch(() => {});
  } catch (e) { /* לא קריטי */ }
  return path.join(dst, 'PdfIvritThumbs.dll');
}

function cmdLine(inst, arg) {
  const pre = inst.args.map((a) => `"${a}"`).join(' ');
  return `"${inst.exe}" ${pre ? pre + ' ' : ''}${arg} "%1"`;
}

async function status() {
  // לבדיקות ויזואליות בלבד מחוץ ל-Windows
  if (process.env.PDFIVRIT_FAKE_WIN) return { supported: true, context: true, thumbs: false, default: false, installedPath: null };
  if (process.platform !== 'win32') return { supported: false, error: 'האפשרויות האלה זמינות רק ב-Windows.' };
  if (isStore()) return { supported: false, error: STORE_NOTE };
  const ctx = await query(`${ROOT}\\SystemFileAssociations\\.pdf\\shell\\${VERBS[1].key}\\command`, null);
  const th = await query(`${ROOT}\\.pdf\\ShellEx\\${THUMB_IID}`, null);
  const def = await query(`${ROOT}\\.pdf\\OpenWithProgids`, PROGID);
  return {
    supported: true,
    context: !!ctx,
    thumbs: !!(th && th.toUpperCase().includes(THUMB_CLSID)),
    default: !!def,
    installedPath: isPortable() && (ctx || th || def) ? path.join(process.env.LOCALAPPDATA || '', 'Programs', 'EitanPDF') : null,
  };
}

async function setContext(on) {
  for (const v of VERBS) await del(`${ROOT}\\SystemFileAssociations\\.pdf\\shell\\${v.key}`);
  for (const ext of TOPDF_EXTS) await del(`${ROOT}\\SystemFileAssociations\\${ext}\\shell\\${TOPDF_VERB.key}`);
  if (!on) return {};
  const inst = await ensureInstalled();
  for (const v of VERBS) {
    const k = `${ROOT}\\SystemFileAssociations\\.pdf\\shell\\${v.key}`;
    await add(k, null, v.label);
    await add(k, 'MUIVerb', v.label);
    await add(k, 'Icon', `"${inst.exe}",0`);
    // Player: מאפשר לבחור כמה קבצים; כל קובץ מגיע לתוכנה שכבר פתוחה ונאסף למסמך אחד
    await add(k, 'MultiSelectModel', 'Player');
    const r = await add(`${k}\\command`, null, cmdLine(inst, v.arg));
    if (!r.ok) return { error: 'לא הצלחנו לרשום את התפריט ברישום של Windows.' };
  }
  // תמונות וקובצי Word: "המרה ל-PDF באיתןPDF" (כמה קבצים יחד — תמונות מתאחדות לקובץ אחד)
  for (const ext of TOPDF_EXTS) {
    const k = `${ROOT}\\SystemFileAssociations\\${ext}\\shell\\${TOPDF_VERB.key}`;
    await add(k, null, TOPDF_VERB.label);
    await add(k, 'MUIVerb', TOPDF_VERB.label);
    await add(k, 'Icon', `"${inst.exe}",0`);
    await add(k, 'MultiSelectModel', 'Player');
    await add(`${k}\\command`, null, cmdLine(inst, TOPDF_VERB.arg));
  }
  return {};
}

async function setThumbs(on) {
  const ext = `${ROOT}\\.pdf\\ShellEx\\${THUMB_IID}`;
  const sfa = `${ROOT}\\SystemFileAssociations\\.pdf\\ShellEx\\${THUMB_IID}`;
  if (!on) {
    for (const k of [ext, sfa]) {
      const v = await query(k, null);
      if (v && v.toUpperCase().includes(THUMB_CLSID)) await del(k);
    }
    await del(`${ROOT}\\CLSID\\${THUMB_CLSID}`);
    return {};
  }
  let dll;
  try { dll = await ensureNative(); await fs.access(dll); } catch (e) { return { error: 'רכיב התמונות הממוזערות חסר בגרסה הזו של התוכנה.' }; }
  const clsid = `${ROOT}\\CLSID\\${THUMB_CLSID}`;
  await add(clsid, null, 'PDF Ivrit Thumbnail Provider');
  await add(`${clsid}\\InprocServer32`, null, dll);
  await add(`${clsid}\\InprocServer32`, 'ThreadingModel', 'Apartment');
  await add(ext, null, THUMB_CLSID);
  const r = await add(sfa, null, THUMB_CLSID);
  return r.ok ? {} : { error: 'לא הצלחנו לרשום את רכיב התמונות הממוזערות.' };
}

async function setDefault(on, opts = {}) {
  const pk = `${ROOT}\\${PROGID}`;
  if (!on) {
    await reg(['delete', `${ROOT}\\.pdf\\OpenWithProgids`, '/v', PROGID, '/f']);
    await del(pk);
    await del(`${ROOT}\\Applications\\PDF-Ivrit.exe`);
    await del(`${ROOT}\\Applications\\EitanPDF.exe`);
    return {};
  }
  const inst = await ensureInstalled();
  await add(pk, null, 'מסמך PDF');
  await add(pk, 'FriendlyTypeName', 'מסמך PDF');
  await add(`${pk}\\DefaultIcon`, null, `"${inst.exe}",0`);
  await add(`${pk}\\shell\\open\\command`, null, cmdLine(inst, '--open'));
  await add(`${ROOT}\\.pdf\\OpenWithProgids`, PROGID, '', 'REG_NONE');
  const appKey = `${ROOT}\\Applications\\${path.basename(inst.exe)}`;
  await add(`${appKey}\\shell\\open\\command`, null, cmdLine(inst, '--open'));
  await add(appKey, 'FriendlyAppName', 'איתןPDF');
  await add(`${appKey}\\SupportedTypes`, '.pdf', '');
  if (!opts.silent) shell.openExternal('ms-settings:defaultapps');
  return {};
}

async function set(key, on) {
  if (process.platform !== 'win32') return { error: 'זמין רק ב-Windows.' };
  if (isStore()) return { error: STORE_NOTE };
  try {
    const fn = { context: setContext, thumbs: setThumbs, default: setDefault }[key];
    const res = await fn(on);
    // מודיעים לסייר שהשיוכים השתנו (מרענן תפריטים ותמונות)
    execFile('ie4uinit.exe', ['-show'], { windowsHide: true }, () => {});
    return res || {};
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * אחרי עדכון או מעבר מהגרסה הניידת: מפנים מחדש את כל מה שכבר הופעל אל ההתקנה הנוכחית.
 * רץ בשקט בכל הפעלה — לא משנה כלום אם שום שילוב לא הופעל.
 */
async function repair() {
  if (process.platform !== 'win32' || !app.isPackaged || isStore()) return;
  try {
    const st = await status();
    if (st.context) await setContext(true);
    if (st.thumbs) await setThumbs(true);
    if (st.default) await setDefault(true, { silent: true });
    if (st.context || st.thumbs || st.default) execFile('ie4uinit.exe', ['-show'], { windowsHide: true }, () => {});
    // שאריות מהגרסה הניידת הקודמת (PDF עברית)
    if (!isPortable()) {
      const old = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'PDF-Ivrit', 'PDF-Ivrit.exe');
      await fs.rm(old, { force: true }).catch(() => {});
      const oldLnk = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'PDF עברית.lnk');
      await fs.rm(oldLnk, { force: true }).catch(() => {});
    }
  } catch (e) { /* לא קריטי */ }
}

module.exports = { status, set, repair, isStore };
