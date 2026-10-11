// crypto-utils.js — AES-256-GCM encryption helpers using Web Crypto API

/** Convert a Uint8Array to a base64 string without spreading (safe for large arrays). */
function _u8ToBase64(arr) {
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < arr.length; i += chunk) {
    binary += String.fromCharCode(...arr.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Generate a random base64-encoded string of `bytes` bytes
 */
export function randomBase64(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return _u8ToBase64(arr);
}

/**
 * Derive an AES-256-GCM key from a passphrase + salt using PBKDF2
 * @param {string} passphrase
 * @param {string} saltBase64 - base64-encoded 16-byte salt
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(passphrase, saltBase64) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  let salt;
  try {
    salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
  } catch (e) {
    throw new Error(`deriveKey: invalid base64 salt — ${e.message}`);
  }
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive deterministic raw bytes from a passphrase + salt using PBKDF2 (same
 * params as deriveKey). Recomputable on any device from the same inputs.
 * @param {string} passphrase
 * @param {string} saltBase64 - base64-encoded salt
 * @param {number} bytes
 * @returns {Promise<Uint8Array>}
 */
async function _deriveSecretBytes(passphrase, saltBase64, bytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  let salt;
  try {
    salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
  } catch (e) {
    throw new Error(`deriveSecret: invalid base64 salt — ${e.message}`);
  }
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    bytes * 8
  );
  return new Uint8Array(bits);
}

/**
 * Derive a deterministic base64 secret (for public-board URL fragments).
 * @returns {Promise<string>}
 */
export async function deriveSecretBase64(passphrase, saltBase64, bytes = 18) {
  return _u8ToBase64(await _deriveSecretBytes(passphrase, saltBase64, bytes));
}

/**
 * Derive a deterministic UPPERCASE-hex secret (for share codes, which are
 * normalized to uppercase and must contain no base64 / separator characters).
 * @returns {Promise<string>}
 */
export async function deriveSecretHex(passphrase, saltBase64, bytes = 16) {
  const arr = await _deriveSecretBytes(passphrase, saltBase64, bytes);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 * @param {CryptoKey} key
 * @param {string} plaintext
 * @returns {Promise<{ iv: string, data: string }>} base64-encoded iv and ciphertext
 */
export async function encryptData(key, plaintext) {
  const enc = new TextEncoder();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  return {
    iv:   _u8ToBase64(iv),
    data: _u8ToBase64(new Uint8Array(ciphertext)),
  };
}

/**
 * Decrypt AES-256-GCM ciphertext back to a plaintext string
 * @param {CryptoKey} key
 * @param {string} ivBase64 - base64-encoded 12-byte IV
 * @param {string} dataBase64 - base64-encoded ciphertext
 * @returns {Promise<string>}
 */
export async function decryptData(key, ivBase64, dataBase64) {
  let iv, data;
  try {
    iv   = Uint8Array.from(atob(ivBase64),  c => c.charCodeAt(0));
    data = Uint8Array.from(atob(dataBase64), c => c.charCodeAt(0));
  } catch (e) {
    throw new Error(`decryptData: invalid base64 payload — ${e.message}`);
  }
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return new TextDecoder().decode(plainBuffer);
}
