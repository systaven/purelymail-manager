import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ExternalLink, Inbox, X } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { routingMessages } from '@/lib/i18n/messages/routing';
import { cn } from '@/lib/utils';
import { EMAIL_RE, parseAddresses } from './rules';

interface Props {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  // The text being typed; lifted so the editor can commit it on save.
  draft: string;
  onDraftChange: (draft: string) => void;
  suggestions: string[];
  invalid?: boolean;
  describedBy?: string;
}

// Token input for addresses: Enter / comma / space / paste adds, Backspace on an
// empty field removes the last one, arrow keys pick from mailbox suggestions.
export function TargetsInput({ id, value, onChange, draft, onDraftChange, suggestions, invalid, describedBy }: Props) {
  const t = useT(routingMessages);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const known = useMemo(() => new Set(suggestions), [suggestions]);

  const matches = useMemo(() => {
    const q = draft.trim().toLowerCase();
    return suggestions.filter((s) => !value.includes(s) && (!q || s.includes(q))).slice(0, 6);
  }, [draft, suggestions, value]);
  const open = focused && matches.length > 0 && (draft.trim() !== '' || value.length === 0);

  const add = (addresses: string[]) => {
    const next = [...value];
    for (const a of addresses) if (!next.includes(a)) next.push(a);
    onChange(next);
    onDraftChange('');
    setActive(0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.metaKey || e.ctrlKey) return; // Ctrl/⌘+Enter saves the form.
    if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
    } else if (e.key === 'Enter' || e.key === ',' || e.key === ';' || (e.key === ' ' && draft.trim())) {
      if (e.key === 'Enter' && open && !draft.includes('@')) {
        e.preventDefault();
        add([matches[active] ?? matches[0]]);
      } else if (draft.trim()) {
        e.preventDefault();
        add(parseAddresses(draft));
      } else if (e.key !== 'Enter') e.preventDefault();
    } else if (e.key === 'Tab' && open && draft.trim() && !draft.includes('@')) {
      e.preventDefault();
      add([matches[active] ?? matches[0]]);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setFocused(false);
    }
  };

  return (
    <div className="relative">
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          'flex min-h-9 w-full cursor-text flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 shadow-xs transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-3',
          invalid && 'border-destructive'
        )}
      >
        {value.map((address) => {
          const valid = EMAIL_RE.test(address);
          const internal = known.has(address);
          const Icon = internal ? Inbox : ExternalLink;
          return (
            <span
              key={address}
              title={valid ? (internal ? t('internalTarget') : t('externalTarget')) : t('invalidAddress')}
              className={cn(
                'inline-flex min-w-0 max-w-full items-center gap-1 rounded-md py-0.5 pl-1.5 pr-0.5 text-[13px]',
                !valid ? 'bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/40' : internal ? 'bg-accent text-accent-foreground' : 'border border-dashed'
              )}
            >
              <Icon className={cn('size-3.5 shrink-0', valid && (internal ? 'text-primary' : 'text-muted-foreground'))} />
              <span className="truncate">{address}</span>
              <button
                type="button"
                aria-label={t('removeTarget', { address })}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((v) => v !== address));
                  inputRef.current?.focus();
                }}
                className="rounded p-0.5 opacity-60 hover:bg-foreground/10 hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          id={id}
          value={draft}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          type="email"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          placeholder={value.length ? t('targetsMore') : t('targetsPlaceholder')}
          onChange={(e) => {
            onDraftChange(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const parts = parseAddresses(e.clipboardData.getData('text'));
            if (parts.length > 1) {
              e.preventDefault();
              add(parts);
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (draft.trim()) add(parseAddresses(draft));
          }}
          className="h-6 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('suggestions')}
          className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 animate-in overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {matches.map((address, i) => (
            <li
              key={address}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // Keep focus in the input while picking.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => add([address])}
              className={cn('flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm', i === active && 'bg-accent text-accent-foreground')}
            >
              <Inbox className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">{address}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
