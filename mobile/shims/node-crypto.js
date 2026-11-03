/*
 * תחליף מצומצם ל-crypto של Node, בשביל src/core/digisig.js בתוך ה-WebView.
 * מממש רק את מה ש-digisig.js משתמש בו, מעל node-forge (אותה ספרייה שהוא כבר משתמש בה):
 *   generateKeyPairSync('rsa'), randomBytes, createHash, verify, X509Certificate
 * הקובץ נארז יחד עם digisig.js בזמן הבנייה (scripts/build-web.mjs) ולא משנה את גרסת Windows.
 */
'use strict';
const forge = require('node-forge');
const { Buffer } = require('buffer');

const toBin = (b) => Buffer.from(b).toString('binary');
const MD = { sha1: 'sha1', sha256: 'sha256', sha384: 'sha384', sha512: 'sha512' };

function md(alg) {
  const name = MD[String(alg).toLowerCase().replace('-', '')];
  if (!name) throw new Error('unsupported digest ' + alg);
  return forge.md[name].create();
}

/** RSA בלבד — זה מה ש-createSelfSigned מבקש */
function generateKeyPairSync(type, opts) {
  if (type !== 'rsa') throw new Error('only rsa is supported');
  const kp = forge.pki.rsa.generateKeyPair({ bits: (opts && opts.modulusLength) || 2048, e: 0x10001 });
  return {
    privateKey: { export: () => forge.pki.privateKeyToPem(kp.privateKey) }, // pkcs1 / pem
    publicKey: { export: () => forge.pki.publicKeyToPem(kp.publicKey) },    // spki / pem
  };
}

function randomBytes(n) {
  const a = new Uint8Array(n);
  globalThis.crypto.getRandomValues(a);
  return Buffer.from(a);
}

function createHash(alg) {
  const m = md(alg);
  const h = {
    update(data) { m.update(typeof data === 'string' ? data : toBin(data)); return h; },
    digest(enc) {
      const out = Buffer.from(m.digest().getBytes(), 'binary');
      return enc ? out.toString(enc) : out;
    },
  };
  return h;
}

/** אימות חתימת RSA PKCS#1 v1.5. publicKey — מפתח forge (מ-X509Certificate למטה) */
function verify(alg, data, publicKey, signature) {
  const m = md(alg);
  m.update(toBin(data));
  return publicKey.verify(m.digest().getBytes(), toBin(signature));
}

/** שם מתוך תעודה, בפורמט של Node: "C=IL\nO=…\nCN=…" */
function dn(attrs) {
  return attrs.map((a) => {
    let v = a.value;
    try { v = forge.util.decodeUtf8(v); } catch (e) { /* כבר טקסט */ }
    return `${a.shortName || a.name || a.type}=${v}`;
  }).join('\n');
}

class X509Certificate {
  constructor(der) {
    const cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(toBin(der)));
    this.subject = dn(cert.subject.attributes);
    this.issuer = dn(cert.issuer.attributes);
    this.validFrom = cert.validity.notBefore.toUTCString();
    this.validTo = cert.validity.notAfter.toUTCString();
    this.publicKey = cert.publicKey;
  }
}

module.exports = { generateKeyPairSync, randomBytes, createHash, verify, X509Certificate };
