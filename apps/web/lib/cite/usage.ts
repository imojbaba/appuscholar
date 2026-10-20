"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { citIsNumbered, citMissingNumbers, citUsage, docPlainForCitations } from "@appuscholar/core";
import type { CitationEntry, CitationStyle, PlainDoc, Usage } from "@appuscholar/core";
import { apiFetch } from "@/lib/api";
import { useSuggestion } from "@/lib/ai/suggestion";
import { useVault } from "@/lib/vault/useVault";
import { useWorkspace, type DocumentWithBody } from "@/components/workspace/WorkspaceContext";

/*
 * "Cited in" (v1 citPlainDocs 7515-7523, citUsage 7549-7555, citMissingNumbers 7810-7817, citRender 7835-7849): which of the student's documents
 * cite each library source. v1 scans every document in localStorage, the open one from the live editor. Here the documents of the open project
 * are read once (and again when the list changes or the vault opens), each decrypted in the browser; one that cannot be decrypted (the vault is
 * locked, or its key is missing) is left out, never read as plaintext. The open document's text is the live editor's, re-read shortly after typing.
 */

/** How long after the last keystroke the open document's text is read again. */
export const USAGE_DEBOUNCE_MS = 400;

type StoredDoc = Pick<DocumentWithBody, "id" | "bodyHtml" | "keyVersion" | "deks">;
export type BodyDeps = {
  fetchDoc(id: string): Promise<StoredDoc>;
  /** The vault's decryptBody: throws while the vault is locked or when the body does not open. */
  decrypt(doc: StoredDoc): Promise<string>;
};

/** Every document's HTML by id: plaintext (key version 0) as stored, ciphertext decrypted; a document that cannot be read is left out. */
export async function loadDocBodies(ids: string[], deps: BodyDeps): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const id of ids) {
    try {
      const doc = await deps.fetchDoc(id);
      out[id] = doc.keyVersion ? await deps.decrypt(doc) : doc.bodyHtml;
    } catch { /* not readable here: left out (no plaintext fallback) */ }
  }
  return out;
}

/** citPlainDocs (7515): one PlainDoc per document in the project's order, the open one (`open`) from the editor's HTML; documents with no body read are left out. */
export function plainDocs(documents: Array<{ id: string; title: string }>, bodies: Record<string, string>, open: { id: string; html: string } | null): PlainDoc[] {
  const out: PlainDoc[] = [];
  for (const d of documents) {
    const html = open && open.id === d.id ? open.html : bodies[d.id];
    if (html === undefined) continue;
    out.push(docPlainForCitations(d.id, d.title, html));
  }
  return out;
}

export type CitationUsage = {
  /** Per library entry, in library order: the documents that cite it and how often (citUsage). */
  usage: Usage[][];
  /** The summary's {c}, {n} and {u} (cite_usage_summary_fmt, 7845-7848). */
  cited: number;
  total: number;
  uncited: number;
  /** Numbered styles: the open document's numbers with no source in the library (citMissingNumbers), else []. */
  missing: number[];
};

/** What citRender computes from the documents (7835-7849). */
export function citationUsage(lib: CitationEntry[], docs: PlainDoc[], style: CitationStyle, currentId: string): CitationUsage {
  if (!lib.length) return { usage: [], cited: 0, total: 0, uncited: 0, missing: [] };
  let missing: number[] = [];
  if (citIsNumbered(style)) { try { missing = citMissingNumbers(docs, currentId, lib.length); } catch { missing = []; } }
  const usage = lib.map((d, i) => { try { return citUsage(d, docs, i, style); } catch { return []; } });
  const cited = usage.filter((u) => u.length).length;
  return { usage, cited, total: lib.length, uncited: lib.length - cited, missing };
}

/** num_missing_fmt's {n} (7839): each number in brackets, comma-separated. */
export function missingLabel(missing: number[]): string {
  return missing.map((n) => "[" + n + "]").join(", ");
}

/** The usage of the library across the open project's documents, kept current as documents change and as the student types. */
export function useCitationUsage(lib: CitationEntry[], style: CitationStyle): CitationUsage {
  const { documents, currentDoc } = useWorkspace();
  const vault = useVault();
  const { editor } = useSuggestion();
  const vaultRef = useRef(vault);
  useEffect(() => { vaultRef.current = vault; }, [vault]);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  /** The last editor text of documents open earlier, newer than their read bodies until the next read. */
  const [kept, setKept] = useState<Record<string, string>>({});
  const keptRef = useRef(kept);
  useEffect(() => { keptRef.current = kept; }, [kept]);

  const ids = useMemo(() => documents.map((d) => d.id), [documents]);
  const listKey = documents.map((d) => d.id + "@" + d.updatedAt).join("|");
  useEffect(() => {
    let alive = true;
    const before = Object.keys(keptRef.current);
    void loadDocBodies(ids, {
      fetchDoc: (id) => apiFetch<DocumentWithBody>(`/documents/${id}`),
      decrypt: (doc) => vaultRef.current.decryptBody(doc)
    }).then((b) => {
      if (!alive) return;
      setBodies(b);
      setKept((k) => { const n = { ...k }; for (const id of before) delete n[id]; return n; });
    });
    return () => { alive = false; };
    // `listKey` stands for the list; the vault's status re-reads once it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, vault.status]);

  const openId = currentDoc && !currentDoc.unreadable ? currentDoc.id : null;
  /** Bumped shortly after the student stops typing: the open document's text is read again. */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!editor || editor.isDestroyed || openId === null) return;
    let last = editor.getHTML();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onUpdate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (!editor.isDestroyed) { last = editor.getHTML(); setTick((n) => n + 1); } }, USAGE_DEBOUNCE_MS);
    };
    editor.on("update", onUpdate);
    return () => {
      if (timer) clearTimeout(timer);
      editor.off("update", onUpdate);
      // The document is being left (another one opens): its last text stands for it until its stored body is read again.
      if (!editor.isDestroyed) last = editor.getHTML();
      const html = last;
      setKept((k) => ({ ...k, [openId]: html }));
    };
  }, [editor, openId]);
  const live = useMemo(() => {
    void tick;
    return editor && !editor.isDestroyed && openId !== null ? { id: openId, html: editor.getHTML() } : null;
  }, [editor, openId, tick]);

  return useMemo(() => {
    const docs = plainDocs(documents, { ...bodies, ...kept }, live);
    return citationUsage(lib, docs, style, currentDoc?.id ?? "");
  }, [documents, bodies, kept, live, lib, style, currentDoc?.id]);
}
