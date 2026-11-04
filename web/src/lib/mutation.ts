import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useErrorText } from './i18n/useErrorText';

// A mutation that shows a toast on success or failure and refreshes the given
// queries afterwards.
export function useAction<TArgs, TResult = unknown>(
  fn: (args: TArgs) => Promise<TResult>,
  {
    success,
    invalidate = [],
    // Off when the form shows the error itself.
    errorToast = true,
  }: { success?: string | ((result: TResult) => string); invalidate?: QueryKey[]; errorToast?: boolean } = {}
) {
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      if (success) toast.success(typeof success === 'function' ? success(result) : success);
    },
    onError: (error) => {
      if (errorToast) toast.error(errorText(error));
    },
    onSettled: () => Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
}
