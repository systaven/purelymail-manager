import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Popover } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n';
import { composeMessages } from '@/lib/i18n/messages/compose';
import { cn } from '@/lib/utils';
import { getUndoDelay, setMailboxSettings, setUndoDelay, UNDO_DELAYS, type MailboxSettings } from './storage';

// Per-mailbox display name and signature, plus the (global) undo-send delay.
export function SenderSettings({ mailbox, settings, onChange }: { mailbox: string; settings: MailboxSettings; onChange: (s: MailboxSettings) => void }) {
  const t = useT(composeMessages);
  const [delay, setDelay] = useState(getUndoDelay);

  const update = (patch: Partial<MailboxSettings>) => {
    const next = { ...settings, ...patch };
    setMailboxSettings(mailbox, next);
    onChange(next);
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon-sm" className="size-7 text-muted-foreground" aria-label={t('settings')} title={t('settings')}>
          <Settings2 />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[min(20rem,calc(100vw-1.5rem))] animate-in space-y-4 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg"
        >
          <p className="text-sm font-semibold">{t('settings')}</p>
          <div className="space-y-1.5">
            <Label htmlFor="composer-from-name">{t('displayName')}</Label>
            <Input
              id="composer-from-name"
              value={settings.fromName}
              placeholder={t('displayNamePlaceholder')}
              maxLength={100}
              onChange={(e) => update({ fromName: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">{t('displayNameHint')}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="composer-signature">{t('signature')}</Label>
            <textarea
              id="composer-signature"
              rows={4}
              value={settings.signature}
              placeholder={t('signaturePlaceholder')}
              onChange={(e) => update({ signature: e.target.value })}
              className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3"
            />
          </div>
          <div className="space-y-1.5">
            <p id="composer-undo-label" className="text-sm font-medium leading-none">
              {t('undoSend')}
            </p>
            <div role="radiogroup" aria-labelledby="composer-undo-label" className="grid grid-cols-5 gap-1 rounded-md bg-muted p-1">
              {UNDO_DELAYS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={delay === n}
                  onClick={() => {
                    setDelay(n);
                    setUndoDelay(n);
                  }}
                  className={cn(
                    'h-7 rounded text-xs font-medium text-muted-foreground transition-colors',
                    delay === n ? 'bg-background text-foreground shadow-xs' : 'hover:text-foreground'
                  )}
                >
                  {n ? t('secondsShort', { n }) : t('off')}
                </button>
              ))}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
