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
  fillBg: '<path d="M5 19h14"/><path d="M8 15 12 5l4 10M9.6 11h4.8"/>',
  bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
  alignR: '<path d="M4 6h16M8 10h12M4 14h16M10 18h10"/>',
  alignC: '<path d="M4 6h16M7 10h10M4 14h16M8 18h8"/>',
  alignL: '<path d="M4 6h16M4 10h12M4 14h16M4 18h10"/>',
  extract: '<path d="M6 3h9l4 4v14H6z"/><path d="M12 10v7M9 14l3 3 3-3"/>',
  export: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 15h6M12.5 12l3 3-3 3"/>',
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
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/>',
  chevUp: '<path d="m6 15 6-6 6 6"/>',
  chevDown: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
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
  mark: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="m7.5 12 3 3 6-6.5"/>',
  textEdit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/><path d="M14 20h6"/>',
  revert: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redact: '<rect x="3" y="8" width="18" height="8" rx="1" fill="currentColor" stroke="none"/><path d="M3 5h8M3 19h12"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2M12 15v2"/>',
  cert: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  warn: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
};
/** סימון V / X — אותו נתיב בעורך ובקובץ השמור */
const markSvg = (shape, color) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${Ops.MARK_PATHS[shape] || Ops.MARK_PATHS.check}" fill="none" stroke="${color}" stroke-width="${Ops.MARK_STROKE}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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
// צבעי רקע לתיבת טקסט (בהירים, כמו מרקר)
const BG_COLORS = [
  { hex: '#FFFFFF', name: 'לבן' },
  { hex: '#FFF176', name: 'צהוב' },
  { hex: '#B3E5FC', name: 'תכלת' },
  { hex: '#C8E6C9', name: 'ירוק בהיר' },
  { hex: '#F8BBD0', name: 'ורוד' },
  { hex: '#E0E0E0', name: 'אפור' },
];
let lastTextBg = { bg: null, bgOpacity: 1 }; // הרקע האחרון שנבחר — גם לתיבות חדשות
let lastTextFont = 'alef'; // הגופן האחרון שנבחר לתיבת טקסט

/** צבע הרקע של תיבת טקסט ב-CSS (או null) */
function bgCss(it) {
  if (!it.bg) return null;
  const n = parseInt(it.bg.slice(1), 16);
  const a = it.bgOpacity == null ? 1 : it.bgOpacity;
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/** הכלים בסרגל הימני. doc=true: דורש מסמך פתוח. panel=false: בלי לוח אפשרויות */
const TOOLS = [
  // לפי סדר העבודה: התוכן (מילוי ועריכה) → העמודים → יציאה (דחיסה והמרה, ואבטחה אחרונה).
  // אין לשונית טפסים: שדות טופס ניתנים למילוי ישירות על הדף בכל תצוגה
  // צפייה היא מצב הבסיס: אין לה לשונית. לחיצה על לשונית פותחת את הלוח שלה, ולחיצה נוספת (או X) סוגרת וחוזרת לצפייה
  { id: 'view', label: 'צפייה', icon: 'eye', doc: true, panel: false, hidden: true },
  // "מילוי ועריכה": שתי לשוניות בתוך הכלי — טקסט וחתימה (הוספה לעמוד) ועריכת הטקסט הקיים
  { id: 'sign', label: 'מילוי ועריכה', icon: 'sign', doc: true, group: ['sign', 'edit'] },
  { id: 'edit', label: 'עריכת טקסט', icon: 'textEdit', doc: true, hidden: true },
  { id: 'pages', label: 'עמודים', icon: 'grid', doc: true },
  { id: 'export', label: 'דחיסה והמרה', icon: 'export', doc: true },
  { id: 'security', label: 'אבטחה', icon: 'lock', doc: true },
  { id: 'windows', label: 'שילוב ב-Windows', icon: 'windows', doc: false, panel: false, bottom: true, winOnly: true },
].filter((t) => !t.winOnly || !window.api || !window.api.platform || window.api.platform === 'win32');
const PAGE_COLUMN_TOOLS = new Set(['view', 'sign', 'edit', 'security', 'export']);

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
    // אבטחה: סיסמת פתיחה, הגבלות, ומה היה בקובץ המקורי
    security: newSecurity(),
    digi: { reason: 'אישור המסמך', location: '' },
  };
  docs.set(d.id, d);
  return d;
}
const D = () => docs.get(activeId) || null;

function newSecurity() {
  const perms = {};
  for (const k of Ops.PERMISSION_KEYS) perms[k] = true;
  return {
    open: { on: false, password: '', confirm: '' },
    restrict: { on: false, ownerPassword: '', perms },
    info: { hadOpenPassword: false, wasRestricted: false },
  };
}

/** S: מצב ממשק כללי. שדות המסמך מועברים אוטומטית ללשונית הפעילה */
const S = {
  tool: 'view',
  placing: null,
  activeItem: null,
  thumbW: +(localStore('thumbW') || 168),
  zoom: 'fit', // 'fit' = התאמה לרוחב, 'page' = עמוד שלם, או מספר
  layout: ['single', 'continuous', 'two'].includes(localStore('layout')) ? localStore('layout') : 'continuous',
  signature: null,
  fonts: null,
  pendingImage: null,
  mark: { shape: 'check', color: '#1B2430' }, // הסימון האחרון שנבחר — הסימון הבא יהיה כמוהו
  exportMode: 'compress', // בלשונית "דחיסה והמרה"
  compressLevel: ['light', 'medium', 'strong'].includes(localStore('compressLevel')) ? localStore('compressLevel') : 'medium',
  compressResult: null, // { docId, level, before, after } — תוצאת הדחיסה האחרונה, להצגה בלוח
  convert: loadConvertPrefs(), // המרה ל-Word / לתמונות — ההגדרות נשמרות בין הפעלות
};
const EXPORT_MODES = [
  { id: 'compress', label: 'דחיסה' },
  { id: 'convert', label: 'המרה' },
];
/**
 * שמות ישנים של כלים ומצבים: סידור, מיזוג ופיצול הם עכשיו מסך אחד ב"עמודים";
 * סימן מים ומספור עמודים — ב"טקסט וחתימה"; דחיסה והמרה — בלשונית משלהן
 */
function normalizeTool(t) {
  if (t === 'merge' || t === 'split' || t === 'arrange') return 'pages';
  if (t === 'extras') return 'sign';
  if (t === 'compress' || t === 'convert') { S.exportMode = t; return 'export'; }
  if (t === 'folder' || t === 'forms') return 'view'; // כלים שהוסרו (שדות הטופס נגישים בכל תצוגה)
  return t;
}
const inMerge = () => S.tool === 'pages';
const inGrid = () => S.tool === 'pages';
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

async function addImages(at) {
  const imgs = await api.openImages();
  if (!imgs.length) return;
  await busy('ממיר תמונות לעמודים…', async () => {
    const bytes = await Ops.imagesToPdf(imgs.map((i) => ({ bytes: i.bytes })));
    const name = imgs.length === 1 ? baseName(imgs[0].name.replace(/\.(png|jpe?g)$/i, '')) + '.pdf' : `תמונות (${imgs.length}).pdf`;
    return { name, bytes };
  }).then((entry) => (inMerge() && D() ? addPdf(entry, { at: typeof at === 'number' ? at : null }).then(render) : openEntries([entry])));
}

/** עמוד ריק. at — מיקום בין העמודים; בלי — אחרי הנבחרים, או בסוף */
function addBlank(at) {
  const ref = S.pages.find((p) => p.src !== 'blank');
  commit(() => {
    if (typeof at !== 'number') at = S.selected.size ? Math.max(...[...S.selected].map((k) => S.pages.findIndex((p) => p.key === k))) + 1 : S.pages.length;
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
  g.querySelector('.btn-row').remove();
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
    document.querySelectorAll('.grid, .board').forEach((g) => g.style.setProperty('--thumb-w', S.thumbW + 'px'));
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
    ctx.info = info;
    if (!info.blank) drawFields(ctx, info);
    drawItems(ctx);
    drawEdits(ctx);
    drawFindHits(ctx);
    drawExtras(ctx);
  };
  lazy.observe(frame);
  drawItems(ctx);
  drawExtras(ctx);

  overlay.addEventListener('pointerdown', (e) => {
    if (e.target !== overlay) return;
    if (S.tool === 'edit') return emptyEditClick(ctx);
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
  if (S.placing === 'text') {
    const size = 14;
    item = { id, type: 'text', text: '', size, color: INK_COLORS[0].hex, w: 220, align: 'right', bold: false, font: lastTextFont, ...lastTextBg };
    item.x = Math.max(0, Math.min(ctx.vw - item.w, x - item.w + 10));
    item.y = Math.max(0, y - size * 0.75);
  } else if (S.placing === 'signature' || S.placing === 'image') {
    const src = S.placing === 'signature' ? S.signature : S.pendingImage;
    const ratio = imageRatio(src);
    const w = S.placing === 'signature' ? 150 : 120;
    item = { id, type: 'image', image: src, w, h: w * ratio };
    item.x = Math.max(0, Math.min(ctx.vw - w, x - w / 2));
    item.y = Math.max(0, Math.min(ctx.vh - item.h, y - item.h / 2));
  } else if (S.placing === 'mark') {
    const size = 16;
    item = { id, type: 'mark', shape: S.mark.shape, color: S.mark.color, w: size, h: size };
    item.x = Math.max(0, Math.min(ctx.vw - size, x - size / 2));
    item.y = Math.max(0, Math.min(ctx.vh - size, y - size / 2));
  } else if (S.placing === 'digisig') {
    item = { id, type: 'digisig', w: 210, h: 62, image: S.signature || null };
    item.x = Math.max(0, Math.min(ctx.vw - item.w, x - item.w / 2));
    item.y = Math.max(0, Math.min(ctx.vh - item.h, y - item.h / 2));
  }
  commit(() => {
    // חתימה דיגיטלית גלויה אחת למסמך — מיקום חדש מחליף את הקודם
    if (item.type === 'digisig') for (const k of Object.keys(S.stamps)) S.stamps[k] = S.stamps[k].filter((x) => x.type !== 'digisig');
    (S.stamps[p.key] = S.stamps[p.key] || []).push(item);
    S.activeItem = { key: p.key, id };
    if (S.placing !== 'mark') S.placing = null; // בסימון נשארים בכלי — בדרך כלל מסמנים כמה תיבות ברצף
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
    if (it.type === 'edit') continue; // שורות ערוכות מצוירות בשכבה משלהן (drawEdits)
    if (keep && keep.dataset.id === it.id) {
      keep.style.left = it.x * ctx.scale + 'px';
      keep.style.top = it.y * ctx.scale + 'px';
      keep.style.width = it.w * ctx.scale + 'px';
      const ta = keep.querySelector('textarea');
      if (ta) styleText(keep, ta, it, ctx.scale);
      // הסרגל נבנה מחדש כדי להראות את הבחירה החדשה (ואם חלון הרקע היה פתוח — נשאר פתוח)
      const old = keep.querySelector('.item-bar');
      if (old) {
        const wasOpen = !!old.querySelector('.bg-pop');
        const nb = itemBar(ctx, it);
        old.replaceWith(nb);
        if (wasOpen) nb.querySelector('.bg-wrap > .icon-btn')?.click();
      }
      // לא מזיזים אותו ב-DOM — הזזה מעבירה פוקוס
    } else overlay.append(itemEl(ctx, it));
  }
}

/** עיצוב תיבת טקסט: גופן, צבע, יישור, ורקע שנמתח מעט מעבר לטקסט (בלי להזיז אותו) — בדיוק כמו בקובץ השמור */
function styleText(el, ta, it, scale) {
  ta.style.fontSize = it.size * scale + 'px';
  ta.style.fontFamily = fontCss(it.font || 'alef');
  ta.style.color = it.color;
  ta.style.fontWeight = it.bold ? '700' : '400';
  ta.style.textAlign = it.align || 'right';
  const bg = bgCss(it);
  el.style.background = bg || '';
  el.style.boxShadow = bg ? `0 0 0 ${TEXT_BG_PAD * scale}px ${bg}` : '';
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
    styleText(el, ta, it, scale);
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
  } else if (it.type === 'mark') {
    el.append(h(`<div class="mark-fill" title="${it.shape === 'x' ? 'סימון X' : 'סימון V'}">${markSvg(it.shape, it.color)}</div>`));
  } else if (it.type === 'redact') {
    el.append(h('<div class="redact-fill" title="השחרה: התוכן מתחת יימחק בשמירה"></div>'));
  } else if (it.type === 'digisig') {
    el.append(digiSigPreview(it, scale));
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
        const nw = Math.max(it.type === 'mark' ? 8 : 24, ow - dx);
        it.x = ox + (ow - nw);
        it.w = nw;
        if (it.type === 'image' || it.type === 'mark') it.h = nw * (oh / ow);
        else if (it.type === 'rect' || it.type === 'redact') it.h = Math.max(4, oh + dy);
        else if (it.type === 'digisig') it.h = Math.max(24, oh + dy);
      }
      el.style.left = it.x * ctx.scale + 'px';
      el.style.top = it.y * ctx.scale + 'px';
      el.style.width = it.w * ctx.scale + 'px';
      if (it.type !== 'text') el.style.height = it.h * ctx.scale + 'px';
      if (it.type === 'digisig') el.querySelector('.digisig-box').replaceWith(digiSigPreview(it, ctx.scale));
      if (it.type === 'text') { const ta = el.querySelector('textarea'); ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
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
  if (it.type !== 'text') el.addEventListener('pointerdown', (e) => { if (e.target === el || e.target.tagName === 'IMG' || e.target.classList.contains('rect-fill') || e.target.closest('.digisig-box') || e.target.closest('.mark-fill') || e.target.classList.contains('redact-fill')) startDrag(e, 'move'); });
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
  // שדה (חיפוש גופן, מחוון שקיפות) מקבל פוקוס כרגיל; כל השאר לא לוקח את הפוקוס מהתיבה
  bar.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (!e.target.closest('input')) keepFocus(e); });
  const update = (fn) => commit(fn, { render: false }) || refreshItems();
  if (it.type === 'text') {
    const fp = fontPicker(it.font || 'alef', true, (font) => {
      lastTextFont = font;
      update(() => { it.font = font; });
      // חוזרים להקלדה בתיבה
      requestAnimationFrame(() => document.querySelector(`#desk .item[data-id="${CSS.escape(it.id)}"] textarea`)?.focus({ preventScroll: true }));
    });
    fp.classList.add('in-bar');
    bar.append(fp, h('<span class="sep"></span>'));
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
    bar.append(h('<span class="sep"></span>'), bgButton(it, update), h('<span class="sep"></span>'));
  } else if (it.type === 'mark') {
    for (const [shape, label] of [['check', 'סימון V'], ['x', 'סימון X']]) {
      const b = h(`<button class="icon-btn ${it.shape === shape ? 'on' : ''}" title="${label}" aria-label="${label}" aria-pressed="${it.shape === shape}">${markSvg(shape, 'currentColor')}</button>`);
      b.onclick = () => update(() => { it.shape = shape; S.mark.shape = shape; });
      bar.append(b);
    }
    bar.append(h('<span class="sep"></span>'));
    for (const c of INK_COLORS) {
      const b = h(`<button class="swatch" style="background:${c.hex}" title="${c.name}" aria-label="${c.name}" aria-pressed="${it.color === c.hex}"></button>`);
      b.onclick = () => update(() => { it.color = c.hex; S.mark.color = c.hex; });
      bar.append(b);
    }
    bar.append(h('<span class="sep"></span>'));
  }
  const del = h(`<button class="icon-btn del" title="מחיקה (Delete)" aria-label="מחיקה">${icon('trash')}</button>`);
  del.onclick = () => deleteActiveItem();
  bar.append(del);
  return bar;
}

const TEXT_BG_PAD = 2; // כמה הרקע בולט מעבר לטקסט (יחידות PDF) — זהה ב-ops.js

/** כפתור "רקע" בסרגל של תיבת טקסט: צבע רקע ושקיפות */
function bgButton(it, update) {
  const wrap = h('<span class="bg-wrap"></span>');
  const btn = h(`<button class="icon-btn ${it.bg ? 'on' : ''}" title="צבע רקע ושקיפות" aria-label="צבע רקע" aria-haspopup="true">${icon('fillBg')}<span class="bg-dot"></span></button>`);
  btn.querySelector('.bg-dot').style.background = bgCss(it) || 'transparent';
  wrap.append(btn);
  const remember = () => { lastTextBg = { bg: it.bg || null, bgOpacity: it.bgOpacity == null ? 1 : it.bgOpacity }; };
  btn.onclick = () => {
    if (wrap.querySelector('.bg-pop')) { wrap.querySelector('.bg-pop').remove(); return; }
    const pop = h(`<div class="bg-pop" role="dialog" aria-label="רקע התיבה">
      <div class="bg-row"></div>
      <label class="bg-op"><span>שקיפות</span><input type="range" min="0" max="90" step="5"><output></output></label></div>`);
    const row = pop.querySelector('.bg-row');
    const none = h(`<button class="swatch none" title="בלי רקע" aria-label="בלי רקע" aria-pressed="${!it.bg}"></button>`);
    none.onclick = () => { update(() => { it.bg = null; }); remember(); };
    row.append(none);
    for (const c of BG_COLORS) {
      const b = h(`<button class="swatch" style="background:${c.hex}" title="${c.name}" aria-label="${c.name}" aria-pressed="${it.bg === c.hex}"></button>`);
      b.onclick = () => { update(() => { it.bg = c.hex; }); remember(); };
      row.append(b);
    }
    const range = pop.querySelector('input');
    const out = pop.querySelector('output');
    const show = () => { out.textContent = range.value + '%'; };
    range.value = Math.round((1 - (it.bgOpacity == null ? 1 : it.bgOpacity)) * 100);
    range.disabled = !it.bg;
    show();
    // בזמן הגרירה — רק תצוגה; בשחרור — שמירה (שלב אחד בהיסטוריה)
    range.oninput = () => {
      show();
      const el = btn.closest('.item');
      const tmp = { bg: it.bg, bgOpacity: 1 - range.value / 100 };
      if (el && it.bg) { const c = bgCss(tmp); el.style.background = c; el.style.boxShadow = el.style.boxShadow.replace(/rgba?\([^)]*\)/, c); }
    };
    range.onchange = () => { update(() => { it.bgOpacity = 1 - range.value / 100; }); remember(); };
    wrap.append(pop);
  };
  return wrap;
}

function deleteActiveItem() {
  if (!S.activeItem) return;
  const { key, id } = S.activeItem;
  commit(() => {
    S.stamps[key] = (S.stamps[key] || []).filter((x) => x.id !== id);
    S.activeItem = null;
  });
}

/* =========================================================
 * עריכת הטקסט הקיים בעמוד
 * לוחצים על שורה → היא נפתחת לעריכה במקום. בשמירה השורה המקורית נמחקת
 * מהקובץ והחדשה נכתבת דרך מנוע העברית (ראו src/core/textedit.js).
 * ======================================================= */
const { TextEdit } = window;
const lineCache = new Map(); // `${src}:${index}` → Promise<{ lines, base }>

/** השורות של עמוד מקור (מחושב פעם אחת לכל עמוד) */
function pageLines(p) {
  if (p.src === 'blank') return Promise.resolve({ lines: [], base: [] });
  const k = p.src + ':' + p.index;
  if (!lineCache.has(k)) {
    lineCache.set(k, (async () => {
      const src = S.sources.get(p.src);
      if (!src.libDoc) src.libDoc = window.PDFLib.PDFDocument.load(src.bytes, { ignoreEncryption: true, updateMetadata: false });
      let lines = [];
      try {
        const doc = await src.libDoc;
        lines = TextEdit.groupLines(TextEdit.analyzePage(doc, doc.getPage(p.index)).glyphs);
      } catch (e) {
        console.warn('ניתוח הטקסט בעמוד נכשל', e);
      }
      await Promise.race([sysFonts().then((l) => { sysFontList = l; }), new Promise((r) => setTimeout(r, 1500))]);
      return {
        lines,
        base: lines.map((L) => {
          const e = TextEdit.editFromLine(L, lines);
          const sys = e.font === 'alef' ? null : matchSysFont(e.fontName, window.HebrewPDF.hasRTL(e.text));
          if (sys) e.font = sys;
          return e;
        }),
      };
    })());
  }
  return lineCache.get(k);
}

/* =========================================================
 * חיפוש בקובץ (Ctrl+F) — המנוע המשותף לדסקטופ ולאנדרואיד נמצא ב-src/core/search.js
 * ======================================================= */
const F = { open: false, query: '', results: [], cur: -1, done: true, scanned: 0, noText: false, token: 0, sig: '' };
// results: [{ key, rects: [[x0,y0,x1,y1]] }] בסדר העמודים ובסדר הקריאה

const findSig = () => `${activeId}|${S.pages.map((p) => p.key + ':' + (p.rotate || 0)).join(',')}`;

function openFind() {
  const d = D();
  if (!d || !d.pages.length) return;
  F.open = true;
  renderFindBar();
  const inp = $('#find-bar input');
  inp.focus();
  inp.select();
  // פתיחה מחדש: מחפשים שוב את מה שהיה בשורה (השורות כבר במטמון, אז זה מהיר)
  if (F.query && (!F.results.length || F.sig !== findSig())) runFind();
}

function closeFind() {
  F.open = false;
  F.token++;
  F.results = [];
  F.cur = -1;
  const bar = $('#find-bar');
  if (bar) bar.remove();
  drawAllFindHits();
}

function renderFindBar() {
  let bar = $('#find-bar');
  if (!F.open) { if (bar) bar.remove(); return; }
  if (!bar) {
    bar = h(`
      <div class="find-bar" id="find-bar" role="search">
        ${icon('search')}
        <input type="search" dir="auto" placeholder="חיפוש בקובץ" aria-label="חיפוש בקובץ" spellcheck="false">
        <span class="find-count" aria-live="polite"></span>
        <button class="icon-btn" data-a="prev" title="הקודם (Shift+Enter)" aria-label="התוצאה הקודמת">${icon('chevUp')}</button>
        <button class="icon-btn" data-a="next" title="הבא (Enter)" aria-label="התוצאה הבאה">${icon('chevDown')}</button>
        <button class="icon-btn" data-a="close" title="סגירה (Esc)" aria-label="סגירת החיפוש">${icon('x')}</button>
      </div>`);
    const inp = bar.querySelector('input');
    inp.value = F.query;
    let t;
    inp.addEventListener('input', () => { F.query = inp.value; clearTimeout(t); t = setTimeout(runFind, 220); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(t); if (F.query !== inp.value || F.sig !== findSig()) { F.query = inp.value; runFind(); } else stepFind(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); }
    });
    bar.querySelector('[data-a=prev]').onclick = () => stepFind(-1);
    bar.querySelector('[data-a=next]').onclick = () => stepFind(1);
    bar.querySelector('[data-a=close]').onclick = closeFind;
    $('.workspace').append(bar);
  }
  const n = F.results.length;
  const count = bar.querySelector('.find-count');
  const q = window.PdfSearch.normalize(F.query);
  count.classList.toggle('none', !!q && F.done && !n);
  count.textContent = !q ? '' : n ? `${F.cur + 1} מתוך ${n}${F.done ? '' : '…'}`
    : !F.done ? `מחפש… ${F.scanned}/${S.pages.length}`
      : F.noText ? 'אין טקסט בקובץ (סריקה?)' : 'לא נמצא';
  bar.querySelector('[data-a=prev]').disabled = n < 2 && F.cur <= 0;
  bar.querySelector('[data-a=next]').disabled = !n;
}

/** חיפוש בכל העמודים, לפי הסדר. התוצאות מתווספות תוך כדי, והראשונה מוצגת מיד */
async function runFind() {
  const token = ++F.token;
  F.results = [];
  F.cur = -1;
  F.done = false;
  F.scanned = 0;
  F.sig = findSig();
  const q = window.PdfSearch.normalize(F.query);
  drawAllFindHits();
  if (!q) { F.done = true; renderFindBar(); return; }
  renderFindBar();
  const pages = S.pages.slice();
  let anyText = false;
  for (const p of pages) {
    const { lines } = await pageLines(p);
    if (token !== F.token) return;
    if (lines.length) anyText = true;
    for (const m of window.PdfSearch.findInLines(lines, F.query)) F.results.push({ key: p.key, rects: m.rects });
    F.scanned++;
    if (F.cur < 0 && F.results.length) { F.cur = 0; showFindResult(); }
    if (F.scanned % 5 === 0) { renderFindBar(); await new Promise((r) => setTimeout(r, 0)); if (token !== F.token) return; }
  }
  F.done = true;
  F.noText = !anyText;
  renderFindBar();
  drawAllFindHits();
}

function stepFind(dir) {
  const n = F.results.length;
  if (!n) return;
  F.cur = (F.cur + dir + n) % n;
  showFindResult();
  renderFindBar();
}

/** מעבר לתוצאה הנוכחית: לעמוד שלה (ולכלי צפייה, אם צריך), וגלילה כך שהיא במרכז */
function showFindResult() {
  const r = F.results[F.cur];
  if (!r) return;
  const idx = S.pages.findIndex((p) => p.key === r.key);
  if (idx < 0) return;
  if (!PAGE_COLUMN_TOOLS.has(S.tool)) setView('view');
  const d = D();
  goToPage(idx);
  if (d) d.curPage = idx;
  drawAllFindHits();
  const reveal = (tries) => {
    const frame = $(`#desk .page-frame[data-idx="${idx}"]`);
    const hit = frame && frame.querySelector('.find-hit.cur');
    if (!hit) { if (tries > 0) setTimeout(() => reveal(tries - 1), 120); return; }
    const desk = $('#desk');
    const hb = hit.getBoundingClientRect(), db = desk.getBoundingClientRect();
    if (hb.top < db.top + 60 || hb.bottom > db.bottom - 20) desk.scrollTop += hb.top - db.top - desk.clientHeight / 3;
    const dx = hb.left - db.left;
    if (dx < 0 || hb.right > db.right) desk.scrollLeft += dx - desk.clientWidth / 3;
  };
  reveal(25);
  renderFindBar();
}

/** ציור הסימונים של החיפוש על עמוד שכבר צויר */
function drawFindHits(ctx) {
  if (!ctx || !ctx.overlay) return;
  ctx.overlay.querySelectorAll('.find-hit').forEach((el) => el.remove());
  if (!F.open || !ctx.info || !F.results.length) return;
  const tr = screenMap(ctx);
  F.results.forEach((r, i) => {
    if (r.key !== ctx.p.key) return;
    for (const b of r.rects) {
      const pts = [tr(b[0], b[1]), tr(b[2], b[3])];
      const x = Math.min(pts[0][0], pts[1][0]), y = Math.min(pts[0][1], pts[1][1]);
      const w = Math.abs(pts[0][0] - pts[1][0]), ht = Math.abs(pts[0][1] - pts[1][1]);
      const el = document.createElement('div');
      el.className = 'find-hit' + (i === F.cur ? ' cur' : '');
      Object.assign(el.style, { left: x - 1.5 + 'px', top: y - 1.5 + 'px', width: w + 3 + 'px', height: ht + 3 + 'px' });
      ctx.overlay.append(el);
    }
  });
}

function drawAllFindHits() {
  document.querySelectorAll('#desk .page-frame').forEach((f) => drawFindHits(f.__ctx));
}

const editsOf = (key) => (S.stamps[key] || []).filter((it) => it.type === 'edit');
const isChanged = (it) => it.text !== it.original || it.restyled;
const unreadable = (b) => /�|[-]/.test(b.original) || !b.original.trim();

/** ממרחב המשתמש של ה-PDF לפיקסלים של המסגרת */
function screenMap(ctx) {
  const vp = ctx.info.page.getViewport({ scale: ctx.scale, rotation: ctx.info.rotation });
  return (x, y) => vp.convertToViewportPoint(x, y);
}

/** מיקום שורה על המסך: נקודת קו הבסיס בתחילתה, אורך, זווית, ומלבן הכיסוי */
function lineGeom(ctx, e) {
  const tr = screenMap(ctx);
  const c = Math.cos(e.angle), s = Math.sin(e.angle);
  const at = (u, v) => tr(u * c - v * s, u * s + v * c);
  const [ox, oy] = at(e.u0, e.v);
  const [ex, ey] = at(e.u1, e.v);
  const pts = [[e.box[0], e.box[1]], [e.box[2], e.box[1]], [e.box[2], e.box[3]], [e.box[0], e.box[3]]].map(([x, y]) => tr(x, y));
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  return {
    ox, oy, len: Math.max(4, Math.hypot(ex - ox, ey - oy)), ang: Math.atan2(ey - oy, ex - ox),
    rect: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
  };
}

/** צבע הרקע סביב השורה — הצבע הנפוץ ברצועה שמעליה ומתחתיה על הקנבס */
function sampleBg(ctx, rect) {
  try {
    const cv = ctx.frame.querySelector('canvas');
    const k = cv.width / parseFloat(cv.style.width);
    const g = cv.getContext('2d', { willReadFrequently: true });
    // קבוצות צבע גסות לספירה, וממוצע הפיקסלים האמיתיים של הקבוצה הנפוצה (כדי שלבן יישאר לבן)
    const count = new Map();
    for (const yy of [rect.y - 2, rect.y + rect.h + 2]) {
      const y = Math.round(Math.max(0, Math.min(cv.height - 1, yy * k)));
      const x0 = Math.round(Math.max(0, rect.x * k)), w = Math.max(1, Math.min(cv.width - x0, Math.round(rect.w * k)));
      const d = g.getImageData(x0, y, w, 1).data;
      for (let i = 0; i < d.length; i += 4) {
        const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
        const c = count.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        c.n++; c.r += d[i]; c.g += d[i + 1]; c.b += d[i + 2];
        count.set(key, c);
      }
    }
    const best = [...count.values()].sort((a, b) => b.n - a.n)[0];
    if (!best) return '#ffffff';
    const ch = (v) => Math.round(v / best.n).toString(16).padStart(2, '0');
    return '#' + ch(best.r) + ch(best.g) + ch(best.b);
  } catch (e) {
    return '#ffffff';
  }
}

/* ---------- גופנים לעריכת טקסט: שניים שמגיעים עם התוכנה + כל מה שמותקן במחשב ---------- */
const BUILTIN_FONTS = [{ id: 'plex', label: 'IBM Plex Sans Hebrew', css: "'Plex'" }, { id: 'alef', label: 'Alef', css: "'Alef'" }];
let sysFontsP = null;
/** רשימת גופני המחשב: [{ family, hebrew, bold }] (נטענת פעם אחת) */
function sysFonts() {
  if (!sysFontsP) sysFontsP = (window.api && window.api.listFonts ? window.api.listFonts() : Promise.resolve([])).catch((e) => { console.warn('רשימת הגופנים', e); return []; });
  return sysFontsP;
}
let sysFontList = []; // אחרי הטעינה — לשימוש סינכרוני
const isSysFont = (id) => typeof id === 'string' && id.startsWith('sys:');
const fontLabel = (id) => (isSysFont(id) ? id.slice(4) : (BUILTIN_FONTS.find((f) => f.id === id) || BUILTIN_FONTS[0]).label);
const cssQuote = (name) => '"' + String(name).replace(/["\\]/g, '') + '"';
const fontCss = (id) => (isSysFont(id) ? `${cssQuote(id.slice(4))}, 'Plex'` : (BUILTIN_FONTS.find((f) => f.id === id) || BUILTIN_FONTS[0]).css);
/** אם הגופן המקורי של השורה מותקן במחשב — ממשיכים בו */
function matchSysFont(fontName, needHebrew) {
  if (!fontName || !sysFontList.length || !window.Docx) return null;
  const fam = window.Docx.fontFamily(fontName).toLowerCase();
  const hit = sysFontList.find((f) => f.family.toLowerCase() === fam) || sysFontList.find((f) => f.family.toLowerCase() === fam.replace(/\s+(regular|bold|semibold|medium|light|black)$/i, ''));
  return hit && (hit.hebrew || !needHebrew) ? 'sys:' + hit.family : null;
}

/** בוחר גופן: כפתור שפותח רשימה עם חיפוש. הגופנים שתומכים בעברית — ראשונים */
function fontPicker(cur, needHebrew, onPick) {
  const wrap = h(`<div class="font-pick"><button class="font-btn" aria-haspopup="listbox"><span></span>${icon('chevDown')}</button></div>`);
  const btn = wrap.firstChild;
  btn.firstChild.textContent = fontLabel(cur);
  btn.firstChild.style.fontFamily = fontCss(cur);
  btn.onclick = async () => {
    const open = wrap.querySelector('.font-menu');
    if (open) { open.remove(); return; }
    const menu = h('<div class="font-menu"><input class="input" type="search" placeholder="חיפוש גופן" aria-label="חיפוש גופן"><div class="font-list" role="listbox"><p class="hint">טוען את הגופנים שבמחשב…</p></div></div>');
    wrap.append(menu);
    const search = menu.querySelector('input');
    const listEl = menu.querySelector('.font-list');
    search.focus();
    const all = await sysFonts();
    const item = (id, label, note) => {
      const b = h(`<button role="option" aria-selected="${id === cur}"><span class="fn"></span>${note ? `<small>${note}</small>` : ''}</button>`);
      b.firstChild.textContent = label;
      b.firstChild.style.fontFamily = fontCss(id);
      b.onclick = () => { menu.remove(); onPick(id); };
      return b;
    };
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const m = (name) => !q || name.toLowerCase().includes(q);
      listEl.innerHTML = '';
      const sec = (title, items) => {
        if (!items.length) return;
        listEl.append(h(`<h3>${title}</h3>`));
        items.forEach((x) => listEl.append(x));
      };
      sec('מגיעים עם התוכנה', BUILTIN_FONTS.filter((f) => m(f.label)).map((f) => item(f.id, f.label)));
      sec('במחשב — עם עברית', all.filter((f) => f.hebrew && m(f.family)).map((f) => item('sys:' + f.family, f.family, f.bold ? '' : 'בלי מודגש')));
      sec(needHebrew ? 'במחשב — בלי עברית (האותיות העבריות ייכתבו ב-IBM Plex)' : 'במחשב — בלי עברית', all.filter((f) => !f.hebrew && m(f.family)).map((f) => item('sys:' + f.family, f.family)));
      if (!listEl.children.length) listEl.append(h('<p class="hint">לא נמצא גופן בשם הזה.</p>'));
      listEl.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
    };
    search.oninput = draw;
    search.onkeydown = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); menu.remove(); btn.focus(); }
      if (e.key === 'Enter') { e.preventDefault(); listEl.querySelector('button')?.click(); }
    };
    draw();
  };
  return wrap;
}

/** עיצוב אלמנט שורה (תצוגה מקדימה או עורך) לפי פריט העריכה */
function styleLine(wrap, inner, ctx, it, g) {
  const sizePx = it.size * ctx.scale;
  const lh = sizePx * 1.3;
  Object.assign(wrap.style, {
    left: g.ox + 'px', top: g.oy + 'px', width: g.len + 'px', height: lh + 'px',
    transform: `rotate(${g.ang}rad) translateY(${-sizePx * 1.02}px)`,
    justifyContent: it.align === 'right' ? 'flex-end' : it.align === 'center' ? 'center' : 'flex-start',
  });
  Object.assign(inner.style, {
    fontFamily: fontCss(it.font), fontWeight: it.bold ? '700' : '400',
    fontSize: sizePx + 'px', lineHeight: lh + 'px', color: it.color, background: it.bg || '#ffffff',
  });
  inner.dir = window.HebrewPDF.hasRTL(it.text || it.original) ? 'rtl' : 'ltr';
}

function maskEl(g, bg) {
  const m = h('<div class="tl-mask"></div>');
  Object.assign(m.style, { left: g.rect.x - 1 + 'px', top: g.rect.y - 1 + 'px', width: g.rect.w + 2 + 'px', height: g.rect.h + 2 + 'px', background: bg || '#ffffff' });
  return m;
}

/** שכבת העריכות של עמוד: תצוגה מקדימה של שורות ששונו, ובכלי העריכה — שורות ללחיצה */
async function drawEdits(ctx) {
  if (!ctx.info || ctx.info.blank) return;
  const { p, overlay } = ctx;
  let layer = overlay.querySelector('.edit-layer');
  if (!layer) { layer = h('<div class="edit-layer"></div>'); overlay.prepend(layer); }
  const editing = S.tool === 'edit';
  layer.classList.toggle('interactive', editing);
  const { base } = editing || editsOf(p.key).length ? await pageLines(p) : { base: [] };
  if (!layer.isConnected) return;
  // עורך פתוח לא נבנה מחדש
  const open = layer.querySelector('.tl-editor');
  layer.querySelectorAll(':scope > :not(.tl-editor):not(.tl-editor-mask)').forEach((n) => n.remove());
  const items = editsOf(p.key);
  for (const it of items) {
    if (!isChanged(it) || (open && +open.dataset.idx === it.lineIdx)) continue;
    const g = lineGeom(ctx, it);
    layer.append(maskEl(g, it.bg));
    if (it.text.trim()) {
      const wrap = h('<div class="tl-preview"><span></span></div>');
      wrap.firstChild.textContent = it.text;
      styleLine(wrap, wrap.firstChild, ctx, it, g);
      layer.append(wrap);
    }
  }
  if (!editing) return;
  base.forEach((b, idx) => {
    const it = items.find((x) => x.lineIdx === idx);
    const g = lineGeom(ctx, it || b);
    const sel = S.editSel && S.editSel.key === p.key && S.editSel.idx === idx;
    const t = h(`<div class="tl-hit ${it && isChanged(it) ? 'edited' : ''} ${sel ? 'selected' : ''}" title="${unreadable(b) ? 'לא ניתן לזהות את הטקסט בשורה הזו' : 'לחצו לעריכה'}"></div>`);
    Object.assign(t.style, { left: g.rect.x - 2 + 'px', top: g.rect.y - 2 + 'px', width: g.rect.w + 4 + 'px', height: g.rect.h + 4 + 'px' });
    t.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openLineEditor(ctx, idx, e);
    });
    layer.append(t);
  });
}

function refreshEdits(key) {
  document.querySelectorAll('#desk .page-frame').forEach((f) => { if (f.__ctx && (!key || f.__ctx.p.key === key)) drawEdits(f.__ctx); });
}

/** לחיצה על מקום בעמוד שאין בו שורה */
async function emptyEditClick(ctx) {
  const { base } = await pageLines(ctx.p);
  if (!base.length) toast('לא נמצא טקסט שאפשר לערוך בעמוד הזה. ייתכן שהוא סרוק כתמונה — אפשר להוסיף "טקסט" עם רקע לבן בכלי טקסט וחתימה.');
  if (S.editSel) { S.editSel = null; refreshEdits(); refreshEditPanel(); }
}

/** יצירה/עדכון של עריכה לשורה. שורה שחזרה למקור — נמחקת מהרשימה */
function upsertEdit(ctx, idx, changes, b) {
  const key = ctx.p.key;
  commit(() => {
    const list = (S.stamps[key] = S.stamps[key] || []);
    let it = list.find((x) => x.type === 'edit' && x.lineIdx === idx);
    if (!it) {
      it = { id: 'i' + seq++, lineIdx: idx, ...JSON.parse(JSON.stringify(b)), bg: sampleBg(ctx, lineGeom(ctx, b).rect) };
      list.push(it);
    }
    Object.assign(it, changes);
    if (!isChanged(it)) S.stamps[key] = list.filter((x) => x !== it);
  }, { render: false });
  refreshEdits(key);
  refreshEditPanel();
}

function revertEdit(key, idx) {
  commit(() => { S.stamps[key] = (S.stamps[key] || []).filter((x) => !(x.type === 'edit' && x.lineIdx === idx)); }, { render: false });
  refreshEdits(key);
  refreshEditPanel();
}

/** פתיחת שורה לעריכה במקום */
async function openLineEditor(ctx, idx, ev) {
  const { base } = await pageLines(ctx.p);
  const b = base[idx];
  if (!b) return;
  if (unreadable(b)) {
    toast('לא ניתן לזהות את האותיות בשורה הזו (הפונט במסמך לא כולל מידע על התווים). אפשר לכתוב מעליה "טקסט" עם רקע לבן.', { error: true });
    return;
  }
  const layer = ctx.overlay.querySelector('.edit-layer');
  const old = layer.querySelector('.tl-editor');
  if (old) old.__finish(true);
  S.editSel = { key: ctx.p.key, idx };
  refreshEditPanel();
  if (!b.ok) toast('השורה כתובה בפונט שלא ניתן למחוק ממנו. אפשר לערוך אותה — בשמירה השורה הישנה תכוסה בצבע הרקע במקום להימחק.');

  const cur = () => editsOf(ctx.p.key).find((x) => x.lineIdx === idx);
  const it0 = cur() || { ...b, bg: sampleBg(ctx, lineGeom(ctx, b).rect) };
  const g = lineGeom(ctx, it0);
  const wrap = h(`<div class="tl-editor" data-idx="${idx}"><span contenteditable="plaintext-only" spellcheck="false" role="textbox" aria-label="עריכת השורה"></span></div>`);
  const ed = wrap.firstChild;
  ed.textContent = it0.text;
  styleLine(wrap, ed, ctx, it0, g);
  const mask = maskEl(g, it0.bg);
  mask.classList.add('tl-editor-mask');
  layer.append(mask, wrap);
  layer.querySelectorAll('.tl-hit').forEach((t, k) => t.classList.toggle('selected', k === idx));
  // התצוגה המקדימה של השורה הזו (אם יש) מוסתרת בזמן העריכה
  ed.focus({ preventScroll: true });
  const range = ev && document.caretRangeFromPoint ? document.caretRangeFromPoint(ev.clientX, ev.clientY) : null;
  const sel = window.getSelection();
  sel.removeAllRanges();
  if (range && ed.contains(range.startContainer)) sel.addRange(range);
  else { const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); sel.addRange(r); }

  let done = false;
  const finish = (save, then) => {
    if (done) return;
    done = true;
    const text = ed.textContent.replace(/[\r\n]+/g, ' ');
    wrap.remove();
    mask.remove();
    const it = cur();
    if (save && text !== (it ? it.text : b.text)) upsertEdit(ctx, idx, { text }, b);
    else refreshEdits(ctx.p.key);
    if (then) then();
  };
  wrap.__finish = finish;
  ed.addEventListener('input', () => {
    // שורה אחת: ירידת שורה שהודבקה הופכת לרווח
    if (/[\r\n]/.test(ed.textContent)) ed.textContent = ed.textContent.replace(/[\r\n]+/g, ' ');
    ed.dir = window.HebrewPDF.hasRTL(ed.textContent || b.original) ? 'rtl' : 'ltr';
  });
  ed.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const next = idx + (e.shiftKey ? -1 : 1);
      finish(true, () => { if (base[next]) requestAnimationFrame(() => openLineEditor(frameCtx(ctx.p.key) || ctx, next)); });
    }
  });
  ed.addEventListener('blur', () => setTimeout(() => { if (!wrap.contains(document.activeElement)) finish(true); }, 0));
}

const frameCtx = (key) => { const f = $(`#desk .page-frame[data-key="${CSS.escape(key)}"]`); return f && f.__ctx; };

/* ---------- לוח הצד של כלי העריכה ---------- */

function refreshEditPanel() {
  if (S.tool !== 'edit') return;
  const panel = $('#panel');
  const keep = panel.scrollTop;
  panel.innerHTML = '';
  panel.append(fillTabs());
  editPanel(panel);
  panel.scrollTop = keep;
  updateChrome();
}

function editPanel(panel) {
  panel.append(h(`
    <div class="group">
      <h2>עריכת טקסט</h2>
      <p class="hint">לוחצים על שורה בעמוד ומקלידים. <kbd>Enter</kbd> לאישור, <kbd>Esc</kbd> לביטול, <kbd>Tab</kbd> לשורה הבאה.</p>
    </div>`));
  const sel = S.editSel;
  const ctx = sel && frameCtx(sel.key);
  if (sel && ctx) {
    const grp = h('<div class="group"><h2>עיצוב השורה</h2><div class="tl-style"></div></div>');
    panel.append(grp);
    pageLines(ctx.p).then(({ base }) => {
      const b = base[sel.idx];
      if (!b) return;
      const it = editsOf(sel.key).find((x) => x.lineIdx === sel.idx) || b;
      const box = grp.querySelector('.tl-style');
      const set = (ch) => upsertEdit(ctx, sel.idx, { ...ch, restyled: true }, b);
      const keepFocus = (el) => el.addEventListener('pointerdown', (e) => e.preventDefault());
      const fontSeg = fontPicker(it.font, window.HebrewPDF.hasRTL(it.text || b.original), (font) => set({ font }));
      const row = h('<div class="tl-row"></div>');
      const btn = (ic, label, on, fn) => { const x = h(`<button class="icon-btn ${on ? 'on' : ''}" title="${label}" aria-label="${label}" aria-pressed="${!!on}">${icon(ic)}</button>`); keepFocus(x); x.onclick = fn; return x; };
      row.append(
        btn('minus', 'הקטנה', false, () => set({ size: Math.max(4, Math.round((it.size - 0.5) * 2) / 2) })),
        h(`<span class="size" aria-label="גודל">${(+it.size).toFixed(1).replace(/\.0$/, '')}</span>`),
        btn('plus', 'הגדלה', false, () => set({ size: Math.min(96, Math.round((it.size + 0.5) * 2) / 2) })),
        h('<span class="sep"></span>'),
        btn('bold', 'מודגש', it.bold, () => set({ bold: !it.bold })),
        h('<span class="sep"></span>'),
        btn('alignR', 'יישור לימין', it.align === 'right', () => set({ align: 'right' })),
        btn('alignC', 'מרכוז', it.align === 'center', () => set({ align: 'center' })),
        btn('alignL', 'יישור לשמאל', it.align === 'left', () => set({ align: 'left' })),
      );
      const sw = h('<div class="swatches"></div>');
      const colors = [{ hex: b.color, name: 'הצבע המקורי' }, ...INK_COLORS.filter((c) => c.hex.toLowerCase() !== b.color.toLowerCase())];
      for (const c of colors) {
        const x = h(`<button class="swatch" style="background:${c.hex}" title="${c.name}" aria-label="${c.name}" aria-pressed="${it.color.toLowerCase() === c.hex.toLowerCase()}"></button>`);
        keepFocus(x);
        x.onclick = () => set({ color: c.hex });
        sw.append(x);
      }
      box.append(fontSeg, row, sw);
      if (b.mixed) box.append(h('<p class="hint warn">בשורה הזו יש כמה סגנונות (למשל מילה מודגשת). אחרי עריכה כל השורה תיכתב בסגנון אחד.</p>'));
      if (!b.ok) box.append(h('<p class="hint warn">הפונט של השורה הזו לא מאפשר מחיקה. בשמירה השורה הישנה תכוסה בצבע הרקע.</p>'));
      const ch = editsOf(sel.key).find((x) => x.lineIdx === sel.idx);
      if (ch) {
        const r = h(`<button class="btn">${icon('revert')}החזרת השורה למקור</button>`);
        r.onclick = () => revertEdit(sel.key, sel.idx);
        box.append(h('<div class="btn-row"></div>'));
        box.lastChild.append(r);
      }
    });
  }

  // כל השינויים במסמך
  const all = [];
  S.pages.forEach((p, i) => editsOf(p.key).forEach((it) => all.push({ p, i, it })));
  const g = h(`<div class="group"><h2>שינויים במסמך${all.length ? ` (${all.length})` : ''}</h2></div>`);
  if (!all.length) g.append(h('<p class="hint">עדיין לא נערכו שורות.</p>'));
  else {
    const ul = h('<ul class="tl-changes"></ul>');
    for (const { p, i, it } of all) {
      const li = h(`<li><button class="tl-go" title="מעבר לשורה"><span class="pg">עמ' ${i + 1}</span><span class="tx"></span></button><button class="icon-btn" title="החזרה למקור" aria-label="החזרה למקור">${icon('revert')}</button></li>`);
      const tx = li.querySelector('.tx');
      tx.textContent = it.text.trim() ? it.text : 'השורה נמחקה';
      tx.dir = 'auto';
      if (!it.text.trim()) tx.classList.add('gone');
      li.querySelector('.tl-go').onclick = () => {
        S.editSel = { key: p.key, idx: it.lineIdx };
        if (frameCtx(p.key)) { frameCtx(p.key).frame.scrollIntoView({ block: 'center' }); refreshEdits(p.key); refreshEditPanel(); }
        else goToPage(i);
      };
      li.querySelector('.icon-btn').onclick = () => revertEdit(p.key, it.lineIdx);
      ul.append(li);
    }
    g.append(ul);
  }
  panel.append(g);
  panel.append(h(`
    <div class="group">
      <h2>טוב לדעת</h2>
      <p class="hint">עורכים שורה אחת בכל פעם. אם השורה החדשה ארוכה מהמקורית, הטקסט שאחריה לא זז. השורה נכתבת מחדש בגודל ובצבע של המקור — בגופן המקורי אם הוא מותקן במחשב, ואחרת ב-IBM Plex. אפשר לבחור כל גופן שמותקן במחשב.</p>
    </div>`));
}

/** ראש הלוח: שם הלשונית וכפתור סגירה (חזרה לצפייה) */
function panelHead(tool) {
  const owner = TOOLS.find((t) => t.group && t.group.includes(tool.id)) || tool;
  const head = h(`<div class="panel-head"><h1>${esc(owner.label)}</h1><button class="icon-btn" title="סגירה" aria-label="סגירת ${esc(owner.label)}">${icon('x')}</button></div>`);
  head.querySelector('button').onclick = () => setView('view');
  $('#panel').prepend(head);
}

/** הלשוניות שבתוך "מילוי ועריכה" */
function fillTabs() {
  const seg = h('<div class="segmented" role="tablist" aria-label="מילוי ועריכה"></div>');
  for (const [id, label] of [['sign', 'טקסט וחתימה'], ['edit', 'עריכת טקסט']]) {
    const b = h(`<button role="tab" aria-pressed="${S.tool === id}" aria-selected="${S.tool === id}">${label}</button>`);
    b.onclick = () => { if (S.tool !== id) setView(id); };
    seg.append(b);
  }
  return seg;
}

function renderEdit() {
  $('#panel').append(fillTabs());
  editPanel($('#panel'));
  pageColumn();
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

/** פיצול: כל חלק נפתח כקובץ חדש בלשונית משלו (עדיין לא שמור). המסמך המקורי לא משתנה */
async function doSplit(groups) {
  const base = baseName(defaultName());
  const src = D();
  let opened = [];
  try {
    await busy('מפצל…', async () => {
      const full = await buildBytes(S.pages);
      const parts = await Ops.splitDocument(full, groups);
      for (let i = 0; i < parts.length; i++) {
        const name = `${base} - חלק ${i + 1}`;
        const d = newDoc(name, null);
        const ok = await addPdf({ name: name + '.pdf', bytes: parts[i] }, { doc: d, initial: true });
        if (!ok) { docs.delete(d.id); continue; }
        d.dirty = true;
        opened.push(d);
      }
    });
  } catch (e) {
    for (const d of opened) docs.delete(d.id);
    return toast('הפיצול נכשל: ' + e.message, { error: true });
  }
  if (!opened.length) return render();
  src.split.cuts = new Set();
  activate(opened[0].id, 'view');
  toast(`המסמך פוצל ל-${opened.length} קבצים, כל אחד בלשונית משלו. כדי לשמור — כפתור השמירה בכל לשונית.`);
}

/* =========================================================
 * דחיסה — המנוע המשותף לדסקטופ ולאנדרואיד נמצא ב-src/core/compress.js
 * ======================================================= */
const COMPRESS_LEVELS = [
  { id: 'light', title: 'קלה, בלי איבוד איכות', sub: 'מנקה כפילויות ושאריות. מתאים כשהאיכות חשובה' },
  { id: 'medium', title: 'מומלצת', sub: 'תמונות ב-150 DPI. נראה טוב במסך ובהדפסה' },
  { id: 'strong', title: 'חזקה', sub: 'תמונות ב-96 DPI. הכי קטן, למייל ולוואטסאפ' },
];

function renderCompress() {
  const panel = $('#panel');
  const desk = $('#desk');
  const d = D();
  const srcSize = [...S.sources.values()].reduce((n, s) => n + (s.bytes ? s.bytes.length : 0), 0);
  const g = h(`
    <div class="group">
      <h2>רמת הדחיסה</h2>
      <div class="radio-list" role="radiogroup">
        ${COMPRESS_LEVELS.map((l) => `<label><input type="radio" name="cl" value="${l.id}" ${S.compressLevel === l.id ? 'checked' : ''}><span><b>${l.title}</b><small>${l.sub}</small></span></label>`).join('')}
      </div>
      <p class="hint">הטקסט נשאר טקסט: אפשר לחפש ולהעתיק כרגיל. רק התמונות והסריקות שבקובץ מוקטנות.</p>
    </div>`);
  g.querySelectorAll('input[name=cl]').forEach((r) => (r.onchange = () => { S.compressLevel = r.value; localStore('compressLevel', r.value); S.compressResult = null; render(); }));
  panel.append(g);

  const res = S.compressResult && S.compressResult.docId === d.id && S.compressResult.level === S.compressLevel ? S.compressResult : null;
  const fmt = window.Compress.formatSize;
  const out = h(`<div class="group"><h2>התוצאה</h2><p class="hint"></p><button class="btn btn-primary btn-block btn-lg">${icon('save')}דחיסה ושמירה כקובץ חדש</button></div>`);
  const hint = out.querySelector('.hint');
  if (res && res.unchanged) hint.innerHTML = `הקובץ כבר דחוס היטב (<bdi>${fmt(res.before)}</bdi>), ולא נמצא מה להקטין ברמה הזו.`;
  else if (res) hint.innerHTML = `<b><bdi>${fmt(res.before)}</bdi> ← <bdi>${fmt(res.after)}</bdi></b> (קטן ב-${Math.round((1 - res.after / res.before) * 100)}%). נשמר בשם <bdi>${esc(res.name)}</bdi>.`;
  else hint.innerHTML = `גודל הקובץ עכשיו: בערך <bdi>${fmt(srcSize)}</bdi>. הקובץ הדחוס יישמר בנפרד, בשם כמו <bdi>${esc(baseName(defaultName()))} - דחוס.pdf</bdi>, והמקור לא ישתנה.`;
  out.querySelector('button').onclick = () => doCompress();
  panel.append(out);

  // המסמך מוצג כרגיל (כמו בצפייה), לא כתמונות ממוזערות
  pageColumn();
}

async function doCompress() {
  const d = D();
  if (!d || !S.pages.length) return;
  const problem = securityProblem();
  if (problem) return toast(problem, { error: true });
  if (!(await confirmBreakSignatures())) return;
  const level = S.compressLevel;
  try {
    const r = await busy('דוחס את הקובץ…', async () => {
      const built = await buildBytes(S.pages);
      const c = await window.Compress.compress(built, { level });
      return { ...c, bytes: await applySecurity(c.bytes) };
    });
    const name = `${baseName(defaultName())} - דחוס.pdf`;
    S.compressResult = { docId: d.id, level, before: r.before, after: r.after, unchanged: r.unchanged, name };
    if (r.unchanged) { render(); return toast('הקובץ כבר דחוס היטב, לא נמצא מה להקטין.'); }
    const path = await api.saveAs(name, r.bytes, d.path);
    if (!path) { S.compressResult = null; render(); return; }
    S.compressResult.name = path.split(/[\\/]/).pop();
    render();
    toast(`נשמר: \u2068${window.Compress.formatSize(r.before)}\u2069 ← \u2068${window.Compress.formatSize(r.after)}\u2069`, { action: { label: 'פתיחה בתיקייה', run: () => api.showInFolder(path) } });
  } catch (e) {
    console.error(e);
    toast('הדחיסה נכשלה: ' + e.message, { error: true });
  }
}

/* =========================================================
 * המרה ל-Word ולתמונות — המנועים המשותפים לדסקטופ ולאנדרואיד:
 * src/core/docx.js (Word) ו-src/core/rasterize.js (תמונות)
 * ======================================================= */
function loadConvertPrefs() {
  const d = { to: 'word', format: 'jpeg', dpi: 150, scope: 'all', range: '', long: false };
  try {
    const v = JSON.parse(localStore('convert') || 'null');
    if (v && typeof v === 'object') {
      if (['word', 'images'].includes(v.to)) d.to = v.to;
      if (['jpeg', 'png'].includes(v.format)) d.format = v.format;
      if ([96, 150, 300].includes(v.dpi)) d.dpi = v.dpi;
      d.long = !!v.long;
    }
  } catch (e) { /* הגדרות פגומות — ברירת מחדל */ }
  return d;
}
function saveConvertPrefs() {
  const c = S.convert;
  localStore('convert', JSON.stringify({ to: c.to, format: c.format, dpi: c.dpi, long: c.long }));
}

const DPI_LEVELS = [
  { dpi: 96, title: 'מסך', sub: '96 DPI. קובץ קטן, לשליחה ולצפייה בטלפון' },
  { dpi: 150, title: 'רגילה', sub: '150 DPI. נראה טוב במסך ובהדפסה' },
  { dpi: 300, title: 'הדפסה', sub: '300 DPI. הכי חד, קבצים גדולים' },
];

/** העמודים להמרה (אינדקסים מאפס), או שגיאה בעברית */
function convertPages() {
  const c = S.convert;
  const n = S.pages.length;
  if (c.scope !== 'range') return { pages: S.pages.map((_, i) => i) };
  if (!c.range.trim()) return { pages: null };
  try {
    const set = new Set(Ops.parseRanges(c.range, n).flat());
    return { pages: [...set].sort((a, b) => a - b) };
  } catch (e) { return { pages: null, error: e.message }; }
}

function renderConvert() {
  const panel = $('#panel');
  const desk = $('#desk');
  const c = S.convert;
  const radios = (name, items, cur) => items.map((it) => `<label><input type="radio" name="${name}" value="${it.id}" ${String(cur) === String(it.id) ? 'checked' : ''}><span><b>${it.title}</b>${it.sub ? `<small>${it.sub}</small>` : ''}</span></label>`).join('');
  const g = h(`
    <div class="group">
      <h2>המרה ל…</h2>
      <div class="radio-list" role="radiogroup">${radios('ct', [
        { id: 'word', title: 'מסמך Word', sub: 'טקסט לעריכה, עם פסקאות, טבלאות ותמונות' },
        { id: 'images', title: 'תמונות', sub: 'כל עמוד לתמונה, JPG או PNG' },
      ], c.to)}</div>
    </div>`);
  g.querySelectorAll('input[name=ct]').forEach((r) => (r.onchange = () => { c.to = r.value; saveConvertPrefs(); render(); }));
  panel.append(g);

  if (c.to === 'images') {
    const o = h(`
      <div class="group">
        <h2>פורמט</h2>
        <div class="radio-list" role="radiogroup">${radios('cf', [
          { id: 'jpeg', title: 'JPG', sub: 'קובץ קטן. מתאים לרוב המסמכים ולתמונות' },
          { id: 'png', title: 'PNG', sub: 'חד יותר בטקסט ובקווים, קובץ גדול יותר' },
        ], c.format)}</div>
        <h2>איכות</h2>
        <div class="radio-list" role="radiogroup">${radios('cq', DPI_LEVELS.map((l) => ({ id: l.dpi, title: l.title, sub: l.sub })), c.dpi)}</div>
        <label class="check"><input type="checkbox" ${c.long ? 'checked' : ''}><span>תמונה ארוכה אחת<small>כל העמודים זה מתחת לזה, בתמונה אחת. נוח לשליחה בוואטסאפ</small></span></label>
      </div>`);
    o.querySelectorAll('input[name=cf]').forEach((r) => (r.onchange = () => { c.format = r.value; saveConvertPrefs(); render(); }));
    o.querySelectorAll('input[name=cq]').forEach((r) => (r.onchange = () => { c.dpi = +r.value; saveConvertPrefs(); render(); }));
    o.querySelector('input[type=checkbox]').onchange = (e) => { c.long = e.target.checked; saveConvertPrefs(); render(); };
    panel.append(o);
  }

  const pg = h(`
    <div class="group">
      <h2>עמודים</h2>
      <div class="radio-list" role="radiogroup">${radios('cs', [
        { id: 'all', title: `כל העמודים (${S.pages.length})` },
        { id: 'range', title: 'רק חלק', sub: 'למשל <bdi dir="ltr">1-3, 5, 8-</bdi>' },
      ], c.scope)}</div>
    </div>`);
  pg.querySelectorAll('input[name=cs]').forEach((r) => (r.onchange = () => { c.scope = r.value; render(); }));
  if (c.scope === 'range') {
    const f = h(`<label class="field"><span>טווחי עמודים (מתוך ${S.pages.length})</span><input class="input" dir="ltr" style="text-align:right" placeholder="1-3, 5, 8-" value="${esc(c.range)}"></label>`);
    const inp = f.querySelector('input');
    inp.oninput = () => { c.range = inp.value; clearTimeout(f.__t); f.__t = setTimeout(() => { render(); const n = $('#panel input.input[dir=ltr]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 450); };
    pg.append(f);
  }
  panel.append(pg);

  const { pages, error } = convertPages();
  const base = baseName(defaultName());
  const ext = c.format === 'png' ? 'png' : 'jpg';
  const label = c.to === 'word' ? 'המרה ושמירה כקובץ Word' : 'המרה ושמירה';
  const out = h(`<div class="group"><h2>התוצאה</h2><p class="hint"></p><button class="btn btn-primary btn-block btn-lg" ${pages && pages.length ? '' : 'disabled'}>${icon('save')}${label}</button></div>`);
  const hint = out.querySelector('.hint');
  if (error) { hint.textContent = error; hint.style.color = 'var(--stamp)'; }
  else if (!pages) hint.textContent = 'הקלידו טווחים כדי לבחור עמודים.';
  else if (c.to === 'word') hint.innerHTML = `קובץ בשם <bdi>${esc(base)}.docx</bdi>. עמוד סרוק (בלי טקסט) נכנס כתמונה, כי אין בו טקסט לעריכה.`;
  else if (c.long || pages.length === 1) hint.innerHTML = `תמונה אחת, בשם <bdi>${esc(base)}${pages.length === 1 && !c.long ? ` - עמוד ${pages[0] + 1}` : ''}.${ext}</bdi>.`;
  else hint.innerHTML = `${pages.length} תמונות, בתיקייה שתבחרו, בשמות כמו <bdi>${esc(window.Rasterize.pageNames(base, [pages[0] + 1], ext)[0])}</bdi>.`;
  const st = D().security;
  if (st && (st.open.on || st.restrict.on) && !error) hint.innerHTML += ' <br>שימו לב: לעותק המומר אין סיסמה או הגבלות.';
  out.querySelector('button').onclick = () => doConvert(pages);
  panel.append(out);

  // המסמך מוצג כרגיל (כמו בצפייה). עמודים שלא ייכללו בהמרה — מעומעמים
  pageColumn();
  const chosen = new Set(pages || []);
  if (pages) desk.querySelectorAll('.page-frame').forEach((f) => f.classList.toggle('dim', !chosen.has(+f.dataset.idx)));
}

/** עדכון הטקסט בחלון "עובד…" (להתקדמות בהמרה ארוכה) */
function busyText(text) {
  const el = document.querySelector('.busy-card span:last-child');
  if (el) el.textContent = text;
}

async function doConvert(pages) {
  const d = D();
  if (!d || !pages || !pages.length) return;
  const c = S.convert;
  const base = baseName(defaultName());
  let pdf = null;
  try {
    const built = await busy('מכין את הקובץ…', () => buildBytes(S.pages));
    pdf = await pdfjsLib.getDocument({ ...PDFJS_OPTS, data: built.slice() }).promise;
    if (c.to === 'word') {
      const images = window.Rasterize.wordImages(pdf, { pdfjsLib, open: (b) => pdfjsLib.getDocument({ ...PDFJS_OPTS, data: b.slice() }).promise });
      const r = await busy('ממיר ל-Word…', () => window.Docx.convert(built, {
        pages,
        title: base,
        onProgress: (k, n) => busyText(`ממיר ל-Word… עמוד ${Math.ceil(k)} מתוך ${n}`),
        renderImage: images,
      }).finally(() => images.close()));
      const path = await api.saveAs(`${base}.docx`, r.bytes, d.path, 'docx');
      if (!path) return;
      const notes = [];
      if (r.stats.imagePages) notes.push(r.stats.imagePages === 1 ? 'עמוד אחד סרוק נכנס כתמונה' : `${r.stats.imagePages} עמודים סרוקים נכנסו כתמונות`);
      toast(`נשמר קובץ Word${notes.length ? ' (' + notes.join(', ') + ')' : ''}.`, { action: { label: 'פתיחה', run: () => api.openPath(path) } });
      return;
    }
    // תמונות
    const ext = c.format === 'png' ? 'png' : 'jpg';
    const opts = { dpi: c.dpi, format: c.format, quality: 0.9, pdfjsLib };
    if (c.long && pages.length > 1) {
      const img = await busy('יוצר תמונה ארוכה…', () => window.Rasterize.renderLong(pdf, pages.map((i) => i + 1), opts));
      const path = await api.saveAs(`${base}.${ext}`, img.bytes, d.path, c.format);
      if (!path) return;
      toast(img.reduced ? 'נשמר. התמונה הוקטנה כדי שלא תהיה גדולה מדי.' : 'נשמרה תמונה אחת.', { action: { label: 'פתיחה בתיקייה', run: () => api.showInFolder(path) } });
      return;
    }
    if (pages.length === 1) {
      const img = await busy('יוצר תמונה…', () => window.Rasterize.renderPage(pdf, pages[0] + 1, opts));
      const path = await api.saveAs(window.Rasterize.pageNames(base, [pages[0] + 1], ext)[0], img.bytes, d.path, c.format);
      if (!path) return;
      toast(img.reduced ? 'נשמר. העמוד גדול מאוד, ולכן התמונה הוקטנה.' : 'נשמרה התמונה.', { action: { label: 'פתיחה בתיקייה', run: () => api.showInFolder(path) } });
      return;
    }
    const folder = await api.chooseFolder('בחירת תיקייה לתמונות');
    if (!folder) return;
    const names = window.Rasterize.pageNames(base, pages.map((i) => i + 1), ext);
    let reduced = false;
    const written = await busy('יוצר תמונות…', async () => {
      const paths = [];
      // כותבים כל תמונה מיד, כדי לא להחזיק את כולן בזיכרון
      for (let k = 0; k < pages.length; k++) {
        busyText(`יוצר תמונות… ${k + 1} מתוך ${pages.length}`);
        const img = await window.Rasterize.renderPage(pdf, pages[k] + 1, opts);
        reduced = reduced || img.reduced;
        paths.push(...(await api.writeFiles(folder, [{ name: names[k], bytes: img.bytes }])));
      }
      return paths;
    });
    toast(`נשמרו ${written.length} תמונות${reduced ? ' (עמודים גדולים מאוד הוקטנו)' : ''}.`, { action: { label: 'פתיחה בתיקייה', run: () => api.showInFolder(written[0]) } });
  } catch (e) {
    console.error(e);
    toast('ההמרה נכשלה: ' + e.message, { error: true });
  } finally {
    if (pdf) pdf.destroy();
  }
}

/**
 * בניית הקובץ. opts.final — שמירה אמיתית: מחילים את הגדרות האבטחה (סיסמה/הגבלות).
 * חתימה דיגיטלית גלויה לא מצוירת כאן — היא נוספת בשלב החתימה עצמו.
 */
async function buildBytes(pages, opts = {}) {
  const sources = {};
  for (const s of S.sources.values()) sources[s.id] = s.bytes;
  const ex = S.extras;
  const warnings = [];
  const stamps = {};
  for (const [k, list] of Object.entries(S.stamps)) stamps[k] = list.filter((it) => it.type !== 'digisig');
  const redacted = pages.map((p, i) => [i, (stamps[p.key] || []).filter((it) => it.type === 'redact')]).filter(([, r]) => r.length);
  // גופני מחשב שנבחרו לעריכת טקסט — נקראים מהדיסק רק כשצריך
  const editFonts = { plex: S.plexFonts || S.fonts, alef: S.fonts };
  for (const list of Object.values(stamps)) {
    for (const it of list) {
      if ((it.type !== 'edit' && it.type !== 'text') || !isSysFont(it.font) || !window.api.readFont) continue;
      const fam = it.font.slice(4);
      try {
        const f = editFonts[it.font] || (editFonts[it.font] = { regular: (await window.api.readFont(fam, false)).bytes });
        if (it.bold && !f.bold) { const r = await window.api.readFont(fam, true); f.bold = r.bold ? r.bytes : f.regular; }
      } catch (e) {
        if (!warnings.some((w) => w.includes(`"${fam}"`))) warnings.push(`הגופן "${fam}" לא נמצא במחשב — הטקסט שלו נכתב בגופן של התוכנה`);
      }
    }
  }
  const out = await Ops.buildDocument(sources, pages.map((p) => ({ ...p })), stamps, S.formValues, {
    fonts: S.fonts,
    editFonts,
    // בהשחרה משטחים את הטפסים — אחרת הערכים נשארים בשדות שמתחת
    flattenForms: S.flattenForms || redacted.length > 0,
    watermark: ex.watermark.enabled ? ex.watermark : null,
    pageNumbers: ex.pageNumbers.enabled ? { ...ex.pageNumbers, total: opts.totalOverride } : null,
    onWarning: (w) => warnings.push(w),
  });
  if (warnings.length) toast(warnings[0], { error: true });
  const result = redacted.length ? await applyRedactions(out, redacted) : out;
  return opts.final ? applySecurity(result) : result;
}

/** בדיקת הגדרות האבטחה לפני שמירה. מחזיר הודעת שגיאה, או null */
function securityProblem() {
  const st = D() && D().security;
  if (!st) return null;
  if (st.open.on) {
    if (!st.open.password) return 'בחרתם להגן על הקובץ בסיסמה, אבל לא הוקלדה סיסמה (בכלי "אבטחה").';
    if (st.open.password !== st.open.confirm) return 'אימות הסיסמה לא תואם לסיסמה (בכלי "אבטחה").';
  }
  return null;
}

async function applySecurity(bytes) {
  const st = D().security;
  if (!st.open.on && !st.restrict.on) return bytes;
  return Ops.encrypt(bytes, {
    userPassword: st.open.on ? st.open.password : '',
    ownerPassword: st.restrict.on ? st.restrict.ownerPassword : '',
    permissions: st.restrict.on ? { ...st.restrict.perms, printing: st.restrict.perms.printing ? 'highResolution' : false } : undefined,
  });
}

/** חתימות דיגיטליות קיימות במקורות של המסמך */
function existingSignatures() {
  const used = new Set(S.pages.map((p) => p.src));
  return [...S.sources.values()].filter((s) => used.has(s.id)).flatMap((s) => s.signatures || []);
}

/** לפני שמירה שכותבת את הקובץ מחדש: אזהרה אם זה יבטל חתימות דיגיטליות */
async function confirmBreakSignatures() {
  const n = existingSignatures().length;
  if (!n) return true;
  const choice = await confirmDialog('המסמך חתום דיגיטלית',
    `במסמך יש ${n === 1 ? 'חתימה דיגיטלית' : `${n} חתימות דיגיטליות`}. שמירת השינויים תבטל ${n === 1 ? 'אותה' : 'אותן'}: מי שיפתח את הקובץ יראה שהחתימה לא תקפה. כדי להוסיף חתימה משלכם בלי לבטל את הקיימות, השתמשו ב"חתימה דיגיטלית" בכלי "אבטחה" בלי לשנות את המסמך.`, [
      { id: 'save', label: 'לשמור בכל זאת', primary: true },
      { id: 'cancel', label: 'ביטול', quiet: true },
    ]);
  return choice === 'save';
}

/** השחרה אמיתית — המימוש המשותף לדסקטופ ולאנדרואיד נמצא ב-src/core/redact.js */
function applyRedactions(bytes, redacted) {
  return window.Redact.applyRedactions(bytes, redacted, { pdfjsLib, pdfjsOpts: PDFJS_OPTS });
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
/** חיפוש מהיר של רצף ASCII בתוך הבייטים (בלי להמיר את כל הקובץ למחרוזת) */
function hasBytes(bytes, str) {
  const pat = Array.from(str, (c) => c.charCodeAt(0));
  const first = pat[0];
  outer: for (let i = bytes.indexOf(first); i >= 0 && i <= bytes.length - pat.length; i = bytes.indexOf(first, i + 1)) {
    for (let k = 1; k < pat.length; k++) if (bytes[i + k] !== pat[k]) continue outer;
    return true;
  }
  return false;
}

/** חלון סיסמה לקובץ מוגן. מחזיר את הסיסמה הנכונה, או null אם בוטל */
function passwordDialog(name, bytes) {
  return new Promise((resolve) => {
    document.body.classList.add('asking');
    const back = h(`
      <div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="pw-t" style="width:min(440px,100%)">
        <header><h2 id="pw-t" class="with-icon">${icon('lock')}הקובץ מוגן בסיסמה</h2></header>
        <div class="body">
          <p>כדי לפתוח את <b>${esc(baseName(name))}</b> צריך את הסיסמה שלו.</p>
          <label class="field"><span>סיסמה</span><input class="input" type="password" dir="ltr" autocomplete="off"></label>
          <p class="form-error" role="alert" hidden></p>
        </div>
        <footer><button class="btn btn-primary" data-ok>פתיחה</button><button class="btn btn-quiet push" data-cancel>ביטול</button></footer>
      </div></div>`);
    const inp = back.querySelector('input');
    const err = back.querySelector('.form-error');
    const done = (v) => { back.remove(); document.body.classList.remove('asking'); resolve(v); };
    const tryIt = async () => {
      const ok = await Ops.checkPassword(bytes, inp.value);
      if (ok) return done(inp.value);
      err.textContent = 'הסיסמה שגויה, נסו שוב.';
      err.hidden = false;
      inp.select();
    };
    back.querySelector('[data-ok]').onclick = tryIt;
    back.querySelector('[data-cancel]').onclick = () => done(null);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryIt(); });
    back.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(null); });
    $('#modal-root').append(back);
    inp.focus();
  });
}
/** טעינת קובץ PDF לתוך מסמך (ברירת מחדל: הלשונית הפעילה) */
async function addPdf(entry, opts = {}) {
  const doc = opts.doc || D() || newDoc(baseName(entry.name), entry.path);
  let bytes = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes);
  // קובץ מוצפן: מבקשים סיסמה (אם צריך) ומפענחים. מכאן והלאה עובדים על עותק רגיל,
  // וההגנה מוחלת מחדש בשמירה לפי ההגדרות בכלי "אבטחה"
  let sec = null, password = null;
  if (hasBytes(bytes, '/Encrypt')) {
    try { sec = await Ops.inspectSecurity(bytes); } catch (e) { sec = null; }
  }
  if (sec && sec.encrypted) {
    if (sec.needsPassword) {
      password = await passwordDialog(entry.name, bytes);
      if (password == null) return null;
    } else password = '';
    try {
      bytes = new Uint8Array(await Ops.decrypt(bytes, password));
    } catch (e) {
      toast(`לא הצלחנו לפענח את "${entry.name}": ${e.message}`, { error: true });
      return null;
    }
  }
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ ...PDFJS_OPTS, data: bytes.slice() }).promise;
  } catch (e) {
    toast(`לא הצלחנו לפתוח את "${entry.name}". ייתכן שהקובץ פגום.`, { error: true });
    return null;
  }
  if (sec && sec.encrypted && !doc.sources.size) {
    // ברירת מחדל: שומרים עם אותה הגנה שהייתה בקובץ
    const st = doc.security;
    st.info = { hadOpenPassword: sec.needsPassword, wasRestricted: false };
    if (sec.needsPassword) Object.assign(st.open, { on: true, password, confirm: password });
    const perms = sec.permissions;
    if (perms) {
      for (const k of Ops.PERMISSION_KEYS) st.restrict.perms[k] = perms[k] !== false;
      st.info.wasRestricted = Ops.PERMISSION_KEYS.some((k) => perms[k] === false);
      st.restrict.on = st.info.wasRestricted;
    }
  }
  const id = 's' + seq++;
  const color = FILE_COLORS[doc.sources.size % FILE_COLORS.length];
  const src = { id, name: entry.name, path: entry.path || null, bytes, pdf, count: pdf.numPages, color, fields: [], decrypted: !!(sec && sec.encrypted), signatures: [] };
  doc.sources.set(id, src);
  if (hasBytes(bytes, '/ByteRange')) {
    api.verifySignatures(bytes).then((list) => {
      src.signatures = list || [];
      if (src.signatures.length && doc.id === activeId) render();
    }).catch(() => {});
  }
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
    // opts.at — מיקום בין העמודים (כפתור + בין עמודים); בלי — בסוף
    const at = opts.at == null ? doc.pages.length : Math.max(0, Math.min(doc.pages.length, opts.at));
    commit(() => { doc.pages.splice(at, 0, ...newPages); }, { render: false });
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
  if (last) activate(last.id, opts.tool || (S.tool === 'windows' ? 'view' : S.tool));
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
  activate(d.id, 'pages');
}

async function openDialog() {
  const entries = await api.openPdfs();
  await openEntries(entries);
}

/** הוספת קבצים למסמך הפעיל (מיזוג). at — מיקום בין העמודים; בלי — בסוף */
async function addFilesToDoc(at) {
  const entries = await api.openPdfs();
  if (!entries.length) return;
  if (!D()) return openEntries(entries);
  let pos = typeof at === 'number' ? at : null; // גם כשנקרא ישירות מלחיצה (אירוע ולא מיקום)
  await busy('מוסיף קבצים…', async () => {
    for (const e of entries) {
      const src = await addPdf(e, { at: pos });
      if (src && pos != null) pos += src.count;
    }
  });
  render();
}

/** מיזוג לשונית פתוחה אחרת לתוך הלשונית הפעילה. at — מיקום בין העמודים; בלי — בסוף */
async function mergeTabInto(otherId, at) {
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
    const added = [];
    for (const p of other.pages) {
      const np = { ...p };
      if (p.src !== 'blank') { np.src = remap.get(p.src); np.key = `${np.src}:${p.index}`; }
      else np.key = `blank:${blankSeq++}`;
      if (other.stamps[p.key]) d.stamps[np.key] = JSON.parse(JSON.stringify(other.stamps[p.key]));
      added.push(np);
    }
    d.pages.splice(at == null ? d.pages.length : at, 0, ...added);
    for (const [sid, vals] of Object.entries(other.formValues)) if (remap.has(sid)) d.formValues[remap.get(sid)] = { ...vals };
  });
  toast(at == null || at >= d.pages.length - other.pages.length ? `"${other.title}" מוזג לסוף המסמך` : `"${other.title}" מוזג למסמך`);
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
      view: renderView, pages: renderPages, sign: renderSign, edit: renderEdit,
      security: renderSecurity, windows: renderWindows, export: renderExport,
    })[S.tool]();
  }
  if (showPanel) panelHead(tool);
  desk.scrollTop = keepScroll;
  updateChrome();
  if (F.open) {
    if (!d || !d.pages.length) closeFind();
    else if (F.sig !== findSig() && F.query) runFind(); // מסמך אחר, או עמודים שהשתנו
    else renderFindBar();
  }
}

function updateChrome() {
  const d = D();
  $('#btn-save').disabled = !d || !d.pages.length;
  $('#btn-find').disabled = !d || !d.pages.length;
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
    if (t.hidden) continue;
    const disabled = t.doc && (!d || !d.pages.length);
    const on = S.tool === t.id || (t.group && t.group.includes(S.tool));
    const b = h(`<button class="rail-btn" aria-pressed="${on}" ${disabled ? 'disabled' : ''}>${icon(t.icon)}<span>${esc(t.label)}</span></button>`);
    // לחיצה על הלשונית הפתוחה (גם כשבלשונית הפנימית השנייה) — סוגרת אותה וחוזרת לצפייה
    b.onclick = () => setView(on ? 'view' : t.id);
    b.title = on ? `סגירת ${t.label}` : t.label;
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
          <button class="btn btn-quiet btn-lg" data-act="images">${icon('image')}תמונות ל-PDF</button>
        </div>
        <p class="empty-note">הקבצים לא עולים לשום מקום. התוכנה עובדת גם בלי אינטרנט.</p>
      </div>
    </div>`);
  el.querySelector('[data-act=open]').onclick = openDialog;
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
/* =========================================================
 * עמודים: מסך אחד לסידור, להוספה (מיזוג) ולפיצול.
 * גוררים עמודים כדי לשנות סדר; בין כל שני עמודים (במעבר עכבר) — + להוספת קובץ או עמודים
 * באותו מקום, ומספריים לפיצול שם. בסוף העמודים — + קבוע.
 * ======================================================= */
function splitGroups() {
  const n = S.pages.length;
  const groups = [[]];
  S.pages.forEach((p, i) => {
    groups[groups.length - 1].push(i);
    if (S.split.cuts.has(p.key) && i < n - 1) groups.push([]);
  });
  return groups;
}

function renderPages() {
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
      </div>
    </div>`);
  pg.querySelector('[data-a=rotR]').onclick = () => rotateSelected(90);
  pg.querySelector('[data-a=rotL]').onclick = () => rotateSelected(-90);
  pg.querySelector('[data-a=del]').onclick = deleteSelected;
  pg.querySelector('[data-a=dup]').onclick = duplicateSelected;
  pg.querySelector('[data-a=extract]').onclick = () => saveAs({ onlySelected: true });
  panel.append(pg, splitPanel());
  if (S.sources.size > 1) panel.append(filesGroup());
  pagesBoard();
}

/** הפיצול: כמה קבצים ייווצרו, שמירה, וקיצורי דרך לחיתוך */
function splitPanel() {
  const n = S.pages.length;
  const groups = splitGroups();
  const parts = groups.length;
  const base = baseName(defaultName());
  const g = h(`
    <div class="group">
      <h2>פיצול</h2>
      <p class="hint"></p>
      <button class="btn btn-primary btn-block" data-a="go" ${parts > 1 ? '' : 'disabled'}>${icon('scissors')}פיצול לקבצים נפרדים</button>
      <div class="split-quick">
        <button class="btn btn-quiet" data-a="each" ${n > 1 ? '' : 'disabled'}>כל עמוד לקובץ</button>
        <span class="split-every"><button class="btn btn-quiet" data-a="every" ${n > 2 ? '' : 'disabled'}>כל</button><input class="input" type="number" min="1" max="${Math.max(1, n - 1)}" value="${S.split.every || 2}" aria-label="מספר עמודים בכל קובץ"><span>עמודים</span></span>
        ${S.split.cuts.size ? '<button class="btn btn-quiet" data-a="clear">ביטול הפיצול</button>' : ''}
      </div>
    </div>`);
  g.querySelector('.hint').innerHTML = parts > 1
    ? `המסמך יתחלק ל-<b>${parts}</b> קבצים, וכל אחד ייפתח בלשונית משלו בשם כמו <bdi>${esc(base)} - חלק 1</bdi>. כל חלק מסומן בצבע משלו.`
    : 'מעבירים את העכבר בין שני עמודים ולוחצים על המספריים כדי לפצל שם.';
  const setCuts = (every) => {
    S.split.cuts = new Set(S.pages.filter((p, i) => i < n - 1 && (i + 1) % every === 0).map((p) => p.key));
    render();
  };
  const num = g.querySelector('.split-every input');
  g.querySelector('[data-a=go]').onclick = () => doSplit(splitGroups());
  g.querySelector('[data-a=each]').onclick = () => setCuts(1);
  g.querySelector('[data-a=every]').onclick = () => { S.split.every = Math.max(1, +num.value || 2); setCuts(S.split.every); };
  num.onchange = () => { S.split.every = Math.max(1, +num.value || 2); };
  const clear = g.querySelector('[data-a=clear]');
  if (clear) clear.onclick = () => { S.split.cuts = new Set(); render(); };
  return g;
}

function pagesBoard() {
  const desk = $('#desk');
  desk.append(deskBar());
  const board = h('<div class="board" role="listbox" aria-multiselectable="true" aria-label="עמודים"></div>');
  board.style.setProperty('--thumb-w', S.thumbW + 'px');
  const groups = splitGroups();
  const partOf = new Map();
  groups.forEach((grp, k) => grp.forEach((i) => partOf.set(i, k)));
  S.pages.forEach((p, i) => {
    const s = sheetEl(p, i);
    if (groups.length > 1) {
      const k = partOf.get(i);
      s.classList.add('in-part');
      s.style.setProperty('--part', FILE_COLORS[k % FILE_COLORS.length]);
      s.querySelector('.sheet-meta').append(h(`<span class="sheet-part">חלק ${k + 1}</span>`));
    }
    board.append(s);
    if (i < S.pages.length - 1) board.append(gapEl(p, i));
  });
  const tile = h(`<button class="add-tile" title="הוספת קובץ, תמונות או עמוד ריק בסוף">${icon('plus')}<span>הוספה</span></button>`);
  tile.style.setProperty('--thumb-w', S.thumbW + 'px');
  tile.onclick = () => addMenu(tile, S.pages.length);
  board.append(tile);
  desk.append(board);
  wireReorder(board);
}

/** הרווח בין שני עמודים: + (הוספה כאן) ומספריים (פיצול כאן) — מופיעים במעבר עכבר; פיצול פעיל נשאר מסומן */
function gapEl(p, i) {
  const on = S.split.cuts.has(p.key);
  const g = h(`
    <div class="gap ${on ? 'cut-on' : ''}">
      <button class="gap-btn add" title="הוספת קובץ או עמודים כאן" aria-label="הוספה אחרי עמוד ${i + 1}">${icon('plus')}</button>
      <button class="gap-btn cut" title="${on ? 'ביטול הפיצול כאן' : 'פיצול כאן'}" aria-label="${on ? 'ביטול הפיצול' : 'פיצול'} אחרי עמוד ${i + 1}" aria-pressed="${on}">${icon('scissors')}</button>
    </div>`);
  g.querySelector('.add').onclick = (e) => addMenu(e.currentTarget, i + 1);
  g.querySelector('.cut').onclick = () => { on ? S.split.cuts.delete(p.key) : S.split.cuts.add(p.key); render(); };
  return g;
}

/** מה להוסיף במקום מסוים: קובץ, תמונות, עמוד ריק, או לשונית פתוחה אחרת */
function addMenu(anchor, at) {
  const others = [...docs.values()].filter((d) => d.id !== activeId && d.pages.length);
  popMenu(anchor, [
    { label: 'קובץ PDF…', icon: 'doc', run: () => addFilesToDoc(at) },
    { label: 'תמונות…', icon: 'image', run: () => addImages(at) },
    { label: 'עמוד ריק', icon: 'pagePlus', run: () => addBlank(at) },
    ...(others.length ? [{ sep: true }, ...others.map((o) => ({ label: `מהלשונית "${o.title}"`, sub: plural(o.pages.length, 'עמוד אחד', 'עמודים'), icon: 'merge', run: () => mergeTabInto(o.id, at) }))] : []),
  ]);
}

/** תפריט קטן שנפתח ליד כפתור. נסגר בלחיצה מחוץ לו או ב-Esc */
let popClose = null;
function popMenu(anchor, items) {
  if (popClose) popClose();
  const m = h('<div class="pop-menu" role="menu"></div>');
  for (const it of items) {
    if (it.sep) { m.append(h('<div class="pop-sep" role="separator"></div>')); continue; }
    const b = h(`<button role="menuitem">${it.icon ? icon(it.icon) : ''}<span class="pm-label">${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</button>`);
    b.onclick = () => { close(); it.run(); };
    m.append(b);
  }
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth, hgt = m.offsetHeight;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
  let top = r.bottom + 6;
  if (top + hgt > window.innerHeight - 8) top = Math.max(8, r.top - hgt - 6);
  m.style.left = left + 'px';
  m.style.top = top + 'px';
  const outside = (e) => { if (!m.contains(e.target)) close(); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  function close() {
    m.remove();
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', key, true);
    if (popClose === close) popClose = null;
  }
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
  });
  popClose = close;
  const first = m.querySelector('button');
  if (first) first.focus();
}

/* =========================================================
 * דחיסה והמרה — לשונית משלהן
 * ======================================================= */
function renderExport() {
  const panel = $('#panel');
  const seg = h('<div class="segmented" role="tablist" aria-label="דחיסה והמרה"></div>');
  for (const m of EXPORT_MODES) {
    const b = h(`<button role="tab" aria-pressed="${S.exportMode === m.id}" aria-selected="${S.exportMode === m.id}">${m.label}</button>`);
    b.onclick = () => { if (S.exportMode !== m.id) { S.exportMode = m.id; $('#desk').scrollTop = 0; render(); } };
    seg.append(b);
  }
  panel.append(seg);
  (S.exportMode === 'convert' ? renderConvert : renderCompress)();
}

/* =========================================================
 * סימן מים ומספרי עמודים — ב"טקסט וחתימה". מוחלים על הקובץ בשמירה,
 * ומוצגים על העמודים עצמם כבר עכשיו (שכבה שקופה מעל כל עמוד)
 * ======================================================= */
function extrasGroup() {
  const wm = S.extras.watermark;
  const pn = S.extras.pageNumbers;
  const g = h(`
    <div class="group">
      <h2>על כל העמודים</h2>
      <label class="check"><input type="checkbox" data-k="wm" ${wm.enabled ? 'checked' : ''}><span><b style="font-weight:600">סימן מים</b><small>טקסט שקוף באלכסון על כל עמוד</small></span></label>
      <div data-box="wm" ${wm.enabled ? '' : 'hidden'} class="extras-box">
        <label class="field"><span>טקסט</span><input class="input" dir="auto" data-f="text" value="${esc(wm.text)}"></label>
        <div class="row2">
          <label class="field"><span>גודל</span><input class="input" type="number" min="12" max="200" data-f="size" value="${wm.size}"></label>
          <label class="field"><span>שקיפות</span><select class="select input" data-f="opacity">
            ${[[0.08, 'עדינה מאוד'], [0.16, 'עדינה'], [0.3, 'בינונית'], [0.5, 'בולטת']].map(([v, l]) => `<option value="${v}" ${wm.opacity === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
        </div>
        <div class="swatches" role="group" aria-label="צבע">${[['#C23A2E', 'אדום'], ['#1F35B5', 'כחול'], ['#5D6B72', 'אפור']].map(([c, n]) => `<button class="swatch" data-color="${c}" style="background:${c}" title="${n}" aria-label="${n}" aria-pressed="${wm.color === c}"></button>`).join('')}</div>
      </div>
      <label class="check"><input type="checkbox" data-k="pn" ${pn.enabled ? 'checked' : ''}><span><b style="font-weight:600">מספרי עמודים</b><small>בתחתית או בראש כל עמוד</small></span></label>
      <div data-box="pn" ${pn.enabled ? '' : 'hidden'} class="extras-box">
        <label class="field"><span>נוסח</span><select class="select input" data-p="format">
          ${['עמוד {n} מתוך {total}', 'עמוד {n}', '{n}', '- {n} -', '{n}/{total}'].map((f) => `<option value="${esc(f)}" ${pn.format === f ? 'selected' : ''}>${esc(f.replace('{n}', '3').replace('{total}', '12'))}</option>`).join('')}
        </select></label>
        <label class="field"><span>מיקום</span><select class="select input" data-p="position">
          ${[['bottom-center', 'למטה באמצע'], ['bottom-right', 'למטה מימין'], ['bottom-left', 'למטה משמאל'], ['top-center', 'למעלה באמצע'], ['top-right', 'למעלה מימין'], ['top-left', 'למעלה משמאל']].map(([v, l]) => `<option value="${v}" ${pn.position === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
        <label class="check"><input type="checkbox" data-p="skipFirst" ${pn.skipFirst ? 'checked' : ''}><span>בלי מספר בעמוד הראשון (שער)</span></label>
      </div>
    </div>`);
  const changed = () => { markDirty(); refreshExtras(); };
  g.querySelector('[data-k=wm]').onchange = (e) => { wm.enabled = e.target.checked; g.querySelector('[data-box=wm]').hidden = !wm.enabled; if (wm.enabled && !wm.text) wm.text = 'טיוטה'; changed(); };
  g.querySelectorAll('[data-f]').forEach((inp) => (inp.oninput = () => { const k = inp.dataset.f; wm[k] = k === 'text' ? inp.value : +inp.value; changed(); }));
  g.querySelectorAll('[data-color]').forEach((b) => (b.onclick = () => { wm.color = b.dataset.color; g.querySelectorAll('[data-color]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); changed(); }));
  g.querySelector('[data-k=pn]').onchange = (e) => { pn.enabled = e.target.checked; g.querySelector('[data-box=pn]').hidden = !pn.enabled; changed(); };
  g.querySelectorAll('[data-p]').forEach((inp) => (inp.onchange = () => { const k = inp.dataset.p; pn[k] = inp.type === 'checkbox' ? inp.checked : inp.value; changed(); }));
  return g;
}

/** סימן המים ומספר העמוד על עמוד בתצוגה — כמו שייכתבו לקובץ (ops.js: applyWatermark / applyPageNumbers) */
function drawExtras(ctx) {
  const { frame, p } = ctx;
  let layer = frame.querySelector('.extras-layer');
  if (!layer) {
    layer = h('<div class="extras-layer" aria-hidden="true"></div>');
    frame.insertBefore(layer, frame.querySelector('.overlay'));
  }
  layer.innerHTML = '';
  const sc = ctx.scale;
  const wm = S.extras.watermark;
  if (wm.enabled && wm.text) {
    const el = h(`<div class="wm-prev" dir="auto"></div>`);
    el.textContent = wm.text;
    el.style.fontSize = (wm.size || 60) * sc + 'px';
    el.style.color = wm.color || '#C23A2E';
    el.style.opacity = wm.opacity == null ? 0.18 : wm.opacity;
    el.style.transform = `translate(-50%, -50%) rotate(${-(wm.angle == null ? 35 : wm.angle)}deg)`;
    layer.append(el);
  }
  const pn = S.extras.pageNumbers;
  const i = S.pages.indexOf(p);
  if (pn.enabled && i >= 0 && !(pn.skipFirst && i === 0)) {
    const total = S.pages.length;
    const el = h('<div class="pn-prev" dir="rtl"></div>');
    el.textContent = (pn.format || 'עמוד {n} מתוך {total}').replace('{n}', String(i + 1)).replace('{total}', String(total));
    const size = (pn.size || 11) * sc, margin = 24 * sc;
    const pos = pn.position || 'bottom-center';
    el.style.fontSize = size + 'px';
    el.style.color = pn.color || '#444444';
    el.style.left = margin + 'px';
    el.style.right = margin + 'px';
    el.style.textAlign = pos.endsWith('right') ? 'right' : pos.endsWith('left') ? 'left' : 'center';
    if (pos.startsWith('top')) el.style.top = margin - size * 0.95 + 'px';
    else el.style.bottom = margin - size * 0.3 + 'px';
    layer.append(el);
  }
}
function refreshExtras() {
  document.querySelectorAll('.page-frame').forEach((f) => { if (f.__ctx) drawExtras(f.__ctx); });
}

/* =========================================================
 * צפייה, מילוי ועריכה — עמודים בגלילה
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
      <p class="hint">${S.placing === 'redact' ? 'גררו מלבן על מה שצריך להימחק. אפשר לסמן כמה אזורים ברצף. Esc לסיום.' : S.placing === 'mark' ? 'לחצו על כל תיבה שצריך לסמן. אפשר לסמן כמה ברצף. Esc לסיום.' : S.placing ? 'לחצו על המקום בעמוד שבו זה צריך להופיע. Esc לביטול.' : 'בוחרים כלי ולוחצים על המקום הרצוי בעמוד.'}</p>
      <div class="tool-grid">
        <button class="tool" data-t="text" aria-pressed="${S.placing === 'text'}">${icon('text')}טקסט</button>
        <button class="tool" data-t="signature" aria-pressed="${S.placing === 'signature'}">${icon('sign')}חתימה</button>
        <button class="tool" data-t="mark" aria-pressed="${S.placing === 'mark'}">${icon('mark')}סימון<small>V או X בתיבה</small></button>
        <button class="tool" data-t="redact" aria-pressed="${S.placing === 'redact'}">${icon('redact')}השחרה<small>מוחקת לצמיתות</small></button>
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
  const fg = formsGroup();
  panel.append(fillTabs(), ...(fg ? [fg] : []), signTools(), signaturesGroup(), extrasGroup());
  pageColumn();
}

/** בתוך "מילוי ועריכה", רק כשיש בקובץ שדות טופס: רשימת השדות (קפיצה לשדה) ונעילת הטופס בשמירה */
function formsGroup() {
  const desk = $('#desk');
  const withFields = [...S.sources.values()].filter((s) => s.fields.length && S.pages.some((p) => p.src === s.id));
  if (!withFields.length) return null;
  const fg = h(`<div class="group"><h2>שדות טופס</h2><p class="hint">ממלאים ישירות על הדף. בחירת שדה מהרשימה קופצת אליו.</p><div class="field-list"></div>
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
  return fg;
}

/* =========================================================
 * אבטחה: סיסמה, הגבלות וחתימה דיגיטלית
 * ======================================================= */
const PERM_LABELS = {
  printing: 'הדפסה',
  copying: 'העתקת טקסט ותמונות',
  modifying: 'שינוי התוכן',
  annotating: 'הוספת הערות',
  fillingForms: 'מילוי טפסים',
  documentAssembly: 'הוספה, מחיקה וסיבוב של עמודים',
};

/** התעודה שנבחרה לחתימה (בזיכרון בלבד — כולל סיסמת קובץ התעודה, שלא נשמרת לדיסק) */
let certChoice = null;

const ipcMsg = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');

function pwStrength(pw) {
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length < 6) score = 0;
  return score <= 1 ? { cls: 'weak', text: 'סיסמה חלשה' } : score <= 3 ? { cls: 'medium', text: 'סיסמה בינונית' } : { cls: 'strong', text: 'סיסמה חזקה' };
}

function passwordGroup(st) {
  const g = h(`
    <div class="group">
      <h2>סיסמת פתיחה</h2>
      ${st.info.hadOpenPassword ? `<p class="status-line">${icon('lock')}הקובץ המקורי מוגן בסיסמת פתיחה.</p>` : ''}
      <label class="check"><input type="checkbox" data-k="on" ${st.open.on ? 'checked' : ''}><span>דרישת סיסמה לפתיחת הקובץ<small>הקובץ יוצפן (AES-256). בלי הסיסמה אי אפשר לראות את התוכן.</small></span></label>
      <div class="sub" data-box ${st.open.on ? '' : 'hidden'}>
        <label class="field"><span>סיסמה</span><input class="input" type="password" dir="ltr" data-f="password" autocomplete="new-password"></label>
        <p class="strength" data-strength aria-live="polite"></p>
        <label class="field"><span>אימות הסיסמה</span><input class="input" type="password" dir="ltr" data-f="confirm" autocomplete="new-password"></label>
        <label class="check"><input type="checkbox" data-show><span>הצגת הסיסמה</span></label>
      </div>
      <p class="hint">${st.info.hadOpenPassword
        ? (st.open.on ? 'כדי להסיר את הסיסמה — בטלו את הסימון ושמרו.' : 'הסיסמה תוסר בשמירה, והקובץ ייפתח לכל אחד.')
        : 'חשוב: אם הסיסמה תישכח, אי אפשר יהיה לפתוח את הקובץ. אין שום דרך לשחזר אותה.'}</p>
    </div>`);
  const strength = g.querySelector('[data-strength]');
  const showStrength = () => {
    const s = pwStrength(st.open.password);
    strength.className = 'strength ' + (s ? s.cls : '');
    strength.textContent = s ? s.text : '';
  };
  g.querySelectorAll('[data-f]').forEach((inp) => {
    inp.value = st.open[inp.dataset.f] || '';
    inp.oninput = () => { st.open[inp.dataset.f] = inp.value; markDirty(); showStrength(); };
  });
  g.querySelector('[data-show]').onchange = (e) => g.querySelectorAll('[data-f]').forEach((inp) => (inp.type = e.target.checked ? 'text' : 'password'));
  g.querySelector('[data-k=on]').onchange = (e) => {
    st.open.on = e.target.checked;
    markDirty();
    render();
    if (st.open.on && !st.open.password) $('#panel [data-f=password]')?.focus();
  };
  showStrength();
  return g;
}

function restrictGroup(st) {
  const g = h(`
    <div class="group">
      <h2>הגבלות</h2>
      ${st.info.wasRestricted ? `<p class="status-line">${icon('lock')}בקובץ המקורי היו הגבלות. הן יישמרו גם בשמירה, אלא אם תבטלו אותן.</p>` : ''}
      <label class="check"><input type="checkbox" data-k="on" ${st.restrict.on ? 'checked' : ''}><span>הגבלת פעולות על הקובץ<small>הקובץ נפתח כרגיל, אבל רק הפעולות המסומנות מותרות.</small></span></label>
      <div class="sub" data-box ${st.restrict.on ? '' : 'hidden'}>
        <p class="hint">מותר:</p>
        <div class="perm-list">${Ops.PERMISSION_KEYS.map((k) => `<label class="check"><input type="checkbox" data-p="${k}" ${st.restrict.perms[k] ? 'checked' : ''}><span>${PERM_LABELS[k]}</span></label>`).join('')}</div>
        <label class="field"><span>סיסמת בעלים (רשות)</span><input class="input" type="password" dir="ltr" data-owner autocomplete="new-password"></label>
        <p class="hint">סיסמת הבעלים מאפשרת לבטל את ההגבלות בתוכנות כמו Adobe. אם תשאירו ריק — תיווצר סיסמה אקראית.</p>
      </div>
      <p class="hint">רוב התוכנות (Adobe, דפדפנים) מכבדות את ההגבלות, אבל הן לא הגנה מלאה. להגנה אמיתית השתמשו בסיסמת פתיחה.</p>
    </div>`);
  g.querySelector('[data-k=on]').onchange = (e) => { st.restrict.on = e.target.checked; markDirty(); render(); };
  g.querySelectorAll('[data-p]').forEach((c) => (c.onchange = () => { st.restrict.perms[c.dataset.p] = c.checked; markDirty(); }));
  const owner = g.querySelector('[data-owner]');
  owner.value = st.restrict.ownerPassword || '';
  owner.oninput = () => { st.restrict.ownerPassword = owner.value; markDirty(); };
  return g;
}

/** החתימה הדיגיטלית הגלויה שמוקמה במסמך (אם יש) */
function findDigiSig() {
  for (let i = 0; i < S.pages.length; i++) {
    const it = (S.stamps[S.pages[i].key] || []).find((x) => x.type === 'digisig');
    if (it) return { item: it, pageIndex: i, key: S.pages[i].key };
  }
  return null;
}

function digiSigPreview(it, scale) {
  const d = D();
  const lines = Ops.digiSigLines({
    signer: certChoice ? certChoice.info.name : 'שם החותם',
    date: todayStr(), reason: d && d.digi.reason, location: d && d.digi.location,
  });
  const box = h(`<div class="digisig-box" title="חתימה דיגיטלית — תיווצר בלחיצה על 'חתימה ושמירה'">${it.image ? `<img alt="" src="${it.image}">` : ''}<div class="digisig-lines">${lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div></div>`);
  const size = Math.max(4, Math.min(11, (it.h - 10) / (lines.length * 1.25)));
  box.style.fontSize = size * scale + 'px';
  return box;
}

function signatureRow(sig) {
  let status, cls;
  if (!sig.intact) { status = sig.error || 'החתימה לא תקינה'; cls = 'bad'; }
  else if (!sig.coversWholeFile) { status = 'החתימה תקינה. נוספו אחריה שינויים או חתימות נוספות.'; cls = 'ok'; }
  else { status = 'החתימה תקינה — המסמך לא שונה מאז החתימה.'; cls = 'ok'; }
  const when = sig.signedAt ? new Date(sig.signedAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const who = sig.selfSigned ? 'תעודה אישית — לא מאושרת ע"י רשות' : sig.certIssuer ? `הונפקה ע"י ${sig.certIssuer} (האמון ברשות לא נבדק)` : '';
  return h(`
    <div class="sig-row ${cls}">
      ${icon(cls === 'ok' ? 'cert' : 'warn')}
      <div><b>${esc(sig.name || sig.certSubject || 'חותם לא ידוע')}</b>${when ? `<small>${esc(when)}</small>` : ''}<small class="st">${esc(status)}</small>${who ? `<small>${esc(who)}</small>` : ''}${sig.reason ? `<small>סיבה: ${esc(sig.reason)}</small>` : ''}</div>
    </div>`);
}

function digiGroup(d) {
  const placed = findDigiSig();
  const sigs = existingSignatures();
  const g = h(`
    <div class="group">
      <h2>חתימה דיגיטלית</h2>
      <p class="hint">חתימה עם תעודה דיגיטלית מוכיחה מי חתם ושהמסמך לא שונה אחרי החתימה. זה שונה מחתימה מצוירת.</p>
      ${sigs.length ? '<div class="sig-list"><p class="hint"><b>חתימות במסמך:</b></p></div>' : ''}
      <div class="cert-card"></div>
      <label class="field"><span>סיבת החתימה</span><input class="input" data-d="reason"></label>
      <label class="field"><span>מקום (רשות)</span><input class="input" data-d="location" placeholder="למשל: תל אביב"></label>
      <div class="tool-grid"><button class="tool" data-place aria-pressed="${S.placing === 'digisig'}">${icon('cert')}${placed ? `החתימה בעמוד ${placed.pageIndex + 1}<small>לחיצה ממקמת מחדש</small>` : 'מיקום החתימה בעמוד<small>בלי מיקום — חתימה בלתי נראית</small>'}</button></div>
      ${placed && savedSignatures().length ? `<label class="check"><input type="checkbox" data-img ${placed.item.image ? 'checked' : ''}><span>עם תמונת החתימה שלי</span></label>` : ''}
      ${placed ? '<button class="btn btn-quiet" data-unplace>הסרת המיקום (חתימה בלתי נראית)</button>' : ''}
      <button class="btn btn-primary btn-block" data-sign>${icon('cert')}חתימה ושמירה…</button>
      <p class="hint">החתימה היא הפעולה האחרונה: היא נשמרת לקובץ חדש, וכל שינוי אחריה יבטל אותה. אין חותמת זמן מאושרת (נדרש חיבור לאינטרנט).</p>
    </div>`);
  const list = g.querySelector('.sig-list');
  if (list) sigs.forEach((s) => list.append(signatureRow(s)));

  const card = g.querySelector('.cert-card');
  if (certChoice) {
    const c = certChoice.info;
    card.append(h(`<div class="cert-chosen">${icon('cert')}<div><b>${esc(c.name)}</b><small>${c.selfSigned ? 'תעודה אישית' : esc(c.issuer || '')}${c.notAfter ? ` · בתוקף עד ${esc(String(c.notAfter).slice(0, 10))}` : ''}</small></div><button class="btn btn-quiet" data-cert>החלפה</button></div>`));
  } else card.append(h(`<button class="btn btn-block" data-cert>${icon('cert')}בחירת תעודה…</button>`));
  card.querySelector('[data-cert]').onclick = async () => {
    const c = await certDialog();
    if (c) { certChoice = c; render(); }
  };

  g.querySelectorAll('[data-d]').forEach((inp) => {
    inp.value = d.digi[inp.dataset.d] || '';
    inp.oninput = () => { d.digi[inp.dataset.d] = inp.value; refreshItems(); };
  });
  g.querySelector('[data-place]').onclick = () => {
    if (S.placing === 'digisig') { S.placing = null; return render(); }
    if (!S.signature && savedSignatures().length) S.signature = savedSignatures()[0];
    S.placing = 'digisig';
    render();
  };
  const img = g.querySelector('[data-img]');
  if (img) img.onchange = () => commit(() => { placed.item.image = img.checked ? (S.signature || savedSignatures()[0]) : null; });
  const un = g.querySelector('[data-unplace]');
  if (un) un.onclick = () => commit(() => { S.stamps[placed.key] = S.stamps[placed.key].filter((x) => x !== placed.item); });
  g.querySelector('[data-sign]').onclick = digitalSignAndSave;
  return g;
}

function renderSecurity() {
  const d = D();
  const panel = $('#panel');
  if (S.placing === 'digisig') panel.append(h('<div class="group"><p class="hint placing-hint">לחצו על המקום בעמוד שבו החתימה צריכה להופיע. Esc לביטול.</p></div>'));
  panel.append(passwordGroup(d.security), restrictGroup(d.security), digiGroup(d));
  pageColumn();
}

/**
 * אם המסמך לא שונה (קובץ אחד, אותם עמודים, בלי תוספות) — חותמים על הקובץ המקורי עצמו,
 * בעדכון מצטבר. כך חתימות קודמות שבו נשארות תקפות (חתימה של כמה אנשים).
 */
function canSignOriginal() {
  const d = D();
  if (d.sources.size !== 1) return null;
  const src = [...d.sources.values()][0];
  if (src.decrypted) return null;
  if (S.pages.length !== src.count || S.pages.some((p, i) => p.src !== src.id || p.index !== i || p.rotate)) return null;
  if (Object.values(S.stamps).some((l) => l.some((it) => it.type !== 'digisig'))) return null;
  if (Object.values(S.formValues).some((v) => v && Object.keys(v).length)) return null;
  if (S.extras.watermark.enabled || S.extras.pageNumbers.enabled || S.flattenForms) return null;
  return src;
}

async function digitalSignAndSave() {
  const d = D();
  if (!d || !d.pages.length) return;
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
  const st = d.security;
  if (st.open.on || st.restrict.on) {
    const c = await confirmDialog('חתימה דיגיטלית והגנה בסיסמה',
      'אי אפשר לשמור באותו קובץ גם חתימה דיגיטלית וגם סיסמה או הגבלות: ההצפנה אחרי החתימה מבטלת אותה. אפשר לחתום ולשמור בלי הגנה, ולשלוח את הקובץ בדרך מאובטחת.', [
        { id: 'go', label: 'חתימה בלי הגנה', primary: true },
        { id: 'cancel', label: 'ביטול', quiet: true },
      ]);
    if (c !== 'go') return;
    st.open.on = false;
    st.restrict.on = false;
    render();
  }
  if (!certChoice) {
    const c = await certDialog();
    if (!c) return;
    certChoice = c;
    render();
  }
  const placed = findDigiSig();
  const original = canSignOriginal();
  if (!original && !(await confirmBreakSignatures())) return;
  const cert = certChoice;
  try {
    const signed = await busy(cert.source.kind === 'store' ? 'חותם… ייתכן ש-Windows יבקש את קוד ה-PIN של הכרטיס' : 'חותם…', async () => {
      const bytes = original ? original.bytes : await buildBytes(S.pages);
      return api.digitalSign({
        bytes,
        source: cert.source,
        pageIndex: placed ? placed.pageIndex : 0,
        rect: placed ? { x: placed.item.x, y: placed.item.y, w: placed.item.w, h: placed.item.h } : null,
        name: cert.info.name,
        reason: d.digi.reason,
        location: d.digi.location,
        appearance: placed ? { signer: cert.info.name, image: placed.item.image || null, color: '#1F35B5' } : null,
      });
    });
    const path = await api.saveAs(`${d.title} - חתום.pdf`, signed, d.path);
    if (!path) return;
    // הלשונית נפתחת מחדש מהקובץ החתום, כדי שכל שינוי נוסף יציג אזהרה על ביטול החתימה
    const entry = await api.readFile(path);
    for (const s of d.sources.values()) { try { s.pdf.destroy(); } catch (e) { /* כבר נסגר */ } }
    docs.delete(d.id);
    syncDirty();
    await openEntries([entry], { tool: 'security' });
    toast('המסמך נחתם ונשמר', { action: { label: 'פתיחה בתיקייה', run: () => api.showInFolder(path) } });
  } catch (e) {
    console.error(e);
    toast(ipcMsg(e), { error: true });
  }
}

function recentCertFiles() {
  try { return JSON.parse(localStore('certs.files') || '[]'); } catch (e) { return []; }
}
function rememberCertFile(path, name) {
  const list = [{ path, name }, ...recentCertFiles().filter((x) => x.path !== path)].slice(0, 5);
  localStore('certs.files', JSON.stringify(list));
}

/** בחירת תעודה: ממאגר Windows, מקובץ ‎.pfx, או יצירת תעודה אישית. מחזיר { source, info } או null */
async function certDialog() {
  let winOk = false;
  try { winOk = await api.certsSupported(); } catch (e) { /* לא קריטי */ }
  return new Promise((resolve) => {
    let mode = winOk ? 'store' : 'file';
    let storeList = null, picked = null;
    let filePath = (recentCertFiles()[0] || {}).path || null;
    const back = h(`
      <div class="modal-back"><div class="modal cert-modal" role="dialog" aria-modal="true" aria-labelledby="ct-t" style="width:min(560px,100%)">
        <header><h2 id="ct-t">בחירת תעודה לחתימה</h2><button class="icon-btn" data-x aria-label="סגירה">${icon('x')}</button></header>
        <div class="body">
          <div class="segmented" role="tablist">
            ${winOk ? '<button data-m="store">מאגר Windows</button>' : ''}
            <button data-m="file">קובץ תעודה</button>
            <button data-m="create">תעודה אישית חדשה</button>
          </div>
          <div class="cert-pane" data-pane></div>
          <p class="form-error" role="alert" hidden></p>
        </div>
        <footer><button class="btn btn-primary" data-ok>בחירה</button><button class="btn btn-quiet push" data-cancel>ביטול</button></footer>
      </div></div>`);
    const pane = back.querySelector('[data-pane]');
    const err = back.querySelector('.form-error');
    const showErr = (m) => { err.textContent = m || ''; err.hidden = !m; };
    const done = (v) => { back.remove(); resolve(v); };

    const draw = () => {
      showErr('');
      back.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === mode)));
      if (mode === 'store') {
        pane.innerHTML = '<p class="hint">תעודות שמותקנות ב-Windows, כולל כרטיס חכם או טוקן USB (קומסיין, PersonalID ועוד). חברו את הכרטיס לפני הבחירה.</p><div class="cert-list"><p class="hint">טוען את רשימת התעודות…</p></div><button class="btn btn-quiet" data-refresh>רענון הרשימה</button>';
        const list = pane.querySelector('.cert-list');
        const fill = () => {
          list.innerHTML = '';
          if (!storeList.length) list.append(h('<p class="hint">לא נמצאו תעודות לחתימה. אם יש לכם כרטיס חכם — ודאו שהוא מחובר ושהתוכנה של הספק מותקנת.</p>'));
          for (const c of storeList) {
            const b = h(`<button class="cert-item" aria-pressed="${!!picked && picked.thumb === c.thumb}"><b>${esc(c.name)}</b><small>${esc(c.issuer)}${c.selfSigned ? ' · תעודה אישית' : ''} · בתוקף עד ${esc(c.notAfter)}</small></button>`);
            b.onclick = () => { picked = c; fill(); };
            b.ondblclick = () => { picked = c; ok(); };
            list.append(b);
          }
        };
        const load = async () => {
          try { storeList = await api.certsList(); fill(); } catch (e) { list.innerHTML = ''; showErr('לא הצלחנו לקרוא את מאגר התעודות: ' + ipcMsg(e)); }
        };
        pane.querySelector('[data-refresh]').onclick = () => { storeList = null; list.innerHTML = '<p class="hint">טוען…</p>'; load(); };
        if (storeList) fill(); else load();
      } else if (mode === 'file') {
        const recent = recentCertFiles();
        pane.innerHTML = `
          <p class="hint">קובץ ‎.pfx או ‎.p12 שקיבלתם מהגורם המנפיק (או תעודה אישית שיצרתם כאן), עם הסיסמה שלו.</p>
          <div class="file-pick"><span class="file-name" dir="ltr"></span><button class="btn" data-pick>בחירת קובץ…</button></div>
          ${recent.length ? `<div class="recent"><span>אחרונים:</span>${recent.map((r, i) => `<button class="link" data-r="${i}">${esc(r.name)}</button>`).join('')}</div>` : ''}
          <label class="field"><span>סיסמת התעודה</span><input class="input" type="password" dir="ltr" data-pw autocomplete="off"></label>`;
        const nameEl = pane.querySelector('.file-name');
        const showName = () => { nameEl.textContent = filePath ? filePath.split(/[\\/]/).pop() : 'לא נבחר קובץ'; };
        showName();
        const pw = pane.querySelector('[data-pw]');
        pane.querySelector('[data-pick]').onclick = async () => { const p = await api.pickPfx(); if (p) { filePath = p; showName(); pw.focus(); } };
        pane.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { filePath = recent[+b.dataset.r].path; showName(); pw.focus(); }));
        pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
      } else {
        pane.innerHTML = `
          <p class="hint">התוכנה תיצור תעודה על שמכם ותשמור אותה במחשב הזה. היא מוכיחה שהמסמך לא שונה אחרי החתימה, אבל לא מאושרת ע"י רשות — Adobe יציג "זהות החותם לא אומתה". מתאים לשימוש פנימי, לא מול רשויות ובנקים.</p>
          <label class="field"><span>שם מלא</span><input class="input" data-c="name"></label>
          <label class="field"><span>דוא"ל (רשות)</span><input class="input" dir="ltr" data-c="email"></label>
          <label class="field"><span>סיסמה לתעודה</span><input class="input" type="password" dir="ltr" data-c="password" autocomplete="new-password"></label>
          <p class="hint">הסיסמה תידרש בכל חתימה, כדי שמי שמשתמש במחשב שלכם לא יוכל לחתום בשמכם.</p>`;
        pane.querySelector('[data-c=name]').focus();
      }
    };

    const ok = async () => {
      showErr('');
      try {
        if (mode === 'store') {
          if (!picked) return showErr('בחרו תעודה מהרשימה');
          return done({ source: { kind: 'store', thumb: picked.thumb }, info: { name: picked.name, issuer: picked.issuer, notAfter: picked.notAfter, selfSigned: picked.selfSigned } });
        }
        if (mode === 'file') {
          if (!filePath) return showErr('בחרו קובץ תעודה');
          const source = { kind: 'file', path: filePath, password: pane.querySelector('[data-pw]').value };
          const info = await api.certInfo(source);
          if (info.expired) return showErr('התעודה לא בתוקף');
          rememberCertFile(filePath, info.name);
          return done({ source, info });
        }
        const v = (k) => pane.querySelector(`[data-c=${k}]`).value;
        if (!v('name').trim()) return showErr('הקלידו שם מלא');
        if (v('password').length < 4) return showErr('בחרו סיסמה של 4 תווים לפחות');
        const password = v('password');
        const created = await busy('יוצר תעודה…', () => api.certCreate({ name: v('name').trim(), email: v('email').trim(), password }));
        const source = { ...created, password };
        const info = await api.certInfo(source);
        rememberCertFile(created.path, info.name);
        toast('התעודה נוצרה ונשמרה במחשב');
        done({ source, info });
      } catch (e) { showErr(ipcMsg(e)); }
    };

    back.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { mode = b.dataset.m; draw(); }));
    back.querySelector('[data-ok]').onclick = ok;
    back.querySelector('[data-cancel]').onclick = () => done(null);
    back.querySelector('[data-x]').onclick = () => done(null);
    back.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(null); });
    $('#modal-root').append(back);
    draw();
  });
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
    card('context', 'קליק ימני בסייר הקבצים',
      'בלחיצה ימנית על קובץ PDF אחד או כמה יופיעו "פתיחה", "מיזוג" ו"פיצול" באיתןPDF. על תמונות (JPG, PNG) וקובצי Word יופיע "המרה ל-PDF": הקובץ החדש נשמר ליד המקור ונפתח בתוכנה. כמה תמונות שנבחרו יחד הופכות לקובץ אחד. המרת Word נעשית דרך Microsoft Word או LibreOffice שמותקנים במחשב.',
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
  const problem = securityProblem();
  if (problem) { toast(problem, { error: true }); return false; }
  if (!(await confirmBreakSignatures())) return false;
  try {
    const bytes = await busy('שומר…', () => buildBytes(S.pages, { final: true }));
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
  const problem = securityProblem();
  if (problem) { toast(problem, { error: true }); return false; }
  if (!(await confirmBreakSignatures())) return false;
  try {
    const bytes = await busy('מכין את הקובץ…', () => buildBytes(pages, { final: true }));
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
  $('#btn-find').onclick = () => (F.open ? closeFind() : openFind());
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
  // המרה ל-PDF מקליק ימני: הודעה בזמן העבודה (Word יכול לקחת כמה שניות)
  let topdfEl = null;
  api.onToPdf((st) => {
    if (st.working) {
      if (!topdfEl) {
        topdfEl = h(`<div class="busy"><div class="busy-card"><span class="spinner"></span><span></span></div></div>`);
        document.body.append(topdfEl);
      }
      topdfEl.querySelector('.busy-card span:last-child').textContent = st.count > 1 ? `ממיר ${st.count} קבצים ל-PDF…` : 'ממיר ל-PDF…';
    } else {
      if (topdfEl) { topdfEl.remove(); topdfEl = null; }
      if (st.outputs && st.outputs.length) toast(st.outputs.length === 1 ? 'נשמר PDF ליד הקובץ המקורי.' : `נשמרו ${st.outputs.length} קובצי PDF ליד הקבצים המקוריים.`, { action: { label: 'פתיחה בתיקייה', run: () => api.showInFolder(st.outputs[0]) } });
    }
  });
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
    else if (cmd === 'find') openFind();
    else if (cmd === 'find-next') { if (F.open && F.results.length) stepFind(1); else openFind(); }
    else if (cmd === 'find-prev') { if (F.open && F.results.length) stepFind(-1); else openFind(); }
    else if (cmd === 'compress') { if (D() && S.pages.length) activate(activeId, 'compress'); }
    else if (cmd === 'convert-word' || cmd === 'convert-images') {
      if (D() && S.pages.length) { S.convert.to = cmd === 'convert-word' ? 'word' : 'images'; saveConvertPrefs(); activate(activeId, 'convert'); }
    }
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
  // פונט ברירת המחדל לשורות שנערכות (Alef נשאר לחתימות ולטקסט חופשי)
  api.readAsset('fonts/IBMPlexSansHebrew-Regular.ttf').then(async (r) => { S.plexFonts = { regular: r, bold: await api.readAsset('fonts/IBMPlexSansHebrew-Bold.ttf') }; });
  await Promise.all(savedSignatures().map(preloadRatio));
  render();
  api.rendererReady();
  window.__app = { S, docs, D, render, setView, openInEditor, commit, saveDocument, buildBytes, activate, pageLines, undo, redo, pdfjsLib, PDFJS_OPTS }; // לבדיקות אוטומטיות
})();
