// Riding out short outages on the client's photo page.
//
// A request that failed once used to end the visit: the page said the link
// had expired, or showed no photos, until the client reloaded. Requests are
// now tried again for about 15 seconds before the page says anything.

/** Waits between tries: about 15 seconds in all. */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

/** React Query options for the client page's queries. */
export const CLIENT_QUERY_RETRY = {
  retry: RETRY_DELAYS_MS.length,
  retryDelay: (attempt: number) => RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)],
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs the task, trying again after each delay while it fails. */
export async function withRetries<T>(task: () => Promise<T>, delays: number[] = RETRY_DELAYS_MS): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= delays.length) throw error;
      await wait(delays[attempt]);
    }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a link's token could be a session's. One that cannot is a link
 * that does not exist, and is not worth asking the database about again.
 */
export const isShareToken = (token: string | undefined): token is string => !!token && UUID.test(token);
