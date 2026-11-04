import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useT } from '@/lib/i18n';
import { composeMessages } from '@/lib/i18n/messages/compose';
import { onComposeRequest, type ComposeRequest } from '@/lib/mail-api';
import type { ComposerWin } from './types';

// The editor (Tiptap) is only downloaded when a composer opens, or when the browser is idle.
const loadWindow = () => import('./ComposerWindow');
const ComposerWindow = lazy(loadWindow);

const keyOf = (r: ComposeRequest) =>
  r.mode === 'new'
    ? undefined
    : r.mode === 'draft'
      ? r.draftUid
        ? `draft|${r.mailbox}|${r.draftUid}`
        : undefined
      : `${r.mode}|${r.mailbox}|${r.folder}|${r.message.uid}`;

// How many windows fit side by side (docked on desktop, one at a time on phones).
const maxExpanded = () => {
  const w = window.innerWidth;
  return w < 768 ? 1 : Math.max(1, Math.min(3, Math.floor((w - 260) / 528)));
};

// Minimize the oldest expanded windows until the rest fit.
function fit(list: ComposerWin[], keepId: string): ComposerWin[] {
  const expanded = list.filter((w) => !w.minimized && w.id !== keepId);
  let extra = expanded.length + 1 - maxExpanded();
  const toMinimize = new Set<string>();
  for (const w of expanded) if (extra-- > 0) toMinimize.add(w.id);
  return list.map((w) => (toMinimize.has(w.id) ? { ...w, minimized: true, maximized: false } : w));
}

let nextId = 0;

// Renders the composer windows. Mount once inside the app shell.
export function ComposerHost() {
  const [wins, setWinsState] = useState<ComposerWin[]>([]);
  const winsRef = useRef(wins);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [linkHandlers] = useState(() => new Map<string, () => void>());

  const setWins = (next: ComposerWin[]) => {
    winsRef.current = next;
    setWinsState(next);
  };

  useEffect(
    () =>
      onComposeRequest((request) => {
        const list = winsRef.current;
        const key = keyOf(request);
        const existing = key ? list.find((w) => w.key === key) : undefined;
        if (existing) {
          setWins(
            fit(
              list.map((w) => (w.id === existing.id ? { ...w, minimized: false, focusTick: w.focusTick + 1 } : w)),
              existing.id
            )
          );
          setActiveId(existing.id);
          return;
        }
        const win: ComposerWin = { id: `composer-${++nextId}`, key, request, minimized: false, maximized: false, focusTick: 0 };
        setWins(fit([...list.map((w) => ({ ...w, maximized: false })), win], win.id));
        setActiveId(win.id);
      }),
    []
  );

  // Prefetch the composer chunk once the page has settled.
  useEffect(() => {
    const id = window.setTimeout(() => void loadWindow().catch(() => {}), 5000);
    return () => window.clearTimeout(id);
  }, []);

  // ⌘K inside a composer inserts a link instead of opening the command palette.
  // Registered before the shell's own capture listener (children's effects run first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k' || !(e.target instanceof Element)) return;
      const el = e.target.closest<HTMLElement>('[data-composer-id]');
      if (!el) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.target.closest('.composer-prose')) linkHandlers.get(el.dataset.composerId ?? '')?.();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [linkHandlers]);

  const close = (id: string) => {
    const next = winsRef.current.filter((w) => w.id !== id);
    setWins(next);
    setActiveId((a) => (a === id ? (next.at(-1)?.id ?? null) : a));
  };

  const patch = (id: string, change: Partial<Pick<ComposerWin, 'minimized' | 'maximized'>>) => {
    let next = winsRef.current.map((w) => (w.id === id ? { ...w, ...change } : change.maximized ? { ...w, maximized: false } : w));
    if (change.minimized === false) next = fit(next, id);
    if (change.minimized === false || change.maximized) setActiveId(id);
    setWins(next);
  };

  if (!wins.length) return null;
  const hasMaximized = wins.some((w) => w.maximized && !w.minimized);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="pointer-events-none fixed bottom-0 right-0 z-40 flex max-w-full flex-row-reverse items-end gap-2 px-2 md:right-4 md:gap-3 md:px-0">
        {hasMaximized && (
          <div
            aria-hidden
            className="pointer-events-auto fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] max-md:hidden"
            onClick={() => setWins(winsRef.current.map((w) => ({ ...w, maximized: false })))}
          />
        )}
        {wins.map((win) => (
          <Suspense key={win.id} fallback={<LoadingWindow />}>
            <ComposerWindow win={win} active={win.id === activeId} onClose={close} onPatch={patch} onActivate={setActiveId} linkHandlers={linkHandlers} />
          </Suspense>
        ))}
      </div>
    </TooltipProvider>
  );
}

function LoadingWindow() {
  const t = useT(composeMessages);
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex flex-col overflow-hidden border bg-popover shadow-2xl md:static md:h-[min(38rem,calc(100dvh-5rem))] md:w-[32rem] md:rounded-t-xl">
      <div className="flex h-10 items-center bg-muted/70 px-3 text-sm font-medium">{t('newMessage')}</div>
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    </div>
  );
}
