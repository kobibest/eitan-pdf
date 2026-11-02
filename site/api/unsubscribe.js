// הסרה מרשימת התפוצה.
// POST מדף ההסרה (JSON: {e,t}) או POST "בלחיצה אחת" של Gmail/Outlook (הפרמטרים בכתובת, RFC 8058).
// GET מפנה לדף ההסרה, שמבצע את ההסרה מיד בטעינה.
'use strict';
const core = require('./_lib/core');

module.exports = async (req, res) => {
  const q = req.query || {};
  if (req.method === 'GET') {
    res.statusCode = 302;
    res.setHeader('Location', '/unsubscribe?e=' + encodeURIComponent(q.e || '') + '&t=' + encodeURIComponent(q.t || ''));
    return res.end();
  }
  if (req.method !== 'POST') return core.json(res, 405, { error: 'method' });
  const b = typeof req.body === 'object' && req.body ? req.body : {};
  const email = core.checkUnsub(b.e || q.e, b.t || q.t);
  if (!email) return core.json(res, 400, { error: 'הקישור לא תקין. אפשר להשיב לכל מייל שקיבלתם ולכתוב "הסר".' });
  try {
    const oneClick = !b.e && !!q.e;
    await core.unsubscribe(email, oneClick ? 'one-click' : 'link');
    return core.json(res, 200, { ok: true, email });
  } catch (e) {
    console.error('unsubscribe', e);
    return core.json(res, 500, { error: 'ההסרה לא הצליחה כרגע. נסו שוב, או השיבו לכל מייל שקיבלתם ונסיר אתכם ידנית.' });
  }
};
