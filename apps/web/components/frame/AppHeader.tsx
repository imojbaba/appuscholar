"use client";
import { useState } from "react";
import Link from "next/link";
import { CaretDown, Question, UserCircle } from "@phosphor-icons/react";
import { PROVIDERS, type ProviderId } from "@appuscholar/core";
import { apiFetch } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useKeys } from "@/lib/ai/useKeys";
import { useTitle } from "@/lib/vault/titles";
import { toast } from "@/components/ui/toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { VaultPill } from "@/components/workspace/VaultPill";
import { useAccount } from "@/components/workspace/dialogs/Help";
import { useProject, type Project } from "./ProjectContext";

function isProvider(v: unknown): v is ProviderId { return typeof v === "string" && v in PROVIDERS; }

const ITEM = "min-h-[40px]";

/**
 * The app's header (canvas Main): the wordmark (the project list), the project switcher, the vault pill, the AI pill, the language, Help and
 * the account menu. The version pill moved into Help. Every title shown is the opened one (useTitle): "Locked title" while the vault is locked.
 */
export function AppHeader() {
  const t = useT();
  const { lang, setLang } = useLang();
  const { openHelp, openSettings } = useProject();
  // v1 toasts the new language in that language; the switch is a settings update plus a context change, nothing remounts.
  const switchLang = () => {
    const next = lang === "en" ? "hi" : "en";
    setLang(next);
    toast(next === "hi" ? "भाषा: हिन्दी" : "Language: English");
  };
  return (
    <header className="app-hdr" data-testid="app-header">
      <Link href="/projects" className="app-word" data-testid="wordmark">Appuscholar</Link>
      <Switcher />
      <span className="app-hdr-gap" aria-hidden="true" />
      <VaultPill />
      <AiPill onOpen={() => openSettings()} />
      <button type="button" className="app-hbtn" aria-label="Switch interface language" title="हिन्दी / English" data-testid="lang-toggle" onClick={switchLang}>
        {lang === "en" ? "हि" : "EN"}
      </button>
      <button type="button" className="app-hbtn" data-testid="help-btn" onClick={openHelp}>
        <Question size={18} aria-hidden="true" /><span className="app-hbtn-lbl">{t("hdr_help")}</span>
      </button>
      <AccountMenu />
    </header>
  );
}

/** "AI: Gemini, your key" when a key for the chosen provider is usable or saved; "AI: add your key" otherwise. Both open the key dialog. */
function AiPill({ onOpen }: { onOpen(): void }) {
  const t = useT();
  const { settings } = useSettings();
  const { hasKey } = useKeys();
  const current: ProviderId = isProvider(settings.provider) ? settings.provider : "gemini";
  return (
    <button type="button" className="app-ai-pill" data-testid="ai-pill" onClick={onOpen}>
      {hasKey(current) ? t("ai_pill_key", { provider: PROVIDERS[current].short }) : t("ai_pill_nokey")}
    </button>
  );
}

/** The opened project's title, a menu of the projects (read when it opens), the scratch space and "All projects". */
function Switcher() {
  const t = useT();
  const { me } = useSettings();
  const { project, projectId, openProject, go } = useProject();
  const [list, setList] = useState<Project[] | null>(null);
  const scratch = !!projectId && projectId === me?.scratchProjectId;
  const title = useTitle(project, "project");
  const label = project ? title.text : scratch ? t("scratch_name") : t("switcher_all");
  const load = () => { apiFetch<Project[]>("/projects").then(setList, () => setList([])); };
  const open = (id: string | null) => { void openProject(id).catch(() => toast(t("switch_fail"))); };
  return (
    <DropdownMenu modal={false} onOpenChange={(o) => { if (o) load(); }}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="app-switch" aria-label={t("switcher_label") + ": " + label} data-testid="project-switcher">
          <span className="truncate">{label}</span><CaretDown size={14} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[min(92vw,360px)]" data-testid="switcher-menu">
        {list?.filter((p) => p.status !== "complete").map((p) => <ProjectItem key={p.id} project={p} current={p.id === projectId} onOpen={() => open(p.id)} />)}
        <DropdownMenuItem className={ITEM} data-testid="switcher-scratch" onSelect={() => open(null)}>{t("scratch_name")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={ITEM} data-testid="switcher-all" onSelect={() => go("/projects")}>{t("switcher_all")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectItem({ project, current, onOpen }: { project: Project; current: boolean; onOpen(): void }) {
  const title = useTitle(project, "project");
  return (
    <DropdownMenuItem className={ITEM + (current ? " font-semibold" : "")} data-testid="switcher-project" onSelect={onOpen}>
      <span className="truncate">{title.text}</span>
    </DropdownMenuItem>
  );
}

/** The account menu: Export all my work, AI provider and key, Change passphrase (once a vault exists), Sign out, Delete my account. */
function AccountMenu() {
  const t = useT();
  const { openSettings } = useProject();
  const { exportWork, exporting, startSignOut, hasVault, openChange, openErase, dialogs } = useAccount();
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="app-hbtn app-acct" aria-label={t("hdr_account")} data-testid="account-menu-btn"><UserCircle size={22} aria-hidden="true" /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-testid="account-menu">
          <DropdownMenuItem className={ITEM} disabled={exporting} data-testid="acct-export" onSelect={() => { void exportWork(); }}>{t("acct_export")}</DropdownMenuItem>
          <DropdownMenuItem className={ITEM} data-testid="acct-ai" onSelect={() => openSettings()}>{t("acct_ai")}</DropdownMenuItem>
          {hasVault && <DropdownMenuItem className={ITEM} data-testid="acct-change-pass" onSelect={openChange}>{t("acct_change_pass")}</DropdownMenuItem>}
          <DropdownMenuItem className={ITEM} data-testid="acct-sign-out" onSelect={() => { void startSignOut(); }}>{t("acct_sign_out")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className={ITEM + " text-destructive"} data-testid="acct-erase" onSelect={openErase}>{t("acct_erase")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogs}
    </>
  );
}
