import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  danger?: boolean;
}

// How far below the top of the scroller a section's heading has to be before
// it counts as the one being read.
const OFFSET = 140;

// Which section is on screen, following the app's scrolling <main>.
export function useScrollSpy(ids: string[], rootRef: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(ids[0]);
  // After a click, keep the clicked section highlighted until the smooth
  // scroll settles (it may not reach the top if the page ends first).
  const lock = useRef<{ id: string; until: number } | null>(null);
  const key = ids.join('|');

  useEffect(() => {
    const scroller = rootRef.current?.closest('main') ?? document.scrollingElement;
    if (!scroller) return;
    const update = () => {
      if (lock.current && Date.now() < lock.current.until) return;
      lock.current = null;
      const top = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - top <= OFFSET) current = id;
      }
      if (scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) current = ids[ids.length - 1];
      setActive(current);
    };
    const release = () => {
      if (lock.current) lock.current.until = 0;
    };
    update();
    const target = scroller === document.scrollingElement ? window : scroller;
    target.addEventListener('scroll', update, { passive: true });
    target.addEventListener('scrollend', release);
    window.addEventListener('resize', update);
    return () => {
      target.removeEventListener('scroll', update);
      target.removeEventListener('scrollend', release);
      window.removeEventListener('resize', update);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const jump = useCallback((id: string) => {
    lock.current = { id, until: Date.now() + 1200 };
    setActive(id);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
  }, []);

  return [active, jump] as const;
}

// Left column on desktop (sticky); a sticky, horizontally scrolling strip on phones.
export function SectionNav({ sections, active, onJump, label }: { sections: NavSection[]; active: string; onJump: (id: string) => void; label: string }) {
  const stripRef = useRef<HTMLDivElement>(null);

  // Keep the active chip visible in the phone strip.
  useEffect(() => {
    const strip = stripRef.current;
    const chip = strip?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (!strip || !chip || strip.scrollWidth <= strip.clientWidth) return;
    const left = chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2;
    strip.scrollTo({ left, behavior: 'smooth' });
  }, [active]);

  const link = (s: NavSection, variant: 'side' | 'chip') => {
    const isActive = s.id === active;
    return (
      <a
        key={s.id}
        href={`#${s.id}`}
        data-id={s.id}
        aria-current={isActive ? 'true' : undefined}
        onClick={(e) => {
          e.preventDefault();
          onJump(s.id);
        }}
        className={cn(
          variant === 'side'
            ? 'group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
            : 'flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-background px-3 text-[13px] font-medium text-muted-foreground transition-colors',
          variant === 'side' && isActive && 'bg-accent text-foreground',
          variant === 'chip' && isActive && 'border-primary/30 bg-primary/10 text-primary',
          s.danger && isActive && variant === 'side' && 'text-destructive'
        )}
      >
        <s.icon
          className={cn(
            'size-4 shrink-0',
            variant === 'chip' && 'size-3.5',
            variant === 'side' && (isActive ? (s.danger ? 'text-destructive' : 'text-primary') : 'text-muted-foreground group-hover:text-foreground')
          )}
        />
        <span className="truncate">{s.label}</span>
      </a>
    );
  };

  return (
    <>
      <nav aria-label={label} className="sticky top-0 z-10 -mx-4 mb-6 border-b bg-background/85 backdrop-blur-md sm:-mx-8 lg:hidden">
        <div ref={stripRef} className="flex gap-1.5 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] sm:px-8 [&::-webkit-scrollbar]:hidden">
          {sections.map((s) => link(s, 'chip'))}
        </div>
      </nav>
      <nav aria-label={label} className="sticky top-10 hidden self-start lg:block">
        <div className="space-y-0.5">{sections.map((s) => link(s, 'side'))}</div>
      </nav>
    </>
  );
}
