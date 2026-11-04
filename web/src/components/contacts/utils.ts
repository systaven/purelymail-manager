import type { Contact, ContactInput } from '@/lib/dav-api';
import type { Locale } from '@/lib/i18n';

// --- Names ------------------------------------------------------------------------

export const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

// "Dave Chen", but "王小明" (family name first, no space) for CJK names.
export function fullName(first: string, last: string) {
  const f = first.trim();
  const l = last.trim();
  if (f && l && CJK.test(f) && CJK.test(l)) return l + f;
  return [f, l].filter(Boolean).join(' ');
}

// What the list shows as the contact's name.
export const displayName = (c: Pick<Contact, 'name' | 'organization' | 'emails' | 'phones'>) =>
  c.name.trim() || c.organization.trim() || c.emails[0]?.value || c.phones[0]?.value || '';

// A company card: no person's name, the name is the organization.
export const isCompanyOnly = (c: Pick<Contact, 'firstName' | 'lastName' | 'name' | 'organization'>) =>
  !c.firstName.trim() && !c.lastName.trim() && (!c.name.trim() || c.name.trim() === c.organization.trim());

// --- Search -----------------------------------------------------------------------

// Lower case, without accents, full-width folded: "Zoë" ≈ "zoe", "ＡＢＣ" ≈ "abc".
export const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

const digits = (s: string) => s.replace(/\D/g, '');

export function searchText(c: Contact) {
  return fold(
    [c.name, c.firstName, c.lastName, c.organization, c.title, ...c.emails.map((e) => e.value), ...c.phones.map((p) => p.value), ...c.groups].join('\n')
  );
}

// Every word of the query must appear somewhere; phone numbers also match by digits alone.
export function matches(c: Contact, haystack: string, query: string) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const phoneDigits = c.phones.map((p) => digits(p.value));
  return words.every((w) => haystack.includes(w) || (/^\+?[\d\-().]{3,}$/.test(w) && phoneDigits.some((d) => d.includes(digits(w)))));
}

// --- Sorting and sections ---------------------------------------------------------

// The first character of each pinyin initial, in pinyin order (a known trick: the
// zh collation sorts Han characters by reading, so we find which bucket it falls in).
const PINYIN_BOUNDARIES = '阿八嚓哒妸发旮哈讥咔垃妈拏噢妑七呥仨他屲夕丫帀';
const PINYIN_LETTERS = 'ABCDEFGHJKLMNOPQRSTWXYZ';
const KANA_ROWS = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ'];
const KANA_STARTS = 'あかさたなはまやらわ';

let pinyinCollator: Intl.Collator | null = null;
function pinyinInitial(ch: string): string | null {
  try {
    pinyinCollator ??= new Intl.Collator('zh-CN-u-co-pinyin');
    if (pinyinCollator.compare(ch, PINYIN_BOUNDARIES[0]) < 0) return null;
    for (let i = PINYIN_BOUNDARIES.length - 1; i >= 0; i--) {
      if (pinyinCollator.compare(ch, PINYIN_BOUNDARIES[i]) >= 0) return PINYIN_LETTERS[i] ?? null;
    }
  } catch {
    // No ICU data for Chinese: fall through to '#'.
  }
  return null;
}

function kanaRow(ch: string): string | null {
  // Katakana → hiragana, then find the row (あ, か, さ...).
  let code = ch.codePointAt(0)!;
  if (code >= 0x30a1 && code <= 0x30f6) code -= 0x60;
  if (code < 0x3041 || code > 0x3096) return null;
  const hira = String.fromCodePoint(code);
  const base = hira.normalize('NFD')[0];
  let row = 0;
  for (let i = 0; i < KANA_STARTS.length; i++) if (base >= KANA_STARTS[i]) row = i;
  return KANA_ROWS[row];
}

export const OTHER_SECTION = '#';

// Section header for a name: A–Z for Latin script (accents dropped), the pinyin
// initial for Chinese in Chinese locales, the kana row in Japanese, else '#'.
export function sectionOf(name: string, locale: Locale): string {
  const ch = [...name.trim()][0];
  if (!ch) return OTHER_SECTION;
  const latin = fold(ch).toUpperCase();
  if (/^[A-Z]$/.test(latin)) return latin;
  if (/\p{Script=Han}/u.test(ch) && locale !== 'ja') return pinyinInitial(ch) ?? OTHER_SECTION;
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch)) return kanaRow(ch) ?? OTHER_SECTION;
  return OTHER_SECTION;
}

const sectionRank = (s: string) => (s === OTHER_SECTION ? 2 : /^[A-Z]$/.test(s) ? 0 : 1);

export interface Section {
  key: string;
  contacts: Contact[];
}

export function sortContacts(list: Contact[], locale: Locale): Section[] {
  const collator = new Intl.Collator(locale === 'en' ? 'en' : locale === 'ja' ? 'ja' : locale === 'zh-TW' ? 'zh-TW-u-co-pinyin' : 'zh-CN', {
    sensitivity: 'base',
    numeric: true,
  });
  const keyed = list.map((c) => {
    const name = displayName(c);
    return { c, name, section: sectionOf(name, locale) };
  });
  keyed.sort((a, b) => {
    if (a.section !== b.section) {
      const r = sectionRank(a.section) - sectionRank(b.section);
      return r || collator.compare(a.section, b.section);
    }
    return collator.compare(a.name, b.name) || a.c.href.localeCompare(b.c.href);
  });
  const sections: Section[] = [];
  for (const k of keyed) {
    const last = sections[sections.length - 1];
    if (last?.key === k.section) last.contacts.push(k.c);
    else sections.push({ key: k.section, contacts: [k.c] });
  }
  return sections;
}

// --- Groups -----------------------------------------------------------------------

export function groupCounts(list: Contact[], locale: Locale) {
  const counts = new Map<string, number>();
  for (const c of list) for (const g of new Set(c.groups)) counts.set(g, (counts.get(g) ?? 0) + 1);
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  return [...counts.entries()].sort((a, b) => collator.compare(a[0], b[0])).map(([name, count]) => ({ name, count }));
}

// --- Validation -------------------------------------------------------------------

export const isEmail = (s: string) => /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/.test(s.trim());

export function validBirthday(s: string) {
  if (!s) return true;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[1] >= 1600;
}

// Apple writes 1604 for "no year".
export function formatBirthday(s: string, locale: Locale) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const noYear = m[1] === '1604';
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'long', day: 'numeric', ...(noYear ? {} : { year: 'numeric' }) }).format(date);
}

// --- Cache helpers ------------------------------------------------------------------

// A contact as the server will return it after saving `input` (for the cache).
export function applyInput(base: Contact, input: ContactInput): Contact {
  const emails = input.emails.filter((e) => e.value.trim());
  const name = fullName(input.firstName, input.lastName) || input.organization.trim() || emails[0]?.value || '';
  return { ...base, ...input, emails, phones: input.phones.filter((p) => p.value.trim()), name, groups: [...new Set(input.groups)] };
}

// --- vCard export ---------------------------------------------------------------------

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

// Lines longer than 75 characters continue on the next line after a space.
function fold75(line: string) {
  const chars = [...line];
  if (chars.length <= 75) return line;
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += i === 0 ? 75 : 74) out.push((i ? ' ' : '') + chars.slice(i, i + (i === 0 ? 75 : 74)).join(''));
  return out.join('\r\n');
}

export function toVCard(c: Contact) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', 'PRODID:-//purelymail-manager//EN'];
  if (c.uid) lines.push(`UID:${esc(c.uid)}`);
  lines.push(`FN:${esc(displayName(c))}`);
  lines.push(`N:${esc(c.lastName)};${esc(c.firstName)};;;`);
  if (c.organization) lines.push(`ORG:${esc(c.organization)}`);
  if (c.title) lines.push(`TITLE:${esc(c.title)}`);
  for (const e of c.emails) lines.push(`EMAIL;TYPE=INTERNET${e.label ? ',' + e.label.toUpperCase() : ''}:${esc(e.value)}`);
  for (const p of c.phones) lines.push(`TEL${p.label ? ';TYPE=' + p.label.toUpperCase() : ''}:${esc(p.value)}`);
  if (c.birthday) lines.push(`BDAY;VALUE=date:${c.birthday}`);
  if (c.groups.length) lines.push(`CATEGORIES:${c.groups.map(esc).join(',')}`);
  if (c.note) lines.push(`NOTE:${esc(c.note)}`);
  const photo = c.photo && /^data:image\/(\w+);base64,(.+)$/.exec(c.photo);
  if (photo) lines.push(`PHOTO;ENCODING=b;TYPE=${photo[1].toUpperCase()}:${photo[2]}`);
  lines.push('END:VCARD');
  return lines.map(fold75).join('\r\n') + '\r\n';
}

export function downloadVCards(contacts: Contact[], filename: string) {
  const blob = new Blob(contacts.map(toVCard), { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename.replace(/[\\/:*?"<>|]+/g, '').trim() || 'contacts'}.vcf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Keyboard ---------------------------------------------------------------------

export const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
};

export const overlayOpen = () => Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'));
