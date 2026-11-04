import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n';
import { mailMessages } from '@/lib/i18n/messages/mail';
import { mailApi, mailKeys, type Folder, type MailEvent } from '@/lib/mail-api';
import { specialPath } from './state';

const NOTIFY_KEY = 'mail-notifications';

export function useNotificationSetting() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(NOTIFY_KEY) === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted';
    } catch {
      return false;
    }
  });
  const toggle = async () => {
    if (typeof Notification === 'undefined') return false;
    let next = !on;
    if (next && Notification.permission !== 'granted') next = (await Notification.requestPermission()) === 'granted';
    setOn(next);
    try {
      localStorage.setItem(NOTIFY_KEY, next ? '1' : '0');
    } catch {
      // Not remembered.
    }
    return next;
  };
  return { supported: typeof Notification !== 'undefined', on, toggle };
}

// Live updates over SSE. Reconnects with backoff; returns whether the stream is
// up so the folder list can poll while it isn't.
export function useMailEvents(mailbox: string, notify: boolean, onOpenMessage: (uid: number) => void) {
  const qc = useQueryClient();
  const t = useT(mailMessages);
  const [connected, setConnected] = useState(false);
  const latest = useRef({ notify, onOpenMessage, t });
  latest.current = { notify, onOpenMessage, t };

  useEffect(() => {
    if (!mailbox) return;
    let source: EventSource | null = null;
    let retry = 0;
    let timer: number | undefined;
    let stopped = false;

    const sentPath = () => specialPath(qc.getQueryData<Folder[]>(mailKeys.folders(mailbox)), '\\Sent');

    const onInbox = async (event: MailEvent) => {
      qc.invalidateQueries({ queryKey: mailKeys.folders(mailbox) });
      qc.invalidateQueries({ queryKey: [...mailKeys.allMessages(mailbox), 'INBOX'] });
      if (event.type !== 'inbox' || event.reason !== 'exists' || !latest.current.notify || !document.hidden) return;
      const newest = (await mailApi.messages(mailbox, 'INBOX', 0, '').catch(() => null))?.messages[0];
      if (!newest || newest.seen) return;
      const from = newest.from[0];
      const n = new Notification(from?.name || from?.address || latest.current.t('newMail'), { body: newest.subject, tag: `mail-${mailbox}-${newest.uid}` });
      n.onclick = () => {
        window.focus();
        latest.current.onOpenMessage(newest.uid);
        n.close();
      };
    };

    const onOutbox = (event: MailEvent) => {
      if (event.type !== 'outbox') return;
      qc.invalidateQueries({ queryKey: mailKeys.outbox(mailbox) });
      qc.invalidateQueries({ queryKey: [...mailKeys.allMessages(mailbox), sentPath()] });
      qc.invalidateQueries({ queryKey: mailKeys.folders(mailbox) });
      if (event.status === 'failed') {
        const { t } = latest.current;
        toast.error(t('sendFailed'), {
          description: event.error,
          duration: 15_000,
          action: {
            label: t('retry'),
            onClick: () =>
              mailApi
                .retrySend(mailbox, event.id)
                .then(() => qc.invalidateQueries({ queryKey: mailKeys.outbox(mailbox) }))
                .catch(() => toast.error(t('sendFailed'))),
          },
        });
      }
    };

    const parse = (e: Event) => {
      try {
        return JSON.parse((e as MessageEvent).data) as MailEvent;
      } catch {
        return null;
      }
    };

    const connect = () => {
      if (stopped) return;
      source = new EventSource(mailApi.eventsUrl(mailbox), { withCredentials: true });
      source.addEventListener('ready', () => {
        retry = 0;
        setConnected(true);
      });
      source.addEventListener('inbox', (e) => {
        const event = parse(e);
        if (event) void onInbox(event);
      });
      source.addEventListener('outbox', (e) => {
        const event = parse(e);
        if (event) onOutbox(event);
      });
      source.onerror = () => {
        source?.close();
        setConnected(false);
        retry += 1;
        timer = window.setTimeout(connect, Math.min(60_000, 1000 * 2 ** Math.min(retry, 6)) + Math.random() * 1000);
      };
    };
    connect();

    // Catch up after the tab was in the background or the stream was down.
    const onFocus = () => qc.invalidateQueries({ queryKey: mailKeys.folders(mailbox) });
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      source?.close();
      window.removeEventListener('focus', onFocus);
      setConnected(false);
    };
  }, [mailbox, qc]);

  return connected;
}
