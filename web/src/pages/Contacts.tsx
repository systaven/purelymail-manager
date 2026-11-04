import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, UserRound } from 'lucide-react';
import { Dialog as DrawerPrimitive } from 'radix-ui';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ContactDetails, DetailsPlaceholder } from '@/components/contacts/ContactDetails';
import { ContactEditor } from '@/components/contacts/ContactEditor';
import { ContactList } from '@/components/contacts/ContactList';
import { ShortcutsDialog } from '@/components/contacts/ShortcutsDialog';
import { Sidebar, type View } from '@/components/contacts/Sidebar';
import { displayName, downloadVCards, groupCounts, isTyping, matches, overlayOpen, searchText, sortContacts } from '@/components/contacts/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { EmptyState, ErrorBanner } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/misc';
import { davApi, davKeys, type Contact } from '@/lib/dav-api';
import { useLocale, useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { contactsMessages } from '@/lib/i18n/messages/contacts';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { openComposer } from '@/lib/mail-api';
import { useActiveMailbox } from '@/lib/use-mailbox';
import { cn } from '@/lib/utils';

export default function ContactsPage() {
  const t = useT(contactsMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const { mailbox, mailboxes, query } = useActiveMailbox();

  if (query.error) {
    return (
      <div className="p-4">
        <ErrorBanner message={errorText(query.error)} onRetry={() => query.refetch()} retryLabel={tc('retry')} />
      </div>
    );
  }
  if (query.isPending) {
    return (
      <div className="flex h-full">
        <div className="hidden w-[220px] shrink-0 space-y-2 border-r bg-sidebar p-3 lg:block">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-7" />
          ))}
        </div>
        <div className="w-full space-y-3 border-r p-4 md:w-[340px]">
          <Skeleton className="h-9" />
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!mailbox) {
    return (
      <div className="mx-auto max-w-lg p-6 pt-16">
        <EmptyState
          icon={UserRound}
          title={t('noMailbox')}
          description={t('noMailboxBody')}
          action={
            <Link to="/mailboxes" className={buttonVariants({ variant: 'outline' })}>
              {t('goToMailboxes')}
            </Link>
          }
        />
      </div>
    );
  }
  return <ContactsView key={mailbox} mailbox={mailbox} mailboxes={mailboxes} />;
}

type Editing = { contact: Contact | null } | null;

function ContactsView({ mailbox, mailboxes }: { mailbox: string; mailboxes: string[] }) {
  const t = useT(contactsMessages);
  const tc = useT(commonMessages);
  const { locale } = useLocale();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const errorText = useErrorText();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [wide, setWide] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // True when the open contact was pushed onto history, so closing can go back.
  const pushedOpen = useRef(false);

  const open = params.get('c');
  const groupParam = params.get('group');
  const bookParam = params.get('book');
  const view: View = groupParam ? { kind: 'group', name: groupParam } : bookParam ? { kind: 'book', href: bookParam } : { kind: 'all' };

  const books = useQuery({ queryKey: davKeys.addressBooks(mailbox), queryFn: () => davApi.addressBooks(mailbox), staleTime: 5 * 60_000 });
  const contacts = useQuery({ queryKey: davKeys.contacts(mailbox), queryFn: () => davApi.contacts(mailbox), staleTime: 60_000 });
  const all = useMemo(() => contacts.data ?? [], [contacts.data]);
  const bookList = useMemo(() => books.data ?? [], [books.data]);

  // Whether list and details sit side by side (container ≥ 48rem, like @3xl).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= 768));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const update = useCallback(
    (patch: Record<string, string | null>, replace = false) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace }
      ),
    [setParams]
  );

  // --- Derived lists ----------------------------------------------------------------

  const haystacks = useMemo(() => new Map(all.map((c) => [c.href, searchText(c)])), [all]);
  const groups = useMemo(() => groupCounts(all, locale), [all, locale]);
  const bookCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of all) m.set(c.addressBook, (m.get(c.addressBook) ?? 0) + 1);
    return m;
  }, [all]);
  const inView = useMemo(
    () => all.filter((c) => (groupParam ? c.groups.includes(groupParam) : bookParam ? c.addressBook === bookParam : true)),
    [all, groupParam, bookParam]
  );
  const sections = useMemo(() => {
    const filtered = q.trim() ? inView.filter((c) => matches(c, haystacks.get(c.href) ?? '', q)) : inView;
    return sortContacts(filtered, locale);
  }, [inView, q, haystacks, locale]);
  const flat = useMemo(() => sections.flatMap((s) => s.contacts), [sections]);
  const selected = open ? all.find((c) => c.href === open) : undefined;

  const title = view.kind === 'group' ? view.name : view.kind === 'book' ? (bookList.find((b) => b.href === view.href)?.name ?? t('addressBook')) : t('allContacts');

  // The open contact is gone (deleted elsewhere): back to the list.
  useEffect(() => {
    if (open && contacts.isSuccess && !contacts.isFetching && !selected) update({ c: null }, true);
  }, [open, contacts.isSuccess, contacts.isFetching, selected, update]);

  useEffect(() => {
    if (!open) pushedOpen.current = false;
  }, [open]);

  // --- Navigation -----------------------------------------------------------------

  const openContact = useCallback(
    (c: Contact) => {
      if (open) update({ c: c.href }, true);
      else {
        pushedOpen.current = true;
        update({ c: c.href });
      }
    },
    [open, update]
  );

  const closeContact = useCallback(() => {
    if (pushedOpen.current) {
      pushedOpen.current = false;
      navigate(-1);
    } else update({ c: null }, true);
  }, [navigate, update]);

  const selectView = (next: View) => {
    setDrawer(false);
    setQ('');
    update({ group: next.kind === 'group' ? next.name : null, book: next.kind === 'book' ? next.href : null });
  };

  const step = (delta: 1 | -1) => {
    if (!flat.length) return;
    const index = open ? flat.findIndex((c) => c.href === open) : -1;
    const next = flat[index === -1 ? (delta === 1 ? 0 : flat.length - 1) : Math.min(flat.length - 1, Math.max(0, index + delta))];
    if (next && next.href !== open) openContact(next);
  };

  const newContact = () => {
    setDrawer(false);
    if (!bookList.length) return;
    setEditing({ contact: null });
  };
  const defaultBook = view.kind === 'book' ? view.href : (bookList.find((b) => b.href === selected?.addressBook)?.href ?? bookList[0]?.href ?? '');

  const email = useCallback((address: string) => openComposer({ mode: 'new', mailbox, to: [address] }), [mailbox]);

  const remove = useCallback(
    async (contact: Contact) => {
      const name = displayName(contact) || t('noName');
      const ok = await confirm({ title: t('deleteTitle', { name }), description: t('deleteBody'), confirmLabel: t('delete'), cancelLabel: tc('cancel'), destructive: true });
      if (!ok) return;
      const key = davKeys.contacts(mailbox);
      const before = qc.getQueryData<Contact[]>(key);
      // Move on to the neighbour (side by side) or back to the list (phones).
      if (open === contact.href) {
        const index = flat.findIndex((c) => c.href === contact.href);
        const neighbour = flat[index + 1] ?? flat[index - 1];
        if (wide && neighbour) update({ c: neighbour.href }, true);
        else closeContact();
      }
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData<Contact[]>(key, (old) => old?.filter((c) => c.href !== contact.href));
      try {
        await davApi.deleteContact(mailbox, contact);
        toast.success(t('deleted', { name }));
      } catch (error) {
        qc.setQueryData(key, before);
        toast.error(errorText(error));
      } finally {
        qc.invalidateQueries({ queryKey: key });
      }
    },
    [confirm, t, tc, mailbox, qc, open, flat, wide, update, closeContact, errorText]
  );

  // --- Keyboard -------------------------------------------------------------------

  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  const afterG = useRef(0);
  keys.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || overlayOpen() || editing) return;
    // "g" + letter belongs to the app shell's navigation.
    if (e.key === 'g') return void (afterG.current = Date.now());
    if (Date.now() - afterG.current < 1200) return void (afterG.current = 0);
    // Enter on a focused button or link activates it.
    if (e.key === 'Enter' && (e.target as HTMLElement).closest?.('button, a, [role="button"]')) return;
    const handlers: Record<string, () => void> = {
      j: () => step(1),
      k: () => step(-1),
      ArrowDown: () => step(1),
      ArrowUp: () => step(-1),
      Enter: () => (selected ? undefined : flat[0] && openContact(flat[0])),
      o: () => (selected ? undefined : flat[0] && openContact(flat[0])),
      Escape: () => (open ? closeContact() : q ? setQ('') : undefined),
      e: () => selected && setEditing({ contact: selected }),
      c: newContact,
      n: newContact,
      '#': () => selected && remove(selected),
      Delete: () => selected && remove(selected),
      '/': () => searchRef.current?.focus(),
      '?': () => setHelp(true),
    };
    const handler = handlers[e.key];
    if (!handler) return;
    e.preventDefault();
    handler();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- Layout ---------------------------------------------------------------------

  const sidebar = (
    <Sidebar
      mailbox={mailbox}
      mailboxes={mailboxes}
      onMailbox={(m) => {
        setDrawer(false);
        setParams({ mailbox: m });
      }}
      books={bookList}
      bookCounts={bookCounts}
      groups={groups}
      total={all.length}
      view={view}
      onView={selectView}
      onNew={newContact}
      loading={contacts.isPending}
    />
  );

  const showDetails = Boolean(selected);
  const bookName = bookList.length > 1 && selected ? (bookList.find((b) => b.href === selected.addressBook)?.name ?? null) : null;

  return (
    <div ref={rootRef} className="@container relative h-full overflow-hidden">
      <div className="flex h-full">
        <aside className="hidden w-[220px] shrink-0 border-r bg-sidebar @5xl:block">{sidebar}</aside>

        <section
          className={cn(
            'min-w-0 flex-col border-r bg-background @3xl:w-[320px] @3xl:flex-none @5xl:w-[340px] @7xl:w-[380px]',
            showDetails ? 'hidden @3xl:flex' : 'flex flex-1'
          )}
        >
          <ContactList
            title={title}
            sections={sections}
            total={inView.length}
            q={q}
            onSearch={setQ}
            onSearchDone={() => flat[0] && !selected && wide && openContact(flat[0])}
            searchRef={searchRef}
            selected={open}
            onOpen={openContact}
            onNew={newContact}
            onOpenNav={() => setDrawer(true)}
            onExport={() => downloadVCards(flat, title)}
            loading={contacts.isPending}
            error={contacts.error}
            refetch={() => {
              contacts.refetch();
              books.refetch();
            }}
            refreshing={contacts.isRefetching}
            isGroup={view.kind !== 'all'}
          />
        </section>

        <section className={cn('min-w-0 flex-1 flex-col bg-background', showDetails ? 'flex' : 'hidden @3xl:flex')}>
          {selected ? (
            <ContactDetails
              key={selected.href}
              contact={selected}
              bookName={bookName}
              onBack={closeContact}
              onEdit={() => setEditing({ contact: selected })}
              onDelete={() => remove(selected)}
              onEmail={email}
              onGroup={(g) => selectView({ kind: 'group', name: g })}
            />
          ) : contacts.isPending ? (
            open && (
              <div className="flex flex-col items-center gap-3 pt-16" aria-hidden>
                <Skeleton className="size-24 rounded-full" />
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            )
          ) : (
            <DetailsPlaceholder hasContacts={flat.length > 0} />
          )}
        </section>
      </div>

      {/* Groups as a drawer when there is no room for the column. */}
      <DrawerPrimitive.Root open={drawer} onOpenChange={setDrawer}>
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <DrawerPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r bg-sidebar shadow-xl outline-none data-[state=open]:animate-in"
          >
            <DrawerPrimitive.Title className="sr-only">{t('browse')}</DrawerPrimitive.Title>
            {sidebar}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>

      {!showDetails && bookList.length > 0 && (
        <Button size="icon" className="absolute bottom-5 right-5 z-20 size-14 rounded-2xl shadow-lg @3xl:hidden [&_svg]:size-6" onClick={newContact} aria-label={t('newContact')}>
          <UserPlus />
        </Button>
      )}

      {editing && (
        <ContactEditor
          key={editing.contact?.href ?? 'new'}
          mailbox={mailbox}
          contact={editing.contact}
          books={bookList}
          defaultBook={defaultBook}
          defaultGroup={view.kind === 'group' ? view.name : null}
          knownGroups={groups.map((g) => g.name)}
          onClose={() => setEditing(null)}
          onSaved={(href) => {
            setEditing(null);
            if (href !== open) openContact({ href } as Contact);
          }}
        />
      )}

      <ShortcutsDialog open={help} onOpenChange={setHelp} />
    </div>
  );
}
