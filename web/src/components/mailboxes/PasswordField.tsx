import { useState } from 'react';
import { Eye, EyeOff, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { generatePassword } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { mailboxesMessages } from '@/lib/i18n/messages/mailboxes';
import { cn } from '@/lib/utils';
import { MIN_PASSWORD } from './shared';

// Password input with show/hide, copy and a Generate button; shows a hint or
// an error underneath.
export function PasswordField({
  id,
  value,
  onChange,
  error,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  autoFocus?: boolean;
}) {
  const t = useT(mailboxesMessages);
  const [visible, setVisible] = useState(false);
  const short = value.length > 0 && value.length < MIN_PASSWORD;

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            id={id}
            type={visible ? 'text' : 'password'}
            autoComplete="new-password"
            spellCheck={false}
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={`${id}-hint`}
            className={cn('pr-[4.5rem]', visible && value && 'font-mono tracking-tight')}
          />
          <div className="absolute inset-y-0 right-0.5 flex items-center">
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={visible ? t('hidePassword') : t('showPassword')}
              title={visible ? t('hidePassword') : t('showPassword')}
            >
              {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
            {value && <CopyButton value={value} label={t('copy')} copiedText={t('copied')} />}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            onChange(generatePassword());
            setVisible(true);
          }}
        >
          <Sparkles />
          <span className="max-[400px]:sr-only">{t('generate')}</span>
        </Button>
      </div>
      <p id={`${id}-hint`} className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
        {error || t('passwordHint')}
        {short && !error && <span className="ml-1 tabular-nums">({value.length}/{MIN_PASSWORD})</span>}
      </p>
    </div>
  );
}
