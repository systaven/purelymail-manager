import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useT } from '@/lib/i18n';
import { calendarMessages } from '@/lib/i18n/messages/calendar';
import { cn } from '@/lib/utils';
import { softStyle, type Item } from './data';
import { addDays, sameDay, startOfDay, useCalFormat } from './dates';
import { packBars, type Draft } from './TimeGrid';

// Six weeks; bars for all-day and multi-day events, chips for timed ones.
// Drag an event (mouse) onto another day to move it.

const LANE = 22;
const HEAD = 30;

export function MonthView({
  start,
  month,
  items,
  now,
  draft,
  selectedId,
  onCreate,
  onOpen,
  onMove,
  onShowDay,
}: {
  start: Date;
  month: number;
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
  const gridRef = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState(110);
  const [drag, setDrag] = useState<{ item: Item; days: number } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRowHeight(el.clientHeight / 6));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shown = useMemo(() => {
    if (!drag) return items;
    return items.map((it) => (it.id === drag.item.id ? { ...it, start: addDays(it.start, drag.days), end: addDays(it.end, drag.days) } : it));
  }, [items, drag]);

  const weeks = useMemo(
    () =>
      Array.from({ length: 6 }, (_, w) => {
        const first = addDays(start, w * 7);
        const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
        const weekItems = shown.filter((it) => it.start < addDays(first, 7) && it.end > first);
        // Bars first so they take the top lanes, then timed events by start.
        const ordered = [...weekItems.filter((it) => it.long), ...weekItems.filter((it) => !it.long)];
        const placed = packOrdered(ordered, first);
        return { first, days, placed };
      }),
    [shown, start]
  );

  const cap = Math.max(1, Math.floor((rowHeight - HEAD - 4) / LANE));

  const dayAt = (x: number, y: number) => {
    const r = gridRef.current!.getBoundingClientRect();
    const col = Math.min(6, Math.max(0, Math.floor(((x - r.left) / r.width) * 7)));
    const row = Math.min(5, Math.max(0, Math.floor(((y - r.top) / r.height) * 6)));
    return row * 7 + col;
  };

  const onItemPointerDown = (e: ReactPointerEvent, item: Item) => {
    suppressClick.current = false;
    e.stopPropagation();
    if (e.pointerType !== 'mouse' || e.button !== 0 || item.readOnly) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const d0 = dayAt(x0, y0);
    let moved = false;
    let days = 0;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true;
      days = dayAt(ev.clientX, ev.clientY) - d0;
      setDrag({ item, days });
    };
    const done = (commit: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
      if (moved) suppressClick.current = true;
      setDrag(null);
      if (commit && moved && days !== 0) onMove(item, addDays(item.start, days), addDays(item.end, days));
    };
    const up = () => done(true);
    const cancel = () => done(false);
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        done(false);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-7 border-b">
        {weeks[0].days.map((d) => (
          <div key={d.getDay()} className="border-l py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground first:border-l-0">
            {fmt.weekdayShort(d)}
          </div>
        ))}
      </div>
      <div ref={gridRef} data-month-grid className="grid min-h-0 flex-1 select-none grid-rows-6">
        {weeks.map(({ first, days, placed }) => {
          // Per day: how many lanes are in use, and which items didn't fit.
          const perDay = days.map((_, c) => placed.filter((p) => p.c0 <= c && p.c1 >= c));
          const limit = perDay.map((list) => (list.length > cap ? cap - 1 : cap));
          const visible = placed.filter((p) => {
            for (let c = p.c0; c <= p.c1; c++) if (p.lane >= limit[c]) return false;
            return true;
          });
          const draftHere = draft && draft.start >= first && draft.start < addDays(first, 7) ? Math.round((startOfDay(draft.start).getTime() - first.getTime()) / 86_400_000) : -1;
          return (
            <div key={first.getTime()} className="relative grid min-h-0 grid-cols-7 border-b last:border-b-0">
              {days.map((d, c) => {
                const outside = d.getMonth() !== month;
                const isToday = sameDay(d, now);
                const hiddenCount = perDay[c].filter((p) => !visible.includes(p)).length;
                return (
                  <div
                    key={d.getTime()}
                    className={cn('relative min-h-0 border-l first:border-l-0', outside && 'bg-muted/40')}
                    onClick={() => {
                      if (suppressClick.current) return void (suppressClick.current = false);
                      onCreate(d, addDays(d, 1), true);
                    }}
                  >
                    <div className="flex justify-center pt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowDay(d);
                        }}
                        className={cn(
                          'flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums transition-colors',
                          isToday ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                          !isToday && (outside ? 'text-muted-foreground' : 'text-foreground')
                        )}
                        aria-label={fmt.dateLong(d)}
                      >
                        {d.getDate() === 1 ? fmt.dateShort(d) : d.getDate()}
                      </button>
                    </div>
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        className="absolute inset-x-1 truncate rounded px-1.5 text-left text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                        style={{ top: HEAD + limit[c] * LANE, height: LANE - 2 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowDay(d);
                        }}
                        aria-label={t('moreLong', { n: hiddenCount })}
                      >
                        {t('more', { n: hiddenCount })}
                      </button>
                    )}
                  </div>
                );
              })}
              {draftHere >= 0 && (
                <div
                  className="pointer-events-none absolute z-10 truncate rounded bg-primary/85 px-1.5 text-xs font-medium leading-5 text-primary-foreground shadow-md"
                  style={{ top: HEAD, left: `calc(${(draftHere / 7) * 100}% + 3px)`, width: `calc(${100 / 7}% - 6px)`, height: LANE - 2 }}
                >
                  {t('noTitle')}
                </div>
              )}
              {visible.map(({ item, c0, c1, lane }) => {
                const bar = item.long;
                const selected = selectedId === item.id || drag?.item.id === item.id;
                const style = {
                  top: HEAD + lane * LANE,
                  height: LANE - 2,
                  left: `calc(${(c0 / 7) * 100}% + 3px)`,
                  width: `calc(${((c1 - c0 + 1) / 7) * 100}% - 6px)`,
                };
                const continuesLeft = item.start < days[c0];
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    data-event-id={item.id}
                    onPointerDown={(e) => onItemPointerDown(e, item)}
                    onClick={(e) => onItemClick(e, item)}
                    onKeyDown={(e) => onItemKey(e, item)}
                    title={item.ev.title || t('noTitle')}
                    className={cn(
                      'absolute flex items-center gap-1.5 overflow-hidden rounded px-1.5 text-xs outline-none transition-[background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring',
                      !item.readOnly && 'cursor-grab active:cursor-grabbing',
                      bar ? 'font-medium' : 'hover:bg-accent',
                      bar && continuesLeft && 'rounded-l-none',
                      selected && (bar ? 'shadow-md ring-1 ring-foreground/20' : 'bg-accent'),
                      drag?.item.id === item.id && 'z-10 bg-popover shadow-lg',
                      item.end < now && !selected && 'opacity-60'
                    )}
                    style={bar ? { ...style, ...softStyle(item.color) } : style}
                  >
                    {!bar && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />}
                    {!bar && <span className="hidden shrink-0 text-muted-foreground tabular-nums sm:inline">{fmt.time(item.start)}</span>}
                    <span className={cn('truncate', !bar && 'font-medium')}>{item.ev.title || t('noTitle')}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Lanes in the given order (bars first), each item on its days within the week.
function packOrdered(items: Item[], first: Date) {
  const { bars: placedBars } = packBars(items.filter((it) => it.long), first, 7);
  const lanes: boolean[][] = [];
  for (const p of placedBars) {
    lanes[p.lane] ??= Array(7).fill(false);
    for (let c = p.c0; c <= p.c1; c++) lanes[p.lane][c] = true;
  }
  const out = [...placedBars];
  const timed = items.filter((it) => !it.long).sort((a, b) => a.start.getTime() - b.start.getTime());
  for (const item of timed) {
    const c = Math.round((startOfDay(item.start).getTime() - first.getTime()) / 86_400_000);
    if (c < 0 || c > 6) continue;
    let lane = 0;
    while (lanes[lane]?.[c]) lane++;
    lanes[lane] ??= Array(7).fill(false);
    lanes[lane][c] = true;
    out.push({ item, c0: c, c1: c, lane });
  }
  return out;
}
