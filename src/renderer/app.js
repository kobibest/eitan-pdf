// איתןPDF — ממשק
import * as pdfjsLib from '../../node_modules/pdfjs-dist/build/pdf.min.mjs';

const { PdfOps: Ops } = window;
const api = window.api;
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
const PDFJS_OPTS = {
  cMapUrl: new URL('../../node_modules/pdfjs-dist/cmaps/', import.meta.url).href,
  cMapPacked: true,
  standardFontDataUrl: new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).href,
  isEvalSupported: false,
};

/* =========================================================
 * אייקונים (קו דק, באותו משקל לכל האפליקציה)
 * ======================================================= */
const ICONS = {
  rotL: '<path d="M4 9a8 8 0 1 1 1.5 7.5"/><path d="M4 4v5h5"/>',
  rotR: '<path d="M20 9a8 8 0 1 0-1.5 7.5"/><path d="M20 4v5h-5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/>',
  page: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/>',
  pagePlus: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M12.5 11v6M9.5 14h6"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  sign: '<path d="M3 17c3-6 5-9 6-8.7 1.2.3-.8 6.6.4 6.8 1 .2 2.6-3.8 3.6-3.6.8.2.3 2.4 2 2.6 1 .1 2-1 3-2"/><path d="M3 21h18"/>',
  date: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  erase: '<rect x="4" y="7" width="16" height="10" rx="1"/><path d="M8 11h8" stroke-dasharray="2 2"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.1 8.1 20 20M8.1 15.9 20 4"/>',
  move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
  alignR: '<path d="M4 6h16M8 10h12M4 14h16M10 18h10"/>',
  alignC: '<path d="M4 6h16M7 10h10M4 14h16M8 18h8"/>',
  alignL: '<path d="M4 6h16M4 10h12M4 14h16M4 18h10"/>',
  extract: '<path d="M6 3h9l4 4v14H6z"/><path d="M12 10v7M9 14l3 3 3-3"/>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V4H4v12h4"/>',
  upload: '<path d="M12 15V4M8 8l4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
  merge: '<path d="M5 3h6l3 3v8H5z"/><path d="M10 10h6l3 3v8h-9z"/>',
  form: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 8h8M8 12h8M8 16h4"/>',
  stamp: '<path d="M4 20h16M6 16h12l-1-3H7z"/><path d="M10 13V9a2 2 0 1 1 4 0v4"/>',
  windows: '<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4M8.5 11h5M11 8.5v5"/>',
  zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4M8.5 11h5"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  fitW: '<path d="M3.5 5v14M20.5 5v14M7 12h10M7 12l2.5-2.5M7 12l2.5 2.5M17 12l-2.5-2.5M17 12l-2.5 2.5"/>',
  fitPage: '<rect x="6" y="3" width="12" height="18" rx="1.5"/><path d="M9.5 9 12 6.5 14.5 9M9.5 15l2.5 2.5 2.5-2.5"/>',
  single: '<rect x="6" y="3.5" width="12" height="17" rx="1.5"/><path d="M9 8h6M9 11.5h6M9 15h4"/>',
  continuous: '<rect x="6" y="2" width="12" height="5.5" rx="1"/><rect x="6" y="9.25" width="12" height="5.5" rx="1"/><rect x="6" y="16.5" width="12" height="5.5" rx="1"/>',
  two: '<rect x="2.5" y="5" width="8.5" height="14" rx="1.2"/><rect x="13" y="5" width="8.5" height="14" rx="1.2"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>',
  chevL: '<path d="m15 6-6 6 6 6"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  redact: '<rect x="3" y="8" width="18" height="8" rx="1" fill="currentColor" stroke="none"/><path d="M3 5h8M3 19h12"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/* =========================================================
 * מצב: מסמכים בלשוניות + מצב ממשק כללי
 * ======================================================= */
const FILE_COLORS = ['#3B6FD8', '#E0913A', '#3F9E78', '#B5517F', '#7A5BC7', '#C9A227', '#4A9BB5', '#B5654A'];
const INK_COLORS = [
  { hex: '#1F35B5', name: 'כחול עט' },
  { hex: '#1B2430', name: 'שחור' },
  { hex: '#C23A2E', name: 'אדום' },
  { hex: '#2F7D5B', name: 'ירוק' },
];

/** הכלים בסרגל הימני. doc=true: דורש מסמך פתוח. panel=false: בלי לוח אפשרויות */
const TOOLS = [
  { id: 'view', label: 'צפייה', icon: 'eye', doc: true, panel: false },
  { id: 'pages', label: 'עמודים', icon: 'grid', doc: true },
  { id: 'sign', label: 'טקסט וחתימה', icon: 'sign', doc: true },
  { id: 'forms', label: 'טפסים', icon: 'form', doc: true },
  { id: 'folder', label: 'תיקייה', icon: 'folder', doc: false },
  { id: 'windows', label: 'שילוב ב-Windows', icon: 'windows', doc: false, panel: false, bottom: true },
];
const PAGE_COLUMN_TOOLS = new Set(['view', 'sign', 'forms']);

const docs = new Map(); // id → מסמך
let activeId = null;
let seq = 1;
let blankSeq = 1;

function newDoc(title, path) {
  const d = {
    id: 'd' + seq++,
    title: title || 'מסמך חדש',
    path: path || null,
    sources: new Map(), // srcId → { id, name, path, bytes, pdf, count, color, fields }
    pages: [], // { key, src, index, rotate, w?, h? }
    stamps: {}, // key → items
    formValues: {}, // srcId → { fieldName: value }
    selected: new Set(),
    lastClicked: null,
    undo: [],
    redo: [],
    dirty: false,
    split: { mode: 'each', every: 2, ranges: '', cuts: new Set() },
    extras: {
      watermark: { enabled: false, text: 'טיוטה', size: 64, opacity: 0.16, color: '#C23A2E' },
      pageNumbers: { enabled: false, position: 'bottom-center', format: 'עמוד {n} מתוך {total}', size: 10, skipFirst: false },
    },
    flattenForms: false,
    scroll: 0,
    curPage: 0, // העמוד הנוכחי בתצוגה (לניווט ולמצב "עמוד יחיד")
  };
  docs.set(d.id, d);
  return d;
}
const D = () => docs.get(activeId) || null;

/** S: מצב ממשק כללי. שדות המסמך מועברים אוטומטית ללשונית הפעילה */
const S = {
  tool: 'view',
  placing: null,
  activeItem: null,
  thumbW: +(localStore('thumbW') || 168),
  zoom: 'fit', // 'fit' = התאמה לרוחב, 'page' = עמוד שלם, או מספר
  layout: ['single', 'continuous', 'two'].includes(localStore('layout')) ? localStore('layout') : 'continuous',
  signature: null,
  folder: localStore('folder') || null,
  fonts: null,
  pendingImage: null,
  pagesMode: 'arrange', // בתוך "עמודים": סידור / מיזוג / פיצול / סימן מים ומספור
};
const PAGES_MODES = [
  { id: 'arrange', label: 'סידור' },
  { id: 'merge', label: 'מיזוג' },
  { id: 'split', label: 'פיצול' },
  { id: 'extras', label: 'סימן מים' },
];
/** כלים ישנים (מיזוג/פיצול/סימון) הם עכשיו מצבים בתוך "עמודים" */
function normalizeTool(t) {
  if (t === 'merge' || t === 'split' || t === 'extras') { S.pagesMode = t; return 'pages'; }
  return t;
}
const inMerge = () => S.tool === 'pages' && S.pagesMode === 'merge';
const inGrid = () => S.tool === 'pages' && (S.pagesMode === 'arrange' || S.pagesMode === 'merge');
const EMPTY = { sources: new Map(), pages: [], stamps: {}, formValues: {}, selected: new Set(), split: { mode: 'each', every: 2, ranges: '', cuts: new Set() }, extras: { watermark: {}, pageNumbers: {} } };
for (const k of ['sources', 'pages', 'stamps', 'formValues', 'selected', 'lastClicked', 'split', 'extras', 'flattenForms']) {
  Object.defineProperty(S, k, {
    get: () => (D() ? D()[k] : EMPTY[k]),
    set: (v) => { if (D()) D()[k] = v; },
  });
}

function localStore(k, v) {
  try {
    if (v === undefined) return localStorage.getItem('pdfivrit.' + k);
    if (v === null) localStorage.removeItem('pdfivrit.' + k);
    else localStorage.setItem('pdfivrit.' + k, v);
  } catch (e) { return null; }
  return null;
}

/* ---------- היסטוריה (ביטול/ביצוע מחדש) — לכל לשונית בנפרד ---------- */
function snapshot() {
  return JSON.stringify({ pages: S.pages, stamps: S.stamps, formValues: S.formValues, sources: [...S.sources.keys()] });
}
function restore(snap) {
  const d = JSON.parse(snap);
  S.pages = d.pages;
  S.stamps = d.stamps;
  S.formValues = d.formValues;
  S.selected = new Set([...S.selected].filter((k) => S.pages.some((p) => p.key === k)));
  S.activeItem = null;
}
function markDirty() {
  const d = D();
  if (d && !d.dirty) { d.dirty = true; renderTabs(); }
  syncDirty();
}
function commit(mutate, opts) {
  const d = D();
  if (!d) return;
  const before = snapshot();
  mutate();
  d.undo.push(before);
  if (d.undo.length > 80) d.undo.shift();
  d.redo.length = 0;
  markDirty();
  if (!opts || opts.render !== false) render();
  else updateChrome();
}
function pushSnapshot(before) {
  const d = D();
  if (!d || before === snapshot()) return;
  d.undo.push(before);
  d.redo.length = 0;
  markDirty();
  updateChrome();
}
function undo() {
  const d = D();
  if (!d || !d.undo.length) return;
  d.redo.push(snapshot());
  restore(d.undo.pop());
  markDirty();
  render();
}
function redo() {
  const d = D();
  if (!d || !d.redo.length) return;
  d.undo.push(snapshot());
  restore(d.redo.pop());
  markDirty();
  render();
}

const $ = (sel, root = document) => root.querySelector(sel);

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const baseName = (n) => String(n || 'מסמך').replace(/\.pdf$/i, '');

const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

const fmtDate = (ms) => new Date(ms).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });

const todayStr = () => new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });

const plural = (n, one, many) => (n === 1 ? one : `${n} ${many}`);

function toast(msg, opts = {}) {
  const el = h(`<div class="toast ${opts.error ? 'error' : ''}" role="status"><span class="t-msg">${esc(msg)}</span></div>`);
  if (opts.action) {
    const b = h(`<button>${esc(opts.action.label)}</button>`);
    b.onclick = () => { opts.action.run(); el.remove(); };
    el.append(b);
  }
  $('#toasts').append(el);
  setTimeout(() => el.remove(), opts.error ? 7000 : 4500);
}

async function busy(label, fn) {
  const el = h(`<div class="busy"><div class="busy-card"><span class="spinner"></span><span>${esc(label)}</span></div></div>`);
  const timer = setTimeout(() => document.body.append(el), 120);
  try {
    return await fn();
  } finally {
    clearTimeout(timer);
    el.remove();
  }
}

function pageLabel(p) {
  if (p.src === 'blank') return 'עמוד ריק';
  const s = S.sources.get(p.src);
  return `${baseName(s.name)}, עמ' ${p.index + 1}`;
}

async function addImages() {
  const imgs = await api.openImages();
  if (!imgs.length) return;
  await busy('ממיר תמונות לעמודים…', async () => {
    const bytes = await Ops.imagesToPdf(imgs.map((i) => ({ bytes: i.bytes })));
    const name = imgs.length === 1 ? baseName(imgs[0].name.replace(/\.(png|jpe?g)$/i, '')) + '.pdf' : `תמונות (${imgs.length}).pdf`;
    return { name, bytes };
  }).then((entry) => (inMerge() && D() ? addPdf(entry).then(render) : openEntries([entry])));
}

function addBlank() {
  const ref = S.pages.find((p) => p.src !== 'blank');
  commit(() => {
    const at = S.selected.size ? Math.max(...[...S.selected].map((k) => S.pages.findIndex((p) => p.key === k))) + 1 : S.pages.length;
    const p = { key: `blank:${blankSeq++}`, src: 'blank', index: 0, rotate: 0, w: 595.28, h: 841.89 };
    if (ref) { const sz = sourcePageSize(ref); if (sz) { p.w = sz.w; p.h = sz.h; } }
    S.pages.splice(at, 0, p);
  });
}

const sizeCache = new Map();

function sourcePageSize(p) { return sizeCache.get(p.src + ':' + p.index) || null; }

const renderCache = new Map(); // key|rot|width → canvas

let active = 0;

const queue = [];

function schedule(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    pump();
  });
}

function pump() {
  while (active < 3 && queue.length) {
    const { task, resolve, reject } = queue.shift();
    active++;
    task().then(resolve, reject).finally(() => { active--; pump(); });
  }
}

async function pageInfo(p) {
  if (p.src === 'blank') {
    const r = ((p.rotate % 360) + 360) % 360;
    const sw = r % 180 ? p.h : p.w, sh = r % 180 ? p.w : p.h;
    return { blank: true, rotation: r, viewW: sw, viewH: sh };
  }
  const src = S.sources.get(p.src);
  const pg = await src.pdf.getPage(p.index + 1);
  const rotation = (((pg.rotate + p.rotate) % 360) + 360) % 360;
  const vp = pg.getViewport({ scale: 1, rotation });
  if (!sizeCache.has(p.src + ':' + p.index)) {
    const v0 = pg.getViewport({ scale: 1, rotation: pg.rotate });
    sizeCache.set(p.src + ':' + p.index, { w: v0.width, h: v0.height });
  }
  return { page: pg, rotation, viewW: vp.width, viewH: vp.height };
}

async function renderToCanvas(p, cssWidth, target, forms) {
  const info = await pageInfo(p);
  const dpr = window.devicePixelRatio || 1;
  const scale = cssWidth / info.viewW;
  const cacheKey = `${p.key}|${info.rotation}|${Math.round(cssWidth * dpr)}|${forms ? 'f' : ''}`;
  let cached = renderCache.get(cacheKey);
  if (!cached) {
    cached = await schedule(async () => {
      const c = document.createElement('canvas');
      c.width = Math.round(info.viewW * scale * dpr);
      c.height = Math.round(info.viewH * scale * dpr);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      if (!info.blank) {
        const vp = info.page.getViewport({ scale: scale * dpr, rotation: info.rotation });
        await info.page.render({ canvasContext: ctx, viewport: vp, annotationMode: forms ? pdfjsLib.AnnotationMode.ENABLE_FORMS : pdfjsLib.AnnotationMode.ENABLE }).promise;
      }
      return c;
    });
    renderCache.set(cacheKey, cached);
    if (renderCache.size > 400) renderCache.delete(renderCache.keys().next().value);
  }
  const out = target || document.createElement('canvas');
  out.width = cached.width;
  out.height = cached.height;
  out.style.width = cssWidth + 'px';
  out.style.height = (cached.height / dpr) + 'px';
  out.getContext('2d').drawImage(cached, 0, 0);
  return { canvas: out, info, scale };
}

const lazy = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    lazy.unobserve(e.target);
    const fn = e.target.__render;
    if (fn) fn();
  }
}, { rootMargin: '600px 0px' });

function filesGroup() {
  const g = h(`<div class="group"><h2>קבצים במסמך</h2><ul class="files"></ul><div class="btn-row"></div></div>`);
  const ul = g.querySelector('.files');
  for (const s of S.sources.values()) {
    const inUse = S.pages.filter((p) => p.src === s.id).length;
    const li = h(`
      <li class="file" style="--c:${s.color}">
        <span class="file-tab"></span>
        <div style="min-width:0">
          <div class="file-name" title="${esc(s.name)}">${esc(baseName(s.name))}</div>
          <div class="file-meta">${inUse === s.count ? plural(s.count, 'עמוד אחד', 'עמודים') : `${inUse} מתוך ${s.count} עמודים`}${s.fields.length ? `, ${s.fields.length} שדות טופס` : ''}</div>
        </div>
        <button class="icon-btn" title="הסרה מהעבודה" aria-label="הסרת ${esc(s.name)}">${icon('x')}</button>
      </li>`);
    if (S.sources.size < 2) li.querySelector('button').remove();
    else li.querySelector('button').onclick = () => removeSource(s.id);
    ul.append(li);
  }
  const row = g.querySelector('.btn-row');
  const add = h(`<button class="btn">${icon('plus')}הוספת קובץ</button>`);
  add.onclick = addFilesToDoc;
  const img = h(`<button class="btn">${icon('image')}תמונות</button>`);
  img.onclick = addImages;
  row.append(add, img);
  return g;
}

function deskBar() {
  const total = S.pages.length;
  const bar = h(`
    <div class="desk-bar">
      <span><strong style="color:var(--ink)">${plural(total, 'עמוד אחד', 'עמודים')}</strong> ${S.sources.size === 1 ? 'מקובץ אחד' : `מ-${S.sources.size} קבצים`}</span>
      <span class="spacer"></span>
      <div class="sel-actions">
        <button class="btn btn-quiet" data-a="all">בחירת הכל</button>
        ${S.selected.size ? '<button class="btn btn-quiet" data-a="none">ניקוי בחירה</button>' : ''}
      </div>
      <label>גודל תצוגה <input type="range" min="110" max="300" step="2" value="${S.thumbW}" aria-label="גודל התמונות הממוזערות"></label>
    </div>`);
  bar.querySelector('[data-a=all]').onclick = selectAll;
  const none = bar.querySelector('[data-a=none]');
  if (none) none.onclick = () => { S.selected.clear(); render(); };
  const range = bar.querySelector('input');
  range.oninput = () => {
    S.thumbW = +range.value;
    localStore('thumbW', String(S.thumbW));
    document.querySelectorAll('.grid').forEach((g) => g.style.setProperty('--thumb-w', S.thumbW + 'px'));
    document.querySelectorAll('.manual-grid .sheet').forEach((s) => (s.style.width = S.thumbW + 'px'));
    clearTimeout(range.__t);
    range.__t = setTimeout(render, 250);
  };
  return bar;
}

function sheetEl(p, i, opts = {}) {
  const color = p.src === 'blank' ? '#9AA5AA' : S.sources.get(p.src).color;
  const selected = !opts.static && S.selected.has(p.key);
  const el = h(`
    <div class="sheet ${selected ? 'selected' : ''}" role="option" aria-selected="${selected}" tabindex="0" data-key="${esc(p.key)}" draggable="${opts.static ? 'false' : 'true'}">
      <div class="paper" style="--c:${color}"><span class="loading"></span></div>
      <div class="sheet-meta"><span class="sheet-num">${i + 1}</span><span class="sheet-from" title="${esc(pageLabel(p))}">${esc(pageLabel(p))}</span></div>
      ${opts.static ? '' : `
      <div class="sheet-tools">
        <button class="icon-btn" data-a="rotR" title="סיבוב ימינה" aria-label="סיבוב ימינה">${icon('rotR')}</button>
        <button class="icon-btn" data-a="rotL" title="סיבוב שמאלה" aria-label="סיבוב שמאלה">${icon('rotL')}</button>
        <button class="icon-btn del" data-a="del" title="מחיקה" aria-label="מחיקת העמוד">${icon('trash')}</button>
      </div>`}
    </div>`);
  const w = Math.min(S.thumbW, opts.width || S.thumbW);
  const ph = el.querySelector('.loading');
  const sz = p.src === 'blank' ? { w: p.w, h: p.h } : sourcePageSize(p);
  const rot = (((p.rotate || 0) % 180) + 180) % 180;
  const ratio = sz ? (rot ? sz.w / sz.h : sz.h / sz.w) : 1.414;
  ph.style.width = w + 'px';
  ph.style.height = Math.round(w * ratio) + 'px';
  el.__render = async () => {
    try {
      const { canvas } = await renderToCanvas(p, w);
      // דף לרוחב — מקטינים שיתאים לגובה דומה לדף לאורך
      el.querySelector('.paper').replaceChildren(canvas);
    } catch (e) { /* עמוד שלא ניתן לרנדר — נשאר עם רקע ריק */ }
  };
  lazy.observe(el);

  if (!opts.static) {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.sheet-tools')) return;
      clickSelect(p.key, e);
    });
    el.addEventListener('dblclick', () => openInEditor(p.key));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') openInEditor(p.key);
      if (e.key === ' ') { e.preventDefault(); clickSelect(p.key, { ctrlKey: true }); }
    });
    el.querySelector('[data-a=rotR]').onclick = () => commit(() => { p.rotate = (p.rotate || 0) + 90; });
    el.querySelector('[data-a=rotL]').onclick = () => commit(() => { p.rotate = (p.rotate || 0) - 90; });
    el.querySelector('[data-a=del]').onclick = () => deletePages([p.key]);
  }
  return el;
}

function clickSelect(key, e) {
  if (e.shiftKey && S.lastClicked) {
    const a = S.pages.findIndex((p) => p.key === S.lastClicked);
    const b = S.pages.findIndex((p) => p.key === key);
    const [lo, hi] = a < b ? [a, b] : [b, a];
    for (let i = lo; i <= hi; i++) S.selected.add(S.pages[i].key);
  } else if (e.ctrlKey || e.metaKey) {
    S.selected.has(key) ? S.selected.delete(key) : S.selected.add(key);
    S.lastClicked = key;
  } else {
    const only = S.selected.size === 1 && S.selected.has(key);
    S.selected.clear();
    if (!only) S.selected.add(key);
    S.lastClicked = key;
  }
  render();
}

function selectAll() { S.pages.forEach((p) => S.selected.add(p.key)); render(); }

function rotateSelected(deg) {
  commit(() => S.pages.forEach((p) => { if (S.selected.has(p.key)) p.rotate = (p.rotate || 0) + deg; }));
}

function deleteSelected() { deletePages([...S.selected]); }

function deletePages(keys) {
  if (!keys.length) return;
  commit(() => {
    const set = new Set(keys);
    S.pages = S.pages.filter((p) => !set.has(p.key));
    keys.forEach((k) => { S.selected.delete(k); });
  });
  toast(keys.length === 1 ? 'העמוד נמחק' : `${keys.length} עמודים נמחקו`, { action: { label: 'ביטול', run: undo } });
}

function duplicateSelected() {
  commit(() => {
    const out = [];
    for (const p of S.pages) {
      out.push(p);
      if (S.selected.has(p.key)) {
        const copy = { ...p, key: `${p.key}#${seq++}` };
        if (S.stamps[p.key]) S.stamps[copy.key] = JSON.parse(JSON.stringify(S.stamps[p.key]));
        out.push(copy);
      }
    }
    S.pages = out;
  });
}

function wireReorder(grid) {
  let dragKeys = null;
  let marker = null;
  const clearMarker = () => { if (marker) marker.classList.remove('drop-before', 'drop-after'); marker = null; };
  grid.addEventListener('dragstart', (e) => {
    const el = e.target.closest('.sheet');
    if (!el) return;
    const key = el.dataset.key;
    dragKeys = S.selected.has(key) ? S.pages.filter((p) => S.selected.has(p.key)).map((p) => p.key) : [key];
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/x-pages', dragKeys.join(','));
    requestAnimationFrame(() => dragKeys.forEach((k) => { const n = grid.querySelector(`[data-key="${CSS.escape(k)}"]`); if (n) n.classList.add('dragging'); }));
  });
  grid.addEventListener('dragover', (e) => {
    if (!dragKeys) return;
    const el = e.target.closest('.sheet');
    e.preventDefault();
    clearMarker();
    if (!el || dragKeys.includes(el.dataset.key)) return;
    const r = el.getBoundingClientRect();
    const before = e.clientX > r.left + r.width / 2; // RTL: חצי ימני = לפני
    el.classList.add(before ? 'drop-before' : 'drop-after');
    marker = el;
  });
  grid.addEventListener('drop', (e) => {
    if (!dragKeys) return;
    e.preventDefault();
    e.stopPropagation();
    const target = marker;
    const before = target && target.classList.contains('drop-before');
    clearMarker();
    if (!target) return;
    const keys = dragKeys;
    commit(() => {
      const moving = S.pages.filter((p) => keys.includes(p.key));
      const rest = S.pages.filter((p) => !keys.includes(p.key));
      let at = rest.findIndex((p) => p.key === target.dataset.key);
      if (!before) at++;
      rest.splice(at, 0, ...moving);
      S.pages = rest;
    });
  });
  grid.addEventListener('dragend', () => {
    clearMarker();
    dragKeys = null;
    grid.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging'));
  });
}

function scrollToEditorPage() {
  const key = editorScrollTarget;
  editorScrollTarget = null;
  const idx = S.pages.findIndex((p) => p.key === key);
  if (idx >= 0 && D()) D().curPage = idx;
  if (S.layout === 'single') {
    if (idx >= 0 && !$(`#desk .page-frame[data-key="${CSS.escape(key)}"]`)) { render(); $('#desk').scrollTop = 0; }
    return;
  }
  const el = $(`#desk .page-frame[data-key="${CSS.escape(key)}"]`);
  if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
}

function editorPage(p, i, maxW, maxH) {
  const frame = h(`<div class="page-frame" data-key="${esc(p.key)}" data-idx="${i}"><span class="page-label">${i + 1}</span><canvas></canvas><div class="overlay ${S.placing ? 'placing' : ''}"></div></div>`);
  const sz = p.src === 'blank' ? { w: p.w, h: p.h } : sourcePageSize(p) || { w: 595, h: 842 };
  const rot = (((p.rotate || 0) % 180) + 180) % 180;
  const vw = rot ? sz.h : sz.w;
  const vh = rot ? sz.w : sz.h;
  const fitScale = (w, ht) => (S.zoom === 'fit' ? Math.min(maxW / w, 2) : S.zoom === 'page' ? Math.min(maxW / w, maxH / ht, 2) : S.zoom);
  let scale = fitScale(vw, vh);
  frame.style.width = vw * scale + 'px';
  frame.style.height = vh * scale + 'px';
  const overlay = frame.querySelector('.overlay');
  const ctx = { p, scale, overlay, frame, vw, vh };
  frame.__ctx = ctx;

  frame.__render = async () => {
    const info = await pageInfo(p);
    scale = fitScale(info.viewW, info.viewH);
    ctx.scale = scale; ctx.vw = info.viewW; ctx.vh = info.viewH;
    frame.style.width = info.viewW * scale + 'px';
    frame.style.height = info.viewH * scale + 'px';
    await renderToCanvas(p, info.viewW * scale, frame.querySelector('canvas'), true);
    if (!info.blank) drawFields(ctx, info);
    drawItems(ctx);
  };
  lazy.observe(frame);
  drawItems(ctx);

  overlay.addEventListener('pointerdown', (e) => {
    if (e.target !== overlay) return;
    if (!S.placing) {
      if (S.activeItem) { S.activeItem = null; refreshItems(); }
      return;
    }
    // מונעים מהדפדפן להעביר פוקוס אחרי הלחיצה — אחרת תיבת הטקסט החדשה מאבדת פוקוס ונמחקת
    e.preventDefault();
    const r = overlay.getBoundingClientRect();
    if (S.placing === 'redact') return drawRedaction(ctx, e, r);
    placeItem(ctx, (e.clientX - r.left) / ctx.scale, (e.clientY - r.top) / ctx.scale);
  });
  return frame;
}

/** השחרה: גוררים מלבן על האזור שצריך להימחק */
function drawRedaction(ctx, e, r) {
  const { overlay } = ctx;
  const x0 = (e.clientX - r.left) / ctx.scale, y0 = (e.clientY - r.top) / ctx.scale;
  const ghost = h('<div class="item kind-redact drawing"><div class="redact-fill"></div></div>');
  overlay.append(ghost);
  let box = { x: x0, y: y0, w: 0, h: 0 };
  const move = (ev) => {
    const x1 = Math.max(0, Math.min(ctx.vw, (ev.clientX - r.left) / ctx.scale));
    const y1 = Math.max(0, Math.min(ctx.vh, (ev.clientY - r.top) / ctx.scale));
    box = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
    Object.assign(ghost.style, { left: box.x * ctx.scale + 'px', top: box.y * ctx.scale + 'px', width: box.w * ctx.scale + 'px', height: box.h * ctx.scale + 'px' });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    ghost.remove();
    // לחיצה בלי גרירה — מלבן בגודל שורת טקסט
    if (box.w < 6 || box.h < 4) box = { x: Math.max(0, x0 - 80), y: Math.max(0, y0 - 9), w: 160, h: 18 };
    const id = 'i' + seq++;
    commit(() => {
      (S.stamps[ctx.p.key] = S.stamps[ctx.p.key] || []).push({ id, type: 'redact', ...box });
      S.activeItem = { key: ctx.p.key, id };
      // נשארים בכלי ההשחרה — בדרך כלל משחירים כמה אזורים ברצף
    });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function placeItem(ctx, x, y) {
  const { p } = ctx;
  let item;
  const id = 'i' + seq++;
  if (S.placing === 'text' || S.placing === 'date') {
    const size = 14;
    item = { id, type: 'text', text: S.placing === 'date' ? todayStr() : '', size, color: INK_COLORS[0].hex, w: S.placing === 'date' ? 110 : 220, align: 'right', bold: false };
    item.x = Math.max(0, Math.min(ctx.vw - item.w, x - item.w + 10));
    item.y = Math.max(0, y - size * 0.75);
  } else if (S.placing === 'signature' || S.placing === 'image') {
    const src = S.placing === 'signature' ? S.signature : S.pendingImage;
    const ratio = imageRatio(src);
    const w = S.placing === 'signature' ? 150 : 120;
    item = { id, type: 'image', image: src, w, h: w * ratio };
    item.x = Math.max(0, Math.min(ctx.vw - w, x - w / 2));
    item.y = Math.max(0, Math.min(ctx.vh - item.h, y - item.h / 2));
  } else if (S.placing === 'rect') {
    item = { id, type: 'rect', color: '#ffffff', w: 160, h: 40 };
    item.x = Math.max(0, x - 80);
    item.y = Math.max(0, y - 20);
  }
  commit(() => {
    (S.stamps[p.key] = S.stamps[p.key] || []).push(item);
    S.activeItem = { key: p.key, id };
    S.placing = null;
  });
  if (item.type === 'text') {
    setTimeout(() => {
      const ta = $(`#desk .item[data-id="${id}"] textarea`);
      if (ta) { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }, 0);
  }
}

const ratioCache = new Map();

function imageRatio(src) {
  if (ratioCache.has(src)) return ratioCache.get(src);
  return 0.4;
}

function preloadRatio(src) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => { ratioCache.set(src, img.naturalHeight / img.naturalWidth); res(); };
    img.onerror = res;
    img.src = src;
  });
}

function refreshItems() {
  document.querySelectorAll('#desk .page-frame').forEach((f) => { if (f.__ctx) drawItems(f.__ctx); });
}

function drawItems(ctx) {
  const { p, overlay } = ctx;
  const items = S.stamps[p.key] || [];
  const focused = document.activeElement;
  // פריט שהמשתמש עובד עליו כרגע (תיבת טקסט בפוקוס) לא נבנה מחדש — רק מעדכנים מיקום וגודל
  let keep = null;
  overlay.querySelectorAll('.item').forEach((n) => {
    if (focused && n.contains(focused) && items.some((it) => it.id === n.dataset.id)) keep = n;
    else n.remove();
  });
  for (const it of items) {
    if (keep && keep.dataset.id === it.id) {
      keep.style.left = it.x * ctx.scale + 'px';
      keep.style.top = it.y * ctx.scale + 'px';
      keep.style.width = it.w * ctx.scale + 'px';
      const ta = keep.querySelector('textarea');
      if (ta) ta.style.fontSize = it.size * ctx.scale + 'px';
      // לא מזיזים אותו ב-DOM — הזזה מעבירה פוקוס
    } else overlay.append(itemEl(ctx, it));
  }
}

function itemEl(ctx, it) {
  const { p, scale } = ctx;
  const isActive = S.activeItem && S.activeItem.id === it.id;
  const el = h(`<div class="item kind-${it.type} ${isActive ? 'active' : ''}" data-id="${it.id}"></div>`);
  el.style.left = it.x * scale + 'px';
  el.style.top = it.y * scale + 'px';
  el.style.width = it.w * scale + 'px';
  if (it.type !== 'text') el.style.height = it.h * scale + 'px';

  if (it.type === 'text') {
    const ta = h('<textarea rows="1" dir="auto" spellcheck="false" placeholder="הקלידו כאן"></textarea>');
    ta.value = it.text;
    ta.style.fontSize = it.size * scale + 'px';
    ta.style.color = it.color;
    ta.style.fontWeight = it.bold ? '700' : '400';
    ta.style.textAlign = it.align || 'right';
    const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    requestAnimationFrame(fit);
    let before = null;
    ta.addEventListener('focus', () => {
      before = snapshot();
      if (!S.activeItem || S.activeItem.id !== it.id) { S.activeItem = { key: p.key, id: it.id }; markActive(); }
    });
    ta.addEventListener('input', () => { it.text = ta.value; fit(); });
    ta.addEventListener('blur', () => {
      // הבדיקה נדחית: אם התיבה רק נבנתה מחדש (רינדור), היא לא באמת נעזבה
      setTimeout(() => {
        if (!el.isConnected || el.contains(document.activeElement)) return;
        if (!it.text.trim()) {
          // המשתמש עזב תיבה ריקה — מסירים בלי להשאיר היסטוריה
          S.stamps[p.key] = (S.stamps[p.key] || []).filter((x) => x.id !== it.id);
          if (S.activeItem && S.activeItem.id === it.id) S.activeItem = null;
          el.remove();
          return;
        }
        if (before) { pushSnapshot(before); before = null; }
      }, 0);
    });
    el.append(ta);
  } else if (it.type === 'image') {
    el.append(h(`<img alt="" src="${it.image}">`));
  } else if (it.type === 'redact') {
    el.append(h('<div class="redact-fill" title="השחרה: התוכן מתחת יימחק בשמירה"></div>'));
  } else if (it.type === 'rect') {
    const f = h('<div class="rect-fill"></div>');
    f.style.background = it.color;
    f.style.boxShadow = 'inset 0 0 0 1px rgba(27,36,48,.15)';
    el.append(f);
  }

  const grip = h(`<span class="grip" title="גרירה" aria-label="הזזה">${icon('move')}</span>`);
  const resize = h('<span class="resize" title="שינוי גודל"></span>');
  el.append(grip, resize);
  if (isActive) el.append(itemBar(ctx, it));

  const startDrag = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    if (!S.activeItem || S.activeItem.id !== it.id) { S.activeItem = { key: p.key, id: it.id }; markActive(); }
    const before = snapshot();
    const sx = e.clientX, sy = e.clientY;
    const ox = it.x, oy = it.y, ow = it.w, oh = it.h;
    const target = e.currentTarget;
    try { target.setPointerCapture(e.pointerId); } catch (err) { /* לא קריטי */ }
    const move = (ev) => {
      const dx = (ev.clientX - sx) / ctx.scale, dy = (ev.clientY - sy) / ctx.scale;
      if (mode === 'move') {
        it.x = Math.max(-it.w * 0.5, Math.min(ctx.vw - it.w * 0.5, ox + dx));
        it.y = Math.max(0, Math.min(ctx.vh - 10, oy + dy));
      } else {
        // ידית בפינה השמאלית-תחתונה (RTL): גרירה שמאלה מגדילה
        const nw = Math.max(24, ow - dx);
        it.x = ox + (ow - nw);
        it.w = nw;
        if (it.type === 'image') it.h = nw * (oh / ow);
        else if (it.type === 'rect' || it.type === 'redact') it.h = Math.max(4, oh + dy);
      }
      el.style.left = it.x * ctx.scale + 'px';
      el.style.top = it.y * ctx.scale + 'px';
      el.style.width = it.w * ctx.scale + 'px';
      if (it.type !== 'text') el.style.height = it.h * ctx.scale + 'px';
      else { const ta = el.querySelector('textarea'); ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      pushSnapshot(before);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };
  grip.addEventListener('pointerdown', (e) => startDrag(e, 'move'));
  resize.addEventListener('pointerdown', (e) => startDrag(e, 'resize'));
  if (it.type !== 'text') el.addEventListener('pointerdown', (e) => { if (e.target === el || e.target.tagName === 'IMG' || e.target.classList.contains('rect-fill') || e.target.classList.contains('redact-fill')) startDrag(e, 'move'); });
  return el;
}

function markActive() {
  // מעדכנים את סימון הפריט הפעיל בלי לבנות מחדש (שומר פוקוס בתיבת טקסט)
  document.querySelectorAll('#desk .item').forEach((n) => {
    const on = S.activeItem && n.dataset.id === S.activeItem.id;
    n.classList.toggle('active', !!on);
    const bar = n.querySelector('.item-bar');
    if (bar && !on) bar.remove();
    if (on && !bar) {
      const frame = n.closest('.page-frame');
      const it = (S.stamps[frame.dataset.key] || []).find((x) => x.id === n.dataset.id);
      if (it) n.append(itemBar(frame.__ctx, it));
    }
  });
}

function itemBar(ctx, it) {
  const bar = h('<div class="item-bar" role="toolbar" aria-label="עיצוב"></div>');
  const keepFocus = (e) => e.preventDefault();
  bar.addEventListener('pointerdown', (e) => { e.stopPropagation(); keepFocus(e); });
  const update = (fn) => commit(fn, { render: false }) || refreshItems();
  if (it.type === 'text') {
    const smaller = h(`<button class="icon-btn" title="הקטנת גופן" aria-label="הקטנת גופן">${icon('minus')}</button>`);
    const size = h(`<span class="size" aria-label="גודל גופן">${it.size}</span>`);
    const bigger = h(`<button class="icon-btn" title="הגדלת גופן" aria-label="הגדלת גופן">${icon('plus')}</button>`);
    smaller.onclick = () => update(() => { it.size = Math.max(6, it.size - 1); });
    bigger.onclick = () => update(() => { it.size = Math.min(96, it.size + 1); });
    const bold = h(`<button class="icon-btn ${it.bold ? 'on' : ''}" title="מודגש" aria-label="מודגש" aria-pressed="${!!it.bold}">${icon('bold')}</button>`);
    bold.onclick = () => update(() => { it.bold = !it.bold; });
    bar.append(smaller, size, bigger, h('<span class="sep"></span>'), bold);
    for (const [a, ic, label] of [['right', 'alignR', 'יישור לימין'], ['center', 'alignC', 'מרכוז'], ['left', 'alignL', 'יישור לשמאל']]) {
      const b = h(`<button class="icon-btn ${(it.align || 'right') === a ? 'on' : ''}" title="${label}" aria-label="${label}">${icon(ic)}</button>`);
      b.onclick = () => update(() => { it.align = a; });
      bar.append(b);
    }
    bar.append(h('<span class="sep"></span>'));
    for (const c of INK_COLORS) {
      const b = h(`<button class="swatch" style="background:${c.hex}" title="${c.name}" aria-label="${c.name}" aria-pressed="${it.color === c.hex}"></button>`);
      b.onclick = () => update(() => { it.color = c.hex; });
      bar.append(b);
    }
    bar.append(h('<span class="sep"></span>'));
  }
  const del = h(`<button class="icon-btn del" title="מחיקה (Delete)" aria-label="מחיקה">${icon('trash')}</button>`);
  del.onclick = () => deleteActiveItem();
  bar.append(del);
  return bar;
}

function deleteActiveItem() {
  if (!S.activeItem) return;
  const { key, id } = S.activeItem;
  commit(() => {
    S.stamps[key] = (S.stamps[key] || []).filter((x) => x.id !== id);
    S.activeItem = null;
  });
}

function fieldValue(srcId, f) {
  const vals = S.formValues[srcId];
  return vals && f.name in vals ? vals[f.name] : f.value;
}

function drawFields(ctx, info) {
  const { p, overlay } = ctx;
  if (p.src === 'blank') return;
  const src = S.sources.get(p.src);
  overlay.querySelectorAll('.form-field').forEach((n) => n.remove());
  const vp = info.page.getViewport({ scale: ctx.scale, rotation: info.rotation });
  for (const f of src.fields) {
    if (f.page !== p.index || !f.rect) continue;
    const r = vp.convertToViewportRectangle([f.rect.x, f.rect.y, f.rect.x + f.rect.width, f.rect.y + f.rect.height]);
    const left = Math.min(r[0], r[2]), top = Math.min(r[1], r[3]);
    const w = Math.abs(r[2] - r[0]), hgt = Math.abs(r[3] - r[1]);
    let el;
    const v = fieldValue(src.id, f);
    if (f.type === 'TextField') {
      el = f.multiline ? h('<textarea class="form-field" dir="auto"></textarea>') : h('<input class="form-field" dir="auto">');
      el.value = v || '';
      el.style.fontSize = Math.max(9, Math.min(f.multiline ? 13 * ctx.scale : hgt * 0.62, 18 * ctx.scale)) + 'px';
      if (f.maxLength) el.maxLength = f.maxLength;
    } else if (f.type === 'CheckBox') {
      el = h('<input type="checkbox" class="form-field">');
      el.checked = !!v;
    } else if (f.type === 'Dropdown' || f.type === 'OptionList' || f.type === 'RadioGroup') {
      el = h('<select class="form-field"><option value=""></option></select>');
      for (const o of f.options || []) el.append(h(`<option>${esc(o)}</option>`));
      el.value = v || '';
      el.style.fontSize = Math.max(9, Math.min(hgt * 0.6, 16)) + 'px';
    } else continue;
    el.dataset.field = src.id + '|' + f.name;
    el.title = f.name;
    el.setAttribute('aria-label', f.name);
    Object.assign(el.style, { left: left + 'px', top: top + 'px', width: w + 'px', height: hgt + 'px' });
    let before = null;
    el.addEventListener('focus', () => { before = snapshot(); });
    const save = () => {
      S.formValues[src.id] = S.formValues[src.id] || {};
      S.formValues[src.id][f.name] = f.type === 'CheckBox' ? el.checked : el.value;
    };
    el.addEventListener('input', save);
    el.addEventListener('change', () => { save(); if (before) pushSnapshot(before); before = snapshot(); });
    el.addEventListener('blur', () => { if (before) pushSnapshot(before); });
    overlay.append(el);
  }
}

function savedSignatures() {
  try { return JSON.parse(localStore('signatures') || '[]'); } catch (e) { return []; }
}

function signatureDialog() {
  return new Promise((resolve) => {
    let color = INK_COLORS[0].hex;
    let width = 3.2;
    let mode = 'draw';
    const root = $('#modal-root');
    const back = h(`
      <div class="modal-back">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="sig-title">
          <header><h2 id="sig-title">חתימה חדשה</h2><button class="icon-btn" data-a="close" aria-label="סגירה">${icon('x')}</button></header>
          <div class="body">
            <div class="segmented" role="group" aria-label="איך לחתום">
              <button data-m="draw" aria-pressed="true">ציור</button>
              <button data-m="type" aria-pressed="false">הקלדה</button>
              <button data-m="upload" aria-pressed="false">תמונה מהמחשב</button>
            </div>
            <div data-pane="draw">
              <div class="pad-wrap"><canvas></canvas><span class="pad-line"></span><span class="pad-hint">חתמו כאן עם העכבר, משטח המגע או עט</span></div>
            </div>
            <div data-pane="type" hidden>
              <input class="input typed-sig" dir="auto" placeholder="השם שלכם" style="font-family:Alef;font-weight:700">
              <p style="font-size:13px">חתימה מוקלדת מתאימה לאישורים פנימיים. למסמכים רשמיים עדיף לצייר.</p>
            </div>
            <div data-pane="upload" hidden>
              <p>בחרו קובץ PNG או JPG של החתימה. עדיף רקע שקוף או לבן.</p>
              <button class="btn" data-a="pick">${icon('upload')}בחירת תמונה</button>
              <img data-a="preview" alt="" style="max-height:120px;max-width:100%;align-self:flex-start" hidden>
            </div>
            <div class="pad-tools">
              <div class="swatches" role="group" aria-label="צבע">${INK_COLORS.slice(0, 2).map((c, i) => `<button class="swatch" data-c="${c.hex}" style="background:${c.hex}" title="${c.name}" aria-label="${c.name}" aria-pressed="${i === 0}"></button>`).join('')}</div>
              <label>עובי קו <input type="range" min="1.5" max="6" step=".1" value="${width}"></label>
            </div>
            <label class="check"><input type="checkbox" checked data-a="remember"><span>שמירת החתימה לשימוש חוזר<small>נשמרת רק במחשב הזה</small></span></label>
          </div>
          <footer>
            <button class="btn btn-primary" data-a="ok">שימוש בחתימה</button>
            <button class="btn btn-quiet" data-a="clear">ניקוי</button>
            <button class="btn btn-quiet push" data-a="cancel">ביטול</button>
          </footer>
        </div>
      </div>`);
    root.append(back);

    const canvas = back.querySelector('canvas');
    const wrap = back.querySelector('.pad-wrap');
    const dpr = window.devicePixelRatio || 1;
    const sizeCanvas = () => {
      const r = wrap.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
    };
    sizeCanvas();
    const c2d = canvas.getContext('2d');
    let strokes = [];
    let current = null;
    const redraw = () => {
      c2d.clearRect(0, 0, canvas.width, canvas.height);
      c2d.lineCap = 'round';
      c2d.lineJoin = 'round';
      for (const s of strokes) {
        c2d.strokeStyle = s.color;
        for (let i = 1; i < s.pts.length; i++) {
          const a = s.pts[i - 1], b = s.pts[i];
          c2d.lineWidth = s.width * dpr * (0.65 + 0.7 * (b.p ?? 0.5));
          c2d.beginPath();
          c2d.moveTo(a.x * dpr, a.y * dpr);
          c2d.lineTo(b.x * dpr, b.y * dpr);
          c2d.stroke();
        }
      }
      back.querySelector('.pad-hint').hidden = strokes.length > 0;
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (!canvas.width) sizeCanvas();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* לא קריטי */ }
      const r = canvas.getBoundingClientRect();
      current = { color, width, pts: [{ x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 }] };
      strokes.push(current);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!current) return;
      const r = canvas.getBoundingClientRect();
      let evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      if (!evs.length) evs = [e];
      for (const ev of evs) current.pts.push({ x: ev.clientX - r.left, y: ev.clientY - r.top, p: ev.pressure || 0.5 });
      redraw();
    });
    const end = () => { current = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    let uploaded = null;
    const typed = back.querySelector('.typed-sig');
    back.querySelectorAll('[data-m]').forEach((b) => {
      b.onclick = () => {
        mode = b.dataset.m;
        back.querySelectorAll('[data-m]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        back.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== mode));
        back.querySelector('.pad-tools').hidden = mode === 'upload';
        back.querySelector('[data-a=clear]').hidden = mode !== 'draw';
        if (mode === 'draw') requestAnimationFrame(() => { sizeCanvas(); redraw(); });
        if (mode === 'type') typed.focus();
      };
    });
    back.querySelectorAll('[data-c]').forEach((b) => {
      b.onclick = () => {
        color = b.dataset.c;
        back.querySelectorAll('[data-c]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        strokes.forEach((s) => (s.color = color));
        redraw();
        typed.style.color = color;
      };
    });
    typed.style.color = color;
    back.querySelector('.pad-tools input').oninput = (e) => { width = +e.target.value; strokes.forEach((s) => (s.width = width)); redraw(); };
    back.querySelector('[data-a=clear]').onclick = () => { strokes = []; redraw(); };
    back.querySelector('[data-a=pick]').onclick = async () => {
      const imgs = await api.openImages();
      if (!imgs.length) return;
      const mime = /\.png$/i.test(imgs[0].name) ? 'image/png' : 'image/jpeg';
      uploaded = await bytesToDataUrl(imgs[0].bytes, mime);
      const pv = back.querySelector('[data-a=preview]');
      pv.src = uploaded;
      pv.hidden = false;
    };

    const close = (val) => {
      back.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('pointerdown', (e) => { if (e.target === back) close(null); });
    back.querySelector('[data-a=close]').onclick = () => close(null);
    back.querySelector('[data-a=cancel]').onclick = () => close(null);
    back.querySelector('[data-a=ok]').onclick = async () => {
      let data = null;
      if (mode === 'draw') {
        if (!strokes.length) return toast('צריך לחתום בתוך המסגרת קודם', { error: true });
        data = trimCanvas(canvas);
        if (!data) return toast('צריך לחתום בתוך המסגרת קודם', { error: true });
      } else if (mode === 'type') {
        if (!typed.value.trim()) return typed.focus();
        data = typedSignature(typed.value.trim(), color);
      } else {
        if (!uploaded) return toast('בחרו קודם תמונה של החתימה', { error: true });
        data = uploaded;
      }
      await preloadRatio(data);
      if (back.querySelector('[data-a=remember]').checked) {
        const list = [data, ...savedSignatures().filter((x) => x !== data)].slice(0, 6);
        try { localStore('signatures', JSON.stringify(list)); } catch (e) { /* מקום מלא — ממשיכים בלי לשמור */ }
      }
      S.signature = data;
      close(data);
    };
  });
}

function trimCanvas(c) {
  const ctx = c.getContext('2d');
  const { width, height } = c;
  const d = ctx.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (d[(y * width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 <= x0 || y1 <= y0) return null;
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width, x1 + pad); y1 = Math.min(height, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0; out.height = y1 - y0;
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

function typedSignature(text, color) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '700 96px Alef';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  c.width = w; c.height = 140;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w - 20, 72);
  return c.toDataURL('image/png');
}

function bytesToDataUrl(bytes, mime) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.readAsDataURL(new Blob([bytes], { type: mime }));
  });
}

function splitGroups() {
  const n = S.pages.length;
  const sp = S.split;
  if (sp.mode === 'each') return Ops.chunk(n, 1);
  if (sp.mode === 'every') return Ops.chunk(n, sp.every || 1);
  if (sp.mode === 'ranges') return Ops.parseRanges(sp.ranges, n);
  // ידני
  const groups = [[]];
  S.pages.forEach((p, i) => {
    groups[groups.length - 1].push(i);
    if (sp.cuts.has(p.key) && i < n - 1) groups.push([]);
  });
  return groups;
}

function renderSplit() {
  const panel = $('#panel');
  const desk = $('#desk');
  const sp = S.split;
  const g = h(`
    <div class="group">
      <h2>איך לפצל</h2>
      <div class="radio-list" role="radiogroup">
        <label><input type="radio" name="sm" value="each" ${sp.mode === 'each' ? 'checked' : ''}><span><b>כל עמוד לקובץ נפרד</b></span></label>
        <label><input type="radio" name="sm" value="every" ${sp.mode === 'every' ? 'checked' : ''}><span><b>כל כמה עמודים</b><small>למשל טפסים של 2 עמודים כל אחד</small></span></label>
        <label><input type="radio" name="sm" value="ranges" ${sp.mode === 'ranges' ? 'checked' : ''}><span><b>לפי טווחים</b><small>למשל <bdi dir="ltr">1-3, 4, 7-</bdi></small></span></label>
        <label><input type="radio" name="sm" value="manual" ${sp.mode === 'manual' ? 'checked' : ''}><span><b>חיתוך ידני</b><small>לוחצים על המספריים בין העמודים</small></span></label>
      </div>
    </div>`);
  g.querySelectorAll('input[name=sm]').forEach((r) => (r.onchange = () => { sp.mode = r.value; render(); }));
  if (sp.mode === 'every') {
    const f = h(`<label class="field"><span>מספר עמודים בכל קובץ</span><input class="input" type="number" min="1" max="${S.pages.length}" value="${sp.every}"></label>`);
    f.querySelector('input').oninput = (e) => { sp.every = Math.max(1, +e.target.value || 1); clearTimeout(f.__t); f.__t = setTimeout(render, 300); };
    g.append(f);
  }
  if (sp.mode === 'ranges') {
    const f = h(`<label class="field"><span>טווחי עמודים (מתוך ${S.pages.length})</span><input class="input" dir="ltr" style="text-align:right" placeholder="1-3, 5, 8-" value="${esc(sp.ranges)}"></label>`);
    const inp = f.querySelector('input');
    inp.oninput = () => { sp.ranges = inp.value; clearTimeout(f.__t); f.__t = setTimeout(() => { render(); const n = $('#panel input.input[dir=ltr]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 450); };
    g.append(f);
  }
  panel.append(g);

  let groups = null;
  let err = null;
  try { groups = sp.mode === 'ranges' && !sp.ranges.trim() ? null : splitGroups(); } catch (e) { err = e.message; }

  const out = h(`<div class="group"><h2>התוצאה</h2><p class="hint"></p><button class="btn btn-primary btn-block btn-lg" ${groups && groups.length ? '' : 'disabled'}>${icon('scissors')}פיצול ושמירה לתיקייה</button></div>`);
  out.querySelector('.hint').innerHTML = err ? esc(err) : groups ? `${plural(groups.length, 'קובץ אחד', 'קבצים')} ייווצרו, בשמות כמו <bdi>${esc(baseName(defaultName()))} - חלק 1</bdi>.` : 'הקלידו טווחים כדי לראות איך יחולק המסמך.';
  if (err) out.querySelector('.hint').style.color = 'var(--stamp)';
  out.querySelector('button').onclick = () => doSplit(groups);
  panel.append(out);

  desk.append(deskBar());
  if (sp.mode === 'manual') {
    const grid = h('<div class="manual-grid"></div>');
    S.pages.forEach((p, i) => {
      const s = sheetEl(p, i, { static: true });
      s.style.width = S.thumbW + 'px';
      grid.append(s);
      if (i < S.pages.length - 1) {
        const on = sp.cuts.has(p.key);
        const cut = h(`<button class="cut ${on ? 'on' : ''}" title="${on ? 'ביטול החיתוך' : 'חיתוך כאן'}" aria-label="${on ? 'ביטול החיתוך' : 'חיתוך'} אחרי עמוד ${i + 1}" aria-pressed="${on}">${icon('scissors')}</button>`);
        cut.onclick = () => { on ? sp.cuts.delete(p.key) : sp.cuts.add(p.key); render(); };
        grid.append(cut);
      }
    });
    desk.append(grid);
    return;
  }
  const wrap = h('<div class="split-groups"></div>');
  (groups || []).forEach((grp, gi) => {
    const color = FILE_COLORS[gi % FILE_COLORS.length];
    const first = grp[0] + 1, last = grp[grp.length - 1] + 1;
    const sec = h(`<section class="split-group" style="--g:${color}"><header><b>חלק ${gi + 1}</b><span>${grp.length === 1 ? `עמוד ${first}` : `עמודים ${first}–${last}`}</span></header><div class="grid"></div></section>`);
    const grid = sec.querySelector('.grid');
    grid.style.setProperty('--thumb-w', S.thumbW + 'px');
    grp.forEach((idx) => grid.append(sheetEl(S.pages[idx], idx, { static: true })));
    wrap.append(sec);
  });
  desk.append(wrap);
}

async function doSplit(groups) {
  const folder = await api.chooseFolder('לאיזו תיקייה לשמור את החלקים?');
  if (!folder) return;
  try {
    const written = await busy('מפצל ושומר…', async () => {
      const full = await buildBytes(S.pages);
      const parts = await Ops.splitDocument(full, groups);
      const base = baseName(defaultName());
      return api.writeFiles(folder, parts.map((bytes, i) => ({ name: `${base} - חלק ${i + 1}.pdf`, bytes })));
    });
    toast(`נשמרו ${written.length} קבצים`, { action: { label: 'הצגה בתיקייה', run: () => api.showInFolder(written[0]) } });
  } catch (e) {
    toast('הפיצול נכשל: ' + e.message, { error: true });
  }
}

function renderExtras() {
  const panel = $('#panel');
  const desk = $('#desk');
  const wm = S.extras.watermark;
  const pn = S.extras.pageNumbers;
  const g1 = h(`
    <div class="group">
      <label class="check"><input type="checkbox" data-k="wm" ${wm.enabled ? 'checked' : ''}><span><b style="font-weight:600">סימן מים</b><small>טקסט שקוף באלכסון על כל עמוד</small></span></label>
      <div data-box="wm" ${wm.enabled ? '' : 'hidden'} style="display:flex;flex-direction:column;gap:10px">
        <label class="field"><span>טקסט</span><input class="input" dir="auto" data-f="text" value="${esc(wm.text)}"></label>
        <div class="row2">
          <label class="field"><span>גודל</span><input class="input" type="number" min="12" max="200" data-f="size" value="${wm.size}"></label>
          <label class="field"><span>שקיפות</span><select class="select input" data-f="opacity">
            ${[[0.08, 'עדינה מאוד'], [0.16, 'עדינה'], [0.3, 'בינונית'], [0.5, 'בולטת']].map(([v, l]) => `<option value="${v}" ${wm.opacity === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
        </div>
        <div class="swatches" role="group" aria-label="צבע">${[['#C23A2E', 'אדום'], ['#1F35B5', 'כחול'], ['#5D6B72', 'אפור']].map(([c, n]) => `<button class="swatch" data-color="${c}" style="background:${c}" title="${n}" aria-label="${n}" aria-pressed="${wm.color === c}"></button>`).join('')}</div>
      </div>
    </div>`);
  const g2 = h(`
    <div class="group">
      <label class="check"><input type="checkbox" data-k="pn" ${pn.enabled ? 'checked' : ''}><span><b style="font-weight:600">מספרי עמודים</b><small>בתחתית או בראש כל עמוד</small></span></label>
      <div data-box="pn" ${pn.enabled ? '' : 'hidden'} style="display:flex;flex-direction:column;gap:10px">
        <label class="field"><span>נוסח</span><select class="select input" data-p="format">
          ${['עמוד {n} מתוך {total}', 'עמוד {n}', '{n}', '- {n} -', '{n}/{total}'].map((f) => `<option value="${esc(f)}" ${pn.format === f ? 'selected' : ''}>${esc(f.replace('{n}', '3').replace('{total}', '12'))}</option>`).join('')}
        </select></label>
        <label class="field"><span>מיקום</span><select class="select input" data-p="position">
          ${[['bottom-center', 'למטה באמצע'], ['bottom-right', 'למטה מימין'], ['bottom-left', 'למטה משמאל'], ['top-center', 'למעלה באמצע'], ['top-right', 'למעלה מימין'], ['top-left', 'למעלה משמאל']].map(([v, l]) => `<option value="${v}" ${pn.position === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
        <label class="check"><input type="checkbox" data-p="skipFirst" ${pn.skipFirst ? 'checked' : ''}><span>בלי מספר בעמוד הראשון (שער)</span></label>
      </div>
    </div>`);
  const g3 = h('<div class="group"><p class="hint">ההגדרות יחולו על הקובץ בשמירה. התצוגה משמאל מראה את העמודים הראשונים.</p></div>');
  panel.append(g1, g2, g3);

  const preview = h('<div class="preview-wrap"></div>');
  desk.append(preview);
  let t;
  const refresh = () => { clearTimeout(t); t = setTimeout(() => renderPreview(preview), 250); };

  g1.querySelector('[data-k=wm]').onchange = (e) => { wm.enabled = e.target.checked; g1.querySelector('[data-box=wm]').hidden = !wm.enabled; if (wm.enabled && !wm.text) wm.text = 'טיוטה'; refresh(); };
  g1.querySelectorAll('[data-f]').forEach((inp) => (inp.oninput = () => { const k = inp.dataset.f; wm[k] = k === 'text' ? inp.value : +inp.value; refresh(); }));
  g1.querySelectorAll('[data-color]').forEach((b) => (b.onclick = () => { wm.color = b.dataset.color; g1.querySelectorAll('[data-color]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); refresh(); }));
  g2.querySelector('[data-k=pn]').onchange = (e) => { pn.enabled = e.target.checked; g2.querySelector('[data-box=pn]').hidden = !pn.enabled; refresh(); };
  g2.querySelectorAll('[data-p]').forEach((inp) => (inp.onchange = () => { const k = inp.dataset.p; pn[k] = inp.type === 'checkbox' ? inp.checked : inp.value; refresh(); }));
  renderPreview(preview);
}

let previewToken = 0;

async function renderPreview(wrap) {
  const token = ++previewToken;
  const pages = S.pages.slice(0, Math.min(2, S.pages.length));
  try {
    const bytes = await buildBytes(pages, { totalOverride: S.pages.length });
    if (token !== previewToken) return;
    const pdf = await pdfjsLib.getDocument({ ...PDFJS_OPTS, data: bytes }).promise;
    const nodes = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const vp1 = pg.getViewport({ scale: 1 });
      const cssW = 340;
      const dpr = window.devicePixelRatio || 1;
      const vp = pg.getViewport({ scale: (cssW / vp1.width) * dpr });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      c.style.width = cssW + 'px';
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const box = h(`<div><div class="paper"></div><div class="preview-cap">עמוד ${i}</div></div>`);
      box.querySelector('.paper').append(c);
      nodes.push(box);
    }
    if (token === previewToken) wrap.replaceChildren(...nodes);
    pdf.destroy();
  } catch (e) {
    if (token === previewToken) wrap.replaceChildren(h(`<p class="hint" style="padding:40px">לא הצלחנו להציג תצוגה מקדימה: ${esc(e.message)}</p>`));
  }
}

const folderThumbs = new Map(); // path|mtime → canvas

async function renderFolder() {
  const panel = $('#panel');
  const desk = $('#desk');
  const g = h(`
    <div class="group">
      <h2>עיון בתיקייה</h2>
      <p class="hint">רואים את העמוד הראשון של כל קובץ PDF בתיקייה. לחיצה פותחת את הקובץ בלשונית חדשה.</p>
      <button class="btn btn-block">${icon('folder')}${S.folder ? 'החלפת תיקייה' : 'בחירת תיקייה'}</button>
    </div>`);
  g.querySelector('button').onclick = async () => {
    const f = await api.chooseFolder('בחירת תיקייה עם קבצי PDF');
    if (f) { S.folder = f; localStore('folder', f); render(); }
  };
  panel.append(g);

  if (!S.folder) {
    desk.append(h(`<div class="empty"><div class="empty-inner"><h1>בחרו תיקייה</h1><p>התוכנה תציג תמונה ממוזערת של העמוד הראשון בכל קובץ PDF שבה, כדי שתמצאו מסמך במבט אחד.</p></div></div>`));
    const b = h(`<button class="btn btn-primary btn-lg">${icon('folder')}בחירת תיקייה</button>`);
    b.onclick = g.querySelector('button').onclick;
    desk.querySelector('.empty-inner').append(b);
    return;
  }

  const head = h(`<div class="folder-head"><span class="folder-path" title="${esc(S.folder)}">${esc(S.folder)}</span></div>`);
  desk.append(head);
  let files;
  try { files = await api.listPdfs(S.folder); } catch (e) {
    desk.append(h('<div class="empty"><div class="empty-inner"><h1>התיקייה לא נמצאה</h1><p>ייתכן שהיא נמחקה או הועברה. בחרו תיקייה אחרת.</p></div></div>'));
    return;
  }
  if (S.tool !== 'folder') return;
  if (!files.length) {
    desk.append(h('<div class="empty"><div class="empty-inner"><h1>אין כאן קבצי PDF</h1><p>בחרו תיקייה אחרת מהלוח בצד.</p></div></div>'));
    return;
  }
  head.prepend(h(`<strong style="white-space:nowrap">${plural(files.length, 'קובץ אחד', 'קבצים')}</strong>`));
  const inWork = new Set([...docs.values()].map((d) => d.path).filter(Boolean));
  const grid = h('<div class="doc-grid"></div>');
  for (const f of files) {
    const added = inWork.has(f.path);
    const el = h(`
      <div style="position:relative">
        <button class="doc ${added ? 'added' : ''}" title="${esc(f.name)}">
          <div class="paper"><span class="loading" style="width:100%;height:100%"></span></div>
          <span class="doc-name">${esc(baseName(f.name))}</span>
          <span class="doc-meta">${fmtDate(f.mtime)}, ${fmtSize(f.size)}</span>
        </button>
        ${added ? '<span class="badge">פתוח</span>' : ''}
      </div>`);
    const btn = el.querySelector('.doc');
    btn.onclick = async () => {
      const entry = await api.readFile(f.path);
      await openEntries([entry], { tool: 'view' });
    };
    el.__render = async () => {
      const ck = f.path + '|' + f.mtime;
      let c = folderThumbs.get(ck);
      if (!c) {
        try {
          c = await schedule(async () => {
            const entry = await api.readFile(f.path);
            const pdf = await pdfjsLib.getDocument({ ...PDFJS_OPTS, data: entry.bytes }).promise;
            const pg = await pdf.getPage(1);
            const vp1 = pg.getViewport({ scale: 1 });
            const dpr = window.devicePixelRatio || 1;
            const vp = pg.getViewport({ scale: (180 / Math.max(vp1.width, vp1.height * 0.707)) * dpr });
            const cv = document.createElement('canvas');
            cv.width = vp.width; cv.height = vp.height;
            const ctx = cv.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
            await pg.render({ canvasContext: ctx, viewport: vp }).promise;
            pdf.destroy();
            return cv;
          });
          folderThumbs.set(ck, c);
        } catch (e) {
          el.querySelector('.paper').replaceChildren(h('<span style="padding:12px;line-height:1.4;font-size:12px;color:var(--ink-3)">לא ניתן להציג (מוגן או פגום)</span>'));
          return;
        }
      }
      const out = document.createElement('canvas');
      out.width = c.width; out.height = c.height;
      out.getContext('2d').drawImage(c, 0, 0);
      el.querySelector('.paper').replaceChildren(out);
    };
    lazy.observe(el);
    grid.append(el);
  }
  desk.append(grid);
}

async function buildBytes(pages, opts = {}) {
  const sources = {};
  for (const s of S.sources.values()) sources[s.id] = s.bytes;
  const ex = S.extras;
  const warnings = [];
  const redacted = pages.map((p, i) => [i, (S.stamps[p.key] || []).filter((it) => it.type === 'redact')]).filter(([, r]) => r.length);
  const out = await Ops.buildDocument(sources, pages.map((p) => ({ ...p })), S.stamps, S.formValues, {
    fonts: S.fonts,
    // בהשחרה משטחים את הטפסים — אחרת הערכים נשארים בשדות שמתחת
    flattenForms: S.flattenForms || redacted.length > 0,
    watermark: ex.watermark.enabled ? ex.watermark : null,
    pageNumbers: ex.pageNumbers.enabled ? { ...ex.pageNumbers, total: opts.totalOverride } : null,
    onWarning: (w) => warnings.push(w),
  });
  if (warnings.length) toast(warnings[0], { error: true });
  if (!redacted.length) return out;
  return applyRedactions(out, redacted);
}

/**
 * השחרה אמיתית: כל עמוד עם השחרה מצויר מחדש כתמונה (200 DPI) עם המלבנים השחורים,
 * ומחליף את העמוד המקורי. בסוף כל המסמך מועתק לקובץ חדש, כך שהתוכן המקורי של
 * העמודים שהוחלפו (טקסט, תמונות, שכבות, הערות) לא נשאר בקובץ אפילו כאובייקט נסתר.
 */
async function applyRedactions(bytes, redacted) {
  const { PDFDocument } = window.PDFLib;
  const pdf = await pdfjsLib.getDocument({ ...PDFJS_OPTS, data: bytes.slice() }).promise;
  const doc = await PDFDocument.load(bytes);
  const DPI = 200;
  try {
    for (const [idx, boxes] of redacted) {
      const pg = await pdf.getPage(idx + 1);
      const vp = pg.getViewport({ scale: DPI / 72, rotation: pg.rotate });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width);
      c.height = Math.ceil(vp.height);
      const ctx2d = c.getContext('2d');
      ctx2d.fillStyle = '#fff';
      ctx2d.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: ctx2d, viewport: vp, annotationMode: pdfjsLib.AnnotationMode.ENABLE }).promise;
      ctx2d.fillStyle = '#000';
      const k = DPI / 72;
      for (const b of boxes) ctx2d.fillRect(Math.floor(b.x * k), Math.floor(b.y * k), Math.ceil(b.w * k) + 1, Math.ceil(b.h * k) + 1);
      const jpg = await new Promise((res) => c.toBlob((bl) => bl.arrayBuffer().then((a) => res(new Uint8Array(a))), 'image/jpeg', 0.9));
      const img = await doc.embedJpg(jpg);
      const w = vp.width / k, hgt = vp.height / k;
      const np = doc.insertPage(idx, [w, hgt]);
      np.drawImage(img, { x: 0, y: 0, width: w, height: hgt });
      doc.removePage(idx + 1);
      c.width = c.height = 0;
    }
  } finally {
    pdf.destroy();
  }
  // העתקה למסמך נקי: רק מה שנגיש מהעמודים עובר. שאריות העמודים המקוריים נשמטות
  const clean = await PDFDocument.create();
  const copied = await clean.copyPages(doc, doc.getPageIndices());
  copied.forEach((p) => clean.addPage(p));
  clean.setProducer('איתןPDF');
  return clean.save();
}

async function about() {
  const v = await api.appVersion();
  const back = h(`
    <div class="modal-back"><div class="modal about" role="dialog" aria-modal="true" aria-labelledby="ab-t" style="width:min(460px,100%)">
      <header><h2 id="ab-t">איתןPDF</h2><button class="icon-btn" aria-label="סגירה">${icon('x')}</button></header>
      <div class="body">
        <p class="ver">גרסה ${esc(v)}</p>
        <p>תוכנה חינמית בקוד פתוח לעבודה עם קבצי PDF בעברית. כל העיבוד נעשה על המחשב שלכם, בלי אינטרנט ובלי להעלות קבצים.</p>
        <p>בנויה על pdf.js, pdf-lib ו-bidi-js. גופנים: Alef ו-IBM Plex Sans Hebrew (רישיון OFL).</p>
      </div>
    </div></div>`);
  const close = () => back.remove();
  back.querySelector('button').onclick = close;
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  $('#modal-root').append(back);
}

function isTyping() {
  const a = document.activeElement;
  return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable) && a.type !== 'checkbox' && a.type !== 'radio' && a.type !== 'range';
}


/* =========================================================
 * פתיחת קבצים ולשוניות
 * ======================================================= */
/** טעינת קובץ PDF לתוך מסמך (ברירת מחדל: הלשונית הפעילה) */
async function addPdf(entry, opts = {}) {
  const doc = opts.doc || D() || newDoc(baseName(entry.name), entry.path);
  const bytes = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes);
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ ...PDFJS_OPTS, data: bytes.slice() }).promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') toast(`"${entry.name}" מוגן בסיסמה. הסירו את הסיסמה ונסו שוב.`, { error: true });
    else toast(`לא הצלחנו לפתוח את "${entry.name}". ייתכן שהקובץ פגום.`, { error: true });
    return null;
  }
  const id = 's' + seq++;
  const color = FILE_COLORS[doc.sources.size % FILE_COLORS.length];
  const src = { id, name: entry.name, path: entry.path || null, bytes, pdf, count: pdf.numPages, color, fields: [] };
  doc.sources.set(id, src);
  Ops.getFormFields(bytes).then((f) => {
    src.fields = f.filter((x) => !x.readOnly && x.page >= 0);
    if (src.fields.length && doc.id === activeId) render();
  }).catch(() => {});
  const newPages = Array.from({ length: pdf.numPages }, (_, i) => ({ key: `${id}:${i}`, src: id, index: i, rotate: 0 }));
  if (opts.initial) {
    doc.pages.push(...newPages);
  } else {
    const prev = activeId;
    activeId = doc.id;
    commit(() => { doc.pages.push(...newPages); }, { render: false });
    activeId = prev;
  }
  return src;
}

/** כל קובץ נפתח בלשונית משלו. קובץ שכבר פתוח — עוברים אליו */
async function openEntries(entries, opts = {}) {
  if (!entries || !entries.length) return;
  let last = null;
  await busy(entries.length > 1 ? `פותח ${entries.length} קבצים…` : 'פותח את הקובץ…', async () => {
    for (const e of entries) {
      const existing = e.path && [...docs.values()].find((d) => d.path && d.path === e.path);
      if (existing) { last = existing; continue; }
      const d = newDoc(baseName(e.name), e.path || null);
      const ok = await addPdf(e, { doc: d, initial: true });
      if (!ok) { docs.delete(d.id); continue; }
      last = d;
    }
  });
  if (last) activate(last.id, opts.tool || (S.tool === 'folder' || S.tool === 'windows' ? 'view' : S.tool));
  else render();
}

/** מיזוג: כל הקבצים בלשונית חדשה אחת */
async function openMerged(entries) {
  if (!entries.length) return;
  const d = newDoc('מיזוג חדש', null);
  await busy(`ממזג ${entries.length} קבצים…`, async () => {
    for (const e of entries) await addPdf(e, { doc: d, initial: true });
  });
  if (!d.sources.size) { docs.delete(d.id); return render(); }
  d.dirty = true;
  activate(d.id, 'merge');
}

async function openDialog() {
  const entries = await api.openPdfs();
  await openEntries(entries);
}

/** הוספת קבצים למסמך הפעיל (מיזוג) */
async function addFilesToDoc() {
  const entries = await api.openPdfs();
  if (!entries.length) return;
  if (!D()) return openEntries(entries);
  await busy('מוסיף קבצים…', async () => { for (const e of entries) await addPdf(e); });
  render();
}

/** מיזוג לשונית פתוחה אחרת לתוך הלשונית הפעילה */
async function mergeTabInto(otherId) {
  const other = docs.get(otherId);
  const d = D();
  if (!other || !d || other === d) return;
  const remap = new Map();
  commit(() => {
    for (const s of other.sources.values()) {
      const id = 's' + seq++;
      remap.set(s.id, id);
      d.sources.set(id, { ...s, id, color: FILE_COLORS[d.sources.size % FILE_COLORS.length] });
    }
    for (const p of other.pages) {
      const np = { ...p };
      if (p.src !== 'blank') { np.src = remap.get(p.src); np.key = `${np.src}:${p.index}`; }
      else np.key = `blank:${blankSeq++}`;
      if (other.stamps[p.key]) d.stamps[np.key] = JSON.parse(JSON.stringify(other.stamps[p.key]));
      d.pages.push(np);
    }
    for (const [sid, vals] of Object.entries(other.formValues)) if (remap.has(sid)) d.formValues[remap.get(sid)] = { ...vals };
  });
  toast(`"${other.title}" מוזג לסוף המסמך`);
}

function removeSource(id) {
  const src = S.sources.get(id);
  commit(() => {
    S.pages = S.pages.filter((p) => p.src !== id);
    delete S.formValues[id];
  });
  toast(`"${baseName(src.name)}" הוסר מהמסמך`, { action: { label: 'ביטול', run: undo } });
}

function activate(id, tool) {
  const cur = D();
  if (cur) cur.scroll = $('#desk').scrollTop;
  activeId = id;
  if (tool) S.tool = normalizeTool(tool);
  S.placing = null;
  S.activeItem = null;
  render();
  const d = D();
  if (d) requestAnimationFrame(() => { $('#desk').scrollTop = d.scroll || 0; });
}

async function closeTab(id) {
  const d = docs.get(id);
  if (!d) return;
  if (d.dirty) {
    const choice = await confirmDialog(`לשמור את השינויים ב"${d.title}"?`, 'אם לא תשמרו, השינויים יאבדו.', [
      { id: 'save', label: 'שמירה', primary: true },
      { id: 'discard', label: 'בלי לשמור' },
      { id: 'cancel', label: 'ביטול', quiet: true },
    ]);
    if (choice === 'cancel' || !choice) return;
    if (choice === 'save') {
      const prev = activeId;
      activeId = id;
      const ok = await saveDocument();
      if (!ok) { activeId = prev; return; }
      activeId = prev;
    }
  }
  const ids = [...docs.keys()];
  const idx = ids.indexOf(id);
  for (const s of d.sources.values()) { try { s.pdf.destroy(); } catch (e) { /* כבר נסגר */ } }
  docs.delete(id);
  if (activeId === id) {
    const rest = [...docs.keys()];
    activeId = rest[Math.min(idx, rest.length - 1)] || null;
  }
  syncDirty();
  render();
}

function confirmDialog(title, body, buttons) {
  return new Promise((resolve) => {
    const back = h(`
      <div class="modal-back"><div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="cf-t" style="width:min(460px,100%)">
        <header><h2 id="cf-t">${esc(title)}</h2></header>
        <div class="body"><p>${esc(body)}</p></div>
        <footer></footer>
      </div></div>`);
    const foot = back.querySelector('footer');
    for (const b of buttons) {
      const el = h(`<button class="btn ${b.primary ? 'btn-primary' : ''} ${b.quiet ? 'btn-quiet push' : ''}">${esc(b.label)}</button>`);
      el.onclick = () => { back.remove(); resolve(b.id); };
      foot.append(el);
    }
    back.addEventListener('keydown', (e) => { if (e.key === 'Escape') { back.remove(); resolve('cancel'); } });
    $('#modal-root').append(back);
    foot.querySelector('.btn-primary')?.focus();
  });
}

function syncDirty() {
  api.setDirty([...docs.values()].some((d) => d.dirty));
}

/* =========================================================
 * רינדור כללי: לשוניות, סרגל כלים, לוח אפשרויות, שולחן
 * ======================================================= */
function render() {
  const d = D();
  const tool = TOOLS.find((t) => t.id === S.tool) || TOOLS[0];
  if (tool.doc && !d) S.tool = tool.id; // נשאר — מוצג מסך ריק
  renderTabs();
  renderRail();
  const desk = $('#desk');
  const panel = $('#panel');
  const keepScroll = desk.scrollTop;
  desk.innerHTML = '';
  panel.innerHTML = '';
  const needsDoc = tool.doc && (!d || !d.pages.length);
  const showPanel = !needsDoc && tool.panel !== false;
  document.body.classList.toggle('no-panel', !showPanel);
  if (needsDoc) {
    if (d && !d.pages.length) renderEmptyDoc();
    else renderEmpty();
  } else {
    ({
      view: renderView, pages: renderPages, sign: renderSign,
      forms: renderForms, folder: renderFolder, windows: renderWindows,
    })[S.tool]();
  }
  desk.scrollTop = keepScroll;
  updateChrome();
}

function updateChrome() {
  const d = D();
  $('#btn-save').disabled = !d || !d.pages.length;
  $('#btn-save').classList.toggle('dirty', !!(d && d.dirty));
  updateViewCtl();
  document.title = d ? `${d.title}${d.dirty ? ' •' : ''} — איתןPDF` : 'איתןPDF';
}

function setView(v) {
  v = normalizeTool(v);
  if (S.tool === v) { render(); return; }
  const cur = D();
  if (cur) cur.scroll = 0;
  S.tool = v;
  S.placing = null;
  S.activeItem = null;
  $('#desk').scrollTop = 0;
  render();
}

function renderTabs() {
  const bar = $('#tabs');
  bar.innerHTML = '';
  for (const d of docs.values()) {
    const on = d.id === activeId;
    const t = h(`
      <div class="tab ${on ? 'on' : ''}" role="tab" aria-selected="${on}" title="${esc(d.path || d.title)}">
        <button class="tab-name" ${on ? 'tabindex="-1"' : ''}>${icon('doc')}${d.dirty ? '<span class="dot" aria-label="לא נשמר"></span>' : ''}<span class="tab-text">${esc(d.title)}</span></button>
        <button class="tab-x" aria-label="סגירת ${esc(d.title)}" title="סגירה">${icon('x')}</button>
      </div>`);
    t.querySelector('.tab-name').onclick = () => { if (!on) activate(d.id); };
    t.querySelector('.tab-name').addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(d.id); });
    t.querySelector('.tab-x').onclick = (e) => { e.stopPropagation(); closeTab(d.id); };
    bar.append(t);
  }
}

function renderRail() {
  const rail = $('#rail');
  rail.innerHTML = '';
  const d = D();
  const top = h('<div class="rail-group"></div>');
  const bottom = h('<div class="rail-group rail-bottom"></div>');
  for (const t of TOOLS) {
    const disabled = t.doc && (!d || !d.pages.length);
    const b = h(`<button class="rail-btn" aria-pressed="${S.tool === t.id}" ${disabled ? 'disabled' : ''}>${icon(t.icon)}<span>${esc(t.label)}</span></button>`);
    b.onclick = () => setView(t.id);
    (t.bottom ? bottom : top).append(b);
  }
  rail.append(top, bottom);
}

/* ---------- מסכים ריקים ---------- */
function renderEmpty() {
  const desk = $('#desk');
  const el = h(`
    <div class="empty">
      <div class="empty-inner">
        <div class="empty-stack" aria-hidden="true">
          <div class="sheet-ghost"></div>
          <div class="sheet-ghost"></div>
          <div class="sheet-ghost">
            <span class="ghost-line"></span><span class="ghost-line m"></span><span class="ghost-line"></span>
            <span class="ghost-line s"></span><span class="ghost-line m"></span>
            <svg class="ghost-sign" viewBox="0 0 82 34"><path d="M4 26c6-12 10-18 12-17.4 2.4.6-1.6 13.2.8 13.6 2 .4 5.2-7.6 7.2-7.2 1.6.4.6 4.8 4 5.2 3.2.4 6.4-6 9.6-5.6 2.4.3 1.2 4 4 4.4 3 .4 8-3 12-3.6 3-.4 6 .8 9 .4"/></svg>
          </div>
        </div>
        <h1>גררו לכאן קבצי PDF</h1>
        <p>כל קובץ נפתח בלשונית משלו. משם אפשר לחתום, למלא טפסים, למזג, לפצל ולסדר עמודים, בעברית תקינה.</p>
        <div class="btn-row">
          <button class="btn btn-primary btn-lg" data-act="open">פתיחת קבצים</button>
          <button class="btn btn-lg" data-act="folder">${icon('folder')}עיון בתיקייה</button>
          <button class="btn btn-quiet btn-lg" data-act="images">${icon('image')}תמונות ל-PDF</button>
        </div>
        <p class="empty-note">הקבצים לא עולים לשום מקום. התוכנה עובדת גם בלי אינטרנט.</p>
      </div>
    </div>`);
  el.querySelector('[data-act=open]').onclick = openDialog;
  el.querySelector('[data-act=folder]').onclick = () => setView('folder');
  el.querySelector('[data-act=images]').onclick = addImages;
  desk.append(el);
}

function renderEmptyDoc() {
  const el = h(`<div class="empty"><div class="empty-inner"><h1>אין עמודים במסמך</h1><p>כל העמודים נמחקו. אפשר לבטל (Ctrl+Z) או להוסיף קובץ.</p><div class="btn-row"><button class="btn btn-primary btn-lg">${icon('plus')}הוספת קובץ</button></div></div></div>`);
  el.querySelector('button').onclick = addFilesToDoc;
  $('#desk').append(el);
}

/* =========================================================
 * עמודים (סידור/סיבוב/מחיקה) ומיזוג
 * ======================================================= */
function pageGrid() {
  const desk = $('#desk');
  desk.append(deskBar());
  const grid = h('<div class="grid" role="listbox" aria-multiselectable="true" aria-label="עמודים"></div>');
  grid.style.setProperty('--thumb-w', S.thumbW + 'px');
  S.pages.forEach((p, i) => grid.append(sheetEl(p, i)));
  desk.append(grid);
  wireReorder(grid);
}

function renderArrange() {
  const panel = $('#panel');
  const sel = S.selected.size;
  const pg = h(`
    <div class="group">
      <h2>פעולות על עמודים</h2>
      <p class="hint">${sel ? `נבחרו ${plural(sel, 'עמוד אחד', 'עמודים')}.` : 'לחיצה בוחרת עמוד, Ctrl או Shift בוחרים כמה. גוררים כדי לשנות סדר, לחיצה כפולה פותחת את העמוד.'}</p>
      <div class="tool-grid">
        <button class="tool" data-a="rotR" ${sel ? '' : 'disabled'}>${icon('rotR')}סיבוב ימינה</button>
        <button class="tool" data-a="rotL" ${sel ? '' : 'disabled'}>${icon('rotL')}סיבוב שמאלה</button>
        <button class="tool" data-a="dup" ${sel ? '' : 'disabled'}>${icon('dup')}שכפול</button>
        <button class="tool tool-danger" data-a="del" ${sel ? '' : 'disabled'}>${icon('trash')}מחיקה</button>
        <button class="tool" data-a="extract" ${sel ? '' : 'disabled'}>${icon('extract')}שמירת הנבחרים כקובץ</button>
        <button class="tool" data-a="blank">${icon('pagePlus')}עמוד ריק</button>
      </div>
    </div>`);
  pg.querySelector('[data-a=rotR]').onclick = () => rotateSelected(90);
  pg.querySelector('[data-a=rotL]').onclick = () => rotateSelected(-90);
  pg.querySelector('[data-a=del]').onclick = deleteSelected;
  pg.querySelector('[data-a=blank]').onclick = addBlank;
  pg.querySelector('[data-a=dup]').onclick = duplicateSelected;
  pg.querySelector('[data-a=extract]').onclick = () => saveAs({ onlySelected: true });
  panel.append(pg);
  pageGrid();
}

function renderPages() {
  const panel = $('#panel');
  const seg = h('<div class="segmented pages-modes" role="tablist" aria-label="פעולות על עמודים"></div>');
  for (const m of PAGES_MODES) {
    const b = h(`<button role="tab" aria-pressed="${S.pagesMode === m.id}" aria-selected="${S.pagesMode === m.id}">${m.label}</button>`);
    b.onclick = () => { if (S.pagesMode !== m.id) { S.pagesMode = m.id; S.selected.clear(); $('#desk').scrollTop = 0; render(); } };
    seg.append(b);
  }
  panel.append(seg);
  ({ arrange: renderArrange, merge: renderMerge, split: renderSplit, extras: renderExtras })[S.pagesMode]();
}

function renderMerge() {
  const panel = $('#panel');
  panel.append(filesGroup());
  const others = [...docs.values()].filter((d) => d.id !== activeId && d.pages.length);
  if (others.length) {
    const g = h('<div class="group"><h2>מיזוג לשונית פתוחה</h2><p class="hint">העמודים שלה יתווספו לסוף המסמך הזה.</p><div class="merge-list"></div></div>');
    const list = g.querySelector('.merge-list');
    for (const o of others) {
      const b = h(`<button class="merge-item">${icon('plus')}<span>${esc(o.title)}</span><small>${plural(o.pages.length, 'עמוד אחד', 'עמודים')}</small></button>`);
      b.onclick = () => mergeTabInto(o.id);
      list.append(b);
    }
    panel.append(g);
  }
  panel.append(h(`
    <div class="group">
      <p class="hint">הלשונית הצבעונית מעל כל עמוד מראה מאיזה קובץ הגיע. גוררים עמודים לסדר הרצוי ושומרים.</p>
    </div>`));
  pageGrid();
}

/* =========================================================
 * צפייה, טקסט וחתימה, טפסים — עמודים בגלילה
 * ======================================================= */
let editorScrollTarget = null;
function openInEditor(key) {
  editorScrollTarget = key;
  setView('view');
  if (editorScrollTarget) scrollToEditorPage();
}

function pageColumn() {
  const desk = $('#desk');
  const d = D();
  const n = S.pages.length;
  d.curPage = Math.max(0, Math.min(n - 1, d.curPage || 0));
  const layout = S.layout;
  const col = h(`<div class="pages-column layout-${layout}"></div>`);
  const deskW = desk.clientWidth || 900;
  const deskH = desk.clientHeight || 700;
  const maxW = layout === 'two'
    ? Math.max(220, Math.min(820, (deskW - 170) / 2))
    : Math.max(320, Math.min(1000, deskW - 120));
  const maxH = Math.max(240, deskH - 120);
  if (layout === 'single') col.append(editorPage(S.pages[d.curPage], d.curPage, maxW, maxH));
  else S.pages.forEach((p, i) => col.append(editorPage(p, i, maxW, maxH)));
  desk.append(col);
  desk.append(pageNav());
  if (editorScrollTarget) scrollToEditorPage();
}

/** פס ניווט צף בתחתית: עמוד קודם/הבא ומעבר ישיר למספר עמוד */
function pageNav() {
  const d = D();
  const n = S.pages.length;
  const nav = h(`
    <div class="page-nav" role="group" aria-label="ניווט בין עמודים">
      <button class="icon-btn" data-nav="-1" title="העמוד הקודם (PageUp)" aria-label="העמוד הקודם">${icon('chevR')}</button>
      <label class="page-nav-pos"><input class="page-nav-input" type="text" inputmode="numeric" value="${d.curPage + 1}" aria-label="מספר עמוד"><span>מתוך ${n}</span></label>
      <button class="icon-btn" data-nav="1" title="העמוד הבא (PageDown)" aria-label="העמוד הבא">${icon('chevL')}</button>
    </div>`);
  nav.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => goToPage(D().curPage + +b.dataset.nav)));
  const inp = nav.querySelector('input');
  inp.onfocus = () => inp.select();
  inp.onkeydown = (e) => {
    if (e.key === 'Enter') {
      const v = parseInt(inp.value, 10);
      inp.blur();
      if (v >= 1) goToPage(v - 1);
    } else if (e.key === 'Escape') { inp.value = D().curPage + 1; inp.blur(); }
  };
  inp.onblur = () => { if (D()) inp.value = D().curPage + 1; };
  updatePageNav(nav);
  return nav;
}

function updatePageNav(nav = $('#desk .page-nav')) {
  const d = D();
  if (!nav || !d) return;
  const inp = nav.querySelector('input');
  if (document.activeElement !== inp) inp.value = d.curPage + 1;
  nav.querySelector('[data-nav="-1"]').disabled = d.curPage <= 0;
  nav.querySelector('[data-nav="1"]').disabled = d.curPage >= S.pages.length - 1;
}

/** מעבר לעמוד. atEnd: בעמוד יחיד — להציג את תחתית העמוד (כשגוללים אחורה) */
function goToPage(i, atEnd) {
  const d = D();
  if (!d || !S.pages.length) return;
  i = Math.max(0, Math.min(S.pages.length - 1, i));
  const desk = $('#desk');
  if (S.layout === 'single') {
    if (d.curPage === i) return;
    d.curPage = i;
    S.activeItem = null;
    render();
    desk.scrollTop = atEnd ? desk.scrollHeight : 0;
    return;
  }
  d.curPage = i;
  const el = desk.querySelector(`.page-frame[data-idx="${i}"]`);
  if (el) desk.scrollTop += el.getBoundingClientRect().top - desk.getBoundingClientRect().top - 16;
  updatePageNav();
}

/** בגלילה רציפה: העמוד הנוכחי הוא זה שחוצה את השליש העליון של המסך */
let trackRaf = 0;
function trackPage() {
  trackRaf = 0;
  const d = D();
  if (!d || !PAGE_COLUMN_TOOLS.has(S.tool) || S.layout === 'single') return;
  const desk = $('#desk');
  const line = desk.getBoundingClientRect().top + desk.clientHeight * 0.33;
  let idx = 0;
  for (const f of desk.querySelectorAll('.page-frame')) {
    if (f.getBoundingClientRect().top <= line) idx = +f.dataset.idx;
    else break;
  }
  if (d.curPage !== idx) { d.curPage = idx; updatePageNav(); }
}

function setLayout(l) {
  if (!['single', 'continuous', 'two'].includes(l) || S.layout === l) return;
  S.layout = l;
  localStore('layout', l);
  if (!PAGE_COLUMN_TOOLS.has(S.tool)) { updateViewCtl(); return; }
  const d = D();
  render();
  if (d) {
    if (l === 'single') $('#desk').scrollTop = 0;
    else goToPage(d.curPage);
  }
}

/** זום: יחסית לגודל הנוכחי של העמוד הראשון שנראה */
function zoom(dir) {
  if (dir === 'fit' || dir === 'page') S.zoom = dir;
  else {
    const frame = $('#desk .page-frame');
    const cur = typeof S.zoom === 'string' ? (frame && frame.__ctx ? frame.__ctx.scale : 1) : S.zoom;
    const steps = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
    S.zoom = dir === 'in' ? steps.find((s) => s > cur + 0.01) || 3 : [...steps].reverse().find((s) => s < cur - 0.01) || 0.5;
  }
  const desk = $('#desk');
  const ratio = desk.scrollTop / Math.max(1, desk.scrollHeight);
  render();
  desk.scrollTop = ratio * desk.scrollHeight;
}

/** זום מהסרגל העליון או מהתפריט: בעמודים בגלילה — זום אמיתי; ברשת העמודים — גודל התמונות הממוזערות */
const THUMB_DEFAULT = 168;
function zoomCmd(dir) {
  if (!D() || !S.pages.length) return;
  if (PAGE_COLUMN_TOOLS.has(S.tool)) return zoom(dir);
  if (S.tool !== 'pages') return;
  S.thumbW = dir === 'in' || dir === 'out'
    ? Math.max(110, Math.min(300, S.thumbW + (dir === 'in' ? 24 : -24)))
    : THUMB_DEFAULT;
  localStore('thumbW', String(S.thumbW));
  render();
}

/** פקדי התצוגה בסרגל העליון: פריסת עמודים וזום */
function buildViewCtl() {
  const el = $('#view-ctl');
  el.innerHTML = `
    <div class="ctl-group" role="radiogroup" aria-label="פריסת עמודים">
      <button class="icon-btn" data-layout="single" role="radio" title="עמוד יחיד" aria-label="עמוד יחיד">${icon('single')}</button>
      <button class="icon-btn" data-layout="continuous" role="radio" title="גלילה רציפה" aria-label="גלילה רציפה">${icon('continuous')}</button>
      <button class="icon-btn" data-layout="two" role="radio" title="שני עמודים זה לצד זה" aria-label="שני עמודים זה לצד זה">${icon('two')}</button>
    </div>
    <div class="ctl-group" role="group" aria-label="זום">
      <button class="icon-btn" data-z="out" title="הקטנה (Ctrl -)" aria-label="הקטנה">${icon('zoomOut')}</button>
      <span class="zoom-val" aria-live="polite"></span>
      <button class="icon-btn" data-z="in" title="הגדלה (Ctrl +)" aria-label="הגדלה">${icon('zoomIn')}</button>
      <span class="ctl-sep"></span>
      <button class="icon-btn" data-z="fit" title="התאמה לרוחב (Ctrl 0)" aria-label="התאמה לרוחב">${icon('fitW')}</button>
      <button class="icon-btn" data-z="page" title="עמוד שלם במסך" aria-label="עמוד שלם במסך">${icon('fitPage')}</button>
    </div>`;
  el.querySelectorAll('[data-layout]').forEach((b) => (b.onclick = () => setLayout(b.dataset.layout)));
  el.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => zoomCmd(b.dataset.z)));
}

function updateViewCtl() {
  const el = $('#view-ctl');
  const d = D();
  const show = !!(d && d.pages.length && (PAGE_COLUMN_TOOLS.has(S.tool) || S.tool === 'pages'));
  el.hidden = !show;
  if (!show) return;
  const column = PAGE_COLUMN_TOOLS.has(S.tool);
  el.querySelector('[role=radiogroup]').hidden = !column; // ברשת העמודים אין פריסה — רק גודל
  el.querySelectorAll('[data-layout]').forEach((b) => {
    const on = b.dataset.layout === S.layout;
    b.disabled = !column;
    b.classList.toggle('on', column && on);
    b.setAttribute('aria-checked', String(on));
  });
  el.querySelectorAll('[data-z=fit],[data-z=page]').forEach((b) => {
    b.classList.toggle('on', column && S.zoom === b.dataset.z);
    b.setAttribute('aria-pressed', String(column && S.zoom === b.dataset.z));
  });
  let pct;
  if (column) {
    const frame = $('#desk .page-frame');
    pct = typeof S.zoom === 'number' ? S.zoom : frame && frame.__ctx ? frame.__ctx.scale : 1;
  } else pct = S.thumbW / THUMB_DEFAULT;
  el.querySelector('.zoom-val').textContent = Math.round(pct * 100) + '%';
}

function renderView() {
  pageColumn();
}

function signTools() {
  const tools = h(`
    <div class="group">
      <h2>הוספה לעמוד</h2>
      <p class="hint">${S.placing === 'redact' ? 'גררו מלבן על מה שצריך להימחק. אפשר לסמן כמה אזורים ברצף. Esc לסיום.' : S.placing ? 'לחצו על המקום בעמוד שבו זה צריך להופיע. Esc לביטול.' : 'בוחרים כלי ולוחצים על המקום הרצוי בעמוד.'}</p>
      <div class="tool-grid">
        <button class="tool" data-t="text" aria-pressed="${S.placing === 'text'}">${icon('text')}טקסט</button>
        <button class="tool" data-t="signature" aria-pressed="${S.placing === 'signature'}">${icon('sign')}חתימה</button>
        <button class="tool" data-t="date" aria-pressed="${S.placing === 'date'}">${icon('date')}תאריך<small>${todayStr()}</small></button>
        <button class="tool" data-t="redact" aria-pressed="${S.placing === 'redact'}">${icon('redact')}השחרה<small>מוחקת לצמיתות</small></button>
        <button class="tool" data-t="rect" aria-pressed="${S.placing === 'rect'}">${icon('erase')}כיסוי לבן<small>מסתיר בלבד</small></button>
        <button class="tool" data-t="image" aria-pressed="${S.placing === 'image'}">${icon('image')}תמונה או חותמת</button>
      </div>
    </div>`);
  tools.querySelectorAll('[data-t]').forEach((b) => {
    b.onclick = async () => {
      const t = b.dataset.t;
      if (S.placing === t) { S.placing = null; return render(); }
      if (t === 'signature' && !S.signature) {
        const sig = await signatureDialog();
        if (!sig) return;
      }
      if (t === 'image') {
        const imgs = await api.openImages();
        if (!imgs.length) return;
        const im = imgs[0];
        const mime = /\.png$/i.test(im.name) ? 'image/png' : 'image/jpeg';
        S.pendingImage = await bytesToDataUrl(im.bytes, mime);
        await preloadRatio(S.pendingImage);
      }
      S.placing = t;
      render();
    };
  });
  return tools;
}

function signaturesGroup() {
  const saved = savedSignatures();
  const sg = h(`<div class="group"><h2>החתימות שלי</h2><div class="sig-saved"></div><div class="btn-row"><button class="btn">${icon('sign')}חתימה חדשה</button></div></div>`);
  const wrap = sg.querySelector('.sig-saved');
  if (!saved.length) wrap.replaceWith(h('<p class="hint">עוד לא שמרתם חתימה. חתימה שתיצרו תישמר כאן לפעם הבאה, רק במחשב הזה.</p>'));
  saved.forEach((dataUrl, i) => {
    const chip = h(`<button class="sig-chip" aria-pressed="${S.signature === dataUrl}" title="שימוש בחתימה הזו"><img alt="חתימה ${i + 1}" src="${dataUrl}"><span class="x" role="button" aria-label="מחיקת החתימה">×</span></button>`);
    chip.onclick = (e) => {
      if (e.target.classList.contains('x')) {
        const list = savedSignatures().filter((x) => x !== dataUrl);
        localStore('signatures', JSON.stringify(list));
        if (S.signature === dataUrl) S.signature = null;
        return render();
      }
      S.signature = dataUrl;
      S.placing = 'signature';
      render();
    };
    wrap.append(chip);
  });
  sg.querySelector('.btn-row .btn').onclick = async () => { if (await signatureDialog()) { S.placing = 'signature'; render(); } };
  return sg;
}

function renderSign() {
  const panel = $('#panel');
  panel.append(signTools(), signaturesGroup());
  pageColumn();
}

function renderForms() {
  const panel = $('#panel');
  const desk = $('#desk');
  const withFields = [...S.sources.values()].filter((s) => s.fields.length && S.pages.some((p) => p.src === s.id));
  if (!withFields.length) {
    panel.append(h('<div class="group"><h2>טפסים</h2><p class="hint">אין במסמך הזה שדות טופס למילוי. כדי לכתוב על טופס סרוק או רגיל, השתמשו ב"טקסט וחתימה".</p></div>'));
    const b = h(`<button class="btn btn-block">${icon('text')}מעבר לטקסט וחתימה</button>`);
    b.onclick = () => setView('sign');
    panel.firstElementChild.append(b);
  } else {
    const fg = h(`<div class="group"><h2>שדות טופס</h2><p class="hint">ממלאים ישירות על הדף, או בוחרים שדה מהרשימה כדי לקפוץ אליו.</p><div class="field-list"></div>
      <label class="check"><input type="checkbox" ${S.flattenForms ? 'checked' : ''}><span>נעילת הטופס בשמירה<small>השדות יהפכו לטקסט רגיל שלא ניתן לשנות</small></span></label></div>`);
    const list = fg.querySelector('.field-list');
    for (const s of withFields) {
      for (const f of s.fields) {
        const v = fieldValue(s.id, f);
        const shown = f.type === 'CheckBox' ? (v ? 'מסומן' : 'לא מסומן') : v || 'ריק';
        const b = h(`<button><span class="fname">${esc(f.name)}</span><span class="fval ${v ? '' : 'none'}">${esc(shown)}</span></button>`);
        b.onclick = () => {
          const inp = desk.querySelector(`[data-field="${CSS.escape(s.id + '|' + f.name)}"]`);
          if (inp) { inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); inp.focus({ preventScroll: true }); }
          else { editorScrollTarget = `${s.id}:${f.page}`; scrollToEditorPage(); }
        };
        list.append(b);
      }
    }
    fg.querySelector('input').onchange = (e) => { S.flattenForms = e.target.checked; markDirty(); };
    panel.append(fg);
  }
  pageColumn();
}

/* =========================================================
 * שילוב ב-Windows: קליק ימני, תמונות ממוזערות, תוכנת ברירת מחדל
 * ======================================================= */
async function renderWindows() {
  const desk = $('#desk');
  const wrap = h('<div class="settings"><h1>שילוב ב-Windows</h1><p class="lead">התוכנה יכולה להתחבר לסייר הקבצים, כך שלא צריך לפתוח אותה כדי להגיע לפעולות הנפוצות. כל ההגדרות כאן חלות רק על המשתמש שלכם, ולא דורשות הרשאות מנהל.</p><div class="cards"><p class="hint">בודק את המצב הנוכחי…</p></div></div>');
  desk.append(wrap);
  let st;
  try { st = await api.integrationStatus(); } catch (e) { st = { supported: false, error: e.message }; }
  if (S.tool !== 'windows') return;
  const cards = wrap.querySelector('.cards');
  cards.innerHTML = '';
  if (!st.supported) {
    cards.append(h(`<p class="hint">${esc(st.error || 'האפשרויות האלה זמינות רק ב-Windows.')}</p>`));
    return;
  }
  const card = (key, title, body, on, note) => {
    const c = h(`
      <section class="card ${on ? 'on' : ''}">
        <div class="card-text">
          <h2>${esc(title)}${on ? `<span class="pill">${icon('check')}פעיל</span>` : ''}</h2>
          <p>${body}</p>
          ${note ? `<p class="note">${note}</p>` : ''}
        </div>
        <button class="btn ${on ? 'btn-danger' : 'btn-primary'}">${on ? 'הסרה' : 'הפעלה'}</button>
      </section>`);
    c.querySelector('button').onclick = async () => {
      const res = await busy(on ? 'מסיר…' : 'מגדיר…', () => api.integrationSet(key, !on));
      if (res && res.error) toast(res.error, { error: true });
      else toast(on ? 'הוסר' : 'הופעל. ייתכן שצריך לפתוח מחדש את חלון הסייר.');
      render();
    };
    return c;
  };
  cards.append(
    card('context', 'קליק ימני על קבצי PDF',
      'בלחיצה ימנית על קובץ PDF אחד או כמה יופיעו "פתיחה", "מיזוג" ו"פיצול" באיתןPDF. מסמנים כמה קבצים ובוחרים "מיזוג" כדי לאחד אותם.',
      st.context, 'ב-Windows 11 הפעולות נמצאות תחת "הצגת אפשרויות נוספות".'),
    card('thumbs', 'תמונות ממוזערות בסייר הקבצים',
      'הסייר יציג את העמוד הראשון של כל קובץ PDF במקום אייקון, בתצוגת "סמלים גדולים".',
      st.thumbs, 'אם תוכנה אחרת כבר מציגה תמונות ממוזערות ל-PDF, ההגדרה הזו תחליף אותה. לפעמים צריך לנקות את מטמון התמונות של Windows (ניקוי דיסק) כדי לראות את השינוי.'),
    card('default', 'פתיחת PDF בתוכנה הזו',
      'מוסיף את איתןPDF לרשימת "פתח באמצעות". Windows לא מאפשר לתוכנות לקבוע את עצמן כברירת מחדל, לכן אחרי ההפעלה ייפתח חלון ההגדרות של Windows ושם בוחרים בה.',
      st.default, null),
  );
  if (st.installedPath) wrap.append(h(`<p class="hint install-note">כדי שהשילוב ימשיך לעבוד גם אם הקובץ שהורדתם יימחק, התוכנה הועתקה אל <bdi dir="ltr">${esc(st.installedPath)}</bdi>.</p>`));
}

/* =========================================================
 * שמירה
 * ======================================================= */
function defaultName() {
  const d = D();
  if (!d) return 'מסמך.pdf';
  return `${d.title}.pdf`;
}

/** שמירה לקובץ הנוכחי (דורס). מסמך בלי קובץ מקור — שמירה בשם */
async function saveDocument() {
  const d = D();
  if (!d || !d.pages.length) return false;
  if (!d.path) return saveAs();
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
  try {
    const bytes = await busy('שומר…', () => buildBytes(S.pages));
    await api.writeFile(d.path, bytes);
    d.dirty = false;
    syncDirty();
    renderTabs();
    updateChrome();
    toast(`נשמר: ${d.title}.pdf`);
    return true;
  } catch (e) {
    console.error(e);
    const locked = /EBUSY|EPERM|EACCES/.test(String(e.message));
    toast(locked ? 'לא הצלחנו לשמור: הקובץ פתוח בתוכנה אחרת או מוגן מכתיבה. סגרו אותו ונסו שוב, או השתמשו ב"שמירה בשם".' : 'השמירה נכשלה: ' + e.message, { error: true });
    return false;
  }
}

async function saveAs(opts = {}) {
  const d = D();
  if (!d || !d.pages.length) return false;
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
  const pages = opts.onlySelected ? S.pages.filter((p) => S.selected.has(p.key)) : S.pages;
  if (!pages.length) return false;
  try {
    const bytes = await busy('מכין את הקובץ…', () => buildBytes(pages));
    const name = opts.onlySelected ? `${d.title} - עמודים נבחרים.pdf` : defaultName();
    const path = await api.saveAs(name, bytes, d.path);
    if (!path) return false;
    if (!opts.onlySelected) {
      d.path = path;
      d.title = baseName(path.split(/[\\/]/).pop());
      d.dirty = false;
      syncDirty();
      renderTabs();
      updateChrome();
    }
    toast('הקובץ נשמר', { action: { label: 'פתיחה בתיקייה', run: () => api.showInFolder(path) } });
    return true;
  } catch (e) {
    console.error(e);
    toast('השמירה נכשלה: ' + e.message, { error: true });
    return false;
  }
}

/* =========================================================
 * אירועים כלליים
 * ======================================================= */
function wire() {
  $('#btn-save').onclick = () => saveDocument();
  buildViewCtl();

  // מעקב אחרי העמוד הנוכחי, ובמצב "עמוד יחיד" — גלילה בקצה מעבירה עמוד
  const deskEl = $('#desk');
  deskEl.addEventListener('scroll', () => { if (!trackRaf) trackRaf = requestAnimationFrame(trackPage); }, { passive: true });
  let lastFlip = 0;
  deskEl.addEventListener('wheel', (e) => {
    if (S.layout !== 'single' || !PAGE_COLUMN_TOOLS.has(S.tool) || e.ctrlKey || !D()) return;
    const now = Date.now();
    if (now - lastFlip < 450) { lastFlip = now; return; } // תנופה של משטח מגע — לא מדפדפים ברצף
    const atBottom = deskEl.scrollTop + deskEl.clientHeight >= deskEl.scrollHeight - 2;
    const atTop = deskEl.scrollTop <= 0;
    if (e.deltaY > 0 && atBottom && D().curPage < S.pages.length - 1) { lastFlip = now; goToPage(D().curPage + 1); }
    else if (e.deltaY < 0 && atTop && D().curPage > 0) { lastFlip = now; goToPage(D().curPage - 1, true); }
  }, { passive: true });

  // בקשות פתיחה מבחוץ: לחיצה כפולה על קובץ, קליק ימני (פתיחה/מיזוג/פיצול)
  api.onOpenRequest(async ({ mode, paths }) => {
    const entries = [];
    for (const p of paths) { try { entries.push(await api.readFile(p)); } catch (e) { toast(`לא הצלחנו לקרוא את ${p}`, { error: true }); } }
    if (!entries.length) return;
    if (mode === 'merge' && entries.length > 1) await openMerged(entries);
    else await openEntries(entries, { tool: mode === 'split' ? 'split' : mode === 'merge' ? 'merge' : 'view' });
  });
  api.onMenu((cmd) => {
    if (cmd === 'open') openDialog();
    else if (cmd === 'save') saveDocument();
    else if (cmd === 'save-as') saveAs();
    else if (cmd === 'close-tab') { if (activeId) closeTab(activeId); }
    else if (cmd === 'undo') { if (!isTyping()) undo(); else document.execCommand('undo'); }
    else if (cmd === 'redo') { if (!isTyping()) redo(); else document.execCommand('redo'); }
    else if (cmd === 'select-all') { if (isTyping()) document.execCommand('selectAll'); else if (inGrid()) selectAll(); }
    else if (cmd.startsWith('zoom-')) zoomCmd(cmd.slice(5));
    else if (cmd.startsWith('layout-')) setLayout(cmd.slice(7));
    else if (cmd === 'about') about();
    else if (cmd === 'next-tab' || cmd === 'prev-tab') {
      const ids = [...docs.keys()];
      if (ids.length < 2) return;
      const i = ids.indexOf(activeId);
      activate(ids[(i + (cmd === 'next-tab' ? 1 : -1) + ids.length) % ids.length]);
    }
  });
  api.onBeforeClose(async () => {
    for (const d of [...docs.values()]) {
      if (!d.dirty) continue;
      activate(d.id);
      const choice = await confirmDialog(`לשמור את השינויים ב"${d.title}"?`, 'התוכנה נסגרת. אם לא תשמרו, השינויים יאבדו.', [
        { id: 'save', label: 'שמירה', primary: true },
        { id: 'discard', label: 'בלי לשמור' },
        { id: 'cancel', label: 'ביטול', quiet: true },
      ]);
      if (choice === 'cancel' || !choice) return;
      if (choice === 'save' && !(await saveDocument())) return;
      d.dirty = false;
    }
    api.closeNow();
  });

  document.addEventListener('keydown', (e) => {
    if ($('#modal-root').children.length) return;
    if (isTyping()) {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (PAGE_COLUMN_TOOLS.has(S.tool) && S.activeItem) { e.preventDefault(); deleteActiveItem(); }
      else if (inGrid() && S.selected.size) { e.preventDefault(); deleteSelected(); }
    } else if (e.key === 'Escape') {
      if (S.placing) { S.placing = null; render(); }
      else if (S.activeItem) { S.activeItem = null; refreshItems(); }
      else if (S.selected.size) { S.selected.clear(); render(); }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (PAGE_COLUMN_TOOLS.has(S.tool) && D() && S.pages.length && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // דפדוף: PageUp/PageDown, Home/End; בעמוד יחיד גם חיצים (בעברית — שמאלה זה קדימה)
      const cur = D().curPage;
      const single = S.layout === 'single';
      let to = null;
      if (e.key === 'PageDown' && single) to = cur + 1;
      else if (e.key === 'PageUp' && single) to = cur - 1;
      else if (e.key === 'Home' && single) to = 0;
      else if (e.key === 'End' && single) to = S.pages.length - 1;
      else if (single && !S.activeItem && e.key === 'ArrowLeft') to = cur + 1;
      else if (single && !S.activeItem && e.key === 'ArrowRight') to = cur - 1;
      if (to !== null) { e.preventDefault(); goToPage(to); }
    }
  });

  // גרירת קבצים מסייר הקבצים
  let depth = 0;
  const veil = $('#drop-veil');
  const isFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  window.addEventListener('dragenter', (e) => { if (!isFiles(e)) return; depth++; veil.hidden = false; });
  window.addEventListener('dragleave', (e) => { if (!isFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) veil.hidden = true; });
  window.addEventListener('dragover', (e) => { if (isFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', async (e) => {
    if (!isFiles(e)) return;
    e.preventDefault();
    depth = 0;
    veil.hidden = true;
    const files = [...e.dataTransfer.files];
    const pdfs = files.filter((f) => /\.pdf$/i.test(f.name));
    const imgs = files.filter((f) => /\.(png|jpe?g)$/i.test(f.name));
    const entries = [];
    for (const f of pdfs) entries.push({ name: f.name, path: api.pathForFile(f), bytes: new Uint8Array(await f.arrayBuffer()) });
    if (imgs.length) {
      const imBytes = [];
      for (const f of imgs) imBytes.push({ bytes: new Uint8Array(await f.arrayBuffer()) });
      entries.push({ name: imgs.length === 1 ? baseName(imgs[0].name.replace(/\.(png|jpe?g)$/i, '')) + '.pdf' : `תמונות (${imgs.length}).pdf`, bytes: await Ops.imagesToPdf(imBytes) });
    }
    if (!entries.length) return toast('אפשר לגרור לכאן רק קבצי PDF או תמונות (PNG, JPG)', { error: true });
    // גרירה למצב מיזוג — מוסיפים למסמך הפעיל. אחרת — לשוניות חדשות
    if (inMerge() && D()) {
      await busy('מוסיף קבצים…', async () => { for (const en of entries) await addPdf(en); });
      render();
    } else await openEntries(entries);
  });

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (PAGE_COLUMN_TOOLS.has(S.tool) && (typeof S.zoom === 'string' || S.layout === 'two')) render(); }, 200); });
}

/* =========================================================
 * הפעלה
 * ======================================================= */
(async function init() {
  window.__errs = [];
  window.addEventListener('error', (e) => window.__errs.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__errs.push(String(e.reason && (e.reason.stack || e.reason.message) || e.reason)));
  wire();
  const [regular, bold] = await Promise.all([api.readAsset('fonts/Alef-Regular.ttf'), api.readAsset('fonts/Alef-Bold.ttf')]);
  S.fonts = { regular, bold };
  await Promise.all(savedSignatures().map(preloadRatio));
  render();
  api.rendererReady();
  window.__app = { S, docs, D, render, setView, openInEditor, commit, saveDocument, buildBytes, activate }; // לבדיקות אוטומטיות
})();
