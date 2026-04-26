import type {
  EncryptedPasswordLibraryPayload,
  EncryptedPasswordVerifier,
  PasswordManagerData,
} from './types';

const KEY_LENGTH = 256;
const ITERATIONS = 250000;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const PASSWORD_VERIFIER_TEXT = 'obsidian-password-manager:password-verifier';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function isEncryptedLibraryPayload(value: unknown): value is EncryptedPasswordLibraryPayload {
  return !!value && typeof value === 'object' && (value as EncryptedPasswordLibraryPayload).kind === 'encrypted-library';
}

export function isEncryptedPasswordVerifier(value: unknown): value is EncryptedPasswordVerifier {
  return !!value && typeof value === 'object' && (value as EncryptedPasswordVerifier).kind === 'password-verifier';
}

export async function encryptPasswordManagerData(data: PasswordManagerData, password: string) {
  const encrypted = await encryptText(JSON.stringify(data), password);
  return {
    version: 1 as const,
    kind: 'encrypted-library' as const,
    encryptedAt: Date.now(),
    salt: encrypted.salt,
    iv: encrypted.iv,
    cipherText: encrypted.cipherText,
  };
}

export async function decryptPasswordManagerData(payload: EncryptedPasswordLibraryPayload, password: string) {
  const plainText = await decryptText(payload, password);
  return JSON.parse(plainText) as PasswordManagerData;
}

export async function createPasswordVerifier(password: string) {
  const encrypted = await encryptText(PASSWORD_VERIFIER_TEXT, password);
  return {
    version: 1 as const,
    kind: 'password-verifier' as const,
    createdAt: Date.now(),
    salt: encrypted.salt,
    iv: encrypted.iv,
    cipherText: encrypted.cipherText,
  };
}

export async function verifyPassword(password: string, verifier: EncryptedPasswordVerifier) {
  try {
    const plainText = await decryptText(verifier, password);
    return plainText === PASSWORD_VERIFIER_TEXT;
  } catch {
    return false;
  }
}

async function encryptText(plainText: string, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plainText),
  );
  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    cipherText: bytesToBase64(new Uint8Array(cipherBuffer)),
  };
}

async function decryptText(
  payload: Pick<EncryptedPasswordLibraryPayload, 'salt' | 'iv' | 'cipherText'>,
  password: string,
) {
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const cipherBytes = base64ToBytes(payload.cipherText);
  const key = await deriveKey(password, salt);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipherBytes,
  );
  return decoder.decode(plainBuffer);
}

async function deriveKey(password: string, salt: Uint8Array) {
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}