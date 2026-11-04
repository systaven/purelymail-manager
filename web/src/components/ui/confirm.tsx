import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertDialog } from 'radix-ui';
import { Button } from './button';
import { Input } from './input';

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  // The user must type this text (e.g. the domain name) before confirming.
  typeToConfirm?: { value: string; prompt: string };
}

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);

// const ok = await confirm({...}): a promise-based replacement for window.confirm.
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState('');
  const resolver = useRef<(value: boolean) => void>(undefined);

  const confirm = useCallback((next: ConfirmOptions) => {
    setTyped('');
    setOptions(next);
    return new Promise<boolean>((resolve) => (resolver.current = resolve));
  }, []);

  const close = (value: boolean) => {
    resolver.current?.(value);
    setOptions(null);
  };

  const blocked = Boolean(options?.typeToConfirm && typed.trim() !== options.typeToConfirm.value);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog.Root open={Boolean(options)} onOpenChange={(open) => !open && close(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
          <AlertDialog.Content className="fixed left-1/2 top-[20vh] z-50 outline-none focus-visible:ring-0 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 animate-in rounded-xl border bg-popover p-5 text-popover-foreground shadow-2xl">
            <AlertDialog.Title className="text-base font-semibold">{options?.title}</AlertDialog.Title>
            {options?.description && (
              <AlertDialog.Description asChild>
                <div className="mt-2 text-sm text-muted-foreground">{options.description}</div>
              </AlertDialog.Description>
            )}
            {options?.typeToConfirm && (
              <div className="mt-4 space-y-2">
                <p className="text-sm">{options.typeToConfirm.prompt}</p>
                <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={options.typeToConfirm.value} />
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="outline">{options?.cancelLabel}</Button>
              </AlertDialog.Cancel>
              <Button variant={options?.destructive ? 'destructive' : 'default'} disabled={blocked} onClick={() => close(true)}>
                {options?.confirmLabel}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  );
}
