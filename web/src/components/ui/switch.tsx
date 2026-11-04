import type { ComponentProps } from 'react';
import { Switch as Primitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Switch = ({ className, ...props }: ComponentProps<typeof Primitive.Root>) => (
  <Primitive.Root
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary',
      className
    )}
    {...props}
  >
    <Primitive.Thumb className="pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
  </Primitive.Root>
);
