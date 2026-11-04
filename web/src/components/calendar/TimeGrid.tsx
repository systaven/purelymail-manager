import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Repeat } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { calendarMessages } from '@/lib/i18n/messages/calendar';
import { cn } from '@/lib/utils';
import { softStyle, type Item } from './data';
import { addDays, addMinutes, atMinutes, dayDiff, lastDay, minutesIntoDay, sameDay, snap, startOfDay, useCalFormat } from './dates';

// Week and day views: an all-day row over a 24-hour grid. Mouse: drag on empty
// space to create, drag an event to move it, drag its bottom edge to resize.
// Touch: tap to create or open.

export const HOUR = 48;
const STEP = 15;
const LANE = 24;
const GUTTER = 'w-14 sm:w-16';

export interface Draft {
  start: Date;
  end: Date;
  allDay: boolean;
}

type Drag =
  | { kind: 'create'; day: number; start: Date; end: Date }
  | { kind: 'move' | 'resize'; item: Item; start: Date; end: Date };

interface Seg {
  item: Item;
  top: number; // minutes from the day's start
  bottom: number;
  col: number;
  cols: number;
  span: number;
}

// Side-by-side columns for overlapping events (each cluster of overlaps gets
// its own column count; an event widens into free columns to its right).
function packDay(items: Item[], day: Date): Seg[] {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const segs: Seg[] = items
    .filter((it) => it.start < dayEnd && it.end > dayStart)
    .map((it) => ({
      item: it,
      top: it.start <= dayStart ? 0 : minutesIntoDay(it.start),
      bottom: it.end >= dayEnd ? 1440 : Math.max(minutesIntoDay(it.end), 0),
      col: 0,
      cols: 1,
      span: 1,
    }))
    .map((s) => ({ ...s, bottom: Math.max(s.bottom, s.top + 20) }))
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  let cluster: Seg[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;
  const finish = () => {
    for (const s of cluster) {
      s.cols = colEnds.length;
      let span = 1;
      while (s.col + span < s.cols && !cluster.some((o) => o.col === s.col + span && o.top < s.bottom && o.bottom > s.top)) span++;
      s.span = span;
    }
    cluster = [];
    colEnds = [];
  };
  for (const s of segs) {
    if (s.top >= clusterEnd) finish();
    let col = colEnds.findIndex((end) => end <= s.top);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(s.bottom);
    } else colEnds[col] = s.bottom;
    s.col = col;
    cluster.push(s);
    clusterEnd = Math.max(clusterEnd, s.bottom);
  }
  finish();
  return segs;
}

const widthOf = (s: Seg) => {
  const base = s.span / s.cols;
  return s.col + s.span < s.cols ? Math.min(1 - s.col / s.cols, base * 1.7) : base;
};

// Lanes for all-day / multi-day bars across the visible days.
export function packBars(items: Item[], first: Date, days: number) {
  const out: { item: Item; c0: number; c1: number; lane: number }[] = [];
  const lanes: boolean[][] = [];
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  for (const item of sorted) {
    const c0 = Math.max(0, dayDiff(first, item.start));
    const c1 = Math.min(days - 1, dayDiff(first, lastDay(item.start, item.end)));
    if (c1 < 0 || c0 > days - 1) continue;
    let lane = 0;
    while (lanes[lane]?.slice(c0, c1 + 1).some(Boolean)) lane++;
    lanes[lane] ??= Array(days).fill(false);
    for (let c = c0; c <= c1; c++) lanes[lane][c] = true;
    out.push({ item, c0, c1, lane });
  }
  return { bars: out, lanes: lanes.length };
}

export function TimeGrid({
  days,
  items,
  now,
  draft,
  selectedId,
  onCreate,
  onOpen,
  onMove,
  onShowDay,
}: {
  days: Date[];
  items: Item[];
  now: Date;
  draft: Draft | null;
  selectedId: string | null;
  onCreate: (start: Date, end: Date, allDay: boolean) => void;
  onOpen: (item: Item, el: HTMLElement) => void;
  onMove: (item: Item, start: Date, end: Date) => void;
  onShowDay: (day: Date) => void;
}) {
  const t = useT(calendarMessages);
  const fmt = useCalFormat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const suppressClick = useRef(false);
  const lastPointer = useRef<string>('mouse');
  const n = days.length;
  const first = days[0];
  const tzLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(fmt.tag, { timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '';
    } catch {
      return '';
    }
  }, [fmt.tag]);

  // Items with the in-progress drag applied.
  const shown = useMemo(() => {
    if (!drag || drag.kind === 'create') return items;
    return items.map((it) => (it.id === drag.item.id ? { ...it, start: drag.start, end: drag.end } : it));
  }, [items, drag]);

  const { bars, lanes } = useMemo(() => packBars(shown.filter((it) => it.long), first, n), [shown, first, n]);
  const timed = useMemo(() => shown.filter((it) => !it.long), [shown]);
  const segsByDay = useMemo(() => days.map((d) => packDay(timed, d)), [timed, days]);

  // Scroll to a sensible hour when the visible days change.
  const firstKey = first.getTime();
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const showsToday = days.some((d) => sameDay(d, new Date()));
    const minutes = showsToday ? Math.max(0, minutesIntoDay(new Date()) - 120) : 8 * 60 - 30;
    el.scrollTop = (minutes / 60) * HOUR;
  }, [firstKey, n]);

  const slotAt = (x: number, y: number) => {
    const r = colsRef.current!.getBoundingClientRect();
    const day = Math.min(n - 1, Math.max(0, Math.floor(((x - r.left) / r.width) * n)));
    const min = Math.min(1440, Math.max(0, ((y - r.top) / HOUR) * 60));
    return { day, min };
  };

  const autoScroll = (y: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (y < r.top + 90) el.scrollTop -= 12;
    else if (y > r.bottom - 30) el.scrollTop += 12;
  };

  // Follows the pointer until it's released; `move` returns the new drag state.
  const track = (e: ReactPointerEvent, onMoveTo: (x: number, y: number) => Drag | null, onDone: (d: Drag | null, moved: boolean) => void) => {
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    let current: Drag | null = null;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true;
      autoScroll(ev.clientY);
      current = onMoveTo(ev.clientX, ev.clientY);
      setDrag(current);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
      if (moved) suppressClick.current = true;
      setDrag(null);
      onDone(current, moved);
    };
    const cancel = () => {
      moved = false;
      current = null;
      up();
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        cancel();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
  };

  // --- Creating ------------------------------------------------------------------

  const onGridPointerDown = (e: ReactPointerEvent) => {
    lastPointer.current = e.pointerType;
    suppressClick.current = false;
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    e.preventDefault();
    const s0 = slotAt(e.clientX, e.clientY);
    const anchor = Math.floor(s0.min / STEP) * STEP;
    const day = days[s0.day];
    track(
      e,
      (x, y) => {
        const m = Math.min(1440, Math.max(0, snap(slotAt(x, y).min, STEP)));
        const a = Math.min(anchor, m);
        const b = Math.max(anchor + STEP, m);
        return { kind: 'create', day: s0.day, start: atMinutes(day, a), end: atMinutes(day, b) };
      },
      (d, moved) => {
        if (moved && d?.kind === 'create') onCreate(d.start, d.end, false);
        else if (!moved) {
          const start = Math.min(1380, Math.floor(s0.min / 30) * 30);
          onCreate(atMinutes(day, start), atMinutes(day, start + 60), false);
        }
      }
    );
  };

  const onGridClick = (e: ReactMouseEvent) => {
    // Taps (touch, pen) create here; mouse is handled by the pointer events.
    if (lastPointer.current === 'mouse' || suppressClick.current) return;
    const s = slotAt(e.clientX, e.clientY);
    const start = Math.min(1380, Math.floor(s.min / 30) * 30);
    onCreate(atMinutes(days[s.day], start), atMinutes(days[s.day], start + 60), false);
  };

  // --- Moving and resizing -------------------------------------------------------------

  const onItemPointerDown = (e: ReactPointerEvent, item: Item, mode: 'move' | 'resize' | 'bar') => {
    lastPointer.current = e.pointerType;
    suppressClick.current = false;
    e.stopPropagation();
    if (e.pointerType !== 'mouse' || e.button !== 0 || item.readOnly) return;
    if (mode === 'resize') e.preventDefault();
    const s0 = slotAt(e.clientX, e.clientY);
    track(
      e,
      (x, y) => {
        const s = slotAt(x, y);
        const dd = s.day - s0.day;
        if (mode === 'bar') return { kind: 'move', item, start: addDays(item.start, dd), end: addDays(item.end, dd) };
        const dm = snap(s.min - s0.min, STEP);
        if (mode === 'resize') {
          let end = addMinutes(addDays(item.end, dd), dm);
          if (end.getTime() - item.start.getTime() < STEP * 60_000) end = addMinutes(item.start, STEP);
          return { kind: 'resize', item, start: item.start, end };
        }
        // Keep the event within the day it lands on.
        let start = addMinutes(addDays(item.start, dd), dm);
        const length = item.end.getTime() - item.start.getTime();
        const target = startOfDay(addDays(item.start, dd));
        if (start < target && dm < 0) start = target;
        const latest = addMinutes(addDays(target, 1), -Math.min(length / 60_000, 1440));
        if (start > latest) start = latest;
        return { kind: 'move', item, start, end: new Date(start.getTime() + length) };
      },
      (d) => {
        if (d && d.kind !== 'create' && (d.start.getTime() !== item.start.getTime() || d.end.getTime() !== item.end.getTime())) onMove(item, d.start, d.end);
      }
    );
  };

  const onItemClick = (e: ReactMouseEvent<HTMLElement>, item: Item) => {
    e.stopPropagation();
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onOpen(item, e.currentTarget);
  };

  const onItemKey = (e: ReactKeyboardEvent<HTMLElement>, item: Item) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onOpen(item, e.currentTarget);
    }
  };

  // --- Rendering ------------------------------------------------------------------

  const cols: CSSProperties = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  const allDayHeight = Math.max(1, lanes) * LANE + 8;
  const draftBars = draft?.allDay ? packBars([{ id: 'draft', start: draft.start, end: draft.end } as Item], first, n).bars : [];
  const nowMin = minutesIntoDay(now);
  const dragging = drag && drag.kind !== 'create' ? drag.item.id : null;

  return (
    <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
      {/* Day headers and the all-day row stay on top while the hours scroll. */}
      <div className="sticky top-0 z-30 border-b bg-background">
        <div className="flex">
          <div className={cn(GUTTER, 'flex shrink-0 items-end justify-end pb-1.5 pr-2 text-[10px] text-muted-foreground')}>{tzLabel}</div>
          <div className="grid flex-1" style={cols}>
            {days.map((d) => {
              const isToday = sameDay(d, now);
              const past = d < startOfDay(now);
              return (
                <button
                  key={d.getTime()}
                  type="button"
                  onClick={() => onShowDay(d)}
                  disabled={n === 1}
                  className={cn('flex flex-col items-center gap-0.5 pb-1.5 pt-2 transition-colors enabled:hover:bg-accent/60', n === 1 && 'items-start pl-3')}
                  aria-label={fmt.dateLong(d)}
                >
                  <span className={cn('text-[11px] font-medium uppercase tracking-wide', isToday ? 'text-primary' : 'text-muted-foreground')}>{fmt.weekdayShort(d)}</span>
                  <span
                    className={cn(
                      'flex size-8 items-center justify-center rounded-full text-lg font-medium tabular-nums sm:size-9 sm:text-xl',
                      isToday ? 'bg-primary text-primary-foreground' : past ? 'text-muted-foreground' : 'text-foreground'
                    )}
                  >
                    {d.getDate()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex border-t">
          <div className={cn(GUTTER, 'flex shrink-0 items-start justify-end pr-2 pt-1.5 text-[10px] text-muted-foreground')}>{t('allDay')}</div>
          <div className="relative grid flex-1 overflow-y-auto" style={{ ...cols, height: Math.min(allDayHeight, LANE * 4 + 8) }}>
            {days.map((d) => (
              <div
                key={d.getTime()}
                className="border-l"
                style={{ height: allDayHeight }}
                onClick={() => {
                  if (!suppressClick.current) onCreate(d, addDays(d, 1), true);
                }}
              />
            ))}
            {draftBars.map(({ c0, c1 }) => (
              <div
                key="draft"
                className="pointer-events-none absolute h-[22px] rounded-md bg-primary/85 px-2 text-xs font-medium leading-[22px] text-primary-foreground shadow-md"
                style={{ left: `calc(${(c0 / n) * 100}% + 2px)`, width: `calc(${((c1 - c0 + 1) / n) * 100}% - 4px)`, top: 4 }}
              >
                {t('noTitle')}
              </div>
            ))}
            {bars.map(({ item, c0, c1, lane }) => {
              const continuesLeft = item.start < days[c0];
              const continuesRight = lastDay(item.start, item.end) > days[c1];
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  data-event-id={item.id}
                  onPointerDown={(e) => onItemPointerDown(e, item, 'bar')}
                  onClick={(e) => onItemClick(e, item)}
                  onKeyDown={(e) => onItemKey(e, item)}
                  className={cn(
                    'absolute flex h-[22px] items-center gap-1 overflow-hidden rounded-md border-l-[3px] px-1.5 text-xs font-medium outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring',
                    !item.readOnly && 'cursor-grab active:cursor-grabbing',
                    continuesLeft && 'rounded-l-none border-l-0 pl-2',
                    continuesRight && 'rounded-r-none',
                    (selectedId === item.id || dragging === item.id) && 'shadow-md ring-1 ring-foreground/20',
                    dragging === item.id && 'z-10 opacity-90'
                  )}
                  style={{ ...softStyle(item.color), left: `calc(${(c0 / n) * 100}% + 2px)`, width: `calc(${((c1 - c0 + 1) / n) * 100}% - 4px)`, top: lane * LANE + 4 }}
                  title={item.ev.title || t('noTitle')}
                >
                  {!item.allDay && !continuesLeft && <span className="shrink-0 opacity-80">{fmt.time(item.start)}</span>}
                  <span className="truncate">{item.ev.title || t('noTitle')}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="relative flex" style={{ height: 24 * HOUR }}>
        <div className={cn(GUTTER, 'relative shrink-0 select-none')}>
          {Array.from({ length: 23 }, (_, i) => (
            <span key={i} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground" style={{ top: (i + 1) * HOUR }}>
              {fmt.hour(i + 1)}
            </span>
          ))}
        </div>
        <div
          ref={colsRef}
          data-time-grid
          className="relative grid flex-1 touch-pan-y select-none"
          style={{
            ...cols,
            backgroundImage: `linear-gradient(to bottom, var(--border) 1px, transparent 1px)`,
            backgroundSize: `100% ${HOUR}px`,
          }}
          onPointerDown={onGridPointerDown}
          onClick={onGridClick}
        >
          {days.map((d, di) => {
            const isToday = sameDay(d, now);
            const createHere = drag?.kind === 'create' && drag.day === di ? drag : null;
            const draftHere = draft && !draft.allDay && sameDay(draft.start, d) ? draft : null;
            const ghost = createHere ?? draftHere;
            return (
              <div key={d.getTime()} className={cn('relative border-l', isToday && 'bg-primary/[0.025]')}>
                {segsByDay[di].map((s) => {
                  const { item } = s;
                  const height = ((s.bottom - s.top) / 60) * HOUR;
                  const short = height < 38;
                  const past = item.end < now;
                  const selected = selectedId === item.id || dragging === item.id;
                  const endsToday = item.end <= addDays(startOfDay(d), 1);
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      data-event-id={item.id}
                      onPointerDown={(e) => onItemPointerDown(e, item, 'move')}
                      onClick={(e) => onItemClick(e, item)}
                      onKeyDown={(e) => onItemKey(e, item)}
                      className={cn(
                        'group/ev @container absolute overflow-hidden rounded-md border-l-[3px] px-1.5 text-xs leading-snug shadow-[0_0_0_1px_var(--background)] outline-none transition-[box-shadow,opacity] focus-visible:ring-2 focus-visible:ring-ring',
                        short ? 'flex items-center gap-1 py-0' : 'py-1',
                        !item.readOnly && 'cursor-grab active:cursor-grabbing',
                        past && !selected && 'opacity-60',
                        selected && 'shadow-lg ring-1 ring-foreground/15'
                      )}
                      style={{
                        ...softStyle(item.color),
                        top: (s.top / 60) * HOUR + 1,
                        height: height - 2,
                        left: `calc(${(s.col / s.cols) * 100}% + 1px)`,
                        // Overlapping events cascade: each reaches into the next column.
                        width: `calc(${widthOf(s) * 100}% - ${s.col + s.span < s.cols ? 2 : 6}px)`,
                        zIndex: selected ? 19 : s.col + 1,
                      }}
                      title={item.ev.title || t('noTitle')}
                    >
                      {short ? (
                        <>
                          <span className="min-w-0 truncate font-medium">{item.ev.title || t('noTitle')}</span>
                          <span className="hidden shrink-0 opacity-75 @[7.5rem]:inline">{fmt.time(item.start)}</span>
                        </>
                      ) : (
                        <>
                          <div className="flex items-start gap-1">
                            <span className={cn('min-w-0 flex-1 font-medium', height < 60 ? 'truncate' : 'line-clamp-2 break-words')}>{item.ev.title || t('noTitle')}</span>
                            {item.ev.recurring && height >= 60 && <Repeat className="mt-0.5 size-3 shrink-0 opacity-60" />}
                          </div>
                          <div className="truncate opacity-75">{fmt.timeRange(item.start, item.end)}</div>
                          {item.ev.location && height >= 76 && <div className="truncate opacity-75">{item.ev.location}</div>}
                        </>
                      )}
                      {!item.readOnly && endsToday && (
                        <div
                          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize pointer-coarse:hidden"
                          onPointerDown={(e) => onItemPointerDown(e, item, 'resize')}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="mx-auto mt-0.5 h-1 w-6 rounded-full bg-current opacity-0 transition-opacity group-hover/ev:opacity-40" />
                        </div>
                      )}
                    </div>
                  );
                })}
                {ghost && (
                  <div
                    className="pointer-events-none absolute inset-x-1 z-20 rounded-md bg-primary/85 px-1.5 py-1 text-xs font-medium leading-snug text-primary-foreground shadow-lg"
                    style={{
                      top: (minutesIntoDay(ghost.start) / 60) * HOUR + 1,
                      height: Math.max(((ghost.end.getTime() - ghost.start.getTime()) / 3_600_000) * HOUR - 2, 18),
                    }}
                  >
                    <div className="truncate">{t('noTitle')}</div>
                    <div className="truncate opacity-85">{fmt.timeRange(ghost.start, ghost.end)}</div>
                  </div>
                )}
                {isToday && (
                  <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: (nowMin / 60) * HOUR }}>
                    <span className="-ml-1.5 size-3 rounded-full bg-destructive" />
                    <span className="h-0.5 flex-1 bg-destructive" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
