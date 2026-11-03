#!/usr/bin/env bash
# בניית גרסת macOS של איתןPDF — קובץ ‎.dmg אחד (Universal) שמתאים גם למעבדי Apple (M1 ומעלה) וגם ל-Intel.
# חייב לרוץ על מחשב macOS (או על macos-latest ב-GitHub Actions).
#
# חתימה:
# - בלי תעודת Apple (ברירת מחדל): חתימת ad-hoc. התוכנה רצה, אבל בפתיחה הראשונה macOS יציג אזהרה
#   וצריך לאשר ב"הגדרות מערכת ← פרטיות ואבטחה ← פתח בכל זאת".
# - עם תעודת Developer ID: מגדירים CSC_LINK (תעודת ‎.p12 בבסיס64 או נתיב) ו-CSC_KEY_PASSWORD,
#   ולאישור (notarization) גם APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER
#   או APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID. הכל קורה אוטומטית.
set -euo pipefail
cd "$(dirname "$0")/.."
[ "$(uname)" = "Darwin" ] || { echo "הבנייה ל-macOS חייבת לרוץ על macOS" >&2; exit 1; }

# סודות שלא הוגדרו ב-GitHub מגיעים כמחרוזת ריקה — electron-builder מתייחס אליה כנתיב, אז מסירים אותם
for v in CSC_LINK CSC_KEY_PASSWORD CSC_NAME APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID; do
  [ -n "${!v:-}" ] || unset "$v"
done

EXTRA=()
if [ -z "${CSC_LINK:-}" ] && [ -z "${CSC_NAME:-}" ]; then
  echo "אין תעודת Apple — חתימת ad-hoc"
  export CSC_IDENTITY_AUTO_DISCOVERY=false
  EXTRA+=(-c.mac.identity=- -c.mac.hardenedRuntime=false)
fi

npx electron-builder --mac --universal --publish never ${EXTRA[@]+"${EXTRA[@]}"}
ls -la dist/*.dmg
