import { useCallback, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/misc';
import { Tooltip } from '@/components/ui/tooltip';
import { useLocale, useT } from '@/lib/i18n';
import { membersMessages } from '@/lib/i18n/messages/members';
import { parseDbTime, type Member } from '@/lib/members-api';
import { cn } from '@/lib/utils';

// A row of buttons acting as tabs or a single choice.
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'default',
  className,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  size?: 'default' | 'sm';
  className?: string;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex max-w-full rounded-lg bg-muted p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium text-muted-foreground transition-colors hover:text-foreground',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
            value === o.value && 'bg-background text-foreground shadow-xs'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// "3 hours ago" in the viewer's language.
export function useRelativeTime() {
  const { locale } = useLocale();
  return useCallback(
    (value: string | null) => {
      if (!value) return null;
      const seconds = (parseDbTime(value).getTime() - Date.now()) / 1000;
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ['year', 31536000],
        ['month', 2592000],
        ['week', 604800],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
      ];
      for (const [unit, size] of units) if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
      return rtf.format(0, 'second');
    },
    [locale]
  );
}

export function useDateFormat() {
  const { locale } = useLocale();
  return useCallback(
    (value: string, withTime = false) =>
      parseDbTime(value).toLocaleString(locale, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }),
    [locale]
  );
}

export function MemberBadges({ member, isSelf }: { member: Member; isSelf?: boolean }) {
  const t = useT(membersMessages);
  return (
    <>
      {isSelf && <Badge className="bg-accent text-accent-foreground">{t('you')}</Badge>}
      {member.role === 'admin' &&
        (member.envAdmin ? (
          <Tooltip content={t('viaEnv')} side="top">
            <Badge className="gap-1 bg-primary/10 text-primary">
              <ShieldCheck className="size-3" /> {t('admin')}
            </Badge>
          </Tooltip>
        ) : (
          <Badge className="gap-1 bg-primary/10 text-primary">
            <ShieldCheck className="size-3" /> {t('admin')}
          </Badge>
        ))}
      {member.disabled && <Badge className="bg-destructive/10 text-destructive">{t('disabled')}</Badge>}
    </>
  );
}

// Checkboxes for domains; selected domains no longer on the account stay listed.
export function DomainChecklist({
  domains,
  value,
  onChange,
  disabled,
}: {
  domains: string[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const t = useT(membersMessages);
  const all = [...new Set([...domains, ...value])].sort();
  if (!all.length) return <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">{t('noDomains')}</p>;
  const selected = new Set(value);
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {all.map((domain) => {
        const checked = selected.has(domain);
        const stale = !domains.includes(domain);
        return (
          <label
            key={domain}
            className={cn(
              'flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent/50',
              checked && 'border-primary/40 bg-primary/5',
              disabled && 'pointer-events-none opacity-60'
            )}
          >
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-primary"
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(checked ? value.filter((d) => d !== domain) : [...value, domain])}
            />
            <span className="min-w-0 flex-1 truncate">{domain}</span>
            {stale && <span className="shrink-0 text-[11px] text-warning">{t('notOnAccount')}</span>}
          </label>
        );
      })}
    </div>
  );
}

export const selectClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:ring-3 disabled:opacity-50';
