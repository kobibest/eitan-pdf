// איתןPDF לאנדרואיד — ממשק
import { $, toast, busy, prompt, menu, choose, openSheet, closeTopSheet, esc, iso } from './js/ui.js';
import { isNative, App, pickPdfs, onReceivedFiles, writeOver, saveAs, saveToFolder, share, readAsset, pickImages, takePhoto } from './js/native.js';
import { Viewer } from './js/viewer.js';
import { PagesEditor } from './js/pages.js';
import { Annotator } from './js/annotate.js';
import { drawSignature, savedSignatures, forgetSignature, imageRatio, closeSignaturePad, INK_COLORS } from './js/signature.js';
import { chooseCert, openCert, certLine, signatureRow, heavy } from './js/digital.js';
import { Doc, loadSource, baseName } from './js/doc.js';

const Ops = window.PdfOps;

const ICON = {
  open: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  page: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h6M9 16h4"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/></svg>',
  saveAs: '<svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v6M5 3v18h7"/><path d="M8 3v5h7V3M15 15l3 3 3-3M18 18v-7"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
  add: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M12.5 10.5v7M9 14h7"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13l3 3 3-3"/></svg>',
};

/* ---------- מצב ---------- */

const S = {
  doc: null,     // Doc — המסמך הפתוח
  fonts: null,   // Alef, כמו בדסקטופ
  screen: 'home',
  digi: { cert: null, reason: '', location: '' }, // חתימה דיגיטלית: התעודה שנבחרה ופרטי החתימה
};

const viewer = new Viewer($('#scroller'), $('#pages'), { onPageChange: showPagePill });
const editor = new PagesEditor($('#grid-scroller'), $('#grid'), {
  onSelection: updatePagesToolbar,
  onReorder: (keys) => { if (S.doc.reorder(keys)) { editor.render(); refreshDoc(); } },
});

const annot = new Annotator(viewer, {
  onChange: (e) => {
    refreshDoc();
    if (e && e.removed) toast('נמחק.', { action: { label: 'ביטול', fn: undo } });
  },
  onEditText: (it) => editText(it),
  onField: (srcId, field) => fillField(srcId, field),
  digiInfo: () => ({ signer: S.digi.cert && S.digi.cert.name, date: todayStr(), reason: S.digi.reason, location: S.digi.location }),
});

/** פתיחה מחדש של הצפייה (אחרי שינוי בעמודים) עם השכבה של החותמות והשדות */
async function showDoc(opts) {
  await viewer.open(S.doc.refs(), opts);
  await annot.attach(S.doc);
}

const todayStr = () => new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });

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
  $('#btn-undo-view').hidden = !D.history.length;
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
  try { await showDoc(); } finally { busy(false); }
  D.existingSignatures().then((sigs) => {
    if (S.doc !== D || !sigs.length) return;
    const bad = sigs.some((x) => !x.intact);
    toast(bad ? 'במסמך יש חתימה דיגיטלית לא תקינה. פרטים בכלים ← חתימה דיגיטלית.' : `במסמך ${sigs.length === 1 ? 'חתימה דיגיטלית תקינה' : `${sigs.length} חתימות דיגיטליות`}. שינוי במסמך יבטל ${sigs.length === 1 ? 'אותה' : 'אותן'}.`, { error: bad, ms: 5000 });
  });
  const nFields = annot.allFields().length;
  if (nFields) toast(`בקובץ יש ${nFields === 1 ? 'שדה טופס אחד' : `${nFields} שדות טופס`} (מסומנים בכחול). הקישו על שדה כדי למלא.`, { ms: 5000 });
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
  else await showDoc({ page: before, keepScale: true });
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
  annot.selected = null;
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

/** לפני שמירה שכותבת את הקובץ מחדש: אזהרה אם זה יבטל חתימות דיגיטליות (כמו בדסקטופ) */
async function confirmBreakSignatures() {
  const n = (await S.doc.existingSignatures()).length;
  if (!n) return true;
  const c = await choose('המסמך חתום דיגיטלית',
    `במסמך יש ${n === 1 ? 'חתימה דיגיטלית' : `${n} חתימות דיגיטליות`}. שמירת השינויים תבטל ${n === 1 ? 'אותה' : 'אותן'}: מי שיפתח את הקובץ יראה שהחתימה לא תקפה. כדי להוסיף חתימה משלכם בלי לבטל את הקיימות, השתמשו ב"חתימה דיגיטלית" בכלים, בלי לשנות את המסמך.`, [
      { id: 'save', label: 'לשמור בכל זאת', primary: true },
      { id: 'cancel', label: 'ביטול' },
    ]);
  return c === 'save';
}

/** תפריט השמירה. מחזיר true אם נשמר */
async function saveMenu() {
  const D = S.doc;
  if (D.dirty && !(await confirmBreakSignatures())) return false;
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
  await showDoc({ page, keepScale: true });
}

function updatePagesToolbar(count) {
  $('#tb-none').hidden = count > 0;
  $('#tb-sel').hidden = count === 0;
  $('#sel-count').textContent = count === 1 ? 'נבחר 1 ✕' : `נבחרו ${count} ✕`;
  $('#pages-sub').textContent = count ? (count === 1 ? 'נבחר עמוד אחד' : `נבחרו ${count} עמודים`) : 'לחיצה ארוכה וגרירה לסידור · הקשה לבחירה';
}

function undo() {
  if (!S.doc) return;
  const sig = (D) => D.pages.map((p) => p.key + '/' + p.rotate).join(',');
  const before = sig(S.doc);
  if (!S.doc.undo()) return;
  refreshDoc();
  if (S.screen === 'pages') editor.render();
  else if (sig(S.doc) === before) {
    // רק חותמות / שדות השתנו — אין צורך לצייר את העמודים מחדש
    annot.selected = null;
    annot.renderAll();
  } else {
    const c = viewer.visibleCenter();
    showDoc({ page: viewer.current, keepScale: true }).then(() => viewer.centerOn(c.i, c.x, c.y));
  }
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

/* ---------- חתימה, טקסט ותאריך ---------- */

let stampSeq = 1;

/** הצבת חותמת במרכז המסך (בעמוד שרואים) ובחירתה, כדי שאפשר יהיה לגרור אותה מיד */
function placeStamp(item) {
  const c = viewer.visibleCenter();
  const sz = viewer.sizes[c.i];
  const hgt = item.h != null ? item.h : item.size * 1.25;
  item.id = 'm' + Date.now().toString(36) + (stampSeq++);
  item.x = Math.max(0, Math.min(sz.w - item.w, c.x - item.w / 2));
  item.y = Math.max(0, Math.min(sz.h - hgt, c.y - hgt / 2));
  // לא על גבי חותמת קיימת: יורדים מתחתיה (או עולים, אם אין מקום למטה)
  const key = S.doc.pages[c.i].key;
  const others = (S.doc.stamps[key] || []).map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h != null ? o.h : o.size * 1.25 * String(o.text || '').split('\n').length }));
  const blocking = () => others.filter((o) => item.x < o.x + o.w && item.x + item.w > o.x && item.y < o.y + o.h && item.y + hgt > o.y);
  for (let k = 0; k < 40; k++) {
    const b = blocking();
    if (!b.length) break;
    const below = Math.max(...b.map((o) => o.y + o.h)) + 6;
    if (below + hgt <= sz.h) item.y = below;
    else if (item.y > 0) item.y = Math.max(0, Math.min(...b.map((o) => o.y)) - hgt - 6);
    else break;
  }
  S.doc.addStamp(key, item);
  annot.selected = item.id;
  annot.renderAll();
  refreshDoc();
}

async function signFlow() {
  if (!S.doc) return;
  let data = null;
  const list = await savedSignatures();
  if (list.length) {
    data = await new Promise((resolve) => {
      let done = false;
      const s = openSheet(`
        <h2>חתימה</h2>
        <p>בחרו חתימה שמורה, או חתמו מחדש.</p>
        <div class="sig-list">${list.map((d, i) => `
          <div class="sig-opt" role="button" data-i="${i}"><img src="${esc(d)}" alt="חתימה ${i + 1}">
            <button class="sig-forget" data-forget="${i}" aria-label="מחיקת החתימה מהרשימה"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          </div>`).join('')}</div>
        <button class="btn sig-new" data-new>חתימה חדשה</button>`, { onClose: () => { if (!done) resolve(null); } });
      s.wrap.querySelectorAll('.sig-opt').forEach((el) => el.addEventListener('click', (e) => {
        if (e.target.closest('[data-forget]')) return;
        done = true;
        resolve(list[+el.dataset.i]);
        s.close();
      }));
      s.wrap.querySelectorAll('[data-forget]').forEach((b) => b.addEventListener('click', async (e) => {
        e.stopPropagation();
        await forgetSignature(list[+b.dataset.forget]);
        b.closest('.sig-opt').remove();
        toast('החתימה הוסרה מהרשימה.');
      }));
      s.wrap.querySelector('[data-new]').addEventListener('click', () => { done = true; resolve('new'); s.close(); });
    });
    if (!data) return;
  }
  if (!data || data === 'new') data = await drawSignature();
  if (!data) return;
  const ratio = await imageRatio(data);
  const w = 150;
  placeStamp({ type: 'image', image: data, w, h: w * ratio });
  toast('גררו את החתימה למקום. הפינה הלבנה משנה את הגודל.');
}

/** מדידת רוחב טקסט בגופן Alef — כדי שהתיבה תהיה ברוחב הטקסט ולא תישבר אחרת מאשר בשמירה */
async function textWidth(text, size, bold) {
  await document.fonts.load(`${bold ? 700 : 400} ${size}px Alef`);
  const ctx = (textWidth.c = textWidth.c || document.createElement('canvas')).getContext('2d');
  ctx.font = `${bold ? 700 : 400} ${size}px Alef`;
  return Math.max(...String(text).split('\n').map((l) => ctx.measureText(l).width));
}

async function fitTextBox(item, pageW) {
  const w = Math.ceil(await textWidth(item.text, item.size, item.bold)) + 4;
  item.w = Math.max(12, Math.min(pageW, w));
  // תיבה רחבה מהעמוד — מצמידים לשוליים
  if (item.x + item.w > pageW) item.x = Math.max(0, pageW - item.w);
}

const TEXT_SIZES = [{ v: 10, l: 'קטן' }, { v: 14, l: 'רגיל' }, { v: 18, l: 'גדול' }, { v: 26, l: 'כותרת' }];

/** עורך טקסט (חדש או קיים) בגיליון תחתון */
function textSheet(init) {
  return new Promise((resolve) => {
    const st = { size: init.size, color: init.color, bold: !!init.bold };
    let done = false;
    const s = openSheet(`
      <h2>${init.isNew ? 'טקסט חדש' : 'עריכת טקסט'}</h2>
      <textarea class="field" dir="auto" placeholder="הקלידו כאן"></textarea>
      <div class="seg" data-sizes>${TEXT_SIZES.map((x) => `<button data-size="${x.v}" aria-pressed="${x.v === st.size}">${x.l}</button>`).join('')}</div>
      <div class="opts">
        <div class="inks">${INK_COLORS.map((c) => `<button class="ink" data-c="${c.hex}" aria-label="${c.name}" aria-pressed="${c.hex === st.color}" style="--c:${c.hex}"></button>`).join('')}</div>
        <span class="spacer" style="flex:1"></span>
        <button class="chip-bold" data-bold aria-pressed="${st.bold}" aria-label="מודגש">B</button>
      </div>
      <div class="actions">
        <button class="btn" data-ok>${init.isNew ? 'הוספה' : 'אישור'}</button>
        <button class="btn quiet" data-cancel>ביטול</button>
      </div>`, { onClose: () => { if (!done) resolve(null); } });
    const w = s.wrap;
    const ta = w.querySelector('textarea');
    ta.value = init.text || '';
    if (!TEXT_SIZES.some((x) => x.v === st.size)) w.querySelector('[data-sizes]').hidden = true;
    w.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => {
      st.size = +b.dataset.size;
      w.querySelectorAll('[data-size]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    w.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
      st.color = b.dataset.c;
      w.querySelectorAll('[data-c]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    const bold = w.querySelector('[data-bold]');
    bold.addEventListener('click', () => { st.bold = !st.bold; bold.setAttribute('aria-pressed', String(st.bold)); });
    w.querySelector('[data-ok]').addEventListener('click', () => {
      done = true;
      resolve({ text: ta.value.replace(/\s+$/, ''), size: st.size, color: st.color, bold: st.bold });
      s.close();
    });
    w.querySelector('[data-cancel]').addEventListener('click', () => s.close());
    setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 80);
  });
}

async function addText() {
  if (!S.doc) return;
  const r = await textSheet({ isNew: true, text: '', size: 14, color: INK_COLORS[0].hex, bold: false });
  if (!r || !r.text.trim()) return;
  const item = { type: 'text', align: 'right', ...r, x: 0, w: 0 };
  item.w = Math.ceil(await textWidth(item.text, item.size, item.bold)) + 4;
  item.w = Math.min(item.w, viewer.sizes[viewer.visibleCenter().i].w);
  placeStamp(item);
}

async function addDate() {
  if (!S.doc) return;
  const item = { type: 'text', align: 'right', text: todayStr(), size: 14, color: INK_COLORS[0].hex, bold: false };
  item.w = Math.ceil(await textWidth(item.text, item.size, false)) + 4;
  placeStamp(item);
  toast('גררו את התאריך למקום. הקשה עליו פותחת עריכה.');
}

async function editText(it) {
  const r = await textSheet({ ...it, isNew: false });
  if (!r) return;
  if (!r.text.trim()) { annot.remove(it.id); return; }
  const f = S.doc.findStamp(it.id);
  if (!f) return;
  const i = S.doc.pages.findIndex((p) => p.key === f.key);
  const patch = { ...r };
  const tmp = { ...it, ...patch };
  await fitTextBox(tmp, viewer.sizes[i].w);
  S.doc.updateStamp(it.id, { ...patch, w: tmp.w, x: tmp.x });
  annot.renderAll();
  refreshDoc();
}

/* ---------- כלים: סימן מים, מספרי עמודים, השחרה, תמונות ---------- */

const TOOL_ICON = {
  wm: '<svg viewBox="0 0 24 24"><path d="M5 19L19 5"/><path d="M8 5h11v11" opacity=".35"/><path d="M5 8v11h11" opacity=".35"/></svg>',
  pn: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18H6z"/><path d="M10 17h4M12 15v4" /></svg>',
  redact: '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="8" rx="1" fill="currentColor"/><path d="M3 5h8M3 19h12"/></svg>',
  img: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 9"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  cert: '<svg viewBox="0 0 24 24"><path d="M5 3h10l4 4v8"/><path d="M5 3v18h7"/><circle cx="17" cy="17" r="3"/><path d="M15.5 19.5L15 23l2-1 2 1-.5-3.5"/></svg>',
};

async function toolsSheet() {
  if (!S.doc) return;
  const ex = S.doc.extras;
  const choice = await new Promise((resolve) => {
    let done = false;
    const card = (id, icon, title, sub) => `<button class="tool-card" data-t="${id}">${icon}<b>${title}</b><small>${sub}</small></button>`;
    const s = openSheet(`
      <h2>כלים</h2>
      <div class="tools-grid">
        ${card('wm', TOOL_ICON.wm, 'סימן מים', ex.watermark.enabled ? `<span class="on">פעיל:</span> ${esc(ex.watermark.text)}` : 'טקסט שקוף באלכסון')}
        ${card('pn', TOOL_ICON.pn, 'מספרי עמודים', ex.pageNumbers.enabled ? '<span class="on">פעיל</span>' : 'בתחתית או בראש כל עמוד')}
        ${card('digital', TOOL_ICON.cert, 'חתימה דיגיטלית', 'עם תעודה (‎.pfx) — מוכיחה מי חתם')}
        ${card('redact', TOOL_ICON.redact, 'השחרה', 'מוחקת לצמיתות את מה שמתחת')}
        ${card('img', TOOL_ICON.img, 'תמונות מהגלריה', 'כעמודים בסוף המסמך')}
        ${card('cam', TOOL_ICON.cam, 'צילום עמוד', 'במצלמה, כעמוד בסוף המסמך')}
      </div>`, { onClose: () => { if (!done) resolve(null); } });
    s.wrap.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { done = true; resolve(b.dataset.t); s.close(); }));
  });
  if (choice === 'wm') watermarkSheet();
  else if (choice === 'pn') pageNumbersSheet();
  else if (choice === 'digital') digitalSheet();
  else if (choice === 'redact') addRedaction();
  else if (choice === 'img') addImages('gallery');
  else if (choice === 'cam') addImages('camera');
}

/** רענון התצוגה המקדימה אחרי שינוי בהגדרות */
function extrasChanged() {
  annot.renderAll();
  refreshDoc();
}

function watermarkSheet() {
  const D = S.doc;
  const wm = { ...D.extras.watermark };
  if (!wm.enabled) wm.enabled = true;
  const s = openSheet(`
    <h2>סימן מים</h2>
    <label class="switch-row"><span>להוסיף סימן מים לכל העמודים</span><input type="checkbox" data-on ${wm.enabled ? 'checked' : ''}></label>
    <label class="lbl">טקסט</label>
    <input class="field" dir="auto" data-text>
    <label class="lbl">שקיפות</label>
    <div class="seg" data-op>${[[0.08, 'עדינה מאוד'], [0.16, 'עדינה'], [0.3, 'בינונית'], [0.5, 'בולטת']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${wm.opacity === v}">${l}</button>`).join('')}</div>
    <label class="lbl">גודל</label>
    <div class="seg" data-sz>${[[40, 'קטן'], [64, 'רגיל'], [96, 'גדול']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${wm.size === v}">${l}</button>`).join('')}</div>
    <div class="opts"><div class="inks">${[['#C23A2E', 'אדום'], ['#1F35B5', 'כחול'], ['#5D6B72', 'אפור']].map(([c, n]) => `<button class="ink" data-c="${c}" aria-label="${n}" aria-pressed="${wm.color === c}" style="--c:${c}"></button>`).join('')}</div></div>
    <div class="actions"><button class="btn" data-ok>אישור</button></div>`);
  const w = s.wrap;
  const text = w.querySelector('[data-text]');
  text.value = wm.text;
  // כל שינוי מוצג מיד על העמוד שמאחורי הגיליון
  let first = true;
  const apply = () => {
    const patch = { enabled: w.querySelector('[data-on]').checked, text: text.value };
    if (first) { D.setExtras('watermark', { ...wm, ...patch }); first = false; } else { Object.assign(D.extras.watermark, wm, patch); D.dirty = true; }
    extrasChanged();
  };
  const seg = (sel, key, num) => w.querySelectorAll(`${sel} [data-v]`).forEach((b) => b.addEventListener('click', () => {
    wm[key] = num ? +b.dataset.v : b.dataset.v;
    w.querySelectorAll(`${sel} [data-v]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    apply();
  }));
  seg('[data-op]', 'opacity', true);
  seg('[data-sz]', 'size', true);
  w.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
    wm.color = b.dataset.c;
    w.querySelectorAll('[data-c]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    apply();
  }));
  w.querySelector('[data-on]').addEventListener('change', apply);
  text.addEventListener('input', apply);
  w.querySelector('[data-ok]').addEventListener('click', () => s.close());
  apply();
}

function pageNumbersSheet() {
  const D = S.doc;
  const pn = { ...D.extras.pageNumbers };
  if (!pn.enabled) pn.enabled = true;
  const formats = ['עמוד {n} מתוך {total}', 'עמוד {n}', '{n}', '- {n} -', '{n}/{total}'];
  const positions = [['bottom-center', 'למטה באמצע'], ['bottom-right', 'למטה מימין'], ['bottom-left', 'למטה משמאל'], ['top-center', 'למעלה באמצע'], ['top-right', 'למעלה מימין'], ['top-left', 'למעלה משמאל']];
  const s = openSheet(`
    <h2>מספרי עמודים</h2>
    <label class="switch-row"><span>להוסיף מספרים לעמודים</span><input type="checkbox" data-on ${pn.enabled ? 'checked' : ''}></label>
    <label class="lbl">נוסח</label>
    <select class="field" data-f="format">${formats.map((f) => `<option value="${esc(f)}" ${pn.format === f ? 'selected' : ''}>${esc(f.replace('{n}', '3').replace('{total}', '12'))}</option>`).join('')}</select>
    <label class="lbl">מיקום</label>
    <select class="field" data-f="position">${positions.map(([v, l]) => `<option value="${v}" ${pn.position === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <label class="switch-row"><span>בלי מספר בעמוד הראשון (שער)</span><input type="checkbox" data-skip ${pn.skipFirst ? 'checked' : ''}></label>
    <div class="actions"><button class="btn" data-ok>אישור</button></div>`);
  const w = s.wrap;
  let first = true;
  const apply = () => {
    Object.assign(pn, {
      enabled: w.querySelector('[data-on]').checked,
      format: w.querySelector('[data-f="format"]').value,
      position: w.querySelector('[data-f="position"]').value,
      skipFirst: w.querySelector('[data-skip]').checked,
    });
    if (first) { D.setExtras('pageNumbers', pn); first = false; } else { Object.assign(D.extras.pageNumbers, pn); D.dirty = true; }
    extrasChanged();
  };
  w.querySelectorAll('input, select').forEach((el) => el.addEventListener('change', apply));
  w.querySelector('[data-ok]').addEventListener('click', () => s.close());
  apply();
}

function addRedaction() {
  placeStamp({ type: 'redact', w: 160, h: 36 });
  toast('גררו את המלבן על מה שצריך להימחק, והגדילו מהפינה. התוכן מתחתיו יימחק לצמיתות בשמירה.', { ms: 5000 });
}

/** תמונות → עמודים: מהגלריה (כמה) או מצלמה (עמוד אחרי עמוד). target: 'add' למסמך הפתוח, 'new' למסמך חדש */
async function collectImages(mode) {
  const images = [];
  try {
    if (mode === 'gallery') {
      busy(true, 'מכין את התמונות…');
      try { images.push(...await pickImages()); } finally { busy(false); }
    } else {
      for (;;) {
        const img = await takePhoto();
        if (!img) break;
        images.push(img);
        const c = await choose(images.length === 1 ? 'צולם עמוד אחד' : `צולמו ${images.length} עמודים`, '', [
          { id: 'more', label: 'צילום עמוד נוסף', primary: true },
          { id: 'done', label: 'סיום' },
        ]);
        if (c !== 'more') break;
      }
    }
  } catch (err) {
    console.error(err);
    if (!/cancel/i.test(String(err && err.message))) toast(err && err.code === 'NO_CAMERA' ? 'לא נמצאה אפליקציית מצלמה במכשיר.' : 'קריאת התמונה נכשלה.', { error: true });
  }
  return images;
}

async function imagesToSource(images, name) {
  const bytes = new Uint8Array(await Ops.imagesToPdf(images, {}));
  return { name, bytes, uri: null, writable: false };
}

async function addImages(mode) {
  const images = await collectImages(mode);
  if (!images.length) return;
  busy(true, 'יוצר עמודים…');
  let file;
  try { file = await imagesToSource(images, 'תמונות.pdf'); } catch (err) { console.error(err); toast('יצירת העמודים נכשלה.', { error: true }); return; } finally { busy(false); }
  await addFiles([file]);
}

async function imagesToNewDoc(mode) {
  if (S.doc && S.doc.dirty && !(await confirmDiscard())) return;
  const images = await collectImages(mode);
  if (!images.length) return;
  busy(true, 'יוצר PDF…');
  let file;
  const stamp = new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\./g, '-');
  try { file = await imagesToSource(images, `${mode === 'camera' ? 'סריקה' : 'תמונות'} ${stamp}.pdf`); } catch (err) { console.error(err); toast('יצירת ה-PDF נכשלה.', { error: true }); return; } finally { busy(false); }
  await openFiles([file]);
  if (S.doc) { S.doc.dirty = true; refreshDoc(); }
}

/* ---------- חתימה דיגיטלית עם תעודה ---------- */

async function digitalSheet() {
  const D = S.doc;
  const sigs = await D.existingSignatures();
  const placed = D.findDigiSig();
  const hasDrawn = (await savedSignatures()).length > 0;
  const c = S.digi.cert;
  const s = openSheet(`
    <h2>חתימה דיגיטלית</h2>
    <p>חתימה עם תעודה דיגיטלית מוכיחה מי חתם ושהמסמך לא שונה אחרי החתימה. זה שונה מחתימה מצוירת.</p>
    ${sigs.length ? '<div class="sub-h">חתימות במסמך</div><div data-sigs></div>' : ''}
    <div class="sub-h">תעודה</div>
    ${c ? `<div class="cert-row chosen" data-cert role="button"><div><b dir="auto">${esc(c.name)}</b><small>${esc(certLine(c))}</small></div><small>החלפה</small></div>`
        : '<button class="btn quiet" data-cert>בחירת תעודה…</button>'}
    <label class="lbl">סיבת החתימה (רשות)</label>
    <input class="field" dir="auto" data-d="reason">
    <label class="lbl">מקום (רשות)</label>
    <input class="field" dir="auto" data-d="location" placeholder="למשל: תל אביב">
    <div class="sub-h">מראה בעמוד</div>
    <button class="btn quiet" data-place>${placed ? `החתימה בעמוד ${placed.pageIndex + 1} · הצבה מחדש` : 'הצבת החתימה בעמוד'}</button>
    ${placed && hasDrawn ? `<label class="check-row"><input type="checkbox" data-img ${placed.item.image ? 'checked' : ''}><span>עם תמונת החתימה שלי</span></label>` : ''}
    ${placed ? '<button class="btn quiet" data-unplace>הסרת המיקום (חתימה בלתי נראית)</button>' : '<p class="hint">בלי הצבה, החתימה בלתי נראית בעמוד, אבל קיימת בקובץ.</p>'}
    <div class="actions col" style="margin-top:14px"><button class="btn" data-sign>חתימה ושמירה…</button></div>
    <p class="hint">החתימה היא הפעולה האחרונה: היא נשמרת לקובץ חדש, וכל שינוי אחריה יבטל אותה. אין חותמת זמן מאושרת (נדרש חיבור לאינטרנט).</p>`);
  const w = s.wrap;
  const list = w.querySelector('[data-sigs]');
  if (list) sigs.forEach((x) => list.append(signatureRow(x)));
  w.querySelectorAll('[data-d]').forEach((inp) => {
    inp.value = S.digi[inp.dataset.d] || '';
    inp.addEventListener('input', () => { S.digi[inp.dataset.d] = inp.value; annot.renderAll(); });
  });
  w.querySelector('[data-cert]').addEventListener('click', async () => {
    const chosen = await chooseCert();
    if (chosen) { S.digi.cert = chosen; annot.renderAll(); }
    s.close();
    digitalSheet();
  });
  w.querySelector('[data-place]').addEventListener('click', async () => {
    s.close();
    await placeDigiSig();
  });
  const img = w.querySelector('[data-img]');
  if (img) img.addEventListener('change', async () => {
    const drawn = (await savedSignatures())[0] || null;
    D.updateStamp(placed.item.id, { image: img.checked ? drawn : null });
    annot.renderAll();
    refreshDoc();
  });
  const un = w.querySelector('[data-unplace]');
  if (un) un.addEventListener('click', () => { annot.remove(placed.item.id); s.close(); digitalSheet(); });
  w.querySelector('[data-sign]').addEventListener('click', () => { s.close(); digitalSignAndSave(); });
}

/** מסגרת החתימה הגלויה במרכז המסך — אחת בלבד במסמך */
async function placeDigiSig() {
  const D = S.doc;
  const prev = D.findDigiSig();
  const image = prev ? prev.item.image : ((await savedSignatures())[0] || null);
  if (prev) D.removeStamp(prev.item.id);
  placeStamp({ type: 'digisig', w: 210, h: 62, image });
  toast('גררו את מסגרת החתימה למקום. הפינה משנה את הגודל. החתימה תיווצר ב"חתימה ושמירה".', { ms: 5000 });
}

async function digitalSignAndSave() {
  const D = S.doc;
  if (!D || !window.DigiSig) return;
  if (D.security && (D.security.password || D.security.permissions)) {
    const c = await choose('חתימה דיגיטלית והגנה בסיסמה',
      'אי אפשר לשמור באותו קובץ גם חתימה דיגיטלית וגם סיסמה או הגבלות: ההצפנה אחרי החתימה מבטלת אותה. אפשר לחתום ולשמור בלי הגנה, ולשלוח את הקובץ בדרך מאובטחת.', [
        { id: 'go', label: 'חתימה בלי הגנה', primary: true },
        { id: 'cancel', label: 'ביטול' },
      ]);
    if (c !== 'go') return;
    D.security = null;
  }
  if (!S.digi.cert) {
    const chosen = await chooseCert();
    if (!chosen) return;
    S.digi.cert = chosen;
    annot.renderAll();
  }
  // הסיסמה נשאלת בכל חתימה
  let cert;
  for (let wrong = false; ;) {
    const pw = await prompt({ title: wrong ? 'הסיסמה שגויה' : 'סיסמת התעודה', text: wrong ? 'נסו שוב.' : `כדי לחתום בשם "${iso(S.digi.cert.name)}".`, type: 'password', ok: 'חתימה' });
    if (pw == null) return;
    try { cert = openCert(S.digi.cert, pw); cert.password = pw; break; } catch (err) {
      if (/סיסמה/.test(err.message)) { wrong = true; continue; }
      toast(err.message, { error: true });
      return;
    }
  }
  const original = D.canSignOriginal();
  if (!original && !(await confirmBreakSignatures())) return;
  const placed = D.findDigiSig();
  let signed;
  try {
    const f = await fonts();
    signed = await heavy('חותם…', async () => {
      const bytes = original ? original.bytes : await D.build(f, { protect: false });
      const when = new Date();
      const date = when.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + when.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      const DS = window.DigiSig;
      return DS.signPdf(bytes, DS.p12Signer(cert.bytes, cert.password), {
        pageIndex: placed ? placed.pageIndex : 0,
        rect: placed ? { x: placed.item.x, y: placed.item.y, w: placed.item.w, h: placed.item.h } : null,
        name: cert.info.name,
        reason: S.digi.reason,
        location: S.digi.location,
        signingTime: when,
        appearance: placed ? { fonts: f, signer: cert.info.name, date, reason: S.digi.reason, location: S.digi.location, image: placed.item.image || null, color: '#1F35B5' } : null,
      });
    });
  } catch (err) {
    console.error(err);
    toast('החתימה נכשלה: ' + (err.message || err), { error: true });
    return;
  }
  let res;
  try { res = await saveAs(`${D.name} - חתום.pdf`, signed); } catch (err) { console.error(err); toast('השמירה נכשלה.', { error: true }); return; }
  if (!res) { toast('החתימה בוטלה: הקובץ החתום לא נשמר.'); return; }
  // פותחים את הקובץ החתום, כדי שכל שינוי נוסף יציג אזהרה על ביטול החתימה
  D.dirty = false;
  await openFiles([{ name: res.name || `${D.name} - חתום.pdf`, bytes: new Uint8Array(signed), uri: res.uri, writable: !!res.writable }]);
  toast('המסמך נחתם ונשמר.');
}

/* ---------- טפסים ---------- */

/** מילוי שדה: תיבת סימון מתהפכת מיד; שאר השדות בגיליון עם "הבא" */
async function fillField(srcId, field) {
  const D = S.doc;
  if (field.type === 'CheckBox') {
    D.setFieldValue(srcId, field.name, !D.fieldValue(srcId, field));
    annot.renderAll();
    refreshDoc();
    return;
  }
  const all = annot.allFields().filter((f) => f.field.type !== 'CheckBox');
  const idx = all.findIndex((f) => f.srcId === srcId && f.field.name === field.name);
  const cur = all[idx];
  if (cur) viewer.centerOn(cur.page, cur.box.x + cur.box.w / 2, cur.box.y + cur.box.h / 2 + 60 / viewer.scale);
  const value = D.fieldValue(srcId, field);
  const hasNext = idx >= 0 && idx < all.length - 1;
  const res = await new Promise((resolve) => {
    let done = false;
    const choice = field.type !== 'TextField';
    const s = openSheet(`
      <h2 dir="auto"></h2>
      <p class="field-meta">שדה ${idx + 1} מתוך ${all.length}</p>
      ${choice
        ? `<div class="opt-list">${(field.options || []).map((o) => `<button data-o="${esc(o)}" aria-pressed="${o === value}" dir="auto">${esc(o)}</button>`).join('')}</div>`
        : field.multiline
          ? '<textarea class="field" dir="auto"></textarea>'
          : `<input class="field" dir="auto" autocomplete="off" ${field.maxLength ? `maxlength="${field.maxLength}"` : ''}>`}
      <div class="actions">
        ${hasNext ? '<button class="btn" data-next>הבא</button>' : ''}
        <button class="btn ${hasNext ? 'quiet' : ''}" data-done>סיום</button>
      </div>`, { onClose: () => { if (!done) resolve({ action: 'close' }); } });
    const w = s.wrap;
    w.querySelector('h2').textContent = field.name;
    let picked = value;
    const input = w.querySelector('.field');
    if (input) { input.value = value == null ? '' : String(value); setTimeout(() => input.focus(), 80); }
    w.querySelectorAll('[data-o]').forEach((b) => b.addEventListener('click', () => {
      picked = b.dataset.o;
      w.querySelectorAll('[data-o]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    const finish = (action) => { done = true; resolve({ action, value: input ? input.value : picked }); s.close(); };
    if (input && !field.multiline) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(hasNext ? 'next' : 'done'); } });
    const nx = w.querySelector('[data-next]');
    if (nx) nx.addEventListener('click', () => finish('next'));
    w.querySelector('[data-done]').addEventListener('click', () => finish('done'));
  });
  if (res.action !== 'close' && res.value !== (value == null ? '' : value) && !(res.value === '' && value == null)) {
    D.setFieldValue(srcId, field.name, res.value);
    annot.renderAll();
    refreshDoc();
  }
  if (res.action === 'next' && hasNext) {
    const n = all[idx + 1];
    fillField(n.srcId, n.field);
  }
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
    { id: 'add', label: 'הוספת קובץ לסוף המסמך', icon: ICON.add },
    { id: 'saveas', label: 'שמירה בשם…', icon: ICON.saveAs },
    { id: 'share', label: 'שיתוף', icon: ICON.share },
    { id: 'about', label: 'אודות', icon: ICON.info },
  ]);
  if (choice === 'open') chooseAndOpen();
  else if (choice === 'goto') goToPagePrompt();
  else if (choice === 'saveas') saveAsNew();
  else if (choice === 'add') pickAndAdd();
  else if (choice === 'share') shareDoc();
  else if (choice === 'about') about();
});

$('#tb-pages').addEventListener('click', openPages);
$('#tb-sign').addEventListener('click', signFlow);
$('#tb-text').addEventListener('click', addText);
$('#tb-date').addEventListener('click', addDate);
$('#tb-tools').addEventListener('click', toolsSheet);
$('#btn-images').addEventListener('click', () => imagesToNewDoc('gallery'));
$('#btn-camera').addEventListener('click', () => imagesToNewDoc('camera'));
$('#btn-undo-view').addEventListener('click', undo);
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
    if (closeSignaturePad()) return;
    if (closeTopSheet()) return;
    if (S.screen === 'viewer' && annot.selected) { annot.select(null); return; }
    if (S.screen === 'pages') {
      if (editor.selected.size) editor.selectAll(false); else closePages();
      return;
    }
    if (S.screen === 'viewer') { requestClose(); return; }
    App.exitApp();
  });
}

showScreen('home');
