import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, PanelLeft, Plus } from 'lucide-react';
import { Dialog as DrawerPrimitive } from 'radix-ui';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { AgendaView } from '@/components/calendar/AgendaView';
import { inputOf, timesFor, toItem, useCalendars, useEvents, useHiddenCalendars, type Item } from '@/components/calendar/data';
import {
  addDays,
  addMinutes,
  atMinutes,
  fromYmd,
  minutesIntoDay,
  sameDay,
  stepDate,
  toYmd,
  useCalFormat,
  useMediaQuery,
  useNow,
  viewRange,
  VIEWS,
  type View,
} from '@/components/calendar/dates';
import { EventDetails } from '@/components/calendar/EventDetails';
import { EventEditor, type EditorResult, type EditorTarget } from '@/components/calendar/EventEditor';
import { MonthView } from '@/components/calendar/MonthView';
import { useScopePrompt, type Scope } from '@/components/calendar/ScopeDialog';
import { Sidebar } from '@/components/calendar/Sidebar';
import { TimeGrid } from '@/components/calendar/TimeGrid';
import { Button, buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorBanner } from '@/components/ui/feedback';
import { Kbd, Skeleton } from '@/components/ui/misc';
import { useT } from '@/lib/i18n';
import { calendarMessages } from '@/lib/i18n/messages/calendar';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { davApi, davKeys, type CalendarEvent } from '@/lib/dav-api';
import { useActiveMailbox } from '@/lib/use-mailbox';
import { cn } from '@/lib/utils';

const VIEW_KEY = 'calendar-view';

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
};

const overlayOpen = () => Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'));

const storedView = (): View | null => {
  try {
    const v = localStorage.getItem(VIEW_KEY) as View | null;
    return v && VIEWS.includes(v) ? v : null;
  } catch {
    return null;
  }
};

const VIEW_LABEL = { month: 'viewMonth', week: 'viewWeek', day: 'viewDay', agenda: 'viewAgenda' } as const;
const VIEW_KEYS = { month: 'M', week: 'W', day: 'D', agenda: 'A' } as const;

// Event tints (see softStyle): stronger on dark backgrounds.
const KEYFRAMES = `
:root { --cal-tint: 17%; --cal-ink: 62%; }
.dark { --cal-tint: 30%; --cal-ink: 45%; }
@keyframes cal-sheet-up { from { transform: translateY(24px); opacity: 0; } }
@keyframes cal-progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
`;

export default function CalendarPage() {
  const t = useT(calendarMessages);
  const errorText = useErrorText();
  const { mailbox, mailboxes, query, setMailbox } = useActiveMailbox();

  if (query.error) {
    return (
      <div className="p-4">
        <ErrorBanner message={errorText(query.error)} onRetry={() => query.refetch()} retryLabel={t('retry')} />
      </div>
    );
  }
  if (query.isPending) {
    return (
      <div className="flex h-full">
        <div className="hidden w-[248px] shrink-0 space-y-3 border-r bg-sidebar p-3 lg:block">
          <Skeleton className="h-10" />
          <Skeleton className="h-52" />
          <Skeleton className="h-6" />
          <Skeleton className="h-6" />
        </div>
        <div className="flex-1 space-y-3 p-4">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-[60vh]" />
        </div>
      </div>
    );
  }
  if (!mailbox) {
    return (
      <div className="mx-auto max-w-lg p-6 pt-16">
        <EmptyState
          icon={CalendarDays}
          title={t('noMailbox')}
          description={t('noMailboxBody')}
          action={
            <Link to="/mailboxes" className={buttonVariants({ variant: 'outline' })}>
              {t('goToMailboxes')}
            </Link>
          }
        />
      </div>
    );
  }
  return <CalendarView key={mailbox} mailbox={mailbox} mailboxes={mailboxes} setMailbox={setMailbox} />;
}

function CalendarView({ mailbox, mailboxes, setMailbox }: { mailbox: string; mailboxes: string[]; setMailbox: (m: string) => void }) {
  const t = useT(calendarMessages);
  const fmt = useCalFormat();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const errorText = useErrorText();
  const phone = useMediaQuery('(max-width: 639px)');
  const now = useNow();
  const todayKey = toYmd(now);
  const today = useMemo(() => fromYmd(todayKey)!, [todayKey]);

  // --- URL state ------------------------------------------------------------------

  const [params, setParams] = useSearchParams();
  const viewParam = params.get('view') as View | null;
  const view: View = viewParam && VIEWS.includes(viewParam) ? viewParam : phone ? 'agenda' : (storedView() ?? 'week');
  const dateParam = params.get('date');
  const date = useMemo(() => fromYmd(dateParam) ?? today, [dateParam, today]);

  const go = useCallback(
    (next: { view?: View; date?: Date }) => {
      if (next.view && !phone) {
        try {
          localStorage.setItem(VIEW_KEY, next.view);
        } catch {
          // Not remembered.
        }
      }
      setParams((p) => {
        const copy = new URLSearchParams(p);
        if (next.view) copy.set('view', next.view);
        if (next.date) {
          if (sameDay(next.date, new Date())) copy.delete('date');
          else copy.set('date', toYmd(next.date));
        }
        return copy;
      });
    },
    [setParams, phone]
  );

  const range = useMemo(() => viewRange(view, date, fmt.weekStart), [view, date, fmt.weekStart]);
  const neighbours = useMemo(
    () =>
      [-1, 1].map((d) => {
        const r = viewRange(view, stepDate(view, date, d), fmt.weekStart);
        return [r.start, r.end] as [Date, Date];
      }),
    [view, date, fmt.weekStart]
  );
  const days = useMemo(() => Array.from({ length: range.days }, (_, i) => addDays(range.start, i)), [range]);

  // --- Data -----------------------------------------------------------------------

  const calendars = useCalendars(mailbox);
  const events = useEvents(mailbox, range.start, range.end, neighbours);
  const { hidden, toggle, only } = useHiddenCalendars(mailbox);
  // Optimistic changes: moved events (by id) and deleted ones (by id or href).
  const [overrides, setOverrides] = useState<Record<string, Pick<CalendarEvent, 'start' | 'end'>>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const calMap = useMemo(() => new Map((calendars.data ?? []).map((c) => [c.href, c])), [calendars.data]);
  const items = useMemo(
    () =>
      (events.data ?? [])
        .filter((ev) => !hidden.has(ev.calendar) && !removed.has(ev.id) && !removed.has(ev.href))
        .map((ev) => toItem(overrides[ev.id] ? { ...ev, ...overrides[ev.id] } : ev, calMap.get(ev.calendar))),
    [events.data, hidden, removed, overrides, calMap]
  );

  const writable = useMemo(() => (calendars.data ?? []).filter((c) => !c.readOnly), [calendars.data]);
  const defaultCalendar = writable.find((c) => !hidden.has(c.href))?.href ?? writable[0]?.href;

  // --- Selection, editor ----------------------------------------------------------

  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);
  const [details, setDetails] = useState<{ item: Item; el: HTMLElement | null } | null>(null);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [scopeDialog, askScope] = useScopePrompt();
  const detailItem = details ? (items.find((i) => i.id === details.item.id) ?? details.item) : null;

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: davKeys.allEvents(mailbox) }), [qc, mailbox]);

  const create = useCallback(
    (start: Date, end: Date, allDay: boolean) => {
      if (!writable.length) {
        toast.error(t('noWritable'));
        return;
      }
      setDetails(null);
      setEditor({ mode: 'create', start, end, allDay });
    },
    [writable.length, t]
  );

  const newEvent = useCallback(() => {
    const showsToday = today >= range.start && today < range.end && view !== 'month';
    const base = showsToday || view === 'agenda' ? today : date;
    let start = atMinutes(base, 9 * 60);
    if (sameDay(base, new Date())) {
      const next = Math.ceil((minutesIntoDay(new Date()) + 1) / 60) * 60;
      if (next <= 22 * 60) start = atMinutes(base, next);
    }
    create(start, addMinutes(start, 60), false);
  }, [today, range, view, date, create]);

  const save = async ({ input, calendar, repeatChanged, calendarChanged }: EditorResult) => {
    if (!editor) return false;
    try {
      if (editor.mode === 'create') {
        await davApi.createEvent(mailbox, calendar, input);
        toast.success(t('eventCreated'));
      } else {
        const ev = editor.item.ev;
        let scope: Scope = 'all';
        if (ev.recurring) {
          const s = await askScope('edit', !repeatChanged && !calendarChanged);
          if (!s) return false;
          scope = s;
        }
        await davApi.updateEvent(mailbox, ev, scope === 'this' ? { ...input, repeat: undefined } : input, {
          scope,
          calendar: calendarChanged && scope === 'all' ? calendar : undefined,
        });
        toast.success(t('eventSaved'));
      }
      await invalidate();
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    }
  };

  const move = async (item: Item, start: Date, end: Date) => {
    const ev = item.ev;
    const patch = timesFor(item.allDay, start, end);
    setOverrides((o) => ({ ...o, [ev.id]: patch }));
    const clear = () =>
      setOverrides((o) => {
        if (o[ev.id] !== patch) return o;
        const copy = { ...o };
        delete copy[ev.id];
        return copy;
      });
    let scope: Scope = 'all';
    if (ev.recurring) {
      const s = await askScope('edit');
      if (!s) return clear();
      scope = s;
    }
    try {
      await davApi.updateEvent(mailbox, ev, inputOf(ev, patch), { scope });
      await invalidate();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      clear();
    }
  };

  const remove = async (item: Item) => {
    const ev = item.ev;
    setDetails(null);
    let scope: Scope = 'all';
    if (ev.recurring) {
      const s = await askScope('delete');
      if (!s) return;
      scope = s;
    } else {
      const ok = await confirm({
        title: t('deleteEventTitle', { title: ev.title || t('noTitle') }),
        description: t('deleteEventBody'),
        confirmLabel: t('delete'),
        cancelLabel: t('cancel'),
        destructive: true,
      });
      if (!ok) return;
    }
    const key = scope === 'this' ? ev.id : ev.href;
    setRemoved((r) => new Set(r).add(key));
    try {
      await davApi.deleteEvent(mailbox, ev, scope);
      toast.success(t('eventDeleted'));
      await invalidate();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setRemoved((r) => {
        const copy = new Set(r);
        copy.delete(key);
        return copy;
      });
    }
  };

  const openItem = useCallback((item: Item, el: HTMLElement) => setDetails({ item, el }), []);
  const showDay = useCallback((d: Date) => go({ view: 'day', date: d }), [go]);
  const step = useCallback((delta: number) => go({ date: stepDate(view, date, delta) }), [go, view, date]);

  // --- Keyboard -------------------------------------------------------------------

  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  const afterG = useRef(0);
  keys.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || overlayOpen()) return;
    // "g" + letter belongs to the app shell's navigation.
    if (e.key === 'g') return void (afterG.current = Date.now());
    if (Date.now() - afterG.current < 1200) return void (afterG.current = 0);
    const handlers: Record<string, () => void> = {
      t: () => go({ date: new Date() }),
      j: () => step(1),
      n: () => step(1),
      ArrowRight: () => step(1),
      k: () => step(-1),
      p: () => step(-1),
      ArrowLeft: () => step(-1),
      m: () => go({ view: 'month' }),
      w: () => go({ view: 'week' }),
      d: () => go({ view: 'day' }),
      a: () => go({ view: 'agenda' }),
      c: newEvent,
      '?': () => setHelp(true),
      Escape: () => setDetails(null),
    };
    const handler = handlers[e.key];
    if (!handler) return;
    // Arrow keys on a focused control keep their own meaning.
    if (e.key.startsWith('Arrow') && (e.target as HTMLElement).closest?.('button, a, [role="button"], [tabindex]')) return;
    e.preventDefault();
    handler();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- Layout ---------------------------------------------------------------------

  const lastShown = addDays(range.end, -1);
  const title =
    view === 'month'
      ? fmt.monthYear(date)
      : view === 'day'
        ? phone
          ? fmt.monthYear(date)
          : fmt.day(date)
        : fmt.monthYearRange(range.start, lastShown);

  const draft = editor?.mode === 'create' ? { start: editor.start, end: editor.end, allDay: editor.allDay } : null;
  const selectedId = detailItem?.id ?? null;
  const loadingFirst = events.isPending;

  const sidebar = (
    <Sidebar
      mailbox={mailbox}
      mailboxes={mailboxes}
      onMailbox={(m) => {
        setDrawer(false);
        setMailbox(m);
      }}
      calendars={calendars.data}
      calendarsLoading={calendars.isPending}
      hidden={hidden}
      onToggle={toggle}
      onOnly={(href) => only(href, (calendars.data ?? []).map((c) => c.href))}
      date={date}
      today={today}
      range={view === 'agenda' || view === 'month' ? { start: date, end: addDays(date, 1) } : range}
      onSelectDate={(d) => {
        setDrawer(false);
        go({ date: d });
      }}
      onNewEvent={() => {
        setDrawer(false);
        newEvent();
      }}
    />
  );

  const viewSwitcher = phone ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1 px-2.5">
          {t(VIEW_LABEL[view])}
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuRadioGroup value={view} onValueChange={(v) => go({ view: v as View })}>
          {VIEWS.map((v) => (
            <DropdownMenuRadioItem key={v} value={v}>
              {t(VIEW_LABEL[v])}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <div role="tablist" aria-label={t('view')} className="inline-flex shrink-0 rounded-lg bg-muted p-0.5">
      {VIEWS.map((v) => (
        <button
          key={v}
          role="tab"
          aria-selected={view === v}
          onClick={() => go({ view: v })}
          title={`${t(VIEW_LABEL[v])} (${VIEW_KEYS[v]})`}
          className={cn(
            'h-7 rounded-md px-3 text-[13px] font-medium transition-colors',
            view === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t(VIEW_LABEL[v])}
        </button>
      ))}
    </div>
  );

  return (
    <div className="@container relative h-full overflow-hidden">
      <style>{KEYFRAMES}</style>
      <div className="flex h-full">
        <aside className="hidden w-[248px] shrink-0 border-r bg-sidebar @4xl:block">{sidebar}</aside>

        <section className="relative flex min-w-0 flex-1 flex-col bg-background">
          <header className="relative flex h-14 shrink-0 items-center gap-1 border-b px-2 sm:gap-2 sm:px-4">
            <Button variant="ghost" size="icon" className="text-muted-foreground @4xl:hidden" onClick={() => setDrawer(true)} aria-label={t('showCalendars')}>
              <PanelLeft />
            </Button>
            <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => go({ date: new Date() })} title={`${t('today')} (T)`}>
              {t('today')}
            </Button>
            <div className="flex items-center">
              <Button variant="ghost" size="icon-sm" onClick={() => step(-1)} aria-label={t('previous')} title={`${t('previous')} (K)`}>
                <ChevronLeft />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => step(1)} aria-label={t('next')} title={`${t('next')} (J)`}>
                <ChevronRight />
              </Button>
            </div>
            <h1 className="min-w-0 flex-1 truncate pl-1 text-base font-semibold tracking-tight sm:text-lg" aria-live="polite">
              {title}
            </h1>
            <button
              type="button"
              onClick={() => go({ date: new Date() })}
              className="flex size-8 shrink-0 flex-col items-center justify-center rounded-md border text-[11px] font-semibold leading-none tabular-nums sm:hidden"
              aria-label={t('today')}
            >
              <span className="h-1 w-full rounded-t-[5px] bg-primary/80" />
              <span className="flex flex-1 items-center">{today.getDate()}</span>
            </button>
            {viewSwitcher}
            {events.isFetching && (
              <div className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 overflow-hidden">
                <div className="h-full w-1/3 bg-primary/70" style={{ animation: 'cal-progress 1s ease-in-out infinite' }} />
              </div>
            )}
          </header>

          {(events.error || calendars.error) && (
            <div className="border-b p-3">
              <ErrorBanner
                message={`${calendars.error ? t('calendarsFailed') : t('loadFailed')}: ${errorText(calendars.error ?? events.error)}`}
                onRetry={() => (calendars.error ? calendars.refetch() : events.refetch())}
                retryLabel={t('retry')}
              />
            </div>
          )}

          {view === 'month' ? (
            <MonthView
              start={range.start}
              month={date.getMonth()}
              items={items}
              now={now}
              draft={draft}
              selectedId={selectedId}
              onCreate={create}
              onOpen={openItem}
              onMove={move}
              onShowDay={showDay}
            />
          ) : view === 'agenda' ? (
            <AgendaView
              start={range.start}
              days={range.days}
              items={items}
              now={now}
              loading={loadingFirst}
              selectedId={selectedId}
              onOpen={openItem}
              onShowDay={showDay}
              onNew={writable.length ? newEvent : null}
            />
          ) : (
            <TimeGrid
              days={days}
              items={items}
              now={now}
              draft={draft}
              selectedId={selectedId}
              onCreate={create}
              onOpen={openItem}
              onMove={move}
              onShowDay={showDay}
            />
          )}

          {writable.length > 0 && (
            <Button size="icon" className="absolute bottom-5 right-5 z-30 size-14 rounded-2xl shadow-lg sm:hidden [&_svg]:size-6" onClick={newEvent} aria-label={t('newEvent')}>
              <Plus />
            </Button>
          )}
        </section>
      </div>

      <DrawerPrimitive.Root open={drawer} onOpenChange={setDrawer}>
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <DrawerPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r bg-sidebar shadow-xl outline-none data-[state=open]:animate-in"
          >
            <DrawerPrimitive.Title className="sr-only">{t('calendars')}</DrawerPrimitive.Title>
            {sidebar}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>

      <EventDetails
        item={editor ? null : detailItem}
        anchor={details?.el ?? null}
        phone={phone}
        onClose={() => setDetails(null)}
        onEdit={(item) => {
          setDetails(null);
          setEditor({ mode: 'edit', item });
        }}
        onDelete={remove}
      />

      <EventEditor target={editor} calendars={writable} defaultCalendar={defaultCalendar} onClose={() => setEditor(null)} onSave={save} />

      {scopeDialog}

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-w-sm p-5" aria-describedby={undefined}>
          <DialogTitle>{t('shortcuts')}</DialogTitle>
          <dl className="mt-4 space-y-2 text-sm">
            {(
              [
                [['T'], 'kToday'],
                [['J', 'N', '→'], 'kNext'],
                [['K', 'P', '←'], 'kPrev'],
                [['M'], 'kMonth'],
                [['W'], 'kWeek'],
                [['D'], 'kDay'],
                [['A'], 'kAgenda'],
                [['C'], 'kNew'],
                [['Esc'], 'kClose'],
                [['?'], 'kHelp'],
              ] as const
            ).map(([ks, label]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t(label)}</dt>
                <dd className="flex gap-1">
                  {ks.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}
