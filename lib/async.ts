/** Limit simultaneous page fetches and preserve input order. */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new RangeError("concurrency must be a positive integer");
  const results = new Array<R>(items.length);
  let cursor = 0;
  let failed = false;
  let firstError: unknown;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (!failed && cursor < items.length) {
        const index = cursor++;
        try {
          signal?.throwIfAborted();
          results[index] = await run(items[index], index);
        } catch (error) {
          failed = true;
          firstError ??= error;
        }
      }
    }),
  );
  if (failed) throw firstError;
  return results;
}
