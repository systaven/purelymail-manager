import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { DefaultsTab } from '@/components/members/DefaultsTab';
import { MembersTab } from '@/components/members/MembersTab';
import { RequestsTab } from '@/components/members/RequestsTab';
import { useT } from '@/lib/i18n';
import { membersMessages } from '@/lib/i18n/messages/members';
import { memberKeys, membersApi } from '@/lib/members-api';
import { cn } from '@/lib/utils';

const TABS = ['members', 'requests', 'defaults'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL = { members: 'tabMembers', requests: 'tabRequests', defaults: 'tabDefaults' } as const;

export default function MembersPage() {
  const t = useT(membersMessages);
  const [params, setParams] = useSearchParams();
  // ?tab=requests lets other pages link straight to a tab.
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'members';
  const setTab = (next: Tab) => setParams(next === 'members' ? {} : { tab: next }, { replace: true });

  const pending = useQuery({ queryKey: memberKeys.requests('pending'), queryFn: () => membersApi.requests('pending') });
  const pendingCount = pending.data?.length ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader title={t('title')} description={t('description')} />

      <div role="tablist" aria-label={t('title')} className="-mt-1 mb-6 flex gap-1 border-b">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'relative -mb-px inline-flex h-10 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
              tab === id && 'border-primary text-foreground'
            )}
          >
            {t(TAB_LABEL[id])}
            {id === 'requests' && pendingCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'members' && <MembersTab />}
        {tab === 'requests' && <RequestsTab pendingCount={pendingCount} />}
        {tab === 'defaults' && <DefaultsTab />}
      </div>
    </div>
  );
}
