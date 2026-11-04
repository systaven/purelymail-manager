import { api } from './api';

// Types and calls for /api/mail/dav (calendar and contacts over CalDAV/CardDAV).
// Server: server/routes/dav.ts, server/dav/*. Every call names the mailbox,
// like the mail API; hrefs are server paths returned by these calls.

export interface Calendar {
  href: string;
  name: string;
  color: string | null; // #rrggbb
  readOnly: boolean;
}

export type Repeat = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

// One occurrence: recurring events are expanded by the server.
export interface CalendarEvent {
  id: string; // unique per occurrence
  href: string;
  etag: string | null;
  calendar: string; // calendar href
  uid: string;
  title: string;
  location: string;
  description: string;
  allDay: boolean;
  start: string; // ISO instant; for all-day events YYYY-MM-DD
  end: string; // exclusive; for all-day events the day after the last day
  recurring: boolean;
  recurrenceId: string | null;
  repeat: Repeat | null; // null on a recurring event: a rule we can't edit ("custom")
  organizer: string | null;
  attendees: number;
}

export interface EventInput {
  title: string;
  location: string;
  description: string;
  allDay: boolean;
  start: string; // ISO instant, or YYYY-MM-DD when allDay
  end: string; // exclusive
  timeZone: string; // IANA, e.g. Intl.DateTimeFormat().resolvedOptions().timeZone
  // null: doesn't repeat; omit (undefined) to keep a rule the UI can't edit.
  repeat?: Repeat | null;
}

export interface AddressBook {
  href: string;
  name: string;
}

export interface Labeled {
  value: string;
  label: string; // 'home' | 'work' | 'cell' | 'main' | 'fax' | 'other' | ''
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
  photo: string | null; // data: URL
}

export type ContactInput = Pick<Contact, 'firstName' | 'lastName' | 'emails' | 'phones' | 'organization' | 'title' | 'note' | 'birthday' | 'groups'>;

export const localTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export const davKeys = {
  calendars: (mailbox: string) => ['dav', mailbox, 'calendars'] as const,
  // Prefix for invalidating every event range of a mailbox.
  allEvents: (mailbox: string) => ['dav', mailbox, 'events'] as const,
  events: (mailbox: string, from: string, to: string) => ['dav', mailbox, 'events', from, to] as const,
  addressBooks: (mailbox: string) => ['dav', mailbox, 'addressbooks'] as const,
  contacts: (mailbox: string) => ['dav', mailbox, 'contacts'] as const,
};

const qs = (params: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][]).toString();

export const davApi = {
  calendars: (mailbox: string) => api<Calendar[]>(`/mail/dav/calendars?${qs({ mailbox })}`),
  createCalendar: (mailbox: string, name: string, color: string | null) => api<{ href: string }>('/mail/dav/calendars', { body: { mailbox, name, color } }),
  updateCalendar: (mailbox: string, href: string, name: string, color: string | null) =>
    api('/mail/dav/calendars', { method: 'PATCH', body: { mailbox, href, name, color } }),
  deleteCalendar: (mailbox: string, href: string) => api('/mail/dav/calendars', { method: 'DELETE', body: { mailbox, href } }),

  // from/to: ISO instants; at most ~400 days apart.
  events: (mailbox: string, from: string, to: string, calendars?: string[]) =>
    api<CalendarEvent[]>(`/mail/dav/events?${qs({ mailbox, from, to, calendars: calendars?.join(',') })}`),
  createEvent: (mailbox: string, calendar: string, input: EventInput) =>
    api<{ href: string; etag: string | null }>('/mail/dav/events', { body: { mailbox, calendar, ...input } }),
  // scope 'this': only this occurrence (needs recurrenceId); 'all': the whole
  // series, shifted by however much this occurrence (occurrenceStart) moved.
  // calendar: move the event to another calendar (scope 'all' only).
  updateEvent: (
    mailbox: string,
    event: Pick<CalendarEvent, 'href' | 'etag' | 'recurrenceId' | 'start'>,
    input: EventInput,
    opts: { scope?: 'this' | 'all'; calendar?: string } = {}
  ) =>
    api<{ href: string; etag: string | null }>('/mail/dav/events', {
      method: 'PUT',
      body: { mailbox, href: event.href, etag: event.etag, recurrenceId: event.recurrenceId, occurrenceStart: event.start, scope: opts.scope ?? 'all', calendar: opts.calendar, ...input },
    }),
  deleteEvent: (mailbox: string, event: Pick<CalendarEvent, 'href' | 'etag' | 'recurrenceId'>, scope: 'this' | 'all' = 'all') =>
    api('/mail/dav/events', { method: 'DELETE', body: { mailbox, href: event.href, etag: event.etag, recurrenceId: event.recurrenceId, scope } }),

  addressBooks: (mailbox: string) => api<AddressBook[]>(`/mail/dav/addressbooks?${qs({ mailbox })}`),
  contacts: (mailbox: string) => api<Contact[]>(`/mail/dav/contacts?${qs({ mailbox })}`),
  createContact: (mailbox: string, addressBook: string, input: ContactInput) =>
    api<{ href: string; etag: string | null }>('/mail/dav/contacts', { body: { mailbox, addressBook, ...input } }),
  updateContact: (mailbox: string, contact: Pick<Contact, 'href' | 'etag'>, input: ContactInput) =>
    api<{ href: string; etag: string | null }>('/mail/dav/contacts', { method: 'PUT', body: { mailbox, href: contact.href, etag: contact.etag, ...input } }),
  deleteContact: (mailbox: string, contact: Pick<Contact, 'href' | 'etag'>) =>
    api('/mail/dav/contacts', { method: 'DELETE', body: { mailbox, href: contact.href, etag: contact.etag } }),
};
