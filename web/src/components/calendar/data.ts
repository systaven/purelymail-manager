import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { davApi, davKeys, localTimeZone, type Calendar, type CalendarEvent, type EventInput } from '@/lib/dav-api';
import { addDays, DAY_MS, fromYmd, lastDay, startOfDay, toYmd } from './dates';

// Calendar data: queries, hidden calendars, and events turned into local dates.

export const PALETTE = ['#4f46e5', '#2563eb', '#0891b2', '#0d9488', '#16a34a', '#65a30d', '#ca8a04', '#ea580c', '#dc2626', '#db2777', '#9333ea', '#64748b'];

export const colorOf = (cal: Calendar | undefined) => cal?.color ?? 'var(--primary)';

// A tinted chip that stays readable on light and dark backgrounds.
export const softStyle = (color: string): CSSProperties => ({
  backgroundColor: `color-mix(in oklab, ${color} var(--cal-tint, 17%), var(--background))`,
  color: `color-mix(in oklab, ${color} var(--cal-ink, 62%), var(--foreground))`,
  borderColor: color,
});

export interface Item {
  id: string;
  ev: CalendarEvent;
  start: Date;
  end: Date;
  allDay: boolean;
  // Shown in the all-day row / as a bar: all-day or 24 hours or longer.
  long: boolean;
  color: string;
  calendar: Calendar | undefined;
  readOnly: boolean;
}

export function toItem(ev: CalendarEvent, cal: Calendar | undefined): Item {
  const start = ev.allDay ? (fromYmd(ev.start) ?? new Date(ev.start)) : new Date(ev.start);
  let end = ev.allDay ? (fromYmd(ev.end) ?? new Date(ev.end)) : new Date(ev.end);
  if (!(end > start)) end = ev.allDay ? addDays(start, 1) : new Date(start.getTime() + 15 * 60_000);
  return {
    id: ev.id,
    ev,
    start,
    end,
    allDay: ev.allDay,
    long: ev.allDay || end.getTime() - start.getTime() >= DAY_MS,
    color: colorOf(cal),
    calendar: cal,
    readOnly: cal?.readOnly ?? false,
  };
}

// Items touching a day.
export const onDay = (items: Item[], day: Date) => {
  const s = startOfDay(day);
  const e = addDays(s, 1);
  return items.filter((it) => it.start < e && (it.end > s || (it.end.getTime() === it.start.getTime() && it.start >= s)));
};

export const byStart = (a: Item, b: Item) =>
  Number(b.long) - Number(a.long) || a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime() || a.ev.title.localeCompare(b.ev.title);

export const spanDays = (it: Item) => Math.round((lastDay(it.start, it.end).getTime() - startOfDay(it.start).getTime()) / DAY_MS) + 1;

// API start/end strings for an item placed at new local times.
export const timesFor = (allDay: boolean, start: Date, end: Date) =>
  allDay ? { start: toYmd(start), end: toYmd(end) } : { start: start.toISOString(), end: end.toISOString() };

export const inputOf = (ev: CalendarEvent, patch: Partial<EventInput> = {}): EventInput => ({
  title: ev.title,
  location: ev.location,
  description: ev.description,
  allDay: ev.allDay,
  start: ev.start,
  end: ev.end,
  timeZone: localTimeZone(),
  repeat: undefined,
  ...patch,
});

export function useCalendars(mailbox: string) {
  return useQuery({ queryKey: davKeys.calendars(mailbox), queryFn: () => davApi.calendars(mailbox), staleTime: 5 * 60_000 });
}

const rangeKey = (start: Date, end: Date) => [start.toISOString(), end.toISOString()] as const;

export function useEvents(mailbox: string, start: Date, end: Date, neighbours: [Date, Date][]) {
  const qc = useQueryClient();
  const [from, to] = rangeKey(start, end);
  const query = useQuery({
    queryKey: davKeys.events(mailbox, from, to),
    queryFn: () => davApi.events(mailbox, from, to),
    placeholderData: keepPreviousData,
  });
  // Load the periods either side so stepping through is instant.
  const ready = query.isSuccess && !query.isPlaceholderData;
  const neighbourKey = neighbours.map(([a, b]) => rangeKey(a, b).join('/')).join('|');
  useEffect(() => {
    if (!ready) return;
    for (const [a, b] of neighbours) {
      const [f, t] = rangeKey(a, b);
      qc.prefetchQuery({ queryKey: davKeys.events(mailbox, f, t), queryFn: () => davApi.events(mailbox, f, t) });
    }
  }, [ready, neighbourKey, mailbox, qc]);
  return query;
}

const hiddenKey = (mailbox: string) => `calendar-hidden:${mailbox}`;

export function useHiddenCalendars(mailbox: string) {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(hiddenKey(mailbox)) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const save = useCallback(
    (next: Set<string>) => {
      setHidden(next);
      try {
        localStorage.setItem(hiddenKey(mailbox), JSON.stringify([...next]));
      } catch {
        // Not remembered.
      }
    },
    [mailbox]
  );
  const toggle = useCallback(
    (href: string) => {
      const next = new Set(hidden);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      save(next);
    },
    [hidden, save]
  );
  const only = useCallback((href: string, all: string[]) => save(new Set(all.filter((h) => h !== href))), [save]);
  return useMemo(() => ({ hidden, toggle, only }), [hidden, toggle, only]);
}
