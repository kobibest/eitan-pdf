/*
 * מסך העמודים: תמונות ממוזערות בטבלה, סידור בגרירה (לחיצה ארוכה וגרירה),
 * בחירה בהקשה, וסיבוב / מחיקה / שמירה בנפרד של העמודים שנבחרו.
 */
import { h } from './ui.js';

const LONG_PRESS = 380;
const MOVE_TOLERANCE = 10;

export class PagesEditor {
  /**
   * scroller / grid — האלמנטים של הטבלה.
   * onSelection(count) — כשהבחירה משתנה. onReorder(keys) — אחרי גרירה.
   */
  constructor(scroller, grid, { onSelection, onReorder }) {
    this.scroller = scroller;
    this.grid = grid;
    this.onSelection = onSelection;
    this.onReorder = onReorder;
    this.doc = null;
    this.selected = new Set();
    this.tiles = new Map();      // key -> tile
    this.near = new Set();
    this.drawn = new Map();      // key -> rotate שבו צויר
    this.queue = Promise.resolve();
    this.gen = 0;
    this.io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const key = en.target.dataset.key;
        if (en.isIntersecting) { this.near.add(key); this.draw(key); } else { this.near.delete(key); this.release(key); }
      }
    }, { root: scroller, rootMargin: '100% 0px' });
    this.bindDrag();
  }

  open(doc) {
    this.doc = doc;
    this.selected.clear();
    this.render();
    this.scroller.scrollTop = 0;
  }

  close() {
    this.gen++;
    this.io.disconnect();
    for (const key of [...this.drawn.keys()]) this.release(key);
    this.grid.replaceChildren();
    this.tiles.clear();
    this.near.clear();
    this.doc = null;
  }

  /** בנייה מחדש של הטבלה לפי סדר העמודים במסמך — אריחים קיימים נשמרים (בלי לצייר שוב) */
  render() {
    const pages = this.doc.pages;
    const keep = new Set(pages.map((p) => p.key));
    for (const [key, tile] of this.tiles) {
      if (!keep.has(key)) { this.io.unobserve(tile); this.release(key); tile.remove(); this.tiles.delete(key); this.selected.delete(key); }
    }
    pages.forEach((p, i) => {
      let tile = this.tiles.get(p.key);
      if (!tile) {
        tile = h(`<div class="tile" data-key="${p.key}">
          <div class="thumb"></div>
          <span class="num"></span>
          <span class="check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
        </div>`);
        this.tiles.set(p.key, tile);
        this.io.observe(tile);
      }
      tile.querySelector('.num').textContent = i + 1;
      tile.classList.toggle('selected', this.selected.has(p.key));
      this.grid.append(tile); // append מזיז אריח קיים למקומו החדש
      if (this.drawn.has(p.key) && this.drawn.get(p.key) !== p.rotate) this.draw(p.key);
    });
    this.onSelection(this.selected.size);
  }

  /* ---------- תמונות ממוזערות ---------- */

  draw(key) {
    const gen = this.gen;
    this.queue = this.queue.then(async () => {
      if (gen !== this.gen || !this.near.has(key) || !this.doc) return;
      const p = this.doc.pages.find((x) => x.key === key);
      const tile = this.tiles.get(key);
      if (!p || !tile || this.drawn.get(key) === p.rotate) return;
      try {
        const pdf = this.doc.sources.get(p.src).pdf;
        const pg = await pdf.getPage(p.index + 1);
        const rotation = (pg.rotate + p.rotate) % 360;
        const box = tile.querySelector('.thumb');
        const bw = box.clientWidth || 110, bh = box.clientHeight || 150;
        const base = pg.getViewport({ scale: 1, rotation });
        const dpr = window.devicePixelRatio || 1;
        const k = Math.min(bw / base.width, bh / base.height) * dpr;
        const vp = pg.getViewport({ scale: k, rotation });
        const c = document.createElement('canvas');
        c.width = Math.ceil(vp.width);
        c.height = Math.ceil(vp.height);
        const ctx = c.getContext('2d', { alpha: false });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        await pg.render({ canvasContext: ctx, viewport: vp }).promise;
        if (gen !== this.gen || !this.near.has(key)) { c.width = c.height = 0; return; }
        c.style.aspectRatio = `${vp.width} / ${vp.height}`;
        const old = box.querySelector('canvas');
        box.append(c);
        if (old) { old.width = old.height = 0; old.remove(); }
        this.drawn.set(key, p.rotate);
      } catch (err) {
        console.warn('thumb', key, err);
      }
    });
  }

  release(key) {
    const tile = this.tiles.get(key);
    const c = tile && tile.querySelector('.thumb canvas');
    if (c) { c.width = c.height = 0; c.remove(); }
    this.drawn.delete(key);
  }

  /* ---------- בחירה ---------- */

  toggle(key) {
    if (this.selected.has(key)) this.selected.delete(key); else this.selected.add(key);
    const tile = this.tiles.get(key);
    if (tile) tile.classList.toggle('selected', this.selected.has(key));
    this.onSelection(this.selected.size);
  }

  selectAll(on) {
    this.selected = new Set(on ? this.doc.pages.map((p) => p.key) : []);
    for (const [key, tile] of this.tiles) tile.classList.toggle('selected', this.selected.has(key));
    this.onSelection(this.selected.size);
  }

  /* ---------- גרירה ---------- */

  bindDrag() {
    const sc = this.scroller;
    let press = null;   // { tile, x, y, timer }
    let drag = null;    // { tile, ghost, offX, offY, x, y, raf }

    const cancelPress = () => { if (press) { clearTimeout(press.timer); press = null; } };

    sc.addEventListener('contextmenu', (e) => e.preventDefault());

    sc.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || drag) { cancelPress(); return; }
      const t = e.touches[0];
      const tile = e.target.closest('.tile');
      if (!tile) return;
      press = { tile, x: t.clientX, y: t.clientY, moved: false };
      press.timer = setTimeout(() => { const p = press; press = null; startDrag(p.tile, p.x, p.y); }, LONG_PRESS);
    }, { passive: true });

    sc.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (drag) {
        e.preventDefault();
        drag.x = t.clientX;
        drag.y = t.clientY;
        moveGhost();
        hitTest();
        return;
      }
      if (press && Math.hypot(t.clientX - press.x, t.clientY - press.y) > MOVE_TOLERANCE) cancelPress();
    }, { passive: false });

    const end = (e) => {
      if (drag) {
        e.preventDefault();
        finishDrag();
        return;
      }
      if (press && e.type === 'touchend') {
        // הקשה קצרה = בחירה
        const key = press.tile.dataset.key;
        cancelPress();
        e.preventDefault();
        this.toggle(key);
      }
      cancelPress();
    };
    sc.addEventListener('touchend', end, { passive: false });
    sc.addEventListener('touchcancel', end, { passive: false });

    // במחשב (בדיקות): לחיצה בעכבר בוחרת
    sc.addEventListener('click', (e) => {
      if (e.pointerType === 'touch' || e.sourceCapabilities?.firesTouchEvents) return;
      const tile = e.target.closest('.tile');
      if (tile && !this.touchUsed) this.toggle(tile.dataset.key);
    });
    sc.addEventListener('touchstart', () => { this.touchUsed = true; }, { passive: true, once: true });

    const startDrag = (tile, x, y) => {
      if (navigator.vibrate) try { navigator.vibrate(15); } catch { /* לא נתמך */ }
      const r = tile.getBoundingClientRect();
      const ghost = tile.cloneNode(true);
      const srcCanvas = tile.querySelector('canvas');
      const dstCanvas = ghost.querySelector('canvas');
      if (srcCanvas && dstCanvas) dstCanvas.getContext('2d').drawImage(srcCanvas, 0, 0);
      ghost.classList.add('ghost');
      ghost.style.width = r.width + 'px';
      ghost.style.height = r.height + 'px';
      document.body.append(ghost);
      tile.classList.add('placeholder');
      drag = { tile, ghost, offX: x - r.left, offY: y - r.top, x, y };
      moveGhost();
      autoScroll();
    };

    const moveGhost = () => {
      drag.ghost.style.transform = `translate(${drag.x - drag.offX}px, ${drag.y - drag.offY}px) scale(1.06)`;
    };

    const hitTest = () => {
      const el = document.elementFromPoint(drag.x, drag.y);
      const over = el && el.closest('.tile');
      if (!over || over === drag.tile || over.classList.contains('ghost') || !this.grid.contains(over)) return;
      const r = over.getBoundingClientRect();
      // הטבלה מימין לשמאל: צד ימין של אריח = לפניו
      const before = drag.x > r.left + r.width / 2;
      if (before) over.before(drag.tile); else over.after(drag.tile);
      this.renumber();
    };

    const autoScroll = () => {
      if (!drag) return;
      const r = sc.getBoundingClientRect();
      const edge = 70;
      let dy = 0;
      if (drag.y < r.top + edge) dy = -Math.ceil((r.top + edge - drag.y) / 6);
      else if (drag.y > r.bottom - edge) dy = Math.ceil((drag.y - (r.bottom - edge)) / 6);
      if (dy) { sc.scrollTop += dy; hitTest(); }
      drag.raf = requestAnimationFrame(autoScroll);
    };

    const finishDrag = () => {
      const d = drag;
      drag = null;
      cancelAnimationFrame(d.raf);
      d.ghost.remove();
      d.tile.classList.remove('placeholder');
      const keys = [...this.grid.children].map((t) => t.dataset.key);
      this.onReorder(keys);
    };
  }

  renumber() {
    [...this.grid.children].forEach((t, i) => { t.querySelector('.num').textContent = i + 1; });
  }
}
