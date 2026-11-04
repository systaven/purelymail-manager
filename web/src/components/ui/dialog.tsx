import type { ComponentProps } from 'react';
import { Dialog as Primitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;
export const DialogTitle = ({ className, ...props }: ComponentProps<typeof Primitive.Title>) => (
  <Primitive.Title className={cn('text-base font-semibold', className)} {...props} />
);
export const DialogDescription = ({ className, ...props }: ComponentProps<typeof Primitive.Description>) => (
  <Primitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
);

export const DialogContent = ({ className, ...props }: ComponentProps<typeof Primitive.Content>) => (
  <Primitive.Portal>
    <Primitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
    <Primitive.Content
      className={cn(
        'fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 animate-in rounded-xl border bg-popover text-popover-foreground shadow-2xl',
        className
      )}
      {...props}
    />
  </Primitive.Portal>
);
