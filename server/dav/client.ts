import { XMLParser } from 'fast-xml-parser';
import { ApiError } from '../errors';
import type { MailboxAccess } from '../mail/access';

// A small WebDAV client for PurelyMail's CalDAV/CardDAV server, which shares
// the mailbox's credentials (the panel's app password). It's deliberately
// tolerant: PurelyMail doesn't report supported-calendar-component-set
// (purelymail-issues#421), which makes strict libraries find no calendars.

const BASE = new URL(process.env.DAV_URL || 'https://purelymail.com/webdav/');
const TIMEOUT_MS = 20_000;

export class DavAuthError extends Error {}

export interface DavResource {
  href: string; // decoded path
  props: Record<string, any>;
}

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,
  isArray: (name) => ['response', 'propstat', 'href', 'comp'].includes(name),
});

const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === 'object' && '#text' in value) return String((value as { '#text': unknown })['#text']);
  return '';
}

const decodePath = (path: string) => {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

function parseMultistatus(xml: string): DavResource[] {
  const doc = parser.parse(xml);
  return arr<any>(doc?.multistatus?.response).map((r) => {
    const props: Record<string, any> = {};
    // Missing properties come back in a 404 propstat; keep only the 2xx ones.
    for (const ps of arr<any>(r.propstat)) if (/\s2\d\d\b/.test(` ${text(ps.status)}`)) Object.assign(props, ps.prop ?? {});
    return { href: decodePath(new URL(text(arr(r.href)[0]), BASE).pathname), props };
  });
}

export const resourceTypes = (props: Record<string, any>) =>
  props.resourcetype && typeof props.resourcetype === 'object' ? Object.keys(props.resourcetype) : [];

const NS = 'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:a="http://apple.com/ns/ical/" xmlns:cs="http://calendarserver.org/ns/"';

export class Dav {
  constructor(private user: string, private password: string) {}

  url(path: string) {
    const url = new URL(path, BASE);
    if (url.origin !== BASE.origin) throw new ApiError('Invalid path', 400, 'invalid_field', { name: 'href' });
    return url;
  }

  async request(method: string, path: string, init: { body?: string; headers?: Record<string, string> } = {}) {
    const res = await fetch(this.url(path), {
      method,
      body: init.body,
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.user}:${this.password}`).toString('base64')}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/xml; charset=utf-8' } : {}),
        ...init.headers,
      },
    }).catch(() => {
      throw new ApiError("Couldn't reach the calendar server", 502, 'dav_unreachable');
    });
    if (res.status === 401) throw new DavAuthError('DAV login failed');
    // For the logs when something doesn't work against the real server (no credentials).
    if (res.status >= 400 && !(res.status === 404 && method === 'DELETE')) console.warn(`DAV ${method} ${this.url(path).pathname} → ${res.status}`);
    return res;
  }

  async multistatus(method: 'PROPFIND' | 'REPORT', path: string, depth: 0 | 1, body: string) {
    let res = await this.request(method, path, { body, headers: { Depth: String(depth) } });
    // PurelyMail occasionally answers 500 under load; one retry usually clears it.
    if (res.status >= 500) res = await this.request(method, path, { body, headers: { Depth: String(depth) } });
    if (res.status === 404) throw new ApiError('Not found', 404, 'not_found');
    if (res.status !== 207) throw new ApiError(`The calendar server answered ${res.status}`, 502, 'dav_failed');
    return parseMultistatus(await res.text());
  }

  propfind(path: string, depth: 0 | 1, props: string) {
    return this.multistatus('PROPFIND', path, depth, `<?xml version="1.0" encoding="utf-8"?><d:propfind ${NS}><d:prop>${props}</d:prop></d:propfind>`);
  }

  report(path: string, body: string) {
    return this.multistatus('REPORT', path, 1, `<?xml version="1.0" encoding="utf-8"?>${body.replace('NS', NS)}`);
  }

  async get(path: string) {
    const res = await this.request('GET', path);
    if (res.status === 404) throw new ApiError('Not found', 404, 'not_found');
    if (!res.ok) throw new ApiError(`The calendar server answered ${res.status}`, 502, 'dav_failed');
    return { body: await res.text(), etag: res.headers.get('etag') };
  }

  // Creates (no etag: must not exist yet) or replaces (etag: only if unchanged).
  async put(path: string, body: string, contentType: string, etag?: string | null) {
    const res = await this.request('PUT', path, {
      body,
      headers: { 'Content-Type': `${contentType}; charset=utf-8`, ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }) },
    });
    if (res.status === 412) throw new ApiError('Changed elsewhere', 409, 'dav_conflict');
    if (!res.ok) throw new ApiError(`The calendar server answered ${res.status}`, 502, 'dav_failed');
    return res.headers.get('etag');
  }

  async remove(path: string, etag?: string | null) {
    const res = await this.request('DELETE', path, { headers: etag ? { 'If-Match': etag } : {} });
    if (res.status === 412) throw new ApiError('Changed elsewhere', 409, 'dav_conflict');
    if (!res.ok && res.status !== 404) throw new ApiError(`The calendar server answered ${res.status}`, 502, 'dav_failed');
  }
}

// --- Discovery -------------------------------------------------------------------

export interface Homes {
  calendars: string;
  contacts: string;
}

const homes = new Map<string, Homes>();
const slash = (p: string) => (p.endsWith('/') ? p : `${p}/`);

async function discover(dav: Dav): Promise<Homes> {
  const root = decodePath(BASE.pathname);
  // Standard: principal, then its calendar and address book home sets.
  try {
    const [rootRes] = await dav.propfind(root, 0, '<d:current-user-principal/>');
    const principal = text(rootRes?.props['current-user-principal']?.href);
    if (principal) {
      const [p] = await dav.propfind(principal, 0, '<c:calendar-home-set/><card:addressbook-home-set/>');
      const cal = text(p?.props['calendar-home-set']?.href);
      const card = text(p?.props['addressbook-home-set']?.href);
      if (cal && card) return { calendars: slash(decodePath(dav.url(cal).pathname)), contacts: slash(decodePath(dav.url(card).pathname)) };
    }
  } catch (error) {
    if (error instanceof DavAuthError) throw error;
  }
  // PurelyMail's layout: /webdav/<account>/caldav/ and /webdav/<account>/carddav/.
  const children = await dav.propfind(root, 1, '<d:resourcetype/>');
  const account = children.map((c) => slash(c.href)).find((p) => p !== slash(root) && p.startsWith(root));
  if (!account) throw new ApiError("Couldn't find calendars for this mailbox", 502, 'dav_unavailable');
  return { calendars: `${account}caldav/`, contacts: `${account}carddav/` };
}

export interface DavContext {
  dav: Dav;
  address: string;
  homes: Homes;
  // A client-supplied href, checked to be inside this mailbox's home.
  resolve(href: string, kind: keyof Homes): string;
}

export async function withDav<T>(access: MailboxAccess, fn: (ctx: DavContext) => Promise<T>): Promise<T> {
  const attempt = async () => {
    const dav = new Dav(access.address, await access.password());
    let h = homes.get(access.address);
    if (!h) {
      h = await discover(dav);
      homes.set(access.address, h);
    }
    const found = h;
    const resolve = (href: string, kind: keyof Homes) => {
      const path = decodePath(dav.url(href).pathname);
      if (!path.startsWith(found[kind]) || path.includes('/../')) throw new ApiError('Invalid path', 400, 'invalid_field', { name: 'href' });
      return path;
    };
    return fn({ dav, address: access.address, homes: found, resolve });
  };
  try {
    return await attempt();
  } catch (error) {
    // The app password was deleted elsewhere: make a new one and retry once.
    if (!(error instanceof DavAuthError)) throw error;
    await access.invalidate();
    try {
      return await attempt();
    } catch (retryError) {
      if (retryError instanceof DavAuthError) throw new ApiError('The calendar server refused the login', 502, 'dav_failed');
      throw retryError;
    }
  }
}

// --- Reading whole collections ----------------------------------------------------

// Reads every object in a calendar or address book. PurelyMail's calendar-query
// REPORT can return a stale list (new events missing until an indexer catches
// up), while a PROPFIND listing is current. So: PROPFIND for hrefs and ETags,
// then fetch only what changed (multiget, else GET), keeping bodies cached by
// ETag. Callers filter by date themselves.

type Kind = 'calendar' | 'addressbook';
const DATA_PROP: Record<Kind, string> = { calendar: 'calendar-data', addressbook: 'address-data' };
const MULTIGET: Record<Kind, string> = { calendar: 'c:calendar-multiget', addressbook: 'card:addressbook-multiget' };
const DATA_TAG: Record<Kind, string> = { calendar: '<c:calendar-data/>', addressbook: '<card:address-data/>' };

const MAX_CACHED = 4000;
const bodies = new Map<string, { etag: string; body: string }>(); // key: account|href

function remember(key: string, etag: string, body: string) {
  bodies.delete(key);
  bodies.set(key, { etag, body });
  if (bodies.size > MAX_CACHED) bodies.delete(bodies.keys().next().value!);
}

const hrefXml = (href: string) => `<d:href>${href.split('/').map(encodeURIComponent).join('/')}</d:href>`;

export async function readCollection(dav: Dav, account: string, collection: string, kind: Kind): Promise<DavResource[]> {
  const listed = (await dav.propfind(collection, 1, '<d:getetag/><d:resourcetype/>')).filter(
    (r) => slash(r.href) !== slash(collection) && !resourceTypes(r.props).includes('collection')
  );
  const out: DavResource[] = [];
  const missing: DavResource[] = [];
  for (const r of listed) {
    const etag = text(r.props.getetag);
    const hit = etag ? bodies.get(`${account}|${r.href}`) : undefined;
    if (hit && hit.etag === etag) out.push({ href: r.href, props: { getetag: etag, [DATA_PROP[kind]]: hit.body } });
    else missing.push(r);
  }
  const found = new Map<string, DavResource>();
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    try {
      const got = await dav.report(collection, `<${MULTIGET[kind]} NS><d:prop><d:getetag/>${DATA_TAG[kind]}</d:prop>${batch.map((r) => hrefXml(r.href)).join('')}</${MULTIGET[kind]}>`);
      for (const r of got) if (text(r.props[DATA_PROP[kind]])) found.set(r.href, r);
    } catch (error) {
      if (error instanceof DavAuthError) throw error;
      // No multiget: fall back to GET below.
    }
  }
  // Anything multiget didn't return, one by one (a few at a time).
  const rest = missing.filter((r) => !found.has(r.href));
  for (let i = 0; i < rest.length; i += 6) {
    await Promise.all(
      rest.slice(i, i + 6).map(async (r) => {
        try {
          const { body, etag } = await dav.get(r.href);
          found.set(r.href, { href: r.href, props: { getetag: etag ?? text(r.props.getetag), [DATA_PROP[kind]]: body } });
        } catch (error) {
          if (error instanceof DavAuthError) throw error;
          // Gone or unreadable: skip it.
        }
      })
    );
  }
  for (const r of found.values()) {
    const etag = text(r.props.getetag);
    if (etag) remember(`${account}|${r.href}`, etag, text(r.props[DATA_PROP[kind]]));
    out.push(r);
  }
  return out;
}
