// איתןPDF לאנדרואיד — ממשק
import * as pdfjsLib from './vendor/pdfjs/pdf.min.mjs';
import { $, toast, busy, prompt, menu, openSheet, closeTopSheet, esc } from './js/ui.js';
import { isNative, App, pickPdfs, onReceivedFiles } from './js/native.js';
import { Viewer } from './js/viewer.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const PDFJS_OPTS = {
  cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).href,
  cMapPacked: true,
  standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).href,
  isEvalSupported: false,
};

const ICON = {
  open: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  page: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h6M9 16h4"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
};

/* ---------- מצב ---------- */

const S = {
  file: null,   // { name, bytes, uri, writable }
  pdf: null,    // מסמך pdf.js
};

const viewer = new Viewer($('#scroller'), $('#pages'), { onPageChange: showPagePill });

/* ---------- מסכים ---------- */

function showScreen(name) {
  $('#home').hidden = name !== 'home';
  $('#viewer').hidden = name !== 'viewer';
}

/* ---------- פתיחת קובץ ---------- */

async function openFiles(files) {
  if (!files || !files.length) return;
  if (files.length > 1) toast(`התקבלו ${files.length} קבצים. נפתח הראשון — איחוד קבצים יגיע בשלב הבא.`);
  await openFile(files[0]);
}

function isPdf(bytes) {
  // החתימה %PDF יכולה להופיע קצת אחרי תחילת הקובץ
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  return head.includes('%PDF');
}

async function openFile(file) {
  if (!isPdf(file.bytes)) {
    toast(`"${file.name}" אינו קובץ PDF.`, { error: true });
    return;
  }
  busy(true, 'פותח…');
  let pdf;
  try {
    const task = pdfjsLib.getDocument({ ...PDFJS_OPTS, data: file.bytes.slice() });
    task.onPassword = async (update, reason) => {
      busy(false);
      const wrong = reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD;
      const pw = await prompt({
        title: wrong ? 'הסיסמה שגויה' : 'הקובץ מוגן בסיסמה',
        text: wrong ? 'נסו שוב.' : `כדי לפתוח את "${file.name}" צריך להקליד את הסיסמה שלו.`,
        type: 'password', ok: 'פתיחה',
      });
      busy(true, 'פותח…');
      if (pw == null) task.destroy(); else update(pw);
    };
    pdf = await task.promise;
  } catch (err) {
    busy(false);
    if (err && err.name === 'PasswordException') return;
    if (String(err && err.message).includes('destroyed')) return;
    console.error(err);
    toast(`לא הצלחנו לפתוח את "${file.name}". ייתכן שהקובץ פגום.`, { error: true });
    return;
  }
  try {
    if (S.pdf) S.pdf.destroy();
    S.file = file;
    S.pdf = pdf;
    $('#doc-name').textContent = file.name.replace(/\.pdf$/i, '');
    $('#doc-sub').textContent = pdf.numPages === 1 ? 'עמוד אחד' : `${pdf.numPages} עמודים`;
    showScreen('viewer');
    await viewer.open(pdf);
  } finally {
    busy(false);
  }
}

function closeFile() {
  viewer.close();
  if (S.pdf) S.pdf.destroy();
  S.pdf = null;
  S.file = null;
  showScreen('home');
}

async function chooseAndOpen() {
  try {
    const files = await pickPdfs();
    await openFiles(files);
  } catch (err) {
    if (err && /cancel/i.test(err.message || '')) return;
    console.error(err);
    toast('פתיחת הקובץ נכשלה.', { error: true });
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
    <p class="about-meta">${esc(b.version || '')}${b.commit ? ' · ' + esc(b.commit) : ''} · test</p>`);
}

/* ---------- אירועים ---------- */

$('#btn-open').addEventListener('click', chooseAndOpen);
$('#btn-about').addEventListener('click', about);
$('#btn-close').addEventListener('click', closeFile);
$('#page-pill').addEventListener('click', goToPagePrompt);
$('#btn-menu').addEventListener('click', async () => {
  const choice = await menu([
    { id: 'open', label: 'פתיחת קובץ אחר', icon: ICON.open },
    { id: 'goto', label: 'מעבר לעמוד', icon: ICON.page },
    { id: 'about', label: 'אודות', icon: ICON.info },
  ]);
  if (choice === 'open') chooseAndOpen();
  else if (choice === 'goto') goToPagePrompt();
  else if (choice === 'about') about();
});

// קבצים מ"פתח באמצעות" ו"שתף"
let incoming = false;
onReceivedFiles(
  () => { if (!incoming) { incoming = true; busy(true, 'מקבל את הקובץ…'); } },
  async (files) => {
    if (incoming) { incoming = false; busy(false); }
    while (closeTopSheet()) { /* סוגרים חלונות פתוחים */ }
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
    if (!$('#viewer').hidden) { closeFile(); return; }
    App.exitApp();
  });
}

showScreen('home');
