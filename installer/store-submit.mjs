#!/usr/bin/env node
/*
 * הגשת גרסה חדשה לחנות מיקרוסופט (אפליקציית EXE שקובץ ההתקנה שלה מתארח בקישור).
 * עובד ישירות מול Microsoft Store Submission API — בלי תלויות.
 *
 *   node installer/store-submit.mjs <קישור לקובץ ההתקנה> [--dry-run]
 *
 * משתני סביבה (ראו installer/STORE.md):
 *   STORE_TENANT_ID, STORE_CLIENT_ID, STORE_CLIENT_SECRET, STORE_SELLER_ID, STORE_PRODUCT_ID
 *
 * מה קורה: קוראים את ההגשה הנוכחית, מחליפים בה רק את הקישור לקובץ ההתקנה (שפות, ארכיטקטורה
 * ופרמטרים של התקנה שקטה נשארים כמו שהוגדרו ב-Partner Center), ושולחים לאישור של מיקרוסופט.
 * אם הקישור כבר נמצא בהגשה — לא עושים כלום.
 */
const API = 'https://api.store.microsoft.com';
// ברירת מחדל כשאין עדיין חבילה בהגשה. תוכנת ההתקנה (NSIS) מותקנת בשקט עם ‎/S
const DEFAULT_PACKAGE = { languages: ['he'], architectures: ['X64'], isSilentInstall: true, installerParameters: '/S', packageType: 'exe' };
const KEEP = ['languages', 'architectures', 'isSilentInstall', 'installerParameters', 'genericDocUrl', 'packageType'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function nextPackages(current, url) {
  const list = (current && current.packages) || [];
  if (list.some((p) => p.packageUrl === url)) return null; // כבר הוגש
  const base = list[0] || DEFAULT_PACKAGE;
  const pkg = { packageUrl: url };
  for (const k of KEEP) if (base[k] !== undefined && base[k] !== null) pkg[k] = base[k];
  if (!pkg.isSilentInstall && !pkg.installerParameters) pkg.installerParameters = DEFAULT_PACKAGE.installerParameters;
  return { packages: [pkg] };
}

export class Store {
  constructor(env, opts = {}) {
    this.env = env;
    this.fetch = opts.fetch || fetch;
    this.pollMs = opts.pollMs ?? 10000;
    this.timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000;
    this.token = null;
  }

  async login() {
    const r = await this.fetch(`https://login.microsoftonline.com/${this.env.STORE_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.env.STORE_CLIENT_ID,
        client_secret: this.env.STORE_CLIENT_SECRET,
        scope: 'https://api.store.microsoft.com/.default',
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(`ההתחברות נכשלה (${r.status}): ${j.error_description || j.error || 'אין אסימון'}`);
    this.token = j.access_token;
  }

  async call(method, path, body, retry = true) {
    const r = await this.fetch(`${API}/submission/v1/product/${this.env.STORE_PRODUCT_ID}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, 'X-Seller-Account-Id': this.env.STORE_SELLER_ID, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401 && retry) { await this.login(); return this.call(method, path, body, false); }
    const text = await r.text();
    let j;
    try { j = JSON.parse(text); } catch { j = null; }
    if (!j || j.isSuccess === false || !r.ok) {
      const detail = j && j.errors && j.errors.length ? JSON.stringify(j.errors) : text.slice(0, 500);
      throw new Error(`${method} ${path} נכשל (${r.status}): ${detail}`);
    }
    return j;
  }

  /** ממתינים שההגשה תהיה מוכנה לשינוי/שליחה (למשל שמיקרוסופט תסיים להוריד את קובץ ההתקנה) */
  async waitReady(what) {
    const until = Date.now() + this.timeoutMs;
    for (;;) {
      const j = await this.call('GET', '/status');
      const st = j.responseData || {};
      if (st.isReady) return st;
      const bad = (j.errors || []).filter((e) => e.target !== 'packages' || e.code === 'packageuploaderror');
      if (bad.length) throw new Error(`${what}: ${JSON.stringify(bad)}`);
      if (Date.now() > until) throw new Error(`${what}: ההגשה לא מוכנה גם אחרי המתנה ארוכה${st.ongoingSubmissionId ? ` (הגשה ${st.ongoingSubmissionId} עדיין בבדיקה)` : ''}`);
      await sleep(this.pollMs);
    }
  }

  async submit(url, { dryRun = false, log = console.log } = {}) {
    await this.login();
    const current = (await this.call('GET', '/packages')).responseData;
    log('החבילות בהגשה הנוכחית:\n' + JSON.stringify(current, null, 2));
    const next = nextPackages(current, url);
    if (!next) { log('הקישור הזה כבר נמצא בהגשה — אין מה לעדכן.'); return { skipped: true }; }
    log('החבילות החדשות:\n' + JSON.stringify(next, null, 2));
    if (dryRun) { log('הרצת ניסיון — לא נשלח שום דבר לחנות.'); return { dryRun: true }; }
    await this.waitReady('לפני העדכון');
    await this.call('PUT', '/packages', next);
    await this.call('POST', '/packages/commit');
    await this.waitReady('אחרי העלאת החבילה');
    const res = (await this.call('POST', '/submit')).responseData || {};
    const id = res.submissionId || res.ongoingSubmissionId;
    if (!id) throw new Error('ההגשה נשלחה אבל לא התקבל מספר הגשה: ' + JSON.stringify(res));
    log(`נשלח לאישור של מיקרוסופט. מספר הגשה: ${id}`);
    return { submissionId: id };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const url = args.find((a) => !a.startsWith('--'));
  if (!url || !/^https:\/\//.test(url)) throw new Error('שימוש: node installer/store-submit.mjs <קישור https לקובץ ההתקנה> [--dry-run]');
  const need = ['STORE_TENANT_ID', 'STORE_CLIENT_ID', 'STORE_CLIENT_SECRET', 'STORE_SELLER_ID', 'STORE_PRODUCT_ID'];
  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) throw new Error('חסרים משתני סביבה: ' + missing.join(', '));
  // מיקרוסופט מורידה את הקובץ מהקישור — מוודאים שהוא באמת שם
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  if (!head.ok) throw new Error(`קובץ ההתקנה לא נמצא בקישור (${head.status}): ${url}`);
  await new Store(process.env).submit(url, { dryRun });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('::error::' + e.message); process.exit(1); });
}
