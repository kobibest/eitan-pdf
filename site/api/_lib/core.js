// כלים משותפים לפונקציות השרת של דף הנחיתה: ריסנד, חתימות, עוגיות, בסיס כתובות.
// אין תלויות חיצוניות — רק fetch ו-crypto של Node.
'use strict';
const crypto = require('crypto');

const CONFIG = {
  // שתי רשימות בריסנד: הרשומים הפעילים, ומי שביקש להסיר (נשמרים לתיעוד ההסרה).
  segmentActive: process.env.SEGMENT_ACTIVE_ID || '89bc6b94-d44c-4fd5-991e-d447e9dee9ec',
  segmentRemoved: process.env.SEGMENT_REMOVED_ID || '6a5070e6-6140-4033-9f6f-9d64c9bd5980',
  from: process.env.MAIL_FROM || 'איתןPDF <updates@m-eitan.co.il>',
  replyTo: process.env.MAIL_REPLY_TO || 'kobi@eitan-m.co.il',
  adminEmail: (process.env.ADMIN_EMAIL || 'kobi@eitan-m.co.il').toLowerCase(),
  senderName: process.env.SENDER_NAME || 'קובי איתן',
  senderAddress: process.env.SENDER_ADDRESS || '',
  productionUrl: 'https://pdf.m-eitan.co.il',
};

// נוסח ההסכמה שהנרשם אישר. כל שינוי בנוסח = גרסה חדשה, כדי שאפשר יהיה להוכיח למה בדיוק הסכימו.
const CONSENT_TEXTS = {
  'v1': 'אני מאשר/ת לקבל מאיתןPDF (קובי איתן) הודעות דוא"ל על גרסאות חדשות ועדכונים לתוכנה. אפשר להסיר את עצמי בכל עת, בקישור שמופיע בכל הודעה או בתשובה למייל.',
};
const CONSENT_VERSION = 'v1';

function secret() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 16) throw new Error('APP_SECRET חסר');
  return s;
}
function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---------- קישורי הסרה ----------
function b64(s) { return Buffer.from(s, 'utf8').toString('base64url'); }
function unb64(s) { try { return Buffer.from(String(s), 'base64url').toString('utf8'); } catch { return ''; } }
function unsubToken(email) { return sign('unsub:' + email.toLowerCase()).slice(0, 32); }
function unsubParams(email) { return 'e=' + b64(email.toLowerCase()) + '&t=' + unsubToken(email); }
function checkUnsub(e, t) {
  const email = unb64(e).toLowerCase();
  if (!isEmail(email) || !t) return null;
  return safeEqual(unsubToken(email), t) ? email : null;
}

// כותרות שמאפשרות ל-Gmail/Outlook להציג כפתור "ביטול הרשמה" ולהסיר בלחיצה אחת (RFC 8058).
function listUnsubHeaders(base, email) {
  return {
    'List-Unsubscribe': `<${base}/api/unsubscribe?${unsubParams(email)}>, <mailto:${CONFIG.replyTo}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

// ---------- כתובת בסיס ----------
function baseUrl(req) {
  if (process.env.VERCEL_ENV === 'production') return CONFIG.productionUrl;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return host ? 'https://' + host : CONFIG.productionUrl;
}

// ---------- ולידציה ----------
function isEmail(s) {
  return typeof s === 'string' && s.length <= 254 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(s);
}
function clean(s, max) {
  return String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- ריסנד ----------
async function resend(method, path, body, extraHeaders) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY חסר');
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch('https://api.resend.com' + path, {
      method,
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(extraHeaders || {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (r.status === 429) { await sleep(1000 * (attempt + 1)); continue; }
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { ok: r.ok, status: r.status, data };
  }
  return { ok: false, status: 429, data: { message: 'rate limited' } };
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function getContact(idOrEmail) {
  const r = await resend('GET', '/contacts/' + encodeURIComponent(idOrEmail));
  return r.ok ? r.data : null;
}
// מאפיינים מגיעים כ-{key:{type,value}} או כ-{key:value}; מחזירים {key:value}.
function flatProps(p) {
  const out = {};
  for (const [k, v] of Object.entries(p || {})) out[k] = v && typeof v === 'object' && 'value' in v ? v.value : v;
  return out;
}
async function listSegment(segmentId) {
  const all = [];
  let after = '';
  for (let i = 0; i < 500; i++) {
    const r = await resend('GET', `/segments/${segmentId}/contacts?limit=100${after ? '&after=' + after : ''}`);
    if (!r.ok) throw new Error('שגיאה בקריאת רשימת הנרשמים מריסנד (' + r.status + ')');
    const rows = (r.data && r.data.data) || [];
    all.push(...rows);
    if (!r.data.has_more || !rows.length) break;
    after = rows[rows.length - 1].id;
  }
  return all;
}
async function addToSegment(idOrEmail, seg) {
  return resend('POST', `/contacts/${encodeURIComponent(idOrEmail)}/segments/${seg}`);
}
async function removeFromSegment(idOrEmail, seg) {
  return resend('DELETE', `/contacts/${encodeURIComponent(idOrEmail)}/segments/${seg}`);
}

// הסרה: יוצא מהרשימה הפעילה, נכנס לרשימת המוסרים, ונרשם מועד ההסרה.
async function unsubscribe(email, how) {
  const c = await getContact(email);
  if (!c) return false;
  await removeFromSegment(c.id, CONFIG.segmentActive);
  await addToSegment(c.id, CONFIG.segmentRemoved);
  await resend('PATCH', '/contacts/' + c.id, { properties: { unsubscribed_at: new Date().toISOString() + ' (' + how + ')' } });
  return true;
}

async function sendEmail(msg) {
  return resend('POST', '/emails', { from: CONFIG.from, reply_to: CONFIG.replyTo, ...msg });
}

// ---------- עוגיית האזור האישי ----------
const COOKIE = 'eadm';
const SESSION_DAYS = 7;
function makeSession() {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  return exp + '.' + sign('sess:' + exp);
}
function readCookie(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
}
function isAdmin(req) {
  const v = readCookie(req, COOKIE);
  const [exp, sig] = v.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sign('sess:' + exp), sig);
}
function sessionCookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
function clientIp(req) {
  return String(req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || '').trim().slice(0, 64);
}

module.exports = {
  CONFIG, CONSENT_TEXTS, CONSENT_VERSION,
  sign, safeEqual, unsubParams, listUnsubHeaders, checkUnsub, baseUrl, isEmail, clean, esc,
  resend, sleep, getContact, flatProps, listSegment, addToSegment, removeFromSegment, unsubscribe, sendEmail,
  makeSession, isAdmin, sessionCookie, json, clientIp,
};
