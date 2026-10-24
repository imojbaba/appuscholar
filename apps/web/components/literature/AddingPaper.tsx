"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { CitationEntry } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { useVault } from "@/lib/vault/useVault";
import { useTitle } from "@/lib/vault/titles";
import { useProjectLibrary, type Library } from "@/lib/cite/useLibrary";
import { fileCapture, readCapture, type CaptureFiled } from "@/lib/cite/capture";
import { libraryRead } from "@/lib/papers/keep";
import { homeHref, placeHref } from "@/lib/frame/places";
import { Button } from "@/components/ui/button";
import type { Project } from "@/components/frame/ProjectContext";
import { PassphraseHost } from "@/components/workspace/dialogs/Passphrase";
import { VaultRecoverHost } from "@/components/workspace/dialogs/VaultRecover";

/** How long "Kept in {project}." stays on the screen before the tab closes itself (a student has time to read it; a tab the browser will not close is left as it is). */
export const CLOSE_AFTER_MS = 1500;

/** A project the paper can be kept in: its id, the name shown (the opened title), and where "Back to my project" goes. */
type Choice = { id: string; name: string; href: string };
/** Where the student is: looking at the paper, choosing a project, or keeping it in one (`attempt` counts the times they asked to try the keep again). */
type Step = { at: "facts" } | { at: "choose" } | { at: "keep"; project: Choice; attempt: number };

const subscribeHash = (cb: () => void) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); };
const readHash = () => window.location.hash;
const serverHash = () => "";
const noSubscribe = () => () => {};

/**
 * "Adding this paper" (canvas Find, wave B Task 20, register row D-S2-125; walk faults W5, W6, W13): the whole page the bookmark opens (`/add#capture=...`), drawn with no
 * workspace around it. Before anything is asked it shows the paper the bookmark read (title, authors, year, journal), straight from the address. "Keep it" asks for the passphrase
 * only when the vault is on and locked, then "Choose a project" lists the student's projects by their opened titles, the current one first (and the scratch space last); choosing
 * one keeps the paper there through keepEntry (lib/cite/capture.ts fileCapture), waits until the keep is on the server, and says "Kept in {project}." with "Back to my project".
 * The tab then closes itself (it can when the bookmark opened it); if it stays open, "You can close this tab." The vault's one-off migrations never start here (lib/popout/mode.ts
 * mayMigrate, ruling B2-R16): the next workspace tab runs them.
 */
export function AddingPaper() {
  const t = useT();
  const vault = useVault();
  // The address is outside React: read after hydration (the server has no hash), never rewritten (a reload shows the same paper).
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const hash = useSyncExternalStore(subscribeHash, readHash, serverHash);
  const read = useMemo(() => readCapture(hash), [hash]);
  const [step, setStep] = useState<Step>({ at: "facts" });
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");

  /** The passphrase comes first, and only if the vault is on and locked; a cancelled ask keeps nothing and Keep it asks again. */
  const begin = async () => {
    if (asking) return;
    setAsking(true);
    setNote("");
    try {
      if ((await vault.known()) !== "off" && !(await vault.ensureUnlocked())) { setNote(t("add_locked")); return; }
      setStep({ at: "choose" });
    } finally { setAsking(false); }
  };

  return (
    <main className="addpaper" data-testid="adding-paper" aria-busy={!hydrated || undefined}>
      {/* The unlock window and its recovery link, which the workspace's dialogs would otherwise carry. */}
      <PassphraseHost />
      <VaultRecoverHost />
      <p className="addpaper-brand">Appuscholar</p>
      <h1 className="addpaper-h">{t("add_h")}</h1>
      {hydrated && read.kind !== "paper" && (
        <>
          <p className="addpaper-none" data-testid="add-none">{t(read.kind === "none" ? "add_none" : "add_unreadable")}</p>
          <Link href="/" className="addpaper-link" data-testid="add-home">{t("add_home")}</Link>
        </>
      )}
      {read.kind === "paper" && (
        <>
          <section className="addpaper-card" aria-label={read.entry.title}>
            <p className="addpaper-title" data-testid="add-title">{read.entry.title}</p>
            <dl className="addpaper-facts" data-testid="add-facts">
              <Fact label={t("add_authors")} value={read.entry.author} none={t("add_not_found")} />
              <Fact label={t("add_year")} value={read.entry.year} none={t("add_not_found")} />
              <Fact label={t("add_journal")} value={read.entry.source} none={t("add_not_found")} />
            </dl>
          </section>
          {/* One polite live region for what happens next: the passphrase note, the keeping, the result. */}
          <div className="addpaper-status" role="status" aria-live="polite" data-testid="add-status">
            {note && <p className="addpaper-note">{note}</p>}
            {step.at === "keep" && (
              <KeepInto key={step.attempt} project={step.project} entry={read.entry}
                again={() => setStep((s) => (s.at === "keep" ? { ...s, attempt: s.attempt + 1 } : s))} />
            )}
          </div>
          {step.at === "facts" && (
            <Button variant="primary" className="addpaper-keep" aria-disabled={asking || undefined} data-testid="add-keep" onClick={() => { void begin(); }}>{t("add_keep")}</Button>
          )}
          {step.at === "choose" && <ProjectChoices onChoose={(project) => setStep({ at: "keep", project, attempt: 0 })} />}
        </>
      )}
    </main>
  );
}

/** One line of the paper's facts: the value, or "Not found on that page" (the bookmark reads only the tags a page publishes). */
function Fact({ label, value, none }: { label: string; value: string | undefined; none: string }) {
  return (
    <div className="addpaper-fact">
      <dt>{label}</dt>
      <dd>{value || none}</dd>
    </div>
  );
}

/**
 * "Choose a project": every project of the account by its opened title (GET /projects; the current one first, finished ones last), then the scratch space. The list is asked for
 * only here, after the passphrase, since the titles are sealed. A list that cannot be loaded says so and can be asked for again.
 */
function ProjectChoices({ onChoose }: { onChoose(c: Choice): void }) {
  const t = useT();
  const { me } = useSettings();
  const [list, setList] = useState<Project[] | "failed" | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    apiFetch<Project[]>("/projects").then((p) => { if (live) setList(p); }, () => { if (live) setList("failed"); });
    return () => { live = false; };
  }, [attempt]);
  const active = me?.activeProjectId ?? null;
  const ordered = useMemo(() => {
    if (!Array.isArray(list)) return [];
    const rank = (p: Project) => (p.id === active ? 0 : p.status === "complete" ? 2 : 1);
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [list, active]);
  const retry = () => { setList(null); setAttempt((n) => n + 1); };

  return (
    <section className="addpaper-step" aria-labelledby="addChooseH" data-testid="add-choose">
      <h2 id="addChooseH" className="addpaper-h2">{t("add_choose_h")}</h2>
      {list === "failed" ? (
        <div data-testid="add-projects-fail">
          <p className="addpaper-note">{t("add_projects_fail")}</p>
          <Button variant="ghost" className="addpaper-btn" data-testid="add-projects-retry" onClick={retry}>{t("add_retry")}</Button>
        </div>
      ) : !Array.isArray(list) || !me ? (
        <p className="addpaper-note" role="status" data-testid="add-projects-loading">{t("add_projects_loading")}</p>
      ) : (
        <ul role="list" className="addpaper-choices">
          {ordered.map((p) => <ChoiceRow key={p.id} project={p} current={p.id === active} onChoose={onChoose} />)}
          <li>
            <button type="button" className="addpaper-choice" data-testid="add-choice" onClick={() => onChoose({ id: me.scratchProjectId, name: t("scratch_name"), href: placeHref(me.scratchProjectId, "writing") })}>
              <span className="addpaper-choice-name" data-testid="add-choice-name">{t("scratch_name")}</span>
            </button>
          </li>
        </ul>
      )}
    </section>
  );
}

/** A project as a button: its opened title (never the ciphertext; "Locked title" for the moment it takes to open), and a tag on the one the student has open. */
function ChoiceRow({ project, current, onChoose }: { project: Project; current: boolean; onChoose(c: Choice): void }) {
  const t = useT();
  const title = useTitle(project, "project");
  const opening = title.state === "locked";
  return (
    <li>
      <button type="button" className="addpaper-choice" aria-disabled={opening || undefined} data-testid="add-choice"
        onClick={() => { if (!opening) onChoose({ id: project.id, name: title.text, href: homeHref(project.id) }); }}>
        <span className="addpaper-choice-name" data-testid="add-choice-name">{title.text}</span>
        {current && <span className="addpaper-tag">{t("add_current")}</span>}
      </button>
    </li>
  );
}

/** Where the keep is: working (waiting for the library, then the keep, then the save), done, or a failure. `filed` is what fileCapture answered. */
type Outcome = { at: "working" } | { at: "saving"; filed: CaptureFiled } | { at: "done"; filed: CaptureFiled } | { at: "unsaved"; filed: CaptureFiled } | { at: "unreachable" };

/**
 * Keeps the paper in `project`, once the library has been read, and tells the student how it went. The keep is fileCapture (keepEntry), then `flush()`: "Kept in {project}." is
 * said, and the tab closed, only when that answered true, so a closed tab never loses the paper (ruling B2-R16). A library that does not open on this device is never written;
 * one that could not be read says so and can be asked again (Try again starts the keep afresh); a keep the server did not take is held and Try again sends it again.
 */
function KeepInto({ project, entry, again }: { project: Choice; entry: CitationEntry; again(): void }) {
  const t = useT();
  const library = useProjectLibrary(project.id);
  const latest = useRef(library);
  useEffect(() => { latest.current = library; });
  const started = useRef(false);
  const asked = useRef(false);
  const [out, setOut] = useState<Outcome>({ at: "working" });
  const [stays, setStays] = useState(false);

  /** Sends what the library holds; the keep is said once the server has it. */
  const save = useCallback(async (filed: CaptureFiled) => {
    setOut({ at: "saving", filed });
    const saved = await latest.current.flush();
    setOut(saved ? { at: "done", filed } : { at: "unsaved", filed });
  }, []);

  /** The keep itself, then the save. A library that will not take the paper is "could not be read" (Try again). */
  const keep = useCallback(async (l: Library) => {
    let filed: CaptureFiled;
    try { filed = fileCapture(entry, l); } catch { setOut({ at: "unreachable" }); return; }
    await save(filed);
  }, [entry, save]);

  useEffect(() => {
    if (started.current) return;
    // The vault locked again meanwhile: reading asks for the passphrase (the library's flush does), and the keep follows the read.
    if (library.locked) {
      if (!asked.current) { asked.current = true; void library.flush(); }
      return;
    }
    asked.current = false;
    if (!libraryRead(library)) return;
    started.current = true;
    // The keep writes to the library (outside React) as soon as it has been read, once; where it has got to is state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void keep(library);
  }, [library, keep]);

  // The keep is on the server: the tab closes itself a moment later. A tab the browser will not close (it was not opened by the bookmark) stays, and says it can be closed.
  useEffect(() => {
    if (out.at !== "done") return;
    const id = setTimeout(() => { window.close(); setStays(true); }, CLOSE_AFTER_MS);
    return () => clearTimeout(id);
  }, [out.at]);

  const name = project.name;
  if (out.at === "done") {
    const { filed } = out;
    return (
      <div className="addpaper-result" data-testid="add-done">
        <p className="addpaper-ok">{filed.state === "kept" ? t("add_kept", { project: name }) : t("add_already", { project: name })}</p>
        {filed.filled && <p className="addpaper-note">{t("cap_filled", { title: entry.title ?? "" })}</p>}
        <Link href={project.href} className="addpaper-link" data-testid="add-back">{t("add_back")}</Link>
        {stays && <p className="addpaper-note" data-testid="add-close">{t("add_close")}</p>}
      </div>
    );
  }
  if (out.at === "unsaved") {
    return (
      <div data-testid="add-unsaved">
        <p className="addpaper-note">{t("add_unsaved")}</p>
        <Button variant="ghost" className="addpaper-btn" data-testid="add-unsaved-retry" onClick={() => { void save(out.filed); }}>{t("add_retry")}</Button>
      </div>
    );
  }
  // Before the keep: a library that does not open is never written; one that could not be read can be asked again.
  if (out.at === "working" && library.broken) return <p className="addpaper-note" data-testid="add-failed">{t("vault_cite_broken")}</p>;
  if (out.at === "unreachable" || (out.at === "working" && library.error)) {
    return (
      <div data-testid="add-failed">
        <p className="addpaper-note">{t("add_keep_fail")}</p>
        <Button variant="ghost" className="addpaper-btn" data-testid="add-retry" onClick={again}>{t("add_retry")}</Button>
      </div>
    );
  }
  return <p className="addpaper-note" data-testid="add-keeping">{t("add_keeping", { project: name })}</p>;
}
