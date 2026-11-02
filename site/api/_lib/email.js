// תבניות המייל. HTML מבוסס טבלאות וסגנונות מוטבעים, כדי שייראה נכון גם ב-Outlook וב-Gmail.
// כל מייל לנרשמים כולל את מה שחוק התקשורת (סעיף 30א) דורש: זהות השולח ודרכי קשר,
// הסבר למה הנמען מקבל את המייל, וקישור הסרה פשוט וחינמי (וגם אפשרות להשיב "הסר").
'use strict';
const { CONFIG, esc } = require('./core');

const C = { navy: '#0B2A82', deep: '#081E63', gold: '#F5B227', ink: '#14203A', ink2: '#48557A', ink3: '#7884A3', line: '#E3E9F4', desk: '#EEF2F9' };
const FONT = "Arial, 'Segoe UI', Helvetica, sans-serif";

function paragraphs(text) {
  return String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:${C.ink2};">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}
function textParagraphs(text) {
  return String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).join('\n\n');
}

function legalFooterHtml(unsubUrl, reason) {
  const addr = CONFIG.senderAddress ? ' · ' + esc(CONFIG.senderAddress) : '';
  return `
  <tr><td style="padding:22px 32px 26px;border-top:1px solid ${C.line};font-family:${FONT};font-size:13px;line-height:1.7;color:${C.ink3};text-align:right;" dir="rtl">
    ${esc(reason)}<br>
    לא רוצים לקבל יותר מיילים כאלה? <a href="${esc(unsubUrl)}" style="color:${C.navy};font-weight:bold;text-decoration:underline;">להסרה מרשימת התפוצה</a> — בלחיצה אחת, בלי עלות. אפשר גם פשוט להשיב למייל הזה ולכתוב "הסר".<br>
    נשלח על ידי ${esc(CONFIG.senderName)} (איתןPDF)${addr} · <a href="mailto:${esc(CONFIG.replyTo)}" style="color:${C.ink3};">${esc(CONFIG.replyTo)}</a> · <a href="${CONFIG.productionUrl}" style="color:${C.ink3};">pdf.m-eitan.co.il</a>
  </td></tr>`;
}
function legalFooterText(unsubUrl, reason) {
  const addr = CONFIG.senderAddress ? ', ' + CONFIG.senderAddress : '';
  return `---\n${reason}\nלהסרה מרשימת התפוצה (בלחיצה אחת, בלי עלות): ${unsubUrl}\nאפשר גם להשיב למייל הזה ולכתוב "הסר".\nנשלח על ידי ${CONFIG.senderName} (איתןPDF)${addr} · ${CONFIG.replyTo} · ${CONFIG.productionUrl}`;
}

function shell({ preheader, title, body, footer, logoUrl }) {
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.desk};" dir="rtl">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.desk};" dir="rtl">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;" dir="rtl">
    <tr><td style="background:${C.navy};padding:22px 32px;text-align:right;" dir="rtl">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="rtl"><tr>
        <td style="padding-left:10px;"><img src="${logoUrl}" width="36" height="36" alt="" style="display:block;border:0;"></td>
        <td style="font-family:${FONT};font-size:22px;font-weight:bold;color:#ffffff;">איתן<span style="color:${C.gold};">PDF</span></td>
      </tr></table>
    </td></tr>
    ${body}
    ${footer}
  </table>
</td></tr></table>
</body></html>`;
}

function button(url, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;" dir="rtl"><tr>
    <td style="background:${C.gold};border-radius:10px;">
      <a href="${esc(url)}" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:17px;font-weight:bold;color:${C.deep};text-decoration:none;">${esc(label)}</a>
    </td></tr></table>`;
}

const UPDATE_REASON = 'קיבלתם את המייל הזה כי נרשמתם באתר איתןPDF לקבלת עדכונים על גרסאות חדשות של התוכנה.';

// מייל עדכון גרסה.
// c: { version, headline, intro, changes: string[], extra, ctaText, ctaUrl, markAd }
function renderUpdate(c, { name, unsubUrl, baseUrl }) {
  const hello = name ? `שלום ${name},` : 'שלום,';
  const headline = c.headline || (c.version ? `גרסה ${c.version} של איתןPDF זמינה להורדה` : 'עדכון לאיתןPDF');
  const ctaUrl = c.ctaUrl || CONFIG.productionUrl + '/download';
  const ctaText = c.ctaText || 'להורדת הגרסה החדשה';
  const changes = (c.changes || []).filter(Boolean);

  const changesHtml = changes.length ? `
      <h2 style="margin:6px 0 10px;font-family:${FONT};font-size:18px;color:${C.ink};">מה חדש</h2>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;" dir="rtl">
        ${changes.map((x) => `<tr>
          <td valign="top" width="22" style="font-family:${FONT};font-size:16px;line-height:1.7;color:${C.gold};font-weight:bold;">✓</td>
          <td style="font-family:${FONT};font-size:16px;line-height:1.7;color:${C.ink};padding-bottom:6px;">${esc(x)}</td></tr>`).join('')}
      </table>` : '';

  const body = `
    <tr><td style="padding:30px 32px 6px;font-family:${FONT};text-align:right;" dir="rtl">
      ${c.version ? `<div style="display:inline-block;background:#E5EDFD;color:${C.navy};font-size:13px;font-weight:bold;padding:3px 12px;border-radius:20px;margin-bottom:12px;">גרסה ${esc(c.version)}</div>` : ''}
      <h1 style="margin:0 0 16px;font-size:26px;line-height:1.3;color:${C.ink};">${esc(headline)}</h1>
      <p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:${C.ink};">${esc(hello)}</p>
      ${paragraphs(c.intro)}
      ${changesHtml}
      ${paragraphs(c.extra)}
      ${button(ctaUrl, ctaText)}
      <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:${C.ink3};">ההתקנה מעדכנת את הגרסה הקיימת במקום, והחתימות וההגדרות השמורות נשארות.</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:${C.ink};">תודה שאתם משתמשים באיתןPDF,<br>${esc(CONFIG.senderName)}</p>
    </td></tr>`;

  const html = shell({
    preheader: changes[0] || headline, title: headline, body,
    footer: legalFooterHtml(unsubUrl, UPDATE_REASON), logoUrl: baseUrl + '/logo.png',
  });
  const text = [
    headline, '', hello, '', textParagraphs(c.intro),
    changes.length ? '\nמה חדש:\n' + changes.map((x) => '• ' + x).join('\n') : '',
    c.extra ? '\n' + textParagraphs(c.extra) : '',
    `\n${ctaText}: ${ctaUrl}`, 'ההתקנה מעדכנת את הגרסה הקיימת במקום, והחתימות וההגדרות השמורות נשארות.',
    `\nתודה שאתם משתמשים באיתןPDF,\n${CONFIG.senderName}\n`, legalFooterText(unsubUrl, UPDATE_REASON),
  ].join('\n');
  return { subject: updateSubject(c), html, text };
}

// לפי סעיף 30א(ה)(1) לחוק התקשורת, הודעה שהיא "דבר פרסומת" צריכה להתחיל במילה "פרסומת" בשורת הנושא.
function updateSubject(c) {
  const base = c.subject || (c.version ? `איתןPDF ${c.version} זמינה להורדה` : 'עדכון מאיתןPDF');
  return (c.markAd !== false && !/^פרסומת/.test(base) ? 'פרסומת: ' : '') + base;
}

// אישור הרשמה — נשלח מיד אחרי ההרשמה.
function renderWelcome({ name, unsubUrl, baseUrl }) {
  const hello = name ? `שלום ${name},` : 'שלום,';
  const reason = 'קיבלתם את המייל הזה כי ממש עכשיו נרשמתם באתר איתןPDF לקבלת עדכונים. אם זה לא הייתם אתם, לחצו על קישור ההסרה ולא תקבלו מאיתנו יותר מיילים.';
  const body = `
    <tr><td style="padding:30px 32px 6px;font-family:${FONT};text-align:right;" dir="rtl">
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:${C.ink};">נרשמתם לעדכונים של איתןPDF</h1>
      <p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:${C.ink};">${esc(hello)}</p>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:${C.ink2};">תודה! מעכשיו תקבלו מייל קצר כשתצא גרסה חדשה של איתןPDF, עם מה שהשתנה וקישור להורדה. לא נשלח יותר מזה, ולא נעביר את הכתובת שלכם לאף אחד.</p>
      ${button(CONFIG.productionUrl + '/download', 'להורדת הגרסה הנוכחית')}
      <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:${C.ink};">${esc(CONFIG.senderName)}</p>
    </td></tr>`;
  const html = shell({ preheader: 'תודה! נעדכן אתכם כשתצא גרסה חדשה.', title: 'נרשמתם לעדכונים', body, footer: legalFooterHtml(unsubUrl, reason), logoUrl: baseUrl + '/logo.png' });
  const text = `נרשמתם לעדכונים של איתןPDF\n\n${hello}\n\nתודה! מעכשיו תקבלו מייל קצר כשתצא גרסה חדשה של איתןPDF, עם מה שהשתנה וקישור להורדה. לא נשלח יותר מזה, ולא נעביר את הכתובת שלכם לאף אחד.\n\nלהורדת הגרסה הנוכחית: ${CONFIG.productionUrl}/download\n\n${CONFIG.senderName}\n\n${legalFooterText(unsubUrl, reason)}`;
  return { subject: 'נרשמתם לעדכונים של איתןPDF', html, text };
}

// קישור כניסה לאזור האישי.
function renderLogin(link) {
  const body = `<tr><td style="padding:30px 32px;font-family:${FONT};text-align:right;" dir="rtl">
      <h1 style="margin:0 0 14px;font-size:22px;color:${C.ink};">כניסה לאזור הניהול</h1>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:${C.ink2};">לחצו כדי להיכנס. הקישור תקף ל-15 דקות. אם לא ביקשתם להיכנס, אפשר להתעלם מהמייל.</p>
      ${button(link, 'כניסה')}
    </td></tr>`;
  return {
    subject: 'קישור כניסה לניהול איתןPDF',
    html: shell({ preheader: 'קישור כניסה, תקף ל-15 דקות', title: 'כניסה', body, footer: '', logoUrl: CONFIG.productionUrl + '/logo.png' }),
    text: `כניסה לאזור הניהול של איתןPDF (תקף ל-15 דקות):\n${link}`,
  };
}

module.exports = { renderUpdate, renderWelcome, renderLogin, updateSubject };
