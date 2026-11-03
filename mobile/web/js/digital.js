/*
 * חתימה דיגיטלית עם תעודה — הממשק במובייל.
 * המנוע עצמו הוא src/core/digisig.js של גרסת Windows (נארז ל-window.DigiSig בזמן הבנייה).
 *
 * תעודות: קובץ ‎.pfx/.p12 (מהגורם המנפיק) או תעודה אישית שנוצרת כאן. הקובץ נשמר באחסון
 * הפרטי של האפליקציה (מוצפן בסיסמה שלו, בלי גיבוי לענן), והסיסמה נשאלת בכל חתימה — כמו בדסקטופ.
 */
import { h, toast, busy, openSheet, prompt, iso } from './ui.js';
import { isNative, pickAnyFile } from './native.js';

const DS = () => window.DigiSig;
const KEY = 'certs';
const Prefs = isNative ? window.capacitorExports.registerPlugin('Preferences') : null;

/* ---------- אחסון תעודות ---------- */

function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function storedCerts() {
  try {
    const raw = Prefs ? (await Prefs.get({ key: KEY })).value : localStorage.getItem(KEY);
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeCerts(list) {
  const raw = JSON.stringify(list.slice(0, 5));
  if (Prefs) await Prefs.set({ key: KEY, value: raw });
  else localStorage.setItem(KEY, raw);
}

async function storeCert(p12, info) {
  const id = 'c' + Date.now().toString(36);
  const entry = { id, name: info.name, issuer: info.issuer, notAfter: info.notAfter, selfSigned: info.selfSigned, p12: toB64(p12) };
  await writeCerts([entry, ...(await storedCerts())]);
  return entry;
}

async function forgetCert(id) {
  await writeCerts((await storedCerts()).filter((c) => c.id !== id));
}

export const certBytes = (cert) => fromB64(cert.p12);

/** תיאור קצר של תעודה */
export function certLine(c) {
  const until = c.notAfter ? `בתוקף עד ${new Date(c.notAfter).toLocaleDateString('he-IL')}` : '';
  return [c.selfSigned ? 'תעודה אישית' : c.issuer ? `הונפקה ע"י ${c.issuer}` : '', until].filter(Boolean).join(' · ');
}

/** פענוח עם סיסמה. זורק את השגיאה בעברית של המנוע */
export function openCert(cert, password) {
  const bytes = certBytes(cert);
  const info = DS().p12Info(bytes, password);
  if (info.expired) throw new Error('התעודה לא בתוקף');
  return { bytes, info };
}

/** פעולה כבדה (יצירת מפתח RSA, חתימה): נותנים למסך הטעינה להופיע לפני שהדפדפן נתקע עליה */
export function heavy(text, fn) {
  busy(true, text);
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      Promise.resolve().then(fn).then(resolve, reject).finally(() => busy(false));
    }, 60);
  });
}

/* ---------- בחירת תעודה ---------- */

/** מחזיר רשומת תעודה שמורה, או null */
export function chooseCert() {
  return new Promise((resolve) => {
    let done = false;
    const s = openSheet(`
      <h2>תעודה לחתימה</h2>
      <p>חתימה עם תעודה מוכיחה מי חתם ושהמסמך לא שונה אחרי החתימה. זה שונה מחתימה מצוירת.</p>
      <div class="cert-list"></div>
      <div class="actions col">
        <button class="btn" data-file>קובץ תעודה (‎.pfx / ‎.p12)</button>
        <button class="btn quiet" data-create>תעודה אישית חדשה</button>
      </div>`, { onClose: () => { if (!done) resolve(null); } });
    const finish = (c) => { done = true; resolve(c); s.close(); };
    const list = s.wrap.querySelector('.cert-list');
    const draw = async () => {
      const certs = await storedCerts();
      list.replaceChildren();
      for (const c of certs) {
        const row = h(`<div class="cert-row" role="button"><div><b dir="auto"></b><small></small></div>
          <button class="sig-forget" aria-label="הסרת התעודה מהאפליקציה"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`);
        row.querySelector('b').textContent = c.name;
        row.querySelector('small').textContent = certLine(c);
        row.addEventListener('click', (e) => { if (!e.target.closest('.sig-forget')) finish(c); });
        row.querySelector('.sig-forget').addEventListener('click', async (e) => {
          e.stopPropagation();
          await forgetCert(c.id);
          toast('התעודה הוסרה מהאפליקציה.');
          draw();
        });
        list.append(row);
      }
    };
    draw();
    s.wrap.querySelector('[data-file]').addEventListener('click', async () => {
      const c = await importCertFile();
      if (c) finish(c);
    });
    s.wrap.querySelector('[data-create]').addEventListener('click', async () => {
      const c = await createCertSheet();
      if (c) finish(c);
    });
  });
}

async function importCertFile() {
  let file;
  try { file = await pickAnyFile('.pfx,.p12,application/x-pkcs12'); } catch (err) { console.error(err); }
  if (!file) return null;
  for (let wrong = false; ;) {
    const pw = await prompt({
      title: wrong ? 'הסיסמה שגויה' : 'סיסמת התעודה',
      text: wrong ? 'נסו שוב.' : `הסיסמה של "${iso(file.name)}", כפי שקיבלתם מהגורם המנפיק.`,
      type: 'password', ok: 'אישור',
    });
    if (pw == null) return null;
    try {
      const info = DS().p12Info(file.bytes, pw);
      if (info.expired) { toast('התעודה לא בתוקף.', { error: true }); return null; }
      const entry = await storeCert(file.bytes, info);
      toast('התעודה נשמרה באפליקציה. הסיסמה תישאל בכל חתימה.');
      return entry;
    } catch (err) {
      if (/סיסמה/.test(err.message)) { wrong = true; continue; }
      toast(err.message, { error: true });
      return null;
    }
  }
}

function createCertSheet() {
  return new Promise((resolve) => {
    let done = false;
    const s = openSheet(`
      <h2>תעודה אישית חדשה</h2>
      <p>האפליקציה תיצור תעודה על שמכם ותשמור אותה בטלפון. היא מוכיחה שהמסמך לא שונה אחרי החתימה, אבל לא מאושרת ע"י רשות: Adobe יציג "זהות החותם לא אומתה". מתאים לשימוש פנימי, לא מול רשויות ובנקים.</p>
      <label class="lbl">שם מלא</label>
      <input class="field" dir="auto" data-c="name" autocomplete="name">
      <label class="lbl">דוא"ל (רשות)</label>
      <input class="field" dir="ltr" data-c="email" type="email" autocomplete="email">
      <label class="lbl">סיסמה לתעודה (4 תווים לפחות)</label>
      <input class="field" dir="ltr" data-c="password" type="password" autocomplete="new-password">
      <p class="hint">הסיסמה תידרש בכל חתימה, כדי שמי שמשתמש בטלפון שלכם לא יוכל לחתום בשמכם.</p>
      <p class="hint err" data-err></p>
      <div class="actions"><button class="btn" data-ok>יצירה</button><button class="btn quiet" data-cancel>ביטול</button></div>`,
    { onClose: () => { if (!done) resolve(null); } });
    const v = (k) => s.wrap.querySelector(`[data-c="${k}"]`).value;
    const err = s.wrap.querySelector('[data-err]');
    s.wrap.querySelector('[data-cancel]').addEventListener('click', () => s.close());
    s.wrap.querySelector('[data-ok]').addEventListener('click', async () => {
      const name = v('name').trim();
      const password = v('password');
      if (!name) { err.textContent = 'הקלידו שם מלא.'; return; }
      if (password.length < 4) { err.textContent = 'בחרו סיסמה של 4 תווים לפחות.'; return; }
      try {
        const entry = await heavy('יוצר תעודה… זה לוקח כמה שניות', async () => {
          const p12 = DS().createSelfSigned({ name, email: v('email').trim(), password });
          return storeCert(p12, DS().p12Info(p12, password));
        });
        toast('התעודה נוצרה ונשמרה בטלפון.');
        done = true;
        resolve(entry);
        s.close();
      } catch (e) {
        console.error(e);
        err.textContent = e.message || 'יצירת התעודה נכשלה.';
      }
    });
    setTimeout(() => s.wrap.querySelector('[data-c="name"]').focus(), 80);
  });
}

/* ---------- חתימות קיימות ---------- */

export function signatureRow(sig) {
  let status, cls;
  if (!sig.intact) { status = sig.error || 'החתימה לא תקינה'; cls = 'bad'; }
  else if (!sig.coversWholeFile) { status = 'החתימה תקינה. נוספו אחריה שינויים או חתימות נוספות.'; cls = 'ok'; }
  else { status = 'החתימה תקינה. המסמך לא שונה מאז החתימה.'; cls = 'ok'; }
  const when = sig.signedAt ? new Date(sig.signedAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const who = sig.selfSigned ? 'תעודה אישית, לא מאושרת ע"י רשות' : sig.certIssuer ? `הונפקה ע"י ${sig.certIssuer} (האמון ברשות לא נבדק)` : '';
  const el = h(`<div class="sig-status ${cls}"><b dir="auto"></b><small></small><small class="st"></small><small></small></div>`);
  const [b, s1, s2, s3] = el.children;
  b.textContent = sig.name || sig.certSubject || 'חותם לא ידוע';
  s1.textContent = when;
  s2.textContent = status;
  s3.textContent = [who, sig.reason ? `סיבה: ${sig.reason}` : ''].filter(Boolean).join(' · ');
  return el;
}

