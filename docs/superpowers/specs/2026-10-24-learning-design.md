# Learning in Appuscholar v2: design

- **Date:** 24 October 2026. **Branch:** `learning-design`, off `phase-3a-vault` at 1ec773b.
- **Status:** draft. OJ approves it before any plan or code. Design only: nothing here is built.
- **What was read:**
  - v1's local clone: build 2026.10.13a, APP_VERSION 55, commit c8c5373. Every engine ported so far is pinned to this build.
  - v1's current `main` on GitHub: build 2026.10.24a, APP_VERSION 116, commit f5336be. Downloaded on 24 October.
  - v2 at 1ec773b, and the wave B plan.
- **Evidence:** the counting and comparison scripts and their output are in the session family's notes folder, `side-session-notes/local_fa5ea583-…/learning-evidence/`. They are outside the repo, which is public.
- **Builder check:** a fresh reader planned from this document on 24 October and raised five questions. All five are answered in the text: the pin folding into a shared one (§6.2), the files outside Learning's folders (§6.9), the strings and emoji (§6.7), the test keys and clip size (§6.4), and the empty group (C17). None needed OJ.
- **Labels:**
  - VERIFIED: I ran it or read it, and I say how.
  - SUPPORTED: follows from something verified.
  - BELIEVED: my judgement.
  - UNKNOWN: not found out.

---

## 1. What Learning is, and why now

Learning teaches a student to read a research paper and the methods behind it. It has four parts:

- **Lectures:** short lectures, played by teaching characters, in English or Hindi.
- **Practice lesson:** a lesson on a fictional paper with flaws planted in it. The student tries first, then sees what the paper says, then hunts for the flaw.
- **Practice questions:** a few after each lecture.
- **Theatre:** a classroom where the lecture plays with pictures and voices.

Dr. Sharma's promises, which v2 keeps:

- The content is written in advance: **"Written content, no AI call"** (v1 build 116, line 11187).
- The characters are AI characters and say so.
- Jokes can be switched off.
- The only AI call is a question box in the lesson, which uses the student's own key.

**Status in v2: not built.** VERIFIED: no Learning route or component exists at 1ec773b. Register row D-S2-44 hid v1's "All lectures" and "Lesson on this paper" buttons as "not built" (walk fault W23).

**Why now.** On 24 October OJ ruled that v2 reaches full production v1 before Dr. Sharma sees anything. Learning is one of the parts still missing (`appuscholar-blueprint/PRODUCTION-V1-TIMELINE.md`, §2).

---

## 2. What v1 has, counted

The most important finding is that **v1's Learning is a moving target.** All counts below are VERIFIED with `learning-evidence/count2.mjs` on both files on 24 October.

| | Build 55, 13 October (local clone; the pin of every ported engine) | Build 116, 24 October (Dr. Sharma's current v1) |
|---|---|---|
| Lectures | 19: 12 on reading a paper, 7 in the library (5 statistics, 2 scales) | 32: 12 on reading a paper, 20 in the library (10 statistics, 4 scales, 6 design) |
| Library groups | 5: paper, stats, measure, design, write. "Designing a study" and "Writing, citing and ethics" are empty, and v1 does not show an empty group | 5. "Writing, citing and ethics" is still empty, so 4 show |
| Slides stored | 377 | 1,241 |
| Slides one student sees (one field) | 307 | 931 |
| Field-variant slides (6 fields: psychology, education, sociology, health, business, general) | 84 | 372 |
| Slides per lecture | 9 to 34 | 32 to 46 |
| Spoken lines by character | Raj 182, Appu 120, Meera 69, Dev 4, Tara 2 | Raj 656, Appu 370, Meera 130, Dev 43, Tara 42 |
| Words on slides (English / Hindi) | 11,562 / 12,555 | 35,492 / 38,277 |
| Board drawings | 174, in 16 kinds; 485 Hindi labels | 363, in 16 kinds; 1,057 Hindi labels |
| Classmates on screen | none | 158 slides marked `cm`. Dev and Tara sit in a front row, drawn from behind (`thRowHTML`, 12335) |
| Practice questions | 65. Three options each; one reason line | 128 (126 with three options, 2 with four). Each has a reason per option, "Put simply", and sometimes "Go further". A "How sure are you?" step comes before the answer shows. Options are re-ordered so the right answer's position is even (`apQuizBalance`, 12455) |
| Practice-paper lesson | 12 steps and a verdict, English only. 38 quotations (24 in "What the paper says", 14 in the planted flaws) | The same 12 steps, byte-identical, plus Hindi for every step (`AP_LESSON_HI`, 11269). Quotations stay in English |
| Characters | Appu, Professor RAJ, Dr Shuddhi Grant ("Meera" in the theatre); Dev and Tara in a few slides | The same five. Dev and Tara are now named in the theatre |
| Portraits on the classroom wall | 10: Einstein, Kalam, Raman, Fisher, Gosset, Cohen, Pearson, Spearman, Cronbach, Likert, each with a one-line English bio | The same 10 |
| Picture files (`assets/`) | 39 files, 2.1 MB: 1 classroom, 22 poses (Appu 8, Meera 7, Raj 7), 6 faces, 10 portraits | 46: the same 39, plus 7 mouth shapes for Raj (`face_raj_m0` to `m6`) |
| Voice code | Device speech, and natural voice (Gemini, OpenAI) | Unchanged, function for function (`fdiff.mjs`) |
| Where Learning is reached | "All lectures" inside Analyse a paper; the lesson as a tab once the practice paper is loaded | The same, plus a "Learn" section on v1's new home and a "Continue where you left off" card (`apHomeRender`, 13202) |

Further checks:

- **The lesson's 38 quotations are all found in the practice paper.** VERIFIED: v1's own `apCheckQuote` found 38 of 38 (`quotes.mjs`, build 55). `AP_SAMPLE` and `AP_LESSON` are byte-identical in build 116 (`cmpconst.mjs`).
- **v1's commit messages say more passes are coming.** VERIFIED, through the GitHub API on 24 October:
  - Version 116 is "lecture pass 4a and quiz rewrite".
  - It has "39 corrected slides", "79 classmate questions from Dev and Tara" and "All 128 quiz questions replaced".
  - "Pass 4a" suggests a 4b will follow. BELIEVED.
- **One corrected slide matters for safety.** VERIFIED in build 116; the lecture does not exist in build 55:
  - It is "Scoring and cut-offs of common scales", slide 36, "Item 9 needs a person".
  - It says the study plan must name a qualified mental health professional, as the Mental Healthcare Act 2017 defines one, and otherwise gives the Tele-MANAS helpline 14416.
- **The port audit is out of date for Learning.** Its row O6 (19 lectures, 377 slides, 65 questions) describes build 55.

### What v1 does, part by part (build 116; line numbers from f5336be)

**Library** ("All lectures", `apLibRender` 11968, `apLibLecture` 11980):

1. The student sees the groups in a fixed order (`AP_LIBGROUPS` 11938). A group with no lectures is skipped (`if(!L.length)return;`, 11974). Each lecture row shows:
   - a ✓ once opened (`appu_libseen`);
   - its slide count;
   - "quiz done" when every question is answered.
2. "My field" changes the examples:
   - It sets the student's field, the same setting the editor uses.
   - A line says "Examples for: {field}", or "Examples: general (none written for your field yet)".
   - The examples follow `apFieldGroup` (11927) and `apLecFor` (11934).
3. "English" and "हिंदी + English" switch the lecture language (`appu_lectlang`). This switch is separate from the interface language.
4. Inside a lecture:
   - "◀ All lectures";
   - Previous and Next lecture;
   - for the 12 paper lectures, a line saying the lecture "is also part of the practice-paper walk-through".

**Player, the "classic stage"** (`apLesStageHTML` 12136, `apLesScenes` 12103, `CH` 11289):

- **The stage:** an SVG drawing of the speakers, with a board of up to two lines and a speech bubble. Below it, a caption with the speaker's name, read out by screen readers (`aria-live`).
- **Controls:** ◀, Play/Pause, ▶ and "🎬 Theatre". A strip of slide buttons is grouped under the lecture's parts, and an extra scene shows as ★. The page says "slide n of N".
- **"💡 Explain this more simply"** jumps to the first slide marked `ex`.
- **Autoplay:** the stage plays on its own unless the device asks for reduced motion. Each slide lasts at least 3.8 s, or 70 ms per character, or until the voice ends.
- **Resume:** the position is saved per lecture (`appu_lectpos`), and the last lecture opened is remembered (`appu_lastlec`). Reopening resumes there, paused.
- **Characters:** they turn, blink and talk. The ethics step (`noHumour`) keeps neutral faces. When the jokes switch is off, the weakness scene uses a plain line instead of the joke.

**Voice** (12002 to 12094):

- **Device voice (the default):**
  - It is the browser's own read-aloud (`speechSynthesis`).
  - The choice of voice is ranked: Indian English first, then Hindi, British, Australian and US English; within each, natural and online voices before Google voices before the rest.
  - Gender follows the character; pitch is Appu 1.12, Raj 0.9, others about 1.
  - Speed is Slow 0.8, Normal 0.9, Brisk 1 or Fast 1.15.
  - Controls are "🔊 Listen" and "Read aloud while it plays".
  - A watchdog ends a voice that never finishes.
  - When no voice is found, the page says so and how to add one.
- **Natural voice (optional):**
  - The student's own Gemini key (model `gemini-2.5-flash-preview-tts`; voices Leda, Kore, Aoede, Charon, Puck), or their own OpenAI key (`gpt-4o-mini-tts`, then `tts-1`; voices nova, shimmer, alloy, onyx, echo).
  - The prompt is "Say as {persona}, in a natural Indian accent, clearly and at a calm pace…".
  - The browser sends only the slide text, straight to Google or OpenAI.
  - Each clip is kept in IndexedDB (`appu_tts`). Past 400 clips, it trims back to the newest 360. "Clear saved voices" is offered.
  - Any failure switches to the device voice, with a toast that gives the reason.

**Theatre** (`apThOpen` 12408, `TH_*` 12263-12269):

1. A full-screen classroom: a 2048×1152 drawing scaled to the window. On it:
   - a board whose current line is highlighted sentence by sentence, with a drawing when the slide has one;
   - up to three characters in poses;
   - the front row of classmates;
   - three portraits; a tap shows a bio for 9 s;
   - a wall clock showing the real time;
   - a subtitle bar.
2. Controls:
   - ◀, Play and ▶; a slide slider; speed 0.8× to 1.3×; voice on or off;
   - English and हिंदी; full screen; a drawer;
   - keys: Space, ←, →, F and M.
3. The drawer has three tabs:
   - Slides;
   - Quiz: the questions also show on the board, as a "wall";
   - Voice: speed, voice type, and board tone (auto, light, dark, deep).
4. Phone and narrow windows:
   - When the window is narrower than 0.85 of its height, the view zooms to the board.
   - The characters are hidden, and a round face badge talks instead.
   - Raj's badge has seven mouth shapes; the others have open and closed.
5. Other behaviour:
   - Playback pauses when the tab is hidden.
   - If the pictures do not load within 25 s, a toast says so and the classic stage is used.
   - There is no AI call in the theatre.

**Practice questions** ("Check yourself", `apQuizBody` 12488), in order:

1. The student picks an option.
2. The app asks "Before you see the answer: how sure are you?": Sure, Fairly sure or Guessing.
3. The answer locks. A lead line combines right or wrong with how sure the student was. Example: "Not quite, and you felt sure. That makes this one worth slowing down for…".
4. The app shows:
   - the reason for the student's choice and for the right answer;
   - "Put simply";
   - "Go further" when the answer is right and the question has it;
   - "Why the other options are wrong" (collapsed).
5. At the end: "Your score: x of n", a line about the questions the student felt sure of and got wrong, and "Try again".

Storage is `appu_quiz3` and `appu_quizconf2`. The copy says "Practice questions written by AI, not read by a person. Your answers stay on this device."

**Practice-paper lesson** (`apLessonHTML` 12559, `AP_LESSON` 11190):

- **The header:** a status line ("AI-written. Checked only by the AI that wrote it, and by a script that confirms every quotation is in the paper. No separate reviewer and no human reviewer yet.") and "Appu and Professor RAJ are AI characters. Everything here runs on this device and no AI call is made. Your answers stay in this browser."
- **Each of the 12 steps:**
  1. The step's lecture plays on the stage.
  2. "Try first." shows the stage question. The student's words are saved as the walk-through's "My words" for the practice paper.
  3. "Show what the paper says" reveals the reading. Its quotations are checked against the paper.
  4. "Spot the weakness. … A guess is fine. The paper was written with flaws on purpose."
  5. "Show the weakness planted here" reveals the flaw and its quotations.
  6. The student can react with "This step was: Clear / Confusing / Looks wrong" and add a note of up to 300 characters (`appu_lesson_fb`, keyed `sleep-anxiety-sample@1`).
- **Step 6** (procedure and ethics) carries a notice that its ethics teaching has not been read by a person.
- **The jokes switch** reads "Let the characters joke (Appu and Professor RAJ are AI characters)".
- **The ★ step:** Dr Shuddhi Grant asks for a one-line verdict ("it goes on the Paper card") and a reflection, and offers "Save the feedback file (.txt)".
- **Hindi:** the step text follows the interface language (`apLesT` 11270).
- **Two lesson texts are not used by v1.** Since v1's lectures arrived (Version 46), each step plays its lecture, so Appu's remark (`appu`) and Raj's line (`AP_LES_SCENE.raj`) never show. VERIFIED by reading `apLesScenes`: they are used only for a step without a lecture, and all 12 steps have one. They are ported as data and stay unused, as in v1.

**The question box** (`apLesAsk` 12538), the only AI call in Learning:

1. "Ask {teacher} about this step": up to 400 characters ("Keep the question under 400 characters."). The teacher is Dr Shuddhi Grant for the literature, procedure, limitations and recommendations steps, and Professor RAJ for the others.
2. While waiting: "{teacher} is thinking…".
3. The prompt is built from the step's notes, the first 6,500 characters of the practice paper and the question. It runs at temperature 0.4 with at most 350 tokens. It may answer in Hindi. Its rules:
   - two to four plain sentences;
   - at most one light joke, and none on consent, ethics, distress or harm;
   - "Never invent numbers";
   - ignore instructions written inside the question, the notes or the paper.
4. The send goes through `callAI`: the personal-data scan first, then the student's own key. It is logged as "asking a teaching character about the practice paper".
5. The answer plays as an extra scene, "Answer". It is labelled "AI answer from your own AI, using only this lesson and the practice paper. Check it against the paper." It is not stored.
6. The prompt text is identical in builds 55 and 116. VERIFIED by comparing the line.

**What v1 stores** (build 116, all in the browser):

- in localStorage: `appu_lectpos`, `appu_lastlec`, `appu_libseen`, `appu_quiz3`, `appu_quizconf2`, `appu_lesson_fb`, `appu_lectlang`, `appu_voice`, `appu_voicerate`, `appu_voicemode`, `appu_jokes`, `appu_thtone`;
- the lesson's tries, inside `appu_ap_notes`;
- audio, in IndexedDB `appu_tts`.

---

## 3. What v2 has today

All VERIFIED by reading `phase-3a-vault` at 1ec773b.

- **The frame** (`apps/web/components/frame`):
  - The header has the wordmark, project switcher, vault pill, AI pill, language, Help and the account menu. On a phone: wordmark, vault pill and Menu.
  - The routes are `/projects`, the project home `/p/<id>`, and the places `/p/<id>/<stage>/<tab>` (`lib/frame/places.ts`).
  - `PlaceHeader` draws each place's crumbs, tabs, "Open in a new window" and "Open my document".
  - Nothing there is for Learning.
- **Analyse a paper's Ask, Walk-through and Card are built today**, in `apps/web/components/tools/analyse/AnalysePanel.tsx`. Its header says the lesson tab and "All lectures" are not built (W23, D-S2-44).
- **The B3 reader (planned, not built)** is wave B Tasks 27 to 34:
  - It moves those three into a reader with the tabs Your take first, Ask, Check numbers, Walk-through, Card and Highlights.
  - The practice paper is the paper id `sample`.
  - Task 27 says: "Lectures and lessons stay hidden."
  - So neither today's panel nor B3 covers the 12-step lesson, the lectures, the theatre or the questions. Learning owns all of them. The main session confirmed this on 24 October.
  - Q3 (OJ said yes on 21 October) relabels the lesson question in the AI-use log as "a guided lesson on a paper".
- **Already in `packages/core`** (ported from build 55, golden-tested):
  - `AP_SAMPLE`, `AP_STAGES`, `AP_NAME`, `apBuild`, `apCheckQuote`;
  - `buildLessonAskPrompt` and `LESSON_QUESTION_MAX_CHARS` (`prompts-analyse.ts:50`);
  - the AI-use rule (`aiuse.ts:25`).
  - The practice paper, the stages and the prompt are unchanged in build 116.
- **Blobs and the vault:**
  - One blob per kind per project. The API's allowlist is `BLOB_KINDS` (`apps/api/src/routes/blobWrite.ts`), mirrored in `apps/web/lib/blobs/kinds.ts`, and every kind has a stage in `KIND_STAGE` (`lib/frame/stages.ts`).
  - A blob is sealed under its own key once the student has a vault, and plain JSON before that.
  - `useProjectBlob` holds writes made while the vault is locked and sends them after unlock.
  - Each student has a hidden scratch project (`me.scratchProjectId`).
  - "Export all my work" includes the scratch project's blobs (`lib/vault/export.ts:86`).
- **Settings:** a strict schema (`apps/api/src/routes/me.ts:6`), so any new setting needs an API change. The student's field is `settings.field`, read through `fieldLabel` (v1's `fieldName`).
- **The AI gateway** (`apps/api/src/routes/ai.ts`):
  - `POST /ai/complete` takes the student's key with each request.
  - It refuses a prompt the personal-data scan flags unless the student accepted it (`pdAccepted`).
  - It writes the AI-use log through `classifyAiUse`.
  - It never logs the body or the key.
  - It has **no speech route**.
- **The CSP** (`apps/web/proxy.ts`):
  - `connect-src` allows `'self'`, the API, OpenAlex, E-utilities, Crossref and dictionaryapi.dev. Wave B2 adds Europe PMC.
  - `img-src` allows `'self' blob: data:` and Vercel Blob.
  - There is no `media-src`, so audio falls back to `default-src 'self'` and **a `blob:` audio URL is blocked today**. SUPPORTED: this is how CSP falls back.
- **The golden harness:**
  - It runs v1 in jsdom, and `V1_INDEX` picks which v1 file.
  - `golden:capture <engine> --emit` writes `src/data/*-tables.ts`.
  - `test/golden/devanagari.test.ts` pins every Devanagari string in core to v1's 13 October line ranges. Only `chart-tables.ts` is exempt, and it has its own golden.

---

## 4. Goals, non-goals, anti-goals

**Goals:**

- Every Learning behaviour and every word of v1, at the pinned build (decision 1). That covers:
  - the lectures and their field examples;
  - both languages;
  - the characters;
  - the questions, with confidence and reasons;
  - the practice lesson and its question box;
  - the theatre;
  - device and natural voice;
  - the jokes switch.
- A student reaches Learning from any stage in one tap, and from outside any project.
- It works on a 375 px phone.
- Progress is saved to the account, locked with the passphrase when the vault exists.
- **No AI call** anywhere in Learning except the question box. Tests prove it.

**Non-goals:**

- Phase 7 items, which need Dr. Sharma: lecture levels, the placement quiz, the video lecture maker.
- Rewriting, shortening or re-translating content.
- Help, the Guide and the Appu helper (wave C).
- v1's other new parts: the "My details" profile with roles and courses, and the Training record (§11).
- Offline use (wave C).
- The reader's Ask, Walk-through and Card (B3).

**Anti-goals, meaning failures even if it runs:**

- content typed by hand instead of copied by script;
- a lecture or lesson that makes an AI call;
- a sentence saying "stays on this device" that is false in v2;
- slide text going to Google or OpenAI when the student never chose Natural voice;
- a theatre that only works on a desktop;
- the student's answers readable by the server once the vault exists.

---

## 5. Constraints (from OJ's rules and the repo)

- **Parity rule (OJ, 20 October):**
  - What Learning does and says is v1's.
  - Layout and flow are redesigned for the six-stage frame.
  - Every change gets a register row, status `proposed`, "awaits Dr. Sharma (review)". A change a student can feel adds "and OJ".
- **Content is copied by script, never retyped.** This is rule 4 of `docs/superpowers/specs/2026-10-17-parity-port-design.md`: sha256 of the content, plus byte equality for every Devanagari string.
- **Ports and goldens:**
  - A ported function and its golden are never edited. A fix is a named sibling (`…V2`).
  - Recordings come only through `golden:capture`.
- **Copy:**
  - Every student-facing string goes through `t()`.
  - New strings have English and a DRAFT Hindi.
  - Use plain words, sentence case, no emoji and no em-dashes in new strings. Wave B decision 6 removes emoji behind one switch; Learning's new keys add none.
  - "Not built yet" is said in those words.
  - The storage line is exactly "Saved to your account, locked with your passphrase. Only you can read it." With the vault off: "Saved to your account. Set a passphrase to lock it."
- **AI output:** a gold edge and a label that says what it is and what to check.
- **Design:**
  - Tokens from `apps/web/app/globals.css`.
  - Fonts: IBM Plex Sans and Plex Sans Devanagari; Fraunces for display.
  - Icons only from `@phosphor-icons/react`.
  - Every screen at 375 px: a 16 px gutter, no sideways scroll, touch targets of 44 px.
- **Network:** a new host or source in the CSP needs a reason and a register row.
- **Lean method (OJ, 21 October):** Sonnet implementers, one Opus review per task, tests first, a live walk per release.
- **Deploys:** the API first, then the web, through `scripts/deploy-vercel.sh` from the deploy clone. OJ runs them.
- **The repo is public for now:** no secrets and no personal data in commits.

---

## 6. The design

### 6.1 Where Learning lives, and how a student gets there (decision 2)

**The recommendation:** Learning is a place of its own for the whole account, outside any project, the way v1 build 116 puts "Learn" on its home beside the six steps.

**Routes:**

- `/learn` is the library.
- `/learn/<lecture-id>` is one lecture. The 12 paper lectures keep v1's keys (`gap` … `recs`); library lectures use their v1 ids (`reading-a-p-value` …).
- `/learn/practice` is the practice-paper lesson, with `?step=1…13` (13 is the verdict).
- All three are in the `(app)` group, so the header and dialogs are there. No project loads, so there is no document beside Learning.

**The ways in:**

1. **The header:** a "Learn" button (Phosphor `GraduationCap`) between the AI pill and Help. On a phone it is a "Learn" item in Menu, under Help.
2. **Every stage place:** a "Learn about this stage" link in `PlaceHeader` opens `/learn?stage=<stage>&from=<this place>`:
   - The library opens filtered to that stage's lectures (the table below), with "Show all lectures" one tap away.
   - A "Back to {stage name}" link returns to `from`.
   - The link also shows in a place's own window.
3. **The practice paper in the reader (after B3):** one line, "Guided lesson on this paper", leads to `/learn/practice`. It is added only once B3 has merged; otherwise it is a one-line follow-up.
4. **`/learn` itself:** a "Continue where you left off" card at the top, with the last lecture and slide (v1's home card, `appu_lastlec`).

**Stage-to-lecture map (my call, C3).** It is only for getting around; every lecture stays in the full library.

| Stage | Lectures shown first |
|---|---|
| Idea and feasibility | The gap; Variables and hypotheses; Choosing a study design; Power and sample size |
| Literature | The 12 "Reading a research paper" lectures; the practice-paper lesson |
| Design and ethics | Choosing a study design; Variables and hypotheses; Sampling and participants; Bias and threats to validity; Experiments in psychology; Surveys and questionnaires; Power and sample size; The procedure and ethics; Translating and adapting a scale |
| Collection and analysis | Reading a p-value; Effect size and confidence intervals; Choosing the right test; Correlation and causation; Regression in plain words; Missing data, outliers and cleaning; Multiple comparisons in practice; Parametric versus rank tests; Factor analysis in one hour; Reliability of a scale; Validity of a scale; Scoring and cut-offs of common scales |
| Writing | The literature behind it; The results; Discussion and conclusion; Limitations; Recommendations |
| Review and publish | Discussion and conclusion; Limitations; Recommendations; Effect size and confidence intervals |

The map lives in core as data, keyed by lecture id. An id the pinned content lacks is dropped, with a test.

### 6.2 Porting the content (decision 1 sets the build)

**A Learning capture engine** in the golden harness, `test/golden/learning/capture.ts`:

1. It runs v1 at the **Learning pin** in jsdom. The pin has its own path and sha256; it is separate from the 13 October pin of the other engines. The engine refuses any other file.
2. It calls v1's own `apQuizBalance()` before reading, so the questions are captured in the order v1 shows them.
3. It reads these tables, through `v1.eval`:
   - `AP_LECT`, with every `apLibAdd` applied: the paper lectures and the library lectures;
   - `AP_QUIZ`;
   - `AP_LIBGROUPS`, and `AP_LIBLIST` in v1's order;
   - `AP_LESSON` and `AP_LESSON_HI`;
   - `AP_STAGES_HI` (11070), which the Hindi lesson's "Try first" question reads through `apStAsk` (11072). Learning ports it; B3 can reuse it;
   - `AP_LES_SCENE`, `AP_NAME`, `AP_TEACHER`;
   - `AP_GENDER`, `AP_PITCH`, `AP_TTS`, `AP_TTS_STYLE`;
   - `TH_CV`, `TH_MAN`, `TH_FRAMES`, `TH_PT`, `TH_FR`, `TH_NAME`;
   - the interface strings the Learning code shows inline in both languages, including `I18N.{en,hi}.les_seen`.
4. It writes `packages/core/src/data/learning-tables.ts` with `--emit`, and its fixtures under `test/golden/learning/`.

**The engines,** in `packages/core/src/learning.ts`, each with v1's line numbers in its header and a golden. They come over close to verbatim, as pure functions whose inputs are passed in where v1 read page state:

- **Lecture helpers:** `apFieldGroup`, `apLecFor`, the library order, `apLibFieldLine`, `chWrap`, `apLecPlay`.
- **The scene builder:** `apLesScenes(opts)`. It takes the lecture key or lesson step, the language, the jokes switch, whether the weakness was opened, and an answer if one was asked.
- **Lesson helpers:** `apLesT`, and `apLesFbText` (the lesson feedback file).
- **Question helpers:** `apQzLead` and `apQzWhy`, as text builders the web renders. Scoring.
- **Theatre helpers:** `thSent`, `thCue`, `thPose`, `thTone`, `thDur`, `thPtList`, `thFocus`, `thMode` (the aspect rule), and Raj's mouth sequence.
- **Drawings:** `CH` (the characters and `CH.scene`) and `VIS` (16 drawing kinds). Both return SVG strings.
- **Voice helpers:** the voice ranking (`apVoicePick` over a list of voices passed in), the natural-voice request builders (the Gemini prompt and the OpenAI body and instructions), the cache key, and `apPcmWav`.

**The checks,** in `test:golden`:

- the emitted tables deep-equal the capture, and the sha256 of the canonical JSON is in the fixture header;
- the counts: lectures, slides, field slides, questions and options, steps, quotations, pictures. Today that is 32 / 1,241 / 372 / 128 / 12 / 38 / 46;
- **every Devanagari string** in `learning-tables.ts` is in the pinned file byte for byte, and every Devanagari run in the Learning ranges of that file is in core. `learning-tables.ts` is then exempt from the 13 October `devanagari.test.ts`, as `chart-tables.ts` already is;
- **every lesson quotation** is found by core's `apCheckQuote` on `apBuild(AP_SAMPLE)`;
- **every slide, question and lesson text** in both languages gives zero findings in core's `scanText`, so the speech route (§6.4) never refuses content;
- the question order equals v1's order after balancing;
- **core's existing build-55 pieces equal the pinned file.** Learning uses core's `AP_SAMPLE`, `AP_STAGES`, `AP_NAME`, `apBuild`, `apCheckQuote` and `buildLessonAskPrompt` rather than copies of them. The test proves they match the pin (VERIFIED identical today), and fails if a later pin changes them.

**If the main session moves every engine to a newer v1** (§11), Learning's pin folds into the shared one: the Learning engine reads the shared pin and its separate path is removed. The capture engine, checks and tables stay as they are.

**Interface strings:**

- They go in `apps/web/messages/learn.{en,hi}.json`, copied from v1's inline English and Hindi pairs by the capture script, not typed.
- Where v1 has only English (the lesson page's labels in build 55, some theatre labels), the new key has a DRAFT Hindi.
- Copy that v2 must change (§6.7) gets new keys and register rows.

**Re-pinning, for when Dr. Sharma ships another pass:**

1. Run `golden:capture learning --check` against v1's current `main`.
2. **If only content changed** (the tables differ, Learning's functions do not), the update is one commit: re-capture, `--emit`, then a PR note listing the lectures, slides and questions that changed. Stored answers for a lecture whose questions changed are dropped, as v1 does with its new storage keys (C10).
3. **If Learning's functions changed** (`fdiff.mjs` lists them), each change is a small porting task with OJ's go.
4. The pin moves only by a deliberate commit, never by itself.

### 6.3 Where progress is stored

**Progress (my call, C1):** one blob kind, `learn`, in the student's **scratch project**. That makes it per account, not per project. Lectures are not project work, and a student with two projects should not see a lecture "unseen" in one and "seen" in the other. The blob holds:

```ts
type LearnProgress = {
  v: 1;
  pin: string;                                   // the v1 build the content came from, for re-pins
  pos: Record<string, number>;                   // v1 appu_lectpos: slide index per lecture
  last: string | null;                           // v1 appu_lastlec
  seen: Record<string, 1>;                       // v1 appu_libseen
  quiz: Record<string, (number | null)[]>;       // v1 appu_quiz3, by lecture, in v1's balanced order
  conf: Record<string, (0 | 1 | 2 | null)[]>;    // v1 appu_quizconf2
  qh: Record<string, string>;                    // a hash of each lecture's questions when answered (re-pin rule, C10)
  lesson: {
    tries: Record<string, string>;               // "Try first" per step (v1 kept these in appu_ap_notes; see decision 4)
    card: { verdict?: string; reflection?: string };
    fb: Record<string, Record<string, { r?: "clear" | "confusing" | "wrong"; t?: string }>>; // v1 appu_lesson_fb, keyed "sleep-anxiety-sample@1"
  };
};
```

**What each part of the stack does:**

- **The API:**
  - adds `learn` to `BLOB_KINDS` (an API deploy, before the web);
  - stores the body as given, sealed or plain, and never reads it.
- **The web:**
  - adds the kind and its zod schema (loose objects, as the other kinds have);
  - adds `KIND_STAGE.learn = { stage: "lit", work: false }`, so it never counts as a project's work;
  - reads and writes through the existing blob client with `me.scratchProjectId`;
  - always uses the update form, so a quiz answer made before the read lands on top of stored ones.

**The vault:**

- **On:** the blob is sealed under its own key.
- **Off:** it is plain JSON, as every blob is before a vault exists.
- **Locked:** Learning reads its blob like every other panel does (C13). The vault's one shared passphrase prompt opens (`useProjectBlob`'s `openWire`), and no new blob mode is needed. If the student cancels:
  - lectures and the lesson still play;
  - the library shows "Your progress opens when you unlock", with Unlock;
  - answers and positions given meanwhile are held and saved after unlock.

**Export and erase:** "Export all my work" already includes scratch-project blobs, and "Delete my account" removes them.

**Preferences (my call, C2):** six new keys in `settings`, plain, so the player starts with the right language and voice before the vault opens.

| Key | Values | v1 key |
|---|---|---|
| `learnLang` | `"en"` or `"hi"` | `appu_lectlang` |
| `voiceOn` | boolean | `appu_voice` |
| `voiceRate` | 0.8, 0.9, 1, 1.15 | `appu_voicerate` |
| `voiceMode` | `"device"`, `"gemini"`, `"openai"` | `appu_voicemode` |
| `jokes` | boolean, default true | `appu_jokes` |
| `boardTone` | `"auto"`, `"light"`, `"dark"`, `"deep"` | `appu_thtone` |

None of these says anything about the student. Adding them is one change to `SettingsSchema`, made in Learning release 1, so release 2 needs no settings change.

### 6.4 Voice

**Device voice, the default:**

- v1's code comes over unchanged (ported in §6.2):
  - the voice ranking, gender, pitch and speed;
  - the watchdog (the longer of 7 s and 170 ms per character, divided by the speed);
  - redrawing when the browser's voice list arrives;
  - the messages when no voice is found.
- Voice and timing run in the browser. The pure parts are tested with fake voice lists.
- **One change for honesty (my call, C5, register row).** v1 says "Device voices come from your own device. Nothing is sent anywhere." Some browser voices are not on the device:
  - Chrome's "Google" voices and Edge's "Online (Natural)" voices are made on the browser maker's servers. The browser marks such a voice `localService: false`. BELIEVED: these are documented browser behaviours; not tested in this session.
  - v2 keeps v1's ranking.
  - When the voice in use has `localService: false`, the note says: "This voice is made online by your browser's maker (Google or Microsoft), which receives the slide text. Other voices run on this device."
  - Otherwise it keeps v1's sentence.

**Natural voice (decision 3: the route):**

**The recommendation is through the gateway.** A new `POST /ai/speech` in `apps/api/src/routes/ai.ts`, behind the same sign-in and terms gate as `/ai/complete`:

- **The body** (zod, strict): `{ provider: "gemini" | "openai", apiKey, text (1 to 600 characters), persona: "appu" | "meera" | "raj" | "dev" | "tara", lang: "en" | "hi" }`.
  - **Why 600:** the longest content text is 268 characters in English and 288 in Hindi (VERIFIED on build 116). v1 cuts an AI answer to 600 characters.
  - **Size:** at about 15 spoken characters a second (BELIEVED), 600 characters is about 40 s. Gemini's 24 kHz 16-bit audio is 48 KB a second, so that is about 1.9 MB of WAV. Vercel caps a function's response at about 4.5 MB (BELIEVED). L2-3 measures the real time and size.
- **The server builds the request itself** with core's ported builders, using v1's prompt or instructions for the persona and language, and v1's voice for the persona. The browser cannot send instructions of its own (C15).
- **The providers:**
  - Gemini: v1's request (`responseModalities: ['AUDIO']`, the voice name). Its PCM reply becomes WAV through core's `apPcmWav`.
  - OpenAI: `gpt-4o-mini-tts` with instructions, then `tts-1` on a 400 or 404, as v1 does. The reply is MP3.
- **The answer** is the audio bytes with `Content-Type: audio/wav` or `audio/mpeg` and `Cache-Control: no-store`. Errors are the gateway's existing error classes.
- **The text is scanned** with `scanText`. A finding is refused with `personal-data`, and the web falls back to the device voice. Content never trips it: §6.2 tests that.
- **Not written to the AI-use log**, because v1 never logged it: reading the app's own slides aloud is not help with the student's work (C6). The body, the text and the key are never logged, as for `/ai/complete`.
- **Where the key comes from:** the browser opens it exactly as for any AI call, with `keyStore` and the passphrase prompt for a locked key. A key that will not open falls back to the device voice, as v1 does.

**What each route changes:**

| | Through the gateway (recommended) | Straight from the browser (v1's way) |
|---|---|---|
| CSP | adds `media-src 'self' blob:` only | adds `media-src 'self' blob:`, and `https://generativelanguage.googleapis.com` and `https://api.openai.com` to `connect-src` |
| Server work | one new route and its tests; an API deploy | none |
| Who sees the text and key in transit | Appuscholar's server, which passes them on and keeps neither; then Google or OpenAI | Google or OpenAI only |
| Security | `connect-src` stays narrow | an injected script could use those two hosts' file-upload APIs, with a key of its own, to carry data out. SUPPORTED: both APIs accept uploads to the caller's account |
| Errors, retries | the gateway's error classes and 5xx retry | v1's own handling in the browser |
| Cost to OJ | Vercel function time and bandwidth for audio. BELIEVED small: a slide's clip is tens to hundreds of KB, and the cache means each clip is fetched once per device | none |
| Privacy wording | "The text of each slide goes through Appuscholar's server to Google with your own Gemini key and comes back as speech. Only the slide text is sent, and the server keeps neither the text nor your key. Each voice is kept on this device after the first time." (OpenAI: "to OpenAI with your own ChatGPT key".) Plus one line in the privacy notice the lawyer reviews | v1's sentence, verbatim: "The text of each slide is spoken using your own Gemini key. Only the slide text is sent. Each voice is kept on this device after the first time." |

**The audio cache, on the device:**

- IndexedDB, v1's database `appu_tts` (store `a`, entries `{ blob, t }`).
- The key is v1's: provider, voice, language and text.
- Past 400 entries, it trims back to the newest 360. "Clear saved voices" empties it.
- The next slide is fetched ahead, as in v1.
- **One change (C7):** an AI answer in the lesson is spoken but **not** cached, so the student's own AI answers are not written to disk. Only content is cached.
- The cache holds no personal data. It survives sign-out, as v1's does, and is cleared when the student deletes the account on this device.

**Failures:** a 429, a refused key or an empty reply switches to the device voice with v1's toasts, until the student picks Natural voice again. v1's code does exactly this.

**Model ids: UNKNOWN.** `gemini-2.5-flash-preview-tts` is a preview id from v1. Whether it, `gpt-4o-mini-tts` and `tts-1` still answer in October 2026 is not known.

- L2-3 checks all three with a capped Gemini key and a capped OpenAI key. This ties to the timeline's decision 7, which provider gets a capped test key.
- A provider with no test key ships untested live, behind a register row that says so.
- A model that has gone gets a replacement, with a register row.

### 6.5 The theatre, desktop and phone

**Desktop:**

- The theatre is a full-screen `<dialog>` built as in v1: a 2048×1152 canvas scaled to the window (`thFit`). It carries the board, characters, portraits, clock, front row, subtitle bar, controls, drawer and keys listed in §2.
- The board drawings come from core's `VIS`. Board text highlights sentence by sentence (`thCue`).
- Escape closes it. Focus stays inside it while it is open. The subtitle bar is read out by screen readers (`aria-live`).
- Reduced motion turns off the camera moves and the talking bob.
- Playback pauses when the tab is hidden.

**Phone:**

- **Portrait** (narrower than 0.85 of the height): v1's "mini" view. It zooms to the board, hides the standing characters, and shows the talking face badge. When Dev or Tara speaks, the badge hides and the classmate's name tag in the front row shows instead (v1 `thFit`).
- The drawer becomes a bottom sheet at 55% of the height, as v1 does below a 7:8 aspect.
- **Landscape:** the full classroom.
- Every button is 44 px tall at phone width; v1's are 34 px.
- The full-screen button is hidden where the browser has no element full screen. iPhone Safari is BELIEVED to be one.

**The pictures:**

- **Copying (C8):** the 46 files at the pin are copied byte for byte into `apps/web/components/learn/art/`. A test checks each file's sha256 against a manifest taken from the pinned v1's `assets/`.
- **Loading (C9):** they are imported statically, so Next serves them from `/_next/static/media/` with hashed names. They are cached for a year (SUPPORTED: Next's default for `/_next/static`), and `img-src 'self'` already allows them.
- **Order on open:**
  1. the classroom first;
  2. then the poses and faces of the speakers in the current and next slide;
  3. the rest when idle.
  4. If the classroom does not load in 25 s, v1's toast appears and the classic stage stays.
- **Size:** the 46 files are about 2.4 MB in all. BELIEVED: 2.1 MB measured for the 39, plus seven mouth images of about 45 KB each.

**Licences and origin (my call, C8; flagged):**

- **v1's LICENSE:** the pictures belong to Dr. Sharma ("All rights reserved"). v2's `LICENSE.md` says the same of all v1 material.
- **v1's THIRD_PARTY.md** lists code, fonts, data services and scales, and **no pictures**. VERIFIED in both builds.
- **The pictures are already public:**
  - VERIFIED on 24 October: `https://srssg74-crypto.github.io/appuscholer/assets/bg_class.webp` answers 200.
  - The v1 repo is public (GitHub API).
  - So copying them into v2's public repo adds no exposure.
- **Origin: UNKNOWN.** Who made the 46 pictures and with which tool is not known. The 10 portraits show real scientists. Rights in any photo they were drawn from, and in the likeness, are for the lawyer.
- **What the design does about it:**
  - v2 adds a "Theatre pictures" section to its own `THIRD_PARTY.md`: 46 files from v1, owner Dr. Sharma, origin to be confirmed.
  - The question goes into the lawyer brief (the go-live pack).
  - A switch, `THEATRE_PORTRAITS`, shows plain frames instead of portraits if the answer needs it.

### 6.6 The practice-paper lesson and its question box (decision 4 sets where)

**The recommendation:** the lesson lives in Learning, at `/learn/practice`.

**The paper:** it loads with core's `apBuild(AP_SAMPLE[0] first line, AP_SAMPLE, "pdf")`, as v1's `apSample` does. No intake, no tick box: v1 needs none for the practice paper.

**The flow** is v1's, step by step, with build 116's Hindi when the interface is Hindi:

- the step strip 1 to 12, with ✓ once "Show what the paper says" was pressed, and ★ for the verdict;
- the status line and the characters line;
- the stage, playing the step's lecture;
- the jokes switch;
- Check yourself;
- Try first (the `AP_STAGES` question; the words saved to `lesson.tries`);
- Show what the paper says, with core's `apCheckQuote` marks;
- Spot the weakness, then Show the weakness planted here, with marks;
- the reaction chips and note;
- the step 6 ethics notice;
- Previous and Next.

**The ★ verdict:**

- the three-character scene;
- the verdict line and the reflection, saved to `lesson.card`;
- "Save the feedback file (.txt)", with v1's text from `apLesFbText`;
- "Save my practice card (.txt)": each step's tries, the verdict and the reflection. This one is new: v1 sent the verdict to the paper card, and Learning keeps it here.

**The question box**, as in v1 (§2):

- the 400-character limit and its messages;
- core's `buildLessonAskPrompt` (unchanged), sent with `callAI`:
  - the personal-data scan first, with the Mask / Send as-is / Cancel dialog (`lib/ai/pdDialog.tsx`);
  - then the gateway's own scan;
  - then the student's key, with failover as for any call.
- **The AI-use log:**
  - It is written by the gateway: today "asking a teaching character about the practice paper"; after Q3, "a guided lesson on a paper".
  - The entry has no project (C6). The practice paper is not the student's thesis, so the question shows in the account's AI-use log and not in any project's AI-use statement.
- **The answer:**
  - It plays as the extra "Answer" scene and can be spoken.
  - It carries a gold edge and v1's label.
  - It is not stored.

**No other AI call:** nothing else in `/learn` imports the AI client. A lint rule and the journey e2e (§6.8) check it.

### 6.7 Copy that must change, and why

Each item gets a register row. They use their own id block, D-L-1 onward (C14), so no parallel session collides with them.

| v1 says | v2 says | Why |
|---|---|---|
| "Practice questions written by AI, not read by a person. Your answers stay on this device." | "Practice questions written by AI, not read by a person." followed by the storage line | v2 saves answers to the account |
| "Appu and Professor RAJ are AI characters. Everything here runs on this device and no AI call is made. Your answers stay in this browser." | "Appu and Professor RAJ are AI characters. No AI call is made here, except the question box below, which uses your own key." followed by the storage line | the same; and the box is the one exception, which v1 states only further down |
| "Your verdict in one line (it goes on the Paper card)" | "Your verdict in one line (it is kept with this lesson)" | decision 4 |
| "Device voices come from your own device. Nothing is sent anywhere." | unchanged, except for an online voice (§6.4) | honesty (C5) |
| The natural-voice line | the gateway wording (§6.4) | decision 3 |
| Emoji in labels (📚 🎬 💡 🔊 ⏹ ⏳), many of them written inline in v1's code | none: the capture script strips them as it copies, by a fixed rule the register row lists | wave B decision 6. Learning's strings live in `messages/learn.*.json`, outside B4's `i18n-overrides.mjs` and `D2_NO_EMOJI` chain, so Learning does this itself and B4 needs no change for it |

### 6.8 Tests

**Content goldens** (`pnpm --filter @appuscholar/core test:golden`): §6.2's checks.

**Engine goldens:**

- `apLecFor` for every lecture in the 6 field groups;
- `apLesScenes`:
  - every lesson step, in both languages, jokes on and off, with and without the weakness opened, and with a fixed answer;
  - every library lecture, in both languages;
- the SVG of every scene that produces, and of every board drawing in both languages, byte-equal to v1's;
- `thSent`, `thCue` and `thPose` for every sentence of a sample of 3 lectures;
- `thPtList` for every lecture;
- the question lead and why-texts for every question, right and wrong, at each confidence;
- `apLesFbText`;
- the natural-voice request builders;
- `apPcmWav`'s header;
- the voice ranking over three fixture voice lists (Chrome desktop, Edge, Android).

**Unit tests:**

- **Web** (`pnpm --filter @appuscholar/web test`):
  - the library: the groups, ✓ seen, the counts, quiz done, the field line, the stage filter and its return link;
  - the player: autoplay with reduced motion, resume paused at the saved slide, Explain this more simply, previous and next lecture;
  - the device voice, with a fake `speechSynthesis`: the voice chosen, the watchdog, no voice, the online-voice note;
  - the questions: pick, how sure, lock, the texts, score, the sure-and-wrong line, Try again; answers held while locked; answers dropped when `qh` changes;
  - the settings keys;
  - the theatre: the mode by aspect, the keys, pause when hidden, the drawer tabs, the question wall, the 25 s fallback, the portrait switch;
  - natural voice: a cache hit makes no request, the trim at 400, the fallback toast, Clear saved voices, AI answers not cached;
  - the lesson: try, show, weakness, reaction and note, the ethics notice, the jokes switch, the verdict, both .txt files;
  - the question box: the empty and over-400 messages, the personal-data dialog, the answer scene, nothing stored.
- **API** (`pnpm --filter @appuscholar/api test`):
  - `/ai/speech`: the strict body, the terms gate;
  - Gemini, with a fake fetch: PCM becomes WAV;
  - OpenAI: MP3, and the model fallback on 400 or 404;
  - 401, 403 and 429 map to the existing classes;
  - a personal-data refusal;
  - **no AI-use row written**;
  - nothing of the body logged;
  - `learn` accepted as a blob kind and an unknown kind refused; the six settings keys.

**One journey e2e** (`apps/web/e2e/learn.spec.ts`, run locally three times on the session's own ports before each PR):

1. Sign in, then press Learn in the header. Four groups show; the empty "Writing, citing and ethics" is not shown, as in v1.
2. Open "Scoring and cut-offs of common scales". Switch to हिंदी + English, go to the next slide, and check the board text is Hindi.
3. Check yourself: pick, choose Sure, and see the answer lock with its reason.
4. Reload. The lecture resumes at the slide, paused; the answer is still locked; the library shows ✓.
5. From the Collection and analysis place, "Learn about this stage" shows that stage's lectures, and "Back to Collection and analysis" returns.
6. Do the steps above at 375×812.
7. **Release 2:**
   - Open the theatre: Space plays, → moves on, Escape closes. Check portrait mode at 375×812.
   - Natural voice with `/ai/speech` answered in the browser (as `tools-e.spec.ts` answers `/ai/complete`).
   - Practice lesson step 1: try, show, weakness, reaction.
   - Ask a question, answered in the browser. The answer scene plays.
8. **A network watcher on every step:**
   - no request to `/ai/*` except the Ask and speech steps;
   - no request to any host outside the CSP;
   - no request to Google or OpenAI from the browser.

### 6.9 Size and release split

**Release L1, "Lectures": the library, the player, device voice, questions and saved progress.** No AI anywhere, no new host. One API deploy (blob kind and settings), then the web.

| # | Task |
|---|---|
| L1-1 | The Learning pin and capture engine; `learning-tables.ts`; the content checks (§6.2) |
| L1-2 | Lecture, scene, lesson-text, question and theatre helpers in core, with goldens |
| L1-3 | `CH` and `VIS` drawings in core, with goldens |
| L1-4 | Storage: the `learn` kind (API and web), `KIND_STAGE`, the six settings keys, `useLearning` |
| L1-5 | The Learn place: routes, header and phone menu, library, field bar, languages, resume card, stage links |
| L1-6 | The player (the classic stage) and device voice, with the honest voice note |
| L1-7 | Check yourself, with confidence and reasons, saved |
| L1-8 | The journey e2e (L1 part), walk sheet `docs/walkthroughs/learning-1.md`, a re-pin check |
| L1-9 | Release: suites, PR, OJ merges, API then web, live walk |

**Release L2, "Theatre, natural voice, practice lesson".** One API deploy (`/ai/speech`), then the web with the CSP change.

| # | Task |
|---|---|
| L2-1 | The 46 pictures, the manifest test, `THIRD_PARTY.md`; the theatre on a desktop |
| L2-2 | The theatre on a phone: mini view, bottom drawer, question wall, 44 px |
| L2-3 | `/ai/speech` with tests; `media-src` in the CSP; a live model check with a capped key |
| L2-4 | Natural voice in the web: voice type, cache, fetch ahead, fallback, Clear saved voices, wording |
| L2-5 | The practice-paper lesson, in both languages, with its two .txt files |
| L2-6 | The question box |
| L2-7 | The journey e2e (L2 part), walk sheet `learning-2.md`, a re-pin check |
| L2-8 | Release: suites, PR, OJ merges, API then web, live walk |

**Files outside Learning's own folders**, so the plan can set fences:

| File | What Learning changes | Who else touches it |
|---|---|---|
| `apps/api/src/routes/me.ts` (`SettingsSchema`) | six keys (L1-4) | none known |
| `apps/api/src/routes/blobWrite.ts`, `apps/web/lib/blobs/kinds.ts`, `apps/web/lib/frame/stages.ts` | the `learn` kind (L1-4) | Participants adds a `participants` kind |
| `apps/api/src/routes/ai.ts` | the new `/ai/speech` route (L2-3) | B3's Q3 changes the classifier call at line 80 |
| `apps/web/proxy.ts` | `media-src` (L2-3) | B2 adds Europe PMC to `connect-src` |
| `apps/web/components/frame/AppHeader.tsx`, `PlaceHeader.tsx` | the Learn button, menu item and stage link (L1-5) | wave C (Help) |
| `packages/core/test/golden/devanagari.test.ts`, `harness/engines.ts`, `packages/core/src/index.ts` | an exemption, an engine, exports (append only) (L1-1) | any engine port |
| `THIRD_PARTY.md` (new in v2), the register | a pictures section; rows D-L-1 onward | the register: every session, each in its own id block |

**Merging and deploys:**

- Each Learning release rebases on `phase-3a-vault` before its PR.
- Every API change Learning makes only adds something: a kind, keys, a route. So the order of two sessions' "API first" deploys does not matter. SUPPORTED: nothing existing changes shape.
- OJ runs the deploys one at a time, as always.

**Size:** 17 tasks, two of them releases that need OJ.

- L1-2, L1-3 and L1-4 do not depend on each other, so they can run side by side.
- BELIEVED estimate, from measured pace (B1: 16 tasks built, released and walked in about a day; tools a–e: five sessions in a day and a half): **L1 about 1 to 1.5 days, L2 about 1.5 to 2 days**, plus a 1 to 2 hour live walk with OJ for each.
- The largest risks to that estimate:
  - the size of the SVG goldens: 1,241 slides and 363 drawings;
  - a Dr. Sharma pass landing mid-build, which costs a re-pin.

**Why this split:** L1 is everything a student needs to learn from the lectures, with nothing sent anywhere. L2 holds the three parts that carry outside risk:

- the pictures' origin;
- a new API route that sends text to Google or OpenAI;
- the AI question box.

This matches the two Learning legs in `PRODUCTION-V1-TIMELINE.md` (§3). The one difference is that this design moves the practice lesson into L2 for certain, because B3 does not cover it.

---

## 7. Decisions for OJ

Most important first. Each says what it changes for a student.

**1. Which v1 build does Learning copy?**

- **a. The newest v1 when the plan starts (today build 116), re-pinned before each release.** The student gets:
  - all 32 lectures and 931 slides;
  - the 128 rewritten questions with "how sure" and reasons;
  - the Hindi lesson;
  - the classmates;
  - the corrected self-harm slide that names a professional or Tele-MANAS 14416.

  Cost: Learning has its own pin, apart from the other engines' 13 October pin, and a re-pin step per release.
- **b. The 13 October build every other engine uses.** The student gets 19 lectures (307 slides) and the old 65-question quiz with a single reason line. That is 13 lectures fewer than Dr. Sharma ships today, and without the safety correction.
- **c. Ask Dr. Sharma to freeze Learning first,** through OJ. The content is then settled, but the build waits on him.

**Recommendation: a.**

**2. Where does Learning sit in the frame?**

- **a. A Learn place for the whole account.** It is in the header and the phone menu, with "Learn about this stage" in every stage and works before any project exists. A student finds lectures on statistics from the statistics place, and lectures on design from the design place.
- **b. A fifth tab in Literature**, where v1 started. Lectures on statistics, scales and design sit under Literature, and a student needs a project to reach them.
- **c. Inside Help (wave C).** Learning waits for wave C, and it reads as help text rather than a course.

**Recommendation: a.** It matches build 116's own home, which puts "Learn" beside the six steps.

**3. How does natural voice reach Google or OpenAI?**

- **a. Through the Appuscholar gateway**, with a new speech route. The student sees one more sentence ("goes through Appuscholar's server … keeps neither the text nor your key"). The CSP adds only `media-src`.
- **b. Straight from the browser, as v1 does.** The student sees v1's sentence. The CSP adds two AI hosts to `connect-src`, which opens a way for an injected script to send data out.

**Recommendation: a.** It is the route every other AI call in v2 takes.

**4. Where does the practice-paper lesson live, and where do the student's words go?**

- **a. In Learning (`/learn/practice`).** It is one tap from anywhere and needs no project. The student's tries, verdict and reflection are kept with the lesson and can be saved as a practice card. v1's line "(it goes on the Paper card)" changes. It does not wait for B3.
- **b. As a tab on the practice paper in Analyse a paper** (today's panel, then B3's reader), as v1 couples them. The tries become the walk-through's "My words", and the verdict goes on that project's paper card. A student needs a project and the practice paper open in its Literature place. The build touches the same files B3 rewrites, so it must wait for B3 or be done twice.

**Recommendation: a.**

**5. Does Learning's Hindi go to the native Hindi reader before go-live?**

- **a. No.** v1's labels stay ("Written by AI; no human reviewer yet"). The reader reviews the interface, including Learning's buttons and messages.
- **b. Yes.** About 47,000 Hindi words, VERIFIED by count on build 116:
  - the slides, 38,277 words;
  - the questions, 7,584;
  - the lesson's Hindi, 1,488;
  - plus 1,057 short labels on the board drawings.

  That is several times the interface. It adds reader days and cost to the go-live critical path, and a re-review after each Dr. Sharma pass.

**Recommendation: a for production v1.** The content is Dr. Sharma's and labelled as unreviewed by him. He decides on a full review, in Phase 7 or the pilot.

---

## 8. My calls (check these while reading)

- **C1** Progress is per account, in one sealed blob kind `learn` in the scratch project.
- **C2** The six Learning preferences live in `settings` (plain, nothing personal), added in release L1.
- **C3** The stage-to-lecture map in §6.1. A register row asks Dr. Sharma to correct it.
- **C4** Storage sentences change to v2's storage line (§6.7).
- **C5** The device-voice note tells the truth about online voices.
- **C6** Natural voice is not in the AI-use log, as in v1. The question box is logged with no project.
- **C7** The AI answer is spoken but not cached on the device.
- **C8** The 46 pictures are copied byte for byte. `THIRD_PARTY.md` says "origin to be confirmed", the question goes in the lawyer brief, and a portraits switch is ready.
- **C9** The pictures are static imports with hashed names and long caching.
- **C10** At a re-pin, stored answers for a lecture whose questions changed are dropped, as v1 does.
- **C11** Interface strings are copied from v1's inline pairs into `messages/learn.*`, with DRAFT Hindi only where v1 has none, and no emoji.
- **C12** The lecture-language switch stays separate from the interface language, and the lesson's Hindi follows the interface language. Both are v1 build 116's behaviour.
- **C13** Learning reads its progress like every other panel: the vault's one shared passphrase prompt. If the student cancels, the content still plays and progress waits.
- **C14** Register rows D-L-1 onward.
- **C15** The speech route builds its own request from persona and language. Text is at most 600 characters and scanned.
- **C17** An empty library group is not shown, as in v1.
- **C18** Learning ports `AP_STAGES_HI` and checks that core's build-55 pieces it reuses equal the pin. If every engine is re-pinned, Learning's pin folds in.
- **C16** v1 behaviour kept and flagged for Dr. Sharma: the question box's prompt allows "at most one light joke" even when the student has switched jokes off. v1's prompt ignores the switch.

## 9. Left to the builder

- Component and file layout under `apps/web/components/learn/` and `apps/web/lib/learn/`.
- How SVG strings are mounted. Through core's sanitizer or as markup the component owns; the text in them is escaped by v1's own code.
- The IndexedDB wrapper.
- Picture loading order beyond §6.5.
- Test file names.
- e2e ports. Per session, as `PRODUCTION-V1-TIMELINE.md` §6 assigns them.

## 10. Unknowns, and how each is settled

| Unknown | Settled by |
|---|---|
| Whether `gemini-2.5-flash-preview-tts`, `gpt-4o-mini-tts` and `tts-1` still answer | L2-3: live calls with capped Gemini and OpenAI keys (the timeline's decision 7); a replacement gets a register row |
| The real size of a 600-character clip against Vercel's response limit | L2-3 measures it; if needed, Gemini clips go out as compressed audio |
| Who made the 46 pictures, and the rights in the portraits | Dr. Sharma (through OJ) and the lawyer brief; the portraits switch meanwhile |
| Online browser voices and what they send | BELIEVED from browser documentation; L1-6 shows the note only on `localService: false` |
| Vercel function time for a long clip | L2-3 measures the slowest slide; `maxDuration` set from it |
| Free-tier speech limits for a student's own key | The 429 fallback already covers it |
| Whether Dr. Sharma ships pass 4b before L1 or L2 | The re-pin check in L1-8 and L2-7 |

## 11. Outside Learning: flags for the main session

These are not Learning's work. They change what "production v1" contains.

**v1 has moved on 61 versions since the 13 October pin of every ported engine.** VERIFIED: local c8c5373, build 55 → GitHub f5336be, build 116, commit list through the GitHub API. Every engine ported in Waves 0 to 2, and the screens built on them, follow the 13 October build. SUPPORTED. New in v1 since then:

- a statistics check suite against SciPy, with a Spearman p display fix (Version 115);
- a **Training record** for clinical trainees: logbook, case records, case-record viva, postings and report. It has 82 functions named `tr…` (VERIFIED by count), built by Version 114;
- a **"My details"** profile (name, position, role, course);
- a new **home** with the six steps, Learn, and "Continue";
- Hindi rules for Analyse a paper's AI (`apRules`) and Hindi stage names (`AP_STAGES_HI`);
- evidence badges on Ask answers (`evStatus`, `evBadgeHTML`), which B3 ports from build 55 today.

**What to do:** the v1-to-v2 gap inventory, and B3's plan, should be checked against today's v1, not the 13 October clone.

## 12. Register rows to file (all `proposed`)

- **D-L-1.** Learning moves from inside Analyse a paper to its own place, with links from every stage (decision 2). Awaits Dr. Sharma and OJ.
- **D-L-2.** Learning's content is pinned to v1 build {pin}, apart from the 13 October pin (decision 1). Awaits OJ.
- **D-L-3.** Progress is saved to the account and sealed (C1, C4). Awaits Dr. Sharma.
- **D-L-4.** The practice lesson's words are kept with the lesson, plus a practice card (decision 4). Awaits Dr. Sharma and OJ.
- **D-L-5.** Natural voice goes through the gateway, with its wording (decision 3). Awaits Dr. Sharma and OJ.
- **D-L-6.** The honest note for online device voices (C5). Awaits Dr. Sharma.
- **D-L-7.** AI answers are not cached (C7). Awaits Dr. Sharma.
- **D-L-8.** The stage-to-lecture map (C3). Awaits Dr. Sharma.
- **D-L-9.** No emoji in Learning's new labels (wave B decision 6). Awaits Dr. Sharma.
- **D-L-10.** Theatre buttons are 44 px on a phone; full screen is hidden where unsupported. Awaits Dr. Sharma.
