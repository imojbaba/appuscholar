"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { tHtml, useT } from "@/lib/i18n";
import { keyStore } from "@/lib/ai/keys";
import { resetPdMemo } from "@/lib/ai/callAI";
import { useSettings } from "@/lib/settings";
import { useSession } from "@/lib/session";
import { useVault } from "@/lib/vault/useVault";
import { hasRemembered } from "@/lib/vault/remember";
import { exportAll, exportFileName, localDay, type ExportDoc, type ExportDocSummary, type ExportProject } from "@/lib/vault/export";
import { blobId, type BlobKind } from "@/lib/blobs/kinds";
import type { BlobWire } from "@/lib/blobs/useProjectBlob";
import { downloadBlob } from "@/lib/export/download";
import { buildAllRecordText, openRecordTitles, type WritingRecord } from "@/lib/writingRecord";
import { openTitle, projectKeyId, titleText, UNTITLED } from "@/lib/vault/titles";
import { APP_VERSION } from "@/lib/version";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useProject } from "@/components/frame/ProjectContext";
import { HelpButtons } from "@/components/help/HelpButtons";
import { ChangePassphrase } from "./ChangePassphrase";
import { EraseAccount } from "./EraseAccount";

const FAQ = ["lost", "hindi", "key", "broken"];
// The app never sends mail (rule 12): the button opens the student's own mail app.
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
/**
 * Set before the first await, so a second click while the unlock ask is open does not start a second export. One for the page: Help and
 * the account menu each run useAccount, and an export started from one must not start again from the other.
 */
const exportBusy = { current: false };

/**
 * The account's actions, shared by Help and the header's account menu: export all my work, change the passphrase, sign out (asking whether to
 * forget what this computer remembers) and delete the account. `dialogs` holds their questions; each caller renders it once.
 */
export function useAccount() {
  const t = useT();
  const { signOutAction } = useSession();
  const { me } = useSettings();
  const vault = useVault();
  /** What is remembered on this computer, when the sign-out asks whether to forget it: AI keys, the vault, or both. */
  const [askForget, setAskForget] = useState<{ keys: boolean; vault: boolean } | null>(null);
  // Forget the tab's keys, the vault key and the unlocked-text memo, then end the session (and, if chosen, the keys and the vault remembered on this computer).
  const signOut = async (forget: boolean) => {
    if (forget && me?.id) keyStore.forgetPlainKeys(me.id);
    keyStore.clearSession();
    vault.lock();
    // Wait for IndexedDB before the sign-out navigates away; a blocked store must not keep the student signed in.
    if (forget) await vault.forgetThisComputer().catch(() => {});
    resetPdMemo();
    // Returned, so the account erasure can tell when the sign-out itself failed.
    await signOutAction();
  };
  // Asks whether to forget what this computer remembers (AI keys, the vault, or both); with nothing remembered it signs out at once.
  const startSignOut = async () => {
    const keys = keyStore.hasPlain();
    const vaultKept = me?.id ? await hasRemembered(me.id).catch(() => false) : false;
    if (keys || vaultKept) setAskForget({ keys, vault: vaultKept }); else void signOut(false);
  };
  const [changing, setChanging] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [exporting, setExporting] = useState(false);
  /** Change passphrase is offered once the vault exists (locked or open). */
  const hasVault = vault.status === "locked" || vault.status === "unlocked" || vault.status === "migrating";
  /**
   * Every project's documents (the scratch space's too), decrypted here and zipped with the writing-process record. Only ciphertext
   * comes from the server and nothing decrypted goes back; the export is logged (POST /me/export-audit) once the zip is built, before it is saved.
   */
  const exportWork = async () => {
    if (exportBusy.current) return;
    exportBusy.current = true;
    setExporting(true);
    try {
      if ((await vault.known()) !== "off" && !(await vault.ensureUnlocked())) return;
      // With their work, so index.json carries each stage's state.
      const projects = await apiFetch<ExportProject[]>("/projects?include=work");
      const scratch = me?.scratchProjectId;
      if (scratch && !projects.some((p) => p.id === scratch)) projects.push({ id: scratch, title: t("export_scratch"), titleKeyVersion: 0, deks: [], stageMarks: {}, draftWords: 0, draftEditedAt: null, createdAt: "" });
      const day = localDay();
      const blob = await exportAll({
        listProjects: async () => projects,
        listDocuments: (id) => apiFetch<ExportDocSummary[]>(`/projects/${id}/documents`),
        getDocument: (id) => apiFetch<ExportDoc>(`/documents/${id}`),
        decrypt: (doc) => vault.decryptBody(doc),
        openTitle: (title, keyId) => openTitle(vault, title, keyId),
        // Every stage's data: ciphertext from the api, opened here under the blob's own key.
        listBlobs: (id) => apiFetch<Array<{ kind: string; keyVersion: number; updatedAt: string }>>(`/projects/${id}/blobs`),
        getBlob: (id, kind) => apiFetch<BlobWire>(`/projects/${id}/blobs/${encodeURIComponent(kind)}`),
        decryptBlob: (id, w) => vault.decryptBody({ id: blobId(id, w.kind as BlobKind), deks: w.deks, bodyHtml: w.body, keyVersion: w.keyVersion }),
        // The record MyWriting downloads: each project's words under its title, the AI-use log (the whole account's) once.
        writingRecordText: async () => {
          // Titles opened here, as in the zip's folders.
          const parts = await Promise.all(projects.map(async (p) => ({
            title: await titleText(vault, p, projectKeyId(p.id), UNTITLED),
            rec: await openRecordTitles(await apiFetch<WritingRecord>(`/projects/${p.id}/writing-record`), (x, k) => openTitle(vault, x, k), UNTITLED)
          })));
          return buildAllRecordText(parts, APP_VERSION, day);
        }
      });
      await apiFetch<void>("/me/export-audit", { method: "POST" });
      downloadBlob(exportFileName(), blob);
      toast(t("export_done"));
    } catch {
      toast(t("export_fail"));
    } finally {
      exportBusy.current = false;
      setExporting(false);
    }
  };
  const dialogs = (
    <>
      <AlertDialog open={!!askForget} onOpenChange={(o) => { if (!o) setAskForget(null); }}>
        {/* With only the vault remembered, the AI-keys sentence does not apply: no description then. */}
        <AlertDialogContent data-testid="forget-keys-confirm" {...(askForget && !askForget.keys ? { "aria-describedby": undefined } : {})}>
          <AlertDialogHeader>
            <AlertDialogTitle>{askForget?.keys !== false ? "Forget the AI keys remembered on this computer?" : t("vault_forget_q")}</AlertDialogTitle>
            {askForget?.keys && askForget.vault && <p className="m-0 text-sm font-semibold" data-testid="forget-vault-q">{t("vault_forget_q")}</p>}
            {askForget?.keys !== false && <AlertDialogDescription>If this is a shared computer, forget them. Otherwise keep them and you will not need to paste them again next time.</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="keep-keys-signout" onClick={() => void signOut(false)}>Keep and sign out</AlertDialogCancel>
            <Button variant="destructive" data-testid="forget-keys-signout" onClick={() => void signOut(true)}>Forget and sign out</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ChangePassphrase open={changing} onClose={() => setChanging(false)} />
      <EraseAccount open={erasing} onClose={() => setErasing(false)} onErased={() => signOut(true)} />
    </>
  );
  return { exportWork, exporting, startSignOut, hasVault, openChange: () => setChanging(true), openErase: () => setErasing(true), dialogs };
}

export function Help() {
  const t = useT();
  const { dialog, closeDialog, openWelcome, openTerms, openImportV1 } = useProject();
  const { email } = useSession();
  const { exportWork, exporting, startSignOut, hasVault, openChange, openErase, dialogs } = useAccount();
  return (
    <>
    <Dialog open={dialog === "help"} onOpenChange={(o) => { if (!o) closeDialog(); }}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto" data-testid="help-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-purple-800">{t("help_h2")}</DialogTitle>
          {/* The build's pill, moved here from the header (the release check reads it). */}
          <Badge className="self-start" data-testid="app-version">Version {APP_VERSION}</Badge>
          <DialogDescription>{t("help_intro")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2" data-testid="help-faq">
          {FAQ.map((k) => (
            <details key={k} className="rounded-lg border border-line px-3 py-2 text-sm" data-testid={"faq-" + k}>
              <summary className="cursor-pointer font-medium">{t("faq_q_" + k)}</summary>
              <p className="mb-0 mt-2 text-[13.5px] leading-relaxed">{tHtml(t("faq_a_" + k))}</p>
            </details>
          ))}
        </div>
        <div className="grid gap-2 text-sm">
          <p className="m-0">{t("help_contact_intro")}</p>
          {SUPPORT_EMAIL ? (
            <div><Button asChild variant="ghost"><a href={`mailto:${SUPPORT_EMAIL}`} data-testid="help-contact">{t("help_contact_btn")}</a></Button></div>
          ) : (
            <p className="m-0 text-muted-foreground" data-testid="help-contact-unset">{t("help_contact_unset")}</p>
          )}
        </div>
        <HelpButtons />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" data-testid="help-tour" onClick={openWelcome}>{t("help_tour_btn")}</Button>
          <Button variant="ghost" data-testid="help-terms" onClick={openTerms}>{t("terms_reopen_btn")}</Button>
          <Button variant="ghost" data-testid="help-import-v1" onClick={openImportV1}>Import a v1 backup</Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
          <span data-testid="signed-in-as">Signed in as {email}</span>
          <Button variant="ghost" size="sm" data-testid="sign-out" onClick={() => { void startSignOut(); }}>{t("acct_sign_out")}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button variant="ghost" size="sm" disabled={exporting} data-testid="help-export" onClick={() => { void exportWork(); }}>{t("help_export_btn")}</Button>
          {hasVault && <Button variant="ghost" size="sm" data-testid="help-change-pass" onClick={openChange}>{t("vault_change_h2")}</Button>}
          <Button variant="ghost" size="sm" className="text-destructive" data-testid="help-erase" onClick={openErase}>{t("help_erase_btn")}</Button>
        </div>
      </DialogContent>
    </Dialog>
      {dialogs}
    </>
  );
}
