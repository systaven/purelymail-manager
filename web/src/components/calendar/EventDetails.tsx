import { useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { AlignLeft, CalendarDays, Clock, Lock, MapPin, Pencil, Repeat, Trash2, Users, X } from 'lucide-react';
import { Dialog as DialogPrimitive, Popover } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n';
import { calendarMessages } from '@/lib/i18n/messages/calendar';
import { cn } from '@/lib/utils';
import type { Item } from './data';
import { addDays, sameDay, useCalFormat, type CalFormat } from './dates';

export function whenText(item: Item, fmt: CalFormat) {
  if (item.allDay) {
    const last = addDays(item.end, -1);
    return sameDay(item.start, last) ? fmt.dateLong(item.start) : fmt.dayRange(item.start, last);
  }
  if (sameDay(item.start, item.end) || item.end.getTime() === addDays(new Date(item.start.getFullYear(), item.start.getMonth(), item.start.getDate()), 1).getTime()) {
    return `${fmt.dateLong(item.start)} · ${fmt.timeFull(item.start)} – ${fmt.timeFull(item.end)}`;
  }
  return `${fmt.dateMedium(item.start)}, ${fmt.timeFull(item.start)} – ${fmt.dateMedium(item.end)}, ${fmt.timeFull(item.end)}`;
}

// Links in plain text become clickable.
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <a key={i} href={p} target="_blank" rel="noreferrer noopener" className="break-all text-primary underline-offset-2 hover:underline">
            {p}
          </a>
        ) : (
          p
        )
      )}
    </>
  );
}

function Row({ icon: Icon, children }: { icon: typeof Clock; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function DetailsBody({ item, onEdit, onDelete, onClose, phone }: { item: Item; onEdit: () => void; onDelete: () => void; onClose: () => void; phone: boolean }) {
  const t = useT(calendarMessages);
  const fmt = useCalFormat();
  const ev = item.ev;
  const repeat = ev.recurring
    ? ev.repeat
      ? t(({ daily: 'rDaily', weekdays: 'rWeekdays', weekly: 'rWeekly', monthly: 'rMonthly', yearly: 'rYearly' } as const)[ev.repeat])
      : t('rCustom')
    : null;
  return (
    <div>
      <div className="flex items-center justify-end gap-0.5 px-2 pt-2">
        {!item.readOnly && (
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={onEdit} aria-label={t('edit')} title={`${t('edit')} (E)`}>
            <Pencil />
          </Button>
        )}
        {!item.readOnly && (
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={onDelete} aria-label={t('delete')} title={`${t('delete')} (Del)`}>
            <Trash2 />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={onClose} aria-label={t('close')}>
          <X />
        </Button>
      </div>
      <div className="space-y-3.5 px-5 pb-5 pt-1">
        <div className="flex gap-3">
          <span className="mt-1.5 size-3.5 shrink-0 rounded" style={{ backgroundColor: item.color }} />
          <div className="min-w-0 flex-1">
            {phone ? (
              <DialogTitle className="break-words text-lg font-semibold leading-snug">{ev.title || t('noTitle')}</DialogTitle>
            ) : (
              <h2 className="break-words text-lg font-semibold leading-snug">{ev.title || t('noTitle')}</h2>
            )}
            <p className="mt-1 text-sm text-muted-foreground">{whenText(item, fmt)}</p>
            {repeat && (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Repeat className="size-3.5" />
                {repeat}
              </p>
            )}
          </div>
        </div>
        {ev.location && (
          <Row icon={MapPin}>
            <a
              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(ev.location)}`}
              target="_blank"
              rel="noreferrer noopener"
              className="break-words hover:underline"
            >
              {ev.location}
            </a>
          </Row>
        )}
        {(ev.organizer || ev.attendees > 0) && (
          <Row icon={Users}>
            {ev.attendees > 0 && <div>{t('guests', { n: ev.attendees })}</div>}
            {ev.organizer && <div className="truncate text-muted-foreground">{t('organizer', { name: ev.organizer })}</div>}
          </Row>
        )}
        {ev.description && (
          <Row icon={AlignLeft}>
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm">
              <Linkified text={ev.description} />
            </div>
          </Row>
        )}
        <Row icon={CalendarDays}>
          <span className="flex items-center gap-1.5">
            {item.calendar?.name}
            {item.readOnly && <Lock className="size-3.5 text-muted-foreground" />}
          </span>
        </Row>
        {item.readOnly && <p className="text-xs text-muted-foreground">{t('readOnlyEvent')}</p>}
      </div>
    </div>
  );
}

// Details next to the clicked event (a bottom sheet on phones).
export function EventDetails({
  item,
  anchor,
  phone,
  onEdit,
  onDelete,
  onClose,
}: {
  item: Item | null;
  anchor: HTMLElement | null;
  phone: boolean;
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => void;
  onClose: () => void;
}) {
  // Remembered in case the event's element is re-rendered away.
  const lastRect = useRef<DOMRect | null>(null);
  const virtualRef = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () => {
          if (anchor?.isConnected) {
            const r = anchor.getBoundingClientRect();
            if (r.width || r.height) return (lastRect.current = r);
          }
          return lastRect.current ?? new DOMRect(window.innerWidth / 2, window.innerHeight / 3, 0, 0);
        },
      },
    }),
    [anchor]
  );

  const keys = (e: ReactKeyboardEvent) => {
    if (!item || item.readOnly || (e.target as HTMLElement).closest('a, input, textarea')) return;
    if (e.key === 'e') {
      e.preventDefault();
      onEdit(item);
    } else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === '#') {
      e.preventDefault();
      onDelete(item);
    }
  };

  if (phone) {
    return (
      <Dialog open={Boolean(item)} onOpenChange={(o) => !o && onClose()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            onKeyDown={keys}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t bg-popover pb-[env(safe-area-inset-bottom)] text-popover-foreground shadow-2xl outline-none data-[state=open]:animate-[cal-sheet-up_200ms_ease-out]"
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
            {item && <DetailsBody item={item} phone onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} onClose={onClose} />}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </Dialog>
    );
  }

  return (
    <Popover.Root open={Boolean(item)} onOpenChange={(o) => !o && onClose()}>
      <Popover.Anchor virtualRef={virtualRef} />
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          onKeyDown={keys}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement)?.focus();
          }}
          className={cn('z-40 w-[min(380px,calc(100vw-24px))] animate-in rounded-xl border bg-popover text-popover-foreground shadow-xl outline-none')}
        >
          {item && <DetailsBody item={item} phone={false} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} onClose={onClose} />}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
