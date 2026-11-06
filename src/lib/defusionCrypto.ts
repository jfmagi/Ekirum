import { DefusionEntry, DefusionVaultConfig } from '../types';
import { MAX_LENGTHS, clampString } from './validation';

export const DEFUSION_XP = 10;

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
      publicKeyJwk: JSON.stringify(publicKeyJwk),
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
    publicKeyJwk: JSON.stringify(publicKeyJwk),
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
  const updatedVault: DefusionVaultConfig = {
    id: vault.id || 'vault-1',
    publicKeyJwk: vault.publicKeyJwk,
    wrappedPrivateKey: bytesToBase64(wrappedPrivateKeyBuf),
    salt: bytesToBase64(newSalt),
    iv: bytesToBase64(newIv),
    passphraseConfigured: true,
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
 * Encrypts a thought payload using hybrid RSA-OAEP (2048-bit) + AES-256-GCM.
 * Requires ONLY the public key JWK, so thoughts can be dumped and sealed at any time
 * without unlocking the vault or keeping the passphrase in memory.
 */
export async function encryptDefusionPayload(
  publicKeyJwkStr: string,
  payload: DecryptedDefusionPayload
): Promise<{ ciphertext: string; iv: string; wrappedKey: string }> {
  const subtle = getSubtleCrypto();
  const jwk = JSON.parse(publicKeyJwkStr) as JsonWebKey;

  const publicKey = await subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );

  // Generate ephemeral 256-bit AES-GCM key and 96-bit IV for this thought
  const rawAesKey = getRandomBytes(32);
  const iv = getRandomBytes(12);

  const aesKey = await subtle.importKey(
    'raw',
    toArrayBuffer(rawAesKey),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const cleanPayload: DecryptedDefusionPayload = {
    text: clampString(payload.text.trim(), MAX_LENGTHS.DEFUSION_TEXT),
    ...(payload.prefix && payload.prefix.trim()
      ? { prefix: clampString(payload.prefix.trim(), MAX_LENGTHS.DEFUSION_PREFIX) }
      : {}),
  };

  const encoded = new TextEncoder().encode(JSON.stringify(cleanPayload));
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
  };
}

/**
 * Decrypts a single sealed DefusionEntry using the unlocked RSA-OAEP private key.
 */
export async function decryptDefusionEntry(
  privateKey: CryptoKey,
  entry: Pick<DefusionEntry, 'ciphertext' | 'iv' | 'wrappedKey' | 'burned'>
): Promise<DecryptedDefusionPayload | null> {
  if (entry.burned || !entry.ciphertext || !entry.iv || !entry.wrappedKey) {
    return null;
  }

  const subtle = getSubtleCrypto();
  const wrappedKeyBytes = base64ToBytes(entry.wrappedKey);
  const ivBytes = base64ToBytes(entry.iv);
  const ciphertextBytes = base64ToBytes(entry.ciphertext);

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

  const jsonStr = new TextDecoder().decode(decryptedBuf);
  const parsed = JSON.parse(jsonStr);
  if (!parsed || typeof parsed.text !== 'string') {
    return null;
  }
  return {
    text: parsed.text,
    ...(typeof parsed.prefix === 'string' && parsed.prefix.trim() ? { prefix: parsed.prefix } : {}),
  };
}
