"""בדיקת חבילת ה-appx שנבנתה: python -I .github/scripts/verify-appx.py <file.appx>

בודק את המניפסט שבתוך החבילה (שהיא קובץ zip) לפני ההעלאה ל-Partner Center.
"""
import os
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {
    'f': 'http://schemas.microsoft.com/appx/manifest/foundation/windows10',
    'uap': 'http://schemas.microsoft.com/appx/manifest/uap/windows10',
    'rescap': 'http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities',
}
errors = []


def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond:
        errors.append(msg)


path = sys.argv[1]
with zipfile.ZipFile(path) as z:
    names = z.namelist()
    manifest = z.read('AppxManifest.xml').decode('utf-8')

print(manifest)
root = ET.fromstring(manifest)
ident = root.find('f:Identity', NS)
app = root.find('f:Applications/f:Application', NS)

want_name = os.environ.get('ID_NAME') or 'EitanPDF.Test'
want_pub = os.environ.get('ID_PUBLISHER') or 'CN=EitanPDF-Test'
check(ident.get('Name') == want_name, f'Identity Name = {want_name}')
check(ident.get('Publisher') == want_pub, f'Identity Publisher = {want_pub}')
check(ident.get('Version', '').endswith('.0'), f'גרסה מסתיימת ב-0 (דרישת החנות): {ident.get("Version")}')
check(root.findtext('f:Properties/f:DisplayName', namespaces=NS) == 'איתןPDF', 'DisplayName = איתןPDF')
check(app.get('Id') == 'EitanPDF', 'Application Id = EitanPDF')
check(app.get('Executable', '').endswith('EitanPDF.exe'), f'Executable = {app.get("Executable")}')

types = [t.text for t in app.findall('.//uap:FileTypeAssociation/uap:SupportedFileTypes/uap:FileType', NS)]
check('.pdf' in types, f'שיוך קבצים ל-.pdf (נמצא: {types})')
check(root.find('f:Capabilities/rescap:Capability[@Name="runFullTrust"]', NS) is not None, 'runFullTrust')

check('resources.pri' in names, 'resources.pri (נכסים בכמה גדלים)')
for asset in ('StoreLogo', 'Square44x44Logo', 'Square150x150Logo', 'Wide310x150Logo'):
    check(any(n.startswith(f'assets/{asset}.') for n in names), f'נכס {asset}')
check(any('targetsize-' in n and 'altform-unplated' in n for n in names), 'אייקונים unplated לשורת המשימות')

check(not any(n.endswith('app-update.yml') for n in names), 'אין app-update.yml (בלי עדכון אוטומטי מחוץ לחנות)')
check('AppxSignature.p7x' not in names, 'החבילה לא חתומה (החנות חותמת)')

if errors:
    sys.exit(f'{len(errors)} בדיקות נכשלו')
print('החבילה תקינה')
