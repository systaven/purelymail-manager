import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { calendarMessages } from '@/lib/i18n/messages/calendar';
import { cn } from '@/lib/utils';
import { addDays, addMonths, sameDay, startOfMonth, startOfWeek, useCalFormat } from './dates';

// A small month grid for picking a day. `range` highlights the visible days.
export function MiniMonth({
  value,
  onSelect,
  today,
  range,
  className,
}: {
  value: Date;
  onSelect: (day: Date) => void;
  today: Date;
  range?: { start: Date; end: Date };
  className?: string;
}) {
  const t = useT(calendarMessages);
  const fmt = useCalFormat();
  const [shown, setShown] = useState(() => startOfMonth(value));
  const valueKey = value.getFullYear() * 12 + value.getMonth();
  useEffect(() => setShown(startOfMonth(value)), [valueKey]);

  const first = startOfWeek(shown, fmt.weekStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const inRange = (d: Date) => Boolean(range && d >= range.start && d < range.end);

  return (
    <div className={cn('select-none', className)}>
      <div className="mb-1 flex items-center gap-1 pl-1.5">
        <span className="flex-1 text-sm font-semibold">{fmt.monthYear(shown)}</span>
        <button
          type="button"
          onClick={() => setShown(addMonths(shown, -1))}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t('prevMonth')}
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setShown(addMonths(shown, 1))}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t('nextMonth')}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
        {days.slice(0, 7).map((d) => (
          <div key={d.getDay()} className="py-1">
            {fmt.weekdayNarrow(d)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((d, i) => {
          const isToday = sameDay(d, today);
          const selected = sameDay(d, value);
          const outside = d.getMonth() !== shown.getMonth();
          const band = inRange(d);
          const bandStart = band && (i % 7 === 0 || !inRange(addDays(d, -1)));
          const bandEnd = band && (i % 7 === 6 || !inRange(addDays(d, 1)));
          return (
            <div key={i} className={cn('flex justify-center', band && 'bg-accent', bandStart && 'rounded-l-full', bandEnd && 'rounded-r-full')}>
              <button
                type="button"
                onClick={() => onSelect(d)}
                aria-label={fmt.dateLong(d)}
                aria-current={isToday ? 'date' : undefined}
                aria-pressed={selected}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-xs tabular-nums transition-colors',
                  outside ? 'text-muted-foreground/70' : 'text-foreground',
                  !selected && 'hover:bg-sidebar-accent',
                  isToday && !selected && 'font-semibold text-primary',
                  selected && (isToday ? 'bg-primary font-semibold text-primary-foreground' : 'bg-primary/15 font-semibold text-primary')
                )}
              >
                {d.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
