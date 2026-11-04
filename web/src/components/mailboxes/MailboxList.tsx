import { ChevronRight, Copy, EyeOff, Globe, KeyRound, MoreHorizontal, RectangleEllipsis, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, Skeleton } from '@/components/ui/misc';
import type { MailboxSummary } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { mailboxesMessages } from '@/lib/i18n/messages/mailboxes';
import { cn } from '@/lib/utils';
import { AddressText, copyText, MemberBadge, splitAddress } from './shared';

export interface RowActions {
  onOpen: (address: string) => void;
  onResetPassword: (address: string) => void;
  onAppPassword: (address: string) => void;
  onConnectApp: (address: string) => void;
  onDelete: (address: string) => void;
  onRelease: (address: string) => void;
}

// Mailboxes grouped by domain, each group in its own card.
export function MailboxList({ mailboxes, selected, ...actions }: { mailboxes: MailboxSummary[]; selected: string | null } & RowActions) {
  const groups = new Map<string, MailboxSummary[]>();
  for (const mailbox of mailboxes) {
    const domain = splitAddress(mailbox.address)[1];
    groups.set(domain, [...(groups.get(domain) ?? []), mailbox]);
  }
  const sorted = [...groups].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      {sorted.map(([domain, items]) => (
        <section key={domain} aria-label={domain}>
          <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
            <Globe className="size-3.5" />
            <span className="truncate">{domain}</span>
            <span className="tabular-nums opacity-70">· {items.length}</span>
          </h2>
          <Card className="divide-y overflow-hidden">
            {items.map((mailbox) => (
              <MailboxRow key={mailbox.address} mailbox={mailbox} active={mailbox.address === selected} {...actions} />
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

function MailboxRow({ mailbox, active, onOpen, onResetPassword, onAppPassword, onConnectApp, onDelete, onRelease }: { mailbox: MailboxSummary; active: boolean } & RowActions) {
  const t = useT(mailboxesMessages);
  const tc = useT(commonMessages);
  const { address, owner } = mailbox;

  return (
    <div className={cn('group flex items-center gap-1 pr-2 transition-colors hover:bg-accent/50', active && 'bg-accent/60')}>
      <button
        type="button"
        onClick={() => onOpen(address)}
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left outline-none focus-visible:bg-accent/60 sm:pl-4"
      >
        <Avatar name={owner?.name || address} />
        <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <AddressText address={address} className="text-sm" />
          {owner && <MemberBadge owner={owner} className="self-start sm:self-auto" />}
        </span>
        <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 sm:block" />
      </button>
      {/* Non-modal so dialogs opened from an item get focus cleanly */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground data-[state=open]:bg-accent"
            aria-label={t('actionsFor', { address })}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">{address}</DropdownMenuLabel>
          {!owner && (
            <>
              <DropdownMenuItem onSelect={() => onConnectApp(address)}>
                <Send />
                {t('connectApp')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onResetPassword(address)}>
                <KeyRound />
                {t('resetPassword')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAppPassword(address)}>
                <RectangleEllipsis />
                {t('createAppPassword')}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onSelect={() => copyText(address, t('copied'))}>
            <Copy />
            {t('copyAddress')}
          </DropdownMenuItem>
          {!owner && (
            <DropdownMenuItem onSelect={() => onRelease(address)}>
              <EyeOff />
              {t('removeFromPanel')}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onDelete(address)} className="text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive [&_svg]:text-destructive">
            <Trash2 />
            {tc('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function MailboxListSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="mb-3 ml-1 h-3 w-32" />
      <Card className="divide-y overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4" style={{ width: `${[38, 52, 30, 44, 34, 48][i]}%` }} />
          </div>
        ))}
      </Card>
    </div>
  );
}
