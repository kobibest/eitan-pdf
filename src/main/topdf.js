// המרה ל-PDF מקליק ימני ב-Windows: תמונות (JPG/PNG) וקובצי Word.
// תמונות — במנוע של התוכנה (כמה תמונות שנבחרו יחד → קובץ PDF אחד).
// Word — דרך Microsoft Word שמותקן במחשב (אותה תוצאה כמו "שמירה בשם PDF" ב-Word),
// ואם אין Word — דרך LibreOffice אם הוא מותקן. בלי אחד מהם אי אפשר להמיר Word בדיוק.
// הקובץ החדש נשמר ליד המקור, בשם המקור עם סיומת ‎.pdf (ואם כבר קיים — עם מספר).
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');

const IMAGE_RE = /\.(jpe?g|png)$/i;
const WORD_RE = /\.(docx?|rtf|odt)$/i;
const TOPDF_RE = /\.(jpe?g|png|docx?|rtf|odt)$/i;

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

/** שם פנוי ליד המקור: "חוזה.pdf", ואם קיים — "חוזה (2).pdf" */
async function freeName(dir, base) {
  let target = path.join(dir, `${base}.pdf`);
  for (let n = 2; await exists(target); n++) target = path.join(dir, `${base} (${n}).pdf`);
  return target;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: opts.timeout || 180000, env: { ...process.env, ...(opts.env || {}) } }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout || ''), err: String(stderr || (err && err.message) || '') });
    });
  });
}

/** Word דרך COM (PowerShell). הנתיבים עוברים במשתני סביבה — בלי בעיות של מירכאות ותווים מיוחדים */
async function viaWord(input, output) {
  if (process.platform !== 'win32') return false;
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$w = New-Object -ComObject Word.Application',
    '$w.Visible = $false',
    '$w.DisplayAlerts = 0',
    'try {',
    '  $d = $w.Documents.Open($env:EPDF_IN, $false, $true)',
    '  $d.ExportAsFixedFormat($env:EPDF_OUT, 17)',
    '  $d.Close(0)',
    '} finally { $w.Quit() }',
  ].join('; ');
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { env: { EPDF_IN: input, EPDF_OUT: output } });
  return r.ok && (await exists(output));
}

/** LibreOffice (אם מותקן): ממיר לתיקייה זמנית ומעביר לשם הסופי */
async function viaLibreOffice(input, output) {
  const candidates = process.platform === 'win32'
    ? [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).map((d) => path.join(d, 'LibreOffice', 'program', 'soffice.exe'))
    : ['/usr/bin/soffice', '/usr/bin/libreoffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice'];
  let soffice = null;
  for (const c of candidates) if (await exists(c)) { soffice = c; break; }
  if (!soffice) return false;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'eitanpdf-'));
  try {
    const r = await run(soffice, ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', tmp, input]);
    const made = path.join(tmp, path.basename(input).replace(/\.[^.]+$/, '') + '.pdf');
    if (!r.ok || !(await exists(made))) return false;
    await fs.copyFile(made, output);
    return true;
  } finally {
    fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * files: נתיבים של תמונות וקובצי Word. מחזיר { outputs: [נתיבי PDF], errors: [הודעות בעברית] }
 * ops — המנוע (src/core/ops.js) להמרת תמונות.
 */
async function convertFiles(files, ops) {
  const outputs = [];
  const errors = [];
  const images = files.filter((f) => IMAGE_RE.test(f));
  const words = files.filter((f) => WORD_RE.test(f));

  if (images.length) {
    try {
      const list = [];
      for (const f of images) list.push({ bytes: new Uint8Array(await fs.readFile(f)) });
      const bytes = await ops.imagesToPdf(list);
      const first = images[0];
      const base = images.length === 1 ? path.basename(first).replace(/\.[^.]+$/, '') : `תמונות (${images.length})`;
      const target = await freeName(path.dirname(first), base);
      await fs.writeFile(target, Buffer.from(bytes));
      outputs.push(target);
    } catch (e) {
      errors.push(`לא הצלחנו להמיר את התמונות: ${e.message}`);
    }
  }

  for (const f of words) {
    const name = path.basename(f);
    try {
      const target = await freeName(path.dirname(f), name.replace(/\.[^.]+$/, ''));
      if ((await viaWord(f, target)) || (await viaLibreOffice(f, target))) outputs.push(target);
      else errors.push(`לא הצלחנו להמיר את "${name}". כדי להמיר קובצי Word צריך שיהיה מותקן במחשב Microsoft Word או LibreOffice.`);
    } catch (e) {
      errors.push(`לא הצלחנו להמיר את "${name}": ${e.message}`);
    }
  }
  return { outputs, errors };
}

module.exports = { convertFiles, TOPDF_RE, IMAGE_RE, WORD_RE, freeName };
