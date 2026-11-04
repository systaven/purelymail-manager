import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Bell,
  BellOff,
  Check,
  ChevronsUpDown,
  Clock,
  FileText,
  Folder as FolderIcon,
  FolderPlus,
  Inbox,
  PenSquare,
  Send,
  ShieldAlert,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Avatar, Kbd, Skeleton } from '@/components/ui/misc';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { mailMessages } from '@/lib/i18n/messages/mail';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { mailApi, mailKeys, type Folder } from '@/lib/mail-api';
import { cn } from '@/lib/utils';
import { OUTBOX, useFolderName } from './state';

export const FOLDER_ICONS: Record<string, LucideIcon> = {
  '\\Inbox': Inbox,
  '\\Drafts': FileText,
  '\\Sent': Send,
  '\\Archive': Archive,
  '\\Junk': ShieldAlert,
  '\\Trash': Trash2,
};

export const folderIcon = (f: Pick<Folder, 'specialUse'> | undefined) => (f?.specialUse && FOLDER_ICONS[f.specialUse]) || FolderIcon;

function NewFolderDialog({ mailbox, folders, open, onOpenChange }: { mailbox: string; folders: Folder[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT(mailMessages);
  const tc = useT(commonMessages);
  const qc = useQueryClient();
  const errorText = useErrorText();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const delimiter = folders.find((f) => f.delimiter)?.delimiter ?? '/';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const path = name.trim();
    if (!path) return;
    setBusy(true);
    try {
      qc.setQueryData(mailKeys.folders(mailbox), await mailApi.createFolder(mailbox, path));
      toast.success(t('folderCreated', { name: path }));
      setName('');
      onOpenChange(false);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-5">
        <DialogTitle>{t('newFolder')}</DialogTitle>
        <DialogDescription className="mt-1">{t('newFolderHint', { delimiter })}</DialogDescription>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('folderName')} maxLength={200} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {t('create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FolderPane({
  mailbox,
  mailboxes,
  folders,
  loading,
  current,
  outboxCount,
  onSelect,
  onMailbox,
  onCompose,
  notifications,
}: {
  mailbox: string;
  mailboxes: string[];
  folders: Folder[] | undefined;
  loading: boolean;
  current: string;
  outboxCount: number;
  onSelect: (path: string) => void;
  onMailbox: (mailbox: string) => void;
  onCompose: () => void;
  notifications: { supported: boolean; on: boolean; toggle: () => Promise<boolean> };
}) {
  const t = useT(mailMessages);
  const folderName = useFolderName();
  const [creating, setCreating] = useState(false);
  const special = folders?.filter((f) => f.specialUse) ?? [];
  const custom = (folders?.filter((f) => !f.specialUse) ?? []).sort((a, b) => a.path.localeCompare(b.path));

  const row = (key: string, label: string, Icon: LucideIcon, count: number, depth = 0, muted = false) => {
    const active = key === current;
    return (
      <button
        key={key}
        onClick={() => onSelect(key)}
        className={cn(
          'group flex h-9 w-full items-center gap-2.5 rounded-md pr-2 text-left text-sm transition-colors pointer-fine:h-8 hover:bg-sidebar-accent',
          active ? 'bg-sidebar-accent font-medium text-foreground' : 'text-sidebar-foreground'
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
        aria-current={active ? 'page' : undefined}
      >
        <Icon className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count > 0 && <span className={cn('text-xs tabular-nums', muted ? 'text-muted-foreground' : 'font-semibold text-foreground')}>{count > 9999 ? '9999+' : count}</span>}
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 p-3">
        {mailboxes.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-10 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm hover:bg-sidebar-accent" aria-label={t('switchMailbox')}>
                <Avatar name={mailbox} className="size-6 text-[10px]" />
                <span className="min-w-0 flex-1 truncate font-medium">{mailbox}</span>
                <ChevronsUpDown className="size-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>{t('mailboxes')}</DropdownMenuLabel>
              {mailboxes.map((m) => (
                <DropdownMenuItem key={m} onSelect={() => onMailbox(m)}>
                  <Avatar name={m} className="size-5 text-[9px]" />
                  <span className="min-w-0 flex-1 truncate">{m}</span>
                  {m === mailbox && <Check />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex h-10 items-center gap-2 px-1.5 text-sm">
            <Avatar name={mailbox} className="size-6 text-[10px]" />
            <span className="min-w-0 flex-1 truncate font-medium">{mailbox}</span>
          </div>
        )}
        <Button className="h-10 w-full justify-start rounded-lg" onClick={onCompose}>
          <PenSquare />
          <span className="flex-1 text-left">{t('compose')}</span>
          <Kbd className="hidden border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground pointer-fine:inline-flex">C</Kbd>
        </Button>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {loading && !folders
          ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="my-1.5 h-6" />)
          : special.map((f) =>
              row(f.path, folderName(f), folderIcon(f), f.specialUse === '\\Drafts' ? f.total : f.specialUse === '\\Sent' || f.specialUse === '\\Trash' ? 0 : f.unseen, 0, f.specialUse !== '\\Inbox')
            )}
        {outboxCount > 0 && row(OUTBOX, t('outbox'), Clock, outboxCount, 0, true)}
        {custom.length > 0 && <div className="px-2 pb-1 pt-4 text-xs font-medium text-muted-foreground">{t('folders')}</div>}
        {custom.map((f) => row(f.path, f.name, FolderIcon, f.unseen, f.delimiter ? f.path.split(f.delimiter).length - 1 : 0))}
      </nav>

      <div className="flex shrink-0 items-center gap-1 border-t p-2">
        <Button variant="ghost" size="sm" className="flex-1 justify-start text-muted-foreground" onClick={() => setCreating(true)} disabled={!folders}>
          <FolderPlus />
          {t('newFolder')}
        </Button>
        {notifications.supported && (
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn('text-muted-foreground', notifications.on && 'text-primary')}
            aria-label={notifications.on ? t('notificationsOff') : t('notificationsOn')}
            title={notifications.on ? t('notificationsOff') : t('notificationsOn')}
            aria-pressed={notifications.on}
            onClick={async () => {
              const was = notifications.on;
              const on = await notifications.toggle();
              if (!was && !on) toast.error(t('notificationsBlocked'));
              else toast.success(on ? t('notificationsEnabled') : t('notificationsDisabled'));
            }}
          >
            {notifications.on ? <Bell /> : <BellOff />}
          </Button>
        )}
      </div>
      {folders && <NewFolderDialog mailbox={mailbox} folders={folders} open={creating} onOpenChange={setCreating} />}
    </div>
  );
}
