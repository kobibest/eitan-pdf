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
