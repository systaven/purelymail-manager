import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Clock, Pencil, RotateCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';
import { useLocale, useT } from '@/lib/i18n';
import { mailMessages } from '@/lib/i18n/messages/mail';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { mailApi, mailKeys, openComposer, type OutboxItem } from '@/lib/mail-api';
import { ListHeader, ListSkeleton } from './MessageList';
import { fullDate } from './state';

// Queued, scheduled and failed sends.
export function OutboxView({ mailbox, items, loading, onOpenFolders }: { mailbox: string; items: OutboxItem[]; loading: boolean; onOpenFolders: () => void }) {
  const t = useT(mailMessages);
  const { locale } = useLocale();
  const errorText = useErrorText();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(null);
      qc.invalidateQueries({ queryKey: mailKeys.outbox(mailbox) });
    }
  };

  const edit = (item: OutboxItem) =>
    run(item.id, async () => {
      const message = await mailApi.cancelSend(mailbox, item.id);
      openComposer({ mode: 'draft', mailbox, message });
    });

  const retry = (item: OutboxItem) =>
    run(item.id, async () => {
      await mailApi.retrySend(mailbox, item.id);
      toast.success(t('retrying'));
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ListHeader title={t('outbox')} onOpenFolders={onOpenFolders} />
      <div className="min-h-0 flex-1 overflow-y-auto border-t">
        {loading ? (
          <ListSkeleton />
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={Send} title={t('outboxEmpty')} />
          </div>
        ) : (
          <ul>
            {items.map((item) => {
              const failed = item.status === 'failed';
              const scheduled = !failed && item.sendAt > Date.now() + 60_000;
              return (
                <li key={item.id} className="border-b border-border/60 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className={failed ? 'mt-0.5 text-destructive' : 'mt-0.5 text-muted-foreground'}>
                      {failed ? <AlertCircle className="size-4" /> : <Clock className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.subject || t('noSubject')}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t('toPrefix')} {item.to.join(', ')}
                      </p>
                      <p className={failed ? 'mt-1 text-xs text-destructive' : 'mt-1 text-xs text-muted-foreground'}>
                        {failed ? item.error || t('sendFailed') : scheduled ? t('scheduledFor', { time: fullDate(item.sendAt, locale) }) : t('sending')}
                      </p>
                      <div className="mt-2 flex gap-2">
                        {failed && (
                          <Button size="sm" variant="outline" disabled={busy === item.id} onClick={() => retry(item)}>
                            <RotateCw /> {t('retry')}
                          </Button>
                        )}
                        {(failed || scheduled) && (
                          <Button size="sm" variant="ghost" disabled={busy === item.id} onClick={() => edit(item)}>
                            <Pencil /> {t('edit')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
