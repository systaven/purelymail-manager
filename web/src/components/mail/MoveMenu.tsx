import type { ReactNode } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useT } from '@/lib/i18n';
import { mailMessages } from '@/lib/i18n/messages/mail';
import type { Folder } from '@/lib/mail-api';
import { folderIcon } from './FolderPane';
import { useFolderName } from './state';

// "Move to…" dropdown listing every folder but the current one.
export function MoveMenu({ folders, current, onMove, children }: { folders: Folder[] | undefined; current: string; onMove: (path: string) => void; children: ReactNode }) {
  const t = useT(mailMessages);
  const folderName = useFolderName();
  const targets = (folders ?? []).filter((f) => f.path !== current && f.specialUse !== '\\Drafts');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel>{t('moveTo')}</DropdownMenuLabel>
        {targets.map((f) => {
          const Icon = folderIcon(f);
          const depth = !f.specialUse && f.delimiter ? f.path.split(f.delimiter).length - 1 : 0;
          return (
            <DropdownMenuItem key={f.path} onSelect={() => onMove(f.path)} style={{ paddingLeft: 8 + depth * 12 }}>
              <Icon />
              <span className="truncate">{folderName(f)}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
