import { vi } from "vitest";
import { ApiError } from "../lib/api";
import { exportAll, type ExportDeps } from "../lib/vault/export";
import type { VaultValue } from "../lib/vault/useVault";

/** Fixtures and fakes for the Task C7 tests: invented text only. */
export const AT = "2026-09-08T10:00:00.000Z";

export type FxDoc = { id: string; pid: string; title: string; kind: "draft" | "source"; html: string; unreadable?: boolean };
export const IDEA = { topic: "Does sleep help memory?", resources: "A quiet room", timeframe: "Ten weeks", constraints: "None yet" };
export const CITES = [{ author: "Wu", year: "2020", title: "A made-up paper on sleep" }];
export const PREFS = { rank: true };
export const PAPER = { pages: ["Page one of an invented paper."], notes: [], cells: {} };

export const PROJECTS = [
  { id: "p1", title: "Sleep study", titleKeyVersion: 0, deks: [], stageMarks: {}, draftWords: 8, draftEditedAt: AT, createdAt: AT },
  { id: "p2", title: "Reading log", titleKeyVersion: 0, deks: [], stageMarks: {}, draftWords: 0, draftEditedAt: null, createdAt: AT }
];
/** The scratch space as buildZip adds it to the export: not in GET /projects, so it has no creation time. */
export const SCRATCH = { id: "s0", title: "Scratch space", titleKeyVersion: 0, deks: [], stageMarks: {}, draftWords: 0, draftEditedAt: null, createdAt: "" };

export const DOCS: FxDoc[] = [
  { id: "d1", pid: "p1", title: "Draft one", kind: "draft", html: "<p>Invented sentence for d1.</p>" },
  { id: "d2", pid: "p1", title: "Draft two", kind: "draft", html: "<p>A second <strong>bold</strong> line &amp; more.</p>" },
  { id: "s1", pid: "p2", title: "A source", kind: "source", html: "<p>Text of an invented source.</p>" }
];
/** Stage data by project: kind and the value the panel saved. */
export const BLOBS: Record<string, Array<{ kind: string; value: unknown }>> = {
  p1: [{ kind: "idea_intake", value: IDEA }, { kind: "citations", value: CITES }],
  p2: [{ kind: "rs_prefs", value: PREFS }, { kind: "shelf_paper:abc", value: PAPER }]
};

export type FixtureOpts = { scratch?: boolean; scratchDocs?: FxDoc[]; docs?: FxDoc[]; blobs?: Record<string, Array<{ kind: string; value: unknown }>>; projects?: typeof PROJECTS; badBlobText?: string };

/** What exportAll reads, from the fixture (the same shape as test/wc6BackupCheck.test.ts). */
export function fixtureDeps(o: FixtureOpts = {}): ExportDeps {
  const projects = [...(o.projects ?? PROJECTS), ...(o.scratch === false ? [] : [SCRATCH])];
  const docs = [...(o.docs ?? DOCS), ...(o.scratchDocs ?? [])];
  const blobs = o.blobs ?? BLOBS;
  const doc = (id: string) => docs.find((d) => d.id === id)!;
  return {
    listProjects: async () => projects,
    listDocuments: async (pid) => docs.filter((d) => d.pid === pid).map((d) => ({ id: d.id, title: d.title, titleKeyVersion: 0, deks: [], kind: d.kind, createdAt: AT, updatedAt: AT, deletedAt: null, wordCount: 3 })),
    getDocument: async (id) => ({ id, bodyHtml: "x", keyVersion: 0, deks: [] }),
    decrypt: async (d) => {
      if (doc(d.id).unreadable) { const { VaultError } = await import("../lib/vault/crypto"); throw new VaultError("corrupt"); }
      return doc(d.id).html;
    },
    openTitle: async (t) => ({ state: "open", text: t.title }),
    writingRecordText: async () => "RECORD",
    listBlobs: async (pid) => (blobs[pid] ?? []).map((b) => ({ kind: b.kind, keyVersion: 0, updatedAt: AT })),
    getBlob: async (_p, kind) => ({ kind, body: "{}", keyVersion: 0, deks: [], updatedAt: AT, version: 1 }),
    decryptBlob: async (pid, w) => o.badBlobText !== undefined && w.kind === "idea_intake" ? o.badBlobText : JSON.stringify(blobs[pid]!.find((b) => b.kind === w.kind)!.value)
  };
}
/** A Blob's bytes; jsdom's Blob has no arrayBuffer(). */
export async function bytesOf(b: Blob): Promise<Uint8Array> {
  if (typeof b.arrayBuffer === "function") return new Uint8Array(await b.arrayBuffer());
  return new Promise<Uint8Array>((res) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result as ArrayBuffer)); r.readAsArrayBuffer(b); });
}
export const fixtureZip = async (o?: FixtureOpts) => bytesOf(await exportAll(fixtureDeps(o)));

/** A zip, recompressed, with the first bytes of one entry's data spoiled, so that reading that entry (not the zip) fails. */
export async function damageEntry(zipBytes: Uint8Array, entry: string): Promise<Uint8Array> {
  const JSZip = (await import("jszip")).default;
  const z = await JSZip.loadAsync(zipBytes);
  const packed = new Uint8Array(await z.generateAsync({ type: "arraybuffer", compression: "DEFLATE" }));
  const name = new TextEncoder().encode(entry);
  let at = -1;
  for (let i = 0; i + name.length < packed.length && at < 0; i++) if (name.every((b, k) => packed[i + k] === b)) at = i;
  if (at < 0) throw new Error("no such entry: " + entry);
  const dv = new DataView(packed.buffer);
  // The local header: name length at 26, extra length at 28, then the entry's data.
  const header = at - 30;
  const data = header + 30 + dv.getUint16(header + 26, true) + dv.getUint16(header + 28, true);
  for (let k = 0; k < 6; k++) packed[data + k] = 0xff;
  return packed;
}

export type Call = { method: string; path: string; body: Record<string, unknown> | undefined; headers: Record<string, string> };
/**
 * An api that remembers every request it is sent and answers like the real one for the three writes a restore makes: POST /projects (a new id),
 * POST /projects/:id/documents and PUT /projects/:id/blobs/:kind (only on a project this run created, else 404). Anything else, a read included, throws.
 * `fail` makes a request fail with the error it returns.
 */
export function fakeServer(o: { fail?: (c: Call) => Error | undefined } = {}) {
  const calls: Call[] = [];
  const made: string[] = [];
  const apiFetch = vi.fn(async (path: string, init: RequestInit = {}) => {
    const c: Call = { method: init.method ?? "GET", path, body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined, headers: (init.headers ?? {}) as Record<string, string> };
    calls.push(c);
    const err = o.fail?.(c);
    if (err) throw err;
    if (c.method === "POST" && path === "/projects") { const id = "new-" + (made.length + 1); made.push(id); return { id }; }
    const m = /^\/projects\/([^/]+)\/(documents|blobs\/.+)$/.exec(path);
    if (m && (c.method === "POST" || c.method === "PUT")) {
      if (!made.includes(m[1]!)) throw new ApiError(404, "not-found");
      return {};
    }
    throw new Error("unexpected request " + c.method + " " + path);
  });
  return { apiFetch, calls, made };
}
export const apiError = (status: number, code = "error") => new ApiError(status, code);

/** A vault that seals with a recognisable stand-in and records what it was asked to seal. */
export function fakeVault(o: { known?: VaultValue["status"]; unlock?: boolean } = {}) {
  const sealed: Array<{ id: string; text: string }> = [];
  const vault = {
    known: vi.fn(async () => o.known ?? "off"),
    ensureUnlocked: vi.fn(async () => o.unlock ?? true),
    encryptBody: vi.fn(async (d: { id: string; deks: unknown[] }, text: string) => {
      sealed.push({ id: d.id, text });
      return { bodyHtml: "sealed" + sealed.length + "." + "x".repeat(20), keyVersion: 1, ...(d.deks.length ? {} : { dek: { v: 1, wrapped: "wrapped-dek" } }) };
    })
  };
  return { vault: vault as unknown as Pick<VaultValue, "known" | "ensureUnlocked" | "encryptBody">, spies: vault, sealed };
}
