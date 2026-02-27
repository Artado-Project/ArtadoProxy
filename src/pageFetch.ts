export async function gotoWithRetries(_page: unknown, _url: string, opts?: { signal?: AbortSignal }): Promise<void> {
  if (opts?.signal?.aborted) throw new Error('aborted');
  throw new Error('gotoWithRetries is not available (Playwright removed)');
}
