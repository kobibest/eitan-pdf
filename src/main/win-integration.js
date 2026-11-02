// שילוב ב-Windows: קליק ימני על PDF, תמונות ממוזערות בסייר, "פתח באמצעות".
// הכל נרשם תחת HKCU (המשתמש הנוכחי בלבד) — לא נדרשות הרשאות מנהל.
const { app, shell } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs/promises');

const ROOT = 'HKCU\\Software\\Classes';
const VERBS = [
  { key: 'PdfIvrit.Open', label: 'פתיחה ב-PDF עברית', arg: '--open' },
  { key: 'PdfIvrit.Merge', label: 'מיזוג ב-PDF עברית', arg: '--merge' },
  { key: 'PdfIvrit.Split', label: 'פיצול ב-PDF עברית', arg: '--split' },
];
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

/** תיקיית התקנה קבועה — הקובץ שהורד יכול להימחק או לזוז */
function installDir() {
  return path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'Programs', 'PDF-Ivrit');
}

/** הקובץ שרץ כרגע: בגרסה הניידת זה ה-exe שהמשתמש הוריד, לא הקובץ שחולץ לתיקייה זמנית */
function currentExe() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

/** מעתיק את התוכנה לתיקייה קבועה (פעם אחת, או כשיש גרסה חדשה) ומחזיר את הנתיב */
async function ensureInstalled() {
  const dir = installDir();
  const target = path.join(dir, 'PDF-Ivrit.exe');
  const src = currentExe();
  if (!app.isPackaged) return { exe: process.execPath, args: [app.getAppPath()], dir };
  await fs.mkdir(dir, { recursive: true });
  if (path.resolve(src).toLowerCase() !== path.resolve(target).toLowerCase()) {
    let need = true;
    try {
      const [a, b] = await Promise.all([fs.stat(src), fs.stat(target)]);
      need = a.size !== b.size || a.mtimeMs > b.mtimeMs;
    } catch (e) { /* עדיין לא הותקן */ }
    if (need) await fs.copyFile(src, target);
  }
  // רכיב התמונות הממוזערות (DLL) — מועתק מתוך התוכנה
  const nativeSrc = path.join(process.resourcesPath, 'native', process.arch === 'arm64' ? 'thumbs-arm64' : 'thumbs');
  const nativeDst = path.join(dir, 'shell');
  try {
    await fs.mkdir(nativeDst, { recursive: true });
    for (const f of await fs.readdir(nativeSrc)) {
      try { await fs.copyFile(path.join(nativeSrc, f), path.join(nativeDst, f)); } catch (e) { /* ה-DLL בשימוש של הסייר — משאירים את הקיים */ }
    }
  } catch (e) { /* אין רכיב מקומי בגרסה הזו */ }
  // קיצור דרך בתפריט התחל
  try {
    const lnk = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'PDF עברית.lnk');
    shell.writeShortcutLink(lnk, 'create', { target, description: 'PDF עברית', icon: target, iconIndex: 0 });
  } catch (e) { /* לא קריטי */ }
  return { exe: target, args: [], dir };
}

function cmdLine(inst, arg) {
  const pre = inst.args.map((a) => `"${a}"`).join(' ');
  return `"${inst.exe}" ${pre ? pre + ' ' : ''}${arg} "%1"`;
}

async function status() {
  // לבדיקות ויזואליות בלבד מחוץ ל-Windows
  if (process.env.PDFIVRIT_FAKE_WIN) return { supported: true, context: true, thumbs: false, default: false, installedPath: 'C:\\Users\\kobi\\AppData\\Local\\Programs\\PDF-Ivrit' };
  if (process.platform !== 'win32') return { supported: false, error: 'האפשרויות האלה זמינות רק ב-Windows.' };
  const ctx = await query(`${ROOT}\\SystemFileAssociations\\.pdf\\shell\\${VERBS[1].key}\\command`, null);
  const th = await query(`${ROOT}\\.pdf\\ShellEx\\${THUMB_IID}`, null);
  const def = await query(`${ROOT}\\.pdf\\OpenWithProgids`, PROGID);
  return {
    supported: true,
    context: !!ctx,
    thumbs: !!(th && th.toUpperCase().includes(THUMB_CLSID)),
    default: !!def,
    installedPath: ctx || th || def ? installDir() : null,
  };
}

async function setContext(on) {
  for (const v of VERBS) await del(`${ROOT}\\SystemFileAssociations\\.pdf\\shell\\${v.key}`);
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
  const inst = await ensureInstalled();
  const dll = path.join(inst.dir, 'shell', 'PdfIvritThumbs.dll');
  try { await fs.access(dll); } catch (e) { return { error: 'רכיב התמונות הממוזערות חסר בגרסה הזו של התוכנה.' }; }
  const clsid = `${ROOT}\\CLSID\\${THUMB_CLSID}`;
  await add(clsid, null, 'PDF Ivrit Thumbnail Provider');
  await add(`${clsid}\\InprocServer32`, null, dll);
  await add(`${clsid}\\InprocServer32`, 'ThreadingModel', 'Apartment');
  await add(ext, null, THUMB_CLSID);
  const r = await add(sfa, null, THUMB_CLSID);
  return r.ok ? {} : { error: 'לא הצלחנו לרשום את רכיב התמונות הממוזערות.' };
}

async function setDefault(on) {
  const pk = `${ROOT}\\${PROGID}`;
  if (!on) {
    await reg(['delete', `${ROOT}\\.pdf\\OpenWithProgids`, '/v', PROGID, '/f']);
    await del(pk);
    await del(`${ROOT}\\Applications\\PDF-Ivrit.exe`);
    return {};
  }
  const inst = await ensureInstalled();
  await add(pk, null, 'מסמך PDF');
  await add(`${pk}\\DefaultIcon`, null, `"${inst.exe}",0`);
  await add(`${pk}\\shell\\open\\command`, null, cmdLine(inst, '--open'));
  await add(`${ROOT}\\.pdf\\OpenWithProgids`, PROGID, '', 'REG_NONE');
  await add(`${ROOT}\\Applications\\PDF-Ivrit.exe\\shell\\open\\command`, null, cmdLine(inst, '--open'));
  await add(`${ROOT}\\Applications\\PDF-Ivrit.exe`, 'FriendlyAppName', 'PDF עברית');
  await add(`${ROOT}\\Applications\\PDF-Ivrit.exe\\SupportedTypes`, '.pdf', '');
  shell.openExternal('ms-settings:defaultapps');
  return {};
}

async function set(key, on) {
  if (process.platform !== 'win32') return { error: 'זמין רק ב-Windows.' };
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

module.exports = { status, set };
