/**
 * Beta S256 — `mapConcurrent`: `worker` over `items`, at most `limit` in
 * flight, results in item order.
 *
 * The shape is `watermark-batch-service.ts`'s still pool, lifted out so the
 * timeline's normalize stage can use it without a second copy of the
 * `inFlight` / `Promise.race` dance. One difference, and it is the whole
 * reason this is not simply `Promise.all` over a sliced array: a slice waits
 * for its slowest member before the next slice starts, so a 13-second still
 * next to three 2-second ones leaves three slots idle for eleven seconds.
 * This refills a slot the moment it frees.
 *
 * ## Failure
 *
 * Fail-fast, in the sense that matters for a render: the **first** rejection
 * stops new work from starting and is what the returned promise rejects
 * with. It does not reject until everything already in flight has settled —
 * a caller must never see the pool fail while a worker it started is still
 * writing to the work dir it is about to delete. `onFailure` fires once, at
 * the moment of that first rejection, so the caller can stop the in-flight
 * work rather than wait for it; later rejections are dropped, the first is
 * the cause.
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onFailure?: () => void,
): Promise<R[]> {
  const slots = Math.max(1, Math.floor(limit));
  const results: R[] = new Array<R>(items.length);
  const inFlight = new Set<Promise<void>>();
  let next = 0;
  let failed = false;
  let failure: unknown;

  while ((next < items.length && !failed) || inFlight.size > 0) {
    while (next < items.length && !failed && inFlight.size < slots) {
      const index = next;
      next += 1;
      const task: Promise<void> = worker(items[index], index)
        .then(
          (result) => {
            results[index] = result;
          },
          (error: unknown) => {
            if (failed) return;
            failed = true;
            failure = error;
            onFailure?.();
          },
        )
        .finally(() => {
          inFlight.delete(task);
        });
      inFlight.add(task);
    }
    if (inFlight.size === 0) break;
    await Promise.race(inFlight);
  }

  if (failed) throw failure;
  return results;
}
