// רכיבי ממשק קטנים: הודעות, גיליונות תחתונים, מסך טעינה

export const $ = (sel) => document.querySelector(sel);

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** בידוד כיווניות לשם קובץ בתוך משפט עברי (שם באנגלית לא "יתערבב" עם הטקסט) */
export const iso = (s) => `\u2068${s}\u2069`;

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** הודעה קצרה. action: { label, fn } — כפתור בתוך ההודעה (למשל "ביטול") */
export function toast(text, { error = false, ms, action } = {}) {
  const el = h(`<div class="toast${error ? ' error' : ''}" role="status"><span></span></div>`);
  el.firstChild.textContent = text;
  if (action) {
    const b = h('<button class="toast-action"></button>');
    b.textContent = action.label;
    b.addEventListener('click', () => { el.remove(); action.fn(); });
    el.append(b);
  }
  $('#toasts').append(el);
  setTimeout(() => el.remove(), ms || (action ? 5000 : 3200));
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
  $('#toasts').replaceChildren(); // הודעה ישנה לא תסתיר את הגיליון
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

/**
 * תפריט פעולות: items = [{ id, label, icon, sub, disabled }]. מחזיר את ה-id שנבחר, או null.
 * title / note — כותרת והסבר מעל הרשימה
 */
export function menu(items, { title = '', note = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const s = openSheet(`${title ? `<h2>${esc(title)}</h2>` : ''}${note ? `<p>${esc(note)}</p>` : ''}<ul class="menu-list">${items.map((it) => `
      <li><button data-id="${esc(it.id)}" ${it.disabled ? 'disabled' : ''}>${it.icon || ''}<span class="mi-text"><span>${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></button></li>`).join('')}</ul>`,
    { onClose: () => { if (!done) resolve(null); } });
    s.wrap.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => {
      done = true;
      resolve(b.dataset.id);
      s.close();
    }));
  });
}

/** שאלה עם כפתורים: buttons = [{ id, label, primary, danger }]. מחזיר id, או null */
export function choose(title, text, buttons) {
  return new Promise((resolve) => {
    let done = false;
    const s = openSheet(`<h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}
      <div class="actions col">${buttons.map((b) => `<button class="btn ${b.primary ? '' : b.danger ? 'danger' : 'quiet'}" data-id="${esc(b.id)}">${esc(b.label)}</button>`).join('')}</div>`,
    { onClose: () => { if (!done) resolve(null); } });
    s.wrap.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => {
      done = true;
      resolve(b.dataset.id);
      s.close();
    }));
  });
}
