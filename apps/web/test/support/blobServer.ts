import { decryptText, encryptText, generateDek, generateVaultKey, unwrapKey, VaultError, wrapKey } from "../../lib/vault/crypto";
import { ApiError } from "../../lib/api";
import { isBlobKind } from "../../lib/blobs/kinds";
import type { PaperVault } from "../../lib/papers/migrate";
import type { VaultStatus, WrappedDek } from "../../lib/vault/useVault";

/*
 * A fake api for the blob routes, the way apps/api/src/routes/blobs.ts answers them (versions with If-Match, the vault rules, the sealed shape), and for the
 * two project routes the paper-id migration touches: GET /projects?include=work (the stage states are worked out from it) and POST .../stages/lit/ready.
 * `apiFetch` is mocked with `server.api`. Times run on a counter, so a "later" write is always later.
 */

export type SBlob = { projectId: string; kind: string; body: string; keyVersion: number; deks: WrappedDek[]; version: number; updatedAt: string };
export type Call = { path: string; method: string; body?: Record<string, unknown>; ifMatch?: string };

const CIPHERTEXT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;

export type Server = ReturnType<typeof createBlobServer>;

export function createBlobServer(projectId = "p1") {
  let tick = 0;
  const s = {
    projectId,
    blobs: [] as SBlob[],
    calls: [] as Call[],
    /** The project's stage marks (POST .../ready). */
    marks: {} as Record<string, { readyAt: string }>,
    /** A vault exists: a plaintext (keyVersion 0) body is refused with 409 vault-required. */
    vaultExists: false,
    /** Runs before each PUT is processed (a competing write from another device, or a failure). */
    onPut: undefined as undefined | ((kind: string) => void | Promise<void>),
    now(): string { return new Date(Date.UTC(2026, 9, 24, 8, 0, 0) + ++tick * 1000).toISOString(); },
    puts(kind?: string): Call[] { return s.calls.filter((c) => c.method === "PUT" && c.path.includes("/blobs/") && (kind === undefined || c.path.endsWith("/blobs/" + encodeURIComponent(kind)))); },
    gets(kind: string): Call[] { return s.calls.filter((c) => c.method === "GET" && c.path.endsWith("/blobs/" + encodeURIComponent(kind))); },
    find(kind: string): SBlob | undefined { return s.blobs.find((b) => b.projectId === s.projectId && b.kind === kind); },
    /** Stores a plaintext blob (no vault). */
    putPlain(kind: string, value: unknown): void { s.store({ projectId: s.projectId, kind, body: JSON.stringify(value), keyVersion: 0, deks: [] }); },
    /** Stores a blob sealed under `vault`'s key, as the browser seals one. */
    async putSealed(vault: FakeVault, kind: string, value: unknown): Promise<void> {
      const sealed = await vault.encryptBody({ id: `blob:${s.projectId}:${kind}`, deks: [] }, JSON.stringify(value));
      s.store({ projectId: s.projectId, kind, body: sealed.bodyHtml, keyVersion: sealed.keyVersion, deks: sealed.dek ? [sealed.dek] : [] });
    },
    store(b: Omit<SBlob, "version" | "updatedAt">): void {
      const cur = s.blobs.find((x) => x.projectId === b.projectId && x.kind === b.kind);
      s.blobs = [...s.blobs.filter((x) => x !== cur), { ...b, version: (cur?.version ?? 0) + 1, updatedAt: s.now() }];
    },
    /** The stored value of a blob, opened with `vault` when it is sealed (null: there is none). */
    async value<T = unknown>(kind: string, vault?: FakeVault): Promise<T | null> {
      const b = s.find(kind);
      if (!b) return null;
      if (b.keyVersion === 0) return JSON.parse(b.body) as T;
      return JSON.parse(await vault!.decryptBody({ id: `blob:${s.projectId}:${kind}`, deks: b.deks, bodyHtml: b.body, keyVersion: b.keyVersion })) as T;
    },
    /** Another device saves `value` over the blob (its version moves on). */
    async writeAs(vault: FakeVault | null, kind: string, value: unknown): Promise<void> {
      if (vault) await s.putSealed(vault, kind, value); else s.putPlain(kind, value);
    },
    /** The project as GET /projects?include=work answers it. */
    work() {
      return [{
        id: s.projectId, userId: "u1", title: "Project", titleKeyVersion: 0, deks: [], field: "psychology", stage: "lit", status: "active", contentLang: "en", kind: "research",
        createdAt: "2026-10-01T00:00:00.000Z", stageMarks: { ...s.marks }, documentCount: 1, lastEditedAt: null,
        blobs: s.blobs.filter((b) => b.projectId === s.projectId).map((b) => ({ kind: b.kind, updatedAt: b.updatedAt, version: b.version })), draftWords: 0, draftEditedAt: null
      }];
    },
    api: async (path: string, init: RequestInit = {}): Promise<unknown> => {
      const method = init.method ?? "GET";
      const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      const ifMatch = (init.headers as Record<string, string> | undefined)?.["if-match"];
      s.calls.push({ path, method, body, ...(ifMatch !== undefined ? { ifMatch } : {}) });
      if (path === "/projects?include=work" && method === "GET") return s.work();
      const stage = /^\/projects\/([^/]+)\/stages\/([^/]+)\/ready$/.exec(path);
      if (stage && method === "POST") { s.marks[stage[2]!] = { readyAt: s.now() }; return {}; }
      const m = /^\/projects\/([^/]+)\/blobs\/([^/]+)$/.exec(path);
      if (!m) throw new ApiError(404, "not-found");
      const pid = m[1]!, kind = decodeURIComponent(m[2]!);
      if (!isBlobKind(kind)) throw new ApiError(400, "invalid");
      const cur = s.blobs.find((b) => b.projectId === pid && b.kind === kind);
      const wire = (b: SBlob) => ({ kind: b.kind, body: b.body, keyVersion: b.keyVersion, deks: [...b.deks], updatedAt: b.updatedAt, version: b.version });
      if (method === "GET") { if (!cur) throw new ApiError(404, "not-found"); return wire(cur); }
      if (method !== "PUT") throw new ApiError(405, "method");
      await s.onPut?.(kind);
      const now = s.blobs.find((b) => b.projectId === pid && b.kind === kind);
      if (ifMatch !== undefined) {
        const im = /^"?(\d+)"?$/.exec(ifMatch.trim());
        if (!im) throw new ApiError(400, "invalid");
        if (Number(im[1]) !== (now?.version ?? 0)) throw new ApiError(409, "version-conflict");
      }
      const b = body as { body: string; keyVersion: number; dek?: WrappedDek };
      const deks = now?.deks ?? [];
      let add: WrappedDek | undefined;
      if (b.keyVersion === 0) {
        if (s.vaultExists) throw new ApiError(409, "vault-required");
      } else {
        if (!CIPHERTEXT.test(b.body) || (b.dek && b.dek.v !== b.keyVersion)) throw new ApiError(400, "invalid");
        if (!deks.some((k) => k.v === b.keyVersion) && b.dek?.v !== b.keyVersion) throw new ApiError(400, "unknown-key-version");
        const clash = b.dek ? deks.find((k) => k.v === b.dek!.v) : undefined;
        if (clash && clash.wrapped !== b.dek!.wrapped) throw new ApiError(409, "dek-exists");
        add = b.dek && !clash ? b.dek : undefined;
      }
      const next: SBlob = { projectId: pid, kind, body: b.body, keyVersion: b.keyVersion, deks: add ? [...deks, add] : deks, version: (now?.version ?? 0) + 1, updatedAt: s.now() };
      s.blobs = [...s.blobs.filter((x) => x !== now), next];
      return wire(next);
    }
  };
  return s;
}

export type FakeVault = PaperVault & {
  /** How many times the passphrase prompt was asked for (the migration must never ask). */
  prompts: number;
  /** The vault key, or null while locked. */
  lock(): void;
};

/**
 * A vault over real crypto, as lib/vault/useVault seals and opens a body: each blob has its own key (wrapped under the vault key), the first save brings it.
 * `vk` null is a locked vault: sealing and opening a sealed body throw "vault-locked"; a plaintext body (keyVersion 0) opens as it is.
 */
export async function fakeVault(o: { status: VaultStatus; complete?: boolean; locked?: boolean; vk?: CryptoKey }): Promise<FakeVault> {
  const key = o.vk ?? (await generateVaultKey());
  let vk: CryptoKey | null = o.locked || o.status === "off" ? null : key;
  const pending = new Map<string, WrappedDek>();
  const locked = () => new Error("vault-locked");
  const v: FakeVault = {
    status: o.status,
    complete: o.complete ?? true,
    prompts: 0,
    lock() { vk = null; v.status = "locked"; },
    known: async () => v.status,
    ensureUnlocked: async () => { v.prompts++; return false; },
    encryptBody: async (doc, html) => {
      if (!vk) throw locked();
      if (doc.deks.length === 0) {
        let dek = pending.get(doc.id);
        let dk: CryptoKey;
        if (dek) dk = await unwrapKey(dek.wrapped, vk);
        else { dk = await generateDek(); dek = { v: 1, wrapped: await wrapKey(dk, vk) }; pending.set(doc.id, dek); }
        return { bodyHtml: await encryptText(html, dk), keyVersion: 1, dek };
      }
      const top = doc.deks.reduce((a, b) => (b.v > a.v ? b : a));
      return { bodyHtml: await encryptText(html, await unwrapKey(top.wrapped, vk)), keyVersion: top.v };
    },
    decryptBody: async (doc) => {
      if (doc.keyVersion === 0) return doc.bodyHtml;
      if (!vk) throw locked();
      const dek = doc.deks.find((d) => d.v === doc.keyVersion);
      if (!dek) throw new VaultError("corrupt");
      return decryptText(doc.bodyHtml, await unwrapKey(dek.wrapped, vk));
    }
  };
  // The key is kept for a test that unlocks the same vault again.
  Object.defineProperty(v, "unlock", { value: () => { vk = key; v.status = "unlocked"; } });
  return v;
}

/** Unlocks a vault made by fakeVault (the key it was made with). */
export const unlock = (v: FakeVault): void => (v as unknown as { unlock(): void }).unlock();
