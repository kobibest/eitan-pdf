/* צילומי מסך אוטומטיים של הממשק: xvfb-run electron test/shoot.js <תיקיית פלט> <קבצי pdf...> */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const scriptIdx = process.argv.findIndex((a) => /shoot\.js$/.test(a));
const outDir = process.argv[scriptIdx + 1];
app.commandLine.appendSwitch('disable-gpu');
require('../main.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  let win;
  while (!(win = BrowserWindow.getAllWindows()[0])) await wait(100);
  win.setSize(1440, 900);
  while (win.webContents.isLoading()) await wait(100);
  const js = (code) => win.webContents.executeJavaScript(code);
  const errors = [];
  win.webContents.on('console-message', (e) => {
    const lvl = e.level ?? e;
    if (lvl === 'error' || lvl === 3) errors.push(e.message);
  });
  const shot = async (name) => {
    await wait(900);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, name + '.png'), img.toPNG());
  };
  const steps = JSON.parse(process.env.SHOOT_STEPS || '[]');
  await wait(1500);
  for (const s of steps) {
    if (s.js) {
      try { await js(s.js); } catch (e) { errors.push('step error: ' + e.message); }
    }
    if (s.clickSel) {
      // לחיצה על אלמנט לפי סלקטור: { clickSel: '.x', nth: 0, at: [fx, fy] } (חלק יחסי מהמלבן)
      const r = await js(`(() => { const el = document.querySelectorAll(${JSON.stringify(s.clickSel)})[${s.nth || 0}]; if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; })()`);
      if (!r) errors.push('clickSel not found: ' + s.clickSel);
      else s.click = [Math.round(r[0] + r[2] * ((s.at || [0.5, 0.5])[0])), Math.round(r[1] + r[3] * ((s.at || [0.5, 0.5])[1]))];
      await wait(200);
    }
    if (s.click) {
      const [x, y] = s.click;
      win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
      win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      await wait(300);
    }
    if (s.type) {
      for (const ch of s.type) win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
      await wait(200);
    }
    if (s.key) {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: s.key });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: s.key });
      await wait(200);
    }
    if (s.eval) {
      try { errors.push('eval: ' + JSON.stringify(await js(s.eval))); } catch (e) { errors.push('eval error: ' + e.message); }
    }
    if (s.saveTo) {
      try {
        const arr = await js(`__app.buildBytes(__app.S.pages).then((b) => Array.from(b))`);
        fs.writeFileSync(path.join(outDir, s.saveTo), Buffer.from(arr));
      } catch (e) { errors.push('save error: ' + e.message); }
    }
    if (s.wait) await wait(s.wait);
    if (s.shot) await shot(s.shot);
  }
  try { errors.push(...(await js('window.__errs || []'))); } catch (e) {}
  fs.writeFileSync(path.join(outDir, 'errors.txt'), errors.join('\n'));
  app.exit(0);
});
