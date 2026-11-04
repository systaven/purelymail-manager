import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Globe, Plus, Route, Search, SearchX } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { AddressTester } from '@/components/routing/AddressTester';
import { RuleEditor, type EditorTarget } from '@/components/routing/RuleEditor';
import { RuleRow } from '@/components/routing/RuleRow';
import { rulePattern, sortRules, testAddress } from '@/components/routing/rules';
import { Button, buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { EmptyState, ErrorBanner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Kbd, Skeleton } from '@/components/ui/misc';
import { adminApi, adminKeys, type RoutingRule } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { routingMessages } from '@/lib/i18n/messages/routing';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { useAction } from '@/lib/mutation';

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
};

export default function RoutingPage() {
  const t = useT(routingMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<number, HTMLLIElement>());

  const rulesQuery = useQuery({ queryKey: adminKeys.routing, queryFn: adminApi.routing });
  const domainsQuery = useQuery({ queryKey: adminKeys.domains, queryFn: adminApi.domains });
  const mailboxesQuery = useQuery({ queryKey: adminKeys.mailboxes, queryFn: adminApi.mailboxes });
  const rules = useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);
  const mailboxes = useMemo(() => mailboxesQuery.data ?? [], [mailboxesQuery.data]);

  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [testValue, setTestValue] = useState('');
  const [editor, setEditor] = useState<{ open: boolean; key: number; target: EditorTarget }>({ open: false, key: 0, target: {} });

  const mailboxSet = useMemo(() => new Set(mailboxes.map((m) => m.address.toLowerCase())), [mailboxes]);
  const isInternal = useCallback((address: string) => mailboxSet.has(address.toLowerCase()), [mailboxSet]);
  // Domains on the account plus any that only appear in rules.
  const domains = useMemo(
    () => [...new Set([...(domainsQuery.data ?? []).filter((d) => !d.isShared).map((d) => d.name), ...rules.map((r) => r.domainName)])].sort(),
    [domainsQuery.data, rules]
  );

  const openEditor = useCallback((target: EditorTarget = {}) => setEditor((e) => ({ open: true, key: e.key + 1, target })), []);

  // /routing?new=1 (e.g. from the overview's quick actions) opens the editor.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    openEditor();
    setSearchParams(
      (prev) => {
        prev.delete('new');
        return prev;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams, openEditor]);

  // "/" focuses search, "c" creates a rule.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || isTyping(e.target)) return;
      if (editor.open || document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'c') {
        e.preventDefault();
        openEditor(domainFilter ? { rule: { domainName: domainFilter } } : {});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor.open, openEditor, domainFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter(
      (r) =>
        (!domainFilter || r.domainName === domainFilter) &&
        (!q || rulePattern(r).includes(q) || r.targetAddresses.some((a) => a.toLowerCase().includes(q)))
    );
  }, [rules, search, domainFilter]);

  const groups = useMemo(() => {
    const byDomain = new Map<string, RoutingRule[]>();
    for (const r of filtered) byDomain.set(r.domainName, [...(byDomain.get(r.domainName) ?? []), r]);
    return [...byDomain.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([domain, list]) => ({ domain, rules: sortRules(list) }));
  }, [filtered]);

  const testResult = useMemo(
    () => testAddress(testValue, rules, mailboxSet, new Set(domains)),
    [testValue, rules, mailboxSet, domains]
  );
  const matchedId = testResult?.type === 'rule' ? testResult.rule.id : undefined;
  useEffect(() => {
    if (matchedId !== undefined) rowRefs.current.get(matchedId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [matchedId]);

  const remove = useAction(adminApi.deleteRule, { success: t('deleted'), invalidate: [adminKeys.routing, adminKeys.overview] });
  const askDelete = async (rule: RoutingRule) => {
    const ok = await confirm({
      title: t('deleteTitle'),
      description: t('deleteBody', { pattern: rulePattern(rule), targets: rule.targetAddresses.join(', ') }),
      confirmLabel: t('deleteConfirm'),
      cancelLabel: tc('cancel'),
      destructive: true,
    });
    if (ok) remove.mutate(rule.id);
  };
  const ruleFields = ({ id: _id, ...rest }: RoutingRule) => rest;

  const count = rules.length === 1 ? t('countOne') : t('countMany', { n: rules.length });
  const filtering = Boolean(search.trim() || domainFilter);
  const loading = rulesQuery.isPending;
  const noDomains = !loading && !domainsQuery.isPending && domains.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Button onClick={() => openEditor(domainFilter ? { rule: { domainName: domainFilter } } : {})} disabled={noDomains}>
            <Plus /> {t('newRule')}
            <Kbd className="hidden border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground sm:inline-flex">C</Kbd>
          </Button>
        }
      />

      {rulesQuery.isError && (
        <div className="mb-6">
          <ErrorBanner message={`${t('loadFailed')} ${errorText(rulesQuery.error)}`} onRetry={() => rulesQuery.refetch()} retryLabel={tc('retry')} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-[1_1_14rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && (setSearch(''), e.currentTarget.blur())}
                placeholder={t('searchPlaceholder')}
                aria-label={tc('search')}
                className="pl-9 pr-9"
              />
              <Kbd className="absolute right-2.5 top-1/2 hidden -translate-y-1/2 sm:inline-flex">/</Kbd>
            </div>
            <select
              aria-label={t('filterDomain')}
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="h-9 min-w-0 max-w-full flex-[0_1_12rem] truncate rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-primary focus-visible:ring-3"
            >
              <option value="">{t('allDomains')}</option>
              {domains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            {!loading && !rulesQuery.isError && (
              <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {filtering ? t('countFiltered', { shown: filtered.length, total: rules.length }) : count}
              </span>
            )}
          </div>

          {loading ? (
            <ListSkeleton />
          ) : rulesQuery.isError ? null : noDomains && !rules.length ? (
            <EmptyState
              icon={Globe}
              title={t('noDomainsTitle')}
              description={t('noDomainsBody')}
              action={
                <Link to="/domains" className={buttonVariants({ variant: 'outline' })}>
                  {t('goToDomains')}
                </Link>
              }
            />
          ) : !rules.length ? (
            <EmptyState
              icon={Route}
              title={t('emptyTitle')}
              description={t('emptyBody')}
              action={
                <Button onClick={() => openEditor()}>
                  <Plus /> {t('newRule')}
                </Button>
              }
            />
          ) : !groups.length ? (
            <EmptyState
              icon={SearchX}
              title={t('noMatchesTitle')}
              description={t('noMatchesBody')}
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setDomainFilter('');
                  }}
                >
                  {t('clearFilters')}
                </Button>
              }
            />
          ) : (
            groups.map(({ domain, rules: list }) => (
              <section key={domain} className="overflow-hidden rounded-xl border bg-card shadow-xs">
                <header className="flex items-center gap-2 border-b bg-muted/40 py-1.5 pl-3 pr-1.5 sm:pl-4">
                  <Globe className="size-4 shrink-0 text-muted-foreground" />
                  <h2 className="min-w-0 truncate text-sm font-semibold">{domain}</h2>
                  <span className="rounded-full bg-secondary px-1.5 text-xs font-medium tabular-nums text-muted-foreground">{list.length}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto text-muted-foreground"
                    aria-label={t('addRuleFor', { domain })}
                    title={t('addRuleFor', { domain })}
                    onClick={() => openEditor({ rule: { domainName: domain } })}
                  >
                    <Plus />
                  </Button>
                </header>
                <ul className="divide-y">
                  {list.map((rule) => (
                    <RuleRow
                      key={rule.id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(rule.id, el);
                        else rowRefs.current.delete(rule.id);
                      }}
                      rule={rule}
                      isInternal={isInternal}
                      highlighted={rule.id === matchedId}
                      onEdit={() => openEditor({ id: rule.id, rule: ruleFields(rule) })}
                      onDuplicate={() => openEditor({ rule: ruleFields(rule) })}
                      onDelete={() => void askDelete(rule)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <aside className="order-first lg:sticky lg:top-6 lg:order-none">
          <AddressTester value={testValue} onChange={setTestValue} result={testResult} isInternal={isInternal} />
        </aside>
      </div>

      <RuleEditor
        key={editor.key}
        open={editor.open}
        onOpenChange={(open) => setEditor((e) => ({ ...e, open }))}
        target={editor.target}
        domains={domains}
        mailboxes={mailboxes}
        rules={rules}
      />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b bg-muted/40 px-4 py-2.5">
        <Skeleton className="h-4 w-32" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-2 border-b px-4 py-3.5 last:border-0">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="hidden h-6 w-44 sm:block" />
        </div>
      ))}
    </div>
  );
}
