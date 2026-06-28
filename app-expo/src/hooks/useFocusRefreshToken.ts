import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * A counter that increments each time the screen regains focus. Pass it as a
 * screen's `refreshToken` prop so the screen reloads its data on focus, instead
 * of repeating the same `useState` + `useFocusEffect` boilerplate in every route.
 */
export function useFocusRefreshToken(): number {
  const [token, setToken] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setToken((current) => current + 1);
    }, []),
  );
  return token;
}
