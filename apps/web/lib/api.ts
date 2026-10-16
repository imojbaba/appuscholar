"use client";
let cached: { token: string; expiresAt: number } | null = null;
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8788";

type Cached = { token: string; expiresAt: number };
let inflight: Promise<Cached> | null = null;

async function getToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt - now > 60) return cached.token;
  inflight ??= (async () => {
    try {
      const r = await fetch("/api/token", { cache: "no-store" });
      if (!r.ok) throw new Error("not signed in");
      const fresh = (await r.json()) as Cached;
      cached = fresh;
      return fresh;
    } finally {
      inflight = null;
    }
  })();
  return (await inflight).token;
}

export class ApiError extends Error { constructor(public status: number, public code: string, public detail?: string) { super(`${status} ${code}`); } }

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const r = await fetch(API + path, { ...init, headers: { ...(init.headers ?? {}), authorization: "Bearer " + token, ...(init.body ? { "content-type": "application/json" } : {}) } });
  if (!r.ok) {
    let code = "error"; let detail: string | undefined;
    try { const j = (await r.json()) as { error?: string; detail?: unknown }; code = j.error ?? code; if (typeof j.detail === "string") detail = j.detail; } catch { /* ignore */ }
    throw new ApiError(r.status, code, detail);
  }
  if (r.status === 204) return undefined as T;
  return r.json() as Promise<T>;
}
