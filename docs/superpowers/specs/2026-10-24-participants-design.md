# Participant list with name matching: design

Date: 2026-10-24. Branch `participants-register` off `phase-3a-vault` (f25f9e6). Mockups: `.superpowers/brainstorm/75799-1792814796/content/participants-tab.html` and `matching.html` (git-ignored; the parts that matter are written out below).

## 1. Why

Appuscholar today guesses which values are names from their shape. v1's rule (`packages/core/src/pdscan.ts`, `pdTestVal('name', …)`) counts any value of letters and spaces as a name, so a column of open answers is reported as "looks like names" with **Replace with a code** chosen for the student; Apply swaps every answer for P001, P002 … (fault F1 of the 2026-10-23 walk, `docs/walkthroughs/notes/2026-10-23-tools-walk.md`). The check before an AI request (`packages/core/src/pd.ts`) finds email addresses, phone numbers and ID numbers, and no names at all. Every Apply in Statistics makes fresh codes, so the same person is P001 in one data set and P007 in the next.

OJ's direction (2026-10-24): stop guessing names. In research the student introduces their participants and records observations against them, so the student adds their participants on purpose in a structured step, each gets a code, and Appuscholar looks for those exact names everywhere and makes sure each is coded or removed. Where text still seems to hold a name, it is highlighted as a suggestion the student approves or changes. A student who prefers can remove names by hand.

This follows standard practice: how participants are identified is planned in the protocol, the data plan, the consent form and the ethics application; the list itself (an enrolment log, or linking key) starts when the first person joins.

## 2. Goals, non-goals, anti-goals

Goals
- The plan is made once in Design and ethics and flows into the consent form, the ethics statement and the protocol, so plan and paperwork cannot drift apart.
- A participant list, first tab of Collection and analysis, sealed in the vault, holding only what the plan says is recorded.
- One code per person for the whole project, in every data set and document.
- Names on the list are found in pasted tables, in the project's documents and in AI requests, and swapped for codes when the student presses a button.
- Names not on the list are offered as suggestions, never acted on by default.
- Consent per person, including a parent's permission and the child's own agreement for anyone under 18; withdrawal with what happens to the person's data.
- Fixes F1 and O1 (the consent form had no guardian or assent lines).

Non-goals
- Guessing names in prose by shape (capitalised words in general). Suggestions come from three precise sources only (§7.5).
- Converting names between scripts (प्रिया ↔ Priya). The student lists each spelling.
- Storing data rows. Ruling R1 stays for Statistics' tables: rows stay in memory.
- A "participant characteristics" paragraph writer (n, gender split, mean age). Later, if Dr. Sharma wants it.
- Contacting participants, scheduling, reminders.

Anti-goals (a failure even if it works)
- Any action on a name the student did not put on the list or approve.
- The list, or any name from it, leaving the browser unsealed except when the student deliberately downloads it (Download the list, Export all my work: C10): no plaintext blob, no name in the project export, the home's facts, logs, analytics or error reports.
- A blocked student: consent warnings warn; they never stop a row being saved or matching from running.

## 3. Rulings and calls

OJ's rulings, 2026-10-24:
1. The plan lives in Design and ethics; the list is the first tab of Collection and analysis.
2. What is recorded is a standard menu the student ticks (OJ's idea), in two groups kept apart: "who they are" (sealed list only) and "about them" (travels with the code).
3. The list is stored, sealed in the vault: an exception to ruling R1 ("participant data rows stay in memory, never stored"), for the list only.
4. Students may list under-18 participants by name, with a parent's permission and the child's own agreement per person and the Ethics minors note reworded (Dr. Sharma's wording).
5. The Participants tab as drawn in the mockup stands for now; Dr. Sharma reviews it after it is live and we iterate on his feedback. "Build, integrate and test; he gives feedback and we iterate."

Claude's calls (OJ said "you decide" or did not object; each is open to Dr. Sharma's review):
- C1. "About them" fields get optional columns on the tab; a line says "Fill these only if they are not already in your data tables."
- C2. Matching looks for the full name and the spellings the student wrote, nothing else. The Add form suggests the name's first word as a short name, which the student can delete. A surname alone is not looked for unless listed.
- C3. A built-in list of common Indian and English first names (Latin script) feeds amber suggestions in documents and AI requests.
- C4. Made-up names mode: tables get the code, documents and AI requests get the made-up name.
- C5. Aadhaar, PAN and other government ID numbers are not offered in the menu.
- C6. The list is not part of the project export; "Download the list" is the one way out, on purpose.
- C7. "Destroy the list" keeps only the next code number and the date it was destroyed, so codes are never reused.
- C8. An unanswered plan question does not block the tab: the plan line says "Not answered yet".
- C9. Highlights in the open document are on whenever the list is open, with a switch on the tab to turn them off.

Calls from the builder check (2026-10-24; each settled here, open to OJ's or Dr. Sharma's change):
- C10. "Export all my work" (`apps/web/lib/vault/export.ts` `exportAll`, register D-S2-36) carries the list, as it carries every kind: it is the student's own backup and the right of access and portability; leaving it out would lose the linking key for good on account erasure. Its dialog gains a line when a project has a list: "This file includes your participant lists, with names. Keep it apart from your data." The project export (one project's zip) does not carry it (C6).
- C11. AI requests keep the three-button dialog; no review screen. The dialog lists names from the list and "might be" names; each "might be" name has a small Mask / Leave toggle (starts at Mask). "Not a name" is learned only on the tab and in Find names, not from the dialog.
- C12. A spelling marked everyday (and the built-in everyday names) matches only when written with a capital first letter, so "I will" is never a find; Devanagari has no capitals, so an everyday Devanagari spelling is always an ask find.
- C13. Suggestions in AI requests run only in a project whose plan is codes or made-up names, or that has a list; and not in requests whose text is published papers (Analyse a paper, the reading shelf, research ranking, citation tools), which opt out. Names on the list are matched in every request.
- C14. Roll-number columns in Statistics with a list: values matching people's `roll` become their codes; other roll columns start at Remove (fresh codes would clash with list codes). Without a list, v1.
- C15. Plan changes never delete: an unticked field's stored values are kept and the tab says "Contact is still stored for 3 people, but your plan no longer records it." with "Remove these values"; a plan switched to anonymous while people are listed shows the list with "Your plan now says anonymous, but a list of 5 people is stored. Destroy the list, or change the plan back." Matching runs while a list exists.
- C16. "Paste a list" also reads a key file (Statistics' `appuscholar_key_keep_separate.csv`, v1's key file: first heading `ParticipantCode`, or each line starting with a code like `P001`): those codes are kept, `next` becomes the highest plus one; a code already on the list under another name is skipped and reported.
- C17. "Remove their data" acts on Statistics rows only. In Find names and the highlights, a withdrawn person's finds carry "withdrew: remove their data"; deleting their turns from a transcript is the student's job.
- C18. The minors note: v1's `ecMinorsNote` stays as it is (its golden holds); a new `ecMinorsNoteV2` (as `aiuBuildV2` does for the AI-use statement) carries the new last sentence, always, and the Ethics tab uses it.
- C19. Replacing names changes a document's current text only. Earlier saved versions (`document_revisions`) and trashed documents keep the old text, sealed; Find names says so in one line. Reaching them is a follow-up, not this build.

## 4. The plan: Design and ethics → Ethics tab

New, under the approval record, before the two generator buttons:

**"How will you identify participants?"** Three answers, stored as `idMode`:
- `codes`: "By codes (P001, P002 …). Their names stay in a sealed list."
- `pseudonyms`: "By made-up names. Their real names stay in a sealed list."
- `anonymous`: "Anonymously. No names are recorded, so answers cannot be linked to anyone."

**"What will you record about each person?"** (shown unless `anonymous`). The menu, stored as `record` (a list of field ids, plus `recordOther`, up to five labels the student types for the about group):

| id | Group | Starts | Line shown beside it |
|---|---|---|---|
| (code) | who | always, not a tick | Made by Appuscholar, never reused |
| `name` | who | ticked | To meet them, match a before-and-after, or find their answers if they withdraw |
| `spellings` | who | ticked | Short names and other spellings, so their name is found in your text |
| `contact` | who | off | Only if you will contact them again |
| `roll` | who | off | Only if your institution insists |
| (consent) | consent | always, not a tick | How and when they agreed; for under-18s, a parent's permission and their own agreement; withdrawal |
| `age` | about | off | Age in years, not date of birth |
| `gender` | about | off | Include "prefer not to say" |
| `year` | about | off | Year or class |
| `course` | about | off | |
| `area` | about | off | Urban or rural, or district; not village or street |
| `language` | about | off | |
| `caste`, `religion`, `health`, `income` | about | off, warned | "Sensitive: your committee will ask why you need it" |

Under the about group, when three or more of age, gender, year, course, area, language and the four sensitive fields are ticked: "In a small group, these together can point to one person even without a name. Report them in groups (for example 18–20) in your write-up."

Where the plan flows (all additions appear only when `idMode` is set; with `idMode` unset every output is v1's, byte for byte, so the goldens hold):
- **Consent form** (`consentMarkdown` in `packages/core/src/design.ts`, new optional second argument): a "What we record about you" section naming the ticked fields in plain words and how they are kept (codes / made-up names / anonymous). When the minors answer is `yes` or `unsure`, two more sections before the signatures: "Parent or guardian permission" (a line to name the child, signature, date) and "Young person's agreement" (that they were told about the study in words they understand and agree, and can stop at any time; signature, date). Fixes O1.
- **Ethics statement** (`ethicsStatement`, optional argument): one sentence on identification, e.g. codes: "Each participant was given a code; the list linking codes to names was kept separately, sealed under the researcher's passphrase."; anonymous: "No names were recorded, so responses cannot be linked to participants."
- **Protocol** (`protocolMarkdown`, optional argument): a line "**How participants are identified:**" after the data management plan.
- **Ethics minors note** (new `ecMinorsNoteV2`, C18; v1's `ecMinorsNote` untouched): its last sentence ("Appuscholar is for adults and does not collect children's data itself.") replaced, for Dr. Sharma's wording, by e.g. "If you list people under 18, only you can open the list. You still need a parent's permission and their own agreement before you record anything about them."

Storage: `idMode`, `record`, `recordOther` are new optional fields on the existing `design_ec` blob (loose schema; an old blob still parses). Saved by Save as the other record fields are.

Exact wording of every new sentence is the builder's, in plain words, for Dr. Sharma's review (register rows `proposed`).

## 5. The list: Collection and analysis → Participants

First tab of Collection and analysis (`TOOL_TABS`: `participants` before `data`), its own tool module `components/tools/participants/` (tool id `participants`, added to `ToolId` and the registry; stage `collect`).

What the tab shows, top to bottom (as the mockup):
1. Heading "Your participants", one line on what the tab does, and a pill "Sealed in your vault: only you can open it".
2. The plan line from Ethics: mode, the ticked fields, and "Some are under 18" when the minors answer is yes or unsure; a link to the Ethics tab. Unanswered: "Not answered yet in your plan" with the link (C8).
3. A count line: "5 people · 1 withdrawn · 1 consent not complete". Warns, never blocks.
4. The table: Code, Name and other spellings (spellings small under the name; a spelling that is also an everyday word marked so), Joined; a Consent group (How, and when the minors answer is yes or unsure: Under 18, Parent's permission, Own agreement); Contact and Roll when ticked; Made-up name in pseudonyms mode; an "About them" group with only the ticked fields; Edit, or a "Withdrew <date> · <remove|keep> their data" tag. Under the table: "Fill these only if they are not already in your data tables." On a phone the table scrolls inside itself.
5. Buttons: **+ Add a person**, **Paste a list**, **Find names in my documents**, **Copy as table (codes, no names)**, **Download the list**, **Destroy the list**; and the switch "Highlight names in my documents" (C9).
6. The Add / Edit form: the ticked fields, "the next code is P006"; Other spellings pre-filled with the name's first word (C2); a note "Add the Hindi spelling if they write their name that way: Appuscholar does not turn one script into the other."; per spelling, "also an everyday word" (pre-ticked when it is on the built-in everyday list, §7.4).

Behaviour:
- **Codes**: `P` + at least three digits (P001 … P999, P1000 …), from `next`, never reused (withdrawal and destruction keep the counter).
- **Under 18** per person: from age when age is recorded (under 18), else a tick, shown only when the minors answer is yes or unsure. An under-18 row lacking either the parent's permission or the child's agreement shows amber "consent not complete". Not blocked; matching still runs.
- **Paste a list**: one person per line; text after the first comma is other spellings, comma-separated. A key file is read with its codes kept (C16). A line whose name is already on the list is skipped and reported. Each new person gets the next code; joined = today; consent left for the student.
- **Withdraw** (in Edit): date, and "Remove their data" or "Keep what was collected" (the consent form says which the student may do; the tab says to check it). The code is kept. Their row is greyed.
- **Copy as table**: code, made-up name in pseudonyms mode, and the about-them columns; never names, spellings, contact or roll. Tab-separated so it pastes into Word and Excel.
- **Download the list**: a CSV of everything on the list, named `participant-list-<project>.csv`, with a line above the button: "This file holds names. Keep it apart from your data."
- **Destroy the list**: asks twice (an in-page dialog, not `confirm()`); writes a list with no people and keeps `next` and `destroyedAt` (C7). Matching stops. The tab then says the list was destroyed on <date> and new people continue from the next code.
- **Anonymous** plan: the whole tab is one line, "Your plan says this study is anonymous, so no list is kept. If that changes, change it in Design and ethics." plus the link. Matching against a list is off; suggestions (§7.5) still run.
- **Vault**: the list is only ever stored sealed. Vault off: the tab says "Set up your vault first: your participant list is only ever stored sealed." with the vault's own set-up button; nothing is stored. Vault locked: "Unlock to see your participants" and nothing else. The API refuses a plaintext write (`keyVersion` 0) for this kind with 409 (defence in depth: `apps/api/src/routes/blobWrite.ts`).
- **The home's facts** for Collection may show counts only ("5 participants"), never a name.

## 6. Data

New blob kind `participants` (`apps/web/lib/blobs/kinds/participants.ts`, gathered in `kinds.ts` `BLOB_KINDS`, mirrored in `apps/api/src/routes/blobWrite.ts` `BLOB_KINDS`; `KIND_STAGE.participants = { stage: "collect", work: true }`; guarded, not in `UNGUARDED`). Loose objects as every kind:

```ts
type Participant = {
  id: string;                 // random, stable; never shown
  code: string;               // "P001"
  name: string;
  spellings: string[];        // other spellings and short names, as typed
  everyday: string[];         // the spellings marked "also an everyday word" (a subset of spellings, or the name)
  joined: string;             // yyyy-mm-dd
  consentHow?: "written" | "online" | "verbal" | "waived";
  minor?: boolean;            // only when age is not recorded
  guardian?: boolean;         // parent's or guardian's permission
  assent?: boolean;           // the child's own agreement
  contact?: string; roll?: string; pseudonym?: string;
  about: Record<string, string>;   // by field id or recordOther label
  withdrawn?: { on: string; data: "remove" | "keep" };
};
type ParticipantList = {
  v: 1;
  next: number;               // the next code's number; never goes down
  people: Participant[];
  notNames: string[];         // normalised words the student answered "Not a name" for (§7.5)
  highlight?: boolean;        // C9; absent = on
  destroyedAt?: string;
};
```

`design_ec` gains optional `idMode`, `record: string[]`, `recordOther: string[]`.

## 7. Matching

A pure engine in `packages/core/src/participants.ts` (unit tests; no goldens, it is not v1's): build a matcher from the list, find names in a string, and replace finds.

7.1 **What is looked for**: each person's name and each of their spellings (C2). Withdrawn people are still looked for (their name in text is still personal data); destroyed lists look for nothing.

7.2 **Normalising**: Unicode NFC; any case (toLocaleLowerCase), except that an everyday spelling must be written with a capital first letter (C12); runs of spaces as one; a dot inside a name counts as a space ("R.K. Sharma" and "R. K. Sharma" match each other; "RK Sharma" does not, since letters are never joined); curly and straight apostrophes the same.

7.3 **Whole words**: a find may not have a letter, digit or combining mark (`\p{L}\p{N}\p{M}`) right before or after it, so "Priya's" and "Priya-ji" match and "Priyanka" does not; in Devanagari the vowel signs and virama are marks, so "प्रिया" matches in "प्रिया की" and not in "प्रियांका". Longest spelling first, so "Priya Sharma" is one find, not "Priya" plus a word.

7.4 **Sure and ask**: a find is **sure** (purple) unless it is one of these, which are **ask** (amber, each answered one by one, never in "Replace all"):
- a spelling marked everyday (the built-in everyday list pre-ticks: Asha, Kiran, Pooja, Raja, Rani, Dev, Joy, Rose, Will, Hope, Sunny, Bill, Mark, and the builder's additions from common Hindi and English words that are also given names);
- a spelling shared by two or more people on the list (both codes offered).

7.5 **Suggestions for names not on the list** (amber, "Might be a name", each answered with Replace with [name] / Add to my list / Not a name; "Not a name" is stored in `notNames` and never asked again in this project):
- Tables: v1's name-by-values rule, as today, except that a column with any value of more than four words is not flagged as names (it goes on to v1's long-text check). A flagged column's choice starts at "Choose…", never at an action. Fixes F1.
- Documents and AI requests: a speaker label at the start of a line (`^<1 to 3 capitalised words>:`) other than Interviewer, Researcher, Moderator, Participant, Respondent, Q, A, or a code; and a capitalised Latin-script word on the built-in common first names list (C3; about 1,500 Indian and English given names, compiled by the builder, a plain word list in `packages/core/src/data/`, lazy-loaded in the web).
- Never: other capitalised words, Devanagari words not on the student's list, surnames.

7.6 **Replacing**: a sure find becomes the person's code, or their made-up name in documents and AI requests in pseudonyms mode (C4); a suggestion becomes `[name]` or, after Add to my list, the new code. Replacing keeps the text around it (Priya's → P001's).

## 8. Where matching runs

8.1 **Statistics → Data, the personal-details box** (`apps/web/components/tools/stats/PdBox.tsx`, `lib/tools/stats/lab.ts`). `pdScan` itself is not changed (its goldens hold); the box reads its result plus the list:
- Email, phone, ID number and date-of-birth columns by values, and address by heading: as today (Remove).
- Roll-number columns (C14): values matching people's `roll` become their codes; with a list, other roll columns start at Remove.
- A column with values on the list: "4 names are on your list (P001 P002 P003 P005)", choice starts **Replace with their codes**. Values not on the list: "1 name is not on your list: Sunita Devi"; replacing then adds them to the list, and the box says so before Apply ("Apply will add 1 person to your list: Sunita Devi (P006)").
- A column whose heading says names but whose values are not on the list: choice starts at Replace with codes (adds them to the list), as v1's heading rule starts at code.
- A column flagged only by the name-by-values rule: "Might be names", choice starts "Choose…" (no action until chosen), options Replace with codes / Remove / Keep / Not names.
- Other text columns: listed names inside answers, "names from your list inside 2 answers: Rahul", choice starts Replace with their codes; ask finds and suggestions inside answers start "Choose…".
- Rows of a withdrawn person who chose "remove their data" (found by name or by code in any column): "Imran withdrew on 15/10/2026 and asked for his data to be removed", choice starts **Remove these rows**. "Keep" withdrawals get a note only.
- Codes come from the list, so Apply downloads no key file ("Codes come from your list, so Priya is P001 in every data set. The list is the key."). With the vault off, or no list and a codes plan not yet set up, Apply works as v1 (fresh codes and the key file) with a line saying why. Anonymous plan: name columns start at Remove with "Your plan says this study is anonymous."
- The box's wording keeps v1's rule 8 (never says the data is safe) and the scope note.

8.2 **Documents**: "Find names in my documents" on the tab reads every document of the project (`useDocAccess().allDocuments()`), lists finds grouped by document and person ("P001 Priya Sharma · 3 places (incl. प्रिया)") with **Replace all** for sure finds, **Check each** for ask finds (each with its sentence, Replace / Skip), and Add to list / Replace with [name] / Not a name for suggestions. Replacing rewrites each affected document (`rewriteDocument`), replacing inside text nodes only; a document that refuses (deleted, unsaved text held) is reported by name. The open document is painted by a `DocumentLayer` for the participants module, using the CSS Custom Highlight API (`CSS.highlights`; purple for sure, amber for ask and suggestions), recomputed on edits (debounced), never stored, off when the switch is off, the list is locked, or the browser lacks the API.

8.3 **AI requests** (`apps/web/lib/ai/callAI.ts`, `pdDialog.tsx`): the scan adds listed names and suggestions to the counts ("Found: 2 names from your participant list, 1 email address. Might be a name: Meena."). Ask finds are listed with the "might be" names (C11). Mask turns sure finds into codes (made-up names in pseudonyms mode), each "might be" name left at Mask into `[name]` (or its code, for an ask find on the list), and the rest as today. Which requests get suggestions: C13. "Send as it is" is remembered by the same signature rule as today, with the names in the signature. If the project has a list that is locked: "Your participant list is locked, so names on it were not checked." with Unlock beside the buttons. Statistics' "Explain in plain language" has its own step first (`lib/tools/stats/explainGuard.ts`, D-S2-70: flagged column values written in the request): with a list open, a flagged value that is on the list is masked as its code rather than `[name 1]`, and nobody is asked twice about the same name in one request (callAI's scan skips names the step already asked about). The dialog's sentence "It cannot find a name written inside a sentence" changes to say it finds names on the list and common first names (O14's "goes straight to your AI provider" wording is a separate decision, left as it is).

## 9. Constraints

- Tests first for every change (core unit tests, web component tests, one new e2e spec `apps/web/e2e/participants.spec.ts`). Do not edit the QA session's files (new suites under `apps/web/e2e/` it adds, a QA folder, its CI job). Existing tests that assert the personal-details box (`apps/web/test/statsIntake.test.tsx`, `apps/web/e2e/tools-b.spec.ts`) are updated only where this design changes what they assert.
- v1 parity: `pdScan`, `pdTransform`, `consentMarkdown`, `ethicsStatement`, `protocolMarkdown`, `scanText`, `maskText` keep v1's output when the new arguments are absent; goldens unchanged. Every departure from v1 gets a row in `docs/superpowers/specs/parity-deviations.md` from D-S2-113: the Participants tab (new); the plan question and menu; consent form sections (O1); ethics statement and protocol lines; the minors note (proposed, Dr. Sharma); the box's list codes and no key file; F1's four-word rule and "Choose…" start; the AI dialog's names; the R1 exception (OJ's ruling).
- English copy plain; Hindi for every new key in the module's `.hi.json`, marked by its `$draft` line for Dr. Sharma. New keys only in the module's own message files.
- Import `TOOL_TABS` from `@/lib/tools/tabs`; the registry by type only (test/toolLoadOrder.test.ts).
- CI: changes, checks, e2e green; golden-exact runs when `packages/core` changes. PR against `phase-3a-vault`.
- Release: the API changes (new kind, plaintext refused), so API then web, from the deploy clone (`scripts/deploy-vercel.sh api`, then `web`). No migration (the blob table takes any kind the API allows).

## 10. Left to the builder

The exact wording of every new sentence (plain words; Dr. Sharma reviews); the common first names and everyday word lists; layout details within the mockup; how the box lays out several findings per column; the CSV columns' order; the home's facts line; internal module boundaries; how the AI scan reaches the open list (a store set by a host in the project shell, as keys are).

## 11. For Dr. Sharma, after it is live

The tab's layout and columns; the menu's fields and lines; the consent form's new sections; the minors note; whether a characteristics paragraph is wanted; the Hindi.
