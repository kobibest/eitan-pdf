// תהליך ראשי של Electron: חלון, תפריט בעברית, דיאלוגים, גישה לקבצים ושילוב ב-Windows.
// אין כאן שום תקשורת רשת — הכל מקומי.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');

// שם התוכנה ותיקיית ההגדרות. תיקייה קבועה בשם לטיני, כדי שעדכונים ושינויי שם
// לא יאבדו חתימות שמורות והגדרות. בהפעלה הראשונה מעבירים את מה שנשמר בגרסה הקודמת.
app.setName('איתןPDF');
app.setAppUserModelId('il.co.eitan-m.eitanpdf');
(() => {
  const appData = app.getPath('appData');
  const target = path.join(appData, 'EitanPDF');
  const legacy = path.join(appData, 'PDF עברית');
  try {
    if (!fsSync.existsSync(target) && fsSync.existsSync(legacy)) fsSync.cpSync(legacy, target, { recursive: true });
  } catch (e) { /* לא קריטי — מתחילים נקי */ }
  app.setPath('userData', target);
})();
const integration = require('./src/main/win-integration.js');
const winCerts = require('./src/main/win-certs.js');
const digisig = require('./src/core/digisig.js');

let win;
let rendererReady = false;
let anyDirty = false;
let closing = false;

/* ---------- בקשות פתיחה (לחיצה כפולה, קליק ימני, כמה קבצים בבת אחת) ---------- */
// Windows מפעיל את התוכנה פעם אחת לכל קובץ שנבחר. אוספים את כולם לבקשה אחת.
const pending = { open: [], merge: [], split: [] };
let flushTimer = null;

function parseArgs(argv) {
  let mode = 'open';
  const files = [];
  for (const a of argv) {
    if (a === '--merge') mode = 'merge';
    else if (a === '--split') mode = 'split';
    else if (a === '--open') mode = 'open';
    else if (/\.pdf$/i.test(a)) files.push(path.resolve(a));
  }
  return { mode, files };
}

function queue(argv) {
  const { mode, files } = parseArgs(argv);
  if (!files.length) return;
  pending[mode].push(...files);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 700);
}

function flush() {
  if (!rendererReady) return;
  for (const mode of ['merge', 'split', 'open']) {
    const paths = [...new Set(pending[mode].splice(0))];
    if (paths.length) win.webContents.send('open-request', { mode, paths });
  }
}

// מוסר ההתקנה מפעיל את התוכנה עם הדגל הזה כדי לנקות את מה שנרשם ב-Windows
const UNINSTALL = process.argv.includes('--uninstall-integration');
if (UNINSTALL) {
  app.whenReady().then(async () => {
    for (const k of ['context', 'thumbs', 'default']) await integration.set(k, false).catch(() => {});
    app.exit(0);
  });
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    queue(argv.slice(1));
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 980,
    minHeight: 600,
    title: 'איתןPDF',
    backgroundColor: '#DCE4F1',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('close', (e) => {
    if (closing || !anyDirty) return;
    e.preventDefault();
    win.webContents.send('before-close');
  });

  const send = (cmd) => () => win.webContents.send('menu', cmd);
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'קובץ',
      submenu: [
        { label: 'פתיחת קבצים…', accelerator: 'CmdOrCtrl+O', click: send('open') },
        { label: 'שמירה', accelerator: 'CmdOrCtrl+S', click: send('save') },
        { label: 'שמירה בשם…', accelerator: 'CmdOrCtrl+Shift+S', click: send('save-as') },
        { label: 'דחיסת הקובץ…', click: send('compress') },
        { label: 'המרה ל-Word…', click: send('convert-word') },
        { label: 'שמירה כתמונות…', click: send('convert-images') },
        { type: 'separator' },
        { label: 'סגירת לשונית', accelerator: 'CmdOrCtrl+W', click: send('close-tab') },
        { label: 'יציאה', role: isMac ? 'close' : 'quit' },
      ],
    },
    {
      label: 'עריכה',
      submenu: [
        { label: 'ביטול', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
        { label: 'ביצוע מחדש', accelerator: 'CmdOrCtrl+Y', click: send('redo') },
        { type: 'separator' },
        { label: 'גזירה', role: 'cut' },
        { label: 'העתקה', role: 'copy' },
        { label: 'הדבקה', role: 'paste' },
        { label: 'בחירת הכל', accelerator: 'CmdOrCtrl+A', click: send('select-all') },
        { type: 'separator' },
        { label: 'חיפוש בקובץ…', accelerator: 'CmdOrCtrl+F', click: send('find') },
        { label: 'התוצאה הבאה', accelerator: 'F3', click: send('find-next') },
        { label: 'התוצאה הקודמת', accelerator: 'Shift+F3', click: send('find-prev') },
      ],
    },
    {
      label: 'תצוגה',
      submenu: [
        { label: 'עמוד יחיד', click: send('layout-single') },
        { label: 'גלילה רציפה', click: send('layout-continuous') },
        { label: 'שני עמודים זה לצד זה', click: send('layout-two') },
        { type: 'separator' },
        { label: 'הגדלה', accelerator: 'CmdOrCtrl+=', click: send('zoom-in') },
        { label: 'הקטנה', accelerator: 'CmdOrCtrl+-', click: send('zoom-out') },
        { label: 'התאמה לרוחב', accelerator: 'CmdOrCtrl+0', click: send('zoom-fit') },
        { label: 'עמוד שלם במסך', accelerator: 'CmdOrCtrl+9', click: send('zoom-page') },
        { type: 'separator' },
        { label: 'הלשונית הבאה', accelerator: 'Ctrl+Tab', click: send('next-tab') },
        { label: 'הלשונית הקודמת', accelerator: 'Ctrl+Shift+Tab', click: send('prev-tab') },
        { type: 'separator' },
        { label: 'מסך מלא', role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ label: 'כלי פיתוח', role: 'toggleDevTools' }]),
      ],
    },
    {
      label: 'עזרה',
      submenu: [{ label: 'אודות', click: send('about') }],
    },
  ]));
}

/* ---------- IPC ---------- */
const PDF_FILTER = [{ name: 'קבצי PDF', extensions: ['pdf'] }];
const IMG_FILTER = [{ name: 'תמונות', extensions: ['png', 'jpg', 'jpeg'] }];

async function readEntry(p) {
  const bytes = await fs.readFile(p);
  return { name: path.basename(p), path: p, bytes: new Uint8Array(bytes) };
}

ipcMain.handle('open-pdfs', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'בחירת קבצי PDF', properties: ['openFile', 'multiSelections'], filters: PDF_FILTER });
  if (r.canceled) return [];
  return Promise.all(r.filePaths.map(readEntry));
});

ipcMain.handle('open-images', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'בחירת תמונות', properties: ['openFile', 'multiSelections'], filters: IMG_FILTER });
  if (r.canceled) return [];
  return Promise.all(r.filePaths.map(readEntry));
});

ipcMain.handle('read-file', async (_e, p) => readEntry(p));

/** שמירה לקובץ קיים: כותבים לקובץ זמני ומחליפים, כדי שתקלה באמצע לא תשאיר קובץ שבור */
ipcMain.handle('write-file', async (_e, { target, bytes }) => {
  if (!/\.pdf$/i.test(target)) throw new Error('אפשר לשמור רק קבצי PDF');
  const tmp = target + '.tmp-pdfivrit';
  await fs.writeFile(tmp, Buffer.from(bytes));
  try {
    await fs.rename(tmp, target);
  } catch (e) {
    // ב-Windows החלפה נכשלת כשהקובץ פתוח בתוכנה אחרת — מנסים כתיבה ישירה
    try { await fs.writeFile(target, Buffer.from(bytes)); } finally { await fs.rm(tmp, { force: true }); }
  }
  return target;
});

// סוגי הקבצים שאפשר לשמור: PDF, ומההמרה — Word ותמונות
const SAVE_KINDS = {
  pdf: { title: 'שמירת קובץ PDF', filters: PDF_FILTER, ext: /\.pdf$/i, add: '.pdf' },
  docx: { title: 'שמירת קובץ Word', filters: [{ name: 'מסמך Word', extensions: ['docx'] }], ext: /\.docx$/i, add: '.docx' },
  jpeg: { title: 'שמירת תמונה', filters: [{ name: 'תמונת JPG', extensions: ['jpg', 'jpeg'] }], ext: /\.jpe?g$/i, add: '.jpg' },
  png: { title: 'שמירת תמונה', filters: [{ name: 'תמונת PNG', extensions: ['png'] }], ext: /\.png$/i, add: '.png' },
};

ipcMain.handle('save-as', async (_e, { defaultName, bytes, near, kind }) => {
  const k = SAVE_KINDS[kind] || SAVE_KINDS.pdf;
  const defaultPath = near ? path.join(path.dirname(near), defaultName) : defaultName;
  const r = await dialog.showSaveDialog(win, { title: k.title, defaultPath, filters: k.filters });
  if (r.canceled || !r.filePath) return null;
  const target = k.ext.test(r.filePath) ? r.filePath : r.filePath + k.add;
  await fs.writeFile(target, Buffer.from(bytes));
  return target;
});

ipcMain.handle('choose-folder', async (_e, title) => {
  const r = await dialog.showOpenDialog(win, { title: title || 'בחירת תיקייה', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('write-files', async (_e, { folder, files }) => {
  const written = [];
  for (const f of files) {
    const name = path.basename(f.name); // רק שם קובץ, בלי תיקיות
    let target = path.join(folder, name);
    for (let n = 2; await exists(target); n++) target = path.join(folder, name.replace(/(\.[^.]+)?$/, (ext) => ` (${n})${ext}`));
    await fs.writeFile(target, Buffer.from(f.bytes));
    written.push(target);
  }
  return written;
});

ipcMain.handle('read-asset', async (_e, rel) => {
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  return new Uint8Array(await fs.readFile(path.join(__dirname, 'assets', safe)));
});

/* ---------- חתימה דיגיטלית ---------- */
const PFX_FILTER = [{ name: 'קובצי תעודה', extensions: ['pfx', 'p12'] }];
const certsDir = () => path.join(app.getPath('userData'), 'certs');

/** מקור תעודה: { kind: 'store', thumb } | { kind: 'file', path, password } */
async function signerFor(source) {
  if (!source) throw new Error('לא נבחרה תעודה');
  if (source.kind === 'store') return new winCerts.WindowsStoreSigner(source.thumb);
  if (source.kind === 'file') return digisig.p12Signer(await fs.readFile(source.path), source.password);
  throw new Error('מקור תעודה לא מוכר');
}

ipcMain.handle('certs-supported', () => winCerts.isSupported());
ipcMain.handle('certs-list', () => winCerts.list());
ipcMain.handle('pick-pfx', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'בחירת קובץ תעודה', properties: ['openFile'], filters: PFX_FILTER });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('cert-info', async (_e, source) => {
  if (source.kind !== 'file') throw new Error('מקור תעודה לא מוכר');
  return digisig.p12Info(await fs.readFile(source.path), source.password);
});
ipcMain.handle('cert-create', async (_e, { name, email, password }) => {
  const p12 = digisig.createSelfSigned({ name, email, password });
  await fs.mkdir(certsDir(), { recursive: true });
  const safe = String(name).trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) || 'cert';
  let target = path.join(certsDir(), `${safe}.p12`);
  for (let n = 2; await exists(target); n++) target = path.join(certsDir(), `${safe} (${n}).p12`);
  await fs.writeFile(target, Buffer.from(p12));
  return { kind: 'file', path: target };
});
ipcMain.handle('digital-sign', async (_e, { bytes, source, pageIndex, rect, name, reason, location, appearance }) => {
  const signer = await signerFor(source);
  const signingTime = new Date();
  let ap = null;
  if (appearance && rect) {
    const fontsDir = path.join(__dirname, 'assets', 'fonts');
    const date = signingTime.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + signingTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    ap = {
      ...appearance, date, reason, location,
      fonts: { regular: await fs.readFile(path.join(fontsDir, 'Alef-Regular.ttf')), bold: await fs.readFile(path.join(fontsDir, 'Alef-Bold.ttf')) },
    };
  }
  return digisig.signPdf(new Uint8Array(bytes), signer, { pageIndex, rect: ap ? rect : null, name, reason, location, signingTime, appearance: ap });
});
ipcMain.handle('verify-signatures', (_e, bytes) => digisig.verify(new Uint8Array(bytes)));

ipcMain.handle('show-in-folder', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('open-path', (_e, p) => shell.openPath(p));
ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('integration-status', () => integration.status());
ipcMain.handle('integration-set', (_e, { key, on }) => integration.set(key, on));
ipcMain.on('set-dirty', (_e, v) => { anyDirty = !!v; });
ipcMain.on('close-now', () => { closing = true; win.close(); });
ipcMain.on('renderer-ready', () => {
  rendererReady = true;
  flush();
});

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

if (!UNINSTALL) queue(process.argv.slice(app.isPackaged ? 1 : 2));
if (!UNINSTALL) app.whenReady().then(() => {
  createWindow();
  // אחרי עדכון: השילוב ב-Windows מופנה להתקנה החדשה
  setTimeout(() => integration.repair(), 4000);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('open-file', (e, p) => { e.preventDefault(); queue([p]); });
