import { CalendarDays, MapPin, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/misc';
import { useT } from '@/lib/i18n';
import { calendarMessages } from '@/lib/i18n/messages/calendar';
import { cn } from '@/lib/utils';
import { byStart, onDay, type Item } from './data';
import { addDays, dayDiff, lastDay, sameDay, startOfDay, useCalFormat } from './dates';

// Upcoming days with their events, grouped by day.
export function AgendaView({
  start,
  days,
  items,
  now,
  loading,
  selectedId,
  onOpen,
  onShowDay,
  onNew,
}: {
  start: Date;
  days: number;
  items: Item[];
  now: Date;
  loading: boolean;
  selectedId: string | null;
  onOpen: (item: Item, el: HTMLElement) => void;
  onShowDay: (day: Date) => void;
  onNew: (() => void) | null;
}) {
  const t = useT(calendarMessages);
  const fmt = useCalFormat();

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const groups = Array.from({ length: days }, (_, i) => addDays(start, i))
    .map((day) => ({ day, items: onDay(items, day).sort(byStart) }))
    .filter((g) => g.items.length > 0 || sameDay(g.day, now));

  if (!groups.some((g) => g.items.length)) {
    return (
      <div className="mx-auto w-full max-w-lg p-6 pt-16">
        <EmptyState
          icon={CalendarDays}
          title={t('agendaEmpty')}
          description={t('agendaEmptyBody', { from: fmt.dateShort(start), to: fmt.dateShort(addDays(start, days - 1)) })}
          action={
            onNew && (
              <Button variant="outline" onClick={onNew}>
                {t('newEvent')}
              </Button>
            )
          }
        />
      </div>
    );
  }

  const timeText = (it: Item, day: Date) => {
    if (it.allDay) {
      const total = dayDiff(it.start, lastDay(it.start, it.end)) + 1;
      return total > 1 ? t('dayOf', { n: dayDiff(it.start, day) + 1, total }) : t('allDay');
    }
    const startsToday = sameDay(it.start, day);
    const endsToday = it.end <= addDays(startOfDay(day), 1);
    if (startsToday && endsToday) return fmt.timeRange(it.start, it.end);
    if (startsToday) return t('from', { time: fmt.time(it.start) });
    if (endsToday) return t('until', { time: fmt.time(it.end) });
    return t('allDay');
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-2 py-3 sm:px-6 sm:py-5">
        {groups.map(({ day, items: list }) => {
          const isToday = sameDay(day, now);
          return (
            <section key={day.getTime()} className="flex gap-3 border-b py-3 last:border-b-0 sm:gap-5">
              <button
                type="button"
                onClick={() => onShowDay(day)}
                className="flex w-14 shrink-0 flex-col items-center self-start rounded-xl py-1 transition-colors hover:bg-accent sm:w-16"
                aria-label={fmt.dateLong(day)}
              >
                <span className={cn('text-[11px] font-medium uppercase', isToday ? 'text-primary' : 'text-muted-foreground')}>{fmt.weekdayShort(day)}</span>
                <span className={cn('mt-0.5 flex size-9 items-center justify-center rounded-full text-xl font-medium tabular-nums', isToday && 'bg-primary text-primary-foreground')}>
                  {day.getDate()}
                </span>
                <span className="text-[11px] text-muted-foreground">{fmt.monthShort(day)}</span>
              </button>
              <div className="min-w-0 flex-1 space-y-0.5 pt-1">
                {list.length === 0 && <p className="px-2 py-2 text-sm text-muted-foreground">{t('noEvents')}</p>}
                {list.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={(e) => onOpen(it, e.currentTarget)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent',
                      selectedId === it.id && 'bg-accent',
                      it.end < now && 'opacity-60'
                    )}
                  >
                    <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: it.color }} />
                    <span className="hidden w-36 shrink-0 pt-px text-sm tabular-nums text-muted-foreground sm:block">{timeText(it, day)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{it.ev.title || t('noTitle')}</span>
                        {it.ev.recurring && <Repeat className="size-3 shrink-0 text-muted-foreground" />}
                      </span>
                      <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground sm:hidden">{timeText(it, day)}</span>
                      {it.ev.location && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="size-3 shrink-0" />
                          <span className="truncate">{it.ev.location}</span>
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
