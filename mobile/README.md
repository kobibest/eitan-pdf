# איתןPDF לאנדרואיד

אפליקציית Capacitor מעל אותו מנוע של גרסת Windows (`src/core`). הקוד המשותף לא מועתק לריפו:
`scripts/build-web.mjs` מרכיב את `www/` בזמן הבנייה מתוך `mobile/web` (הממשק), `src/core`,
`assets/fonts`, `build/icon.png` ו-`node_modules` של השורש.

## בנייה מקומית

דרוש: Node 22, JDK 21, Android SDK (36).

```bash
npm ci                 # בשורש הריפו
cd mobile && npm ci
npm run apk            # ← android/app/build/outputs/apk/debug/app-debug.apk
```

לבדיקה מהירה בדפדפן במחשב: `npm run build:web`, ואז להגיש את `www/` בשרת סטטי כלשהו.

## מבנה

- `web/` — הממשק (עברית, RTL, מגע)
- `android/` — פרויקט Gradle; `EitanFilesPlugin.java` הוא תוסף מקומי לפתיחה, קבלה ושמירה של קבצים
- minSdk 24 (Android 7.0), targetSdk 36

ב-GitHub Actions ‏(`android-test.yml`) כל דחיפה ל-`test` בונה APK של debug ומעלה אותו כ-Artifact בשם `EitanPDF-Android-test`.
