import { forwardRef } from 'react';
import { ArrowRight, Copy, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import type { RoutingRule } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { routingMessages } from '@/lib/i18n/messages/routing';
import { cn } from '@/lib/utils';
import { KindBadge, PatternChip, TargetChip } from './chips';

const VISIBLE_TARGETS = 3;

interface Props {
  rule: RoutingRule;
  isInternal: (address: string) => boolean;
  highlighted?: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

// One rule as a sentence: [pattern] [type] → [targets], with actions on the right.
export const RuleRow = forwardRef<HTMLLIElement, Props>(({ rule, isInternal, highlighted, onEdit, onDuplicate, onDelete }, ref) => {
  const t = useT(routingMessages);
  const tc = useT(commonMessages);
  const shown = rule.targetAddresses.slice(0, VISIBLE_TARGETS);
  const hidden = rule.targetAddresses.slice(VISIBLE_TARGETS);

  return (
    <li
      ref={ref}
      className={cn(
        'group flex items-start gap-2 px-3 py-3 transition-colors hover:bg-accent/40 sm:px-4',
        highlighted && 'bg-primary/5 ring-1 ring-inset ring-primary/40 hover:bg-primary/5'
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
        <button type="button" onClick={onEdit} className="flex min-w-0 max-w-full items-center gap-2 rounded-md text-left outline-none focus-visible:ring-3">
          <PatternChip rule={rule} />
        </button>
        <KindBadge rule={rule} />
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {shown.map((address) => (
          <TargetChip key={address} address={address} internal={isInternal(address)} />
        ))}
        {hidden.length > 0 && (
          <Tooltip side="top" content={<span className="whitespace-pre-line">{hidden.join('\n')}</span>}>
            <span tabIndex={0} className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-3">
              {t('moreTargets', { n: hidden.length })}
            </span>
          </Tooltip>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          className="hidden text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 sm:inline-flex"
          aria-label={t('edit')}
          title={t('edit')}
          onClick={onEdit}
        >
          <Pencil />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={t('actions')}>
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> {t('edit')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy /> {t('duplicate')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="text-destructive data-[highlighted]:text-destructive [&_svg]:text-destructive">
              <Trash2 /> {tc('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
});
RuleRow.displayName = 'RuleRow';
