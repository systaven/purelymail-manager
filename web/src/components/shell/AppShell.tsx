import { useEffect, useRef, useState } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/misc';
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { shellMessages } from '@/lib/i18n/messages/shell';
import { useBrand, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { CommandPalette } from './CommandPalette';
import { Logo } from './Logo';
import { adminNav, appNav, memberNav, type NavItem } from './nav';
import { UserMenu } from './UserMenu';

const COLLAPSE_KEY = 'sidebar-collapsed';
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
};

function SidebarContent({
  collapsed,
  onToggleCollapse,
  onSearch,
}: {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onSearch: () => void;
}) {
  const t = useT(shellMessages);
  const tc = useT(commonMessages);
  const { isAdmin } = useSession();
  const brand = useBrand();

  const link = (item: NavItem) => {
    const content = (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === '/'}
        className={({ isActive }) =>
          cn(
            'group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent',
            isActive && 'bg-sidebar-accent text-foreground',
            collapsed && 'justify-center px-0'
          )
        }
      >
        {({ isActive }) => (
          <>
            <item.icon className={cn('size-4 shrink-0 text-muted-foreground group-hover:text-foreground', isActive && 'text-primary group-hover:text-primary')} />
            {!collapsed && <span className="truncate">{t(item.label)}</span>}
          </>
        )}
      </NavLink>
    );
    return collapsed ? (
      <Tooltip key={item.to} content={t(item.label)}>
        {content}
      </Tooltip>
    ) : (
      content
    );
  };

  const section = (title: string | null, items: NavItem[]) => (
    <div className="space-y-0.5">
      {title && !collapsed && <div className="px-2 pb-1 pt-4 text-xs font-medium text-muted-foreground">{title}</div>}
      {title && collapsed && <div className="mx-2 my-3 h-px bg-border" />}
      {items.map(link)}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-14 shrink-0 items-center gap-2 px-3', collapsed && 'justify-center px-0')}>
        <Logo />
        {!collapsed && <span className="flex-1 truncate font-semibold tracking-tight">{brand.name}</span>}
        {onToggleCollapse && !collapsed && (
          <Button variant="ghost" size="icon-sm" onClick={onToggleCollapse} aria-label={t('collapse')} className="text-muted-foreground">
            <PanelLeftClose />
          </Button>
        )}
      </div>

      <div className={cn('px-3 pb-2', collapsed && 'px-2')}>
        <button
          onClick={onSearch}
          className={cn(
            'flex h-8 w-full items-center gap-2 rounded-md border bg-background px-2 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent',
            collapsed && 'justify-center px-0'
          )}
          aria-label={t('searchOrJump')}
        >
          <Search className="size-4" />
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-left">{tc('search')}</span>
              <Kbd>{isMac ? '⌘' : 'Ctrl'}K</Kbd>
            </>
          )}
        </button>
      </div>

      <nav className={cn('flex-1 overflow-y-auto px-3 pb-3', collapsed && 'px-2')}>
        {section(null, appNav)}
        {!isAdmin && section(null, memberNav)}
        {isAdmin && section(t('admin'), adminNav)}
      </nav>

      <div className={cn('shrink-0 border-t p-2', collapsed && 'flex flex-col items-center gap-1')}>
        {onToggleCollapse && collapsed && (
          <Button variant="ghost" size="icon-sm" onClick={onToggleCollapse} aria-label={t('expand')} className="text-muted-foreground">
            <PanelLeftOpen />
          </Button>
        )}
        <UserMenu collapsed={collapsed} />
      </div>
    </div>
  );
}

export function AppShell() {
  const t = useT(shellMessages);
  const { isAdmin } = useSession();
  const brand = useBrand();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pendingGo = useRef<number | null>(null);
  const nav = [...appNav, ...(isAdmin ? adminNav : memberNav)];

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const toggleCollapse = () => {
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, value ? '0' : '1');
      } catch {
        // Not remembered.
      }
      return !value;
    });
  };

  // ⌘K / Ctrl+K opens the palette; "g" then a letter jumps to a page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || paletteOpen) return;
      if (pendingGo.current !== null) {
        window.clearTimeout(pendingGo.current);
        pendingGo.current = null;
        const target = nav.find((item) => item.goKey === e.key.toLowerCase());
        if (target) {
          e.preventDefault();
          // Pages have their own single-key shortcuts (c = create...); this key was ours.
          e.stopImmediatePropagation();
          navigate(target.to);
        }
        return;
      }
      if (e.key === 'g') pendingGo.current = window.setTimeout(() => (pendingGo.current = null), 1200);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const current = nav.find((item) => (item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)));

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh overflow-hidden bg-background">
        <aside
          className={cn(
            'hidden shrink-0 border-r bg-sidebar transition-[width] duration-200 md:block',
            collapsed ? 'w-14' : 'w-60'
          )}
        >
          <SidebarContent collapsed={collapsed} onToggleCollapse={toggleCollapse} onSearch={() => setPaletteOpen(true)} />
        </aside>

        <SheetPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetPrimitive.Portal>
            <SheetPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 md:hidden" />
            <SheetPrimitive.Content
              aria-describedby={undefined}
              className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r bg-sidebar shadow-xl md:hidden"
            >
              <SheetPrimitive.Title className="sr-only">{brand.name}</SheetPrimitive.Title>
              <SidebarContent collapsed={false} onSearch={() => setPaletteOpen(true)} />
            </SheetPrimitive.Content>
          </SheetPrimitive.Portal>
        </SheetPrimitive.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-2 md:hidden">
            <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(true)} aria-label={t('openMenu')}>
              <Menu />
            </Button>
            <span className="flex-1 truncate font-semibold">{current ? t(current.label) : brand.name}</span>
            <Button variant="ghost" size="icon" onClick={() => setPaletteOpen(true)} aria-label={t('searchOrJump')}>
              <Search />
            </Button>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} nav={nav} />
    </TooltipProvider>
  );
}
