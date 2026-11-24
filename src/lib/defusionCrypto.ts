import { DefusionEntry, DefusionVaultConfig, GratitudeEntry, RetiredVaultKeyring } from '../types';
import { MAX_LENGTHS, clampString } from './validation';

export const DEFUSION_XP = 10;
export const GRATITUDE_XP = 10;
export const GRATITUDE_DAILY_BONUS_XP = 5;
export const GRATITUDE_DAILY_TARGET = 3;

export const DEFUSION_PREFIXES = [
  "I notice I'm having the thought that…",
  'My mind is telling me a story that…',
  'I am observing the feeling that…',
  'A passing mental cloud:',
] as const;

export interface DecryptedDefusionPayload {
  text: string;
  prefix?: string;
}

export interface DecryptedGratitudePayload {
  items: string[];
  note?: string;
}

const PBKDF2_ITERATIONS = 100_000;

function getSubtleCrypto(): SubtleCrypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto.subtle;
  }
  throw new Error('Web Crypto API is not available in this environment.');
}

function getRandomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

export function bytesToBase64(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.byteLength; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

/**
 * Computes a deterministic 16-char hex fingerprint of an RSA public key JWK
 * (based on modulus `n`, falling back to canonical JWK string).
 */
export async function computeVaultKeyId(publicKeyJwkStr: string): Promise<string> {
  const subtle = getSubtleCrypto();
  let canonical = publicKeyJwkStr.trim();
  try {
    const parsed = JSON.parse(canonical) as JsonWebKey;
    if (parsed && typeof parsed.n === 'string' && parsed.n) {
      canonical = parsed.n;
    }
  } catch {
    // use trimmed string fallback
  }
  const digest = await subtle.digest('SHA-256', toArrayBuffer(new TextEncoder().encode(canonical)));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

async function deriveKeyFromPassphrase(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const enc = new TextEncoder();
  const baseKey = await subtle.importKey(
    'raw',
    toArrayBuffer(enc.encode(passphrase)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generates an RSA-OAEP 2048-bit keypair for one-way public-key sealing.
 * If a passphrase is provided, wraps the private key immediately with PBKDF2 + AES-256-GCM.
 * If no passphrase is provided yet, seals the private key until the user first unlocks the vault.
 */
export async function initializeDefusionVault(passphrase?: string): Promise<DefusionVaultConfig> {
  const subtle = getSubtleCrypto();
  const now = new Date().toISOString();

  const keyPair = await subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  const publicKeyJwk = await subtle.exportKey('jwk', keyPair.publicKey);
  const publicKeyJwkStr = JSON.stringify(publicKeyJwk);
  const vaultKeyId = await computeVaultKeyId(publicKeyJwkStr);
  const privateKeyPkcs8 = await subtle.exportKey('pkcs8', keyPair.privateKey);

  if (passphrase && passphrase.trim().length > 0) {
    const salt = getRandomBytes(16);
    const iv = getRandomBytes(12);
    const wrappingKey = await deriveKeyFromPassphrase(passphrase, salt);
    const wrappedPrivateKeyBuf = await subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      wrappingKey,
      privateKeyPkcs8
    );

    return {
      id: 'vault-1',
      vaultKeyId,
      publicKeyJwk: publicKeyJwkStr,
      wrappedPrivateKey: bytesToBase64(wrappedPrivateKeyBuf),
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      passphraseConfigured: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  // Seal private key locally until user sets their passphrase on first unlock
  const rawPendingKey = getRandomBytes(32);
  const pendingIv = getRandomBytes(12);
  const pendingCryptoKey = await subtle.importKey(
    'raw',
    toArrayBuffer(rawPendingKey),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
  const pendingWrappedBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(pendingIv) },
    pendingCryptoKey,
    privateKeyPkcs8
  );

  return {
    id: 'vault-1',
    vaultKeyId,
    publicKeyJwk: publicKeyJwkStr,
    pendingSealKey: bytesToBase64(rawPendingKey),
    pendingWrappedPrivateKey: bytesToBase64(pendingWrappedBuf),
    pendingIv: bytesToBase64(pendingIv),
    passphraseConfigured: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Sets or changes the vault passphrase.
 * If the vault was in pending (unconfigured passphrase) mode, transitions the private key
 * into PBKDF2 + AES-256-GCM wrapped mode and strips the pending seal key.
 */
export async function configureVaultPassphrase(
  vault: DefusionVaultConfig,
  newPassphrase: string,
  currentPassphrase?: string
): Promise<{ updatedVault: DefusionVaultConfig; privateKey: CryptoKey }> {
  if (!newPassphrase || newPassphrase.trim().length < 4) {
    throw new Error('Passphrase must be at least 4 characters.');
  }

  const subtle = getSubtleCrypto();
  let privateKeyPkcs8: ArrayBuffer;

  if (!vault.passphraseConfigured) {
    if (!vault.pendingSealKey || !vault.pendingWrappedPrivateKey || !vault.pendingIv) {
      throw new Error('Vault key material is incomplete.');
    }
    const rawPendingKey = base64ToBytes(vault.pendingSealKey);
    const pendingIv = base64ToBytes(vault.pendingIv);
    const pendingWrapped = base64ToBytes(vault.pendingWrappedPrivateKey);

    const pendingCryptoKey = await subtle.importKey(
      'raw',
      toArrayBuffer(rawPendingKey),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    privateKeyPkcs8 = await subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(pendingIv) },
      pendingCryptoKey,
      toArrayBuffer(pendingWrapped)
    );
  } else {
    if (!currentPassphrase) {
      throw new Error('Current passphrase is required to change the vault passphrase.');
    }
    if (!vault.wrappedPrivateKey || !vault.salt || !vault.iv) {
      throw new Error('Vault key material is incomplete.');
    }
    const salt = base64ToBytes(vault.salt);
    const iv = base64ToBytes(vault.iv);
    const wrapped = base64ToBytes(vault.wrappedPrivateKey);
    const oldWrappingKey = await deriveKeyFromPassphrase(currentPassphrase, salt);
    try {
      privateKeyPkcs8 = await subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv) },
        oldWrappingKey,
        toArrayBuffer(wrapped)
      );
    } catch {
      throw new Error('Incorrect current passphrase.');
    }
  }

  const newSalt = getRandomBytes(16);
  const newIv = getRandomBytes(12);
  const newWrappingKey = await deriveKeyFromPassphrase(newPassphrase, newSalt);
  const wrappedPrivateKeyBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(newIv) },
    newWrappingKey,
    privateKeyPkcs8
  );

  const privateKey = await subtle.importKey(
    'pkcs8',
    privateKeyPkcs8,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );

  const now = new Date().toISOString();
  const vaultKeyId = vault.vaultKeyId || (await computeVaultKeyId(vault.publicKeyJwk));

  // Re-wrap any retired keyrings whose pendingSealKey is present or whose passphrase matches currentPassphrase
  let updatedRetired: RetiredVaultKeyring[] | undefined;
  if (Array.isArray(vault.retiredKeyrings) && vault.retiredKeyrings.length > 0) {
    updatedRetired = [];
    for (const kr of vault.retiredKeyrings) {
      let krPkcs8: ArrayBuffer | null = null;
      try {
        if (!kr.passphraseConfigured && kr.pendingSealKey && kr.pendingWrappedPrivateKey && kr.pendingIv) {
          const pendingKey = await subtle.importKey(
            'raw',
            toArrayBuffer(base64ToBytes(kr.pendingSealKey)),
            { name: 'AES-GCM' },
            false,
            ['decrypt']
          );
          krPkcs8 = await subtle.decrypt(
            { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(kr.pendingIv)) },
            pendingKey,
            toArrayBuffer(base64ToBytes(kr.pendingWrappedPrivateKey))
          );
        } else if (kr.passphraseConfigured && currentPassphrase && kr.wrappedPrivateKey && kr.salt && kr.iv) {
          const oldKrWrap = await deriveKeyFromPassphrase(currentPassphrase, base64ToBytes(kr.salt));
          krPkcs8 = await subtle.decrypt(
            { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(kr.iv)) },
            oldKrWrap,
            toArrayBuffer(base64ToBytes(kr.wrappedPrivateKey))
          );
        }
      } catch {
        krPkcs8 = null;
      }

      if (krPkcs8) {
        const krSalt = getRandomBytes(16);
        const krIv = getRandomBytes(12);
        const krWrapKey = await deriveKeyFromPassphrase(newPassphrase, krSalt);
        const krWrapped = await subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(krIv) }, krWrapKey, krPkcs8);
        updatedRetired.push({
          vaultKeyId: kr.vaultKeyId || (await computeVaultKeyId(kr.publicKeyJwk)),
          publicKeyJwk: kr.publicKeyJwk,
          wrappedPrivateKey: bytesToBase64(krWrapped),
          salt: bytesToBase64(krSalt),
          iv: bytesToBase64(krIv),
          passphraseConfigured: true,
        });
      } else {
        updatedRetired.push(kr);
      }
    }
  }

  const updatedVault: DefusionVaultConfig = {
    id: vault.id || 'vault-1',
    vaultKeyId,
    publicKeyJwk: vault.publicKeyJwk,
    wrappedPrivateKey: bytesToBase64(wrappedPrivateKeyBuf),
    salt: bytesToBase64(newSalt),
    iv: bytesToBase64(newIv),
    passphraseConfigured: true,
    ...(updatedRetired && updatedRetired.length > 0 ? { retiredKeyrings: updatedRetired } : {}),
    createdAt: vault.createdAt || now,
    updatedAt: now,
  };

  return { updatedVault, privateKey };
}

/**
 * Unlocks the Defusion vault using the user's passphrase and returns the non-extractable
 * RSA-OAEP private CryptoKey for in-memory session decryption.
 */
export async function unlockDefusionVault(
  vault: DefusionVaultConfig,
  passphrase: string
): Promise<CryptoKey> {
  if (!vault.passphraseConfigured || !vault.wrappedPrivateKey || !vault.salt || !vault.iv) {
    throw new Error('Vault passphrase has not been configured yet.');
  }

  const subtle = getSubtleCrypto();
  const salt = base64ToBytes(vault.salt);
  const iv = base64ToBytes(vault.iv);
  const wrapped = base64ToBytes(vault.wrappedPrivateKey);

  const wrappingKey = await deriveKeyFromPassphrase(passphrase, salt);

  let privateKeyPkcs8: ArrayBuffer;
  try {
    privateKeyPkcs8 = await subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      wrappingKey,
      toArrayBuffer(wrapped)
    );
  } catch {
    throw new Error('Incorrect passphrase.');
  }

  return subtle.importKey(
    'pkcs8',
    privateKeyPkcs8,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );
}

/**
 * Unlocks the primary vault key plus any preserved retired keyrings (e.g. from offline
 * multi-device initialization before sync) that match the passphrase or are still in pending seal mode.
 */
export async function unlockAllVaultKeys(
  vault: DefusionVaultConfig,
  passphrase: string
): Promise<CryptoKey[]> {
  const primary = await unlockDefusionVault(vault, passphrase);
  const keys: CryptoKey[] = [primary];

  if (!Array.isArray(vault.retiredKeyrings) || vault.retiredKeyrings.length === 0) {
    return keys;
  }

  const subtle = getSubtleCrypto();
  for (const kr of vault.retiredKeyrings) {
    try {
      let krPkcs8: ArrayBuffer | null = null;
      if (!kr.passphraseConfigured && kr.pendingSealKey && kr.pendingWrappedPrivateKey && kr.pendingIv) {
        const pendingKey = await subtle.importKey(
          'raw',
          toArrayBuffer(base64ToBytes(kr.pendingSealKey)),
          { name: 'AES-GCM' },
          false,
          ['decrypt']
        );
        krPkcs8 = await subtle.decrypt(
          { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(kr.pendingIv)) },
          pendingKey,
          toArrayBuffer(base64ToBytes(kr.pendingWrappedPrivateKey))
        );
      } else if (kr.passphraseConfigured && kr.wrappedPrivateKey && kr.salt && kr.iv) {
        const wrapKey = await deriveKeyFromPassphrase(passphrase, base64ToBytes(kr.salt));
        krPkcs8 = await subtle.decrypt(
          { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(kr.iv)) },
          wrapKey,
          toArrayBuffer(base64ToBytes(kr.wrappedPrivateKey))
        );
      }
      if (krPkcs8) {
        const cryptoKey = await subtle.importKey(
          'pkcs8',
          krPkcs8,
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          false,
          ['decrypt']
        );
        keys.push(cryptoKey);
      }
    } catch {
      // Retired keyring uses a different passphrase; skip gracefully
    }
  }

  return keys;
}

/**
 * Encrypts an arbitrary JSON-serializable payload using hybrid RSA-OAEP (2048-bit) + AES-256-GCM.
 * Requires ONLY the public key JWK, so entries can be sealed at any time
 * without unlocking the vault or keeping the passphrase in memory.
 */
async function sealJsonWithVaultPublicKey(
  publicKeyJwkStr: string,
  payload: unknown
): Promise<{ ciphertext: string; iv: string; wrappedKey: string; vaultKeyId: string }> {
  const subtle = getSubtleCrypto();
  const jwk = JSON.parse(publicKeyJwkStr) as JsonWebKey;
  const vaultKeyId = await computeVaultKeyId(publicKeyJwkStr);

  const publicKey = await subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );

  const rawAesKey = getRandomBytes(32);
  const iv = getRandomBytes(12);

  const aesKey = await subtle.importKey(
    'raw',
    toArrayBuffer(rawAesKey),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encryptedBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    aesKey,
    toArrayBuffer(encoded)
  );

  const wrappedKeyBuf = await subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    toArrayBuffer(rawAesKey)
  );

  return {
    ciphertext: bytesToBase64(encryptedBuf),
    iv: bytesToBase64(iv),
    wrappedKey: bytesToBase64(wrappedKeyBuf),
    vaultKeyId,
  };
}

/**
 * Decrypts a sealed hybrid payload using one or more unlocked RSA-OAEP private keys.
 */
async function unsealJsonWithPrivateKey(
  privateKeyOrKeys: CryptoKey | CryptoKey[],
  sealed: { ciphertext?: string; iv?: string; wrappedKey?: string }
): Promise<any | null> {
  if (!sealed.ciphertext || !sealed.iv || !sealed.wrappedKey) {
    return null;
  }

  const keys = Array.isArray(privateKeyOrKeys) ? privateKeyOrKeys : [privateKeyOrKeys];
  if (keys.length === 0) return null;

  const subtle = getSubtleCrypto();
  const wrappedKeyBytes = base64ToBytes(sealed.wrappedKey);
  const ivBytes = base64ToBytes(sealed.iv);
  const ciphertextBytes = base64ToBytes(sealed.ciphertext);

  let lastErr: unknown = null;
  for (const privateKey of keys) {
    try {
      const rawAesKeyBuf = await subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        toArrayBuffer(wrappedKeyBytes)
      );

      const aesKey = await subtle.importKey(
        'raw',
        rawAesKeyBuf,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      const decryptedBuf = await subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(ivBytes) },
        aesKey,
        toArrayBuffer(ciphertextBytes)
      );

      return JSON.parse(new TextDecoder().decode(decryptedBuf));
    } catch (err) {
      lastErr = err;
    }
  }

  if (lastErr) {
    throw lastErr;
  }
  return null;
}

/**
 * Encrypts a thought payload using hybrid RSA-OAEP (2048-bit) + AES-256-GCM.
 */
export async function encryptDefusionPayload(
  publicKeyJwkStr: string,
  payload: DecryptedDefusionPayload
): Promise<{ ciphertext: string; iv: string; wrappedKey: string; vaultKeyId: string }> {
  const cleanPayload: DecryptedDefusionPayload = {
    text: clampString(payload.text.trim(), MAX_LENGTHS.DEFUSION_TEXT),
    ...(payload.prefix && payload.prefix.trim()
      ? { prefix: clampString(payload.prefix.trim(), MAX_LENGTHS.DEFUSION_PREFIX) }
      : {}),
  };
  return sealJsonWithVaultPublicKey(publicKeyJwkStr, cleanPayload);
}

/**
 * Decrypts a single sealed DefusionEntry using one or more unlocked RSA-OAEP private keys.
 */
export async function decryptDefusionEntry(
  privateKeyOrKeys: CryptoKey | CryptoKey[],
  entry: Pick<DefusionEntry, 'ciphertext' | 'iv' | 'wrappedKey' | 'burned'>
): Promise<DecryptedDefusionPayload | null> {
  if (entry.burned) return null;
  const parsed = await unsealJsonWithPrivateKey(privateKeyOrKeys, entry);
  if (!parsed || typeof parsed.text !== 'string') {
    return null;
  }
  return {
    text: parsed.text,
    ...(typeof parsed.prefix === 'string' && parsed.prefix.trim() ? { prefix: parsed.prefix } : {}),
  };
}

/**
 * Encrypts a gratitude journal payload (one or more items + optional legacy note)
 * using the shared vault RSA-OAEP public key.
 */
export async function encryptGratitudePayload(
  publicKeyJwkStr: string,
  payload: DecryptedGratitudePayload
): Promise<{ ciphertext: string; iv: string; wrappedKey: string; vaultKeyId: string }> {
  const cleanItems = payload.items
    .map((item) => clampString(item.trim(), MAX_LENGTHS.GRATITUDE_ITEM))
    .filter(Boolean);
  const cleanNote = payload.note?.trim()
    ? clampString(payload.note.trim(), MAX_LENGTHS.GRATITUDE_NOTE)
    : undefined;

  const cleanPayload: DecryptedGratitudePayload = {
    items: cleanItems,
    ...(cleanNote ? { note: cleanNote } : {}),
  };
  return sealJsonWithVaultPublicKey(publicKeyJwkStr, cleanPayload);
}

/**
 * Decrypts a single sealed GratitudeEntry using one or more unlocked RSA-OAEP private keys.
 */
export async function decryptGratitudeEntry(
  privateKeyOrKeys: CryptoKey | CryptoKey[],
  entry: Pick<GratitudeEntry, 'ciphertext' | 'iv' | 'wrappedKey'>
): Promise<DecryptedGratitudePayload | null> {
  const parsed = await unsealJsonWithPrivateKey(privateKeyOrKeys, entry);
  if (!parsed || !Array.isArray(parsed.items)) {
    return null;
  }
  const items = parsed.items.filter((i: any) => typeof i === 'string' && i.trim().length > 0);
  return {
    items,
    ...(typeof parsed.note === 'string' && parsed.note.trim() ? { note: parsed.note } : {}),
  };
}
