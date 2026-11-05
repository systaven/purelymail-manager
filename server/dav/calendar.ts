import ICAL from 'ical.js';
import { randomUUID } from 'node:crypto';
import { ApiError, badRequest } from '../errors';
import { type DavContext, type DavResource, readCollection, resourceTypes, text } from './client';
import { isZone, vtimezone, wallClock } from './tz';

// Calendars over CalDAV. Events are expanded on the server (recurrences,
// exceptions, time zones) so the browser gets plain occurrences.

export interface Calendar {
  href: string;
  name: string;
  color: string | null;
  readOnly: boolean;
}

export interface Occurrence {
  id: string; // href + recurrence id: unique per occurrence
  href: string;
  etag: string | null;
  calendar: string;
  uid: string;
  title: string;
  location: string;
  description: string;
  allDay: boolean;
  start: string; // ISO instant, or YYYY-MM-DD for all-day events
  end: string; // exclusive
  recurring: boolean;
  recurrenceId: string | null; // set on occurrences of recurring events
  repeat: Repeat | null; // the series' rule, when it is one we can edit
  organizer: string | null;
  attendees: number;
}

export type Repeat = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

const MAX_OCCURRENCES = 2000;
const MAX_RANGE_DAYS = 400;

const color = (value: unknown) => {
  const c = text(value).trim();
  // Apple's #RRGGBBAA → #RRGGBB.
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c) ? c.slice(0, 7) : null;
};

export async function listCalendars({ dav, homes }: DavContext): Promise<Calendar[]> {
  const items = await dav.propfind(
    homes.calendars,
    1,
    '<d:resourcetype/><d:displayname/><a:calendar-color/><d:current-user-privilege-set/><c:supported-calendar-component-set/>'
  );
  return items
    .filter((r) => resourceTypes(r.props).includes('calendar'))
    .filter((r) => {
      // PurelyMail omits the component set; when present, keep calendars with events.
      const comps = r.props['supported-calendar-component-set']?.comp;
      if (!comps) return true;
      return (Array.isArray(comps) ? comps : [comps]).some((c: any) => String(c?.['@name']).toUpperCase() === 'VEVENT');
    })
    .map((r) => {
      const privileges = r.props['current-user-privilege-set'];
      // Read-only only when the server lists privileges and none of them writes.
      const canWrite = !privileges || /"(write|write-content|write-properties|bind|all)"/.test(JSON.stringify(privileges));
      return {
        href: r.href,
        name: text(r.props.displayname) || r.href.split('/').filter(Boolean).pop() || 'Calendar',
        color: color(r.props['calendar-color']),
        readOnly: !canWrite,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const xmlEscape = (s: string) => s.replace(/[<>&"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export async function createCalendar({ dav, homes }: DavContext, name: string, colour: string | null) {
  const href = `${homes.calendars}${randomUUID()}/`;
  const res = await dav.request('MKCALENDAR', href, {
    body: `<?xml version="1.0" encoding="utf-8"?><c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:set><d:prop><d:displayname>${xmlEscape(name)}</d:displayname>${colour ? `<a:calendar-color>${colour}</a:calendar-color>` : ''}<c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>`,
  });
  if (!res.ok) throw new ApiError(`The calendar server answered ${res.status}`, 502, 'dav_failed');
  return href;
}

export async function updateCalendar({ dav }: DavContext, href: string, name: string, colour: string | null) {
  const res = await dav.request('PROPPATCH', href, {
    body: `<?xml version="1.0" encoding="utf-8"?><d:propertyupdate xmlns:d="DAV:" xmlns:a="http://apple.com/ns/ical/"><d:set><d:prop><d:displayname>${xmlEscape(name)}</d:displayname>${colour ? `<a:calendar-color>${colour}</a:calendar-color>` : ''}</d:prop></d:set></d:propertyupdate>`,
  });
  if (res.status !== 207 && !res.ok) throw new ApiError(`The calendar server answered ${res.status}`, 502, 'dav_failed');
}

// --- Reading ---------------------------------------------------------------------

// Every event in the calendar; listEvents keeps the ones in range. (PurelyMail's
// time-range REPORT can miss events saved moments ago, so it isn't used.)
const fetchRange = ({ dav, address }: DavContext, calendar: string): Promise<DavResource[]> => readCollection(dav, address, calendar, 'calendar');

// Makes sure every TZID used in `ics` is known to ical.js, defining IANA zones
// that the file names without a VTIMEZONE.
function registerZones(root: ICAL.Component, ics: string) {
  for (const vtz of root.getAllSubcomponents('vtimezone')) {
    const id = String(vtz.getFirstPropertyValue('tzid') ?? '');
    if (id && !ICAL.TimezoneService.has(id)) ICAL.TimezoneService.register(vtz);
  }
  for (const m of ics.matchAll(/TZID=("?)([^";:]+)\1[;:]/g)) {
    const id = m[2];
    if (!ICAL.TimezoneService.has(id) && isZone(id)) ICAL.TimezoneService.register(new ICAL.Component(ICAL.parse(vtimezone(id))));
  }
}

function parseCalendar(ics: string): ICAL.Component | null {
  try {
    const root = new ICAL.Component(ICAL.parse(ics));
    registerZones(root, ics);
    // Re-parse so times pick up zones registered just now.
    return new ICAL.Component(ICAL.parse(ics));
  } catch {
    return null;
  }
}

function repeatOf(event: ICAL.Event): Repeat | null {
  const rules = event.component.getAllProperties('rrule');
  if (rules.length !== 1 || event.component.hasProperty('rdate')) return null;
  const r = rules[0].getFirstValue() as ICAL.Recur;
  if ((r.interval ?? 1) !== 1 || r.count || r.until) return null;
  const parts = Object.keys(r.parts ?? {});
  const byday = (r.parts?.BYDAY ?? []) as string[];
  if (r.freq === 'DAILY' && parts.length === 0) return 'daily';
  if (r.freq === 'WEEKLY' && parts.length === 1 && byday.join(',') === 'MO,TU,WE,TH,FR') return 'weekdays';
  if (r.freq === 'WEEKLY' && (parts.length === 0 || (parts.length === 1 && byday.length === 1))) return 'weekly';
  if (r.freq === 'MONTHLY' && parts.length === 0) return 'monthly';
  if (r.freq === 'YEARLY' && parts.length === 0) return 'yearly';
  return null;
}

const dateText = (t: ICAL.Time) => `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
const ymd = (ms: number): [number, number, number] => {
  const d = new Date(ms);
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
};

// A copy of `t` moved by whole days and/or seconds of wall-clock time.
function adjusted(t: ICAL.Time, days: number, seconds: number) {
  const n = t.clone();
  n.adjust(days, 0, 0, seconds);
  return n;
}

const utcNow = () => ICAL.Time.fromJSDate(new Date(), true);

const instant = (t: ICAL.Time) => (t.isDate ? Date.UTC(t.year, t.month - 1, t.day) : t.toJSDate().getTime());

function occurrence(
  base: { href: string; etag: string | null; calendar: string; recurring: boolean; repeat: Repeat | null },
  item: ICAL.Event,
  start: ICAL.Time,
  end: ICAL.Time,
  recurrenceId: ICAL.Time | null
): Occurrence {
  const allDay = start.isDate;
  let endTime = end;
  if (allDay && endTime.compare(start) <= 0) {
    endTime = adjusted(start, 1, 0);
  }
  const rid = recurrenceId ? recurrenceId.toString() : null;
  return {
    id: `${base.href}#${rid ?? ''}`,
    href: base.href,
    etag: base.etag,
    calendar: base.calendar,
    uid: item.uid ?? '',
    title: item.summary ?? '',
    location: item.location ?? '',
    description: item.description ?? '',
    allDay,
    start: allDay ? dateText(start) : start.toJSDate().toISOString(),
    end: allDay ? dateText(endTime) : endTime.toJSDate().toISOString(),
    recurring: base.recurring,
    recurrenceId: rid,
    repeat: base.repeat,
    organizer: String(item.organizer ?? '').replace(/^mailto:/i, '') || null,
    attendees: item.attendees.length,
  };
}

function expand(resource: DavResource, calendar: string, from: number, to: number, out: Occurrence[]) {
  const ics = text(resource.props['calendar-data']);
  const root = ics && parseCalendar(ics);
  if (!root) return;
  const vevents = root.getAllSubcomponents('vevent');
  const master = vevents.find((v) => !v.hasProperty('recurrence-id'));
  const etag = text(resource.props.getetag) || null;
  const overlaps = (s: ICAL.Time, e: ICAL.Time) => instant(s) < to && Math.max(instant(e), instant(s) + 1) > from;

  if (!master) {
    // Only exceptions (an invitation to one occurrence): show them as they are.
    for (const v of vevents) {
      const ev = new ICAL.Event(v);
      if (overlaps(ev.startDate, ev.endDate)) out.push(occurrence({ href: resource.href, etag, calendar, recurring: false, repeat: null }, ev, ev.startDate, ev.endDate, null));
    }
    return;
  }
  const event = new ICAL.Event(master);
  for (const v of vevents) if (v !== master) event.relateException(v);
  if (!event.startDate) return;

  if (!event.isRecurring()) {
    if (overlaps(event.startDate, event.endDate)) out.push(occurrence({ href: resource.href, etag, calendar, recurring: false, repeat: null }, event, event.startDate, event.endDate, null));
    return;
  }
  const base = { href: resource.href, etag, calendar, recurring: true, repeat: repeatOf(event) };
  const duration = instant(event.endDate) - instant(event.startDate);
  const it = event.iterator();
  for (let next = it.next(), n = 0; next && n < MAX_OCCURRENCES * 5; next = it.next(), n++) {
    // Moved exceptions can land anywhere, so look a little past both ends.
    if (instant(next) - Math.max(duration, 0) - 32 * 86400_000 > to) break;
    const details = event.getOccurrenceDetails(next);
    if (!overlaps(details.startDate, details.endDate)) continue;
    out.push(occurrence(base, details.item, details.startDate, details.endDate, details.recurrenceId));
    if (out.length >= MAX_OCCURRENCES) return;
  }
}

export async function listEvents(ctx: DavContext, calendars: string[], fromMs: number, toMs: number): Promise<Occurrence[]> {
  if (!(toMs > fromMs) || toMs - fromMs > MAX_RANGE_DAYS * 86400_000) throw badRequest('Invalid range', 'invalid_field', { name: 'range' });
  const out: Occurrence[] = [];
  const results = await Promise.all(calendars.map((href) => fetchRange(ctx, href).then((items) => ({ href, items }))));
  for (const { href, items } of results) for (const r of items) if (r.props['calendar-data']) expand(r, href, fromMs, toMs, out);
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

// --- Writing ---------------------------------------------------------------------

export interface EventInput {
  title: string;
  location: string;
  description: string;
  allDay: boolean;
  start: string; // ISO instant, or YYYY-MM-DD when allDay
  end: string; // exclusive
  timeZone: string;
  repeat: Repeat | null | undefined; // undefined: leave the rule as it is
}

const RULES: Record<Repeat, string> = {
  daily: 'FREQ=DAILY',
  weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  weekly: 'FREQ=WEEKLY',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY',
};

function dateValue(value: string): ICAL.Time {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) throw badRequest('Invalid date', 'invalid_field', { name: 'start' });
  return ICAL.Time.fromData({ year: +m[1], month: +m[2], day: +m[3], isDate: true });
}

function zoneFor(tz: string): ICAL.Timezone | null {
  if (!tz || tz === 'UTC' || !isZone(tz)) return null;
  if (!ICAL.TimezoneService.has(tz)) ICAL.TimezoneService.register(new ICAL.Component(ICAL.parse(vtimezone(tz))));
  return ICAL.TimezoneService.get(tz) ?? null;
}

function timeValue(value: string, tz: string): ICAL.Time {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw badRequest('Invalid time', 'invalid_field', { name: 'start' });
  const zone = zoneFor(tz);
  if (!zone) return ICAL.Time.fromJSDate(new Date(ms), true);
  const w = wallClock(ms, tz);
  return ICAL.Time.fromData({ year: w.year, month: w.month, day: w.day, hour: w.hour, minute: w.minute, second: w.second }, zone);
}

function setTime(comp: ICAL.Component, name: 'dtstart' | 'dtend' | 'recurrence-id', time: ICAL.Time) {
  comp.removeAllProperties(name);
  const prop = new ICAL.Property(name, comp);
  prop.setValue(time);
  if (!time.isDate && time.zone && time.zone !== ICAL.Timezone.utcTimezone && time.zone.tzid && time.zone.tzid !== 'floating') prop.setParameter('tzid', time.zone.tzid);
  comp.addProperty(prop);
}

function setText(comp: ICAL.Component, name: string, value: string) {
  if (value) comp.updatePropertyWithValue(name, value);
  else comp.removeAllProperties(name);
}

function times(input: EventInput) {
  const start = input.allDay ? dateValue(input.start) : timeValue(input.start, input.timeZone);
  let end = input.allDay ? dateValue(input.end) : timeValue(input.end, input.timeZone);
  if (end.compare(start) <= 0) {
    end = input.allDay ? adjusted(start, 1, 0) : adjusted(start, 0, 1800);
  }
  return { start, end };
}

function stamp(comp: ICAL.Component) {
  comp.updatePropertyWithValue('dtstamp', utcNow());
  comp.updatePropertyWithValue('last-modified', utcNow());
  const seq = Number(comp.getFirstPropertyValue('sequence') ?? 0);
  if (comp.hasProperty('sequence') || seq) comp.updatePropertyWithValue('sequence', seq + 1);
}

function applyFields(comp: ICAL.Component, input: EventInput) {
  comp.updatePropertyWithValue('summary', input.title || '');
  setText(comp, 'location', input.location);
  setText(comp, 'description', input.description);
}

// Adds VTIMEZONEs for zones the calendar's events use and doesn't define yet.
function addZones(root: ICAL.Component) {
  const defined = new Set(root.getAllSubcomponents('vtimezone').map((z) => String(z.getFirstPropertyValue('tzid'))));
  const used = new Set<string>();
  for (const v of root.getAllSubcomponents('vevent'))
    for (const p of v.getAllProperties()) {
      const tz = p.getParameter('tzid');
      if (typeof tz === 'string') used.add(tz);
    }
  for (const tz of used) if (!defined.has(tz) && isZone(tz)) root.addSubcomponent(new ICAL.Component(ICAL.parse(vtimezone(tz))));
}

const serialize = (root: ICAL.Component) => root.toString().replace(/\r?\n/g, '\r\n') + '\r\n';

export async function createEvent({ dav }: DavContext, calendar: string, input: EventInput) {
  const uid = randomUUID();
  const root = new ICAL.Component(['vcalendar', [], []]);
  root.updatePropertyWithValue('prodid', '-//purelymail-manager//EN');
  root.updatePropertyWithValue('version', '2.0');
  const ev = new ICAL.Component('vevent');
  ev.updatePropertyWithValue('uid', uid);
  ev.updatePropertyWithValue('dtstamp', utcNow());
  ev.updatePropertyWithValue('created', utcNow());
  const { start, end } = times(input);
  setTime(ev, 'dtstart', start);
  setTime(ev, 'dtend', end);
  applyFields(ev, input);
  if (input.repeat) ev.addPropertyWithValue('rrule', ICAL.Recur.fromString(RULES[input.repeat]));
  root.addSubcomponent(ev);
  addZones(root);
  const href = `${calendar}${uid}.ics`;
  const etag = await dav.put(href, serialize(root), 'text/calendar');
  return { href, etag };
}

async function load({ dav }: DavContext, href: string) {
  const { body, etag } = await dav.get(href);
  const root = parseCalendar(body);
  if (!root) throw new ApiError("This event couldn't be read", 422, 'dav_invalid');
  const master = root.getAllSubcomponents('vevent').find((v) => !v.hasProperty('recurrence-id'));
  return { root, master, etag };
}

// Recurrence ids from listEvents are "YYYY-MM-DDTHH:MM:SS" or "YYYY-MM-DD" in
// the series' own zone; rebuilds the matching ICAL.Time.
function recurrenceTime(master: ICAL.Component, rid: string): ICAL.Time {
  const start = master.getFirstPropertyValue('dtstart') as ICAL.Time;
  const t = ICAL.Time.fromString(rid.replace(/Z$/, ''), null);
  if (rid.endsWith('Z') || start.zone === ICAL.Timezone.utcTimezone) t.zone = ICAL.Timezone.utcTimezone;
  else if (start.zone) t.zone = start.zone;
  return t;
}

const sameTime = (a: ICAL.Time, b: ICAL.Time) => a.isDate === b.isDate && instant(a) === instant(b);

function findException(root: ICAL.Component, rid: ICAL.Time) {
  return root.getAllSubcomponents('vevent').find((v) => {
    const r = v.getFirstPropertyValue('recurrence-id') as ICAL.Time | null;
    return r && sameTime(r, rid);
  });
}

const checkEtag = (current: string | null, expected: string | null | undefined) => {
  if (expected && current && expected !== current) throw new ApiError('Changed elsewhere', 409, 'dav_conflict');
};

export async function updateEvent(
  ctx: DavContext,
  href: string,
  etag: string | null | undefined,
  input: EventInput,
  scope: { recurrenceId: string | null; only: boolean; occurrenceStart: string | null }
) {
  const { root, master, etag: current } = await load(ctx, href);
  checkEtag(current, etag);
  const { start, end } = times(input);
  const recurring = !!master && (master.hasProperty('rrule') || master.hasProperty('rdate'));

  if (master && recurring && scope.recurrenceId && scope.only) {
    // This occurrence only: write (or rewrite) an exception.
    const rid = recurrenceTime(master, scope.recurrenceId);
    let ex = findException(root, rid);
    if (!ex) {
      ex = new ICAL.Component('vevent');
      for (const p of master.getAllProperties()) {
        if (['rrule', 'rdate', 'exdate', 'dtstart', 'dtend', 'duration'].includes(p.name)) continue;
        ex.addProperty(ICAL.Property.fromString(p.toICALString()));
      }
      setTime(ex, 'recurrence-id', rid);
      root.addSubcomponent(ex);
    }
    setTime(ex, 'dtstart', start);
    ex.removeAllProperties('duration');
    setTime(ex, 'dtend', end);
    applyFields(ex, input);
    stamp(ex);
  } else {
    const target = master ?? root.getFirstSubcomponent('vevent');
    if (!target) throw new ApiError("This event couldn't be read", 422, 'dav_invalid');
    applyFields(target, input);
    if (recurring && scope.occurrenceStart) {
      // The whole series: move it by however much this occurrence moved,
      // along with its exceptions and excluded dates.
      const oldStart = target.getFirstPropertyValue('dtstart') as ICAL.Time;
      const occ = scope.occurrenceStart;
      const occDay = Date.parse(`${occ.slice(0, 10)}T00:00:00Z`);
      const length = instant(end) - instant(start);
      const zoneId = oldStart.zone?.tzid;
      const tz = zoneId && isZone(zoneId) ? zoneId : isZone(input.timeZone) ? input.timeZone : 'UTC';
      const wall = (ms: number) => {
        const w = wallClock(ms, tz);
        return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
      };
      let newStart: ICAL.Time;
      let move: ((t: ICAL.Time) => ICAL.Time) | null = null;
      if (input.allDay && oldStart.isDate) {
        const days = Math.round((instant(start) - occDay) / 86400_000);
        move = (t) => adjusted(t, days, 0);
        newStart = move(oldStart);
      } else if (!input.allDay && !oldStart.isDate) {
        const seconds = Math.round((wall(instant(start)) - wall(Date.parse(occ))) / 1000);
        move = (t) => adjusted(t, 0, seconds);
        newStart = move(oldStart);
      } else if (input.allDay) {
        // Timed → all-day: the same days, no time.
        const days = Math.round((instant(start) - Date.UTC(...ymd(wall(Date.parse(occ))))) / 86400_000);
        newStart = adjusted(dateValue(new Date(wall(instant(oldStart))).toISOString().slice(0, 10)), days, 0);
      } else {
        // All-day → timed: the same day shift, at the new time of day.
        const w = wallClock(instant(start), tz);
        const days = Math.round((Date.UTC(w.year, w.month - 1, w.day) - occDay) / 86400_000);
        const d = new Date(instant(oldStart) + days * 86400_000);
        const data = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: w.hour, minute: w.minute };
        newStart = ICAL.Time.fromData(data, zoneFor(tz) ?? ICAL.Timezone.utcTimezone);
      }
      if (move) {
        for (const p of target.getAllProperties('exdate')) p.setValues(p.getValues().map((t) => move!(t as ICAL.Time)));
        for (const ex of root.getAllSubcomponents('vevent')) {
          const rid = ex !== target && (ex.getFirstPropertyValue('recurrence-id') as ICAL.Time | null);
          if (rid) setTime(ex, 'recurrence-id', move(rid));
        }
      } else {
        // The kind of time changed, so old exceptions can't match any more.
        target.removeAllProperties('exdate');
        for (const ex of root.getAllSubcomponents('vevent')) if (ex !== target) root.removeSubcomponent(ex);
      }
      setTime(target, 'dtstart', newStart);
      target.removeAllProperties('duration');
      setTime(target, 'dtend', newStart.isDate ? adjusted(newStart, Math.max(1, Math.round(length / 86400_000)), 0) : adjusted(newStart, 0, Math.max(0, Math.round(length / 1000))));
    } else {
      setTime(target, 'dtstart', start);
      target.removeAllProperties('duration');
      setTime(target, 'dtend', end);
    }
    if (input.repeat !== undefined && (input.repeat === null || repeatOf(new ICAL.Event(target)) !== input.repeat)) {
      target.removeAllProperties('rrule');
      if (input.repeat) target.addPropertyWithValue('rrule', ICAL.Recur.fromString(RULES[input.repeat]));
      else {
        target.removeAllProperties('rdate');
        target.removeAllProperties('exdate');
        for (const ex of root.getAllSubcomponents('vevent')) if (ex !== target) root.removeSubcomponent(ex);
      }
    }
    stamp(target);
  }
  addZones(root);
  return { href, etag: await ctx.dav.put(href, serialize(root), 'text/calendar', current ?? etag) };
}

export async function deleteEvent(ctx: DavContext, href: string, etag: string | null | undefined, recurrenceId: string | null) {
  if (!recurrenceId) return ctx.dav.remove(href, etag);
  // One occurrence: exclude it from the series.
  const { root, master, etag: current } = await load(ctx, href);
  checkEtag(current, etag);
  if (!master) return ctx.dav.remove(href, current ?? etag);
  const rid = recurrenceTime(master, recurrenceId);
  const ex = findException(root, rid);
  if (ex) root.removeSubcomponent(ex);
  const prop = new ICAL.Property('exdate', master);
  prop.setValue(rid);
  if (!rid.isDate && rid.zone && rid.zone !== ICAL.Timezone.utcTimezone && rid.zone.tzid !== 'floating') prop.setParameter('tzid', rid.zone.tzid);
  master.addProperty(prop);
  stamp(master);
  await ctx.dav.put(href, serialize(root), 'text/calendar', current ?? etag);
}

// Moves an event to another calendar: copy, then delete the original.
export async function moveEvent(ctx: DavContext, href: string, etag: string | null | undefined, target: string) {
  const { body, etag: current } = await ctx.dav.get(href);
  checkEtag(current, etag);
  const name = href.split('/').pop() || `${randomUUID()}.ics`;
  const next = `${target}${name}`;
  await ctx.dav.put(next, body, 'text/calendar');
  await ctx.dav.remove(href, current);
  return { href: next };
}
