/*
 * חתימה דיגיטלית (PAdES בסיסי / adbe.pkcs7.detached) ובדיקת חתימות.
 * רץ רק ב-Node (תהליך ראשי ובדיקות) — הממשק מגיע לכאן דרך IPC.
 *
 * התהליך:
 *   1. addPlaceholder — עדכון מצטבר שמוסיף שדה חתימה ומקום ריק לחתימה (ByteRange + Contents).
 *      עדכון מצטבר לא נוגע בבייטים הקיימים, כך שחתימות קודמות נשארות תקינות.
 *   2. sign — מחשב את הטווח, מחתים את הבייטים עם התעודה (קובץ ‎.pfx או מאגר Windows) ומטמיע.
 */
const crypto = require('crypto');
const forge = require('node-forge');
const { PDFDocument, PDFName, PDFHexString, PDFString, PDFArray, PDFNumber, PDFDict, PDFRef } = require('pdf-lib');
const { SignPdf } = require('@signpdf/signpdf');
const { Signer, DEFAULT_BYTE_RANGE_PLACEHOLDER, SIG_FLAGS, ANNOTATION_FLAGS } = require('@signpdf/utils');
const Ops = require('./ops.js');

const SIGNATURE_LENGTH = 16384; // בייטים — מספיק לשרשרת תעודות ארוכה של כרטיס חכם

/* ---------- מקום לחתימה ---------- */

/**
 * מראה גלוי לחתימה: מציירים במסמך עזר בגודל המסגרת, מטמיעים אותו כ-Form XObject,
 * ועוטפים בסיבוב של העמוד (מראה של ווידג'ט נמצא במערכת הקואורדינטות של העמוד לפני סיבוב).
 */
async function buildAppearance(doc, page, viewRect, pageRect, ap) {
  const scratch = await PDFDocument.create();
  const fonts = await Ops.loadFonts(scratch, ap.fonts);
  const sp = scratch.addPage([viewRect.w, viewRect.h]);
  await Ops.renderDigiSig(scratch, sp, { ...ap, w: viewRect.w, h: viewRect.h }, fonts);
  const [embedded] = await doc.embedPdf(await scratch.save());
  const W = pageRect[2] - pageRect[0], H = pageRect[3] - pageRect[1];
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  const m = rot === 90 ? [0, 1, -1, 0, W, 0] : rot === 180 ? [-1, 0, 0, -1, W, H] : rot === 270 ? [0, -1, 1, 0, 0, H] : [1, 0, 0, 1, 0, 0];
  const XObject = doc.context.obj({});
  XObject.set(PDFName.of('EP'), embedded.ref);
  return doc.context.register(doc.context.stream(`q ${m.join(' ')} cm /EP Do Q`, {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, W, H], Resources: { XObject },
  }));
}

/**
 * opts: { pageIndex, rect: {x,y,w,h} בקואורדינטות התצוגה (או null לחתימה בלתי נראית),
 *         name, reason, location, contact, signingTime,
 *         appearance: { fonts:{regular,bold}, signer, date, reason, location, image, color } — למראה גלוי }
 */
async function addPlaceholder(bytes, opts) {
  const o = opts || {};
  const doc = await PDFDocument.load(bytes, { forIncrementalUpdate: true, updateMetadata: false });
  const ctx = doc.context;
  const pages = doc.getPages();
  const page = pages[Math.max(0, Math.min(pages.length - 1, o.pageIndex || 0))];
  const rect = o.rect && o.rect.w > 0 && o.rect.h > 0 ? Ops.viewRectToPage(page, o.rect) : [0, 0, 0, 0];

  const byteRange = PDFArray.withContext(ctx);
  byteRange.push(PDFNumber.of(0));
  for (let i = 0; i < 3; i++) byteRange.push(PDFName.of(DEFAULT_BYTE_RANGE_PLACEHOLDER));

  const when = o.signingTime || new Date();
  const sigEntries = {
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    SubFilter: 'adbe.pkcs7.detached',
    ByteRange: byteRange,
    Contents: PDFHexString.of('0'.repeat(SIGNATURE_LENGTH * 2)),
    M: PDFString.fromDate(when),
  };
  if (o.name) sigEntries.Name = PDFHexString.fromText(o.name);
  if (o.reason) sigEntries.Reason = PDFHexString.fromText(o.reason);
  if (o.location) sigEntries.Location = PDFHexString.fromText(o.location);
  if (o.contact) sigEntries.ContactInfo = PDFHexString.fromText(o.contact);
  const sigRef = ctx.register(ctx.obj(sigEntries));

  // שם שדה ייחודי
  const form = doc.getForm();
  const taken = new Set(form.getFields().map((f) => f.getName()));
  let n = 1;
  while (taken.has(`Signature${n}`)) n++;

  const w = rect[2] - rect[0], h = rect[3] - rect[1];
  const apRef = w > 0 && o.appearance
    ? await buildAppearance(doc, page, o.rect, rect, o.appearance)
    : ctx.register(ctx.stream('', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, w, h], Resources: {} }));
  const widgetRef = ctx.register(ctx.obj({
    Type: 'Annot',
    Subtype: 'Widget',
    FT: 'Sig',
    Rect: rect,
    V: sigRef,
    T: PDFHexString.fromText(`Signature${n}`),
    F: ANNOTATION_FLAGS.PRINT | ANNOTATION_FLAGS.LOCKED,
    P: page.ref,
    AP: { N: apRef },
  }));

  page.node.addAnnot(widgetRef);
  const acro = doc.catalog.getOrCreateAcroForm();
  acro.addField(widgetRef);
  acro.dict.set(PDFName.of('SigFlags'), PDFNumber.of(SIG_FLAGS.SIGNATURES_EXIST | SIG_FLAGS.APPEND_ONLY));
  // שהצגים לא יבנו מחדש מראות של שדות (זה ישבור את החתימה בעיני Adobe)
  acro.dict.delete(PDFName.of('NeedAppearances'));
  return doc.save({ useObjectStreams: false });
}

/* ---------- חותמים ---------- */

/** קריאת קובץ ‎.pfx: מפתח פרטי, התעודה שלו ושאר השרשרת */
function readP12(p12Bytes, passphrase) {
  let p12;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.binary.raw.encode(new Uint8Array(p12Bytes)));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase || '');
  } catch (e) {
    if (/mac|password|Invalid|decrypt/i.test(String(e.message))) throw new Error('הסיסמה של קובץ התעודה שגויה');
    throw new Error('לא הצלחנו לקרוא את קובץ התעודה. אם התעודה מסוג ECC, התקינו אותה ב-Windows ובחרו אותה ממאגר התעודות.');
  }
  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ];
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map((b) => b.cert).filter(Boolean);
  const key = keyBags.map((b) => b.key).find(Boolean);
  if (!key || !certs.length) throw new Error('בקובץ התעודה אין מפתח פרטי לחתימה, או שסוג המפתח לא נתמך (נסו דרך מאגר התעודות של Windows).');
  const cert = certs.find((c) => c.publicKey && c.publicKey.n && c.publicKey.n.compareTo(key.n) === 0 && c.publicKey.e.compareTo(key.e) === 0);
  if (!cert) throw new Error('בקובץ התעודה אין תעודה שמתאימה למפתח הפרטי');
  return { key, cert, certs };
}

/**
 * forge מפענח שמות UTF-8 לבייטים גולמיים, וכשהוא בונה את פרטי החותם (issuerAndSerial)
 * הוא מקודד אותם שוב — ושם עברי של מנפיק יוצא משובש וצגים לא מוצאים את התעודה. מנרמלים.
 */
function normalizeNames(cert) {
  for (const part of [cert.issuer, cert.subject]) {
    for (const a of part.attributes) {
      if (a.valueTagClass === forge.asn1.Type.UTF8 && typeof a.value === 'string') {
        try { a.value = forge.util.decodeUtf8(a.value); } catch (e) { /* כבר מפוענח */ }
      }
    }
  }
}

/** חותם מתוך קובץ ‎.pfx/.p12 (CMS מנותק, SHA-256, עם זמן חתימה) */
class P12FileSigner extends Signer {
  constructor(p12Bytes, passphrase) {
    super();
    this.p12 = readP12(p12Bytes, passphrase);
  }

  async sign(pdfBuffer, signingTime) {
    const { key, cert, certs } = this.p12;
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(pdfBuffer.toString('binary'));
    for (const c of certs) p7.addCertificate(c);
    normalizeNames(cert);
    p7.addSigner({
      key,
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.signingTime, value: signingTime || new Date() },
        { type: forge.pki.oids.messageDigest },
      ],
    });
    p7.sign({ detached: true });
    return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
  }
}

function p12Signer(p12Bytes, passphrase) {
  return new P12FileSigner(p12Bytes, passphrase);
}

/** חתימה מלאה: מקום + חתימה */
async function signPdf(bytes, signer, opts) {
  const o = { ...(opts || {}) };
  o.signingTime = o.signingTime || new Date();
  const withPlaceholder = await addPlaceholder(bytes, o);
  const signed = await new SignPdf().sign(Buffer.from(withPlaceholder), signer, o.signingTime);
  return new Uint8Array(signed);
}

/* ---------- תעודות ---------- */

const OID_CN = forge.pki.oids.commonName;

function readCN(attrs) {
  const a = attrs.find((x) => x.type === OID_CN) || attrs[0];
  if (!a) return '';
  try { return forge.util.decodeUtf8(a.value); } catch (e) { return a.value; }
}

/**
 * פרטי תעודה מקובץ ‎.pfx. זורק שגיאה בעברית על סיסמה שגויה או סוג לא נתמך.
 * → { name, issuer, notBefore, notAfter, selfSigned, expired }
 */
function p12Info(p12Bytes, passphrase) {
  const { cert } = readP12(p12Bytes, passphrase);
  const now = new Date();
  return {
    name: readCN(cert.subject.attributes),
    issuer: readCN(cert.issuer.attributes),
    notBefore: cert.validity.notBefore.toISOString(),
    notAfter: cert.validity.notAfter.toISOString(),
    selfSigned: cert.isIssuer(cert),
    expired: cert.validity.notAfter < now || cert.validity.notBefore > now,
  };
}

/**
 * תעודה אישית (חתומה עצמית) לחתימה: RSA-2048, תקפה ל-5 שנים.
 * → Uint8Array של קובץ ‎.p12 מוגן בסיסמה
 */
function createSelfSigned({ name, email, password }) {
  if (!name || !String(name).trim()) throw new Error('צריך שם לתעודה');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' }));
  const pub = forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' }));
  const cert = forge.pki.createCertificate();
  cert.publicKey = pub;
  cert.serialNumber = '01' + crypto.randomBytes(15).toString('hex');
  cert.validity.notBefore = new Date(Date.now() - 60 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 5 * 365 * 24 * 3600 * 1000);
  const attrs = [{ type: OID_CN, value: String(name).trim(), valueTagClass: forge.asn1.Type.UTF8 }];
  if (email) attrs.push({ name: 'emailAddress', value: String(email).trim() });
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  const ext = [
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    { name: 'extKeyUsage', emailProtection: true },
    { name: 'subjectKeyIdentifier' },
  ];
  if (email) ext.push({ name: 'subjectAltName', altNames: [{ type: 1, value: String(email).trim() }] });
  cert.setExtensions(ext);
  cert.sign(key, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(key, [cert], password || '', { algorithm: '3des', friendlyName: String(name).trim() });
  return new Uint8Array(Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'));
}

/* ---------- בדיקת חתימות ---------- */

const DIGESTS = {
  '1.3.14.3.2.26': 'sha1',
  '2.16.840.1.101.3.4.2.1': 'sha256',
  '2.16.840.1.101.3.4.2.2': 'sha384',
  '2.16.840.1.101.3.4.2.3': 'sha512',
};
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_SIGNING_TIME = '1.2.840.113549.1.9.5';

const bin = (node) => Buffer.from(forge.asn1.toDer(node).getBytes(), 'binary');
const oidOf = (node) => forge.asn1.derToOid(node.value);

function parseCms(der) {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(der.toString('binary')), { parseAllBytes: false, strict: false });
  const signedData = asn1.value[1].value[0];
  const parts = signedData.value;
  const certs = [];
  let signerInfos;
  for (const p of parts.slice(3)) {
    if (p.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && p.type === 0) {
      for (const c of p.value) { try { certs.push(new crypto.X509Certificate(bin(c))); } catch (e) { /* תעודה לא מוכרת */ } }
    } else if (p.tagClass === forge.asn1.Class.UNIVERSAL && p.type === forge.asn1.Type.SET) {
      signerInfos = p.value;
    }
  }
  const si = signerInfos[0].value;
  let i = 2;
  const digestAlg = DIGESTS[oidOf(si[i].value[0])] || 'sha256';
  i++;
  let signedAttrs = null;
  if (si[i].tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && si[i].type === 0) { signedAttrs = si[i]; i++; }
  i++; // אלגוריתם החתימה
  const signature = Buffer.from(si[i].value, 'binary');
  const attrs = {};
  if (signedAttrs) for (const a of signedAttrs.value) attrs[oidOf(a.value[0])] = a.value[1].value[0];
  return { certs, digestAlg, signedAttrs, attrs, signature };
}

function subjectCN(x509) {
  const m = /(?:^|\n)CN=([^\n]+)/.exec(x509.subject || '');
  return m ? m[1] : (x509.subject || '').split('\n')[0];
}

function issuerCN(x509) {
  const m = /(?:^|\n)CN=([^\n]+)/.exec(x509.issuer || '');
  return m ? m[1] : (x509.issuer || '').split('\n')[0];
}

function decodePdfText(obj) {
  if (!obj) return '';
  try { return obj.decodeText(); } catch (e) { return ''; }
}

/**
 * בדיקת כל החתימות במסמך.
 * → [{ field, name, signedAt, reason, location, intact, coversWholeFile, certSubject, certIssuer, selfSigned, notAfter, error }]
 * intact: הבייטים שהחתימה מכסה לא שונו והחתימה המתמטית תקינה.
 * לא נבדקת שרשרת האמון מול רשות מאשרת.
 */
async function verify(bytes) {
  const buf = Buffer.from(bytes);
  let doc;
  try { doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false }); } catch (e) { return []; }
  const out = [];
  const seen = new Set();
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    const ft = obj.get(PDFName.of('FT'));
    if (ft !== PDFName.of('Sig')) continue;
    const vRaw = obj.get(PDFName.of('V'));
    const v = vRaw instanceof PDFRef ? doc.context.lookup(vRaw) : vRaw;
    if (!(v instanceof PDFDict)) continue;
    const key = vRaw instanceof PDFRef ? vRaw.toString() : ref.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = {
      field: decodePdfText(obj.get(PDFName.of('T'))),
      name: decodePdfText(v.get(PDFName.of('Name'))),
      reason: decodePdfText(v.get(PDFName.of('Reason'))),
      location: decodePdfText(v.get(PDFName.of('Location'))),
      signedAt: null, intact: false, coversWholeFile: false, certSubject: '', certIssuer: '', selfSigned: false, notAfter: null, error: null,
    };
    try {
      const m = v.get(PDFName.of('M'));
      if (m) { const d = m.decodeDate(); if (!isNaN(d)) entry.signedAt = d.toISOString(); }
    } catch (e) { /* תאריך לא תקין */ }
    try {
      const br = v.get(PDFName.of('ByteRange'));
      const range = br.asArray().map((x) => x.asNumber());
      if (range.length !== 4 || range[0] !== 0) throw new Error('טווח חתימה לא תקין');
      const [, l1, s2, l2] = range;
      if (s2 + l2 > buf.length) throw new Error('הקובץ קוצר אחרי החתימה');
      entry.coversWholeFile = s2 + l2 === buf.length;
      const hex = buf.subarray(l1 + 1, s2 - 1).toString('latin1').replace(/[^0-9a-fA-F]/g, '');
      const der = Buffer.from(hex, 'hex');
      const cms = parseCms(der);
      const data = Buffer.concat([buf.subarray(0, l1), buf.subarray(s2, s2 + l2)]);
      const digest = crypto.createHash(cms.digestAlg).update(data).digest();
      let toVerify, digestOk;
      if (cms.signedAttrs) {
        const md = cms.attrs[OID_MESSAGE_DIGEST];
        digestOk = !!md && Buffer.from(md.value, 'binary').equals(digest);
        const der2 = bin(cms.signedAttrs);
        der2[0] = 0x31; // [0] IMPLICIT → SET, כמו שנחתם
        toVerify = der2;
        const st = cms.attrs[OID_SIGNING_TIME];
        if (st && !entry.signedAt) {
          try { entry.signedAt = (st.type === forge.asn1.Type.UTCTIME ? forge.asn1.utcTimeToDate(st.value) : forge.asn1.generalizedTimeToDate(st.value)).toISOString(); } catch (e) { /* לא קריטי */ }
        }
      } else {
        digestOk = true;
        toVerify = data;
      }
      let signerCert = null;
      for (const c of cms.certs) {
        try {
          if (crypto.verify(cms.digestAlg, toVerify, c.publicKey, cms.signature)) { signerCert = c; break; }
        } catch (e) { /* מפתח לא מתאים */ }
      }
      entry.intact = digestOk && !!signerCert;
      const c = signerCert || cms.certs[0];
      if (c) {
        entry.certSubject = subjectCN(c);
        entry.certIssuer = issuerCN(c);
        entry.selfSigned = c.subject === c.issuer;
        entry.notAfter = new Date(c.validTo).toISOString();
        if (!entry.name) entry.name = entry.certSubject;
      }
      if (!digestOk) entry.error = 'המסמך שונה אחרי החתימה';
      else if (!signerCert) entry.error = 'החתימה עצמה לא תקינה';
    } catch (e) {
      entry.error = 'לא הצלחנו לבדוק את החתימה: ' + e.message;
    }
    out.push(entry);
  }
  return out;
}

module.exports = { addPlaceholder, signPdf, p12Signer, p12Info, createSelfSigned, verify, SIGNATURE_LENGTH };
