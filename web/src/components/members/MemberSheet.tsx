import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ban, Lock, Mail, ShieldCheck, ShieldOff, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { Avatar, Skeleton } from '@/components/ui/misc';
import { Section, Sheet, SheetContent } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import { adminApi, adminKeys } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { membersMessages } from '@/lib/i18n/messages/members';
import { memberKeys, memberLabel, membersApi, type Member, type MemberPatch } from '@/lib/members-api';
import { useAction } from '@/lib/mutation';
import { cn } from '@/lib/utils';
import { DomainChecklist, MemberBadges, Segmented, selectClass, useDateFormat, useRelativeTime } from './shared';

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card px-3 py-2.5">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium tabular-nums">{children}</p>
    </div>
  );
}

function LimitRow({
  label,
  hint,
  custom,
  defaultText,
  disabled,
  onMode,
  children,
}: {
  label: string;
  hint: string;
  custom: boolean;
  defaultText: string;
  disabled: boolean;
  onMode: (custom: boolean) => void;
  children: ReactNode;
}) {
  const t = useT(membersMessages);
  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-40">
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
        <Segmented
          size="sm"
          label={label}
          value={custom ? 'custom' : 'default'}
          onChange={(v) => !disabled && onMode(v === 'custom')}
          options={[
            { value: 'default', label: t('defaultIs', { value: defaultText }) },
            { value: 'custom', label: t('custom') },
          ]}
        />
      </div>
      {custom && <div className="mt-3 border-t pt-3">{children}</div>}
    </div>
  );
}

function QuotaInput({ value, disabled, onSave }: { value: number; disabled: boolean; onSave: (n: number) => void }) {
  const tc = useT(commonMessages);
  const [draft, setDraft] = useState(String(value));
  const n = Number(draft);
  const valid = draft !== '' && Number.isInteger(n) && n >= 0 && n <= 1000;
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && n !== value) onSave(n);
      }}
    >
      <Input type="number" inputMode="numeric" min={0} max={1000} value={draft} onChange={(e) => setDraft(e.target.value)} aria-invalid={!valid} className="w-24" />
      {n !== value && (
        <Button type="submit" size="sm" disabled={!valid || disabled}>
          {tc('save')}
        </Button>
      )}
    </form>
  );
}

function ActionRow({ icon, title, hint, action, tone }: { icon: ReactNode; title: string; hint: string; action: ReactNode; tone?: 'danger' }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3', tone === 'danger' && 'border-destructive/30')}>
      <div className="flex min-w-0 flex-1 basis-52 items-start gap-3">
        <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

// Wraps a disabled control so its reason still shows on hover.
const WithReason = ({ reason, children }: { reason: string | null; children: ReactNode }) =>
  reason ? (
    <Tooltip content={reason} side="top">
      <span tabIndex={0}>{children}</span>
    </Tooltip>
  ) : (
    <>{children}</>
  );

export function MemberSheet({ member, isSelf, onClose }: { member: Member | null; isSelf: boolean; onClose: () => void }) {
  const t = useT(membersMessages);
  const tc = useT(commonMessages);
  const confirm = useConfirm();
  const relative = useRelativeTime();
  const formatDate = useDateFormat();
  const [assignee, setAssignee] = useState('');
  const id = member?.clerkUserId ?? '';
  const label = member ? memberLabel(member) : '';
  const open = Boolean(member);

  const owned = useQuery({ queryKey: memberKeys.memberMailboxes(id), queryFn: () => membersApi.mailboxes(id), enabled: open });
  const all = useQuery({ queryKey: adminKeys.mailboxes, queryFn: adminApi.mailboxes, enabled: open });
  const domains = useQuery({ queryKey: adminKeys.domains, queryFn: adminApi.domains, enabled: open });
  const defaults = useQuery({ queryKey: memberKeys.defaults, queryFn: membersApi.defaults, enabled: open });
  const unowned = (all.data ?? []).filter((m) => m.owner === null).map((m) => m.address).sort();

  const update = useAction((patch: MemberPatch) => membersApi.update(id, patch), { success: t('saved'), invalidate: [memberKeys.members] });
  const setRole = useAction((role: 'admin' | 'guest') => membersApi.update(id, { role }), { success: t('roleChanged'), invalidate: [memberKeys.members] });
  const setDisabled = useAction((disabled: boolean) => membersApi.update(id, { disabled }).then(() => disabled), {
    success: (disabled) => t(disabled ? 'disabledToast' : 'enabledToast'),
    invalidate: [memberKeys.members],
  });
  const assign = useAction((address: string) => membersApi.assign(id, address).then(() => address), {
    success: (mailbox) => t('assigned', { mailbox, member: label }),
    invalidate: [memberKeys.members, memberKeys.memberMailboxes(id), adminKeys.mailboxes, adminKeys.overview],
  });

  if (!member) return <Sheet open={false} onOpenChange={(o) => !o && onClose()} />;
  const busy = update.isPending;
  const d = defaults.data;
  const domainNames = (domains.data ?? []).filter((x) => !x.isShared).map((x) => x.name);

  const askAssign = async () => {
    if (!assignee) return;
    const ok = await confirm({
      title: t('assignConfirmTitle', { mailbox: assignee, member: label }),
      description: t('assignConfirmBody', { member: label }),
      confirmLabel: t('assignConfirm'),
      cancelLabel: tc('cancel'),
      destructive: true,
      typeToConfirm: { value: assignee, prompt: t('typeToConfirm', { value: assignee }) },
    });
    if (ok) assign.mutate(assignee, { onSuccess: () => setAssignee('') });
  };

  const askRole = async () => {
    const promote = member.role !== 'admin';
    const ok = await confirm({
      title: t(promote ? 'makeAdminTitle' : 'removeAdminTitle', { member: label }),
      description: t(promote ? 'makeAdminBody' : 'removeAdminBody'),
      confirmLabel: t(promote ? 'makeAdmin' : 'removeAdmin'),
      cancelLabel: tc('cancel'),
      destructive: !promote,
    });
    if (ok) setRole.mutate(promote ? 'admin' : 'guest');
  };

  const askDisable = async () => {
    if (member.disabled) return setDisabled.mutate(false);
    const ok = await confirm({
      title: t('disableTitle', { member: label }),
      description: t('disableBody'),
      confirmLabel: t('disable'),
      cancelLabel: tc('cancel'),
      destructive: true,
    });
    if (ok) setDisabled.mutate(true);
  };

  const disableReason = member.disabled ? null : isSelf ? t('selfHint') : member.envAdmin ? t('envDisableHint') : null;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent title={label} description={t('joined', { date: formatDate(member.createdAt) })} className="sm:max-w-xl">
        <div className="space-y-8">
          {/* Summary */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={label} className="size-12 text-sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold">{member.name || member.email}</span>
                  <MemberBadges member={member} isSelf={isSelf} />
                </div>
                {member.name && member.email && <p className="truncate text-sm text-muted-foreground">{member.email}</p>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label={t('statMailboxes')}>
                {member.mailboxes} <span className="text-muted-foreground">/ {member.limits.maxMailboxes}</span>
              </Stat>
              <Stat label={t('statPending')}>{member.pendingRequests}</Stat>
              <Stat label={t('statLastSeen')}>{relative(member.lastSeenAt) ?? t('neverSeen')}</Stat>
            </div>
          </div>

          <Section title={t('mailboxes')} description={t('mailboxesHint')}>
            {owned.isPending ? (
              <Skeleton className="h-11 w-full" />
            ) : owned.data?.length ? (
              <ul className="divide-y rounded-lg border">
                {owned.data.map((address) => (
                  <li key={address} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <Mail className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{address}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="size-3" /> {t('private')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">{t('noMailboxes')}</p>
            )}

            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-sm font-medium">{t('assignTitle')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{all.data && !unowned.length ? t('noUnowned') : t('assignHint')}</p>
              <div className="mt-3 flex gap-2">
                <select
                  className={selectClass}
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  disabled={!unowned.length || assign.isPending}
                  aria-label={t('assignTitle')}
                >
                  <option value="">{t('assignPlaceholder')}</option>
                  {unowned.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <Button variant="outline" onClick={askAssign} disabled={!assignee || assign.isPending}>
                  {t('assign')}
                </Button>
              </div>
            </div>
          </Section>

          <Section title={t('limits')} description={t('limitsHint')}>
            <LimitRow
              label={t('quota')}
              hint={t('quotaHint')}
              custom={member.overrides.maxMailboxes !== null}
              defaultText={d ? String(d.maxMailboxes) : '…'}
              disabled={busy}
              onMode={(c) => update.mutate({ maxMailboxes: c ? member.limits.maxMailboxes : null })}
            >
              <QuotaInput
                key={member.overrides.maxMailboxes}
                value={member.limits.maxMailboxes}
                disabled={busy}
                onSave={(maxMailboxes) => update.mutate({ maxMailboxes })}
              />
            </LimitRow>
            <LimitRow
              label={t('approval')}
              hint={t('approvalHint')}
              custom={member.overrides.requiresApproval !== null}
              defaultText={d ? t(d.requiresApproval ? 'yes' : 'no') : '…'}
              disabled={busy}
              onMode={(c) => update.mutate({ requiresApproval: c ? member.limits.requiresApproval : null })}
            >
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <Switch
                  checked={member.limits.requiresApproval}
                  disabled={busy}
                  onCheckedChange={(requiresApproval) => update.mutate({ requiresApproval })}
                />
                {t(member.limits.requiresApproval ? 'yes' : 'no')}
              </label>
            </LimitRow>
            <LimitRow
              label={t('allowedDomains')}
              hint={t('allowedDomainsHint')}
              custom={member.overrides.allowedDomains !== null}
              defaultText={d ? t('domainCount', { n: d.openDomains.length }) : '…'}
              disabled={busy}
              onMode={(c) => update.mutate({ allowedDomains: c ? member.limits.allowedDomains : null })}
            >
              {domains.isPending ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <DomainChecklist
                  domains={domainNames}
                  value={member.limits.allowedDomains}
                  disabled={busy}
                  onChange={(allowedDomains) => update.mutate({ allowedDomains })}
                />
              )}
            </LimitRow>
          </Section>

          <Section title={t('access')}>
            <ActionRow
              icon={<ShieldCheck />}
              title={t('roleAdmin')}
              hint={member.envAdmin ? t('envAdminHint') : t(member.role === 'admin' ? 'roleAdminOn' : 'roleAdminOff')}
              action={
                <WithReason reason={member.envAdmin ? t('envAdminHint') : null}>
                  <Button size="sm" variant="outline" onClick={askRole} disabled={member.envAdmin || setRole.isPending}>
                    {member.role === 'admin' ? <ShieldOff /> : <ShieldCheck />}
                    {t(member.role === 'admin' ? 'removeAdmin' : 'makeAdmin')}
                  </Button>
                </WithReason>
              }
            />
            <ActionRow
              tone={member.disabled ? undefined : 'danger'}
              icon={member.disabled ? <Ban /> : <UserCheck />}
              title={t('account')}
              hint={disableReason ?? t(member.disabled ? 'accountDisabled' : 'accountActive')}
              action={
                <WithReason reason={disableReason}>
                  <Button
                    size="sm"
                    variant={member.disabled ? 'default' : 'destructive'}
                    onClick={askDisable}
                    disabled={Boolean(disableReason) || setDisabled.isPending}
                  >
                    {t(member.disabled ? 'enable' : 'disable')}
                  </Button>
                </WithReason>
              }
            />
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
