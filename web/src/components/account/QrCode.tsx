import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

// A QR code drawn as one SVG path. The encoder (uqr, ~10 kB) loads on first use.
// Always dark on white, which every scanner reads, in both themes.
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const [path, setPath] = useState<{ d: string; size: number } | null>(null);

  useEffect(() => {
    let alive = true;
    import('uqr').then(({ encode }) => {
      if (!alive) return;
      const { data, size } = encode(value, { ecc: 'M', border: 2 });
      let d = '';
      data.forEach((row, y) => row.forEach((on, x) => on && (d += `M${x} ${y}h1v1h-1z`)));
      setPath({ d, size });
    });
    return () => {
      alive = false;
    };
  }, [value]);

  if (!path) return <Skeleton className={cn('size-44 rounded-lg', className)} />;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${path.size} ${path.size}`}
      shapeRendering="crispEdges"
      className={cn('size-44 rounded-lg border bg-white', className)}
    >
      <path d={path.d} fill="#111" />
    </svg>
  );
}
