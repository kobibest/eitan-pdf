/*
 * צפייה ב-PDF: עמודים בגלילה אנכית, זום בצביטה ובהקשה כפולה.
 *
 * כל עמוד מצויר רק כשהוא קרוב למסך, ועמודים רחוקים משוחררים — כדי שקבצים
 * גדולים לא יגמרו את הזיכרון של הטלפון. בזמן הצביטה התוכן רק "נמתח" ב-CSS
 * (מהיר וחלק), ובסיום הוא מצויר מחדש ברזולוציה הנכונה.
 */

const GAP = 12;          // רווח בין עמודים (px)
const SIDE = 8;          // שוליים בצדדים בהתאמה לרוחב
const MAX_PIXELS = 12e6; // תקרת פיקסלים לקנבס אחד (מגבלת זיכרון ב-WebView)

export class Viewer {
  constructor(scroller, pagesEl, { onPageChange } = {}) {
    this.scroller = scroller;
    this.pagesEl = pagesEl;
    this.onPageChange = onPageChange || (() => {});
    this.pdf = null;
    this.sizes = [];
    this.els = [];
    this.scale = 1;
    this.fitScale = 1;
    this.current = 0;
    this.near = new Set();
    this.rendered = new Map();   // i -> scale שבו צויר
    this.rendering = null;       // { i, task }
    this.gen = 0;

    this.io = new IntersectionObserver((entries) => this.onIntersect(entries), {
      root: scroller, rootMargin: '120% 40%',
    });
    scroller.addEventListener('scroll', () => this.onScroll(), { passive: true });
    window.addEventListener('resize', () => this.onResize());
    this.bindGestures();
  }

  /* ---------- טעינה ---------- */

  async open(pdf) {
    this.close();
    const gen = ++this.gen;
    this.pdf = pdf;
    const sizes = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      if (gen !== this.gen) return;
      const vp = pg.getViewport({ scale: 1 });
      sizes.push({ w: vp.width, h: vp.height });
    }
    this.sizes = sizes;
    this.maxW = Math.max(...sizes.map((s) => s.w));
    this.fitScale = this.computeFit();
    this.scale = this.fitScale;
    this.els = sizes.map((_, i) => {
      const el = document.createElement('div');
      el.className = 'page';
      el.dataset.i = i;
      el.innerHTML = `<div class="page-no">${i + 1}</div>`;
      this.pagesEl.append(el);
      this.io.observe(el);
      return el;
    });
    this.layout();
    this.scroller.scrollTo(0, 0);
    this.current = 0;
    this.onPageChange(0, sizes.length);
  }

  close() {
    this.gen++;
    this.cancelRender();
    this.io.disconnect();
    this.pagesEl.replaceChildren();
    this.els = [];
    this.sizes = [];
    this.near.clear();
    this.rendered.clear();
    this.pdf = null;
  }

  get pageCount() { return this.sizes.length; }

  computeFit() {
    const w = this.scroller.clientWidth || window.innerWidth;
    return Math.max(0.05, (w - SIDE * 2) / this.maxW);
  }

  get minScale() { return this.fitScale * 0.5; }
  get maxScale() { return Math.max(this.fitScale * 6, 3); }

  /* ---------- פריסה ---------- */

  layout() {
    const s = this.scale;
    const contentW = Math.ceil(this.maxW * s + SIDE * 2);
    this.pagesEl.style.width = Math.max(this.scroller.clientWidth, contentW) + 'px';
    this.sizes.forEach((sz, i) => {
      const el = this.els[i];
      el.style.width = Math.round(sz.w * s) + 'px';
      el.style.height = Math.round(sz.h * s) + 'px';
      el.style.marginBottom = GAP + 'px';
    });
  }

  /** מעבר לעמוד (מ-0) */
  goTo(i) {
    const el = this.els[Math.max(0, Math.min(this.els.length - 1, i))];
    if (el) this.scroller.scrollTop = el.offsetTop - GAP;
  }

  /* ---------- זום ---------- */

  /**
   * שינוי קנה מידה כך שהנקודה (sx, sy) — ביחס לחלון הגלילה — נשארת במקומה.
   * from: מיקום הנקודה בתוכן לפני השינוי (אם כבר חושב, למשל בצביטה).
   */
  zoomTo(newScale, sx, sy, from) {
    newScale = Math.min(this.maxScale, Math.max(this.minScale, newScale));
    const fx = from ? from.x : this.scroller.scrollLeft + sx;
    const fy = from ? from.y : this.scroller.scrollTop + sy;
    // הנקודה ביחידות של העמוד שהיא נמצאת בו — כדי לחשב את מקומה אחרי הפריסה מחדש
    const i = this.pageAtY(fy);
    const el = this.els[i];
    const old = this.scale;
    const px = (fx - el.offsetLeft) / old;
    const py = Math.min(Math.max(0, fy - el.offsetTop), el.offsetHeight) / old;
    this.scale = newScale;
    this.layout();
    this.scroller.scrollLeft = el.offsetLeft + px * newScale - sx;
    this.scroller.scrollTop = el.offsetTop + py * newScale - sy;
    this.schedule();
  }

  onResize() {
    if (!this.pdf) return;
    const atFit = Math.abs(this.scale - this.fitScale) / this.fitScale < 0.01;
    const page = this.current;
    this.fitScale = this.computeFit();
    if (atFit) {
      this.scale = this.fitScale;
      this.layout();
      this.goTo(page);
      this.schedule();
    } else {
      this.layout();
    }
  }

  bindGestures() {
    const sc = this.scroller;
    let pinch = null;
    let tap = null;
    let lastTap = null;
    const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const mid = (a, b) => {
      const r = sc.getBoundingClientRect();
      return { x: (a.clientX + b.clientX) / 2 - r.left, y: (a.clientY + b.clientY) / 2 - r.top };
    };

    sc.addEventListener('touchstart', (e) => {
      if (!this.pdf) return;
      if (e.touches.length === 2) {
        tap = null;
        const [a, b] = e.touches;
        const m = mid(a, b);
        pinch = {
          d0: dist(a, b) || 1,
          s0: this.scale,
          m0: m,
          m,
          k: 1,
          fx: sc.scrollLeft + m.x,
          fy: sc.scrollTop + m.y,
        };
        this.pagesEl.classList.add('pinching');
        this.pagesEl.style.transformOrigin = `${pinch.fx}px ${pinch.fy}px`;
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        tap = { x: t.clientX, y: t.clientY, t: Date.now() };
      } else {
        tap = null;
      }
    }, { passive: true });

    sc.addEventListener('touchmove', (e) => {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        const [a, b] = e.touches;
        const target = Math.min(this.maxScale, Math.max(this.minScale, pinch.s0 * dist(a, b) / pinch.d0));
        pinch.k = target / pinch.s0;
        pinch.m = mid(a, b);
        const tx = pinch.m.x - pinch.m0.x;
        const ty = pinch.m.y - pinch.m0.y;
        this.pagesEl.style.transform = `translate(${tx}px, ${ty}px) scale(${pinch.k})`;
      } else if (tap) {
        const t = e.touches[0];
        if (Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > 12) tap = null;
      }
    }, { passive: false });

    const end = (e) => {
      if (pinch && e.touches.length < 2) {
        const p = pinch;
        pinch = null;
        this.pagesEl.style.transform = '';
        this.pagesEl.classList.remove('pinching');
        if (Math.abs(p.k - 1) > 0.01 || p.m.x !== p.m0.x || p.m.y !== p.m0.y) {
          this.zoomTo(p.s0 * p.k, p.m.x, p.m.y, { x: p.fx, y: p.fy });
        }
        lastTap = null;
        return;
      }
      if (tap && e.touches.length === 0 && Date.now() - tap.t < 300) {
        const now = Date.now();
        if (lastTap && now - lastTap.t < 320 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 40) {
          // הקשה כפולה: הגדלה סביב הנקודה, או חזרה להתאמה לרוחב
          const r = sc.getBoundingClientRect();
          const zoomed = this.scale > this.fitScale * 1.3;
          this.zoomTo(zoomed ? this.fitScale : this.fitScale * 2.5, tap.x - r.left, tap.y - r.top);
          lastTap = null;
        } else {
          lastTap = { ...tap, t: now };
        }
      }
      tap = null;
    };
    sc.addEventListener('touchend', end);
    sc.addEventListener('touchcancel', end);

    // במחשב (בדיקות): Ctrl + גלגלת
    sc.addEventListener('wheel', (e) => {
      if (!e.ctrlKey || !this.pdf) return;
      e.preventDefault();
      const r = sc.getBoundingClientRect();
      this.zoomTo(this.scale * Math.exp(-e.deltaY / 300), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
  }

  /* ---------- עמוד נוכחי ---------- */

  pageAtY(y) {
    const els = this.els;
    let lo = 0, hi = els.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (els[m].offsetTop - GAP / 2 <= y) lo = m; else hi = m - 1;
    }
    return lo;
  }

  onScroll() {
    if (this.scrollRaf) return;
    this.scrollRaf = requestAnimationFrame(() => {
      this.scrollRaf = 0;
      if (!this.els.length) return;
      const i = this.pageAtY(this.scroller.scrollTop + this.scroller.clientHeight / 2);
      if (i !== this.current) {
        this.current = i;
      }
      this.onPageChange(this.current, this.els.length);
    });
  }

  /* ---------- ציור ---------- */

  onIntersect(entries) {
    for (const en of entries) {
      const i = +en.target.dataset.i;
      if (en.isIntersecting) this.near.add(i);
      else {
        this.near.delete(i);
        this.release(i);
      }
    }
    this.schedule();
  }

  release(i) {
    if (this.rendering && this.rendering.i === i) this.cancelRender();
    const c = this.els[i] && this.els[i].querySelector('canvas');
    if (c) { c.width = c.height = 0; c.remove(); }
    this.rendered.delete(i);
  }

  cancelRender() {
    if (this.rendering) {
      try { this.rendering.task.cancel(); } catch { /* כבר הסתיים */ }
      this.rendering = null;
    }
  }

  schedule() {
    if (this.pumpQueued) return;
    this.pumpQueued = true;
    requestAnimationFrame(() => { this.pumpQueued = false; this.pump(); });
  }

  /** מצייר את העמוד הקרוב ביותר שעדיין לא צויר בקנה המידה הנוכחי, אחד בכל פעם */
  async pump() {
    if (this.rendering || !this.pdf) return;
    const todo = [...this.near].filter((i) => this.rendered.get(i) !== this.scale);
    if (!todo.length) return;
    todo.sort((a, b) => Math.abs(a - this.current) - Math.abs(b - this.current));
    const i = todo[0];
    const gen = this.gen;
    const scale = this.scale;
    try {
      const pg = await this.pdf.getPage(i + 1);
      if (gen !== this.gen || !this.near.has(i)) return;
      const dpr = window.devicePixelRatio || 1;
      let r = scale * dpr;
      const base = pg.getViewport({ scale: 1 });
      const px = base.width * base.height * r * r;
      if (px > MAX_PIXELS) r *= Math.sqrt(MAX_PIXELS / px);
      const vp = pg.getViewport({ scale: r });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const task = pg.render({ canvasContext: ctx, viewport: vp });
      this.rendering = { i, task };
      await task.promise;
      if (gen !== this.gen || !this.near.has(i)) { canvas.width = canvas.height = 0; return; }
      // מחליפים את הקנבס הישן רק כשהחדש מוכן — בלי הבהוב לבן
      const el = this.els[i];
      const old = el.querySelector('canvas');
      el.append(canvas);
      if (old) { old.width = old.height = 0; old.remove(); }
      const label = el.querySelector('.page-no');
      if (label) label.remove();
      this.rendered.set(i, scale);
    } catch (err) {
      if (!err || err.name !== 'RenderingCancelledException') {
        console.warn('render', i, err);
        this.rendered.set(i, scale); // לא לנסות שוב בלולאה עמוד שנכשל
      }
    } finally {
      if (this.rendering && this.rendering.i === i) this.rendering = null;
      if (gen === this.gen) this.schedule();
    }
  }
}
