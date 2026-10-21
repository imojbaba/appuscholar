"use client";
import { X } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useTitle } from "@/lib/vault/titles";
import { VaultPill } from "@/components/workspace/VaultPill";
import { useProject } from "./ProjectContext";

/**
 * The header of a place in its own window (`?window=1`, register row D-S2-43): the project and the place it shows, the vault pill (its passphrase
 * is asked here), and Close. No project switcher, account menu or language: those belong to the writing window.
 */
export function WindowHeader() {
  const t = useT();
  const { me } = useSettings();
  const { project, projectId, place } = useProject();
  const title = useTitle(project, "project");
  const name = project ? title.text : projectId && projectId === me?.scratchProjectId ? t("scratch_name") : "";
  return (
    <header className="app-hdr win-hdr" data-testid="window-header">
      <span className="app-word">Appuscholar</span>
      <span className="win-where" data-testid="window-where">{name}{place ? " / " + t("stage_name_" + place.stage) : ""}</span>
      <span className="app-hdr-gap" aria-hidden="true" />
      <VaultPill />
      <button type="button" className="app-hbtn" aria-label={t("window_close")} data-testid="window-close" onClick={() => window.close()}>
        <X size={18} aria-hidden="true" /><span className="app-hbtn-lbl">{t("window_close")}</span>
      </button>
    </header>
  );
}
