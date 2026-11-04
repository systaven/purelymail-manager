import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlignLeft, CalendarDays, Clock, MapPin, Repeat as RepeatIcon, X } from 'lucide-react';
import { Dialog as DialogPrimitive, Popover } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/lib/i18n';
import { calendarMessages } from '@/lib/i18n/messages/calendar';
import { localTimeZone, type Calendar, type EventInput, type Repeat } from '@/lib/dav-api';
import { cn } from '@/lib/utils';
import { colorOf, type Item } from './data';
import { addDays, atMinutes, minutesIntoDay, startOfDay, toYmd, useCalFormat } from './dates';
import { MiniMonth } from './MiniMonth';

export type EditorTarget = { mode: 'create'; start: Date; end: Date; allDay: boolean; calendar?: string } | { mode: 'edit'; item: Item };

export interface EditorResult {
  input: EventInput;
  calendar: string;
  repeatChanged: boolean;
  calendarChanged: boolean;
}

type RepeatChoice = 'none' | 'custom' | Repeat;

// "9", "930", "9:30", "9.30pm", "21:30", "下午3:30", "午後3時" → minutes.
export function parseTime(text: string): number | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  const pm = /p|下午|午後|晚上|晚/.test(s);
  const am = /a|上午|午前|早上|凌晨/.test(s);
  let m = /^\D*(\d{1,2})(\d{2})\D*$/.exec(s);
  if (!m) m = /(\d{1,2})(?:[:：.時时点點](\d{1,2}))?/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

const today0 = startOfDay(new Date());

function TimeField({ value, onChange, from, label }: { value: number; onChange: (m: number) => void; from?: number; label: string }) {
  const t = useT(calendarMessages);
  const fmt = useCalFormat();
  const show = (m: number) => fmt.timeFull(atMinutes(today0, m % 1440));
  const [text, setText] = useState(show(value));
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setText(show(value)), [value, fmt]);

  const options = useMemo(() => {
    const base = from ?? 0;
    const list: number[] = [];
    for (let m = from === undefined ? 0 : base + 15; m < (from === undefined ? 1440 : base + 1440); m += 15) list.push(m);
    return list;
  }, [from]);

  const commit = () => {
    const m = parseTime(text);
    if (m === null) return setText(show(value));
    // For the end time, a time before the start means the next day.
    onChange(from !== undefined && m <= from ? m + 1440 : m);
  };

  const duration = (m: number) => {
    const d = m - (from ?? 0);
    return d < 60 ? t('durMin', { n: d }) : t('durHour', { n: Math.round((d / 60) * 100) / 100 });
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <Input
          ref={inputRef}
          value={text}
          aria-label={label}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => {
            e.target.select();
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onBlur={() => {
            commit();
            setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
              setOpen(false);
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const step = e.key === 'ArrowDown' ? 15 : -15;
              const lo = from !== undefined ? from + 15 : 0;
              const hi = from !== undefined ? from + 1440 : 1425;
              onChange(Math.max(lo, Math.min(hi, Math.round(value / 15) * 15 + step)));
            }
          }}
          className="w-24 shrink-0 px-2 text-center tabular-nums sm:w-[6.5rem]"
        />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (inputRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          className="z-[60] max-h-60 w-48 animate-in overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {options.map((m) => (
            <button
              key={m}
              type="button"
              tabIndex={-1}
              ref={(el) => {
                if (el && m === value) el.scrollIntoView({ block: 'center' });
              }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(m);
                setOpen(false);
              }}
              className={cn('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm tabular-nums hover:bg-accent', m === value && 'bg-accent font-medium')}
            >
              <span>{show(m)}</span>
              {from !== undefined && <span className="text-xs text-muted-foreground">{duration(m)}</span>}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function DateField({ value, onChange, label, className }: { value: Date; onChange: (d: Date) => void; label: string; className?: string }) {
  const fmt = useCalFormat();
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            'flex h-9 min-w-0 items-center rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-colors hover:bg-accent data-[state=open]:border-primary',
            className
          )}
        >
          <span className="truncate">{fmt.dateMedium(value)}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-[60] w-64 animate-in rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg">
          <MiniMonth
            value={value}
            today={new Date()}
            onSelect={(d) => {
              onChange(d);
              setOpen(false);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const selectClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-sm shadow-xs transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:ring-3 disabled:opacity-50';

function FieldRow({ icon: Icon, children, className }: { icon: typeof Clock; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-3', className)}>
      <Icon className="mt-2.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function EventEditor({
  target,
  calendars,
  defaultCalendar,
  onClose,
  onSave,
}: {
  target: EditorTarget | null;
  calendars: Calendar[]; // writable ones
  defaultCalendar: string | undefined;
  onClose: () => void;
  onSave: (result: EditorResult) => Promise<boolean>;
}) {
  const t = useT(calendarMessages);
  const fmt = useCalFormat();

  const initial = useMemo(() => {
    if (!target) return null;
    if (target.mode === 'create') {
      return {
        title: '',
        allDay: target.allDay,
        start: target.start,
        end: target.allDay ? addDays(target.end, -1) : target.end,
        calendar: target.calendar ?? defaultCalendar ?? calendars[0]?.href ?? '',
        repeat: 'none' as RepeatChoice,
        location: '',
        description: '',
      };
    }
    const { item } = target;
    const ev = item.ev;
    return {
      title: ev.title,
      allDay: ev.allDay,
      start: item.start,
      end: ev.allDay ? addDays(item.end, -1) : item.end,
      calendar: ev.calendar,
      repeat: (ev.recurring ? (ev.repeat ?? 'custom') : 'none') as RepeatChoice,
      location: ev.location,
      description: ev.description,
    };
  }, [target]);

  const [title, setTitle] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [startDay, setStartDay] = useState(today0);
  const [startMin, setStartMin] = useState(540);
  const [endDay, setEndDay] = useState(today0);
  const [endMin, setEndMin] = useState(600);
  const [calendar, setCalendar] = useState('');
  const [repeat, setRepeat] = useState<RepeatChoice>('none');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!initial) return;
    setTitle(initial.title);
    setAllDay(initial.allDay);
    setStartDay(startOfDay(initial.start));
    setEndDay(startOfDay(initial.end));
    if (initial.allDay) {
      setStartMin(9 * 60);
      setEndMin(10 * 60);
    } else {
      setStartMin(minutesIntoDay(initial.start));
      // An end at midnight shows as 24:00 of the day before.
      const endsAtMidnight = minutesIntoDay(initial.end) === 0 && initial.end > initial.start;
      if (endsAtMidnight) setEndDay(addDays(startOfDay(initial.end), -1));
      setEndMin(endsAtMidnight ? 1440 : minutesIntoDay(initial.end));
    }
    setCalendar(initial.calendar);
    setRepeat(initial.repeat);
    setLocation(initial.location);
    setDescription(initial.description);
    setBusy(false);
  }, [initial]);

  const startAt = atMinutes(startDay, startMin);
  const endAt = atMinutes(endDay, endMin);
  const invalid = allDay ? endDay < startDay : endAt <= startAt;
  const sameDayTimes = !allDay && endDay.getTime() === startDay.getTime();

  // Moving the start keeps the length.
  const moveStart = (day: Date, minutes: number) => {
    const length = allDay ? endDay.getTime() - startDay.getTime() : endAt.getTime() - startAt.getTime();
    setStartDay(day);
    setStartMin(minutes);
    if (allDay) {
      setEndDay(addDays(day, Math.round(Math.max(0, length) / 86_400_000)));
    } else {
      const end = new Date(atMinutes(day, minutes).getTime() + Math.max(15 * 60_000, length));
      const endsAtMidnight = minutesIntoDay(end) === 0;
      setEndDay(endsAtMidnight ? addDays(startOfDay(end), -1) : startOfDay(end));
      setEndMin(endsAtMidnight ? 1440 : minutesIntoDay(end));
    }
  };

  const setEndTime = (m: number) => {
    // From the end field: minutes since the start day when the dates match.
    if (sameDayTimes && m > 1440) {
      setEndDay(addDays(startDay, Math.floor((m - 1) / 1440)));
      setEndMin(((m - 1) % 1440) + 1);
    } else setEndMin(m);
  };

  const editing = target?.mode === 'edit' ? target.item : null;
  const isCustom = Boolean(editing?.ev.recurring && !editing.ev.repeat);
  const weekday = fmt.weekdayLong(startDay);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!initial || invalid || busy || !calendar) return;
    const input: EventInput = {
      title: title.trim(),
      location: location.trim(),
      description,
      allDay,
      start: allDay ? toYmd(startDay) : startAt.toISOString(),
      end: allDay ? toYmd(addDays(endDay, 1)) : endAt.toISOString(),
      timeZone: localTimeZone(),
      repeat: repeat === 'custom' ? undefined : repeat === 'none' ? null : repeat,
    };
    setBusy(true);
    const ok = await onSave({ input, calendar, repeatChanged: repeat !== initial.repeat, calendarChanged: calendar !== initial.calendar });
    setBusy(false);
    if (ok) onClose();
  };

  const currentCal = calendars.find((c) => c.href === calendar);

  return (
    <DialogPrimitive.Root open={Boolean(target)} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          className={cn(
            'fixed z-50 flex flex-col bg-popover text-popover-foreground shadow-2xl outline-none',
            'inset-0 h-dvh w-full',
            'sm:inset-auto sm:left-1/2 sm:top-[8vh] sm:h-auto sm:max-h-[84vh] sm:w-[calc(100vw-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:animate-in sm:rounded-xl sm:border'
          )}
        >
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b px-4 py-2.5 sm:px-5">
              <DialogPrimitive.Title className="flex-1 truncate text-base font-semibold">{editing ? t('editEvent') : t('newEvent')}</DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={t('close')}>
                  <X />
                </Button>
              </DialogPrimitive.Close>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="flex gap-3">
                <span className="mt-3 size-4 shrink-0 rounded" style={{ backgroundColor: colorOf(currentCal) }} />
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('addTitle')}
                  aria-label={t('title')}
                  maxLength={500}
                  className="h-10 min-w-0 flex-1 border-b border-input bg-transparent text-xl font-medium outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-0"
                />
              </div>

              <FieldRow icon={Clock}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-sm text-muted-foreground sm:w-12">{t('starts')}</span>
                    <DateField value={startDay} onChange={(d) => moveStart(d, startMin)} label={t('starts')} className="flex-1 sm:flex-none" />
                    {!allDay && <TimeField value={startMin} onChange={(m) => moveStart(startDay, Math.min(m, 1425))} label={t('starts')} />}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-sm text-muted-foreground sm:w-12">{t('ends')}</span>
                    <DateField value={endDay} onChange={setEndDay} label={t('ends')} className="flex-1 sm:flex-none" />
                    {!allDay && <TimeField value={endMin} from={sameDayTimes ? startMin : undefined} onChange={setEndTime} label={t('ends')} />}
                  </div>
                  <label className="flex w-fit cursor-pointer items-center gap-2 pt-1 text-sm">
                    <Switch checked={allDay} onCheckedChange={setAllDay} />
                    {t('allDay')}
                  </label>
                  {invalid && <p className="text-sm text-destructive">{t('endBeforeStart')}</p>}
                </div>
              </FieldRow>

              <FieldRow icon={RepeatIcon}>
                <select className={selectClass} value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatChoice)} aria-label={t('repeat')}>
                  <option value="none">{t('repeatNone')}</option>
                  <option value="daily">{t('repeatDaily')}</option>
                  <option value="weekdays">{t('repeatWeekdays')}</option>
                  <option value="weekly">{t('repeatWeekly', { day: weekday })}</option>
                  <option value="monthly">{t('repeatMonthly', { n: startDay.getDate() })}</option>
                  <option value="yearly">{t('repeatYearly', { date: fmt.dayMonth(startDay) })}</option>
                  {isCustom && (
                    <option value="custom" disabled>
                      {t('repeatCustom')}
                    </option>
                  )}
                </select>
                {repeat === 'custom' && <p className="mt-1.5 text-xs text-muted-foreground">{t('repeatCustomHint')}</p>}
              </FieldRow>

              <FieldRow icon={CalendarDays}>
                <select className={selectClass} value={calendar} onChange={(e) => setCalendar(e.target.value)} aria-label={t('calendar')}>
                  {calendars.map((c) => (
                    <option key={c.href} value={c.href}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FieldRow>

              <FieldRow icon={MapPin}>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t('addLocation')} aria-label={t('location')} maxLength={500} />
              </FieldRow>

              <FieldRow icon={AlignLeft}>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('addDescription')}
                  aria-label={t('description')}
                  rows={4}
                  className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3"
                />
              </FieldRow>
            </div>

            <div className="flex justify-end gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
              <Button variant="outline" onClick={onClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={invalid || busy || !calendar}>
                {t('save')}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
