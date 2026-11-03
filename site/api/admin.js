// ממשק השרת של האזור האישי. כניסה בקישור קסם שנשלח רק ל-ADMIN_EMAIL.
'use strict';
const core = require('./_lib/core');
const { renderUpdate, renderLogin } = require('./_lib/email');
const { CONFIG } = core;

const LOGIN_MINUTES = 15;

module.exports = async (req, res) => {
  const q = req.query || {};
  const b = typeof req.body === 'object' && req.body ? req.body : {};
  const action = q.action || b.action;
  try {
    // ---------- בלי התחברות ----------
    if (action === 'verify' && req.method === 'GET') return verify(req, res, q.t);
    if (action === 'login' && req.method === 'POST') return login(req, res, b);

    // ---------- מכאן רק עם עוגייה חתומה ----------
    // כותרת ייעודית מונעת שליחת בקשות מאתר זר (בנוסף ל-SameSite=Strict).
    if (req.headers['x-eitan-admin'] !== '1') return core.json(res, 403, { error: 'forbidden' });
    if (action === 'me') { const a = core.isAdmin(req); return core.json(res, 200, { admin: a, warnings: a ? warnings() : [] }); }
    if (!core.isAdmin(req)) return core.json(res, 401, { error: 'צריך להתחבר מחדש' });
    if (req.method !== 'POST') return core.json(res, 405, { error: 'method' });

    switch (action) {
      case 'logout':
        res.setHeader('Set-Cookie', core.sessionCookie('', 0));
        return core.json(res, 200, { ok: true });
      case 'list': return list(res);
      case 'contact': return contact(res, b.id);
      case 'remove': return remove(res, b.id);
      case 'delete': return del(res, b.id);
      case 'preview': return preview(req, res, b.campaign);
      case 'test': return test(req, res, b.campaign);
      case 'send': return send(req, res, b.campaign, b.campaignId);
      default: return core.json(res, 400, { error: 'unknown action' });
    }
  } catch (e) {
    console.error('admin', action, e);
    return core.json(res, 500, { error: String(e.message || e) });
  }
};

function warnings() {
  const w = [];
  return w;
}

// ---------- כניסה ----------
async function login(req, res, b) {
  const path = process.env.ADMIN_PATH || '';
  if (!path || !core.safeEqual(String(b.slug || ''), path)) return core.json(res, 404, { error: 'not found' });
  const exp = Date.now() + LOGIN_MINUTES * 60e3;
  const t = exp + '.' + core.sign('login:' + exp);
  const link = core.baseUrl(req) + '/api/admin?action=verify&t=' + encodeURIComponent(t);
  const m = renderLogin(link);
  const r = await core.sendEmail({ to: [CONFIG.adminEmail], subject: m.subject, html: m.html, text: m.text });
  if (!r.ok) return core.json(res, 502, { error: 'שליחת קישור הכניסה נכשלה (' + r.status + ')' });
  return core.json(res, 200, { ok: true, to: CONFIG.adminEmail.replace(/^(.).*(@.*)$/, '$1•••$2') });
}

function verify(req, res, t) {
  const [exp, sig] = String(t || '').split('.');
  const ok = exp && sig && Number(exp) > Date.now() && core.safeEqual(core.sign('login:' + exp), sig);
  res.setHeader('Cache-Control', 'no-store');
  if (!ok) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<!doctype html><meta charset="utf-8"><body dir="rtl" style="font-family:sans-serif;padding:40px">הקישור פג תוקף או לא תקין. חזרו לעמוד הניהול ובקשו קישור חדש.</body>');
  }
  res.statusCode = 302;
  res.setHeader('Set-Cookie', core.sessionCookie(core.makeSession(), 7 * 86400));
  res.setHeader('Location', '/x/' + (process.env.ADMIN_PATH || ''));
  return res.end();
}

// ---------- נרשמים ----------
function slim(c) {
  return { id: c.id, email: c.email, name: [c.first_name, c.last_name].filter(Boolean).join(' '), created_at: c.created_at, blocked: !!c.unsubscribed };
}
async function list(res) {
  const [active, removed] = await Promise.all([core.listSegment(CONFIG.segmentActive), core.listSegment(CONFIG.segmentRemoved)]);
  return core.json(res, 200, { active: active.map(slim), removed: removed.map(slim), warnings: warnings() });
}

async function contact(res, id) {
  const c = await core.getContact(String(id || ''));
  if (!c) return core.json(res, 404, { error: 'לא נמצא' });
  const p = core.flatProps(c.properties);
  const segs = await core.resend('GET', `/contacts/${c.id}/segments?limit=100`);
  const segIds = segs.ok ? (segs.data.data || []).map((s) => s.id) : [];
  return core.json(res, 200, {
    ...slim(c),
    status: segIds.includes(CONFIG.segmentActive) ? 'active' : segIds.includes(CONFIG.segmentRemoved) ? 'removed' : 'none',
    consent: {
      at: p.consent_at || '', source: p.consent_source || '', ip: p.consent_ip || '',
      version: p.consent_text || '', text: core.CONSENT_TEXTS[p.consent_text] || '',
    },
    unsubscribed_at: p.unsubscribed_at || '',
  });
}

async function remove(res, id) {
  const c = await core.getContact(String(id || ''));
  if (!c) return core.json(res, 404, { error: 'לא נמצא' });
  await core.unsubscribe(c.email, 'admin');
  return core.json(res, 200, { ok: true });
}

// מחיקה מלאה (בקשת מחיקה לפי חוק הגנת הפרטיות). אם איש הקשר שייך גם לרשימות אחרות בחשבון הריסנד,
// מוציאים אותו רק מהרשימות של איתןPDF ומנקים את פרטי ההסכמה, כדי לא לפגוע ברשימות האחרות.
async function del(res, id) {
  const c = await core.getContact(String(id || ''));
  if (!c) return core.json(res, 404, { error: 'לא נמצא' });
  const segs = await core.resend('GET', `/contacts/${c.id}/segments?limit=100`);
  const others = segs.ok ? (segs.data.data || []).filter((s) => s.id !== CONFIG.segmentActive && s.id !== CONFIG.segmentRemoved) : [];
  if (!segs.ok || others.length) {
    await core.removeFromSegment(c.id, CONFIG.segmentActive);
    await core.removeFromSegment(c.id, CONFIG.segmentRemoved);
    await core.resend('PATCH', '/contacts/' + c.id, { properties: { consent_at: '-', consent_source: '-', consent_ip: '-', consent_text: '-', unsubscribed_at: '-' } });
    return core.json(res, 200, { ok: true, partial: true });
  }
  const r = await core.resend('DELETE', '/contacts/' + c.id);
  if (!r.ok) return core.json(res, 502, { error: 'המחיקה נכשלה (' + r.status + ')' });
  return core.json(res, 200, { ok: true });
}

// ---------- מיילים ----------
function normCampaign(c) {
  c = c || {};
  const s = (v, n) => String(v == null ? '' : v).slice(0, n);
  const url = s(c.ctaUrl, 500).trim();
  return {
    version: s(c.version, 30).trim(),
    subject: s(c.subject, 150).trim(),
    headline: s(c.headline, 150).trim(),
    intro: s(c.intro, 5000),
    changes: String(c.changes || '').split('\n').map((x) => x.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean).slice(0, 40),
    extra: s(c.extra, 5000),
    ctaText: s(c.ctaText, 60).trim(),
    ctaUrl: /^https:\/\//.test(url) ? url : '',
    markAd: c.markAd !== false,
  };
}
function build(req, campaign, email, name) {
  const base = core.baseUrl(req);
  return renderUpdate(campaign, { name, unsubUrl: base + '/unsubscribe?' + core.unsubParams(email), baseUrl: base });
}

async function preview(req, res, c) {
  const m = build(req, normCampaign(c), CONFIG.adminEmail, 'קובי');
  return core.json(res, 200, { subject: m.subject, html: m.html });
}

async function test(req, res, c) {
  const campaign = normCampaign(c);
  const m = build(req, campaign, CONFIG.adminEmail, 'קובי');
  const r = await core.sendEmail({
    to: [CONFIG.adminEmail], subject: '[בדיקה] ' + m.subject, html: m.html, text: m.text,
    headers: core.listUnsubHeaders(core.baseUrl(req), CONFIG.adminEmail),
  });
  if (!r.ok) return core.json(res, 502, { error: 'שליחת הבדיקה נכשלה: ' + JSON.stringify(r.data) });
  return core.json(res, 200, { ok: true, to: CONFIG.adminEmail });
}

async function send(req, res, c, campaignId) {
  const campaign = normCampaign(c);
  if (!campaign.version && !campaign.headline) return core.json(res, 400, { error: 'חסרים מספר גרסה או כותרת' });
  const id = String(campaignId || '').replace(/[^\w-]/g, '').slice(0, 60);
  if (!id) return core.json(res, 400, { error: 'campaignId' });

  // מי שבוטל אצלו המנוי ברמת החשבון כולו בריסנד (unsubscribed) — לא מקבל, גם אם הוא ברשימה.
  const people = (await core.listSegment(CONFIG.segmentActive)).filter((p) => !p.unsubscribed && core.isEmail(p.email));
  const base = core.baseUrl(req);
  let sent = 0; const errors = [];
  for (let i = 0; i < people.length; i += 100) {
    const chunk = people.slice(i, i + 100);
    const batch = chunk.map((p) => {
      const m = build(req, campaign, p.email, p.first_name || '');
      return { from: CONFIG.from, reply_to: CONFIG.replyTo, to: [p.email], subject: m.subject, html: m.html, text: m.text, headers: core.listUnsubHeaders(base, p.email) };
    });
    // מפתח ייחודי לכל חבילה: לחיצה כפולה על "שליחה" לא תשלח פעמיים.
    const r = await core.resend('POST', '/emails/batch', batch, { 'Idempotency-Key': `${id}-${i / 100}` });
    if (r.ok) sent += chunk.length;
    else errors.push(`נמענים ${i + 1}-${i + chunk.length}: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    if (i + 100 < people.length) await core.sleep(600);
  }

  // תיעוד: סיכום השליחה נשלח למייל של המנהל, כולל העתק של התוכן.
  const m = build(req, campaign, CONFIG.adminEmail, 'קובי');
  await core.sendEmail({
    to: [CONFIG.adminEmail],
    subject: `[נשלח ל-${sent} נמענים] ${m.subject}`,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;padding:16px;background:#FFF7E3;border-bottom:1px solid #F2D79A">סיכום שליחה: נשלח ל-${sent} מתוך ${people.length} נמענים, ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}.${errors.length ? '<br>שגיאות: ' + core.esc(errors.join(' | ')) : ''}<br>להלן ההודעה כפי שנשלחה:</div>` + m.html,
    text: `נשלח ל-${sent} מתוך ${people.length}.\n\n` + m.text,
  });
  return core.json(res, 200, { ok: true, sent, total: people.length, errors });
}
