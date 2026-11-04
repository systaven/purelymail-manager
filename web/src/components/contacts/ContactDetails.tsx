import type { ReactNode } from 'react';
import { ArrowLeft, BookUser, Cake, Copy, Download, Mail, MoreHorizontal, Pencil, Phone, StickyNote, Tag, Trash2, UserRound, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CopyButton } from '@/components/ui/feedback';
import { Kbd } from '@/components/ui/misc';
import type { Contact } from '@/lib/dav-api';
import { useLocale, useT } from '@/lib/i18n';
import { contactsMessages } from '@/lib/i18n/messages/contacts';
import { cn } from '@/lib/utils';
import { ContactAvatar } from './ContactAvatar';
import { displayName, downloadVCards, formatBirthday, isCompanyOnly } from './utils';

const LABEL_KEYS = ['home', 'work', 'cell', 'main', 'other', 'fax', 'pager'] as const;

export function useLabelText() {
  const t = useT(contactsMessages);
  return (label: string) => ((LABEL_KEYS as readonly string[]).includes(label) ? t(`label_${label as (typeof LABEL_KEYS)[number]}`) : label);
}

function QuickAction({ icon: Icon, label, onClick, href, disabled }: { icon: LucideIcon; label: string; onClick?: () => void; href?: string; disabled?: boolean }) {
  const inner = (
    <>
      <span
        className={cn(
          'flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground',
          disabled && 'bg-muted text-muted-foreground group-hover:bg-muted group-hover:text-muted-foreground'
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="max-w-20 truncate text-xs font-medium">{label}</span>
    </>
  );
  const className = cn('group flex w-20 flex-col items-center gap-1.5 rounded-lg py-1 outline-none focus-visible:ring-3', disabled && 'pointer-events-none opacity-50');
  return href && !disabled ? (
    <a href={href} className={className}>
      {inner}
    </a>
  ) : (
    <button type="button" className={className} onClick={onClick} disabled={disabled} aria-disabled={disabled}>
      {inner}
    </button>
  );
}

function Field({ icon: Icon, label, children }: { icon: LucideIcon; label?: string; children: ReactNode }) {
  return (
    <div className="group flex items-start gap-3 px-4 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        {children}
        {label && <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>}
      </div>
    </div>
  );
}

export function ContactDetails({
  contact,
  bookName,
  onBack,
  onEdit,
  onDelete,
  onEmail,
  onGroup,
}: {
  contact: Contact;
  bookName: string | null;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onEmail: (address: string) => void;
  onGroup: (group: string) => void;
}) {
  const t = useT(contactsMessages);
  const { locale } = useLocale();
  const labelText = useLabelText();
  const name = displayName(contact);
  const subtitle = [contact.title, isCompanyOnly(contact) ? '' : contact.organization].filter(Boolean).join(' · ');
  const email = contact.emails[0]?.value;
  const phone = contact.phones[0]?.value;
  const telHref = (v: string) => `tel:${v.replace(/[^\d+*#,;]/g, '')}`;
  const hasDetails = contact.emails.length || contact.phones.length || contact.birthday || contact.groups.length || contact.note;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 px-2">
        <Button variant="ghost" size="icon" className="@3xl:hidden" onClick={onBack} aria-label={t('back')}>
          <ArrowLeft />
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit} title={`${t('edit')} (E)`}>
            <Pencil />
            {t('edit')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('more')} title={t('more')} className="text-muted-foreground">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => downloadVCards([contact], name || 'contact')}>
                <Download />
                {t('exportVcf')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onDelete} className="text-destructive data-[highlighted]:text-destructive [&_svg]:!text-destructive">
                <Trash2 />
                {t('delete')}
                <Kbd className="ml-auto hidden pointer-fine:inline-flex">#</Kbd>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-2 @3xl:px-8">
          <div className="flex flex-col items-center text-center">
            <ContactAvatar name={name} photo={contact.photo} className="size-24 text-3xl shadow-sm ring-4 ring-background" />
            <h2 className="mt-4 max-w-full break-words text-2xl font-semibold tracking-tight">{name || t('noName')}</h2>
            {subtitle && <p className="mt-1 max-w-full break-words text-sm text-muted-foreground">{subtitle}</p>}

            <div className="mt-5 flex justify-center gap-2">
              <QuickAction icon={Mail} label={t('emailAction')} onClick={() => email && onEmail(email)} disabled={!email} />
              <QuickAction
                icon={Copy}
                label={t('copyEmail')}
                disabled={!email}
                onClick={async () => {
                  if (!email) return;
                  try {
                    await navigator.clipboard.writeText(email);
                    toast.success(t('copied'));
                  } catch {
                    // Clipboard blocked.
                  }
                }}
              />
              <QuickAction icon={Phone} label={t('call')} href={phone ? telHref(phone) : undefined} disabled={!phone} />
            </div>
          </div>

          {hasDetails ? (
            <div className="mt-7 divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
              {contact.emails.map((e, i) => (
                <Field key={`e${i}`} icon={Mail} label={labelText(e.label) || t('email')}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEmail(e.value)}
                      className="min-w-0 truncate text-left text-sm text-primary hover:underline"
                      title={t('sendEmail')}
                    >
                      {e.value}
                    </button>
                    <CopyButton value={e.value} label={t('copyEmail')} copiedText={t('copied')} className="-my-1 ml-auto size-7 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100" />
                  </div>
                </Field>
              ))}
              {contact.phones.map((p, i) => (
                <Field key={`p${i}`} icon={Phone} label={labelText(p.label) || t('phone')}>
                  <div className="flex items-center gap-1">
                    <a href={telHref(p.value)} className="min-w-0 truncate text-sm tabular-nums text-primary hover:underline">
                      {p.value}
                    </a>
                    <CopyButton value={p.value} label={t('copyPhone')} copiedText={t('copied')} className="-my-1 ml-auto size-7 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100" />
                  </div>
                </Field>
              ))}
              {contact.birthday && (
                <Field icon={Cake} label={t('birthday')}>
                  <div className="text-sm">{formatBirthday(contact.birthday, locale)}</div>
                </Field>
              )}
              {contact.groups.length > 0 && (
                <Field icon={Tag} label={t('groups')}>
                  <div className="flex flex-wrap gap-1.5">
                    {contact.groups.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => onGroup(g)}
                        className="inline-flex h-6 items-center rounded-full bg-secondary px-2.5 text-xs font-medium text-secondary-foreground hover:bg-accent"
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              {contact.note && (
                <Field icon={StickyNote} label={t('note')}>
                  <p className="whitespace-pre-wrap break-words text-sm">{contact.note}</p>
                </Field>
              )}
            </div>
          ) : (
            <div className="mt-7 flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-8 text-center">
              <UserRound className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('noDetails')}</p>
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil />
                {t('addDetails')}
              </Button>
            </div>
          )}

          {bookName && (
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <BookUser className="size-3.5" />
              {bookName}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function DetailsPlaceholder({ hasContacts }: { hasContacts: boolean }) {
  const t = useT(contactsMessages);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
        <UserRound className="size-7" />
      </span>
      <p className="text-sm font-medium text-foreground">{hasContacts ? t('selectContact') : t('nothingSelected')}</p>
      <p className="hidden items-center gap-1.5 text-xs pointer-fine:flex">
        <Kbd>J</Kbd> <Kbd>K</Kbd> {t('toNavigate')} · <Kbd>?</Kbd> {t('forShortcuts')}
      </p>
    </div>
  );
}
