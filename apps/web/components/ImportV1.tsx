"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseV1Backup, unlockV1Backup, chunkV1Documents } from "@appuscholar/core";
import { apiFetch, ApiError } from "@/lib/api";

/** Stays well under Vercel's 4.5 MB request limit once JSON escaping and the other fields are added. */
const MAX_BATCH_BYTES = 3 * 1024 * 1024;

const REASONS: Record<string, string> = {
  "not-json": "That file is not JSON.",
  "not-appuscholar": "That file is not an Appuscholar backup.",
  "no-documents": "That backup has no documents.",
  locked: "This backup is locked with a passphrase."
};

export function ImportV1() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");

  function resetFile() { if (fileRef.current) fileRef.current.value = ""; }

  async function importText(text: string) {
    const parsed = parseV1Backup(text);
    if (!parsed.ok) {
      if (parsed.reason === "locked") { setLocked(text); setMsg("This backup is locked. Enter the passphrase you chose when you saved it in v1."); return; }
      setMsg(REASONS[parsed.reason] ?? "That file could not be read.");
      return;
    }
    const { documents, projects, exported } = parsed.backup;
    if (!confirm(`Import ${documents.length} document(s) saved ${exported.slice(0, 10) || "?"} into a new project?`)) { setMsg(""); return; }
    const first = projects[0];
    const projectTitle = first ? `${first.title} (imported from v1)` : "Imported from v1";
    const batches = chunkV1Documents(documents.map(d => ({ title: d.title, bodyHtml: d.bodyHtml })), MAX_BATCH_BYTES);
    let projectId: string | undefined;
    let imported = 0;
    setBusy(true);
    setMsg("Importing…");
    try {
      for (const [i, batch] of batches.entries()) {
        if (batches.length > 1) setMsg(`Importing… part ${i + 1} of ${batches.length}`);
        const r = await apiFetch<{ projectId: string; imported: number }>("/import/v1", { method: "POST", body: JSON.stringify({ exported, projectTitle, documents: batch, ...(projectId ? { projectId } : {}) }) });
        projectId = r.projectId;
        imported += r.imported;
      }
      setMsg(`Imported ${imported} document(s) ✓`);
      router.push(`/projects/${projectId}`);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      const base = code === "too-large" ? "A document in this backup is too large to import." : "Import failed. Try again.";
      setMsg(projectId ? `${base} ${imported} of ${documents.length} document(s) were imported into "${projectTitle}" before it stopped.` : base);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setLocked(null);
    setPassphrase("");
    try {
      await importText(await f.text());
    } finally {
      resetFile();
    }
  }

  async function onUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!locked || !passphrase) return;
    setBusy(true);
    setMsg("Unlocking…");
    const r = await unlockV1Backup(locked, passphrase);
    setBusy(false);
    if (!r.ok) { setMsg("That passphrase did not unlock this backup. Check it and try again."); return; }
    setLocked(null);
    setPassphrase("");
    await importText(r.text);
  }

  function cancelUnlock() { setLocked(null); setPassphrase(""); setMsg(""); resetFile(); }

  return (
    <div className="card">
      <p>Choose the backup file you downloaded from Appuscholar v1 (it is a <code>.json</code> file). Your AI keys and access code were never in it. Locked backups ask for their passphrase; it stays in this browser.</p>
      <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} disabled={busy || locked !== null} data-testid="import-file" />
      {locked !== null ? (
        <form onSubmit={onUnlock} style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }} data-testid="import-unlock-form">
          <input type="password" autoComplete="off" placeholder="Backup passphrase" value={passphrase} onChange={e => setPassphrase(e.target.value)} disabled={busy} data-testid="import-passphrase" style={{ flex: 1, padding: 8 }} />
          <button className="btn btn-purple" disabled={busy || !passphrase} data-testid="import-unlock">Unlock</button>
          <button type="button" className="btn" onClick={cancelUnlock} disabled={busy}>Cancel</button>
        </form>
      ) : null}
      <p data-testid="import-msg" role="status" style={{ color: "var(--muted)" }}>{msg}</p>
    </div>
  );
}
