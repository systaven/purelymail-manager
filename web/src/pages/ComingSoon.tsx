import type { LucideIcon } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';

export function ComingSoon({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  const t = useT(commonMessages);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-primary">
        <Icon className="size-6" />
      </span>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t('comingSoonBody')}</p>
      <span className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">{t('comingSoon')}</span>
    </div>
  );
}
