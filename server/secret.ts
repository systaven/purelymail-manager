import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

// The key that encrypts mailbox credentials and queued mail. SECRET_KEY wins;
// otherwise a random key is created once in the data volume, so backups of
// /data include it. Changing it makes stored credentials unreadable (they are
// then recreated automatically).

let key: Buffer | undefined;

function loadKey(): Buffer {
  if (key) return key;
  const fromEnv = process.env.SECRET_KEY?.trim();
  if (fromEnv) {
    if (fromEnv.length < 32) throw new Error('SECRET_KEY must be at least 32 characters (try: openssl rand -base64 48)');
    key = createHash('sha256').update(fromEnv).digest();
    return key;
  }
  const file = path.join(config.dataDir, 'secret.key');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' });
  }
  key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
  if (key.length !== 32) throw new Error(`${file} is not a valid key`);
  return key;
}

// AES-256-GCM; output is base64url(iv | tag | ciphertext).
export function encrypt(plain: string | Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', loadKey(), iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

export function decryptBuffer(token: string): Buffer {
  const raw = Buffer.from(token, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', loadKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
}

export const decrypt = (token: string) => decryptBuffer(token).toString('utf8');

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
