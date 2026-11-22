#!/usr/bin/env python3
"""יוצר את נכסי הלוגו של חבילת Microsoft Store (build/appx/) מתוך build/logo-full.png.

שימוש:  python3 build/make-appx-assets.py
דורש Pillow (pip install pillow). את הקבצים שנוצרים שומרים בריפו, כך שהבנייה עצמה לא צריכה Python.

השמות לפי המוסכמה של Windows (MRT): ‎Name.scale-200.png‏, ‎Name.targetsize-32_altform-unplated.png‏.
כשיש קבצים בגדלים כאלה electron-builder מריץ makepri ובונה resources.pri, ו-Windows בוחר את הגודל המתאים למסך.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'logo-full.png'
OUT = ROOT / 'appx'
SCALES = (100, 125, 150, 200, 400)

# שם הנכס: (רוחב, גובה) בגודל scale-100, וכמה מהגובה הלוגו תופס
ASSETS = {
    'StoreLogo': ((50, 50), 0.92),
    'Square44x44Logo': ((44, 44), 0.92),
    'SmallTile': ((71, 71), 0.70),
    'Square150x150Logo': ((150, 150), 0.66),
    'Wide310x150Logo': ((310, 150), 0.66),
    'LargeTile': ((310, 310), 0.66),
}
# אייקונים לשורת המשימות, לתפריט התחל ולסייר (גדלים קבועים בפיקסלים)
TARGET_SIZES = (16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256)


def render(src, w, h, fill):
    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    side = max(1, round(min(w, h) * fill))
    logo = src.resize((side, side), Image.LANCZOS)
    canvas.alpha_composite(logo, ((w - side) // 2, (h - side) // 2))
    return canvas


def main():
    src = Image.open(SRC).convert('RGBA')
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob('*.png'):
        old.unlink()
    count = 0
    for name, ((w, h), fill) in ASSETS.items():
        for s in SCALES:
            img = render(src, round(w * s / 100), round(h * s / 100), fill)
            img.save(OUT / f'{name}.scale-{s}.png', optimize=True)
            count += 1
    for t in TARGET_SIZES:
        img = render(src, t, t, 1.0 if t <= 32 else 0.94)
        img.save(OUT / f'Square44x44Logo.targetsize-{t}.png', optimize=True)
        # unplated: בלי "לוחית" צבע מאחורי האייקון בשורת המשימות
        img.save(OUT / f'Square44x44Logo.targetsize-{t}_altform-unplated.png', optimize=True)
        count += 2
    print(f'{count} קבצים נוצרו ב-{OUT}')


if __name__ == '__main__':
    main()
