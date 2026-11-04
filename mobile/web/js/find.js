// חיפוש בקובץ — אותו מנוע כמו בדסקטופ (src/core/search.js מעל קורא הטקסט של העורך)

const PDFLib = window.PDFLib;
const { TextEdit, PdfSearch } = window;

export class Finder {
  /**
   * viewer: Viewer; bar: האלמנט של סרגל החיפוש; getDoc: () => המסמך הפתוח (Doc)
   */
  constructor(viewer, bar, { getDoc }) {
    this.viewer = viewer;
    this.bar = bar;
    this.getDoc = getDoc;
    this.isOpen = false;
    this.query = '';
    this.results = []; // [{ key, rects }]
    this.cur = -1;
    this.done = true;
    this.token = 0;
    this.sig = '';
    this.libDocs = new WeakMap(); // Doc → Map(srcId → Promise<PDFDocument>)
    this.lineCache = new WeakMap(); // Doc → Map(`${src}:${index}` → Promise<lines>)

    this.input = bar.querySelector('input');
    this.count = bar.querySelector('.find-count');
    let t;
    this.input.addEventListener('input', () => { this.query = this.input.value; clearTimeout(t); t = setTimeout(() => this.run(), 300); });
    this.input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      clearTimeout(t);
      if (this.query !== this.input.value || this.sig !== this.signature()) { this.query = this.input.value; this.run(); } else this.step(e.shiftKey ? -1 : 1);
    });
    bar.querySelector('[data-a=prev]').addEventListener('click', () => this.step(-1));
    bar.querySelector('[data-a=next]').addEventListener('click', () => this.step(1));
    bar.querySelector('[data-a=close]').addEventListener('click', () => this.close());
  }

  signature() {
    const d = this.getDoc();
    return d ? d.pages.map((p) => `${p.key}:${p.rotate || 0}`).join(',') : '';
  }

  open() {
    if (!this.getDoc()) return;
    this.isOpen = true;
    this.bar.hidden = false;
    this.input.focus();
    this.input.select();
    // פתיחה מחדש: מחפשים שוב את מה שהיה בשורה (השורות כבר במטמון, אז זה מהיר)
    if (this.query) this.run();
    else { this.paint(); this.updateBar(); }
  }

  /** מחזיר true אם היה פתוח (לכפתור "חזרה") */
  close() {
    if (!this.isOpen) return false;
    this.isOpen = false;
    this.token++;
    this.results = [];
    this.cur = -1;
    this.bar.hidden = true;
    this.input.blur();
    this.paint();
    return true;
  }

  /** אחרי שהעמודים צוירו מחדש (שינוי במסמך, זום וכו') */
  refresh() {
    if (!this.isOpen) return;
    if (this.query && this.sig !== this.signature()) this.run();
    else this.paint();
  }

  /** השורות של עמוד מקור (פעם אחת לכל עמוד) */
  lines(doc, p) {
    let lc = this.lineCache.get(doc);
    if (!lc) { lc = new Map(); this.lineCache.set(doc, lc); }
    const k = `${p.src}:${p.index}`;
    if (!lc.has(k)) {
      lc.set(k, (async () => {
        if (p.src === 'blank' || !doc.sources.get(p.src)) return [];
        let ld = this.libDocs.get(doc);
        if (!ld) { ld = new Map(); this.libDocs.set(doc, ld); }
        if (!ld.has(p.src)) ld.set(p.src, PDFLib.PDFDocument.load(doc.sources.get(p.src).bytes, { ignoreEncryption: true, updateMetadata: false }));
        try {
          const lib = await ld.get(p.src);
          return TextEdit.groupLines(TextEdit.analyzePage(lib, lib.getPage(p.index)).glyphs);
        } catch (e) {
          console.warn('קריאת הטקסט בעמוד נכשלה', e);
          return [];
        }
      })());
    }
    return lc.get(k);
  }

  async run() {
    const token = ++this.token;
    const doc = this.getDoc();
    this.results = [];
    this.cur = -1;
    this.done = false;
    this.scanned = 0;
    this.noText = false;
    this.sig = this.signature();
    this.paint();
    if (!doc || !PdfSearch.normalize(this.query)) { this.done = true; this.updateBar(); return; }
    this.updateBar();
    let anyText = false;
    const pages = doc.pages.slice();
    for (const p of pages) {
      const lines = await this.lines(doc, p);
      if (token !== this.token) return;
      if (lines.length) anyText = true;
      for (const m of PdfSearch.findInLines(lines, this.query)) this.results.push({ key: p.key, rects: m.rects });
      this.scanned++;
      if (this.cur < 0 && this.results.length) { this.cur = 0; this.show(); }
      if (this.scanned % 4 === 0) { this.updateBar(); await new Promise((r) => setTimeout(r, 0)); if (token !== this.token) return; }
    }
    this.done = true;
    this.noText = !anyText;
    this.updateBar();
    this.paint();
  }

  step(dir) {
    const n = this.results.length;
    if (!n) return;
    this.cur = (this.cur + dir + n) % n;
    this.show();
    this.updateBar();
  }

  updateBar() {
    const n = this.results.length;
    const q = PdfSearch.normalize(this.query);
    const total = this.getDoc() ? this.getDoc().pages.length : 0;
    this.count.classList.toggle('none', !!q && this.done && !n);
    this.count.textContent = !q ? '' : n ? `${this.cur + 1}/${n}${this.done ? '' : '…'}`
      : !this.done ? `${this.scanned}/${total}…` : this.noText ? 'אין טקסט' : 'לא נמצא';
    this.bar.querySelector('[data-a=prev]').disabled = !n;
    this.bar.querySelector('[data-a=next]').disabled = !n;
  }

  /** גלילה לתוצאה הנוכחית, כך שהיא במרכז המסך */
  show() {
    const r = this.results[this.cur];
    const doc = this.getDoc();
    if (!r || !doc) return;
    const i = doc.pages.findIndex((p) => p.key === r.key);
    const vp = this.viewer.viewports && this.viewer.viewports[i];
    if (i < 0 || !vp) return;
    const b = r.rects[0];
    const [x0, y0] = vp.convertToViewportPoint(b[0], b[1]);
    const [x1, y1] = vp.convertToViewportPoint(b[2], b[3]);
    this.viewer.centerOn(i, (x0 + x1) / 2, (y0 + y1) / 2);
    this.paint();
  }

  /** ציור הסימונים בשכבה נפרדת מעל כל עמוד (לא בשכבת החותמות, שמצוירת מחדש בכל שינוי) */
  paint() {
    const doc = this.getDoc();
    const byKey = new Map();
    if (this.isOpen && doc) this.results.forEach((r, k) => { if (!byKey.has(r.key)) byKey.set(r.key, []); byKey.get(r.key).push([r, k]); });
    this.viewer.els.forEach((el, i) => {
      let layer = el.querySelector('.find-layer');
      const list = doc && doc.pages[i] ? byKey.get(doc.pages[i].key) : null;
      if (!list) { if (layer) layer.remove(); return; }
      if (!layer) { layer = document.createElement('div'); layer.className = 'find-layer'; el.append(layer); }
      layer.replaceChildren();
      const vp = this.viewer.viewports[i];
      for (const [r, k] of list) {
        for (const b of r.rects) {
          const [x0, y0] = vp.convertToViewportPoint(b[0], b[1]);
          const [x1, y1] = vp.convertToViewportPoint(b[2], b[3]);
          const hit = document.createElement('div');
          hit.className = 'find-hit' + (k === this.cur ? ' cur' : '');
          const x = Math.min(x0, x1) - 1.5, y = Math.min(y0, y1) - 1.5;
          hit.style.left = `calc(var(--s) * ${x}px)`;
          hit.style.top = `calc(var(--s) * ${y}px)`;
          hit.style.width = `calc(var(--s) * ${Math.abs(x1 - x0) + 3}px)`;
          hit.style.height = `calc(var(--s) * ${Math.abs(y1 - y0) + 3}px)`;
          layer.append(hit);
        }
      }
    });
  }
}
