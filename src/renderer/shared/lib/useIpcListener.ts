import { useEffect, useRef } from 'react';

/**
 * Subscribes to a `window.api.events.on*` push channel for the lifetime of
 * the calling component, unregistering automatically on unmount. Keeps the
 * latest `callback` in a ref so callers don't need to memoize it themselves.
 */
export function useIpcListener<T>(
  subscribe: (cb: (payload: T) => void) => () => void,
  callback: (payload: T) => void,
): void {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    // Intentionally mount-only: `subscribe` is typically a fresh arrow
    // wrapping a stable `window.api.events.on*` method, so re-running this
    // on every identity change would just churn resubscribes. `callbackRef`
    // above is what keeps the handler itself up to date.
    const unsubscribe = subscribe((payload) => callbackRef.current(payload));
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
