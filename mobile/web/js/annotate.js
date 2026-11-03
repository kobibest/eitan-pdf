/*
 * שכבה מעל העמודים בצפייה: חותמות (חתימה / טקסט / תאריך) ושדות טופס.
 *
 * מיקומים נשמרים ביחידות PDF של העמוד כפי שהוא מוצג (ראשית בפינה השמאלית-עליונה),
 * בדיוק כמו בדסקטופ, ומוצגים באחוזים מגודל העמוד — כך שזום לא מזיז אותם.
 * גודל הטקסט מחושב ב-CSS מתוך --s (קנה המידה של הצפייה).
 */
import { h, esc } from './ui.js';

export class Annotator {
  /**
   * viewer — הצפייה. hooks:
   *  onChange() — המסמך השתנה (לעדכון כותרת / "לא נשמר")
   *  onEditText(item) — הקשה על טקסט נבחר: פתיחת עורך
   *  onField(srcId, field) — הקשה על שדה טופס
   */
  constructor(viewer, hooks) {
    this.viewer = viewer;
    this.hooks = hooks;
    this.doc = null;
    this.selected = null;   // id של החותמת הנבחרת
    this.fieldsByPage = []; // לכל עמוד בצפייה: [{ srcId, field, box }]
    viewer.scroller.addEventListener('click', (e) => {
      if (!e.target.closest('.item, .field')) this.select(null);
    });
  }

  /** אחרי כל viewer.open */
  async attach(doc) {
    this.doc = doc;
    const refs = this.viewer.refs;
    this.fieldsByPage = refs.map(() => []);
    const pages = doc.pages;
    for (let i = 0; i < refs.length; i++) {
      const p = pages[i];
      const fields = await doc.fields(p.src);
      if (this.doc !== doc) return;
      const vp = this.viewer.viewports[i];
      for (const f of fields.filter((x) => x.page === p.index)) {
        const r = f.rect;
        const [x1, y1, x2, y2] = vp.convertToViewportRectangle([r.x, r.y, r.x + r.width, r.y + r.height]);
        this.fieldsByPage[i].push({ srcId: p.src, field: f, box: { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) } });
      }
    }
    this.renderAll();
  }

  /** כל שדות הטופס במסמך, לפי סדר העמודים (למעבר "הבא") */
  allFields() {
    const out = [];
    this.fieldsByPage.forEach((list, i) => list.forEach((f) => out.push({ ...f, page: i })));
    return out;
  }

  renderAll() {
    this.viewer.els.forEach((_, i) => this.renderPage(i));
  }

  renderPage(i) {
    const el = this.viewer.els[i];
    if (!el || !this.doc) return;
    const ov = el.querySelector('.overlay');
    const p = this.doc.pages[i];
    const sz = this.viewer.sizes[i];
    ov.replaceChildren();
    this.extrasPreview(ov, i, sz);
    for (const fb of this.fieldsByPage[i] || []) ov.append(this.fieldEl(fb, sz));
    for (const it of this.doc.stamps[p.key] || []) ov.append(this.itemEl(it, i, sz));
  }

  /** רענון חותמת/שדה אחד אחרי שינוי */
  refresh() {
    this.renderAll();
  }

  /* ---------- תצוגה מקדימה: סימן מים ומספרי עמודים ---------- */

  extrasPreview(ov, i, sz) {
    const ex = this.doc.extras;
    const wm = ex.watermark;
    if (wm.enabled && wm.text.trim()) {
      const el = h('<div class="wm-preview" aria-hidden="true"><span dir="auto"></span></div>');
      const t = el.firstChild;
      t.textContent = wm.text;
      t.style.fontSize = `calc(var(--s) * ${wm.size}px)`;
      t.style.color = wm.color;
      t.style.opacity = wm.opacity;
      ov.append(el);
    }
    const pn = ex.pageNumbers;
    const n = this.doc.pages.length;
    if (pn.enabled && !(pn.skipFirst && i === 0)) {
      const el = h('<div class="pn-preview" aria-hidden="true"></div>');
      el.textContent = pn.format.replace('{n}', String(i + 1)).replace('{total}', String(n));
      const pos = pn.position || 'bottom-center';
      // כמו applyPageNumbers במנוע: שוליים של 24 יחידות
      el.style.fontSize = `calc(var(--s) * ${pn.size || 10}px)`;
      el.style.left = el.style.right = (24 / sz.w) * 100 + '%';
      // ראש התיבה במנוע: למעלה 24 − 0.2·גודל מהקצה; למטה התחתית ב-24 − 0.15·גודל (שורה של 1.25)
      const size = pn.size || 10;
      el.style[pos.startsWith('top') ? 'top' : 'bottom'] = ((pos.startsWith('top') ? 24 - size * 0.2 : 24 - size * 0.15) / sz.h) * 100 + '%';
      el.style.textAlign = pos.endsWith('right') ? 'right' : pos.endsWith('left') ? 'left' : 'center';
      ov.append(el);
    }
  }

  /* ---------- שדות טופס ---------- */

  fieldEl({ srcId, field, box }, sz) {
    const el = h(`<div class="field type-${field.type}" role="button"></div>`);
    pos(el, box, sz);
    const v = this.doc.fieldValue(srcId, field);
    const changed = this.doc.formValues[srcId] && field.name in this.doc.formValues[srcId];
    el.classList.toggle('filled', !!v);
    if (field.type === 'CheckBox') {
      if (changed) el.innerHTML = v ? '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : '';
      el.classList.toggle('changed', changed);
    } else if (changed) {
      // ערך שהמשתמש הקליד: מוצג מעל המראה המקורי של השדה
      el.classList.add('changed');
      const t = h('<span class="fv" dir="auto"></span>');
      t.textContent = String(v || '');
      const size = Math.max(4, Math.min(11, box.h * 0.7));
      t.style.fontSize = `calc(var(--s) * ${size}px)`;
      el.append(t);
    }
    el.addEventListener('click', (e) => { e.stopPropagation(); this.select(null); this.hooks.onField(srcId, field); });
    return el;
  }

  /* ---------- חותמות ---------- */

  itemEl(it, i, sz) {
    const sel = this.selected === it.id;
    const el = h(`<div class="item kind-${it.type}${sel ? ' selected' : ''}" data-id="${esc(it.id)}"></div>`);
    if (it.type === 'image') {
      pos(el, it, sz);
      el.append(h(`<img src="${esc(it.image)}" alt="" draggable="false">`));
    } else if (it.type === 'redact') {
      pos(el, it, sz);
      el.title = 'השחרה: התוכן מתחת יימחק בשמירה';
    } else {
      pos(el, { x: it.x, y: it.y, w: it.w }, sz);
      const t = h('<div class="txt" dir="auto"></div>');
      t.textContent = it.text;
      t.style.fontSize = `calc(var(--s) * ${it.size}px)`;
      t.style.color = it.color;
      t.style.fontWeight = it.bold ? '700' : '400';
      t.style.textAlign = it.align || 'right';
      el.append(t);
    }
    if (sel) {
      const del = h('<button class="item-del" aria-label="מחיקה"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>');
      del.addEventListener('click', (e) => { e.stopPropagation(); this.remove(it.id); });
      el.append(del, h('<span class="item-grip" aria-label="שינוי גודל"></span>'));
      if (it.type === 'text') {
        const ed = h('<button class="item-edit" aria-label="עריכה"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button>');
        ed.addEventListener('click', (e) => { e.stopPropagation(); this.hooks.onEditText(it); });
        el.append(ed);
      }
    }
    this.bindItem(el, it, i);
    return el;
  }

  select(id) {
    if (this.selected === id) return;
    this.selected = id;
    this.renderAll();
  }

  remove(id) {
    this.doc.removeStamp(id);
    this.selected = null;
    this.renderAll();
    this.hooks.onChange({ removed: true });
  }

  /** גרירה להזזה, וגרירת הפינה לשינוי גודל. הקשה על חותמת נבחרת מסוג טקסט — עריכה */
  bindItem(el, it, i) {
    let g = null;
    const sz = () => this.viewer.sizes[i];
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return; // שתי אצבעות — זום של הצפייה
      e.stopPropagation();
      const t = e.touches[0];
      const resize = !!e.target.closest('.item-grip');
      if (e.target.closest('.item-del, .item-edit')) return;
      g = { x0: t.clientX, y0: t.clientY, it0: { ...it }, resize, moved: false, wasSelected: this.selected === it.id };
      if (!g.wasSelected) { this.selected = it.id; this.renderAll(); }
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (!g || e.touches.length !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      const t = e.touches[0];
      const k = this.viewer.scale;
      const dx = (t.clientX - g.x0) / k, dy = (t.clientY - g.y0) / k;
      if (!g.moved && Math.hypot(dx * k, dy * k) < 6) return;
      if (!g.moved) { g.moved = true; this.doc.snapshot(); }
      const s = sz();
      const target = this.viewer.els[i].querySelector(`.item[data-id="${CSS.escape(it.id)}"]`);
      if (g.resize) {
        // הפינה בצד שמאל-למטה: גרירה שמאלה/למטה מגדילה
        const w0 = g.it0.w;
        const w = Math.max(20, Math.min(s.w, w0 - dx));
        const r = w / w0;
        it.w = w;
        it.x = Math.max(0, g.it0.x + w0 - w);
        if (it.type === 'image') it.h = g.it0.h * r;
        else if (it.type === 'redact') it.h = Math.max(6, Math.min(s.h - it.y, g.it0.h + dy)); // השחרה: רוחב וגובה בנפרד
        else it.size = Math.max(4, Math.min(72, g.it0.size * r));
      } else {
        it.x = Math.max(0, Math.min(s.w - it.w, g.it0.x + dx));
        const hgt = it.h != null ? it.h : (target ? target.offsetHeight / k : it.size * 1.25);
        it.y = Math.max(0, Math.min(s.h - hgt, g.it0.y + dy));
      }
      if (target) {
        pos(target, it.h != null ? it : { x: it.x, y: it.y, w: it.w }, s);
        const txt = target.querySelector('.txt');
        if (txt) txt.style.fontSize = `calc(var(--s) * ${it.size}px)`;
      }
    }, { passive: false });
    const end = (e) => {
      if (!g) return;
      e.stopPropagation();
      const was = g;
      g = null;
      if (was.moved) {
        this.doc.dirty = true;
        this.hooks.onChange({});
      } else if (was.wasSelected && it.type === 'text' && e.type === 'touchend') {
        this.hooks.onEditText(it);
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    // במחשב (בדיקות): לחיצה בוחרת
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('.item-del, .item-edit')) return;
      if (this.selected !== it.id) this.select(it.id);
    });
  }
}

/** מיקום באחוזים מגודל העמוד */
function pos(el, r, sz) {
  el.style.left = (r.x / sz.w) * 100 + '%';
  el.style.top = (r.y / sz.h) * 100 + '%';
  el.style.width = (r.w / sz.w) * 100 + '%';
  if (r.h != null) el.style.height = (r.h / sz.h) * 100 + '%';
}
