// מגיש את דף האזור האישי רק בכתובת הנסתרת: /x/<ADMIN_PATH>. כל כתובת אחרת = 404.
// הכתובת עצמה שמורה רק במשתני הסביבה של Vercel, לא בקוד (הריפו ציבורי).
'use strict';
const fs = require('fs');
const path = require('path');
const { safeEqual } = require('./_lib/core');

let html;
module.exports = (req, res) => {
  const want = process.env.ADMIN_PATH || '';
  const slug = String((req.query && req.query.slug) || '');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!want || !safeEqual(slug, want)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Not found');
  }
  if (!html) html = fs.readFileSync(path.join(__dirname, '_lib', 'panel.html'), 'utf8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  res.statusCode = 200;
  return res.end(html);
};
