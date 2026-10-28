"use client";
import { useEffect } from "react";
import { InstallButton } from "@/components/help/install/InstallButton";
import { startInstallWatch } from "@/lib/help/install/register";

/** The Help dialog's install control (Task C8). The worker itself is registered by the always-mounted OfflineSlot, because this slot only mounts while Help is open. */
export function InstallSlot() {
  useEffect(() => { startInstallWatch(); }, []);
  return <InstallButton />;
}
