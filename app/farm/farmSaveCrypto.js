const SAVE_EXPORT_FORMAT = "farm-save-encrypted-v1";
const SAVE_EXPORT_ITERATIONS = 120000;
const SAVE_EXPORT_SECRET = "farm-idle-local-save-secret-v1";

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function deriveSaveCryptoKey(salt, iterations = SAVE_EXPORT_ITERATIONS) {
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SAVE_EXPORT_SECRET),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSaveJson(rawJson) {
  if (!window.crypto?.subtle) {
    throw new Error("Browser crypto API unavailable.");
  }
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveSaveCryptoKey(salt, SAVE_EXPORT_ITERATIONS);
  const plaintext = new TextEncoder().encode(rawJson);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );
  return JSON.stringify({
    format: SAVE_EXPORT_FORMAT,
    v: 1,
    iter: SAVE_EXPORT_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  });
}

export async function decryptSaveJsonPayload(payload) {
  if (!window.crypto?.subtle) {
    throw new Error("Browser crypto API unavailable.");
  }
  const iter = Math.max(1, Number(payload?.iter || SAVE_EXPORT_ITERATIONS));
  const salt = base64ToBytes(String(payload?.salt || ""));
  const iv = base64ToBytes(String(payload?.iv || ""));
  const data = base64ToBytes(String(payload?.data || ""));
  const key = await deriveSaveCryptoKey(salt, iter);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );
  return new TextDecoder().decode(decrypted);
}
