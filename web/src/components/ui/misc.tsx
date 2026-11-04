import { useState } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Skeleton = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
);

export const Kbd = ({ className, ...props }: HTMLAttributes<HTMLElement>) => (
  <kbd
    className={cn(
      'pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-0.5 rounded border bg-muted px-1 font-sans text-[11px] font-medium text-muted-foreground',
      className
    )}
    {...props}
  />
);

export const Badge = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground', className)} {...props} />
);

const AVATAR_COLORS = ['bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500', 'bg-teal-500', 'bg-sky-500', 'bg-indigo-500', 'bg-violet-500', 'bg-fuchsia-500', 'bg-pink-500'];

function initials(name: string) {
  const words = name.replace(/@.*$/, '').trim().split(/[\s._-]+/).filter(Boolean);
  if (!words.length) return '?';
  if (/[぀-ヿ㐀-鿿가-힯]/.test(words[0])) return words[0][0];
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
}

// Initials on a colour that stays the same for a given name.
export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  // A picture (e.g. the Clerk profile photo) when there is one; initials otherwise
  // or if it fails to load.
  const [failed, setFailed] = useState<string | null>(null);
  let hash = 0;
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const usable = src && /^(https:|data:image\/|blob:)/.test(src) ? src : null;
  if (usable && failed !== usable) {
    return (
      <img
        ref={(img) => {
          // Errors before React attached its handler still count.
          if (img?.complete && img.naturalWidth === 0) setFailed(usable);
        }}
        src={usable}
        alt=""
        aria-hidden
        referrerPolicy="no-referrer"
        onError={() => setFailed(usable)}
        className={cn('inline-block size-8 shrink-0 select-none rounded-full bg-muted object-cover', className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-8 shrink-0 select-none items-center justify-center rounded-full text-xs font-semibold text-white',
        AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length],
        className
      )}
    >
      {initials(name)}
    </span>
  );
}
