import { useState } from 'react';
import { useBrand } from '@/lib/session';
import { cn } from '@/lib/utils';

// The configured logo (BRAND_LOGO), or the default envelope mark.
export function Logo({ className }: { className?: string }) {
  const { logoUrl, name } = useBrand();
  const [broken, setBroken] = useState(false);
  if (logoUrl && !broken) {
    return <img src={logoUrl} alt={name} onError={() => setBroken(true)} className={cn('size-7 shrink-0 rounded-lg object-contain', className)} />;
  }
  return (
    <span className={cn('inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm', className)}>
      <svg viewBox="0 0 24 24" className="size-[58%]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden>
        <path d="M4 7.5 12 13l8-5.5M5 6h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
      </svg>
    </span>
  );
}
