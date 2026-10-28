import { AiError } from "./types";

/** Port of v1 fetchRetry5xx (index.html:5306): a 5xx is retried on the same request after 0.7 s, then 1.4 s. */
export async function fetchRetry5xx(
  doFetch: () => Promise<Response>,
  tries = 3,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((res) => setTimeout(res, ms))
): Promise<Response> {
  let r!: Response;
  for (let i = 0; i < tries; i++) {
    r = await doFetch();
    if (r.status < 500 || r.status > 599) return r;
    if (i < tries - 1) await sleep(700 * (i + 1));
  }
  return r;
}

/** POST with the 5xx retry. A thrown fetch is a network failure (its message is dropped), or "slow" when the call's time ran out. */
export async function postWithRetry(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchRetry5xx(() => fetchImpl(url, init));
  } catch {
    throw new AiError(init.signal?.aborted ? "slow" : "network");
  }
}

/** Maps a non-2xx provider answer to the v1 apiMsg classes. */
export async function httpError(r: Response): Promise<AiError> {
  const body = await r.text().catch(() => "");
  const detail = `HTTP ${r.status}: ${body.slice(0, 300)}`;
  if (r.status === 401 || r.status === 403) return new AiError("key-rejected", detail);
  if (r.status === 404) return new AiError("model-gone", detail);
  if (r.status === 429) return new AiError("rate-limit", detail);
  return new AiError("provider-error", detail);
}
