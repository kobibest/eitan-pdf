# שחרור איתןPDF לאנדרואיד בחנות Play

## איך זה בנוי

- **מפתח העלאה (upload key)** — המפתח שלכם, שחותם על הקובץ שמעלים ל-Play. נשמר רק אצלכם ובתוך GitHub Secrets, אף פעם לא בריפו.
- **מפתח חתימת האפליקציה** — Google מחזיקה אותו (Play App Signing) וחותמת בו את מה שמגיע למשתמשים. אם מפתח ההעלאה אובד או דולף, אפשר לבקש מ-Google לאפס אותו בלי לאבד את האפליקציה.
- **הבנייה** — `.github/workflows/android-release.yml` בונה AAB חתום (להעלאה לחנות) ו-APK חתום, ומוודא את החתימות.

## 1. יצירת מפתח ההעלאה (פעם אחת, במחשב Windows)

צריך את `keytool`, שמגיע עם Java. אם Android Studio מותקן, הוא כבר נמצא במחשב. אחרת אפשר להתקין Java (למשל Temurin) מ-adoptium.net.

ב-PowerShell:

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v -storetype PKCS12 -keystore "$HOME\Documents\eitanpdf-upload.jks" -alias upload -keyalg RSA -keysize 4096 -validity 10000
```

(עם Java רגילה: `keytool -genkeypair ...` עם אותם פרמטרים.)

- הכלי ישאל סיסמה, ואחר כך שם, ארגון ומדינה. אפשר לכתוב באנגלית, למשל `Kobi Eitan`, `Eitan`, ומדינה `IL`.
- בפורמט PKCS12 סיסמת המפתח זהה לסיסמת הקובץ.
- **גיבוי:** שמרו את `eitanpdf-upload.jks` ואת הסיסמה במקום בטוח, למשל במנהל סיסמאות. אל תשלחו אותם במייל ואל תעלו אותם לריפו.

## 2. הכנסת המפתח ל-GitHub Secrets

קידוד הקובץ ל-Base64 והעתקה ללוח (PowerShell):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\Documents\eitanpdf-upload.jks")) | Set-Clipboard
```

ב-GitHub: הריפו ← Settings ← Secrets and variables ← Actions ← New repository secret. יוצרים ארבעה:

| שם | ערך |
|---|---|
| `EITANPDF_UPLOAD_KEYSTORE_B64` | מה שהועתק ללוח |
| `EITANPDF_KEYSTORE_PASSWORD` | הסיסמה |
| `EITANPDF_KEY_ALIAS` | `upload` |
| `EITANPDF_KEY_PASSWORD` | אותה סיסמה |

## 3. בניית שחרור

- אחרי שהקובץ נמצא ב-main: לשונית Actions ← **Android release build** ← Run workflow.
- או, גם לפני המיזוג: דחיפה של תגית שמתחילה ב-`android-v`, למשל `android-v1.2.1`.

התוצאה היא Artifact בשם `EitanPDF-Android-release`, ובו:

- `EitanPDF-Android-<גרסה>.aab` — **זה הקובץ שמעלים ל-Play.**
- `EitanPDF-Android-<גרסה>.apk` — APK חתום, להתקנה ישירה.

**מספר הגרסה:** `versionCode` נגזר מהגרסה ב-`package.json` (1.2.1 → 1020100). Play לא מקבל את אותו `versionCode` פעמיים. לכן כל העלאה צריכה גרסה חדשה, או משתנה סביבה `ANDROID_BUILD` (1–99) לבנייה נוספת של אותה גרסה.

## 4. Play Console (פעם אחת)

1. **יצירת האפליקציה:** שם "איתןPDF", שפת ברירת מחדל עברית, חינמית.
2. **App integrity:** להשאיר את Play App Signing מופעל (ברירת המחדל). בהעלאה הראשונה Play רושם את מפתח ההעלאה.
3. **בדיקה פנימית (Internal testing):** להעלות את ה-AAB ולהוסיף בודקים. לחשבון אישי חדש Google דורשת גם בדיקה סגורה עם בודקים לפני פרסום פתוח.
4. **Store listing:**
   - תיאור.
   - סמל 512×512, אפשר `build/icon.png`.
   - תמונה ראשית 1024×500.
   - לפחות 2 צילומי מסך מהטלפון.
5. **App content:**
   - **מדיניות פרטיות:** קישור לעמוד שאומר שהאפליקציה לא אוספת מידע ושהקבצים לא יוצאים מהמכשיר.
   - **Data safety:** "No data collected" ו-"No data shared".
   - **Ads:** אין.
   - **Content rating:** למלא את השאלון.
   - **Target audience:** 18+ או כללי.
   - **App access:** אין התחברות.

## מה כבר מוכן באפליקציה בשביל Play

- **targetSdk 36 ו-minSdk 24** (Android 7.0).
- **הרשאות:** רק INTERNET, שמגיעה מ-Capacitor. אין הרשאות אחסון, גלריה או מצלמה, כי הקבצים עוברים דרך בוחר הקבצים של המערכת, התמונות דרך בוחר התמונות, והצילום דרך אפליקציית המצלמה.
- **אין קוד נייטיב**, ולכן דרישת גודל הדף 16KB לא רלוונטית.
- **אין גיבוי לענן** (`allowBackup=false`). החתימות השמורות לא יוצאות מהמכשיר.
- **בדיקות lintVital של שחרור** רצות בכל דחיפה ל-test, כחלק מבניית ה-AAB.

## הערה על התקנה ישירה מול Play

ה-APK החתום שנבנה כאן חתום במפתח ההעלאה. מה שמשתמשים מקבלים מ-Play חתום במפתח של Google. לכן אי אפשר לעדכן מגרסה שהותקנה ישירות לגרסה מ-Play, או להפך, בלי להסיר קודם. אם רוצים להציע גם הורדה ישירה מהאתר, עדיף להוריד מ-Play Console את ה-APK שחתום במפתח של Google (App bundle explorer ← Downloads ← Signed universal APK).
