"use client";
import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { blobId } from "@/lib/blobs/kinds";
import { heldBlobs } from "@/lib/blobs/held";
import { blobPath, useProjectBlob } from "@/lib/blobs/useProjectBlob";
import type { ProjectWork } from "@/lib/frame/useProjectWork";
import { useT } from "@/lib/i18n";
import { announceBlob } from "@/lib/popout/channel";
import { useSettings } from "@/lib/settings";
import { useVault } from "@/lib/vault/useVault";
import { fullSamples, sampleStats } from "@/lib/writingSamples/captureSample";
import { flushOpenSamples, noteSamplesCleared } from "@/lib/writingSamples/useWritingSampleCapture";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useProject } from "@/components/frame/ProjectContext";

/**
 * The Settings block for the writing-sample capture (v1 1196-1206, 3925-3973, 4162-4167). Opt-in here (ruling P2), and its description is new
 * (wsamp_desc): v1's says nothing leaves the computer, while the copy is kept on the server with the project. The status counts the open
 * project's blob (reading every project's would open each one); Clear deletes the blob of every project that has one, and the scratch space's.
 */
export function SettingsWritingSamples() {
  const t = useT();
  const { settings, update, me } = useSettings();
  const { projectId } = useProject();
  const vault = useVault();
  const on = settings.writingSampleCapture === true;
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  // Counts the clears, so the status is remounted and reads the blob again.
  const [cleared, setCleared] = useState(0);
  // The status reads the blob only when that needs no passphrase: opening Settings never asks for one.
  const readable = vault.status === "off" || vault.status === "unlocked" || vault.status === "migrating";

  /** v1 setWritingSampleCapture (3936-3940): the toast says which way it went. */
  function toggle(v: boolean) {
    void update({ writingSampleCapture: v });
    toast(t(v ? "wsamp_on_toast" : "wsamp_off_toast"));
  }

  /** v1 clearWritingSamples (4162-4167): everything goes, not only the open project's. A project with no blob answers 404, which is as good as done. */
  async function clear() {
    if (busy) return;
    setBusy(true);
    try {
      // Nothing typed before this is to land after it: a change still waiting in an open document is not captured, and a capture already set
      // is sent now, so the list below names its project and the delete takes it.
      noteSamplesCleared();
      await flushOpenSamples();
      const work = await apiFetch<ProjectWork[]>("/projects?include=work");
      const ids = work.filter((p) => p.blobs.some((b) => b.kind === "writing_samples")).map((p) => p.id);
      // The list leaves the scratch space out.
      const scratch = me?.scratchProjectId;
      if (scratch && !ids.includes(scratch)) ids.push(scratch);
      // A save of the blob from a panel that has gone is waited for, and a value that panel could not send (offline, a locked vault) is dropped,
      // for every project, not only those that have a blob: either would make the blob again, with what was typed before the clear.
      await Promise.all([...new Set([...work.map((p) => p.id), ...ids])].map(async (id) => {
        const bid = blobId(id, "writing_samples");
        await heldBlobs.idle(bid);
        heldBlobs.take(bid);
      }));
      const done = await Promise.all(ids.map((id) => apiFetch<void>(blobPath(id, "writing_samples"), { method: "DELETE" }).then(
        () => true,
        (e: unknown) => e instanceof ApiError && e.status === 404
      )));
      // Another window of this browser that has one of these open reads it again.
      ids.forEach((id, i) => { if (done[i]) { announceBlob(blobId(id, "writing_samples")); fullSamples.delete(id); } });
      toast(t(done.every(Boolean) ? "writingsample_cleared" : "wsamp_clear_fail"));
    } catch {
      toast(t("wsamp_clear_fail"));
    } finally {
      setAsk(false);
      setBusy(false);
      setCleared((n) => n + 1);
    }
  }

  return (
    <div className="field !mb-0 border-t border-line pt-3" data-testid="wsamp">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} data-testid="wsamp-toggle" />
        <span>{t("writingsample_label")}</span>
      </label>
      <p className="m-0 text-[13px] text-muted-foreground" data-testid="wsamp-desc">{t("wsamp_desc")}</p>
      <p className="m-0 text-[13px] text-muted-foreground">{t("wsamp_scope")}</p>
      <p className="m-0 mt-1.5 min-h-5 text-[13px] font-semibold" role="status" aria-live="polite" data-testid="wsamp-status">
        {on ? <Status key={cleared} projectId={readable ? projectId : null} /> : t("writingsample_status_off")}
      </p>
      {ask ? (
        <div className="mt-1.5" role="group" aria-label={t("writingsample_clear_btn")} data-testid="wsamp-ask">
          <p className="m-0 mb-1.5 text-[13px]">{t("writingsample_clear_confirm")}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" disabled={busy} data-testid="wsamp-clear-yes" onClick={() => { void clear(); }}>{t("wsamp_clear_yes")}</Button>
            <Button variant="ghost" size="sm" disabled={busy} data-testid="wsamp-clear-no" onClick={() => setAsk(false)}>{t("sap_cancel_btn")}</Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="mt-1.5" data-testid="wsamp-clear" onClick={() => setAsk(true)}>{t("writingsample_clear_btn")}</Button>
      )}
    </div>
  );
}

/** v1 renderWritingSampleStatus (3966-3973) for the open project: the documents stored and their words. Empty while the blob cannot be read. */
function Status({ projectId }: { projectId: string | null }) {
  const t = useT();
  const blob = useProjectBlob("writing_samples", projectId, { readOnly: true });
  if (projectId === null || blob.loading || blob.locked || blob.broken || blob.error) return null;
  const { count, words } = sampleStats(blob.value);
  return <>{t("writingsample_status_fmt", { n: count, w: words })}{fullSamples.has(projectId) && " " + t("wsamp_full")}</>;
}
