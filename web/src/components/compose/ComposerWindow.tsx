import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Ellipsis, File as FileIcon, Loader2, Maximize2, Minimize2, Minus, Paperclip, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Tooltip } from '@/components/ui/tooltip';
import { ApiClientError } from '@/lib/api';
import { useLocale, useT } from '@/lib/i18n';
import { composeMessages } from '@/lib/i18n/messages/compose';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { mailApi, mailKeys, type Address, type OutgoingMessage } from '@/lib/mail-api';
import { cn } from '@/lib/utils';
import {
  base64Bytes,
  buildInitial,
  editorHtmlToText,
  finalizeHtml,
  formatBytes,
  formatDate,
  htmlToText,
  isEmail,
  MAX_ATTACHMENT_BYTES,
  mentionsAttachment
} from './build';
import { EditorBody, EditorToolbar, LinkDialog, useComposerEditor } from './Editor';
import { RecipientInput } from './RecipientInput';
import { SendButton } from './SendButton';
import { SenderSettings } from './SenderSettings';
import { showSentToast } from './sendToast';
import { getContacts, getMailboxSettings, getUndoDelay, rememberContacts, type Contact } from './storage';
import type { ComposerWin } from './types';

interface Att {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  content?: string;
  status: 'loading' | 'ready' | 'error';
  // Index of the original attachment when forwarding.
  source?: number;
}

interface Fields {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
}

type Status = 'idle' | 'saving' | 'saved' | 'error';

const AUTOSAVE_MS = 4000;
let nextAtt = 0;
const attId = () => `att-${++nextAtt}`;

const readBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const usedBytes = (list: Att[]) => list.reduce((sum, a) => sum + (a.status === 'error' ? 0 : a.size), 0);

interface Props {
  win: ComposerWin;
  active: boolean;
  onClose: (id: string) => void;
  onPatch: (id: string, patch: Partial<Pick<ComposerWin, 'minimized' | 'maximized'>>) => void;
  onActivate: (id: string) => void;
  linkHandlers: Map<string, () => void>;
}

export default function ComposerWindow({ win, active, onClose, onPatch, onActivate, linkHandlers }: Props) {
  const { request } = win;
  const mailbox = request.mailbox;
  const t = useT(composeMessages);
  const { locale } = useLocale();
  const errorText = useErrorText();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const [settings, setSettings] = useState(() => getMailboxSettings(mailbox));
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [init] = useState(() =>
    buildInitial(request, settings.signature, {
      wrote: (date, sender) => t('wrote', { date, sender }),
      forwardedHeader: t('forwardedHeader'),
      from: t('from'),
      date: t('date'),
      subject: t('subject'),
      to: t('to'),
      cc: t('cc'),
      locale
    })
  );

  // Fields and attachments are mirrored in refs so send/save always read the latest values.
  const [fields, setFieldsState] = useState<Fields>({ to: init.to, cc: init.cc, bcc: init.bcc, subject: init.subject });
  const fieldsRef = useRef(fields);
  const [attachments, setAttState] = useState<Att[]>(() => {
    const own: Att[] = init.attachments.map((a) => ({ ...a, id: attId(), size: base64Bytes(a.content), status: 'ready' }));
    let total = usedBytes(own);
    const forwarded: Att[] = [];
    for (const a of init.forward?.attachments ?? []) {
      if (a.inline || total + a.size > MAX_ATTACHMENT_BYTES) continue;
      total += a.size;
      forwarded.push({ id: attId(), filename: a.filename, contentType: a.contentType, size: a.size, status: 'loading', source: a.index });
    }
    return [...own, ...forwarded];
  });
  const attRef = useRef(attachments);

  const [names, setNames] = useState(() => {
    const map = new Map<string, string>();
    for (const c of getContacts()) if (c.name) map.set(c.address, c.name);
    for (const p of init.participants) if (p.name) map.set(p.address.toLowerCase(), p.name);
    return map;
  });
  const suggestions = useMemo<Contact[]>(() => {
    const me = mailbox.toLowerCase();
    const byAddress = new Map<string, Contact>();
    // People in the conversation first, then everyone written to before.
    for (const p of init.participants) byAddress.set(p.address.toLowerCase(), { name: p.name, address: p.address.toLowerCase(), uses: 1e6, last: 0 });
    for (const c of getContacts()) if (!byAddress.has(c.address)) byAddress.set(c.address, c);
    byAddress.delete(me);
    return [...byAddress.values()];
  }, [init, mailbox]);

  const [showCc, setShowCc] = useState(init.cc.length > 0);
  const [showBcc, setShowBcc] = useState(init.bcc.length > 0);
  const [quoteOpen, setQuoteOpen] = useState(request.mode === 'forward');
  const [status, setStatus] = useState<Status>('idle');
  const [sending, setSending] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const draftUid = useRef(init.draftUid);
  const version = useRef(0);
  const savedVersion = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const done = useRef(false); // sent, discarded or closed
  const busy = useRef(false);

  const rootRef = useRef<HTMLElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const ccRef = useRef<HTMLInputElement>(null);
  const bccRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const touch = () => {
    version.current++;
    setStatus((s) => (s === 'saving' ? s : 'idle'));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), AUTOSAVE_MS);
  };

  const editor = useComposerEditor({ content: init.body, placeholder: t('bodyPlaceholder'), onChange: touch });

  const setFields = (patch: Partial<Fields>) => {
    fieldsRef.current = { ...fieldsRef.current, ...patch };
    setFieldsState(fieldsRef.current);
    touch();
  };
  const setAtts = (update: (list: Att[]) => Att[], dirty = true) => {
    attRef.current = update(attRef.current);
    setAttState(attRef.current);
    if (dirty) touch();
  };
  const learnNames = (people: Address[]) => {
    if (!people.length) return;
    setNames((prev) => {
      const next = new Map(prev);
      for (const p of people) next.set(p.address.toLowerCase(), p.name);
      return next;
    });
  };

  const buildMessage = (forDraft: boolean): OutgoingMessage => {
    const f = fieldsRef.current;
    // The server rejects invalid addresses; a draft simply leaves them out.
    const clean = (list: string[]) => (forDraft ? list.filter(isEmail) : list);
    const html = editor.isEmpty ? '' : editor.getHTML();
    return {
      fromName: settingsRef.current.fromName.trim() || undefined,
      to: clean(f.to),
      cc: clean(f.cc),
      bcc: clean(f.bcc),
      subject: f.subject.trim(),
      html: (html ? finalizeHtml(html) : '') + init.quote,
      text: [html ? editorHtmlToText(html) : '', init.quote ? htmlToText(init.quote) : ''].filter(Boolean).join('\n\n'),
      inReplyTo: init.meta.inReplyTo,
      references: init.meta.references,
      replyTo: init.meta.replyTo,
      attachments: attRef.current
        .filter((a) => a.status === 'ready' && a.content !== undefined)
        .map((a) => ({ filename: a.filename, contentType: a.contentType, content: a.content! }))
    };
  };

  // Saves are queued so two never overlap and each replaces the previous uid.
  const save = (prebuilt?: OutgoingMessage) => {
    window.clearTimeout(timer.current);
    const run = async () => {
      const v = version.current;
      if (v === savedVersion.current || (done.current && !prebuilt)) return true;
      setStatus('saving');
      try {
        const { uid } = await mailApi.saveDraft(mailbox, prebuilt ?? buildMessage(true), draftUid.current);
        draftUid.current = uid ?? undefined;
        savedVersion.current = v;
        setStatus(version.current === v ? 'saved' : 'idle');
        queryClient.invalidateQueries({ queryKey: mailKeys.folders(mailbox) });
        queryClient.invalidateQueries({ queryKey: mailKeys.allMessages(mailbox) });
        return true;
      } catch {
        setStatus('error');
        return false;
      }
    };
    queue.current = queue.current.then(run);
    return queue.current;
  };

  const close = () => {
    if (done.current) return;
    done.current = true;
    window.clearTimeout(timer.current);
    const dirty = version.current !== savedVersion.current;
    const message = dirty ? buildMessage(true) : null;
    onClose(win.id);
    if (message) void save(message).then((ok) => (ok ? toast(t('draftSaved')) : toast.error(t('saveFailed'))));
  };

  const discard = async () => {
    if (
      (version.current > 0 || draftUid.current) &&
      !(await confirm({
        title: t('discardTitle'),
        description: t('discardBody'),
        confirmLabel: t('discardConfirm'),
        cancelLabel: t('cancel'),
        destructive: true
      }))
    )
      return;
    done.current = true;
    window.clearTimeout(timer.current);
    onClose(win.id);
    await queue.current;
    if (draftUid.current) {
      await mailApi.deleteDraft(mailbox, draftUid.current).catch(() => {});
      queryClient.invalidateQueries({ queryKey: mailKeys.folders(mailbox) });
      queryClient.invalidateQueries({ queryKey: mailKeys.allMessages(mailbox) });
    }
    toast(t('draftDiscarded'));
  };

  const describe = (e: unknown) => {
    const code = e instanceof ApiClientError ? e.code : undefined;
    if (code === 'attachments_too_large') return t('tooLargeTotal');
    if (code === 'no_recipients') return t('noRecipients');
    if (code === 'invalid_schedule') return t('scheduleTooFar');
    return errorText(e);
  };

  const send = async (sendAt?: number) => {
    if (busy.current || done.current) return;
    const f = fieldsRef.current;
    const all = [...f.to, ...f.cc, ...f.bcc];
    if (!all.length) {
      toast.error(t('noRecipients'));
      toRef.current?.focus();
      return;
    }
    const invalid = all.filter((a) => !isEmail(a));
    if (invalid.length) return void toast.error(t('invalidRecipients', { list: invalid.join(', ') }));
    if (attRef.current.some((a) => a.status === 'loading')) return void toast(t('attachmentsPending'));

    busy.current = true;
    try {
      if (!f.subject.trim()) {
        const ok = await confirm({
          title: t('emptySubjectTitle'),
          description: t('emptySubjectBody'),
          confirmLabel: t('sendAnyway'),
          cancelLabel: t('cancel')
        });
        if (!ok) return subjectRef.current?.focus();
      }
      if (!attRef.current.some((a) => a.status === 'ready') && mentionsAttachment(`${f.subject} ${editor.getText()}`)) {
        const ok = await confirm({
          title: t('missingAttachmentTitle'),
          description: t('missingAttachmentBody'),
          confirmLabel: t('sendAnyway'),
          cancelLabel: t('cancel')
        });
        if (!ok) return;
      }
      setSending(true);
      window.clearTimeout(timer.current);
      const message = buildMessage(false);
      // Let a draft save in flight finish so the server deletes the right draft.
      await queue.current;
      message.draftUid = draftUid.current;
      const result = await mailApi.send(mailbox, message, sendAt ? { sendAt } : { delaySeconds: getUndoDelay() });
      done.current = true;
      rememberContacts(all.map((address) => ({ address, name: names.get(address.toLowerCase()) ?? '' })));
      queryClient.invalidateQueries({ queryKey: mailKeys.outbox(mailbox) });
      onClose(win.id);
      showSentToast({
        mailbox,
        id: result.id,
        sendAt: result.sendAt,
        scheduled: Boolean(sendAt),
        scheduledText: formatDate(result.sendAt, locale),
        t,
        errorText: describe,
        queryClient
      });
    } catch (e) {
      toast.error(describe(e));
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  const addFiles = (files: File[]) => {
    if (!files.length) return;
    let total = usedBytes(attRef.current);
    const added: { att: Att; file: File }[] = [];
    for (const file of files) {
      if (total + file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(t('tooLarge', { name: file.name }));
        continue;
      }
      total += file.size;
      added.push({
        att: { id: attId(), filename: file.name || 'attachment', contentType: file.type || 'application/octet-stream', size: file.size, status: 'loading' },
        file
      });
    }
    if (!added.length) return;
    setAtts((list) => [...list, ...added.map((a) => a.att)]);
    for (const { att, file } of added) {
      readBase64(file)
        .then((content) => setAtts((list) => list.map((a) => (a.id === att.id ? { ...a, content, status: 'ready' } : a))))
        .catch(() => setAtts((list) => list.map((a) => (a.id === att.id ? { ...a, status: 'error' } : a)), false));
    }
  };

  // Forwarding: fetch the original attachments.
  useEffect(() => {
    const fwd = init.forward;
    if (!fwd) return;
    const kept = fwd.attachments.filter((a) => !a.inline).length;
    if (kept > attRef.current.filter((a) => a.source !== undefined).length) toast.warning(t('forwardSkipped'), { id: `fwd-skip-${win.id}` });
    const controller = new AbortController();
    for (const att of attRef.current) {
      if (att.source === undefined || att.status !== 'loading') continue;
      fetch(mailApi.attachmentUrl(mailbox, fwd.folder, fwd.uid, att.source), { credentials: 'same-origin', signal: controller.signal })
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
        .then(readBase64)
        .then((content) => setAtts((list) => list.map((a) => (a.id === att.id ? { ...a, content, size: base64Bytes(content), status: 'ready' } : a)), false))
        .catch(() => !controller.signal.aborted && setAtts((list) => list.map((a) => (a.id === att.id ? { ...a, status: 'error' } : a)), false));
    }
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial focus: first empty field, or the top of the body for replies.
  useEffect(() => {
    const f = fieldsRef.current;
    if (request.mode === 'reply' || request.mode === 'replyAll') editor.commands.focus('start');
    else if (!f.to.length) toRef.current?.focus();
    else if (!f.subject) subjectRef.current?.focus();
    else editor.commands.focus('start');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Asked to open again: bring it forward.
  useEffect(() => {
    if (win.focusTick) editor.commands.focus();
  }, [win.focusTick, editor]);

  useEffect(() => {
    linkHandlers.set(win.id, () => setLinkOpen(true));
    return () => void linkHandlers.delete(win.id);
  }, [linkHandlers, win.id]);

  // Warn before leaving the page with unsaved changes; save when the tab is hidden.
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!done.current && version.current !== savedVersion.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const hidden = () => document.visibilityState === 'hidden' && !done.current && version.current !== savedVersion.current && void save();
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('visibilitychange', hidden);
      window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Composer keys never reach page shortcuts.
    e.stopPropagation();
    if (!e.currentTarget.contains(e.target as Node)) return; // from a portal (menu, dialog)
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void send();
    } else if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      close();
    }
  };

  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');

  const title = fields.subject.trim() || t('newMessage');
  const { minimized, maximized } = win;
  const fromLabel = settings.fromName.trim() ? `${settings.fromName.trim()} <${mailbox}>` : mailbox;
  const total = usedBytes(attachments);

  const headerButton = (label: string, onClick: () => void, icon: React.ReactNode, className?: string) => (
    <Tooltip content={label} side="top">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        className={cn('size-7 text-muted-foreground hover:text-foreground', className)}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        {icon}
      </Button>
    </Tooltip>
  );

  return (
    <section
      ref={rootRef}
      role="dialog"
      aria-label={t('windowLabel', { title })}
      data-composer-id={win.id}
      onKeyDown={onKeyDown}
      onMouseDownCapture={() => onActivate(win.id)}
      onFocusCapture={() => onActivate(win.id)}
      onDragEnter={(e) => hasFiles(e) && (e.preventDefault(), setDragging(true))}
      onDragOver={(e) => hasFiles(e) && e.preventDefault()}
      onDragLeave={(e) => !rootRef.current?.contains(e.relatedTarget as Node | null) && setDragging(false)}
      onDropCapture={(e) => {
        setDragging(false);
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        e.stopPropagation();
        addFiles([...e.dataTransfer.files]);
      }}
      onPasteCapture={(e) => {
        const { files, types } = e.clipboardData;
        if (files.length && !types.includes('text/plain')) {
          e.preventDefault();
          e.stopPropagation();
          addFiles([...files]);
        }
      }}
      className={cn(
        'pointer-events-auto relative flex flex-col overflow-hidden border bg-popover text-popover-foreground shadow-2xl',
        minimized
          ? 'h-10 w-44 rounded-t-lg sm:w-64'
          : maximized
            ? 'fixed inset-0 z-50 md:inset-x-[max(1.5rem,calc(50vw-32rem))] md:inset-y-[5vh] md:rounded-xl'
            : cn('fixed inset-0 md:static md:h-[min(38rem,calc(100dvh-5rem))] md:w-[min(32rem,calc(100vw-2rem))] md:rounded-t-xl', active ? 'z-50' : 'z-40')
      )}
    >
      <header
        className={cn('flex h-10 shrink-0 items-center gap-0.5 bg-muted/70 pl-3 pr-1.5', minimized && 'cursor-pointer hover:bg-muted')}
        onClick={() => minimized && onPatch(win.id, { minimized: false })}
        onDoubleClick={() => !minimized && onPatch(win.id, { minimized: true })}
      >
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h2>
        {headerButton(minimized ? t('restore') : t('minimize'), () => onPatch(win.id, { minimized: !minimized }), <Minus />)}
        {!minimized &&
          headerButton(
            maximized ? t('exitMaximize') : t('maximize'),
            () => onPatch(win.id, { maximized: !maximized }),
            maximized ? <Minimize2 /> : <Maximize2 />,
            'max-md:hidden'
          )}
        {headerButton(t('close'), close, <X />)}
      </header>

      <div className={cn('flex min-h-0 flex-1 flex-col', minimized && 'hidden')}>
        <div className="flex h-9 shrink-0 items-center gap-2 border-b pl-3 pr-1.5 text-sm">
          <span className="w-12 shrink-0 text-muted-foreground">{t('from')}</span>
          <span className="min-w-0 flex-1 truncate">{fromLabel}</span>
          <SenderSettings mailbox={mailbox} settings={settings} onChange={setSettings} />
        </div>

        <RecipientInput
          label={t('to')}
          value={fields.to}
          onChange={(to) => setFields({ to })}
          names={names}
          onNames={learnNames}
          suggestions={suggestions}
          mailbox={mailbox}
          inputRef={toRef}
          trailing={
            (!showCc || !showBcc) && (
              <div className="mt-1 flex shrink-0 gap-1 text-sm">
                {!showCc && (
                  <button
                    type="button"
                    aria-label={t('addCc')}
                    className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => (setShowCc(true), requestAnimationFrame(() => ccRef.current?.focus()))}
                  >
                    {t('cc')}
                  </button>
                )}
                {!showBcc && (
                  <button
                    type="button"
                    aria-label={t('addBcc')}
                    className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => (setShowBcc(true), requestAnimationFrame(() => bccRef.current?.focus()))}
                  >
                    {t('bcc')}
                  </button>
                )}
              </div>
            )
          }
        />
        {showCc && (
          <RecipientInput
            label={t('cc')}
            value={fields.cc}
            onChange={(cc) => setFields({ cc })}
            names={names}
            onNames={learnNames}
            suggestions={suggestions}
            mailbox={mailbox}
            inputRef={ccRef}
          />
        )}
        {showBcc && (
          <RecipientInput
            label={t('bcc')}
            value={fields.bcc}
            onChange={(bcc) => setFields({ bcc })}
            names={names}
            onNames={learnNames}
            suggestions={suggestions}
            mailbox={mailbox}
            inputRef={bccRef}
          />
        )}
        <input
          ref={subjectRef}
          value={fields.subject}
          onChange={(e) => setFields({ subject: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              editor.commands.focus('start');
            }
          }}
          placeholder={t('subject')}
          aria-label={t('subject')}
          maxLength={998}
          className="h-10 shrink-0 border-b bg-transparent px-3 text-sm font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-0"
        />

        <div
          className="min-h-0 flex-1 cursor-text overflow-y-auto px-3 py-3"
          onMouseDown={(e) => {
            // Clicking the empty area below the text focuses the end of the editor.
            if (e.target === e.currentTarget) {
              e.preventDefault();
              editor.commands.focus('end');
            }
          }}
        >
          <EditorBody editor={editor} />
          {init.quote && (
            <div className="mt-3 cursor-auto">
              <Tooltip
                content={
                  quoteOpen
                    ? request.mode === 'forward'
                      ? t('hideOriginal')
                      : t('hideQuoted')
                    : request.mode === 'forward'
                      ? t('showOriginal')
                      : t('showQuoted')
                }
                side="top"
              >
                <button
                  type="button"
                  aria-expanded={quoteOpen}
                  aria-label={quoteOpen ? t('hideQuoted') : t('showQuoted')}
                  onClick={() => setQuoteOpen((o) => !o)}
                  className="inline-flex h-5 items-center rounded-full border bg-muted px-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Ellipsis className="size-4" />
                </button>
              </Tooltip>
              {quoteOpen && <QuotedContent html={init.quote} title={t('quote')} />}
            </div>
          )}
          {attachments.length > 0 && (
            <ul className="mt-4 flex cursor-auto flex-wrap gap-2" aria-label={t('attachmentsTotal', { size: formatBytes(total) })}>
              {attachments.map((a) => (
                <li
                  key={a.id}
                  title={a.status === 'error' ? t('attachmentFailed', { name: a.filename }) : a.filename}
                  className={cn(
                    'flex h-9 min-w-0 max-w-full items-center gap-2 rounded-md border bg-card pl-2.5 pr-1 text-sm sm:max-w-[16rem]',
                    a.status === 'error' && 'border-destructive/50 text-destructive'
                  )}
                >
                  {a.status === 'loading' ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label={t('attachmentLoading')} />
                  ) : a.status === 'error' ? (
                    <AlertCircle className="size-4 shrink-0" />
                  ) : (
                    <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(a.size)}</span>
                  <button
                    type="button"
                    aria-label={t('removeAttachment', { name: a.filename })}
                    onClick={() => setAtts((list) => list.filter((x) => x.id !== a.id))}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t px-2 py-1">
          <EditorToolbar editor={editor} onLink={() => setLinkOpen(true)} />
        </div>
        <footer className="flex shrink-0 items-center gap-1 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
          <SendButton onSend={(sendAt) => void send(sendAt)} disabled={sending} />
          <Tooltip content={t('attach')} side="top">
            <Button variant="ghost" size="icon-sm" aria-label={t('attach')} className="ml-1 text-muted-foreground" onClick={() => fileRef.current?.click()}>
              <Paperclip />
            </Button>
          </Tooltip>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
          <span
            role="status"
            aria-live="polite"
            className={cn('min-w-0 flex-1 truncate px-1 text-xs text-muted-foreground', status === 'error' && 'text-destructive')}
          >
            {status === 'saving' ? t('saving') : status === 'saved' ? t('saved') : status === 'error' ? t('saveFailed') : ''}
          </span>
          <Tooltip content={t('discard')} side="top">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('discard')}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => void discard()}
            >
              <Trash2 />
            </Button>
          </Tooltip>
        </footer>
      </div>

      {dragging && !minimized && (
        <div className="pointer-events-none absolute inset-2 top-12 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-background/90 text-sm font-medium text-primary">
          <Upload className="size-6" />
          {t('dropFiles')}
        </div>
      )}
      <LinkDialog editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />
    </section>
  );
}

// The original message, shown read-only in a sandboxed frame (no scripts).
function QuotedContent({ html, title }: { html: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const srcDoc = useMemo(() => {
    const root = getComputedStyle(document.documentElement);
    const v = (name: string) => root.getPropertyValue(name).trim();
    const dark = document.documentElement.classList.contains('dark');
    const font = getComputedStyle(document.body).fontFamily;
    return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
:root{color-scheme:${dark ? 'dark' : 'light'}}
body{margin:0;font:13px/1.5 ${font};color:${v('--muted-foreground')};background:transparent;overflow-wrap:anywhere}
img{max-width:100%;height:auto}table{max-width:100%}a{color:${v('--primary')}}p{margin:0}
</style></head><body>${html}</body></html>`;
  }, [html]);

  const measure = () => {
    const doc = frame.current?.contentDocument;
    if (doc) setHeight(doc.documentElement.scrollHeight);
  };

  return (
    <iframe
      ref={frame}
      title={title}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      onLoad={() => {
        measure();
        window.setTimeout(measure, 300);
      }}
      style={{ height }}
      className="mt-2 block w-full border-0 bg-transparent"
    />
  );
}
