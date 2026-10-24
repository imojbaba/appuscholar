"use client";
import { BackupNudge } from "@/components/help/backup/BackupNudge";
import { useProject, type ProjectValue } from "@/components/frame/ProjectContext";

/** The shell's project value, or null where there is no shell (the chrome mounted alone, as a test does): the reminder then draws nothing. */
function useShell(): ProjectValue | null {
  try { return useProject(); } catch { return null; }
}

/** Wave C slot (plan 2026-10-24, Task C7): the backup reminder. It runs beside the project shell and draws a small panel only when it is due. */
export function NudgeSlot() {
  const shell = useShell();
  return shell ? <BackupNudge shell={shell} /> : null;
}
