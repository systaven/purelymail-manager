import { forwardRef, useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Kbd } from '@/components/ui/misc';
import { useT } from '@/lib/i18n';
import { mailMessages } from '@/lib/i18n/messages/mail';
import { cn } from '@/lib/utils';

const OPERATORS = [
  { token: 'from:', hint: 'opFrom' },
  { token: 'to:', hint: 'opTo' },
  { token: 'subject:', hint: 'opSubject' },
  { token: 'has:attachment', hint: 'opAttachment' },
  { token: 'is:unread', hint: 'opUnread' },
  { token: 'is:starred', hint: 'opStarred' },
  { token: 'after:', hint: 'opAfter' },
  { token: 'before:', hint: 'opBefore' },
] as const;

// Search field: Enter runs the query, Esc clears it, operator chips while focused.
export const SearchBox = forwardRef<HTMLInputElement, { value: string; onSearch: (q: string) => void; placeholder: string }>(
  ({ value, onSearch, placeholder }, ref) => {
    const t = useT(mailMessages);
    const [text, setText] = useState(value);
    const [focused, setFocused] = useState(false);
    useEffect(() => setText(value), [value]);

    const insert = (token: string) => {
      const next = `${text.trim()} ${token}`.trimStart();
      setText(next);
      if (!token.endsWith(':')) onSearch(next);
    };

    return (
      <div className="relative">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch(text.trim());
            (document.activeElement as HTMLElement | null)?.blur();
          }}
          className={cn(
            'flex h-9 items-center gap-2 rounded-lg border bg-background px-2.5 transition-[border-color,box-shadow]',
            focused && 'border-primary ring-3'
          )}
        >
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setText('');
                if (value) onSearch('');
                e.currentTarget.blur();
              }
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            enterKeyHint="search"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0"
          />
          {text ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setText('');
                if (value) onSearch('');
              }}
              className="-mr-1 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={t('clearSearch')}
            >
              <X className="size-4" />
            </button>
          ) : (
            !focused && <Kbd className="hidden pointer-fine:inline-flex">/</Kbd>
          )}
        </form>
        {focused && (
          <div className="absolute inset-x-0 top-full z-30 mt-1.5 animate-in rounded-lg border bg-popover p-2 shadow-lg">
            <p className="px-1 pb-1.5 text-xs text-muted-foreground">{t('searchTips')}</p>
            <div className="flex flex-wrap gap-1.5">
              {OPERATORS.map((op) => (
                <button
                  key={op.token}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insert(op.token)}
                  title={t(op.hint)}
                  className="rounded-md border bg-background px-2 py-1 font-mono text-xs hover:bg-accent"
                >
                  {op.token}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);
SearchBox.displayName = 'SearchBox';
