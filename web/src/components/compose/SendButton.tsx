import { useState } from 'react';
import { CalendarClock, ChevronDown, Clock, Send, Sun, Sunrise } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/misc';
import { useLocale, useT } from '@/lib/i18n';
import { composeMessages } from '@/lib/i18n/messages/compose';
import { modKey } from './Editor';

const at = (daysAhead: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d;
};
// Next Monday (a week ahead when today is Monday).
const nextMonday = () => at((1 - new Date().getDay() + 7) % 7 || 7, 8);

// Value for <input type="datetime-local"> in local time.
const localInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Send with a split menu for scheduled sending.
export function SendButton({ onSend, disabled }: { onSend: (sendAt?: number) => void; disabled?: boolean }) {
  const t = useT(composeMessages);
  const { locale } = useLocale();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const fmt = (d: Date) => new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
  const presets = [
    { label: t('tomorrowMorning'), date: at(1, 8), icon: <Sunrise /> },
    { label: t('tomorrowAfternoon'), date: at(1, 13), icon: <Sun /> },
    { label: t('mondayMorning'), date: nextMonday(), icon: <CalendarClock /> }
  ];

  const submitPicked = () => {
    const time = new Date(value).getTime();
    if (!value || Number.isNaN(time) || time <= Date.now() + 30_000) return setError(t('mustBeFuture'));
    if (time > Date.now() + 365 * 86_400_000) return setError(t('scheduleTooFar'));
    setPickerOpen(false);
    onSend(time);
  };

  return (
    <div className="flex items-center">
      <Button onClick={() => onSend()} disabled={disabled} className="rounded-r-none pr-3" aria-keyshortcuts="Control+Enter Meta+Enter">
        <Send />
        {t('send')}
        <Kbd className="hidden border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground/80 md:inline-flex">{modKey}↵</Kbd>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={disabled} aria-label={t('sendOptions')} className="w-8 rounded-l-none border-l border-primary-foreground/20 px-0">
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-64">
          <DropdownMenuLabel>{t('scheduleSend')}</DropdownMenuLabel>
          {presets.map((p) => (
            <DropdownMenuItem key={p.label} onSelect={() => onSend(p.date.getTime())}>
              {p.icon}
              <span className="flex-1">{p.label}</span>
              <span className="text-xs text-muted-foreground">{fmt(p.date)}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setValue(localInput(at(1, 8)));
              setError('');
              setPickerOpen(true);
            }}
          >
            <Clock />
            {t('pickDateTime')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm p-5">
          <DialogTitle>{t('scheduleSend')}</DialogTitle>
          <DialogDescription className="mt-1">{t('scheduleHint')}</DialogDescription>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submitPicked();
            }}
          >
            <Input
              type="datetime-local"
              autoFocus
              aria-label={t('pickDateTime')}
              aria-invalid={Boolean(error)}
              min={localInput(new Date())}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError('');
              }}
            />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : (
              value && !Number.isNaN(new Date(value).getTime()) && <p className="text-sm text-muted-foreground">{fmt(new Date(value))}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPickerOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit">
                <CalendarClock />
                {t('schedule')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
