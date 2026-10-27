"use client";
import { useState } from "react";
import { ImportV1 } from "@/components/import/ImportV1";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useProject } from "@/components/frame/ProjectContext";

/** The v1 backup import (formerly the /import page). Documents land in a new project, which opens when the import is stored. */
export function ImportV1Dialog() {
  const { dialog, closeDialog, openProject } = useProject();
  const [busy, setBusy] = useState(false);
  const open = dialog === "importV1";
  return (
    // A running import keeps its dialog: closing it would drop the progress and the "stopped part-way" message.
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) closeDialog(); }}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto" data-testid="import-v1-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-purple-800">Import a v1 backup</DialogTitle>
          <DialogDescription>Bring documents from the browser-only Appuscholar into your account.</DialogDescription>
        </DialogHeader>
        {open && (
          <ImportV1
            onBusyChange={setBusy}
            onDone={(projectId) => {
              closeDialog();
              void openProject(projectId).catch(() => toast("Imported. Open it from All studies."));
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
