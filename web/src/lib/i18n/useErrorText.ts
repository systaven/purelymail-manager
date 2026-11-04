import { useCallback } from 'react';
import { ApiClientError } from '../api';
import { format, useLocale } from '.';
import { errorMessages } from './messages/errors';

// Error → text in the viewer's language: known server codes are translated,
// anything else falls back to the error's own message.
export function useErrorText() {
  const { locale } = useLocale();
  return useCallback(
    (error: unknown): string => {
      if (error instanceof ApiClientError && error.code && error.code in errorMessages.en) {
        return format(errorMessages[locale][error.code as keyof typeof errorMessages.en], error.params);
      }
      return error instanceof Error ? error.message : String(error);
    },
    [locale]
  );
}
