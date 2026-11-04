import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Cake, Mail, Phone, Plus, StickyNote, Tag, UserRound, X, Building2, BookUser, type LucideIcon } from 'lucide-react';
import { Dialog as Primitive } from 'radix-ui';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { ErrorBanner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { davApi, davKeys, type AddressBook, type Contact, type ContactInput, type Labeled } from '@/lib/dav-api';
import { useLocale, useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { contactsMessages } from '@/lib/i18n/messages/contacts';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { cn } from '@/lib/utils';
import { ContactAvatar } from './ContactAvatar';
import { useLabelText } from './ContactDetails';
import { applyInput, CJK, fullName, isEmail, validBirthday } from './utils';

const EMAIL_LABELS = ['home', 'work', 'other'];
const PHONE_LABELS = ['cell', 'home', 'work', 'main', 'other'];

type Errors = Partial<Record<'name' | `email${number}` | `phone${number}` | 'birthday', string>>;

interface Form extends ContactInput {
  book: string;
}

const blankRow = (label: string): Labeled => ({ value: '', label });

function initialForm(contact: Contact | null, book: string, group: string | null): Form {
  if (!contact) {
    return {
      book,
      firstName: '',
      lastName: '',
      organization: '',
      title: '',
      emails: [blankRow('home')],
      phones: [blankRow('cell')],
      birthday: '',
      groups: group ? [group] : [],
      note: '',
    };
  }
  return {
    book: contact.addressBook,
    firstName: contact.firstName,
    lastName: contact.lastName,
    organization: contact.organization,
    title: contact.title,
    emails: contact.emails.length ? contact.emails.map((e) => ({ ...e })) : [blankRow('home')],
    phones: contact.phones.length ? contact.phones.map((p) => ({ ...p })) : [blankRow('cell')],
    birthday: contact.birthday,
    groups: [...contact.groups],
    note: contact.note,
  };
}

const toInput = (f: Form): ContactInput => ({
  firstName: f.firstName.trim(),
  lastName: f.lastName.trim(),
  organization: f.organization.trim(),
  title: f.title.trim(),
  emails: f.emails.map((e) => ({ value: e.value.trim(), label: e.label })).filter((e) => e.value),
  phones: f.phones.map((p) => ({ value: p.value.trim(), label: p.label })).filter((p) => p.value),
  birthday: f.birthday,
  groups: f.groups,
  note: f.note.trim(),
});

function Row({ icon: Icon, children, className }: { icon: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-3', className)}>
      <Icon className="mt-2.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
    </div>
  );
}

const FieldError = ({ id, children }: { id?: string; children?: string }) =>
  children ? (
    <p id={id} className="text-xs text-destructive" role="alert">
      {children}
    </p>
  ) : null;

const selectClass =
  'h-9 shrink-0 rounded-md border border-input bg-background pl-2 pr-7 text-sm shadow-xs focus-visible:border-primary focus-visible:ring-3 outline-none';

function LabeledRows({
  rows,
  labels,
  type,
  placeholder,
  addLabel,
  errors,
  errorKey,
  onChange,
}: {
  rows: Labeled[];
  labels: string[];
  type: 'email' | 'tel';
  placeholder: string;
  addLabel: string;
  errors: Errors;
  errorKey: 'email' | 'phone';
  onChange: (rows: Labeled[]) => void;
}) {
  const t = useT(contactsMessages);
  const labelText = useLabelText();
  const id = useId();
  const set = (i: number, patch: Partial<Labeled>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <>
      {rows.map((r, i) => {
        const err = errors[`${errorKey}${i}`];
        // Keep labels we don't offer (fax, pager...) selectable for this row.
        const options = labels.includes(r.label) || !r.label ? labels : [...labels, r.label];
        return (
          <div key={i} className="space-y-1">
            <div className="flex gap-2">
              <select
                aria-label={t('label')}
                className={cn(selectClass, 'w-[6.75rem]')}
                value={r.label || 'other'}
                onChange={(e) => set(i, { label: e.target.value === 'other' ? '' : e.target.value })}
              >
                {options.map((l) => (
                  <option key={l} value={l}>
                    {labelText(l)}
                  </option>
                ))}
              </select>
              <Input
                type={type}
                inputMode={type === 'email' ? 'email' : 'tel'}
                autoComplete="off"
                value={r.value}
                onChange={(e) => set(i, { value: e.target.value })}
                placeholder={placeholder}
                aria-label={placeholder}
                aria-invalid={Boolean(err)}
                aria-describedby={err ? `${id}-${i}` : undefined}
                data-row={`${errorKey}${i}`}
              />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground"
                aria-label={t('remove')}
                title={t('remove')}
                onClick={() => onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ value: '', label: r.label }])}
              >
                <X />
              </Button>
            </div>
            <FieldError id={`${id}-${i}`}>{err}</FieldError>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => {
          onChange([...rows, blankRow(labels[0] === 'cell' ? (rows.length ? 'work' : 'cell') : rows.length ? 'work' : 'home')]);
          requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-row="${errorKey}${rows.length}"]`)?.focus());
        }}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-primary hover:bg-accent"
      >
        <Plus className="size-4" />
        {addLabel}
      </button>
    </>
  );
}

function GroupInput({ value, onChange, known }: { value: string[]; onChange: (groups: string[]) => void; known: string[] }) {
  const t = useT(contactsMessages);
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const add = (raw: string) => {
    const name = raw.trim().replace(/,+$/, '').trim();
    setText('');
    if (!name) return;
    const existing = known.find((k) => k.toLowerCase() === name.toLowerCase()) ?? name;
    if (!value.some((v) => v.toLowerCase() === existing.toLowerCase())) onChange([...value, existing.slice(0, 100)]);
  };
  const q = text.trim().toLowerCase();
  const suggestions = known.filter((k) => !value.includes(k) && (!q || k.toLowerCase().includes(q))).slice(0, 8);
  return (
    <div className="space-y-2">
      <div
        className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-1.5 py-1 shadow-xs transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-3"
        onClick={() => ref.current?.focus()}
      >
        {value.map((g) => (
          <span key={g} className="inline-flex h-6 max-w-full items-center gap-0.5 rounded-full bg-secondary pl-2.5 pr-0.5 text-xs font-medium text-secondary-foreground">
            <span className="truncate">{g}</span>
            <button
              type="button"
              aria-label={t('removeGroup', { group: g })}
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((v) => v !== g));
              }}
              className="inline-flex size-5 items-center justify-center rounded-full opacity-60 hover:bg-foreground/10 hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={ref}
          value={text}
          onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) {
              e.preventDefault();
              add(text);
            } else if (e.key === 'Backspace' && !text && value.length) {
              e.preventDefault();
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => text.trim() && add(text)}
          placeholder={value.length ? '' : t('groupPlaceholder')}
          aria-label={t('addGroup')}
          enterKeyHint="done"
          className="h-7 min-w-[8rem] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(s)}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed px-2 text-xs text-muted-foreground hover:border-solid hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-3" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContactEditor({
  mailbox,
  contact,
  books,
  defaultBook,
  defaultGroup,
  knownGroups,
  onClose,
  onSaved,
}: {
  mailbox: string;
  contact: Contact | null;
  books: AddressBook[];
  defaultBook: string;
  defaultGroup: string | null;
  knownGroups: string[];
  onClose: () => void;
  onSaved: (href: string) => void;
}) {
  const t = useT(contactsMessages);
  const tc = useT(commonMessages);
  const { locale } = useLocale();
  const errorText = useErrorText();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [initial] = useState(() => initialForm(contact, defaultBook, defaultGroup));
  const [form, setForm] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  // Family name first for CJK names, and for new contacts in CJK languages.
  const familyFirst = contact ? CJK.test(contact.lastName + contact.firstName) : locale !== 'en';
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const errors = useMemo<Errors>(() => {
    const e: Errors = {};
    const input = toInput(form);
    if (!input.firstName && !input.lastName && !input.organization && !input.emails.length) e.name = t('errNeedName');
    form.emails.forEach((r, i) => {
      if (r.value.trim() && !isEmail(r.value)) e[`email${i}`] = t('errEmail');
    });
    form.phones.forEach((r, i) => {
      if (r.value.trim() && !/\d/.test(r.value)) e[`phone${i}`] = t('errPhone');
    });
    if (!validBirthday(form.birthday)) e.birthday = t('errBirthday');
    return e;
  }, [form, t]);
  const shown: Errors = submitted ? errors : {};

  const save = useMutation({
    mutationFn: async (input: ContactInput) => {
      if (contact) return { ...(await davApi.updateContact(mailbox, contact, input)), created: false };
      return { ...(await davApi.createContact(mailbox, form.book, input)), created: true };
    },
    onSuccess: (result, input) => {
      const key = davKeys.contacts(mailbox);
      const base: Contact = contact ?? {
        href: result.href,
        etag: null,
        addressBook: form.book,
        uid: '',
        name: '',
        firstName: '',
        lastName: '',
        emails: [],
        phones: [],
        organization: '',
        title: '',
        note: '',
        birthday: '',
        groups: [],
        photo: null,
      };
      const next = { ...applyInput(base, input), href: result.href, etag: result.etag };
      qc.setQueryData<Contact[]>(key, (old) => (old ? (contact ? old.map((c) => (c.href === contact.href ? next : c)) : [...old, next]) : old));
      qc.invalidateQueries({ queryKey: key });
      toast.success(result.created ? t('created') : t('saved'));
      onSaved(result.href);
    },
  });

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const requestClose = async () => {
    if (save.isPending) return;
    if (dirty) {
      const ok = await confirm({ title: t('discardTitle'), description: t('discardBody'), confirmLabel: t('discard'), cancelLabel: t('keepEditing'), destructive: true });
      if (!ok) return;
    }
    onClose();
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) {
      // Focus the first field with a problem.
      const first = Object.keys(errors)[0];
      requestAnimationFrame(() => {
        const el = first === 'name' ? firstRef.current : document.querySelector<HTMLInputElement>(first === 'birthday' ? '[data-row="birthday"]' : `[data-row="${first}"]`);
        el?.focus();
      });
      return;
    }
    save.mutate(toInput(form));
  };

  const previewName = fullName(form.firstName, form.lastName) || form.organization || form.emails.find((e) => e.value.trim())?.value || '';
  const nameInputs = [
    <Input
      key="first"
      ref={familyFirst ? undefined : firstRef}
      value={form.firstName}
      onChange={(e) => set({ firstName: e.target.value })}
      placeholder={t('firstName')}
      aria-label={t('firstName')}
      aria-invalid={Boolean(shown.name)}
      autoComplete="off"
      maxLength={200}
    />,
    <Input
      key="last"
      ref={familyFirst ? firstRef : undefined}
      value={form.lastName}
      onChange={(e) => set({ lastName: e.target.value })}
      placeholder={t('lastName')}
      aria-label={t('lastName')}
      aria-invalid={Boolean(shown.name)}
      autoComplete="off"
      maxLength={200}
    />,
  ];
  if (familyFirst) nameInputs.reverse();

  return (
    <Primitive.Root open onOpenChange={(open) => !open && requestClose()}>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <Primitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            if (window.matchMedia('(pointer: fine)').matches) firstRef.current?.focus();
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
          }}
          className={cn(
            'fixed inset-0 z-50 flex flex-col bg-popover text-popover-foreground outline-none',
            'sm:inset-auto sm:left-1/2 sm:top-[6vh] sm:max-h-[88vh] sm:w-[calc(100vw-2rem)] sm:max-w-xl sm:-translate-x-1/2 sm:animate-in sm:rounded-xl sm:border sm:shadow-2xl'
          )}
        >
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
            <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-5">
              <Button variant="ghost" size="icon" className="-ml-1 sm:hidden" onClick={requestClose} aria-label={tc('cancel')}>
                <X />
              </Button>
              <Primitive.Title className="min-w-0 flex-1 truncate text-base font-semibold">{contact ? t('editContact') : t('newContact')}</Primitive.Title>
              <Button type="submit" size="sm" className="sm:hidden" disabled={save.isPending}>
                {contact ? tc('save') : t('create')}
              </Button>
              <Primitive.Close asChild>
                <button
                  type="button"
                  className="hidden rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground sm:block"
                  aria-label={tc('close')}
                  onClick={(e) => {
                    e.preventDefault();
                    requestClose();
                  }}
                >
                  <X className="size-4" />
                </button>
              </Primitive.Close>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
              {save.error && <ErrorBanner message={errorText(save.error)} />}

              <div className="flex gap-3">
                {previewName || contact?.photo ? (
                  <ContactAvatar name={previewName} photo={contact?.photo} className="mt-0.5 size-10 text-sm" />
                ) : (
                  <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
                    <UserRound className="size-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">{nameInputs}</div>
                  <FieldError>{shown.name}</FieldError>
                </div>
              </div>

              <Row icon={Building2}>
                <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                  <Input value={form.organization} onChange={(e) => set({ organization: e.target.value })} placeholder={t('organization')} aria-label={t('organization')} maxLength={300} autoComplete="off" />
                  <Input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder={t('jobTitle')} aria-label={t('jobTitle')} maxLength={300} autoComplete="off" />
                </div>
              </Row>

              <Row icon={Mail}>
                <LabeledRows rows={form.emails} labels={EMAIL_LABELS} type="email" placeholder={t('email')} addLabel={t('addEmail')} errors={shown} errorKey="email" onChange={(emails) => set({ emails })} />
              </Row>

              <Row icon={Phone}>
                <LabeledRows rows={form.phones} labels={PHONE_LABELS} type="tel" placeholder={t('phone')} addLabel={t('addPhone')} errors={shown} errorKey="phone" onChange={(phones) => set({ phones })} />
              </Row>

              <Row icon={Cake}>
                <label className="flex items-center gap-3">
                  <span className="w-[6.75rem] shrink-0 text-sm text-muted-foreground">{t('birthday')}</span>
                  <Input
                    type="date"
                    data-row="birthday"
                    value={form.birthday}
                    onChange={(e) => set({ birthday: e.target.value })}
                    aria-invalid={Boolean(shown.birthday)}
                    min="1600-01-01"
                    max="2999-12-31"
                    className="w-auto min-w-0 flex-1 sm:max-w-[12rem]"
                  />
                </label>
                <FieldError>{shown.birthday}</FieldError>
              </Row>

              <Row icon={Tag}>
                <GroupInput value={form.groups} onChange={(groups) => set({ groups })} known={knownGroups} />
              </Row>

              <Row icon={StickyNote}>
                <textarea
                  value={form.note}
                  onChange={(e) => set({ note: e.target.value })}
                  placeholder={t('notePlaceholder')}
                  aria-label={t('note')}
                  rows={3}
                  maxLength={20000}
                  className="flex min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3"
                />
              </Row>

              {!contact && books.length > 1 && (
                <Row icon={BookUser}>
                  <label className="flex items-center gap-3">
                    <span className="w-[6.75rem] shrink-0 text-sm text-muted-foreground">{t('addressBook')}</span>
                    <select className={cn(selectClass, 'min-w-0 flex-1')} value={form.book} onChange={(e) => set({ book: e.target.value })}>
                      {books.map((b) => (
                        <option key={b.href} value={b.href}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </Row>
              )}
            </div>

            <div className="hidden shrink-0 items-center justify-end gap-2 border-t px-5 py-3 sm:flex">
              <span className="mr-auto hidden text-xs text-muted-foreground pointer-fine:inline">{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} ↵</span>
              <Button variant="outline" onClick={requestClose} disabled={save.isPending}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? tc('loading') : contact ? tc('save') : t('create')}
              </Button>
            </div>
          </form>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
