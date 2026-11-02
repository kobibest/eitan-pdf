// תהליך ראשי של Electron: חלון, תפריט בעברית, דיאלוגים וגישה לקבצים.
// אין כאן שום תקשורת רשת — הכל מקומי.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let win;
const pendingFiles = [];

function pdfArgs(argv) {
  return argv.filter((a) => /\.pdf$/i.test(a)).map((a) => path.resolve(a));
}

function sendFiles(paths) {
  if (!paths.length) return;
  if (win && win.webContents && !win.webContents.isLoading()) win.webContents.send('open-files', paths);
  else pendingFiles.push(...paths);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    sendFiles(pdfArgs(argv.slice(1)));
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    title: 'PDF עברית',
    backgroundColor: '#f4f1ea',
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
  win.webContents.on('did-finish-load', () => {
    const initial = [...pdfArgs(process.argv.slice(app.isPackaged ? 1 : 2)), ...pendingFiles.splice(0)];
    if (initial.length) win.webContents.send('open-files', initial);
  });
  // קישורים חיצוניים נפתחים בדפדפן ולא בתוך התוכנה
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'קובץ',
      submenu: [
        { label: 'פתיחת קבצים…', accelerator: 'CmdOrCtrl+O', click: () => win.webContents.send('menu', 'open') },
        { label: 'שמירה בשם…', accelerator: 'CmdOrCtrl+S', click: () => win.webContents.send('menu', 'save') },
        { type: 'separator' },
        { label: 'יציאה', role: isMac ? 'close' : 'quit' },
      ],
    },
    {
      label: 'עריכה',
      submenu: [
        { label: 'ביטול', accelerator: 'CmdOrCtrl+Z', click: () => win.webContents.send('menu', 'undo') },
        { label: 'ביצוע מחדש', accelerator: 'CmdOrCtrl+Y', click: () => win.webContents.send('menu', 'redo') },
        { type: 'separator' },
        { label: 'גזירה', role: 'cut' },
        { label: 'העתקה', role: 'copy' },
        { label: 'הדבקה', role: 'paste' },
        { label: 'בחירת הכל', accelerator: 'CmdOrCtrl+A', click: () => win.webContents.send('menu', 'select-all') },
      ],
    },
    {
      label: 'תצוגה',
      submenu: [
        { label: 'הגדלה', accelerator: 'CmdOrCtrl+=', click: () => win.webContents.send('menu', 'zoom-in') },
        { label: 'הקטנה', accelerator: 'CmdOrCtrl+-', click: () => win.webContents.send('menu', 'zoom-out') },
        { type: 'separator' },
        { label: 'מסך מלא', role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ label: 'כלי פיתוח', role: 'toggleDevTools' }]),
      ],
    },
    {
      label: 'עזרה',
      submenu: [{ label: 'אודות', click: () => win.webContents.send('menu', 'about') }],
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

ipcMain.handle('save-as', async (_e, { defaultName, bytes }) => {
  const r = await dialog.showSaveDialog(win, { title: 'שמירת קובץ PDF', defaultPath: defaultName, filters: PDF_FILTER });
  if (r.canceled || !r.filePath) return null;
  const target = /\.pdf$/i.test(r.filePath) ? r.filePath : r.filePath + '.pdf';
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
    let target = path.join(folder, f.name);
    // לא דורסים קבצים קיימים
    for (let n = 2; await exists(target); n++) target = path.join(folder, f.name.replace(/\.pdf$/i, ` (${n}).pdf`));
    await fs.writeFile(target, Buffer.from(f.bytes));
    written.push(target);
  }
  return written;
});

ipcMain.handle('list-pdfs', async (_e, folder) => {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isFile() || !/\.pdf$/i.test(e.name)) continue;
    const full = path.join(folder, e.name);
    const st = await fs.stat(full);
    out.push({ name: e.name, path: full, size: st.size, mtime: st.mtimeMs });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
});

ipcMain.handle('read-asset', async (_e, rel) => {
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  return new Uint8Array(await fs.readFile(path.join(__dirname, 'assets', safe)));
});

ipcMain.handle('show-in-folder', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('open-path', (_e, p) => shell.openPath(p));
ipcMain.handle('app-version', () => app.getVersion());

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('open-file', (e, p) => { e.preventDefault(); sendFiles([p]); });
