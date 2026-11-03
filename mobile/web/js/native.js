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

/* ---------- תמונות ---------- */

async function readImage(f) {
  const res = await fetch(Cap.convertFileSrc(f.path));
  if (!res.ok) throw new Error('קריאת התמונה נכשלה');
  return { bytes: new Uint8Array(await res.arrayBuffer()) };
}

/** בדפדפן: סיבוב לפי EXIF והקטנה דרך canvas, כמו שהתוסף עושה באנדרואיד */
async function normalizeInBrowser(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88));
  return { bytes: new Uint8Array(await blob.arrayBuffer()) };
}

/** בחירת תמונות מהגלריה. מחזיר [{ bytes }] (JPEG) */
export async function pickImages() {
  if (isNative) {
    const { images } = await EitanFiles.pickImages();
    const out = [];
    for (const f of images || []) out.push(await readImage(f));
    return out;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.hidden = true;
  document.body.append(input);
  const files = await new Promise((resolve) => {
    input.addEventListener('change', () => resolve([...input.files]));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
  input.remove();
  const out = [];
  for (const f of files) out.push(await normalizeInBrowser(f));
  return out;
}

/** צילום תמונה. מחזיר { bytes }, או null בביטול */
export async function takePhoto() {
  if (isNative) {
    const res = await EitanFiles.takePhoto();
    return res.cancelled ? null : readImage(res.image);
  }
  const [img] = await pickImages();
  return img || null;
}

/** בחירת קובץ מכל סוג (תעודה ‎.pfx/.p12). מחזיר { name, bytes } או null בביטול */
export async function pickAnyFile(accept = '.pfx,.p12') {
  if (isNative) {
    const f = await EitanFiles.pickFile();
    if (!f || f.cancelled) return null;
    const res = await fetch(Cap.convertFileSrc(f.path));
    return { name: f.name, bytes: new Uint8Array(await res.arrayBuffer()) };
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.hidden = true;
  document.body.append(input);
  const file = await new Promise((resolve) => {
    input.addEventListener('change', () => resolve(input.files[0] || null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
  input.remove();
  return file ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : null;
}
