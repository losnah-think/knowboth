/** Retry only explicitly recoverable failures, within the caller's deadline. */
export async function retry<T>(
  run: () => Promise<T>,
  retryable: (error: unknown) => boolean,
  signal: AbortSignal,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    signal.throwIfAborted();
    try {
      return await run();
    } catch (error) {
      if (signal.aborted || attempt === 3 || !retryable(error)) throw error;
    }
  }
}
