"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { buildMatcher, normName } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import type { Participant, ParticipantList } from "@/lib/blobs/kinds/participants";
import { useDocAccess, type ProjectDocument } from "@/lib/editor/docAccess";
import { todayIso } from "@/lib/tools/participants/dates";
import { findInHtml, NAME_PLACEHOLDER, replaceInHtml, type DocFind } from "@/lib/tools/participants/docNames";
import { addNotName, addPerson, nextCode, suggestedShortName, toMatchPeople } from "@/lib/tools/participants/list";
import type { ParticipantsPlan } from "@/lib/tools/participants/plan";
import { Button } from "@/components/ui/button";

/*
 * Find names in my documents (spec 2026-10-24-participants-design.md §7 and §8.2; calls C4, C17 and C19; the mockup's panel B). A button on the Participants tab; pressed, it reads
 * every document of the project (useDocAccess().allDocuments()) and lists the names found, document by document and person by person:
 *
 * - names on the list that are sure: "P001 Priya Sharma · 3 places (incl. प्रिया)" with Replace all, which rewrites that document (rewriteDocument, once) with every sure find of that
 *   person replaced by their code, or their made-up name in made-up names mode (C4; a person with none yet gets the code, and the row says so);
 * - names to ask about (a spelling that is also an everyday word, or that two people share, or one letter): "Check each", which opens each place with its sentence and Replace / Skip;
 *   a shared spelling asks which person first;
 * - names that are not on the list (suggestions, §7.5): Add to list (the person is added with the next code, the line says which), Replace with [name], and Not a name (learned for the
 *   project, so the word is not asked about again anywhere).
 * A person who withdrew and asked for their data to be removed has their finds tagged "withdrew: remove their data" (C17); deleting their turns from a transcript is the student's job.
 *
 * Nothing changes until a button is pressed, and a button acts on what its row says and nothing else: each write reads the documents again first (the student may have typed since),
 * finds the names again in the document as it is now and replaces only the finds the button stands for. A document that refuses (deleted, or text this tab could not save yet) is named
 * by its title in the page; it is never in a toast, and no name is ever in a toast, a console line or an address. Results are derived from the documents read and the list as it is, so
 * adding a person or learning "Not a name" shows at once, and after a replace the documents are read again. C19: replacing changes a document's current text only; the one line that says
 * earlier saved versions still hold the old text is shown once, under the results.
 *
 * The documents are read only when the button is pressed (the results are mounted then, and press again to read again), so the tab costs nothing until it is used.
 */

type Why = "everyday" | "shared" | "short";
type SureRow = { person: Participant; finds: DocFind[] };
type AskRow = { key: string; people: Participant[]; finds: DocFind[]; whys: Why[] };
type SuggestRow = { word: string; finds: DocFind[] };
type Card = { doc: ProjectDocument; sure: SureRow[]; ask: AskRow[]; suggest: SuggestRow[] };

/** A find's identity within one document as read now. */
const findKey = (f: DocFind) => `${f.block}:${f.start}:${f.end}:${f.text}`;

/** The finds of one document, grouped as the results show them, in the order they first appear. */
function cardOf(doc: ProjectDocument, finds: DocFind[], byId: Map<string, Participant>): Card {
  const sure = new Map<string, SureRow>();
  const ask = new Map<string, AskRow>();
  const suggest = new Map<string, SuggestRow>();
  for (const f of finds) {
    if (f.kind === "suggest") {
      const key = normName(f.text);
      const row = suggest.get(key) ?? { word: f.text, finds: [] };
      row.finds.push(f);
      suggest.set(key, row);
      continue;
    }
    const people = f.personIds.map((id) => byId.get(id)).filter((p): p is Participant => p !== undefined);
    if (people.length === 0) continue;
    if (f.kind === "sure") {
      const row = sure.get(people[0]!.id) ?? { person: people[0]!, finds: [] };
      row.finds.push(f);
      sure.set(people[0]!.id, row);
    } else {
      const key = people.map((p) => p.code).join("+");
      const row = ask.get(key) ?? { key, people, finds: [], whys: [] };
      row.finds.push(f);
      if ((f.why === "everyday" || f.why === "shared" || f.why === "short") && !row.whys.includes(f.why)) row.whys.push(f.why);
      ask.set(key, row);
    }
  }
  return { doc, sure: [...sure.values()], ask: [...ask.values()], suggest: [...suggest.values()] };
}

const hasRows = (c: Card) => c.sure.length + c.ask.length + c.suggest.length > 0;

/** Their finds carry "withdrew: remove their data" (C17). */
const withdrewRemove = (p: Participant) => p.withdrawn?.data === "remove";

export function FindNames({ list, plan, save, refused }: {
  list: ParticipantList;
  plan: ParticipantsPlan;
  save(update: (prev: ParticipantList) => ParticipantList): boolean;
  /** What a change that did not land says (the tab's own line). */
  refused(): string;
}) {
  const t = useT();
  // 0 is closed; pressing the button opens the results, and again reads the documents again (a new run starts clean).
  const [run, setRun] = useState(0);
  return (
    <>
      <Button type="button" variant="ghost" size="sm" data-testid="pp-find" onClick={() => setRun((n) => n + 1)}>
        <MagnifyingGlass aria-hidden="true" />{t("pp_find")}
      </Button>
      {run > 0 && <Results key={run} list={list} plan={plan} save={save} refused={refused} onClose={() => setRun(0)} />}
    </>
  );
}

function Results({ list, plan, save, refused, onClose }: {
  list: ParticipantList;
  plan: ParticipantsPlan;
  save(update: (prev: ParticipantList) => ParticipantList): boolean;
  refused(): string;
  onClose(): void;
}) {
  const t = useT();
  const access = useDocAccess();
  const accessRef = useRef(access);
  const alive = useRef(true);
  useEffect(() => { accessRef.current = access; });
  // null: still reading.
  const [docs, setDocs] = useState<ProjectDocument[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  // The documents that refused a rewrite, by id, with their titles.
  const [refusedDocs, setRefusedDocs] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [chosen, setChosen] = useState<Record<string, string>>({});

  useEffect(() => {
    alive.current = true;
    accessRef.current.allDocuments().then((d) => { if (alive.current) setDocs(d); }, () => { if (alive.current) setDocs([]); });
    return () => { alive.current = false; };
  }, []);

  const byId = useMemo(() => new Map(list.people.map((p) => [p.id, p])), [list.people]);
  const matcher = useMemo(() => buildMatcher(toMatchPeople(list, plan.pseudonyms)), [list, plan.pseudonyms]);
  const cards = useMemo(
    () => (docs ?? []).map((d) => cardOf(d, findInHtml(d.html, matcher, { notNames: list.notNames }), byId)).filter(hasRows),
    [docs, matcher, list.notNames, byId]
  );

  /** What a person's name is replaced with: their made-up name in made-up names mode when they have one, else their code. */
  const replacement = (p: Participant) => (plan.pseudonyms && p.pseudonym?.trim()) || p.code;

  /**
   * Writes: reads the documents again, finds the names again in each document as it is now, and replaces the finds that `pick` gives a text for, one rewrite for each document. A
   * document that refuses is named; the results are then read again. A second press while this runs does nothing.
   */
  async function replaceIn(targets: Array<{ doc: ProjectDocument; pick: (f: DocFind) => string | null }>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setDone(null);
    setStatus("");
    setError("");
    let placed = 0;
    const failed: Record<string, string | null> = {};
    try {
      const fresh = await accessRef.current.allDocuments();
      for (const { doc, pick } of targets) {
        const now = fresh.find((d) => d.id === doc.id);
        if (!now) { failed[doc.id] = doc.title; continue; }
        const picks = findInHtml(now.html, matcher, { notNames: list.notNames }).flatMap((find) => {
          const to = pick(find);
          return to === null ? [] : [{ find, to }];
        });
        if (picks.length === 0) continue;
        if (await accessRef.current.rewriteDocument(now.id, replaceInHtml(now.html, picks))) { placed += picks.length; failed[doc.id] = null; }
        else failed[doc.id] = now.title;
      }
      const again = await accessRef.current.allDocuments();
      if (!alive.current) return;
      setDocs(again);
      setRefusedDocs((prev) => {
        const next = { ...prev };
        for (const [id, title] of Object.entries(failed)) { if (title === null) delete next[id]; else next[id] = title; }
        return next;
      });
      if (placed > 0) setDone(placed);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const replaceAllOf = (doc: ProjectDocument, p: Participant) =>
    replaceIn([{ doc, pick: (f) => (f.kind === "sure" && f.personIds.length === 1 && f.personIds[0] === p.id ? replacement(p) : null) }]);
  const replaceOne = (doc: ProjectDocument, target: DocFind, p: Participant) =>
    replaceIn([{ doc, pick: (f) => (findKey(f) === findKey(target) && f.kind === "ask" ? replacement(p) : null) }]);
  const maskIn = (doc: ProjectDocument, word: string) =>
    replaceIn([{ doc, pick: (f) => (f.kind === "suggest" && normName(f.text) === normName(word) ? NAME_PLACEHOLDER : null) }]);

  /** Adds a suggested name to the list with the next code; a name of several words also gets its first word as the short name, as the Add form suggests (C2). */
  const addToList = (word: string) => {
    const name = word.trim();
    const short = suggestedShortName(name);
    const made: { code?: string } = {};
    if (!save((prev) => {
      const r = addPerson(prev, { name, spellings: short && normName(short) !== normName(name) ? [short] : [], joined: todayIso() });
      made.code ??= r.person.code;
      return r.list;
    })) { setError(refused()); return; }
    setError("");
    setStatus(t("pp_find_added", { name, code: made.code ?? nextCode(list) }));
  };
  const notAName = (word: string) => {
    if (!save((prev) => addNotName(prev, word))) { setError(refused()); return; }
    setError("");
  };

  const places = (n: number) => (n === 1 ? t("pp_find_places_one") : t("pp_find_places_many", { n }));
  const join = (items: string[]) => (items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + t("pp_and") + items[items.length - 1]);
  const refusedTitles = Object.values(refusedDocs);
  const anything = cards.length > 0 || done !== null;

  let body: React.ReactNode;
  if (docs === null) body = <p className="note" role="status" data-testid="pp-find-reading">{t("pp_find_reading")}</p>;
  else if (docs.length === 0) body = <p className="note" data-testid="pp-find-empty">{t("pp_find_no_docs")}</p>;
  else if (cards.length === 0) body = <p className="note" data-testid="pp-find-none">{t("pp_find_none")}</p>;
  else {
    body = cards.map((c) => (
      <section key={c.doc.id} className="my-2 rounded-[10px] border border-line bg-soft px-3 py-2" data-testid={"pp-find-doc-" + c.doc.id}>
        <b>{t("pp_find_doc", { title: c.doc.title })}</b>
        {c.sure.map(({ person: p, finds }) => {
          const short = normName(suggestedShortName(p.name));
          const seen = new Map<string, string>();
          for (const f of finds) {
            const k = normName(f.text);
            if (k !== normName(p.name) && k !== short && !seen.has(k)) seen.set(k, f.text);
          }
          const incl = seen.size > 0 ? t("pp_find_incl", { spellings: [...seen.values()].join(", ") }) : "";
          return (
            <div key={p.id} className={ROW} data-testid={"pp-find-person-" + p.code}>
              <span>
                <span className={TAG_SURE}>{p.code}</span>{" "}
                <span>{t("pp_find_person", { name: p.name, places: places(finds.length), incl })}</span>
                {withdrewRemove(p) && <span className={`${TAG_MAYBE} ml-1.5`} data-testid="pp-find-withdrew">{t("pp_find_withdrew")}</span>}
                {plan.pseudonyms && !p.pseudonym?.trim() && <span className="ml-1.5 text-xs text-muted-foreground">{t("pp_find_no_pseudonym")}</span>}
              </span>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={busy}
                data-testid={"pp-find-replace-all-" + p.code}
                aria-label={t("pp_find_replace_all_aria", { code: p.code, title: c.doc.title })}
                onClick={() => void replaceAllOf(c.doc, p)}
              >{t(finds.length === 1 ? "pp_find_replace_one" : "pp_find_replace_all")}</Button>
            </div>
          );
        })}
        {c.ask.map((row) => {
          const rowKey = c.doc.id + "|" + row.key;
          const finds = row.finds.filter((f) => !skipped.has(c.doc.id + "|" + findKey(f)));
          if (finds.length === 0) return null;
          const texts = [...new Map(finds.map((f) => [normName(f.text), f.text])).values()];
          const why = row.whys.map((w) => (w === "shared" ? t("pp_find_why_shared", { codes: join(row.people.map((p) => p.code)) }) : t("pp_find_why_" + w))).join(", ");
          return (
            <div key={row.key} className="border-t border-line py-1.5 first:border-t-0" data-testid={"pp-find-ask-" + row.key}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <span>
                  <span className={TAG_MAYBE}>{row.people.map((p) => p.code + "?").join(" ")}</span>{" "}
                  <span>{t("pp_find_ask", { words: texts.map((x) => t("pp_find_quoted", { text: x })).join(", "), places: places(finds.length), why })}</span>
                  {row.people.some(withdrewRemove) && <span className={`${TAG_MAYBE} ml-1.5`} data-testid="pp-find-withdrew">{t("pp_find_withdrew")}</span>}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid={"pp-find-check-" + row.key}
                  aria-expanded={open === rowKey}
                  aria-label={t("pp_find_check_aria", { codes: join(row.people.map((p) => p.code)), title: c.doc.title })}
                  onClick={() => setOpen(open === rowKey ? null : rowKey)}
                >{t("pp_find_check")}</Button>
              </div>
              {open === rowKey && (
                <ul className="m-0 mt-1.5 list-none p-0">
                  {finds.map((f) => {
                    const ik = c.doc.id + "|" + findKey(f);
                    const shared = row.people.length > 1;
                    const person = shared ? row.people.find((p) => p.id === chosen[ik]) : row.people[0];
                    return (
                      <li key={ik} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-1" data-testid="pp-find-item">
                        <span data-testid="pp-find-sentence">
                          {f.sentence.slice(0, f.at)}<mark className="rounded bg-flag-bg px-0.5 text-flag-ink">{f.text}</mark>{f.sentence.slice(f.at + f.text.length)}
                        </span>
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {shared && (
                            <select
                              className="input"
                              data-testid="pp-find-pick"
                              aria-label={t("pp_find_pick")}
                              value={chosen[ik] ?? ""}
                              onChange={(e) => setChosen((prev) => ({ ...prev, [ik]: e.target.value }))}
                            >
                              <option value="">{t("pp_find_choose")}</option>
                              {row.people.map((p) => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
                            </select>
                          )}
                          <Button type="button" variant="primary" size="sm" disabled={busy || !person} data-testid="pp-find-replace" onClick={() => person && void replaceOne(c.doc, f, person)}>{t("pp_find_replace")}</Button>
                          <Button type="button" variant="ghost" size="sm" disabled={busy} data-testid="pp-find-skip" onClick={() => setSkipped((prev) => new Set(prev).add(ik))}>{t("pp_find_skip")}</Button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
        {c.suggest.map((row, i) => (
          <div key={normName(row.word)} className={ROW} data-testid={"pp-find-suggest-" + i}>
            <span>
              <span className={TAG_MAYBE} title={t("pp_find_maybe")}>?</span>{" "}
              <span>{row.finds.length === 1 ? t("pp_find_suggest_one", { word: row.word }) : t("pp_find_suggest_many", { word: row.word, places: places(row.finds.length) })}</span>
            </span>
            <span className="inline-flex flex-wrap items-center gap-2">
              <Button type="button" variant="primary" size="sm" disabled={busy} data-testid="pp-find-add" aria-label={t("pp_find_add_aria", { word: row.word })} onClick={() => addToList(row.word)}>{t("pp_find_add")}</Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} data-testid="pp-find-mask" aria-label={t("pp_find_mask_aria", { word: row.word })} onClick={() => void maskIn(c.doc, row.word)}>{t("pp_find_mask")}</Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} data-testid="pp-find-notname" aria-label={t("pp_find_notname_aria", { word: row.word })} onClick={() => notAName(row.word)}>{t("pp_find_notname")}</Button>
            </span>
          </div>
        ))}
      </section>
    ));
  }

  return (
    <div className="w-full basis-full text-[13.5px]" data-testid="pp-find-results">
      <div className="flex items-center justify-end">
        <Button type="button" variant="ghost" size="xs" data-testid="pp-find-close" onClick={onClose}>{t("pp_find_close")}</Button>
      </div>
      {body}
      <div role="status" aria-live="polite">
        {status && <p className="note" data-testid="pp-find-status">{status}</p>}
        {done !== null && <p className="note" data-testid="pp-find-done">{t(done === 1 ? "pp_find_done_one" : "pp_find_done_many", { n: done })}</p>}
      </div>
      {refusedTitles.length > 0 && (
        <div role="alert" data-testid="pp-find-refused">
          {refusedTitles.map((title, i) => <p key={i} className="note text-danger-ink">{t("pp_find_refused", { title })}</p>)}
        </div>
      )}
      {error && <p className="note text-danger-ink" role="alert" data-testid="pp-find-error">{error}</p>}
      {anything && <p className="note" data-testid="pp-find-versions">{t("pp_find_versions")}</p>}
    </div>
  );
}

const ROW = "flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-line py-1.5 first:border-t-0";
const TAG_SURE = "rounded-md bg-purple-100 px-1.5 py-px text-[11.5px] font-semibold text-purple-800";
const TAG_MAYBE = "rounded-md bg-flag-bg px-1.5 py-px text-[11.5px] font-semibold text-flag-ink";
