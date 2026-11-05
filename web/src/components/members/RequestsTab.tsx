import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Inbox, Mail, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { EmptyState, ErrorBanner } from '@/components/ui/feedback';
import { Avatar, Badge, Skeleton } from '@/components/ui/misc';
import { adminKeys } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { membersMessages } from '@/lib/i18n/messages/members';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { memberKeys, memberLabel, membersApi, type MailboxRequest, type RequestStatus } from '@/lib/members-api';
import { useAction } from '@/lib/mutation';
import { cn } from '@/lib/utils';
import { Segmented, useDateFormat, useRelativeTime } from './shared';

const STATUSES: RequestStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];
const EMPTY = { pending: 'emptyPending', approved: 'emptyApproved', rejected: 'emptyRejected', cancelled: 'emptyCancelled' } as const;
const TONE: Record<RequestStatus, string> = {
  pending: 'bg-warning/15 text-foreground',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  cancelled: '',
};

function RequestCard({ request }: { request: MailboxRequest }) {
  const t = useT(membersMessages);
  const tc = useT(commonMessages);
  const confirm = useConfirm();
  const relative = useRelativeTime();
  const formatDate = useDateFormat();
  const member = memberLabel(request);
  const mailbox = request.mailbox;

  const decide = useAction((decision: 'approve' | 'reject') => membersApi.decide(request.id, decision).then(() => decision), {
    success: (decision) => (decision === 'approve' ? t('approvedToast', { mailbox }) : t('rejectedToast')),
    invalidate: [memberKeys.allRequests, memberKeys.members, adminKeys.mailboxes, adminKeys.overview],
  });

  const ask = async (decision: 'approve' | 'reject') => {
    const approve = decision === 'approve';
    const ok = await confirm({
      title: t(approve ? 'approveTitle' : 'rejectTitle', { mailbox }),
      description: t(approve ? 'approveBody' : 'rejectBody', { member }),
      confirmLabel: t(approve ? 'approveConfirm' : 'reject'),
      cancelLabel: tc('cancel'),
      destructive: !approve,
    });
    if (ok) decide.mutate(decision);
  };

  const pending = request.status === 'pending';
  const time = pending ? request.createdAt : (request.decidedAt ?? request.createdAt);

  return (
    <li className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
              <Mail className="size-4" />
            </span>
            <span className="min-w-0 truncate font-medium">{mailbox}</span>
          </div>
          <div className="mt-2.5 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <Avatar name={member} src={request.imageUrl} className="size-5 text-[9px]" />
            <span className="truncate">
              <span className="text-foreground">{request.name || request.email}</span>
              {request.name && request.email && <span className="hidden sm:inline"> · {request.email}</span>}
            </span>
          </div>
          {request.note && <p className="mt-3 whitespace-pre-wrap break-words border-l-2 pl-3 text-sm text-muted-foreground">{request.note}</p>}
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:flex-col sm:items-end">
          <span className="text-xs text-muted-foreground" title={formatDate(time, true)}>
            {!pending && request.decidedBy ? `${request.decidedBy} · ` : ''}
            {relative(time)}
          </span>
          {pending ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => ask('reject')} disabled={decide.isPending}>
                <X /> {t('reject')}
              </Button>
              <Button size="sm" onClick={() => ask('approve')} disabled={decide.isPending}>
                <Check /> {t('approve')}
              </Button>
            </div>
          ) : (
            <Badge className={cn(TONE[request.status])}>{t(request.status)}</Badge>
          )}
        </div>
      </div>
    </li>
  );
}

export function RequestsTab({ pendingCount }: { pendingCount?: number }) {
  const t = useT(membersMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const [status, setStatus] = useState<RequestStatus>('pending');
  const requests = useQuery({ queryKey: memberKeys.requests(status), queryFn: () => membersApi.requests(status) });

  return (
    <div className="space-y-4">
      <Segmented
        size="sm"
        value={status}
        onChange={setStatus}
        className="w-full sm:w-auto"
        options={STATUSES.map((s) => ({
          value: s,
          label: (
            <>
              {t(s)}
              {s === 'pending' && !!pendingCount && <span className="tabular-nums text-muted-foreground">{pendingCount}</span>}
            </>
          ),
        }))}
      />

      {requests.isError && <ErrorBanner message={errorText(requests.error)} onRetry={() => requests.refetch()} retryLabel={tc('retry')} />}

      {requests.isPending && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl border bg-card p-4">
              <Skeleton className="h-5 w-56 max-w-full" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      )}

      {requests.data?.length === 0 && (
        <EmptyState icon={Inbox} title={t(EMPTY[status])} description={status === 'pending' ? t('emptyPendingBody') : undefined} />
      )}

      {!!requests.data?.length && (
        <ul className="space-y-3">
          {requests.data.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
