"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseV1Backup } from "@appuscholar/core";
import { apiFetch } from "@/lib/api";
export function ImportV1() {
  const router = useRouter();
  const [msg, setMsg] = useState<string>("");
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const text = await f.text();
    const parsed = parseV1Backup(text);
    if (!parsed.ok) { setMsg(parsed.reason === "not-json" ? "That file is not JSON." : parsed.reason === "not-appuscholar" ? "That file is not an Appuscholar backup." : "That backup has no documents."); return; }
    if (!confirm(`Import ${parsed.backup.documents.length} document(s) saved ${parsed.backup.exported.slice(0, 10) || "?"} into a new project?`)) return;
    setMsg("Importing…");
    const r = await apiFetch<{ projectId: string; imported: number }>("/import/v1", { method: "POST", body: JSON.stringify({ bundleText: text }) });
    setMsg(`Imported ${r.imported} document(s) ✓`);
    router.push(`/projects/${r.projectId}`);
  }
  return (
    <div className="card">
      <p>Choose the backup file you downloaded from Appuscholar v1 (it is a <code>.json</code> file). Your AI keys and access code were never in it.</p>
      <input type="file" accept="application/json,.json" onChange={onFile} data-testid="import-file" />
      <p data-testid="import-msg" style={{ color: "var(--muted)" }}>{msg}</p>
    </div>
  );
}
