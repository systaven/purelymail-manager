// Time zones for iCalendar. Events we write use the browser's IANA zone
// (TZID=Europe/Berlin), so recurring events keep their wall-clock time across
// DST. iCalendar wants a VTIMEZONE definition next to them; we build one from
// Node's ICU data. The same definitions let us read events from other clients
// that name an IANA zone without including its VTIMEZONE.

const validZones = new Map<string, boolean>();

export function isZone(tz: string): boolean {
  let ok = validZones.get(tz);
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      ok = true;
    } catch {
      ok = false;
    }
    if (validZones.size < 1000) validZones.set(tz, ok);
  }
  return ok;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

// The wall-clock time in `tz` at instant `ms`.
export function wallClock(ms: number, tz: string): WallClock {
  const parts: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) if (p.type !== 'literal') parts[p.type] = Number(p.value);
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

// UTC offset of `tz` at instant `ms`, in minutes.
export function offsetAt(ms: number, tz: string): number {
  const w = wallClock(ms, tz);
  return Math.round((Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(ms / 1000) * 1000) / 60_000);
}

const pad = (n: number, len = 2) => String(Math.abs(n)).padStart(len, '0');
const offsetText = (min: number) => `${min < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(min) / 60))}${pad(Math.abs(min) % 60)}`;
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// Finds the instants in `year` where the offset changes.
function transitions(year: number, tz: string): { at: number; from: number; to: number }[] {
  const out: { at: number; from: number; to: number }[] = [];
  const end = Date.UTC(year + 1, 0, 1);
  let t = Date.UTC(year, 0, 1);
  let prev = offsetAt(t, tz);
  const step = 7 * 24 * 3600_000;
  while (t < end) {
    const next = Math.min(t + step, end);
    const off = offsetAt(next, tz);
    if (off !== prev) {
      // Narrow down to the minute.
      let lo = t;
      let hi = next;
      while (hi - lo > 60_000) {
        const mid = lo + Math.floor((hi - lo) / 120_000) * 60_000;
        if (offsetAt(mid, tz) === prev) lo = mid;
        else hi = mid;
      }
      out.push({ at: hi, from: prev, to: off });
      prev = off;
    }
    t = next;
  }
  return out;
}

const vtimezones = new Map<string, string>();

// A VTIMEZONE for `tz`, valid from the year before `year` onwards, assuming the
// zone's current DST rule ("nth or last weekday of a month") keeps applying.
export function vtimezone(tz: string, year = new Date().getUTCFullYear()): string {
  const key = `${tz}|${year}`;
  const cached = vtimezones.get(key);
  if (cached) return cached;
  const from = year - 1;
  const changes = transitions(from, tz);
  const lines = ['BEGIN:VTIMEZONE', `TZID:${tz}`];
  if (changes.length === 0) {
    const off = offsetText(offsetAt(Date.UTC(from, 0, 1), tz));
    lines.push('BEGIN:STANDARD', `DTSTART:${from}0101T000000`, `TZOFFSETFROM:${off}`, `TZOFFSETTO:${off}`, 'END:STANDARD');
  } else {
    for (const c of changes) {
      // Local time just before the change, as written in DTSTART.
      const before = new Date(c.at + c.from * 60_000);
      const day = before.getUTCDate();
      const month = before.getUTCMonth() + 1;
      const daysInMonth = new Date(Date.UTC(before.getUTCFullYear(), month, 0)).getUTCDate();
      const nth = day + 7 > daysInMonth ? -1 : Math.ceil(day / 7);
      const kind = c.to > c.from ? 'DAYLIGHT' : 'STANDARD';
      lines.push(
        `BEGIN:${kind}`,
        `DTSTART:${before.getUTCFullYear()}${pad(month)}${pad(day)}T${pad(before.getUTCHours())}${pad(before.getUTCMinutes())}00`,
        `RRULE:FREQ=YEARLY;BYMONTH=${month};BYDAY=${nth}${DAYS[before.getUTCDay()]}`,
        `TZOFFSETFROM:${offsetText(c.from)}`,
        `TZOFFSETTO:${offsetText(c.to)}`,
        `END:${kind}`
      );
    }
  }
  lines.push('END:VTIMEZONE');
  const text = lines.join('\r\n');
  if (vtimezones.size < 200) vtimezones.set(key, text);
  return text;
}
