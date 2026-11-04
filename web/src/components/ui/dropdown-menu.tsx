import type { ComponentProps } from 'react';
import { DropdownMenu as Primitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuGroup = Primitive.Group;
export const DropdownMenuSub = Primitive.Sub;
export const DropdownMenuRadioGroup = Primitive.RadioGroup;

export const DropdownMenuContent = ({ className, sideOffset = 6, ...props }: ComponentProps<typeof Primitive.Content>) => (
  <Primitive.Portal>
    <Primitive.Content
      sideOffset={sideOffset}
      className={cn('z-50 min-w-48 animate-in overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg', className)}
      {...props}
    />
  </Primitive.Portal>
);

const itemClass =
  'relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground';

export const DropdownMenuItem = ({ className, ...props }: ComponentProps<typeof Primitive.Item>) => (
  <Primitive.Item className={cn(itemClass, className)} {...props} />
);

export const DropdownMenuRadioItem = ({ className, children, ...props }: ComponentProps<typeof Primitive.RadioItem>) => (
  <Primitive.RadioItem className={cn(itemClass, 'pl-7', className)} {...props}>
    <Primitive.ItemIndicator className="absolute left-2.5 size-1.5 rounded-full bg-foreground" />
    {children}
  </Primitive.RadioItem>
);

export const DropdownMenuSubTrigger = ({ className, ...props }: ComponentProps<typeof Primitive.SubTrigger>) => (
  <Primitive.SubTrigger className={cn(itemClass, 'data-[state=open]:bg-accent', className)} {...props} />
);

export const DropdownMenuSubContent = ({ className, ...props }: ComponentProps<typeof Primitive.SubContent>) => (
  <Primitive.Portal>
    <Primitive.SubContent
      className={cn('z-50 min-w-40 animate-in rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg', className)}
      {...props}
    />
  </Primitive.Portal>
);

export const DropdownMenuLabel = ({ className, ...props }: ComponentProps<typeof Primitive.Label>) => (
  <Primitive.Label className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)} {...props} />
);

export const DropdownMenuSeparator = ({ className, ...props }: ComponentProps<typeof Primitive.Separator>) => (
  <Primitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
);
