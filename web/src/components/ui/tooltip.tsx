import type { ReactNode } from 'react';
import { Tooltip as Primitive } from 'radix-ui';

export const TooltipProvider = Primitive.Provider;

export function Tooltip({ content, side = 'right', children }: { content: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left'; children: ReactNode }) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content side={side} sideOffset={8} className="z-50 animate-in rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md">
          {content}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
