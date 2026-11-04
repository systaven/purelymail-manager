import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiClientError } from '@/lib/api';
import { mailApi, mailKeys, openComposer } from '@/lib/mail-api';

type T = (
  key: 'sendingIn' | 'sending' | 'sent' | 'undoAction' | 'undoing' | 'sendUndone' | 'scheduleCancelled' | 'alreadySent' | 'scheduledFor',
  params?: Record<string, string | number>
) => string;

interface Options {
  mailbox: string;
  id: string;
  sendAt: number;
  scheduled: boolean;
  scheduledText?: string;
  t: T;
  errorText: (e: unknown) => string;
  queryClient: QueryClient;
}

// The toast after Send: a countdown with Undo (or "Scheduled for…" with Undo).
// Lives outside the composer, which has already closed.
export function showSentToast({ mailbox, id, sendAt, scheduled, scheduledText, t, errorText, queryClient }: Options) {
  const toastId = `send-${id}`;
  let timer: number | undefined;

  const undo = async () => {
    window.clearInterval(timer);
    toast.loading(t('undoing'), { id: toastId, action: undefined, duration: Infinity });
    try {
      const message = await mailApi.cancelSend(mailbox, id);
      toast.success(t(scheduled ? 'scheduleCancelled' : 'sendUndone'), { id: toastId, duration: 4000 });
      openComposer({ mode: 'draft', mailbox, draftUid: message.draftUid, message });
    } catch (e) {
      const late = e instanceof ApiClientError && e.code === 'already_sent';
      toast.error(late ? t('alreadySent') : errorText(e), { id: toastId, duration: 5000 });
    } finally {
      queryClient.invalidateQueries({ queryKey: mailKeys.outbox(mailbox) });
    }
  };
  const action = { label: t('undoAction'), onClick: () => void undo() };

  if (scheduled) {
    toast.success(t('scheduledFor', { date: scheduledText ?? '' }), { id: toastId, action, duration: 8000 });
    return;
  }

  const remaining = () => Math.max(0, Math.ceil((sendAt - Date.now()) / 1000));
  if (remaining() <= 0) {
    toast(t('sending'), { id: toastId, duration: 3000 });
    return;
  }
  const tick = () => {
    const left = remaining();
    if (left <= 0) {
      window.clearInterval(timer);
      toast.success(t('sent'), { id: toastId, action: undefined, duration: 3000 });
      return;
    }
    toast(t('sendingIn', { n: left }), { id: toastId, action, duration: Infinity });
  };
  tick();
  timer = window.setInterval(tick, 1000);
}
