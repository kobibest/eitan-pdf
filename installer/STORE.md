# הגשה לחנות מיקרוסופט

אחרי כל גרסה חדשה (ה-workflow ‏`Release` הסתיים בהצלחה), ה-workflow ‏`Microsoft Store` מחליף בהגשה
של האפליקציה את הקישור לקובץ ההתקנה — `EitanPDF-Setup-<גרסה>-x64.exe` מתוך ה-Release ב-GitHub —
ושולח אותה לאישור של מיקרוסופט. שאר פרטי ההגשה (תיאור, צילומי מסך, שפות, פרמטרים של התקנה שקטה)
נשארים כמו שהם ב-Partner Center. האישור עצמו לוקח בדרך כלל עד כמה ימי עסקים.

אם אותו קישור כבר נמצא בהגשה, התהליך לא עושה כלום. עד שמגדירים את ה-Secrets הוא מדלג בשקט.

## הגדרה חד-פעמית

1. **חיבור Azure AD ל-Partner Center:** ב-[Partner Center](https://partner.microsoft.com/dashboard) ←
   גלגל השיניים ← Account settings ← User management ← Microsoft Entra applications. אם החשבון עוד לא
   משויך לספריית Entra (Azure AD) — משייכים (Tenants ← Associate).
2. **יצירת אפליקציית גישה:** באותו מסך ← Create Microsoft Entra application, עם התפקיד **Manager**.
   מהמסך של האפליקציה מעתיקים את ה-**Tenant ID** ואת ה-**Client ID**, ולוחצים Add new key —
   זה ה-**Client secret** (מוצג פעם אחת בלבד).
3. **Seller ID:** Account settings ← Legal info ← Seller ID.
4. **Product ID:** בדף של האפליקציה ב-Partner Center ← Product identity ← Partner Center ID.
5. ב-GitHub: Settings ← Secrets and variables ← Actions ← New repository secret, חמישה Secrets:

   | Secret | ערך |
   | --- | --- |
   | `STORE_TENANT_ID` | Tenant ID |
   | `STORE_CLIENT_ID` | Client ID |
   | `STORE_CLIENT_SECRET` | המפתח שנוצר ב-Add new key |
   | `STORE_SELLER_ID` | Seller ID |
   | `STORE_PRODUCT_ID` | Partner Center ID של האפליקציה |

התהליך מעדכן אפליקציה קיימת בלבד: ההגשה הראשונה לחנות נעשית ידנית ב-Partner Center.

## הרצה ידנית ובדיקה

Actions ← Microsoft Store ← Run workflow:

- **dry_run** מסומן — בודק את ההתחברות ומציג את ההגשה הנוכחית ומה היה נשלח, בלי לשלוח. מומלץ בפעם הראשונה.
- **version** — להגיש גרסה מסוימת (ריק = הגרסה שב-`package.json`).

מהמחשב: `node installer/store-submit.mjs <קישור לקובץ ההתקנה> [--dry-run]`, עם אותם חמישה משתני סביבה.
