import type { ComponentProps, ReactNode } from 'react';
import { X } from 'lucide-react';
import { Dialog as Primitive } from 'radix-ui';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { cn } from '@/lib/utils';

export const Sheet = Primitive.Root;

// A panel that slides in from the right (full screen on phones), for details and editing.
export function SheetContent({
  title,
  description,
  children,
  footer,
  className,
  ...props
}: ComponentProps<typeof Primitive.Content> & { title: ReactNode; description?: ReactNode; footer?: ReactNode }) {
  const tc = useT(commonMessages);
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
      <Primitive.Content
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'fixed inset-y-0 right-0 z-50 outline-none focus-visible:ring-0 flex w-full flex-col border-l bg-background shadow-2xl sm:max-w-lg data-[state=open]:animate-[sheet-in_200ms_ease-out]',
          className
        )}
        {...props}
      >
        <div className="flex items-start gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <Primitive.Title className="truncate text-base font-semibold">{title}</Primitive.Title>
            {description && <Primitive.Description className="mt-0.5 text-sm text-muted-foreground">{description}</Primitive.Description>}
          </div>
          <Primitive.Close className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={tc('close')}>
            <X className="size-4" />
          </Primitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t px-5 py-3">{footer}</div>}
      </Primitive.Content>
    </Primitive.Portal>
  );
}

// A titled group of rows inside a sheet or page.
export function Section({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3', className)}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
