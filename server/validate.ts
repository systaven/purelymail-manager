import { badRequest } from './errors';

// Request body checks. Each throws a 400 with a code the web app translates.

export function str(value: unknown, name: string, { optional = false, max = 500 } = {}): string {
  if (value === undefined || value === null || value === '') {
    if (optional) return '';
    throw badRequest(`Missing ${name}`, 'missing_field', { name });
  }
  if (typeof value !== 'string' || value.length > max) throw badRequest(`Invalid ${name}`, 'invalid_field', { name });
  return value.trim();
}

export const bool = (value: unknown, name: string): boolean | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw badRequest(`Invalid ${name}`, 'invalid_field', { name });
  return value;
};

const DOMAIN_RE = /^(?=.{3,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
const LOCAL_RE = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function domain(value: unknown, name = 'domain'): string {
  const d = str(value, name).toLowerCase().replace(/\.$/, '');
  if (!DOMAIN_RE.test(d)) throw badRequest(`Invalid domain`, 'invalid_domain');
  return d;
}

export function localPart(value: unknown): string {
  const l = str(value, 'localPart').toLowerCase();
  if (!LOCAL_RE.test(l) || l.includes('..')) throw badRequest('Invalid address', 'invalid_local_part');
  return l;
}

export function email(value: unknown, name = 'email'): string {
  const e = str(value, name, { max: 320 }).toLowerCase();
  if (!EMAIL_RE.test(e)) throw badRequest(`Invalid ${name}`, 'invalid_email', { value: e });
  return e;
}

export function emails(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 50) throw badRequest(`Invalid ${name}`, 'invalid_field', { name });
  return [...new Set(value.map((v) => email(v, name)))];
}

export function password(value: unknown): string {
  const p = str(value, 'password', { max: 200 });
  if (p.length < 10) throw badRequest('Password too short', 'password_too_short', { min: 10 });
  return p;
}

export async function json<T = Record<string, unknown>>(req: { json: () => Promise<unknown> }): Promise<T> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('Expected a JSON body', 'bad_request');
  return body as T;
}
