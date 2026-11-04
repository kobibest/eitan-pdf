/*
 * הרכבת תיקיית www/ שנארזת לתוך האפליקציה.
 *
 * הממשק של המובייל נמצא ב-mobile/web. המנוע (src/core), הגופנים (assets/fonts)
 * והלוגו (build) נלקחים ישירות מגרסת Windows שבשורש הריפו — אותם קבצים בדיוק
 * שעוברים את npm test. גם pdf-lib / fontkit / bidi-js / pdf.js נלקחים מ-node_modules
 * של השורש, כך שהגרסאות זהות לדסקטופ. www/ הוא תוצר בנייה ולא נשמר בריפו.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(MOBILE, '..');
const WWW = path.join(MOBILE, 'www');
const NM = path.join(ROOT, 'node_modules');

if (!fs.existsSync(path.join(NM, 'pdf-lib'))) {
  console.error('חסרות התלויות של השורש. הריצו קודם npm ci בתיקייה הראשית של הריפו.');
  process.exit(1);
}

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

function copy(from, to) {
  const src = path.join(ROOT, from);
  if (!fs.existsSync(src)) throw new Error('לא נמצא: ' + from);
  fs.cpSync(src, path.join(WWW, to), { recursive: true });
}

// הממשק של המובייל
fs.cpSync(path.join(MOBILE, 'web'), WWW, { recursive: true });

// המנוע המשותף — כמו ש-src/renderer/index.html טוען אותו בדסקטופ
for (const f of ['hebrew.js', 'textedit.js', 'ops.js', 'redact.js', 'compress.js', 'search.js']) copy(`src/core/${f}`, `core/${f}`);

// חתימה דיגיטלית: src/core/digisig.js נארז כמו שהוא לקובץ אחד שרץ ב-WebView (window.DigiSig).
// pdf-lib ו-ops.js לא נארזים שוב — משתמשים באותם עותקים שכבר נטענים בדף (window.PDFLib, window.PdfOps).
// crypto של Node מוחלף בתחליף מעל node-forge (shims/node-crypto.js), ו-Buffer בחבילת buffer.
await esbuild.build({
  stdin: { contents: `window.DigiSig = require(${JSON.stringify(path.join(ROOT, 'src/core/digisig.js'))});`, resolveDir: ROOT, loader: 'js' },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome80'],
  minify: true,
  legalComments: 'none',
  inject: [path.join(MOBILE, 'shims/buffer-global.js')],
  outfile: path.join(WWW, 'core/digisig.bundle.js'),
  logLevel: 'warning',
  plugins: [{
    name: 'eitanpdf-shared',
    setup(b) {
      const DIGISIG = path.join(ROOT, 'src/core/digisig.js');
      b.onResolve({ filter: /^pdf-lib$/ }, () => ({ path: 'pdf-lib', namespace: 'global' }));
      b.onResolve({ filter: /^\.\/ops\.js$/ }, (a) => (a.importer === DIGISIG ? { path: 'ops', namespace: 'global' } : undefined));
      b.onResolve({ filter: /^crypto$/ }, (a) => (a.importer === DIGISIG ? { path: path.join(MOBILE, 'shims/node-crypto.js') } : undefined));
      b.onResolve({ filter: /^buffer$/ }, () => ({ path: path.join(MOBILE, 'node_modules/buffer/index.js') }));
      b.onLoad({ filter: /.*/, namespace: 'global' }, (a) => ({
        contents: a.path === 'pdf-lib' ? 'module.exports = window.PDFLib;' : 'module.exports = window.PdfOps;',
        loader: 'js',
      }));
    },
  }],
});

// ספריות (מ-node_modules של השורש)
copy('node_modules/pdf-lib/dist/pdf-lib.min.js', 'vendor/pdf-lib.min.js');
copy('node_modules/@pdf-lib/fontkit/dist/fontkit.umd.min.js', 'vendor/fontkit.umd.min.js');
copy('node_modules/bidi-js/dist/bidi.min.js', 'vendor/bidi.min.js');
// pdf.js: בניית legacy — עובדת גם ב-WebView שלא עודכן לאחרונה
copy('node_modules/pdfjs-dist/legacy/build/pdf.min.mjs', 'vendor/pdfjs/pdf.min.mjs');
copy('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs');
copy('node_modules/pdfjs-dist/cmaps', 'vendor/pdfjs/cmaps');
copy('node_modules/pdfjs-dist/standard_fonts', 'vendor/pdfjs/standard_fonts');
// Capacitor (גרסת הדפדפן, בלי bundler)
fs.cpSync(path.join(MOBILE, 'node_modules/@capacitor/core/dist/capacitor.js'), path.join(WWW, 'vendor/capacitor.js'));

// גופנים ולוגו
for (const f of fs.readdirSync(path.join(ROOT, 'assets/fonts'))) {
  if (f.endsWith('.ttf')) copy(`assets/fonts/${f}`, `fonts/${f}`);
}
copy('build/icon.png', 'img/logo.png');

// פרטי הבנייה — מוצגים במסך "אודות" כדי לדעת איזו גרסה מותקנת
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
let commit = '';
try { commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { /* לא בריפו */ }
fs.writeFileSync(path.join(WWW, 'build-info.js'),
  `window.BUILD_INFO = ${JSON.stringify({ version, commit, built: new Date().toISOString() })};\n`);

console.log(`www/ מוכן (גרסה ${version}${commit ? ' · ' + commit : ''})`);
