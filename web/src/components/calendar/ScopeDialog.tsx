import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n';
import { calendarMessages } from '@/lib/i18n/messages/calendar';
import { cn } from '@/lib/utils';

export type Scope = 'this' | 'all';

// const scope = await ask('edit'): "This event" or "All events" for a recurring
// event, or null when cancelled.
export function useScopePrompt() {
  const t = useT(calendarMessages);
  const [req, setReq] = useState<{ kind: 'edit' | 'delete'; allowThis: boolean } | null>(null);
  const [choice, setChoice] = useState<Scope>('this');
  const resolver = useRef<(s: Scope | null) => void>(undefined);

  const ask = useCallback(
    (kind: 'edit' | 'delete', allowThis = true) =>
      new Promise<Scope | null>((resolve) => {
        resolver.current = resolve;
        setChoice(allowThis ? 'this' : 'all');
        setReq({ kind, allowThis });
      }),
    []
  );

  const close = (s: Scope | null) => {
    resolver.current?.(s);
    resolver.current = undefined;
    setReq(null);
  };

  const options: { value: Scope; label: string; disabled: boolean }[] = [
    { value: 'this', label: t('thisEvent'), disabled: req?.allowThis === false },
    { value: 'all', label: t('allEvents'), disabled: false },
  ];

  const element = (
    <Dialog open={Boolean(req)} onOpenChange={(o) => !o && close(null)}>
      <DialogContent className="top-[22vh] max-w-xs p-5" aria-describedby={undefined}>
        <DialogTitle>{req?.kind === 'delete' ? t('recurringDelete') : t('recurringEdit')}</DialogTitle>
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            close(choice);
          }}
        >
          <div role="radiogroup" className="space-y-1">
            {options.map((o) => (
              <label
                key={o.value}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent',
                  o.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent'
                )}
              >
                <input
                  type="radio"
                  name="scope"
                  value={o.value}
                  checked={choice === o.value}
                  disabled={o.disabled}
                  onChange={() => setChoice(o.value)}
                  className="size-4 accent-primary"
                  autoFocus={choice === o.value}
                />
                {o.label}
              </label>
            ))}
          </div>
          {req?.allowThis === false && <p className="mt-2 px-2 text-xs text-muted-foreground">{t('allEventsOnly')}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => close(null)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant={req?.kind === 'delete' ? 'destructive' : 'default'}>
              {req?.kind === 'delete' ? t('delete') : t('ok')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );

  return [element, ask] as const;
}
