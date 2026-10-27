"use client";
import { useRef, useState } from "react";
import { PROVIDERS, PROV_ORDER, type ProviderId } from "@appuscholar/core";
import { ApiError, apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { cryptoOK, isProvider, keyStore } from "@/lib/ai/keys";
import { toCallError } from "@/lib/ai/callAI";
import { useKeys } from "@/lib/ai/useKeys";
import { useVault } from "@/lib/vault/useVault";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SecretInput } from "@/components/ui/secret-input";
import { toast } from "@/components/ui/toast";
import { useProject, type ConnectAsk, type ConnectResult } from "@/components/frame/ProjectContext";
import { NewPassphraseForm } from "./VaultSetup";
import { RecoverySheet } from "./RecoverySheet";

/**
 * The screens of Connect AI (first-run build spec, OJ 2026-10-27, step 4): the question (4a), getting a free key from Google (4b), pasting it (4c), how to
 * keep it (4d) and the new passphrase (4d's second choice); `manage` is the window once a key exists (AI connection: test, change, remove, how it is kept).
 */
export type ConnectScreen = "ask" | "get" | "paste" | "keep" | "pass" | "manage";

/** Mount once, in ChromeDialogs: the flow while one is asked for (ProjectValue.openConnect), each opening starting clean. */
export function ConnectAI() {
  const { connect } = useProject();
  return connect ? <Flow key={connect.id} ask={connect} /> : null;
}

type Fail = { text: string } | null;

/** What a failed key test says, in plain words, with what to fix: the company's refusal, the connection, or the call's own sentence. */
function failText(e: unknown, company: string, t: ReturnType<typeof useT>): string {
  const err = toCallError(e);
  if (err.code === "key-rejected" || err.code === "no-key" || (e instanceof ApiError && e.status === 400)) return t("connect_fail_key", { p: company });
  if (err.code === "network") return t("connect_fail_network", { p: company });
  return t("connect_fail_other", { p: company }) + " " + err.message;
}

function Flow({ ask }: { ask: ConnectAsk }) {
  const t = useT();
  const { settings, update } = useSettings();
  const { finishConnect } = useProject();
  const keys = useKeys();
  const vault = useVault();
  const active: ProviderId = isProvider(settings.provider) ? settings.provider : "gemini";
  const [p, setP] = useState<ProviderId>(ask.provider ?? active);
  const [screen, setScreen] = useState<ConnectScreen>(keys.hasKey(ask.provider ?? active) ? "manage" : "ask");
  // The screens that led here, for Back.
  const [trail, setTrail] = useState<ConnectScreen[]>([]);
  const go = (next: ConnectScreen) => { setTrail((tr) => [...tr, screen]); setScreen(next); setFail(null); setStatus(null); };
  const back = () => {
    const prev = trail[trail.length - 1];
    if (!prev) return;
    setTrail(trail.slice(0, -1)); setScreen(prev); setFail(null); setStatus(null);
  };
  const [otherCompany, setOtherCompany] = useState(p !== "gemini");
  const [key, setKey] = useState("");
  /** The key that passed its test: saved only once 4d is answered. */
  const tested = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [fail, setFail] = useState<Fail>(null);
  const [code, setCode] = useState<string | null>(null);
  const done = useRef(false);
  const info = PROVIDERS[p];

  const end = (r: ConnectResult) => {
    if (done.current) return;
    done.current = true;
    finishConnect({ result: r, provider: p });
  };
  const connected = () => {
    void update({ provider: p });
    toast(t("connect_done_toast"));
    end("connected");
  };
  /** The cross, Escape or a click outside: nothing typed on the page is lost; a key that passed its test but was not kept is not saved, and the student is told. */
  const close = () => {
    if (busy || code) return;
    if (tested.current && (screen === "keep" || screen === "pass")) toast(t("connect_not_saved"));
    end("closed");
  };

  /** 4c's Connect: the key is tested at once; then 4d, or with a vault already there, saved locked under it. */
  async function test() {
    const k = key.trim();
    if (!k) { setFail({ text: t("connect_paste_first") }); return; }
    if (busy) return;
    setBusy(true); setFail(null); setStatus(t("connect_checking"));
    try {
      await apiFetch<{ ok: true; reply: string }>("/ai/test", { method: "POST", body: JSON.stringify({ provider: p, apiKey: k }) });
    } catch (e) {
      setStatus(null); setFail({ text: failText(e, info.name, t) }); setBusy(false);
      return;
    }
    tested.current = k;
    setStatus(null);
    if ((await vault.known()) === "off") { setBusy(false); go("keep"); return; }
    // A vault exists: the key is locked under it (the passphrase asked for once when it is locked). Cancelling the ask saves nothing, and says so here.
    try {
      if (!(await vault.ensureUnlocked())) { setFail({ text: t("connect_locked_cancelled") }); return; }
      await keys.save(p, k, "pass");
    } catch {
      setFail({ text: t("settings_key_lock_fail") });
      return;
    } finally { setBusy(false); }
    connected();
  }

  async function keepPlain() {
    const k = tested.current;
    if (!k || busy) return;
    setBusy(true);
    try { await keys.save(p, k, "plain"); } catch { setFail({ text: t("settings_key_save_fail") }); setBusy(false); return; }
    setBusy(false);
    connected();
  }

  /** The new passphrase: the vault is set up with it, the key saved locked under it, then the recovery sheet; Done on the sheet ends the flow. */
  async function setUpAndLock(pass: string): Promise<string | null> {
    const k = tested.current;
    if (!k) return t("settings_key_save_fail");
    setBusy(true);
    try {
      let recovery: string | null = null;
      try {
        recovery = (await vault.setup(pass, false)).recoveryCode;
      } catch (e) {
        // Set up meanwhile elsewhere: the key is locked under that vault instead (its passphrase asked for).
        const exists = (e instanceof ApiError && e.status === 409) || (e instanceof Error && e.message === "vault-exists");
        if (!exists) return t("vault_setup_fail");
        if (!(await vault.ensureUnlocked())) return t("connect_locked_cancelled");
      }
      try { await keys.save(p, k, "pass"); } catch { return t("settings_key_lock_fail"); }
      if (recovery) { setCode(recovery); return null; }
      connected();
      return null;
    } finally { setBusy(false); }
  }

  // ---- AI connection, once a key exists ----
  const plainNow = keyStore.isPlain(p);
  const lockedNow = !!keys.blobs[p];
  async function testSaved() {
    if (busy) return;
    setFail(null);
    let use: string | null;
    try { use = await keys.getUnlocked(p); } catch { setFail({ text: t("vault_wrong") }); return; }
    if (!use) return;
    setBusy(true); setStatus(t("connect_checking"));
    try {
      await apiFetch("/ai/test", { method: "POST", body: JSON.stringify({ provider: p, apiKey: use }) });
      setStatus(t("connect_test_ok", { p: info.name }));
    } catch (e) {
      setStatus(null); setFail({ text: failText(e, info.name, t) });
    } finally { setBusy(false); }
  }
  async function remove() {
    if (busy) return;
    try { await keys.forget(p); } catch { setFail({ text: t("settings_key_remove_fail") }); return; }
    toast(t("connect_removed"));
    setTrail([]);
    setScreen("ask");
  }
  /** "How the key is kept" in the AI connection window: the same two choices as 4d, moving the key that is there now. */
  async function keepAs(mode: "plain" | "pass") {
    if (busy || (mode === "plain" ? plainNow : lockedNow)) return;
    setFail(null);
    let k: string | null;
    try { k = await keys.getUnlocked(p); } catch { setFail({ text: t("vault_wrong") }); return; }
    if (!k) return;
    tested.current = k;
    if (mode === "pass" && (await vault.known()) === "off") { go("pass"); return; }
    setBusy(true);
    try {
      if (mode === "pass" && !(await vault.ensureUnlocked())) { setFail({ text: t("connect_locked_cancelled") }); return; }
      await keys.save(p, k, mode);
      toast(t(mode === "pass" ? "connect_kept_pass_toast" : "connect_kept_plain_toast"));
    } catch { setFail({ text: t(mode === "pass" ? "settings_key_lock_fail" : "settings_key_save_fail") }); } finally { setBusy(false); }
  }

  const later = <p className="m-0 text-[13px] text-muted-foreground" data-testid="connect-later">{t("connect_later")}</p>;
  const laterSmall = <p className="m-0 text-[13px] text-muted-foreground">{t("connect_later")}</p>;
  const backBtn = trail.length > 0 && <Button type="button" variant="ghost" disabled={busy} data-testid="connect-back" onClick={back}>{t("connect_back")}</Button>;
  const saveInstead = (id: string) => ask.offerSave
    ? <Button type="button" variant="ghost" className="h-auto min-h-11 whitespace-normal" disabled={busy} data-testid={id} onClick={() => end("save")}>{t("connect_save_idea")}</Button>
    : null;
  const failLine = fail && <p role="alert" className="m-0 text-sm font-semibold text-destructive" data-testid="connect-error">{fail.text}</p>;
  const statusLine = <p role="status" aria-live="polite" className="m-0 min-h-5 text-sm text-muted-foreground" data-testid="connect-status">{status ?? ""}</p>;
  const CHOICE = "h-auto min-h-11 w-full justify-start whitespace-normal py-2.5 text-left";

  let title: string;
  let body: React.ReactNode;
  switch (screen) {
    case "ask":
      title = t("connect_h");
      body = (
        <>
          <DialogDescription className="text-sm leading-[1.6] text-ink">{t("connect_intro")}</DialogDescription>
          <div className="grid gap-2">
            <Button variant="primary" className={CHOICE} data-testid="connect-yes" onClick={() => go("paste")}>{t("connect_yes")}</Button>
            <Button variant="ghost" className={CHOICE} data-testid="connect-no" onClick={() => { setP("gemini"); setOtherCompany(false); go("get"); }}>{t("connect_no")}</Button>
            {ask.offerSave
              ? <Button variant="ghost" className={CHOICE} data-testid="connect-save" onClick={() => end("save")}>{t("connect_save_idea")}</Button>
              : <Button variant="ghost" className={CHOICE} data-testid="connect-not-now" onClick={() => end("closed")}>{t("connect_not_now")}</Button>}
          </div>
          {later}
        </>
      );
      break;
    case "get":
      title = t("connect_get_h");
      body = (
        <>
          <ol className="m-0 ml-5 grid list-decimal gap-1 text-sm leading-[1.6]" data-testid="connect-get-steps">
            {[1, 2, 3, 4, 5].map((n) => <li key={n}>{t("connect_get_" + n)}</li>)}
          </ol>
          <Button asChild variant="primary" className="h-auto min-h-11 whitespace-normal">
            <a href={PROVIDERS.gemini.keysUrl} target="_blank" rel="noopener" data-testid="connect-open-studio">{t("connect_open_studio")}</a>
          </Button>
          <p className="m-0 text-[13px] text-muted-foreground" data-testid="connect-free-note">{t("connect_free_note")}</p>
          {laterSmall}
          <DialogFooter className="sticky bottom-0 bg-background pt-1">
            {backBtn}
            <Button variant="primary" data-testid="connect-have-key" onClick={() => go("paste")}>{t("connect_have_key")}</Button>
          </DialogFooter>
        </>
      );
      break;
    case "paste":
      title = t("connect_paste_h");
      body = (
        <form className="grid gap-3" aria-busy={busy || undefined} onSubmit={(e) => { e.preventDefault(); void test(); }}>
          <label htmlFor="connectKey" className="text-sm font-semibold">{t("connect_key_label")}</label>
          <SecretInput secret="key" id="connectKey" autoComplete="off" spellCheck={false} autoFocus value={key} disabled={busy}
            onChange={(e) => { setKey(e.target.value); setFail(null); }} placeholder={t("settings_key_ph_new", { p: info.short })} data-testid="connect-key" toggleTestId="connect-key-toggle" />
          <p className="m-0 text-[13px] text-muted-foreground" data-testid="connect-from">
            {t("connect_from", { p: info.name })}{" "}
            {!otherCompany && <button type="button" className="inline-flex min-h-11 items-center text-purple-800 underline underline-offset-2" data-testid="connect-other" onClick={() => setOtherCompany(true)}>{t("connect_other")}</button>}
          </p>
          {otherCompany && (
            <div className="field !mb-0">
              <label htmlFor="connectProvider">{t("connect_company_label")}</label>
              <select className="input" id="connectProvider" value={p} disabled={busy} onChange={(e) => { if (isProvider(e.target.value)) { setP(e.target.value); setFail(null); } }} data-testid="connect-provider">
                {PROV_ORDER.map((id) => <option key={id} value={id}>{t("settings_opt_" + id)}</option>)}
              </select>
              <a href={info.keysUrl} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-[13px] text-purple-800 underline">{t("connect_get_key_at", { p: info.name })}</a>
            </div>
          )}
          {statusLine}
          {failLine}
          {laterSmall}
          <DialogFooter className="sticky bottom-0 bg-background pt-1">
            {backBtn}
            {fail && saveInstead("connect-fail-save")}
            <Button type="submit" variant="primary" disabled={busy} data-testid="connect-go">{t(fail ? "connect_retry" : "connect_go")}</Button>
          </DialogFooter>
        </form>
      );
      break;
    case "keep":
      title = t("connect_keep_h");
      body = (
        <>
          <div className="grid gap-2">
            <Button variant="primary" className={CHOICE} disabled={busy} data-testid="connect-keep-plain" onClick={() => { void keepPlain(); }}>
              <span className="grid gap-0.5"><span>{t("connect_keep_plain")}</span><span className="text-[13px] font-normal opacity-90">{t("connect_keep_plain_desc")}</span></span>
            </Button>
            <Button variant="ghost" className={CHOICE} disabled={busy || !cryptoOK()} data-testid="connect-keep-pass" onClick={() => go("pass")}>
              <span className="grid gap-0.5"><span>{t("connect_keep_pass")}</span><span className="text-[13px] font-normal text-muted-foreground">{t("connect_keep_pass_desc")}</span></span>
            </Button>
          </div>
          {failLine}
          <p className="m-0 text-[13px] text-muted-foreground" data-testid="connect-keep-later">{t("connect_keep_later")}</p>
          <DialogFooter className="sticky bottom-0 bg-background pt-1">{backBtn}</DialogFooter>
        </>
      );
      break;
    case "pass":
      title = t("connect_pass_h");
      body = (
        <>
          <DialogDescription className="text-sm leading-[1.6] text-ink">{t("connect_keep_pass_desc")}</DialogDescription>
          <NewPassphraseForm submitLabel={t("connect_pass_go")} onSubmit={setUpAndLock}>{backBtn}</NewPassphraseForm>
        </>
      );
      break;
    case "manage":
      title = t("connect_manage_h");
      body = (
        <>
          <p className="m-0 text-sm" data-testid="connect-connected">{t("connect_connected_to", { p: info.name })}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" disabled={busy} data-testid="connect-test" onClick={() => { void testSaved(); }}>{t("connect_test")}</Button>
            <Button variant="ghost" disabled={busy} data-testid="connect-change" onClick={() => { setKey(""); go("paste"); }}>{t("connect_change")}</Button>
            <Button variant="ghost" disabled={busy} data-testid="connect-remove" onClick={() => { void remove(); }}>{t("connect_remove")}</Button>
          </div>
          {statusLine}
          {failLine}
          <div role="radiogroup" aria-labelledby="connectKeptH" className="grid gap-2 border-t border-line pt-3">
            <p id="connectKeptH" className="m-0 text-sm font-semibold">{t("connect_kept_h")}</p>
            {(["plain", "pass"] as const).map((m) => {
              const on = m === "plain" ? plainNow && !lockedNow : lockedNow;
              return (
                <label key={m} className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="radio" name="connect-kept" checked={on} disabled={busy || (m === "pass" && !cryptoOK())} onChange={() => { void keepAs(m); }} data-testid={"connect-kept-" + m} />
                  <span>{t(m === "plain" ? "connect_keep_plain" : "connect_keep_pass")}</span>
                </label>
              );
            })}
          </div>
        </>
      );
      break;
  }

  return (
    <>
      <Dialog open={!code} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto" data-testid="connect-dialog" data-screen={screen}
          onInteractOutside={(e) => { if (busy) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-purple-800">{title}</DialogTitle>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
      <RecoverySheet code={code} onDone={() => { setCode(null); connected(); }} />
    </>
  );
}
