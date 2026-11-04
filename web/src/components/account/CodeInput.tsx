import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

// A one-time code field: digits only, wide spacing, fills from SMS/email
// autofill, and calls onComplete when all digits are in.
export const CodeInput = forwardRef<
  HTMLInputElement,
  {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    onComplete?: (value: string) => void;
    length?: number;
    disabled?: boolean;
    invalid?: boolean;
    autoFocus?: boolean;
    'aria-label'?: string;
    'aria-describedby'?: string;
    className?: string;
  }
>(({ value, onChange, onComplete, length = 6, invalid, className, ...props }, ref) => (
  <input
    ref={ref}
    inputMode="numeric"
    autoComplete="one-time-code"
    pattern={`[0-9]{${length}}`}
    maxLength={length}
    spellCheck={false}
    placeholder={'•'.repeat(length)}
    aria-invalid={invalid || undefined}
    value={value}
    onChange={(e) => {
      const next = e.target.value.replace(/\D/g, '').slice(0, length);
      onChange(next);
      if (next.length === length && next !== value) onComplete?.(next);
    }}
    className={cn(
      'h-11 w-full max-w-[13.5rem] rounded-md border border-input bg-background px-3 text-center font-mono text-xl tracking-[0.5em] shadow-xs transition-[border-color,box-shadow] placeholder:text-muted-foreground/50 focus-visible:border-primary focus-visible:ring-3 disabled:opacity-50 aria-invalid:border-destructive',
      className
    )}
    {...props}
  />
));
CodeInput.displayName = 'CodeInput';
