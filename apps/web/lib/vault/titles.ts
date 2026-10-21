"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { VaultError } from "./crypto";
import { useVault, type VaultStatus, type VaultValue, type WrappedDek } from "./useVault";

/*
 * Titles locked in the vault (OJ, 2026-10-20, decision D3; register D-S2-40). A project's or document's title is sealed in the browser under
 * the entity's own dek, the way bodies are, and opened here; the server stores ciphertext with `titleKeyVersion` (0 is plaintext, with the
 * vault off or from a tab older than wave B). A document's title shares its body's dek, so its key id is the document's id. A project's
 * key id is "project:" + its id; a new project has no id yet, so its title is sealed under "project:new:" + a random id and the dek travels
 * with the create (the vault binds no id into the ciphertext: the key id only names the cached dek).
 */

/** A title as the api lists it, with the keys of the entity it belongs to. */
export type Titled = { id: string; title: string; titleKeyVersion: number; deks: WrappedDek[] };
/** The title fields of a create, PUT or PATCH. `dek` is the entity's first key, when sealing made one. */
export type TitleFields = { title: string; titleKeyVersion: number; dek?: WrappedDek };
export type OpenedTitle = { state: "open"; text: string } | { state: "locked" | "unreadable" };

export const projectKeyId = (projectId: string): string => "project:" + projectId;
/** The key id a new project's title is sealed under, before the project has an id. */
export const newProjectKeyId = (): string => "project:new:" + crypto.randomUUID();
const keyIdOf = (t: Titled, kind: "project" | "document") => (kind === "project" ? projectKeyId(t.id) : t.id);

/** Seals with `encrypt`, or keeps the title as typed when there is none (the vault is off). */
export async function sealTitleWith(encrypt: VaultValue["encryptBody"] | null, keyId: string, deks: WrappedDek[], title: string): Promise<TitleFields> {
  if (!encrypt) return { title, titleKeyVersion: 0 };
  const s = await encrypt({ id: keyId, deks }, title);
  return { title: s.bodyHtml, titleKeyVersion: s.keyVersion, ...(s.dek ? { dek: s.dek } : {}) };
}

/** Vault off: the title as typed, key version 0. Otherwise ciphertext under the entity's dek. Throws Error("vault-locked") while locked. */
export async function sealTitle(v: Pick<VaultValue, "known" | "encryptBody">, keyId: string, deks: WrappedDek[], title: string): Promise<TitleFields> {
  return sealTitleWith((await v.known()) === "off" ? null : v.encryptBody, keyId, deks, title);
}

/** Opens a title in the browser. A plain title is as it is; a sealed one is "locked" while the vault is, "unreadable" when it does not open. */
export async function openTitle(v: Pick<VaultValue, "decryptBody">, t: Titled, keyId: string): Promise<OpenedTitle> {
  if (t.titleKeyVersion === 0) return { state: "open", text: t.title };
  try {
    return { state: "open", text: await v.decryptBody({ id: keyId, deks: t.deks, bodyHtml: t.title, keyVersion: t.titleKeyVersion }) };
  } catch (e) {
    if (e instanceof VaultError) return { state: "unreadable" };
    if (e instanceof Error && e.message === "vault-locked") return { state: "locked" };
    throw e;
  }
}

/** The opened text, or `fallback` when the title is locked or does not open (file and folder names use "untitled"). */
export async function titleText(v: Pick<VaultValue, "decryptBody">, t: Titled, keyId: string, fallback: string): Promise<string> {
  const o = await openTitle(v, t, keyId);
  return o.state === "open" ? o.text : fallback;
}

/** The name a downloaded file or a zip folder takes from a title: its opened text, or "untitled" when it is locked or does not open. */
export const UNTITLED = "untitled";
export const fileTitle = (o: { state: string; text?: string }): string => (o.state === "open" && o.text !== undefined ? o.text : UNTITLED);

/** Opened titles by key id and ciphertext, while the vault is open; emptied as soon as a reader sees it locked. */
const opened = new Map<string, string>();
const isOpen = (s: VaultStatus) => s === "unlocked" || s === "migrating";

/**
 * A title to show: the plain text, the opened text, or "Locked title" while the vault is locked (and while it is being opened), "This title
 * cannot be opened" when it does not open. Never the ciphertext.
 */
export function useTitle(t: Titled | null, kind: "project" | "document"): { state: "open" | "locked" | "unreadable"; text: string } {
  const tr = useT();
  const vault = useVault();
  const open = isOpen(vault.status);
  const sealed = !!t && t.titleKeyVersion > 0;
  const cacheKey = t && sealed ? keyIdOf(t, kind) + "\n" + t.title : "";
  const [got, setGot] = useState<{ key: string; o: OpenedTitle } | null>(null);
  useEffect(() => {
    if (!open) { opened.clear(); return; }
    if (!t || !sealed || opened.has(cacheKey)) return;
    let live = true;
    openTitle(vault, t, keyIdOf(t, kind)).then((o) => {
      if (o.state === "open") opened.set(cacheKey, o.text);
      if (live) setGot({ key: cacheKey, o });
    }, () => { if (live) setGot({ key: cacheKey, o: { state: "unreadable" } }); });
    return () => { live = false; };
  }, [open, sealed, cacheKey, t, kind, vault]);
  const locked = { state: "locked" as const, text: tr("title_locked") };
  if (!t) return { state: "open", text: "" };
  if (!sealed) return { state: "open", text: t.title };
  if (!open) return locked;
  const hit = opened.get(cacheKey);
  if (hit !== undefined) return { state: "open", text: hit };
  const o = got?.key === cacheKey ? got.o : null;
  if (o?.state === "open") return { state: "open", text: o.text };
  if (o?.state === "unreadable") return { state: "unreadable", text: tr("title_unreadable") };
  return locked;
}

/** Where sealPlainTitles reads and writes the titles. */
export type TitleStore = {
  /** GET /projects: the scratch project is not in it. */
  listProjects(): Promise<Titled[]>;
  /**
   * GET /projects/:id/documents?includeDeleted=1. A soft-deleted document is skipped: PATCH /documents/:id cannot reach it, so its title
   * stays as it is until it is brought back, and the next pass seals it then.
   */
  listDocuments(projectId: string): Promise<Array<Titled & { deletedAt?: string | null }>>;
  patchProject(id: string, body: object): Promise<void>;
  patchDocument(id: string, body: object): Promise<void>;
  /** The scratch project, whose documents are sealed too (its own title is the constant "Scratch space" and stays as it is). */
  scratchId?: string | null;
};
export type SealPlainDeps = TitleStore & { vault: Pick<VaultValue, "status" | "complete" | "encryptBody"> };

/** Another tab sealed the same entity first (its first dek): that title is left for the next pass, which finds it sealed. */
const isDekExists = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: unknown }).code === "dek-exists";

/**
 * Seals every plain project and document title (titleKeyVersion 0) in place: titles written before the vault, or later by a tab older than
 * wave B. Runs only while the vault is unlocked and complete; a second run finds nothing to seal.
 */
export async function sealPlainTitles(d: SealPlainDeps): Promise<{ sealed: number }> {
  if (d.vault.status !== "unlocked" || !d.vault.complete) return { sealed: 0 };
  return sealTitlesWith(d.vault.encryptBody, d);
}

/** sealPlainTitles without its check: the vault migration runs it before the vault is complete, with its own sealing (see migrateToVault). */
export async function sealTitlesWith(encrypt: VaultValue["encryptBody"], d: TitleStore): Promise<{ sealed: number }> {
  let sealed = 0;
  const run = async (fn: () => Promise<void>) => {
    try { await fn(); sealed++; } catch (e) { if (!isDekExists(e)) throw e; }
  };
  const projects = await d.listProjects();
  const ids = projects.map((p) => p.id);
  if (d.scratchId && !ids.includes(d.scratchId)) ids.push(d.scratchId);
  for (const p of projects) {
    if (p.titleKeyVersion !== 0 || p.id === d.scratchId) continue;
    await run(async () => d.patchProject(p.id, await sealTitleWith(encrypt, projectKeyId(p.id), p.deks, p.title)));
  }
  for (const id of ids) {
    for (const doc of await d.listDocuments(id)) {
      if (doc.titleKeyVersion !== 0 || doc.deletedAt) continue;
      await run(async () => d.patchDocument(doc.id, await sealTitleWith(encrypt, doc.id, doc.deks, doc.title)));
    }
  }
  return { sealed };
}
