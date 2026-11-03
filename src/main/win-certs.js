// תעודות ממאגר התעודות של Windows (כולל כרטיס חכם / טוקן USB של קומסיין, PersonalID וכו').
// הכל דרך PowerShell ו-.NET שכבר מותקנים בכל Windows — בלי רכיבים נוספים.
// בקשת ה-PIN של הכרטיס מוצגת ע"י Windows עצמו.
const { execFile } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { Signer } = require('@signpdf/utils');

const isWin = process.platform === 'win32';

function runPowerShell(script, env, timeout) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      env: { ...process.env, ...env }, windowsHide: true, timeout: timeout || 30000, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8',
    }, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message || '').trim();
        return reject(new Error(msg.split(/\r?\n/).find((l) => l.trim()) || 'PowerShell נכשל'));
      }
      resolve(stdout);
    });
  });
}

const LIST_SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$now = Get-Date
$list = Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt $now -and $_.NotBefore -lt $now } | ForEach-Object {
  $ku = $_.Extensions | Where-Object { $_ -is [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension] } | Select-Object -First 1
  $eku = @($_.EnhancedKeyUsageList | ForEach-Object { $_.ObjectId })
  [pscustomobject]@{
    thumb = $_.Thumbprint
    name = $_.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
    email = $_.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::EmailName, $false)
    issuer = $_.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $true)
    notAfter = $_.NotAfter.ToString('yyyy-MM-dd')
    selfSigned = ($_.Subject -eq $_.Issuer)
    ku = $(if ($ku) { [int]$ku.KeyUsages } else { -1 })
    eku = $eku
  }
}
ConvertTo-Json -InputObject @($list) -Depth 3 -Compress
`;

// שימושים שמתאימים לחתימה על מסמכים
const SIGNING_EKU = new Set([
  '1.3.6.1.5.5.7.3.4', // דואר מאובטח (S/MIME) — רוב תעודות החתימה האישיות
  '1.3.6.1.4.1.311.10.3.12', // חתימת מסמכים (Microsoft)
  '1.2.840.113583.1.1.5', // Adobe Authentic Documents Trust
  '1.3.6.1.5.5.7.3.36', // חתימת מסמכים (RFC 9336)
  '2.5.29.37.0', // כל שימוש
  '1.3.6.1.5.5.7.3.2', // אימות לקוח — נפוץ בכרטיסים חכמים שמשמשים גם לחתימה
]);
const KU_DIGITAL_SIGNATURE = 0x80;
const KU_NON_REPUDIATION = 0x40;

/** רשימת תעודות שאפשר לחתום בהן. מחוץ ל-Windows — רשימה ריקה */
async function list() {
  if (!isWin) return [];
  const out = await runPowerShell(LIST_SCRIPT, {}, 30000);
  let arr;
  try { arr = JSON.parse(out.trim() || '[]'); } catch (e) { return []; }
  if (!Array.isArray(arr)) arr = [arr];
  return arr
    .filter((c) => c && c.thumb)
    .filter((c) => c.ku === -1 || (c.ku & (KU_DIGITAL_SIGNATURE | KU_NON_REPUDIATION)))
    .filter((c) => !c.eku || !c.eku.length || c.eku.some((o) => SIGNING_EKU.has(o)))
    .map((c) => ({ thumb: c.thumb, name: c.name || c.email || c.thumb, email: c.email || '', issuer: c.issuer || '', notAfter: c.notAfter, selfSigned: !!c.selfSigned }));
}

const SIGN_SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Security
$cert = Get-Item -Path ('Cert:\\CurrentUser\\My\\' + $env:EITAN_THUMB)
if (-not $cert.HasPrivateKey) { throw 'NO_KEY' }
$bytes = [IO.File]::ReadAllBytes($env:EITAN_IN)
$content = New-Object System.Security.Cryptography.Pkcs.ContentInfo -ArgumentList (,$bytes)
$cms = New-Object System.Security.Cryptography.Pkcs.SignedCms -ArgumentList $content, $true
$signer = New-Object System.Security.Cryptography.Pkcs.CmsSigner -ArgumentList $cert
$signer.DigestAlgorithm = New-Object System.Security.Cryptography.Oid -ArgumentList '2.16.840.1.101.3.4.2.1'
$signer.IncludeOption = [System.Security.Cryptography.X509Certificates.X509IncludeOption]::WholeChain
$when = [DateTime]::Parse($env:EITAN_TIME, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
[void]$signer.SignedAttributes.Add((New-Object System.Security.Cryptography.Pkcs.Pkcs9SigningTime -ArgumentList $when))
$cms.ComputeSignature($signer, $false)
[IO.File]::WriteAllBytes($env:EITAN_OUT, $cms.Encode())
`;

/** חותם שמשתמש בתעודה ממאגר Windows (לפי טביעת אצבע) */
class WindowsStoreSigner extends Signer {
  constructor(thumb) {
    super();
    if (!/^[0-9A-Fa-f]{40}$/.test(String(thumb || ''))) throw new Error('תעודה לא תקינה');
    this.thumb = thumb;
  }

  async sign(pdfBuffer, signingTime) {
    if (!isWin) throw new Error('חתימה ממאגר התעודות זמינה רק ב-Windows');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'eitanpdf-sign-'));
    const inPath = path.join(dir, 'in.bin');
    const outPath = path.join(dir, 'out.p7s');
    try {
      await fs.writeFile(inPath, pdfBuffer);
      await runPowerShell(SIGN_SCRIPT, {
        EITAN_THUMB: this.thumb, EITAN_IN: inPath, EITAN_OUT: outPath,
        EITAN_TIME: (signingTime || new Date()).toISOString(),
      }, 5 * 60 * 1000); // זמן להקליד PIN
      return await fs.readFile(outPath);
    } catch (e) {
      const m = String(e.message);
      if (/canceled|cancelled|בוטל/i.test(m)) throw new Error('החתימה בוטלה');
      if (/NO_KEY|keyset|Keyset/i.test(m)) throw new Error('לא נמצא המפתח הפרטי של התעודה. ודאו שהכרטיס החכם מחובר.');
      if (/PIN|password/i.test(m)) throw new Error('קוד ה-PIN שגוי או שהכרטיס נעול');
      throw new Error('החתימה נכשלה: ' + m);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

module.exports = { list, WindowsStoreSigner, isSupported: () => isWin };
