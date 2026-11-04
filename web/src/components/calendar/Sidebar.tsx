import { useEffect, useState, type FormEvent } from 'react';
import { Check, ChevronsUpDown, Eye, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, Kbd, Skeleton } from '@/components/ui/misc';
import { useT } from '@/lib/i18n';
import { calendarMessages } from '@/lib/i18n/messages/calendar';
import { davApi, davKeys, type Calendar } from '@/lib/dav-api';
import { useAction } from '@/lib/mutation';
import { cn } from '@/lib/utils';
import { colorOf, PALETTE } from './data';
import { MiniMonth } from './MiniMonth';

export function CalendarDialog({
  mailbox,
  calendar,
  open,
  onOpenChange,
  suggestedColor,
}: {
  mailbox: string;
  calendar: Calendar | null; // null: a new calendar
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestedColor: string;
}) {
  const t = useT(calendarMessages);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  useEffect(() => {
    if (!open) return;
    setName(calendar?.name ?? '');
    setColor(calendar?.color ?? suggestedColor);
    // Only when it opens: a refetch while typing must not reset the form.
  }, [open]);

  const invalidate = [davKeys.calendars(mailbox), davKeys.allEvents(mailbox)];
  const create = useAction(() => davApi.createCalendar(mailbox, name.trim(), color), { success: t('calendarCreated', { name: name.trim() }), invalidate });
  const update = useAction(() => davApi.updateCalendar(mailbox, calendar!.href, name.trim(), color), { success: t('calendarUpdated'), invalidate });
  const busy = create.isPending || update.isPending;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await (calendar ? update : create).mutateAsync(undefined);
      onOpenChange(false);
    } catch {
      // Toast shown.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-5" aria-describedby={undefined}>
        <DialogTitle>{calendar ? t('editCalendar') : t('newCalendar')}</DialogTitle>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cal-name">{t('calendarName')}</Label>
            <Input id="cal-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('calendarNamePlaceholder')} maxLength={200} />
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t('color')}</legend>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={c === color}
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={cn('flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-popover transition-transform hover:scale-110', c === color && 'ring-2 ring-foreground/60')}
                  style={{ backgroundColor: c }}
                >
                  {c === color && <Check className="size-4 text-white" />}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {calendar ? t('save') : t('create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CalendarRow({
  mailbox,
  calendar,
  visible,
  onToggle,
  onOnly,
  onEdit,
}: {
  mailbox: string;
  calendar: Calendar;
  visible: boolean;
  onToggle: () => void;
  onOnly: () => void;
  onEdit: () => void;
}) {
  const t = useT(calendarMessages);
  const confirm = useConfirm();
  const remove = useAction(() => davApi.deleteCalendar(mailbox, calendar.href), {
    success: t('calendarDeleted'),
    invalidate: [davKeys.calendars(mailbox), davKeys.allEvents(mailbox)],
  });
  const color = colorOf(calendar);
  return (
    <div className="group flex h-9 items-center gap-1 rounded-md pr-1 hover:bg-sidebar-accent pointer-fine:h-8">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 pl-2 text-sm">
        <input type="checkbox" className="peer sr-only" checked={visible} onChange={onToggle} aria-label={t('toggleCalendar', { name: calendar.name })} />
        <span
          aria-hidden
          className="flex size-4 shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
          style={{ borderColor: color, backgroundColor: visible ? color : 'transparent' }}
        >
          {visible && <Check className="size-3 text-white" strokeWidth={3} />}
        </span>
        <span className={cn('min-w-0 flex-1 truncate', !visible && 'text-muted-foreground')}>{calendar.name}</span>
        {calendar.readOnly && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('readOnly')} />}
      </label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-100 hover:bg-background hover:text-foreground data-[state=open]:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
            aria-label={t('calendarOptions', { name: calendar.name })}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="truncate">{calendar.name}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={onOnly}>
            <Eye />
            {t('showOnly')}
          </DropdownMenuItem>
          {!calendar.readOnly && (
            <>
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil />
                {t('editCalendar')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive data-[highlighted]:text-destructive [&_svg]:text-destructive"
                onSelect={async () => {
                  const ok = await confirm({
                    title: t('deleteCalendarTitle', { name: calendar.name }),
                    description: t('deleteCalendarBody'),
                    confirmLabel: t('deleteCalendar'),
                    cancelLabel: t('cancel'),
                    destructive: true,
                  });
                  if (ok) remove.mutate(undefined);
                }}
              >
                <Trash2 />
                {t('deleteCalendar')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function Sidebar({
  mailbox,
  mailboxes,
  onMailbox,
  calendars,
  calendarsLoading,
  hidden,
  onToggle,
  onOnly,
  date,
  today,
  range,
  onSelectDate,
  onNewEvent,
}: {
  mailbox: string;
  mailboxes: string[];
  onMailbox: (m: string) => void;
  calendars: Calendar[] | undefined;
  calendarsLoading: boolean;
  hidden: Set<string>;
  onToggle: (href: string) => void;
  onOnly: (href: string) => void;
  date: Date;
  today: Date;
  range: { start: Date; end: Date };
  onSelectDate: (d: Date) => void;
  onNewEvent: () => void;
}) {
  const t = useT(calendarMessages);
  const [dialog, setDialog] = useState<{ calendar: Calendar | null } | null>(null);
  const used = new Set(calendars?.map((c) => c.color));
  const suggested = PALETTE.find((c) => !used.has(c)) ?? PALETTE[0];

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 p-3">
        {mailboxes.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-10 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm hover:bg-sidebar-accent" aria-label={t('switchMailbox')}>
                <Avatar name={mailbox} className="size-6 text-[10px]" />
                <span className="min-w-0 flex-1 truncate font-medium">{mailbox}</span>
                <ChevronsUpDown className="size-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>{t('mailboxes')}</DropdownMenuLabel>
              {mailboxes.map((m) => (
                <DropdownMenuItem key={m} onSelect={() => onMailbox(m)}>
                  <Avatar name={m} className="size-5 text-[9px]" />
                  <span className="min-w-0 flex-1 truncate">{m}</span>
                  {m === mailbox && <Check />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button className="h-10 w-full justify-start rounded-lg" onClick={onNewEvent} disabled={!calendars?.some((c) => !c.readOnly)}>
          <Plus />
          <span className="flex-1 text-left">{t('newEvent')}</span>
          <Kbd className="hidden border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground pointer-fine:inline-flex">C</Kbd>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <MiniMonth value={date} onSelect={onSelectDate} today={today} range={range} className="mb-4" />

        <div className="flex items-center justify-between pb-1 pl-2">
          <span className="text-xs font-medium text-muted-foreground">{t('calendars')}</span>
          <Button variant="ghost" size="icon-sm" className="size-7 text-muted-foreground" aria-label={t('newCalendar')} title={t('newCalendar')} onClick={() => setDialog({ calendar: null })}>
            <Plus />
          </Button>
        </div>
        <div className="space-y-0.5">
          {calendarsLoading && !calendars
            ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="my-1.5 h-6" />)
            : calendars?.map((cal) => (
                <CalendarRow
                  key={cal.href}
                  mailbox={mailbox}
                  calendar={cal}
                  visible={!hidden.has(cal.href)}
                  onToggle={() => onToggle(cal.href)}
                  onOnly={() => onOnly(cal.href)}
                  onEdit={() => setDialog({ calendar: cal })}
                />
              ))}
          {calendars && calendars.length === 0 && (
            <div className="rounded-lg border border-dashed px-3 py-4 text-center">
              <p className="text-sm font-medium">{t('noCalendars')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('noCalendarsBody')}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setDialog({ calendar: null })}>
                <Plus />
                {t('newCalendar')}
              </Button>
            </div>
          )}
        </div>
      </div>
      <CalendarDialog
        mailbox={mailbox}
        calendar={dialog?.calendar ?? null}
        open={Boolean(dialog)}
        onOpenChange={(o) => !o && setDialog(null)}
        suggestedColor={suggested}
      />
    </div>
  );
}
