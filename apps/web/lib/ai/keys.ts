import { PROVIDERS, PROV_ORDER, type ProviderId } from "@appuscholar/core";
import { b64, unb64 } from "@/lib/vault/encoding";

export function isProvider(v: unknown): v is ProviderId { return typeof v === "string" && v in PROVIDERS; }

export type KeyMode = "pass" | "plain" | "session";

/* AES-GCM 256 with a PBKDF2-SHA-256 key (250,000 rounds), as v1 (index.html:5036-5055). Blob: salt.iv.ciphertext, each base64url without padding. */
const enc = new TextEncoder();
const dec = new TextDecoder();

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
/** The signed-in account's id: remembered keys are stored per account, so a shared computer never hands one student's key to the next. */
let userId: string | null = null;
const lsKey = (p: ProviderId) => (userId ? "appu_key_" + userId + "_" + p : null);
function ls(): Storage | null { try { return localStorage; } catch { return null; } }
function read(p: ProviderId): string | null {
  const k = lsKey(p);
  if (!k) return null;
  try { return ls()?.getItem(k) ?? null; } catch { return null; /* storage blocked */ }
}
function drop(p: ProviderId): void {
  const k = lsKey(p);
  if (!k) return;
  try { ls()?.removeItem(k); } catch { /* storage blocked */ }
}

export const keyStore = {
  /** Sets whose remembered keys are visible. With no user, keys remembered on this computer are unavailable. Keys from before accounts (appu_key_<provider>) are ignored. */
  setUser(id: string | null): void { userId = id || null; },
  /** The key usable right now: this tab's memory first, then the one remembered on this computer for this account. */
  getUnlocked(p: ProviderId): string | null {
    const s = session.get(p);
    if (s) return s;
    const v = read(p);
    return v && v.trim() ? v.trim() : null;
  },
  /** True when the key is remembered on this computer (localStorage) for this account, as opposed to held in this tab's memory. */
  isPlain(p: ProviderId): boolean { return !!read(p); },
  /** True when any key is remembered on this computer for this account. */
  hasPlain(): boolean { return PROV_ORDER.some((p) => !!read(p)); },
  /** "Remember on this computer": one mode in force, so a tab-only copy of the same provider is dropped. With no signed-in account the key is kept in this tab only. */
  setPlain(p: ProviderId, key: string): void {
    const k = lsKey(p);
    if (!k) { session.set(p, key); return; }
    session.delete(p);
    try { ls()?.setItem(k, key); } catch { /* storage blocked */ }
  },
  setSession(p: ProviderId, key: string): void { drop(p); session.set(p, key); },
  /** Forgets every key held in this tab (sign-out). Keys remembered on this computer are untouched. */
  clearSession(): void { session.clear(); },
  /** Removes the keys remembered on this computer for that account only (sign-out, "Forget"). */
  forgetPlainKeys(id: string): void {
    for (const p of PROV_ORDER) { try { ls()?.removeItem("appu_key_" + id + "_" + p); } catch { /* storage blocked */ } }
  },
  clear(p: ProviderId): void { session.delete(p); drop(p); },
  hasAny(p: ProviderId, blobs: Record<string, string>): boolean { return !!keyStore.getUnlocked(p) || !!blobs[p]; },
  providersWithKeys(blobs: Record<string, string>): ProviderId[] { return PROV_ORDER.filter((p) => keyStore.hasAny(p, blobs)); }
};
