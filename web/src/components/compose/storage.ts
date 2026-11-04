import type { Address } from '@/lib/mail-api';

// Composer preferences and the address book live in localStorage (per browser).

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: not remembered.
  }
}

export interface MailboxSettings {
  fromName: string;
  signature: string;
}

const settingsKey = (mailbox: string) => `compose:settings:${mailbox.toLowerCase()}`;
export const getMailboxSettings = (mailbox: string): MailboxSettings => ({ fromName: '', signature: '', ...read(settingsKey(mailbox), {}) });
export const setMailboxSettings = (mailbox: string, settings: MailboxSettings) => write(settingsKey(mailbox), settings);

export const UNDO_DELAYS = [0, 5, 10, 20, 30] as const;
export const getUndoDelay = (): number => {
  const value = read<number>('compose:undoDelay', 10);
  return (UNDO_DELAYS as readonly number[]).includes(value) ? value : 10;
};
export const setUndoDelay = (seconds: number) => write('compose:undoDelay', seconds);

export interface Contact {
  name: string;
  address: string;
  uses: number;
  last: number;
}

const CONTACTS_KEY = 'compose:contacts';
const MAX_CONTACTS = 500;

export const getContacts = (): Contact[] => read<Contact[]>(CONTACTS_KEY, []);

// Called after sending: everyone written to becomes a suggestion next time.
export function rememberContacts(people: Address[]) {
  const byAddress = new Map(getContacts().map((c) => [c.address, c]));
  const now = Date.now();
  for (const { name, address } of people) {
    const key = address.toLowerCase();
    const prev = byAddress.get(key);
    byAddress.set(key, { address: key, name: name || prev?.name || '', uses: (prev?.uses ?? 0) + 1, last: now });
  }
  const list = [...byAddress.values()].sort((a, b) => b.last - a.last).slice(0, MAX_CONTACTS);
  write(CONTACTS_KEY, list);
}
