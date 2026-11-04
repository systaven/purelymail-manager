import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Address } from '@/lib/mail-api';
import { useT } from '@/lib/i18n';
import { composeMessages } from '@/lib/i18n/messages/compose';
import { cn } from '@/lib/utils';
import { isEmail, parseAddresses } from './build';
import type { Contact } from './storage';

interface Props {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  // Display names for known addresses (lower-case keys).
  names: Map<string, string>;
  onNames: (people: Address[]) => void;
  suggestions: Contact[];
  inputRef?: React.Ref<HTMLInputElement>;
  trailing?: ReactNode;
}

const MAX_SUGGESTIONS = 6;

// Chip input for To / Cc / Bcc with autocomplete.
export function RecipientInput({ label, value, onChange, names, onNames, suggestions, inputRef, trailing }: Props) {
  const t = useT(composeMessages);
  const id = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ownRef = useRef<HTMLInputElement | null>(null);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const chosen = new Set(value.map((v) => v.toLowerCase()));
    const score = (c: Contact) => {
      const words = [c.address, ...c.name.toLowerCase().split(/\s+/)];
      if (words.some((w) => w.startsWith(q))) return 2;
      return c.address.includes(q) || c.name.toLowerCase().includes(q) ? 1 : 0;
    };
    return suggestions
      .filter((c) => !chosen.has(c.address))
      .map((c) => ({ c, s: score(c) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || b.c.uses - a.c.uses)
      .slice(0, MAX_SUGGESTIONS)
      .map((x) => x.c);
  }, [text, suggestions, value]);
  const showList = open && matches.length > 0;

  const add = (people: Address[]) => {
    if (!people.length) return;
    onNames(people.filter((p) => p.name));
    const existing = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];
    for (const p of people) {
      if (!existing.has(p.address)) {
        existing.add(p.address);
        next.push(p.address);
      }
    }
    onChange(next);
  };

  const commit = (raw = text) => {
    const people = parseAddresses(raw);
    setText('');
    setOpen(false);
    add(people);
  };

  const pick = (c: Contact) => {
    setText('');
    setOpen(false);
    add([{ name: c.name, address: c.address }]);
  };

  const remove = (address: string) => onChange(value.filter((v) => v !== address));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showList && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setHighlight((h) => (h + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
      return;
    }
    if (showList && e.key === 'Escape') {
      // Close the list, not the composer.
      e.preventDefault();
      setOpen(false);
      return;
    }
    if ((e.key === 'Enter' || e.key === 'Tab') && showList && !(e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      pick(matches[Math.min(highlight, matches.length - 1)]);
      return;
    }
    if (e.key === 'Enter' || e.key === ',' || e.key === ';' || (e.key === ' ' && (text.includes('@') || !showList))) {
      if (!text.trim()) {
        if (e.key !== 'Enter') e.preventDefault();
        return;
      }
      // Don't break a quoted display name being typed: "Doe, Jane" <…>
      if ((text.match(/"/g)?.length ?? 0) % 2 === 1 || (text.includes('<') && !text.includes('>'))) return;
      // ⌘↵ commits and then bubbles up to send.
      if (!(e.metaKey || e.ctrlKey)) e.preventDefault();
      commit();
      return;
    }
    if (e.key === 'Backspace' && !text && value.length) {
      e.preventDefault();
      remove(value[value.length - 1]);
    }
  };

  const listId = `${id}-list`;
  return (
    <div className="relative flex min-h-10 items-start gap-2 border-b px-3 py-1.5">
      <label htmlFor={id} className="mt-1.5 w-12 shrink-0 text-sm text-muted-foreground">
        {label}
      </label>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" onClick={() => ownRef.current?.focus()}>
        {value.map((address) => {
          const valid = isEmail(address);
          const name = names.get(address.toLowerCase());
          return (
            <span
              key={address}
              title={valid ? `${address} · ${t('editRecipient')}` : t('invalidAddress', { address })}
              onDoubleClick={() => {
                remove(address);
                setText(address);
                ownRef.current?.focus();
              }}
              className={cn(
                'inline-flex h-7 max-w-full items-center gap-1 rounded-full border pl-2.5 pr-1 text-[13px]',
                valid ? 'bg-secondary text-secondary-foreground' : 'border-destructive/60 bg-destructive/10 text-destructive'
              )}
            >
              <span className="truncate">{name || address}</span>
              <button
                type="button"
                aria-label={t('removeRecipient', { address })}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(address);
                }}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full opacity-60 hover:bg-foreground/10 hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}
        <input
          ref={(el) => {
            ownRef.current = el;
            if (typeof inputRef === 'function') inputRef(el);
            else if (inputRef) (inputRef as React.RefObject<HTMLInputElement | null>).current = el;
          }}
          id={id}
          type="text"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${highlight}` : undefined}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => text.trim() && commit()}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text');
            if (/[,;\n]/.test(pasted) || parseAddresses(pasted).length > 1) {
              e.preventDefault();
              commit(text + pasted);
            }
          }}
          className="h-7 min-w-[8rem] flex-1 bg-transparent text-sm outline-none focus-visible:ring-0"
        />
      </div>
      {trailing}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('suggestions')}
          className="absolute inset-x-2 top-full z-20 mt-1 max-h-64 animate-in overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg sm:left-14 sm:right-auto sm:w-80"
        >
          {matches.map((c, i) => (
            <li
              key={c.address}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(c)}
              className={cn('flex cursor-default flex-col rounded-md px-2 py-1.5', i === highlight && 'bg-accent text-accent-foreground')}
            >
              <span className="truncate text-sm">{c.name || c.address}</span>
              {c.name && <span className="truncate text-xs text-muted-foreground">{c.address}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
