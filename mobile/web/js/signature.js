/*
 * חתימה: ציור באצבע על משטח במסך מלא, ושמירה של עד 6 חתימות לשימוש חוזר
 * (אותה מגבלה כמו בדסקטופ). החתימה נשמרת כ-PNG שקוף וחתוך לגבולות הקו.
 */
import { h, toast } from './ui.js';
import { isNative } from './native.js';

export const INK_COLORS = [
  { hex: '#1F35B5', name: 'כחול עט' },
  { hex: '#1B2430', name: 'שחור' },
  { hex: '#C23A2E', name: 'אדום' },
  { hex: '#2F7D5B', name: 'ירוק' },
];

const KEY = 'signatures';
const Prefs = isNative ? window.capacitorExports.registerPlugin('Preferences') : null;

/* ---------- חתימות שמורות ---------- */

export async function savedSignatures() {
  try {
    const raw = Prefs ? (await Prefs.get({ key: KEY })).value : localStorage.getItem(KEY);
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function storeSignatures(list) {
  const raw = JSON.stringify(list.slice(0, 6));
  try {
    if (Prefs) await Prefs.set({ key: KEY, value: raw });
    else localStorage.setItem(KEY, raw);
  } catch {
    toast('לא הצלחנו לשמור את החתימה לשימוש חוזר.', { error: true });
  }
}

export async function rememberSignature(dataUrl) {
  const list = await savedSignatures();
  await storeSignatures([dataUrl, ...list.filter((x) => x !== dataUrl)]);
}

export async function forgetSignature(dataUrl) {
  await storeSignatures((await savedSignatures()).filter((x) => x !== dataUrl));
}

/** יחס גובה/רוחב של תמונה */
export function imageRatio(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalHeight / img.naturalWidth || 0.4);
    img.onerror = () => resolve(0.4);
    img.src = dataUrl;
  });
}

/* ---------- משטח החתימה ---------- */

/** פותח את משטח החתימה. מחזיר dataUrl של PNG, או null בביטול */
export function drawSignature() {
  return new Promise((resolve) => {
    let color = INK_COLORS[0].hex;
    let strokes = [];
    let current = null;
    const root = h(`
      <div class="sigpad" role="dialog" aria-modal="true" aria-label="חתימה חדשה">
        <header class="sigpad-bar">
          <button class="icon-btn" data-a="cancel" aria-label="ביטול"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          <h2>חתימה חדשה</h2>
          <button class="sigpad-ok" data-a="ok">אישור</button>
        </header>
        <div class="sigpad-area">
          <canvas></canvas>
          <div class="sigpad-line"><span>חתמו כאן</span></div>
        </div>
        <footer class="sigpad-tools">
          <div class="inks">${INK_COLORS.map((c, i) => `<button class="ink" data-c="${c.hex}" aria-label="${c.name}" aria-pressed="${i === 0}" style="--c:${c.hex}"></button>`).join('')}</div>
          <label class="remember"><input type="checkbox" checked><span>לשמור לשימוש חוזר</span></label>
          <button class="btn quiet" data-a="clear">ניקוי</button>
        </footer>
      </div>`);
    document.body.append(root);
    const canvas = root.querySelector('canvas');
    const area = root.querySelector('.sigpad-area');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const size = () => {
      const r = area.getBoundingClientRect();
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
      redraw();
    };

    // קו חלק: עקומות בין נקודות האמצע, עובי לפי מהירות (מהיר = דק יותר)
    function redraw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const s of strokes) {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        const pts = s.pts;
        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(pts[0].x, pts[0].y, pts[0].w / 2, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        for (let k = 1; k < pts.length; k++) {
          const a = pts[k - 1], b = pts[k];
          const m0 = k > 1 ? mid(pts[k - 2], a) : a;
          const m1 = mid(a, b);
          ctx.lineWidth = (a.w + b.w) / 2;
          ctx.beginPath();
          ctx.moveTo(m0.x, m0.y);
          ctx.quadraticCurveTo(a.x, a.y, m1.x, m1.y);
          ctx.stroke();
        }
      }
    }
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

    const point = (e, prev) => {
      const r = canvas.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp };
      const base = Math.max(2.2, Math.min(4.2, r.width / 160));
      if (!prev) return { ...p, w: base };
      const v = Math.hypot(p.x - prev.x, p.y - prev.y) / Math.max(1, p.t - prev.t);
      const target = base * Math.max(0.55, Math.min(1.25, 1.25 - v * 0.35));
      return { ...p, w: prev.w * 0.6 + target * 0.4 };
    };

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      current = { pts: [point(e)] };
      strokes.push(current);
      root.classList.add('signed');
      redraw();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!current) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ev of evs.length ? evs : [e]) current.pts.push(point(ev, current.pts[current.pts.length - 1]));
      redraw();
    });
    const end = () => { current = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    root.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
      color = b.dataset.c;
      root.querySelectorAll('[data-c]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      redraw();
    }));
    root.querySelector('[data-a="clear"]').addEventListener('click', () => { strokes = []; root.classList.remove('signed'); redraw(); });

    const close = (val) => {
      window.removeEventListener('resize', size);
      root.remove();
      resolve(val);
    };
    root.close = () => close(null); // לכפתור "חזרה" של אנדרואיד
    root.querySelector('[data-a="cancel"]').addEventListener('click', () => close(null));
    root.querySelector('[data-a="ok"]').addEventListener('click', async () => {
      const data = strokes.length ? trimCanvas(canvas) : null;
      if (!data) { toast('צריך לחתום על המשטח קודם.', { error: true }); return; }
      if (root.querySelector('.remember input').checked) await rememberSignature(data);
      close(data);
    });
    window.addEventListener('resize', size);
    requestAnimationFrame(size);
  });
}

/** סגירת משטח חתימה פתוח (כפתור "חזרה"). מחזיר true אם היה פתוח */
export function closeSignaturePad() {
  const pad = document.querySelector('.sigpad');
  if (!pad) return false;
  pad.close();
  return true;
}

/** חיתוך הקנבס לגבולות הקו — כמו בדסקטופ */
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
