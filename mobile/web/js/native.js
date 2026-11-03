/*
 * גשר לאנדרואיד (Capacitor) — פתיחת קבצים וקבלת קבצים מאפליקציות אחרות.
 * בדפדפן רגיל (לבדיקות על מחשב) יש גיבוי עם <input type="file">.
 */

const capx = window.capacitorExports;
const Cap = window.Capacitor;

export const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());

const EitanFiles = isNative ? capx.registerPlugin('EitanFiles') : null;
export const App = isNative ? capx.registerPlugin('App') : null;

/**
 * קובץ פתוח: { name, bytes, uri, writable }
 *  uri — כתובת המקור באנדרואיד (content://), לשמירה מעליו בהמשך
 *  writable — האם האפליקציה שנתנה את הקובץ הרשתה לכתוב אליו
 */
async function readNative(f) {
  const res = await fetch(Cap.convertFileSrc(f.path));
  if (!res.ok) throw new Error('קריאת הקובץ נכשלה');
  return { name: f.name, bytes: new Uint8Array(await res.arrayBuffer()), uri: f.uri, writable: !!f.writable };
}

/** בחירת קבצי PDF מתוך האפליקציה */
export async function pickPdfs({ multiple = false } = {}) {
  if (isNative) {
    const { files } = await EitanFiles.pickPdf({ multiple });
    const out = [];
    for (const f of files || []) out.push(await readNative(f));
    return out;
  }
  return pickInBrowser('application/pdf,.pdf', multiple);
}

function pickInBrowser(accept, multiple) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.hidden = true;
    document.body.append(input);
    input.addEventListener('change', async () => {
      input.remove();
      const out = [];
      for (const f of input.files) out.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), uri: null, writable: false });
      resolve(out);
    });
    input.addEventListener('cancel', () => { input.remove(); resolve([]); });
    input.click();
  });
}

/**
 * קבצים שהגיעו מבחוץ: "פתח באמצעות" / "שתף" (גם כשהאפליקציה כבר פתוחה).
 * onIncoming(count) — מתחילים לקבל (להצגת טעינה); onFiles(files) — הקבצים מוכנים.
 */
export function onReceivedFiles(onIncoming, onFiles, onError) {
  if (!isNative) return;
  EitanFiles.addListener('filesIncoming', (e) => onIncoming(e.count || 1));
  EitanFiles.addListener('filesReceived', async (e) => {
    try {
      if (e.error) throw new Error(e.error);
      const out = [];
      for (const f of e.files || []) out.push(await readNative(f));
      onFiles(out);
    } catch (err) {
      onError(err);
    }
  });
}

/* ---------- שמירה ושיתוף ---------- */

/** מעביר בתים לקובץ זמני בצד של אנדרואיד, בחלקים (כדי לא לחנוק את הגשר) */
async function writeTemp(name, bytes) {
  const { path } = await EitanFiles.createTemp({ name });
  const CHUNK = 512 * 1024;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    await EitanFiles.appendTemp({ path, data: toBase64(bytes.subarray(i, i + CHUNK)) });
  }
  return path;
}

function toBase64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

function download(name, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** שמירה מעל הקובץ המקורי (uri) */
export async function writeOver(uri, name, bytes) {
  if (!isNative) { download(name, bytes); return; }
  const path = await writeTemp(name, bytes);
  await EitanFiles.writeToUri({ path, uri });
}

/** "שמור בשם". מחזיר { uri, name, writable }, או null בביטול */
export async function saveAs(name, bytes) {
  if (!isNative) { download(name, bytes); return { uri: null, name, writable: false }; }
  const path = await writeTemp(name, bytes);
  const res = await EitanFiles.saveAs({ path, name });
  return res.cancelled ? null : res;
}

/** שמירת כמה קבצים לתיקייה. files: [{ name, bytes }]. מחזיר את מספר הקבצים, או null בביטול */
export async function saveToFolder(files) {
  if (!isNative) { files.forEach((f) => download(f.name, f.bytes)); return files.length; }
  const list = [];
  for (const f of files) list.push({ path: await writeTemp(f.name, f.bytes) });
  const res = await EitanFiles.saveToFolder({ files: list });
  return res.cancelled ? null : res.count;
}

/** שיתוף. files: [{ name, bytes }] */
export async function share(files) {
  if (!isNative) {
    const fl = files.map((f) => new File([f.bytes], f.name, { type: 'application/pdf' }));
    if (navigator.canShare && navigator.canShare({ files: fl })) await navigator.share({ files: fl });
    else files.forEach((f) => download(f.name, f.bytes));
    return;
  }
  const list = [];
  for (const f of files) list.push({ path: await writeTemp(f.name, f.bytes) });
  await EitanFiles.share({ files: list });
}

/** קריאת קובץ מתוך www (גופנים) */
export async function readAsset(rel) {
  const res = await fetch(rel);
  if (!res.ok) throw new Error('missing asset ' + rel);
  return new Uint8Array(await res.arrayBuffer());
}
