// הרשמה לעדכונים מהלייטבוקס בדף הנחיתה.
'use strict';
const core = require('./_lib/core');
const { renderWelcome } = require('./_lib/email');
const { CONFIG } = core;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return core.json(res, 405, { error: 'method' });
  try {
    const b = typeof req.body === 'object' && req.body ? req.body : {};
    // מלכודת לבוטים: שדה מוסתר שאדם לא ממלא, ומילוי מהיר מדי.
    if (b.website || (Number(b.elapsed) > 0 && Number(b.elapsed) < 1500)) return core.json(res, 200, { ok: true });

    const email = core.clean(b.email, 254).toLowerCase();
    const name = core.clean(b.name, 60);
    const source = ['auto', 'download', 'footer'].includes(b.source) ? b.source : 'other';
    if (!core.isEmail(email)) return core.json(res, 400, { error: 'כתובת המייל לא תקינה' });
    // ההסכמה חייבת להיות פעולה אקטיבית של הנרשם (תיבה לא מסומנת מראש).
    if (b.consent !== true) return core.json(res, 400, { error: 'צריך לאשר קבלת עדכונים' });

    const properties = {
      consent_at: new Date().toISOString(),
      consent_source: 'pdf.m-eitan.co.il / ' + source,
      consent_ip: core.clientIp(req),
      consent_text: core.CONSENT_VERSION,
    };

    const existing = await core.getContact(email);
    let alreadyActive = false;
    if (!existing) {
      const r = await core.resend('POST', '/contacts', {
        email, first_name: name || undefined, unsubscribed: false, properties,
        segments: [{ id: CONFIG.segmentActive }],
      });
      if (!r.ok) throw new Error('create contact ' + r.status + ' ' + JSON.stringify(r.data));
    } else {
      const segs = await core.resend('GET', `/contacts/${existing.id}/segments?limit=100`);
      alreadyActive = !!(segs.ok && (segs.data.data || []).some((s) => s.id === CONFIG.segmentActive));
      const patch = { properties };
      if (name) patch.first_name = name;
      await core.resend('PATCH', '/contacts/' + existing.id, patch);
      if (!alreadyActive) await core.addToSegment(existing.id, CONFIG.segmentActive);
      await core.removeFromSegment(existing.id, CONFIG.segmentRemoved);
    }

    if (!alreadyActive) {
      const base = core.baseUrl(req);
      const unsubUrl = base + '/unsubscribe?' + core.unsubParams(email);
      const m = renderWelcome({ name, unsubUrl, baseUrl: base });
      await core.sendEmail({
        to: [email], subject: m.subject, html: m.html, text: m.text,
        headers: core.listUnsubHeaders(base, email),
      });
    }
    return core.json(res, 200, { ok: true, already: alreadyActive });
  } catch (e) {
    console.error('subscribe', e);
    return core.json(res, 500, { error: 'משהו השתבש. נסו שוב בעוד רגע.' });
  }
};

