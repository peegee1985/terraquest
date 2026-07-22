import CryptoJS from 'crypto-js';

export type RandomBytesFn = (length: number) => Uint8Array;

export type EncryptedEnvelope = {
  /** base64 */
  iv: string;
  /** base64 */
  ciphertext: string;
  /** base64 HMAC-SHA256 over iv || ciphertext, encrypt-then-MAC */
  tag: string;
};

const IV_BYTES = 16;
const ENC_KEY_DOMAIN = new Uint8Array([0x01]);
const MAC_KEY_DOMAIN = new Uint8Array([0x02]);

function u8ToWordArray(bytes: Uint8Array): CryptoJS.lib.WordArray {
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    words[i >>> 2] = (words[i >>> 2] ?? 0) | (bytes[i] << (24 - (i % 4) * 8));
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function wordArrayToU8(wordArray: CryptoJS.lib.WordArray): Uint8Array {
  const { words, sigBytes } = wordArray;
  const bytes = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i += 1) {
    bytes[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  return CryptoJS.enc.Base64.stringify(u8ToWordArray(bytes));
}

export function base64ToBytes(base64: string): Uint8Array {
  return wordArrayToU8(CryptoJS.enc.Base64.parse(base64));
}

function deriveSubKey(masterKeyWordArray: CryptoJS.lib.WordArray, domain: Uint8Array) {
  return CryptoJS.SHA256(masterKeyWordArray.clone().concat(u8ToWordArray(domain)));
}

/** Constant-time-ish comparison; both inputs are attacker-influenced HMAC tags. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Encrypts a UTF-8 string with AES-256-CBC then authenticates with
 * HMAC-SHA256 (encrypt-then-MAC), using two keys derived from one 256-bit
 * master key. A fresh random IV is drawn for every call.
 */
export async function encryptField(
  plaintext: string,
  masterKeyBase64: string,
  randomBytes: RandomBytesFn,
): Promise<EncryptedEnvelope> {
  const masterKeyWordArray = CryptoJS.enc.Base64.parse(masterKeyBase64);
  const encKey = deriveSubKey(masterKeyWordArray, ENC_KEY_DOMAIN);
  const macKey = deriveSubKey(masterKeyWordArray, MAC_KEY_DOMAIN);

  const ivBytes = randomBytes(IV_BYTES);
  const ivWordArray = u8ToWordArray(ivBytes);

  const cipherParams = CryptoJS.AES.encrypt(plaintext, encKey, {
    iv: ivWordArray,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const tag = CryptoJS.HmacSHA256(ivWordArray.clone().concat(cipherParams.ciphertext), macKey);

  return {
    iv: bytesToBase64(ivBytes),
    ciphertext: CryptoJS.enc.Base64.stringify(cipherParams.ciphertext),
    tag: CryptoJS.enc.Base64.stringify(tag),
  };
}

/**
 * Verifies the HMAC tag before decrypting. Throws on tamper or wrong key
 * rather than returning garbage plaintext.
 */
export async function decryptField(envelope: EncryptedEnvelope, masterKeyBase64: string): Promise<string> {
  const masterKeyWordArray = CryptoJS.enc.Base64.parse(masterKeyBase64);
  const encKey = deriveSubKey(masterKeyWordArray, ENC_KEY_DOMAIN);
  const macKey = deriveSubKey(masterKeyWordArray, MAC_KEY_DOMAIN);

  const ivWordArray = CryptoJS.enc.Base64.parse(envelope.iv);
  const ciphertextWordArray = CryptoJS.enc.Base64.parse(envelope.ciphertext);

  const expectedTag = CryptoJS.enc.Base64.stringify(
    CryptoJS.HmacSHA256(ivWordArray.clone().concat(ciphertextWordArray), macKey),
  );
  if (!timingSafeEqual(expectedTag, envelope.tag)) {
    throw new Error('LOCAL_FIELD_DECRYPT_TAMPERED_OR_INVALID_KEY');
  }

  const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: ciphertextWordArray });
  const plaintext = CryptoJS.AES.decrypt(cipherParams, encKey, {
    iv: ivWordArray,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return plaintext.toString(CryptoJS.enc.Utf8);
}
