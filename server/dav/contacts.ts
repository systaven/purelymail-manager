import ICAL from 'ical.js';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../errors';
import { type DavContext, type DavResource, readCollection, resourceTypes, text } from './client';

// Address books over CardDAV. We read and write the common vCard fields and
// keep every other property (addresses, photos, custom fields) untouched.

export interface AddressBook {
  href: string;
  name: string;
}

export interface Labeled {
  value: string;
  label: string; // home, work, cell... or ''
}

export interface Contact {
  href: string;
  etag: string | null;
  addressBook: string;
  uid: string;
  name: string;
  firstName: string;
  lastName: string;
  emails: Labeled[];
  phones: Labeled[];
  organization: string;
  title: string;
  note: string;
  birthday: string; // YYYY-MM-DD or ''
  groups: string[];
  photo: string | null; // data: URL for small inline photos
}

export async function listAddressBooks({ dav, homes }: DavContext): Promise<AddressBook[]> {
  const items = await dav.propfind(homes.contacts, 1, '<d:resourcetype/><d:displayname/>');
  return items
    .filter((r) => resourceTypes(r.props).includes('addressbook'))
    .map((r) => ({ href: r.href, name: text(r.props.displayname) || r.href.split('/').filter(Boolean).pop() || 'Contacts' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Every card in the address book (PROPFIND + multiget, cached by ETag).
const fetchAll = ({ dav, address }: DavContext, book: string): Promise<DavResource[]> => readCollection(dav, address, book, 'addressbook');

const LABELS = ['home', 'work', 'cell', 'mobile', 'main', 'fax', 'other', 'iphone', 'pager'];

function labelOf(prop: ICAL.Property): string {
  const raw = prop.getParameter('type');
  const types = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((t) => String(t).toLowerCase().split(','));
  const label = types.find((t) => LABELS.includes(t));
  return label === 'mobile' || label === 'iphone' ? 'cell' : (label ?? '');
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function photoOf(card: ICAL.Component): string | null {
  const prop = card.getFirstProperty('photo');
  if (!prop) return null;
  const value = str(prop.getFirstValue());
  if (value.startsWith('data:image/')) return value.length < 150_000 ? value : null;
  const encoding = str(prop.getParameter('encoding')).toLowerCase();
  if (encoding !== 'b' && encoding !== 'base64') return null;
  const type = str(prop.getParameter('type')).toLowerCase().split(',')[0] || 'jpeg';
  const mime = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', webp: 'webp' }[type.replace('image/', '')];
  const data = value.replace(/\s+/g, '');
  return mime && data.length < 150_000 ? `data:image/${mime};base64,${data}` : null;
}

function birthdayOf(card: ICAL.Component): string {
  const v = card.getFirstPropertyValue('bday');
  if (!v) return '';
  const s = str(v);
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function toContact(resource: DavResource, addressBook: string, card: ICAL.Component): Contact {
  const n = card.getFirstPropertyValue('n') as unknown;
  const parts = Array.isArray(n) ? n.map(str) : str(n).split(';');
  const org = card.getFirstPropertyValue('org') as unknown;
  const name = str(card.getFirstPropertyValue('fn')).trim();
  return {
    href: resource.href,
    etag: text(resource.props.getetag) || null,
    addressBook,
    uid: str(card.getFirstPropertyValue('uid')),
    name: name || formattedName(parts[1] ?? '', parts[0] ?? ''),
    firstName: parts[1] ?? '',
    lastName: parts[0] ?? '',
    emails: card.getAllProperties('email').map((p) => ({ value: str(p.getFirstValue()).replace(/^mailto:/i, ''), label: labelOf(p) })).filter((e) => e.value),
    phones: card.getAllProperties('tel').map((p) => ({ value: str(p.getFirstValue()).replace(/^tel:/i, ''), label: labelOf(p) })).filter((e) => e.value),
    organization: (Array.isArray(org) ? org.map(str) : [str(org)]).filter(Boolean).join(', ').replace(/;+$/, ''),
    title: str(card.getFirstPropertyValue('title')),
    note: str(card.getFirstPropertyValue('note')),
    birthday: birthdayOf(card),
    groups: card.getAllProperties('categories').flatMap((p) => p.getValues().map(str)).filter(Boolean),
    photo: photoOf(card),
  };
}

function parseCard(vcf: string): ICAL.Component | null {
  try {
    const parsed = ICAL.parse(vcf);
    const root = new ICAL.Component(Array.isArray(parsed[0]) ? parsed[0] : parsed);
    if (root.name !== 'vcard') return null;
    // Contact groups (vCard 4 KIND:group, Apple's X-ADDRESSBOOKSERVER-KIND) aren't people.
    const kind = str(root.getFirstPropertyValue('kind') || root.getFirstPropertyValue('x-addressbookserver-kind')).toLowerCase();
    return kind === 'group' ? null : root;
  } catch {
    return null;
  }
}

export async function listContacts(ctx: DavContext, books: string[]): Promise<Contact[]> {
  const results = await Promise.all(books.map((href) => fetchAll(ctx, href).then((items) => ({ href, items }))));
  const out: Contact[] = [];
  for (const { href, items } of results)
    for (const r of items) {
      const card = parseCard(text(r.props['address-data']));
      if (card) out.push(toContact(r, href, card));
    }
  return out.sort((a, b) => (a.name || a.emails[0]?.value || '').localeCompare(b.name || b.emails[0]?.value || ''));
}

// --- Writing ---------------------------------------------------------------------

export interface ContactInput {
  firstName: string;
  lastName: string;
  emails: Labeled[];
  phones: Labeled[];
  organization: string;
  title: string;
  note: string;
  birthday: string;
  groups: string[];
}

function setText(card: ICAL.Component, name: string, value: string) {
  if (value) card.updatePropertyWithValue(name, value);
  else card.removeAllProperties(name);
}

function setList(card: ICAL.Component, name: 'email' | 'tel', items: Labeled[]) {
  card.removeAllProperties(name);
  for (const item of items) {
    if (!item.value.trim()) continue;
    const prop = new ICAL.Property(name, card);
    prop.setValue(item.value.trim());
    const types = [name === 'email' ? 'INTERNET' : '', item.label ? item.label.toUpperCase() : ''].filter(Boolean);
    if (types.length) prop.setParameter('type', types);
    card.addProperty(prop);
  }
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

// "Dave Chen", but family name first without a space for CJK names: "王小明".
function formattedName(first: string, last: string) {
  if (first && last && CJK.test(first) && CJK.test(last)) return last + first;
  return [first, last].filter(Boolean).join(' ');
}

function apply(card: ICAL.Component, input: ContactInput) {
  const fn = formattedName(input.firstName, input.lastName) || input.organization || input.emails[0]?.value || '';
  card.updatePropertyWithValue('fn', fn);
  const n = card.getFirstProperty('n');
  const old = n ? (n.getFirstValue() as unknown) : null;
  const rest = Array.isArray(old) ? old.slice(2).map(str) : ['', '', ''];
  card.removeAllProperties('n');
  const nProp = new ICAL.Property('n', card);
  nProp.setValue([input.lastName, input.firstName, rest[0] ?? '', rest[1] ?? '', rest[2] ?? ''] as unknown as string);
  card.addProperty(nProp);
  setList(card, 'email', input.emails);
  setList(card, 'tel', input.phones);
  card.removeAllProperties('org');
  if (input.organization) {
    const org = new ICAL.Property('org', card);
    org.setValue([input.organization] as unknown as string);
    card.addProperty(org);
  }
  setText(card, 'title', input.title);
  setText(card, 'note', input.note);
  card.removeAllProperties('bday');
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.birthday)) {
    const bday = new ICAL.Property('bday', card);
    bday.resetType('date');
    bday.setValue(ICAL.Time.fromDateString(input.birthday));
    card.addProperty(bday);
  }
  card.removeAllProperties('categories');
  const groups = [...new Set(input.groups.map((g) => g.trim()).filter(Boolean))];
  if (groups.length) {
    const cat = new ICAL.Property('categories', card);
    cat.setValues(groups);
    card.addProperty(cat);
  }
  card.updatePropertyWithValue('rev', ICAL.Time.fromJSDate(new Date(), true));
}

const serialize = (card: ICAL.Component) => card.toString().replace(/\r?\n/g, '\r\n') + '\r\n';

export async function createContact({ dav }: DavContext, book: string, input: ContactInput) {
  const uid = randomUUID();
  const card = parseCard(`BEGIN:VCARD\r\nVERSION:3.0\r\nPRODID:-//purelymail-manager//EN\r\nUID:${uid}\r\nFN:x\r\nEND:VCARD\r\n`)!;
  apply(card, input);
  const href = `${book}${uid}.vcf`;
  const etag = await dav.put(href, serialize(card), 'text/vcard');
  return { href, etag };
}

export async function updateContact({ dav }: DavContext, href: string, etag: string | null | undefined, input: ContactInput) {
  const current = await dav.get(href);
  if (etag && current.etag && etag !== current.etag) throw new ApiError('Changed elsewhere', 409, 'dav_conflict');
  const card = parseCard(current.body);
  if (!card) throw new ApiError("This contact couldn't be read", 422, 'dav_invalid');
  apply(card, input);
  return { href, etag: await dav.put(href, serialize(card), 'text/vcard', current.etag ?? etag) };
}

export const deleteContact = ({ dav }: DavContext, href: string, etag: string | null | undefined) => dav.remove(href, etag);
