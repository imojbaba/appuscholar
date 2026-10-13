"use client";
let cached: { token: string; expiresAt: number } | null = null;
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8788";

async function getToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt - now > 60) return cached.token;
  const r = await fetch("/api/token", { cache: "no-store" });
  if (!r.ok) throw new Error("not signed in");
  cached = await r.json();
  return cached!.token;
}

export class ApiError extends Error { constructor(public status: number, public code: string) { super(`${status} ${code}`); } }

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const r = await fetch(API + path, { ...init, headers: { ...(init.headers ?? {}), authorization: "Bearer " + token, ...(init.body ? { "content-type": "application/json" } : {}) } });
  if (!r.ok) {
    let code = "error"; try { code = (await r.json()).error ?? code; } catch { /* ignore */ }
    throw new ApiError(r.status, code);
  }
  return r.json() as Promise<T>;
}
