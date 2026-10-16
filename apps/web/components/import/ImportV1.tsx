"use client";
import { useEffect, useRef, useState } from "react";
import { parseV1Backup, unlockV1Backup, chunkV1Documents } from "@appuscholar/core";
import { UploadSimple } from "@phosphor-icons/react";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n";

/** Stays well under Vercel's 4.5 MB request limit once JSON escaping and the other fields are added. */
const MAX_BATCH_BYTES = 3 * 1024 * 1024;

const REASONS: Record<string, string> = {
  "not-json": "That file is not JSON.",
  "no-documents": "That backup has no documents.",
  locked: "This backup is locked with a passphrase."
};

/** `onDone` gets the new project's id once every batch is stored (the workspace opens it). */
export function ImportV1({ onDone, onBusyChange }: { onDone: (projectId: string) => void; onBusyChange?: (busy: boolean) => void }) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const disabled = busy || locked !== null;
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);

  function resetFile() { if (fileRef.current) fileRef.current.value = ""; }

  async function importText(text: string) {
    const parsed = parseV1Backup(text);
    if (!parsed.ok) {
      if (parsed.reason === "locked") { setLocked(text); setMsg("This backup is locked. Enter the passphrase you chose when you saved it in v1."); return; }
      setMsg(parsed.reason === "not-appuscholar" ? t("restore_bad") : REASONS[parsed.reason] ?? "That file could not be read.");
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
    setProgress({ done: 0, total: batches.length });
    try {
      for (const [i, batch] of batches.entries()) {
        if (batches.length > 1) setMsg(`Importing… part ${i + 1} of ${batches.length}`);
        const r = await apiFetch<{ projectId: string; imported: number }>("/import/v1", { method: "POST", body: JSON.stringify({ exported, projectTitle, documents: batch, ...(projectId ? { projectId } : {}) }) });
        projectId = r.projectId;
        imported += r.imported;
        setProgress({ done: i + 1, total: batches.length });
      }
      setMsg(`Imported ${imported} document(s).`);
      if (projectId) onDone(projectId);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      const base = code === "too-large" ? "A document in this backup is too large to import." : "Import failed. Try again.";
      setMsg(projectId ? `${base} ${imported} of ${documents.length} document(s) were imported into "${projectTitle}" before it stopped.` : base);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    await handleFile(f);
  }

  function onDragOver(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = disabled ? "none" : "copy";
    if (!disabled) setDragging(true);
  }

  async function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (!f || disabled) return;
    await handleFile(f);
  }

  async function handleFile(f: File) {
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
    <Card>
      <CardContent className="grid gap-5">
        <ol className="grid gap-2 text-sm">
          <li>1. In Appuscholar v1 open Backup and download the file.</li>
          <li>2. Choose that file here.</li>
          <li>3. Documents land in a new project; the original file is not changed.</li>
        </ol>
        <p className="text-sm text-muted-foreground">Your AI keys and access code were never in the backup. Locked backups ask for their passphrase; it stays in this browser.</p>
        <label htmlFor="backup" data-testid="import-dropzone" onDragOver={onDragOver} onDragLeave={() => setDragging(false)} onDrop={onDrop} className={`rounded-lg border-2 border-dashed p-8 text-center ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-accent focus-within:ring-2 focus-within:ring-ring"} ${dragging ? "border-primary bg-accent" : ""}`}>
          <UploadSimple size={28} className="mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">Choose the backup file</span>
          <span className="mt-1 block text-sm text-muted-foreground">A .json file from Appuscholar v1. You can also drop it here.</span>
          <input id="backup" ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={onFile} disabled={disabled} data-testid="import-file" />
        </label>
        {locked !== null ? (
          <form onSubmit={onUnlock} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end" data-testid="import-unlock-form">
            <div className="grid gap-2">
              <Label htmlFor="backup-passphrase">Backup passphrase</Label>
              <Input id="backup-passphrase" type="password" autoComplete="off" value={passphrase} onChange={e => setPassphrase(e.target.value)} disabled={busy} data-testid="import-passphrase" />
            </div>
            <Button type="submit" disabled={busy || !passphrase} data-testid="import-unlock">{t("bk_ok_open")}</Button>
            <Button type="button" variant="outline" onClick={cancelUnlock} disabled={busy}>{t("bk_cancel")}</Button>
          </form>
        ) : null}
        {progress ? (
          <div role="progressbar" aria-label="Import progress" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} data-testid="import-progress" className="h-2 overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        ) : null}
        <p data-testid="import-msg" role="status" className="text-sm text-muted-foreground">{msg}</p>
      </CardContent>
    </Card>
  );
}
