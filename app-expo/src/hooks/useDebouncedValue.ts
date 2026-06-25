import { useEffect, useState } from 'react';

/**
 * Returns `value` delayed by `delayMs`: it only updates once the input has
 * stopped changing for that long. Used to debounce the search box so the list
 * refetches when the user pauses typing rather than on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debounced;
}
