// איתןPDF לאנדרואיד — ממשק
import { $, toast, busy, prompt, menu, choose, openSheet, closeTopSheet, esc, iso } from './js/ui.js';
import { isNative, App, pickPdfs, onReceivedFiles, writeOver, saveAs, saveToFolder, share, readAsset } from './js/native.js';
import { Viewer } from './js/viewer.js';
import { PagesEditor } from './js/pages.js';
import { Doc, loadSource, baseName } from './js/doc.js';

const Ops = window.PdfOps;

const ICON = {
  open: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  page: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h6M9 16h4"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/></svg>',
  saveAs: '<svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v6M5 3v18h7"/><path d="M8 3v5h7V3M15 15l3 3 3-3M18 18v-7"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13l3 3 3-3"/></svg>',
};

/* ---------- מצב ---------- */

const S = {
  doc: null,     // Doc — המסמך הפתוח
  fonts: null,   // Alef, כמו בדסקטופ
  screen: 'home',
};

const viewer = new Viewer($('#scroller'), $('#pages'), { onPageChange: showPagePill });
const editor = new PagesEditor($('#grid-scroller'), $('#grid'), {
  onSelection: updatePagesToolbar,
  onReorder: (keys) => { if (S.doc.reorder(keys)) { editor.render(); refreshDoc(); } },
});

async function fonts() {
  if (!S.fonts) {
    const [regular, bold] = await Promise.all([readAsset('fonts/Alef-Regular.ttf'), readAsset('fonts/Alef-Bold.ttf')]);
    S.fonts = { regular, bold };
  }
  return S.fonts;
}

/* ---------- מסכים ---------- */

function showScreen(name) {
  S.screen = name;
  $('#home').hidden = name !== 'home';
  $('#viewer').hidden = name !== 'viewer';
  $('#pages-screen').hidden = name !== 'pages';
}

/** עדכון הכותרת וסימן "לא נשמר" */
function refreshDoc() {
  const D = S.doc;
  if (!D) return;
  const n = D.pages.length;
  $('#doc-name').textContent = D.name;
  $('#doc-sub').textContent = (n === 1 ? 'עמוד אחד' : `${n} עמודים`) + (D.dirty ? ' · לא נשמר' : '');
  $('#viewer').classList.toggle('dirty', D.dirty);
  $('#btn-undo').disabled = !D.history.length;
}

/* ---------- פתיחת קבצים ---------- */

function askPassword(name, wrong) {
  busy(false);
  return prompt({
    title: wrong ? 'הסיסמה שגויה' : 'הקובץ מוגן בסיסמה',
    text: wrong ? 'נסו שוב.' : `כדי לפתוח את "${iso(name)}" צריך להקליד את הסיסמה שלו.`,
    type: 'password', ok: 'פתיחה',
  }).finally(() => busy(true, 'פותח…'));
}

/** טעינת קבצים למקורות. מחזיר רק את אלה שנטענו */
async function loadAll(files) {
  const out = [];
  busy(true, 'פותח…');
  try {
    for (const f of files) {
      try {
        const src = await loadSource(f, askPassword);
        if (src) out.push({ src, file: f });
      } catch (err) {
        console.error(err);
        toast(err.message, { error: true });
      }
    }
  } finally {
    busy(false);
  }
  return out;
}

/** פתיחת קבצים כמסמך חדש. כמה קבצים — מאוחדים למסמך אחד */
async function openFiles(files) {
  if (!files || !files.length) return;
  const loaded = await loadAll(files);
  if (!loaded.length) return;
  if (S.doc) closeDoc();
  const D = new Doc(loaded[0].src, loaded[0].file);
  for (const { src } of loaded.slice(1)) D.addSource(src);
  D.history = [];
  S.doc = D;
  if (loaded.length > 1) toast(`${loaded.length} קבצים אוחדו למסמך אחד. בכלי "עמודים" אפשר לסדר אותם.`);
  showScreen('viewer');
  refreshDoc();
  busy(true, 'פותח…');
  try { await viewer.open(D.refs()); } finally { busy(false); }
}

/** הוספת קבצים לסוף המסמך הפתוח (איחוד) */
async function addFiles(files) {
  if (!files || !files.length) return;
  const loaded = await loadAll(files);
  if (!loaded.length) return;
  const before = S.doc.pages.length;
  for (const { src } of loaded) S.doc.addSource(src);
  // ביטול אחד מבטל את כל ההוספה
  S.doc.history.splice(S.doc.history.length - loaded.length + 1, loaded.length - 1);
  const added = S.doc.pages.length - before;
  refreshDoc();
  if (S.screen === 'pages') editor.render();
  else await viewer.open(S.doc.refs(), { page: before, keepScale: true });
  toast(added === 1 ? 'נוסף עמוד אחד בסוף המסמך.' : `נוספו ${added} עמודים בסוף המסמך.`, {
    action: { label: 'ביטול', fn: undo },
  });
}

async function pickAndAdd() {
  try { await addFiles(await pickPdfs({ multiple: true })); } catch (err) { pickFailed(err); }
}

async function chooseAndOpen() {
  if (S.doc && S.doc.dirty && !(await confirmDiscard())) return;
  try { await openFiles(await pickPdfs({ multiple: true })); } catch (err) { pickFailed(err); }
}

function pickFailed(err) {
  if (err && /cancel/i.test(err.message || '')) return;
  console.error(err);
  toast('פתיחת הקובץ נכשלה.', { error: true });
}

function closeDoc() {
  viewer.close();
  editor.close();
  if (S.doc) S.doc.destroy();
  S.doc = null;
  showScreen('home');
}

/** שינויים שלא נשמרו: true אם אפשר להמשיך (נשמר או שהמשתמש ויתר) */
async function confirmDiscard() {
  const c = await choose('יש שינויים שלא נשמרו', 'מה לעשות עם השינויים במסמך?', [
    { id: 'save', label: 'שמירה…', primary: true },
    { id: 'discard', label: 'יציאה בלי לשמור', danger: true },
    { id: 'cancel', label: 'ביטול' },
  ]);
  if (c === 'discard') return true;
  if (c === 'save') return saveMenu();
  return false;
}

async function requestClose() {
  if (S.doc && S.doc.dirty && !(await confirmDiscard())) return;
  closeDoc();
}

/* ---------- שמירה ---------- */

async function buildBytes(opts) {
  return S.doc.build(await fonts(), opts);
}

/** תפריט השמירה. מחזיר true אם נשמר */
async function saveMenu() {
  const D = S.doc;
  const canOver = isNative && !!D.origin.uri && D.origin.writable;
  const fromApp = isNative && D.origin.uri && !D.origin.writable;
  const choice = await menu([
    { id: 'over', label: 'שמירה בקובץ המקורי', sub: canOver ? D.origin.name : 'לא זמין לקובץ הזה', icon: ICON.save, disabled: !canOver },
    { id: 'as', label: 'שמירה בשם…', sub: 'בוחרים תיקייה ושם לקובץ חדש', icon: ICON.saveAs },
    { id: 'share', label: 'שיתוף', sub: 'וואטסאפ, מייל ועוד', icon: ICON.share },
  ], {
    title: 'שמירה',
    note: fromApp ? 'הקובץ הגיע מאפליקציה שלא מאפשרת לשנות אותו (למשל וואטסאפ או ג׳ימייל). אפשר לשמור עותק בשם, או לשתף.' : '',
  });
  if (choice === 'over') return saveOver();
  if (choice === 'as') return saveAsNew();
  if (choice === 'share') { await shareDoc(); return false; }
  return false;
}

async function saveOver() {
  const D = S.doc;
  busy(true, 'שומר…');
  try {
    const bytes = await buildBytes();
    await writeOver(D.origin.uri, D.origin.name, bytes);
    D.dirty = false;
    refreshDoc();
    toast('נשמר.');
    return true;
  } catch (err) {
    console.error(err);
    if (err && err.code === 'NO_PERMISSION') {
      D.origin.writable = false;
      toast('אין הרשאה לשנות את הקובץ המקורי. שמרו בשם.', { error: true });
    } else {
      toast('השמירה נכשלה.', { error: true });
    }
    return false;
  } finally {
    busy(false);
  }
}

async function saveAsNew() {
  const D = S.doc;
  let bytes;
  busy(true, 'מכין את הקובץ…');
  try {
    bytes = await buildBytes();
  } catch (err) {
    console.error(err);
    toast('יצירת הקובץ נכשלה.', { error: true });
    return false;
  } finally {
    busy(false);
  }
  try {
    const res = await saveAs(`${D.name}.pdf`, bytes);
    if (!res) return false;
    if (res.uri) {
      D.origin = { uri: res.uri, writable: !!res.writable, name: res.name || `${D.name}.pdf` };
      D.name = baseName(D.origin.name);
    }
    D.dirty = false;
    refreshDoc();
    toast('נשמר.');
    return true;
  } catch (err) {
    console.error(err);
    toast('השמירה נכשלה.', { error: true });
    return false;
  }
}

async function shareDoc() {
  const D = S.doc;
  busy(true, 'מכין את הקובץ…');
  try {
    await share([{ name: `${D.name}.pdf`, bytes: await buildBytes() }]);
  } catch (err) {
    console.error(err);
    if (!/cancel|abort/i.test(String(err && (err.message || err.name)))) toast('השיתוף נכשל.', { error: true });
  } finally {
    busy(false);
  }
}

/** כמה קבצים חדשים (חילוץ / פיצול): שמירה בתיקייה או שיתוף */
async function deliverFiles(files, what) {
  const choice = await menu([
    { id: 'folder', label: files.length === 1 ? 'שמירה בשם…' : 'שמירה בתיקייה…', sub: files.length === 1 ? files[0].name : `${files.length} קבצים`, icon: files.length === 1 ? ICON.saveAs : ICON.folder },
    { id: 'share', label: 'שיתוף', icon: ICON.share },
  ], { title: what });
  if (!choice) return;
  try {
    if (choice === 'share') {
      busy(true, 'מכין…');
      try { await share(files); } finally { busy(false); }
      return;
    }
    if (files.length === 1) {
      if (await saveAs(files[0].name, files[0].bytes)) toast('נשמר.');
      return;
    }
    const n = await saveToFolder(files);
    if (n) toast(`נשמרו ${n} קבצים.`);
  } catch (err) {
    console.error(err);
    if (!/cancel|abort/i.test(String(err && (err.message || err.name)))) toast('השמירה נכשלה.', { error: true });
  }
}

/* ---------- עמודים ---------- */

function openPages() {
  if (!S.doc) return;
  showScreen('pages');
  editor.open(S.doc);
  refreshDoc();
}

async function closePages() {
  const page = Math.min(viewer.current, S.doc.pages.length - 1);
  editor.close();
  showScreen('viewer');
  refreshDoc();
  await viewer.open(S.doc.refs(), { page, keepScale: true });
}

function updatePagesToolbar(count) {
  $('#tb-none').hidden = count > 0;
  $('#tb-sel').hidden = count === 0;
  $('#sel-count').textContent = count === 1 ? 'נבחר 1 ✕' : `נבחרו ${count} ✕`;
  $('#pages-sub').textContent = count ? (count === 1 ? 'נבחר עמוד אחד' : `נבחרו ${count} עמודים`) : 'לחיצה ארוכה וגרירה לסידור · הקשה לבחירה';
}

function undo() {
  if (!S.doc || !S.doc.undo()) return;
  refreshDoc();
  if (S.screen === 'pages') editor.render();
  else viewer.open(S.doc.refs(), { page: viewer.current, keepScale: true });
}

function rotateSelected() {
  S.doc.rotate(editor.selected, 90);
  editor.render();
  refreshDoc();
}

function deleteSelected() {
  const n = editor.selected.size;
  if (n >= S.doc.pages.length) {
    toast('אי אפשר למחוק את כל העמודים.', { error: true });
    return;
  }
  S.doc.remove(editor.selected);
  editor.selected.clear();
  editor.render();
  refreshDoc();
  toast(n === 1 ? 'העמוד נמחק.' : `${n} עמודים נמחקו.`, { action: { label: 'ביטול', fn: undo } });
}

async function extractSelected() {
  const D = S.doc;
  const pages = D.pages.filter((p) => editor.selected.has(p.key));
  busy(true, 'מכין את הקובץ…');
  let bytes;
  try {
    bytes = await buildBytes({ pages });
  } catch (err) {
    console.error(err);
    toast('יצירת הקובץ נכשלה.', { error: true });
    return;
  } finally {
    busy(false);
  }
  await deliverFiles([{ name: `${D.name} - עמודים נבחרים.pdf`, bytes }], pages.length === 1 ? 'עמוד אחד לקובץ נפרד' : `${pages.length} עמודים לקובץ נפרד`);
}

/** פיצול: כל עמוד / כל N עמודים / לפי טווחים — כמו בדסקטופ */
async function splitDialog() {
  const D = S.doc;
  const n = D.pages.length;
  if (n < 2) { toast('במסמך יש עמוד אחד בלבד.', { error: true }); return; }
  const st = { mode: 'each', every: 2, ranges: '' };
  const groupsFor = () => {
    if (st.mode === 'each') return Ops.chunk(n, 1);
    if (st.mode === 'every') return Ops.chunk(n, st.every || 1);
    return Ops.parseRanges(st.ranges, n);
  };
  const groups = await new Promise((resolve) => {
    let done = false;
    const s = openSheet(`
      <h2>פיצול המסמך</h2>
      <p>במסמך ${n} עמודים. איך לחלק אותו?</p>
      <div class="seg" role="radiogroup">
        <button data-mode="each" aria-pressed="true">כל עמוד</button>
        <button data-mode="every" aria-pressed="false">כל כמה עמודים</button>
        <button data-mode="ranges" aria-pressed="false">לפי טווחים</button>
      </div>
      <input class="field" data-f="every" type="number" inputmode="numeric" min="1" max="${n}" value="2" hidden>
      <input class="field" data-f="ranges" type="text" placeholder="לדוגמה: 1-3, 4-6, 7-" dir="ltr" hidden>
      <p class="hint"></p>
      <div class="actions">
        <button class="btn" data-go>פיצול</button>
        <button class="btn quiet" data-cancel>ביטול</button>
      </div>`, { onClose: () => { if (!done) resolve(null); } });
    const w = s.wrap;
    const every = w.querySelector('[data-f="every"]');
    const ranges = w.querySelector('[data-f="ranges"]');
    const hint = w.querySelector('.hint');
    const go = w.querySelector('[data-go]');
    const update = () => {
      every.hidden = st.mode !== 'every';
      ranges.hidden = st.mode !== 'ranges';
      w.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode)));
      st.every = parseInt(every.value, 10);
      st.ranges = ranges.value;
      let g = null, err = '';
      try { g = groupsFor(); } catch (e) { err = e.message; }
      if (st.mode === 'ranges' && !st.ranges.trim()) { g = null; err = ''; }
      hint.classList.toggle('err', !!err);
      hint.textContent = err || (g ? `ייווצרו ${g.length === 1 ? 'קובץ אחד' : `${g.length} קבצים`}, בשמות כמו "${iso(`${D.name} - חלק 1`)}".` : 'הקלידו טווחי עמודים.');
      go.disabled = !g || g.length < 1;
      return g;
    };
    w.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      st.mode = b.dataset.mode;
      update();
      const f = st.mode === 'every' ? every : st.mode === 'ranges' ? ranges : null;
      if (f) setTimeout(() => f.focus(), 30);
    }));
    every.addEventListener('input', update);
    ranges.addEventListener('input', update);
    go.addEventListener('click', () => { const g = update(); if (!g) return; done = true; resolve(g); s.close(); });
    w.querySelector('[data-cancel]').addEventListener('click', () => s.close());
    update();
  });
  if (!groups) return;
  busy(true, 'מפצל…');
  let files;
  try {
    const full = await buildBytes({ protect: false });
    const parts = await Ops.splitDocument(full, groups);
    files = [];
    for (let i = 0; i < parts.length; i++) files.push({ name: `${D.name} - חלק ${i + 1}.pdf`, bytes: await D.protect(parts[i]) });
  } catch (err) {
    console.error(err);
    toast('הפיצול נכשל.', { error: true });
    return;
  } finally {
    busy(false);
  }
  await deliverFiles(files, files.length === 1 ? 'קובץ אחד מוכן' : `${files.length} קבצים מוכנים`);
}

/* ---------- מספר עמוד ---------- */

let pillTimer = 0;
function showPagePill(i, n) {
  const pill = $('#page-pill');
  pill.textContent = `עמוד ${i + 1} מתוך ${n}`;
  pill.classList.remove('faded');
  clearTimeout(pillTimer);
  pillTimer = setTimeout(() => pill.classList.add('faded'), 1800);
}

async function goToPagePrompt() {
  const n = viewer.pageCount;
  if (!n) return;
  const v = await prompt({ title: 'מעבר לעמוד', text: `בין 1 ל-${n}`, type: 'number', inputmode: 'numeric', value: String(viewer.current + 1), ok: 'מעבר' });
  const k = parseInt(v, 10);
  if (k >= 1 && k <= n) viewer.goTo(k - 1);
}

/* ---------- אודות ---------- */

function about() {
  const b = window.BUILD_INFO || {};
  openSheet(`
    <img class="about-logo" src="img/logo.png" alt="">
    <h2 style="text-align:center">איתן<span style="color:var(--gold-deep)">PDF</span> לאנדרואיד</h2>
    <p style="text-align:center">עבודה עם PDF בעברית, חינם. הקבצים נשארים בטלפון ולא נשלחים לשום מקום.</p>
    <p class="about-meta">${esc(b.version || '')}${b.commit ? ' · ' + esc(b.commit) : ''}</p>`);
}

/* ---------- אירועים ---------- */

$('#btn-open').addEventListener('click', chooseAndOpen);
$('#btn-about').addEventListener('click', about);
$('#btn-close').addEventListener('click', requestClose);
$('#page-pill').addEventListener('click', goToPagePrompt);
$('#btn-menu').addEventListener('click', async () => {
  const choice = await menu([
    { id: 'open', label: 'פתיחת קובץ אחר', icon: ICON.open },
    { id: 'goto', label: 'מעבר לעמוד', icon: ICON.page },
    { id: 'saveas', label: 'שמירה בשם…', icon: ICON.saveAs },
    { id: 'about', label: 'אודות', icon: ICON.info },
  ]);
  if (choice === 'open') chooseAndOpen();
  else if (choice === 'goto') goToPagePrompt();
  else if (choice === 'saveas') saveAsNew();
  else if (choice === 'about') about();
});

$('#tb-pages').addEventListener('click', openPages);
$('#tb-add').addEventListener('click', pickAndAdd);
$('#tb-share').addEventListener('click', shareDoc);
$('#tb-save').addEventListener('click', saveMenu);

$('#btn-pages-done').addEventListener('click', closePages);
$('#btn-undo').addEventListener('click', undo);
$('#pg-add').addEventListener('click', pickAndAdd);
$('#pg-split').addEventListener('click', splitDialog);
$('#pg-all').addEventListener('click', () => editor.selectAll(true));
$('#pg-rotate').addEventListener('click', rotateSelected);
$('#pg-delete').addEventListener('click', deleteSelected);
$('#pg-extract').addEventListener('click', extractSelected);
$('#pg-clear').addEventListener('click', () => editor.selectAll(false));

// קבצים מ"פתח באמצעות" ו"שתף"
let incoming = false;
onReceivedFiles(
  () => { if (!incoming) { incoming = true; busy(true, 'מקבל את הקובץ…'); } },
  async (files) => {
    if (incoming) { incoming = false; busy(false); }
    while (closeTopSheet()) { /* סוגרים חלונות פתוחים */ }
    if (S.doc) {
      const c = await choose(files.length === 1 ? 'התקבל קובץ' : `התקבלו ${files.length} קבצים`, `המסמך "${iso(S.doc.name)}" כבר פתוח.`, [
        { id: 'add', label: 'הוספה לסוף המסמך הפתוח', primary: true },
        { id: 'open', label: 'פתיחה במקומו' },
        { id: 'cancel', label: 'ביטול' },
      ]);
      if (c === 'add') return addFiles(files);
      if (c !== 'open') return;
      if (S.doc.dirty && !(await confirmDiscard())) return;
    }
    await openFiles(files);
  },
  (err) => {
    if (incoming) { incoming = false; busy(false); }
    console.error(err);
    toast('לא הצלחנו לקבל את הקובץ מהאפליקציה האחרת.', { error: true });
  },
);

// כפתור "חזרה" של אנדרואיד
if (isNative) {
  App.addListener('backButton', () => {
    if (closeTopSheet()) return;
    if (S.screen === 'pages') {
      if (editor.selected.size) editor.selectAll(false); else closePages();
      return;
    }
    if (S.screen === 'viewer') { requestClose(); return; }
    App.exitApp();
  });
}

showScreen('home');
