import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { mailApi, mailKeys } from './mail-api';

// The mailbox a page works on (calendar, contacts): ?mailbox= in the URL, else
// the one last used anywhere (shared with webmail), else the first.

const KEY = 'mail-mailbox';

const remembered = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export function useActiveMailbox() {
  const [params, setParams] = useSearchParams();
  const query = useQuery({ queryKey: mailKeys.mailboxes, queryFn: mailApi.mailboxes });
  const list = query.data ?? [];
  const requested = params.get('mailbox') ?? '';
  const last = remembered();
  const mailbox = list.includes(requested) ? requested : last && list.includes(last) ? last : (list[0] ?? '');

  useEffect(() => {
    if (!mailbox) return;
    try {
      localStorage.setItem(KEY, mailbox);
    } catch {
      // Not remembered.
    }
  }, [mailbox]);

  const setMailbox = useCallback(
    (next: string) =>
      setParams((p) => {
        const copy = new URLSearchParams(p);
        copy.set('mailbox', next);
        return copy;
      }),
    [setParams]
  );

  return { mailbox, mailboxes: list, query, setMailbox };
}
