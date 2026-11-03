// רכיבי ממשק קטנים: הודעות, גיליונות תחתונים, מסך טעינה

export const $ = (sel) => document.querySelector(sel);

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(text, { error = false, ms = 3200 } = {}) {
  const el = h(`<div class="toast${error ? ' error' : ''}" role="status"></div>`);
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), ms);
}

let busyCount = 0;
export function busy(on, text = 'פותח…') {
  busyCount = Math.max(0, busyCount + (on ? 1 : -1));
  $('#busy-text').textContent = text;
  $('#busy').hidden = busyCount === 0;
}

/* ---------- גיליונות ---------- */

const sheets = [];

/** פתיחת גיליון תחתון. מחזיר את האלמנט; onClose נקרא כשנסגר (גם בכפתור "חזרה") */
export function openSheet(innerHtml, { onClose } = {}) {
  const root = $('#sheet-root');
  const wrap = h(`<div class="sheet-wrap"><div class="sheet-veil"></div><div class="sheet" role="dialog" aria-modal="true">${innerHtml}</div></div>`);
  const entry = { wrap, onClose };
  wrap.querySelector('.sheet-veil').addEventListener('click', () => closeSheet(entry));
  root.append(wrap);
  sheets.push(entry);
  entry.close = () => closeSheet(entry);
  return entry;
}

function closeSheet(entry) {
  const i = sheets.indexOf(entry);
  if (i < 0) return;
  sheets.splice(i, 1);
  entry.wrap.remove();
  if (entry.onClose) entry.onClose();
}

/** סגירת הגיליון העליון. מחזיר true אם היה גיליון פתוח */
export function closeTopSheet() {
  const top = sheets[sheets.length - 1];
  if (!top) return false;
  closeSheet(top);
  return true;
}

/** שאלה עם שדה טקסט. מחזיר את הערך, או null בביטול */
export function prompt({ title, text = '', value = '', type = 'text', ok = 'אישור', inputmode = '' }) {
  return new Promise((resolve) => {
    let done = false;
    const s = openSheet(`
      <h2>${esc(title)}</h2>
      ${text ? `<p>${esc(text)}</p>` : ''}
      <form>
        <input class="field" type="${type}" ${inputmode ? `inputmode="${inputmode}"` : ''} autocomplete="off" value="${esc(value)}">
        <div class="actions">
          <button class="btn" type="submit">${esc(ok)}</button>
          <button class="btn quiet" type="button" data-cancel>ביטול</button>
        </div>
      </form>`, { onClose: () => { if (!done) resolve(null); } });
    const form = s.wrap.querySelector('form');
    const input = form.querySelector('input');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      done = true;
      resolve(input.value);
      s.close();
    });
    form.querySelector('[data-cancel]').addEventListener('click', () => s.close());
    setTimeout(() => { input.focus(); input.select(); }, 60);
  });
}

/** תפריט פעולות: items = [{ id, label, icon }]. מחזיר את ה-id שנבחר, או null */
export function menu(items) {
  return new Promise((resolve) => {
    let done = false;
    const s = openSheet(`<ul class="menu-list">${items.map((it) => `
      <li><button data-id="${esc(it.id)}">${it.icon || ''}<span>${esc(it.label)}</span></button></li>`).join('')}</ul>`,
    { onClose: () => { if (!done) resolve(null); } });
    s.wrap.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => {
      done = true;
      resolve(b.dataset.id);
      s.close();
    }));
  });
}
