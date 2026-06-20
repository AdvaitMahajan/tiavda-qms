import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { env } from '../env';

/**
 * AES-256-GCM encryption for per-org integration secrets at rest. The master key
 * lives ONLY in the Railway env (ENCRYPTION_KEY) — never in the DB or frontend.
 * Any string key is accepted and folded to 32 bytes via SHA-256, so operators
 * can use a long passphrase or a base64/hex key interchangeably.
 *
 * Ciphertext format: `v1.<ivB64>.<tagB64>.<cipherB64>`.
 */
function masterKey(): Buffer {
  if (!env.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY is not set — cannot encrypt/decrypt integration secrets');
  return createHash('sha256').update(env.ENCRYPTION_KEY, 'utf8').digest();
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value ?? {}), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decryptJson<T = Record<string, unknown>>(blob: string | null | undefined): T | null {
  if (!blob) return null;
  const parts = blob.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const iv = Buffer.from(parts[1]!, 'base64');
    const tag = Buffer.from(parts[2]!, 'base64');
    const ciphertext = Buffer.from(parts[3]!, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', masterKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8')) as T;
  } catch {
    return null;
  }
}
