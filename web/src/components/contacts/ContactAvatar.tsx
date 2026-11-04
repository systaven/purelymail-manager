import { Avatar } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

// The contact's photo, else initials on a colour that stays the same for the name.
export function ContactAvatar({ name, photo, className }: { name: string; photo?: string | null; className?: string }) {
  if (photo) return <img src={photo} alt="" aria-hidden className={cn('size-8 shrink-0 rounded-full bg-muted object-cover', className)} />;
  return <Avatar name={name || '?'} className={className} />;
}
