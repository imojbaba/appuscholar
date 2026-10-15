import { PROVIDERS, PROV_ORDER, type ProviderId } from "@appuscholar/core";

export function isProvider(v: unknown): v is ProviderId { return typeof v === "string" && v in PROVIDERS; }

export type KeyMode = "pass" | "plain" | "session";

/* AES-GCM 256 with a PBKDF2-SHA-256 key (250,000 rounds), as v1 (index.html:5036-5055). Blob: salt.iv.ciphertext, each base64url without padding. */
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (b: ArrayBuffer | Uint8Array): string => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ""; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (s: string): Uint8Array<ArrayBuffer> => {
  const std = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(std + "=".repeat((4 - (std.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

export function cryptoOK(): boolean { return typeof crypto !== "undefined" && !!crypto.subtle; }

async function derive(pass: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function lockKey(text: string, pass: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await derive(pass, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc.encode(text));
  return b64(salt) + "." + b64(iv) + "." + b64(ct);
}

export async function unlockKeyBlob(blob: string, pass: string): Promise<string> {
  const bits = String(blob).split(".");
  if (bits.length !== 3) throw new Error("bad blob");
  const k = await derive(pass, unb64(bits[0]!));
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(bits[1]!) }, k, unb64(bits[2]!)));
}

/** Keys held in this tab only (the "This tab only" mode, and a passphrase-protected key after it has been unlocked). Never written to disk. */
const session = new Map<ProviderId, string>();
const lsKey = (p: ProviderId) => "appu_key_" + p;
function ls(): Storage | null { try { return localStorage; } catch { return null; } }

export const keyStore = {
  /** The key usable right now: this tab's memory first, then the one remembered on this computer. */
  getUnlocked(p: ProviderId): string | null {
    const s = session.get(p);
    if (s) return s;
    let v: string | null = null;
    try { v = ls()?.getItem(lsKey(p)) ?? null; } catch { /* storage blocked */ }
    return v && v.trim() ? v.trim() : null;
  },
  /** True when the key is remembered on this computer (localStorage), as opposed to held in this tab's memory. */
  isPlain(p: ProviderId): boolean { try { return !!ls()?.getItem(lsKey(p)); } catch { return false; } },
  /** "Remember on this computer": one mode in force, so a tab-only copy of the same provider is dropped. */
  setPlain(p: ProviderId, key: string): void { session.delete(p); try { ls()?.setItem(lsKey(p), key); } catch { /* storage blocked */ } },
  setSession(p: ProviderId, key: string): void { try { ls()?.removeItem(lsKey(p)); } catch { /* storage blocked */ } session.set(p, key); },
  clear(p: ProviderId): void { session.delete(p); try { ls()?.removeItem(lsKey(p)); } catch { /* storage blocked */ } },
  hasAny(p: ProviderId, blobs: Record<string, string>): boolean { return !!keyStore.getUnlocked(p) || !!blobs[p]; },
  providersWithKeys(blobs: Record<string, string>): ProviderId[] { return PROV_ORDER.filter((p) => keyStore.hasAny(p, blobs)); }
};
