"use client";
import { useState } from "react";
import Link from "next/link";
import { CaretDown, List, Question, UserCircle } from "@phosphor-icons/react";
import { PROVIDERS, type ProviderId } from "@appuscholar/core";
import { apiFetch } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useKeys } from "@/lib/ai/useKeys";
import { useTitle } from "@/lib/vault/titles";
import { PHONE_QUERY, useMedia } from "@/lib/useMedia";
import { toast } from "@/components/ui/toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { VaultPill } from "@/components/workspace/VaultPill";
import { useAccount } from "@/components/workspace/dialogs/Help";
import { useProject, type Project } from "./ProjectContext";

function isProvider(v: unknown): v is ProviderId { return typeof v === "string" && v in PROVIDERS; }

const ITEM = "min-h-[40px]";

/**
 * The app's header (canvas Main): the wordmark (the project list), the project switcher, the vault pill, the AI pill, the language, Help and
 * the account menu. The version pill moved into Help. Every title shown is the opened one (useTitle): "Locked title" while the vault is locked.
 * On a phone (canvas Phone, PHONE_QUERY) it is the wordmark, the vault pill and Menu, which holds the rest (PhoneMenu). The desktop-only items
 * carry `app-desk`, which globals.css hides at phone width: the server's render and the first paint, before useMedia knows, show no desktop header.
 */
export function AppHeader() {
  const t = useT();
  const { lang, setLang } = useLang();
  const { openHelp, openSettings, go } = useProject();
  const phone = useMedia(PHONE_QUERY);
  // Called once here, so the account's dialogs stay mounted whichever menu opened them.
  const account = useAccount();
  // v1 toasts the new language in that language; the switch is a settings update plus a context change, nothing remounts.
  const switchLang = () => {
    const next = lang === "en" ? "hi" : "en";
    setLang(next);
    toast(next === "hi" ? "भाषा: हिन्दी" : "Language: English");
  };
  return (
    <header className="app-hdr" data-testid="app-header">
      {/* Through go, so leaving a project stores the open document first; a modified click still opens a new tab. */}
      <Link href="/projects" className="app-word" data-testid="wordmark" onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        void go("/projects");
      }}>Appuscholar</Link>
      {!phone && <Switcher />}
      <span className="app-hdr-gap" aria-hidden="true" />
      <VaultPill />
      {phone ? <PhoneMenu account={account} lang={lang} switchLang={switchLang} /> : (
        <>
          <AiPill onOpen={() => openSettings()} />
          <button type="button" className="app-hbtn app-desk" aria-label="Switch interface language" title="हिन्दी / English" data-testid="lang-toggle" onClick={switchLang}>
            {lang === "en" ? "हि" : "EN"}
          </button>
          <button type="button" className="app-hbtn app-desk" data-testid="help-btn" onClick={openHelp}>
            <Question size={18} aria-hidden="true" /><span className="app-hbtn-lbl">{t("hdr_help")}</span>
          </button>
          <AccountMenu account={account} />
        </>
      )}
      {account.dialogs}
    </header>
  );
}

type Account = ReturnType<typeof useAccount>;

/**
 * Menu on a phone (canvas Phone): the projects (read when it opens), the scratch space and "All projects"; the AI key, Help and the language;
 * then the account's items, as AccountMenu has them.
 */
function PhoneMenu({ account, lang, switchLang }: { account: Account; lang: string; switchLang(): void }) {
  const t = useT();
  const { settings } = useSettings();
  const { hasKey } = useKeys();
  const { openHelp, openSettings } = useProject();
  const { list, load, open, projectId, go } = useSwitcher();
  const current: ProviderId = isProvider(settings.provider) ? settings.provider : "gemini";
  return (
    <DropdownMenu modal={false} onOpenChange={(o) => { if (o) load(); }}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="app-hbtn" aria-label={t("hdr_menu")} data-testid="phone-menu"><List size={20} aria-hidden="true" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(calc(100vw-32px),340px)]" data-testid="phone-menu-list">
        <DropdownMenuLabel className="text-muted-foreground">{t("switcher_label")}</DropdownMenuLabel>
        {list?.filter((p) => p.status !== "complete").map((p) => <ProjectItem key={p.id} project={p} current={p.id === projectId} onOpen={() => open(p.id)} />)}
        <DropdownMenuItem className={ITEM} data-testid="switcher-scratch" onSelect={() => open(null)}>{t("scratch_name")}</DropdownMenuItem>
        <DropdownMenuItem className={ITEM} data-testid="switcher-all" onSelect={() => { void go("/projects"); }}>{t("switcher_all")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={ITEM} data-testid="menu-ai" onSelect={() => openSettings()}>
          {hasKey(current) ? t("ai_pill_key", { provider: PROVIDERS[current].short }) : t("ai_pill_nokey")}
        </DropdownMenuItem>
        <DropdownMenuItem className={ITEM} data-testid="menu-help" onSelect={openHelp}>{t("hdr_help")}</DropdownMenuItem>
        {/* The other language, named in itself. */}
        <DropdownMenuItem className={ITEM} lang={lang === "en" ? "hi" : "en"} data-testid="menu-lang" onSelect={switchLang}>{t("menu_lang_other")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <AccountItems account={account} ai={false} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "AI: Gemini, your key" when a key for the chosen provider is usable or saved; "AI: add your key" otherwise. Both open the key dialog. */
function AiPill({ onOpen }: { onOpen(): void }) {
  const t = useT();
  const { settings } = useSettings();
  const { hasKey } = useKeys();
  const current: ProviderId = isProvider(settings.provider) ? settings.provider : "gemini";
  return (
    <button type="button" className="app-ai-pill app-desk" data-testid="ai-pill" onClick={onOpen}>
      {hasKey(current) ? t("ai_pill_key", { provider: PROVIDERS[current].short }) : t("ai_pill_nokey")}
    </button>
  );
}

/** The switcher's projects (read when its menu opens) and the way to open one; the header's switcher, the phone's Menu and the phone home's project button share it. */
function useSwitcher() {
  const t = useT();
  const { projectId, openProject, go } = useProject();
  const [list, setList] = useState<Project[] | null>(null);
  const load = () => { apiFetch<Project[]>("/projects").then(setList, () => setList([])); };
  const open = (id: string | null) => { void openProject(id).catch(() => toast(t("switch_fail"))); };
  return { list, load, open, projectId, go };
}

/**
 * The opened project's title, a menu of the projects (read when it opens), the scratch space and "All projects". `home` is the phone home's
 * project button (canvas Phone): the full width, the title and a caret.
 */
export function Switcher({ home = false }: { home?: boolean }) {
  const t = useT();
  const { me } = useSettings();
  const { project } = useProject();
  const { list, load, open, projectId, go } = useSwitcher();
  const scratch = !!projectId && projectId === me?.scratchProjectId;
  const title = useTitle(project, "project");
  const label = project ? title.text : scratch ? t("scratch_name") : t("switcher_all");
  return (
    <DropdownMenu modal={false} onOpenChange={(o) => { if (o) load(); }}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={home ? "home-project" : "app-switch app-desk"} aria-label={t("switcher_label") + ": " + label} data-testid={home ? "home-project-btn" : "project-switcher"}>
          <span className="truncate">{label}</span><CaretDown size={14} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={home ? "w-[min(calc(100vw-32px),360px)]" : "max-w-[min(92vw,360px)]"} data-testid="switcher-menu">
        {list?.filter((p) => p.status !== "complete").map((p) => <ProjectItem key={p.id} project={p} current={p.id === projectId} onOpen={() => open(p.id)} />)}
        <DropdownMenuItem className={ITEM} data-testid="switcher-scratch" onSelect={() => open(null)}>{t("scratch_name")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={ITEM} data-testid="switcher-all" onSelect={() => { void go("/projects"); }}>{t("switcher_all")}</DropdownMenuItem>
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

/** The account menu: Export this project (inside a project: its export place, Task 12), Export all my work, AI provider and key, Change passphrase (once a vault exists), Sign out, Delete my account. */
function AccountMenu({ account }: { account: Account }) {
  const t = useT();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="app-hbtn app-acct app-desk" aria-label={t("hdr_account")} data-testid="account-menu-btn"><UserCircle size={22} aria-hidden="true" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-testid="account-menu">
        <AccountItems account={account} ai />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The account's items, in the account menu and in the phone's Menu (which has its own AI item, so `ai` false leaves this one out). */
function AccountItems({ account, ai }: { account: Account; ai: boolean }) {
  const t = useT();
  const { openSettings, openExport, projectId } = useProject();
  const { exportWork, exporting, startSignOut, hasVault, openChange, openErase } = account;
  return (
    <>
      {projectId && <DropdownMenuItem className={ITEM} data-testid="acct-export-project" onSelect={() => openExport()}>{t("acct_export_project")}</DropdownMenuItem>}
      <DropdownMenuItem className={ITEM} disabled={exporting} data-testid="acct-export" onSelect={() => { void exportWork(); }}>{t("acct_export")}</DropdownMenuItem>
      {ai && <DropdownMenuItem className={ITEM} data-testid="acct-ai" onSelect={() => openSettings()}>{t("acct_ai")}</DropdownMenuItem>}
      {hasVault && <DropdownMenuItem className={ITEM} data-testid="acct-change-pass" onSelect={openChange}>{t("acct_change_pass")}</DropdownMenuItem>}
      <DropdownMenuItem className={ITEM} data-testid="acct-sign-out" onSelect={() => { void startSignOut(); }}>{t("acct_sign_out")}</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className={ITEM + " text-destructive"} data-testid="acct-erase" onSelect={openErase}>{t("acct_erase")}</DropdownMenuItem>
    </>
  );
}
