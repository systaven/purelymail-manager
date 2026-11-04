import { useRef, useState, type FormEvent } from 'react';
import type { UserResource } from '@clerk/react/types';
import { Camera, ShieldCheck, Trash2, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar } from '@/components/ui/misc';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { InlineError, Pill, Section, Spinner, useInstanceSettings, useRefreshServerSession, useTask } from './shared';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const displayName = (user: UserResource) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.primaryEmailAddress?.emailAddress || '';

export function UserAvatar({ user, className }: { user: UserResource; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (user.hasImage && user.imageUrl && broken !== user.imageUrl) {
    return (
      <img
        src={user.imageUrl}
        alt=""
        onError={() => setBroken(user.imageUrl)}
        className={cn('size-8 shrink-0 rounded-full bg-muted object-cover', className)}
      />
    );
  }
  return <Avatar name={displayName(user) || '?'} className={className} />;
}

export function ProfileSection({ user }: { user: UserResource }) {
  const t = useT(accountMessages);
  const { isAdmin } = useSession();
  const settings = useInstanceSettings();
  const refreshSession = useRefreshServerSession();
  const image = useTask();
  const save = useTask();
  const fileRef = useRef<HTMLInputElement>(null);

  const showUsername = settings.usernames === true || user.username != null;
  const showNames = settings.firstName !== false || settings.lastName !== false || Boolean(user.firstName || user.lastName);

  const [first, setFirst] = useState(user.firstName ?? '');
  const [last, setLast] = useState(user.lastName ?? '');
  const [username, setUsername] = useState(user.username ?? '');
  const dirty =
    first.trim() !== (user.firstName ?? '') || last.trim() !== (user.lastName ?? '') || (showUsername && username.trim() !== (user.username ?? ''));

  const reset = () => {
    setFirst(user.firstName ?? '');
    setLast(user.lastName ?? '');
    setUsername(user.username ?? '');
    save.setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || save.pending) return;
    const params: { firstName: string; lastName: string; username?: string } = { firstName: first.trim(), lastName: last.trim() };
    if (showUsername && username.trim() !== (user.username ?? '')) params.username = username.trim();
    const result = await save.run(() => user.update(params), { success: t('profileSaved'), inline: true });
    if (result.ok) {
      setFirst(params.firstName);
      setLast(params.lastName);
      if (params.username !== undefined) setUsername(params.username);
      await refreshSession();
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return image.setError(t('imageNotImage'));
    if (file.size > MAX_IMAGE_BYTES) return image.setError(t('errImageTooLarge'));
    await image.run(async () => {
      await user.setProfileImage({ file });
      await user.reload();
    }, { success: t('photoUpdated'), inline: true });
  };

  const removeImage = () =>
    image.run(async () => {
      await user.setProfileImage({ file: null });
      await user.reload();
    }, { success: t('photoRemoved'), inline: true });

  const email = user.primaryEmailAddress?.emailAddress;

  return (
    <Section id="profile" title={t('profile')} description={t('profileHint')}>
      <div className="flex items-start gap-4 px-5 py-5 sm:items-center sm:gap-5">
        <div className="relative w-fit shrink-0">
          <UserAvatar user={user} className="size-14 text-lg sm:size-18 sm:text-xl" />
          {image.pending && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70 text-primary">
              <Spinner className="size-5" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-lg font-semibold tracking-tight">{displayName(user)}</p>
            <Pill tone={isAdmin ? 'primary' : 'neutral'}>
              {isAdmin ? <ShieldCheck className="size-3" /> : <UserIcon className="size-3" />}
              {isAdmin ? t('roleAdmin') : t('roleMember')}
            </Pill>
          </div>
          {email && <p className="truncate text-sm text-muted-foreground">{email}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button size="sm" variant="outline" disabled={image.pending} onClick={() => fileRef.current?.click()}>
              <Camera /> {user.hasImage ? t('changePhoto') : t('uploadPhoto')}
            </Button>
            {user.hasImage && (
              <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={image.pending} onClick={removeImage}>
                <Trash2 /> {t('removePhoto')}
              </Button>
            )}
          </div>
          <InlineError message={image.error} className="mt-2" />
        </div>
      </div>

      {(showNames || showUsername) && (
        <form onSubmit={submit} className="space-y-4 px-5 py-5">
          {showNames && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="acc-first">{t('firstName')}</Label>
                <Input id="acc-first" autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={256} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="acc-last">{t('lastName')}</Label>
                <Input id="acc-last" autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} maxLength={256} />
              </div>
            </div>
          )}
          {showUsername && (
            <div className="space-y-2 sm:max-w-[calc(50%-0.5rem)]">
              <Label htmlFor="acc-username">{t('username')}</Label>
              <Input
                id="acc-username"
                autoComplete="username"
                spellCheck={false}
                autoCapitalize="none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          )}
          <InlineError message={save.error} />
          <div className="flex items-center justify-end gap-2">
            {dirty && (
              <Button variant="ghost" onClick={reset} disabled={save.pending}>
                {t('cancel')}
              </Button>
            )}
            <Button type="submit" disabled={!dirty || save.pending}>
              {save.pending && <Spinner />} {t('save')}
            </Button>
          </div>
        </form>
      )}
    </Section>
  );
}
