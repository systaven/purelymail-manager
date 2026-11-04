import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/misc';
import { useT } from '@/lib/i18n';
import { contactsMessages } from '@/lib/i18n/messages/contacts';

const SHORTCUTS = [
  [['J'], 'kNext'],
  [['K'], 'kPrev'],
  [['Enter', 'O'], 'kOpen'],
  [['Esc'], 'kBack'],
  [['E'], 'edit'],
  [['N', 'C'], 'kNew'],
  [['#', 'Del'], 'delete'],
  [['/'], 'kSearch'],
  [['?'], 'kHelp'],
] as const;

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT(contactsMessages);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5" aria-describedby={undefined}>
        <DialogTitle>{t('shortcuts')}</DialogTitle>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{t(label)}</dt>
              <dd className="flex gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
