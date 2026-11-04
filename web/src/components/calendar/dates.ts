import { useEffect, useMemo, useState } from 'react';
import { useLocale, type Locale } from '@/lib/i18n';

// Local-time date helpers for the calendar. Days are local midnights; moving
// by days keeps the wall-clock time across DST changes.

export type View = 'month' | 'week' | 'day' | 'agenda';
export const VIEWS: View[] = ['month', 'week', 'day', 'agenda'];
export const DAY_MS = 86_400_000;
export const AGENDA_DAYS = 30;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
export const addMinutes = (d: Date, n: number) => new Date(d.getTime() + n * 60_000);
export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
// Whole days from a to b.
export const dayDiff = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
export const startOfWeek = (d: Date, weekStart: number) => addDays(startOfDay(d), -((d.getDay() - weekStart + 7) % 7));
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const minutesIntoDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
// The given minute of a day (may be 1440 = next midnight).
export const atMinutes = (day: Date, minutes: number) => {
  const r = startOfDay(day);
  r.setHours(Math.floor(minutes / 60), minutes % 60);
  return r;
};
export const addMonths = (d: Date, n: number) => {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), last));
  return target;
};

const pad = (n: number) => String(n).padStart(2, '0');
export const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromYmd = (s: string | null | undefined): Date | null => {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null;
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? null : d;
};

// The last day an event touches (its end is exclusive).
export const lastDay = (start: Date, end: Date) => startOfDay(new Date(Math.max(start.getTime(), end.getTime() - 1)));

export function viewRange(view: View, date: Date, weekStart: number) {
  let start: Date;
  let days: number;
  if (view === 'month') {
    start = startOfWeek(startOfMonth(date), weekStart);
    days = 42;
  } else if (view === 'week') {
    start = startOfWeek(date, weekStart);
    days = 7;
  } else if (view === 'day') {
    start = startOfDay(date);
    days = 1;
  } else {
    start = startOfDay(date);
    days = AGENDA_DAYS;
  }
  return { start, end: addDays(start, days), days };
}

export function stepDate(view: View, date: Date, delta: number) {
  if (view === 'month') return addMonths(date, delta);
  if (view === 'week') return addDays(date, 7 * delta);
  if (view === 'agenda') return addDays(date, AGENDA_DAYS * delta);
  return addDays(date, delta);
}

export const snap = (minutes: number, step: number) => Math.round(minutes / step) * step;

// Re-renders every 30 seconds so "now" markers stay current.
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export type CalFormat = ReturnType<typeof makeFormat>;

function makeFormat(locale: Locale) {
  const tag = locale === 'en' ? 'en-US' : locale;
  const hour12 = locale === 'en';
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag, o);
  const timeF = f(hour12 ? { hour: 'numeric', minute: '2-digit', hour12: true } : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const hourF = f(hour12 ? { hour: 'numeric', hour12: true } : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  // "9:00 AM" → "9am", "9:30 PM" → "9:30pm" (English only).
  const compact = (s: string) => (hour12 ? s.replace(/:00(?!\d)/, '').replace(/[\s ]*([AaPp])\.?\s*[Mm]\.?/, (_, a: string) => `${a.toLowerCase()}m`) : s);
  const monthYearF = f({ year: 'numeric', month: 'long' });
  const dayF = f({ year: 'numeric', month: 'long', day: 'numeric' });
  const dateLongF = f({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const dateMediumF = f({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const dateShortF = f({ month: 'short', day: 'numeric' });
  const weekdayShortF = f({ weekday: 'short' });
  const weekdayNarrowF = f({ weekday: 'narrow' });
  const weekdayLongF = f({ weekday: 'long' });
  const monthShortF = f({ month: 'short' });
  const dayMonthF = f({ month: 'long', day: 'numeric' });
  return {
    locale,
    tag,
    hour12,
    weekStart: locale === 'en' ? 0 : 1,
    time: (d: Date) => compact(timeF.format(d)),
    timeFull: (d: Date) => timeF.format(d),
    timeRange: (a: Date, b: Date) => `${compact(timeF.format(a))} – ${compact(timeF.format(b))}`,
    hour: (h: number) => compact(hourF.format(new Date(2000, 0, 1, h))),
    monthYear: (d: Date) => monthYearF.format(d),
    monthYearRange: (a: Date, b: Date) => monthYearF.formatRange(a, b),
    day: (d: Date) => dayF.format(d),
    dayRange: (a: Date, b: Date) => dayF.formatRange(a, b),
    dateLong: (d: Date) => dateLongF.format(d),
    dateMedium: (d: Date) => dateMediumF.format(d),
    dateShort: (d: Date) => dateShortF.format(d),
    dateRange: (a: Date, b: Date) => (sameDay(a, b) ? dateLongF.format(a) : dateMediumF.formatRange(a, b)),
    shortRange: (a: Date, b: Date) => dateShortF.formatRange(a, b),
    weekdayShort: (d: Date) => weekdayShortF.format(d),
    weekdayNarrow: (d: Date) => weekdayNarrowF.format(d),
    weekdayLong: (d: Date) => weekdayLongF.format(d),
    monthShort: (d: Date) => monthShortF.format(d),
    dayMonth: (d: Date) => dayMonthF.format(d),
  };
}

export function useCalFormat() {
  const { locale } = useLocale();
  return useMemo(() => makeFormat(locale), [locale]);
}
