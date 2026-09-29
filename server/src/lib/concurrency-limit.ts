/**
 * Lets at most `max` tasks run at once; the rest wait their turn in the order they arrived.
 * A finishing task hands its slot straight to the next waiter, so the count can never go over
 * `max` even when a new call arrives in the same tick.
 */
export function createLimiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];

  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    } else {
      active++;
    }
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
