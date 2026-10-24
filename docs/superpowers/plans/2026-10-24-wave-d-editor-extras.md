# Wave D: Editor Extras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the eight v1 editor features that v2 lacks: numbered APA captions, the picture editor, the photo studio window, dictation extras, the quick provider switch on the AI pill, the specialty pack setting, the writing-sample capture setting, and the resizable aside (v1's dock).

**Architecture:** Pure logic goes in `lib/editor/*` and `packages/core` with unit tests; each feature gets its own component files and its own message pair under `apps/web/messages/tools/`. A scaffold task registers every shared name once (message pairs, settings keys, one blob kind), so later tasks touch disjoint files. One task, the toolbar wiring, is the only one that edits `FormatBar.tsx`. Pictures stay inline base64 inside the document body, so edits ride the existing sealed autosave path.

**Tech Stack:** Next.js (apps/web), Tiptap, Hono (apps/api), TypeScript, vitest, Playwright, pnpm and turbo.

**Spec:** v1 (`Scholarly/appuscholer/index.html` at c8c53735) is the spec, read through two research notes written for this plan: `docs/superpowers/plans/notes/2026-10-24-wave-d-research-pictures.md` (captions, picture editor, photo studio: "R1") and `docs/superpowers/plans/notes/2026-10-24-wave-d-research-settings.md` (dictation, AI pill, pack, samples, dock: "R2"). The gap list is `appuscholar-blueprint/notes/2026-10-24-v1-gap-inventory.md`. Every task below says which R1/R2 section holds its exact v1 behaviour, constants and strings; the implementer reads that section first.

## Global Constraints

- Repo `imojbaba/appuscholar` is PUBLIC: no secrets, keys, personal data or Dr. Sharma's documents in commits. Never push to, merge into or rebase `phase-3a-vault`; never deploy. Work in `Scholarly/appuscholar-wave-d` on branch `wave-d`; push `wave-d` after every reviewed task.
- v1 is the spec: port behaviour and words. New strings: plain words, sentence case, no emoji, no em-dashes. Strings v1 already has (R1 section 4, R2 sections 6 and 7) are in the base `en.json`/`hi.json` under their v1 keys: use them through `t()`, never redefine them. A new string goes in the task's own message pair `apps/web/messages/tools/<name>.{en,hi}.json` (Hindi file starts with the `"$draft"` line the other tool files carry). A key already in `en.json` or another tool file throws at load. `test/i18n-coverage.test.ts` forbids a source literal equal to a v1 value outside `t()`.
- Edits to shared files (`AppHeader.tsx`, `ProviderKey.tsx`, `globals.css`, `en.json`, `hi.json`) stay small and in one block.
- Fences (other sessions own these): Literature and wave B plan, `/learn`, the QA files, the participants register and `packages/core/src/pdscan.ts`, the copilot door, the Help dialog, Guide, backup, install/offline, the dark theme and the AI-use statement, the API gateway quota and health routes. Do not touch them.
- Pictures are inline base64 data URIs in the document body (R1 section 0). A picture edit goes back into the editor through `updateAttributes`/`setNodeMarkup`; no new endpoint, store or channel carries picture bytes to the server. With the vault on the whole body, pictures included, is sealed by the existing path.
- The document body is capped at 2.8 MB raw on the API (about 2.1 MB of HTML with the vault on). A picture write must not push a document past the cap silently (Task 9).
- Tests first. An e2e test per item (Task 15). Shared tests (`test/tools.test.ts`, `toolRegistry.test.tsx`, `places.test.tsx`, `projectHome.test.tsx`, `e2e/tools-g.spec.ts`, `e2e/stage2-idea-literature.spec.ts`) are not edited except where a task says so; `places.test.tsx` gains cases only in Task 11.
- Register: every deviation from v1 gets a row in `docs/superpowers/specs/parity-deviations.md`, ids D-S2-110 to D-S2-129 (this plan's block), status `proposed`, "awaits Dr. Sharma (review)". Rulings below are the plan's decisions; each costs only rework if OJ disagrees.

## Rulings (decided here so no task waits)

- **P1 Captions renumber only on explicit events**, as v1 does (after Insert caption, after a picture edit that adds a caption, after Chart Studio insert, on Renumber all). No automatic plugin: it would change the document without the student typing and risks undo loops. `cap_desc` ("Numbers update by themselves") stays v1's words; register row notes the gap. Cost if wrong: add an `appendTransaction` plugin later.
- **P2 Writing-sample capture is opt-in (default OFF).** v1 was ON because nothing left the computer; in v2 the samples would be a second server-side copy of the student's text for a tool that does not exist yet. New honest copy in the `samples` pair. Cost if wrong: flip the default in one line.
- **P3 Specialty pack default is "psychology" (setting absent = psychology)**, so nobody loses the Research helpers; "general" hides that fold in Writing.
- **P4 Resizable dock = option B of R2 section 8**: the Writing place's AI aside becomes resizable with the existing `dockW` setting (320 to 760, default 420). The v1 below-1100 px split is not ported (v2 stacks there). `docW` (document beside a place) already ships and stays.
- **P5 Dictation language and the first-use notice acknowledgement are per-device `localStorage`** (keys suffixed with the user id), not account settings: the notice is about this browser's speech service.
- **P6 AI pill:** the pill click still opens Settings; a caret beside it opens the switch menu (keeps existing e2e green).
- **P7 Photo studio is its own route** `app/(app)/photo-studio` with its own channel `appu_photo`, no `ProjectShell`.

## Review Focus

1. A large PNG screenshot, or four photos, pushed past the 2.8 MB body cap: the student is told before it is applied and autosave does not loop forever (Task 9; picture tests in Tasks 3, 6).
2. A document with the vault locked, or the studio opened with the opener closed: nothing is written, the message says what to do (Tasks 7, 8).
3. A v1-imported document whose captions carry `data-cap` attributes: they survive load, save and sanitising (Task 2).
4. A caption on a picture inside a table cell, a picture that moved while the studio was open, and two identical pictures (Tasks 5, 6, 7).
5. Dictation said at the start of a document, after a full stop, in Hindi, and with the microphone blocked (Task 4).

---

## Task 1: Scaffold shared registrations

**Depends on:** none. **Files:**
- Create: `apps/web/messages/tools/{dictation,aipill,samples,pictures,captions,studio,dock}.{en,hi}.json` (en `{}`; hi `{"$draft": "DRAFT: Hindi for Dr. Sharma's review, reviewed by: (pending)"}`)
- Modify: `apps/web/messages/tools/index.ts`; `apps/web/test/i18n.test.ts:~138` (the `TOOLS` list); `apps/api/src/store/types.ts`, `apps/api/src/routes/me.ts`, `apps/web/lib/settingsMerge.ts` (settings `pack?: "general" | "psychology"`, `writingSampleCapture?: boolean`); `apps/api/src/routes/blobWrite.ts`, `apps/web/lib/blobs/kinds.ts`, new `apps/web/lib/blobs/kinds/samples.ts`, `apps/web/lib/frame/stages.ts`, `apps/web/lib/blobs/useProjectBlob.ts` (blob kind `writing_samples`, R2 section 7b points 1 to 5); new `apps/web/components/workspace/dialogs/SettingsPack.tsx` and `SettingsWritingSamples.tsx` (each `export function X(): null`) with one mount line each in `ProviderKey.tsx` (pack after the content-language block, samples before the AI-fallback block).
- Test: `apps/api/test/app.test.ts` (patch accepts both keys, rejects `pack: "x"`), `apps/api/test/blobs.routes.test.ts` (`NEW_KINDS`), `apps/web/test/frameStages.test.ts`, `apps/web/test/useProjectBlob.test.tsx`, `apps/web/test/settings.test.ts`.

**Interfaces:**
- Produces: message namespaces `dictation aipill samples pictures captions studio dock`; `Settings.pack`, `Settings.writingSampleCapture`; blob kind `"writing_samples"` with `WritingSamples = Record<string, {title: string; text: string; words: number; updated: number}>` exported from `lib/blobs/kinds/samples.ts` (loose zod object, schema `SAMPLES_SCHEMAS`); `<SettingsPack/>`, `<SettingsWritingSamples/>`.

- [ ] Step 1: write the failing tests above (settings patch accepts `{pack:"general"}` and `{writingSampleCapture:true}`; unknown pack value is 400; `writing_samples` accepted by the blob routes and mapped to stage `writing` with `work:false`; `mergeSettings` keeps both keys; i18n TOOLS list includes the seven names).
- [ ] Step 2: run them, see them fail for the stated reasons (`pnpm --filter @appuscholar/web exec vitest run <files>` and `pnpm --filter @appuscholar/api exec vitest run <files>`).
- [ ] Step 3: implement the registrations. `writing_samples` is UNGUARDED in `useProjectBlob`. Mount lines render the stubs.
- [ ] Step 4: run the same tests plus `test/i18n.test.ts`, `test/i18n-coverage.test.ts`, typecheck, lint: all pass.
- [ ] Step 5: commit `feat(wave-d): scaffold message pairs, pack and sample settings, writing_samples blob kind`.

## Task 2: Caption and edits schema, sanitizer

**Depends on:** none. **Files:** Modify `apps/web/lib/editorExtensions.ts`, `packages/core/src/sanitize.ts`; tests `apps/web/test/editorSchema.test.ts`, `packages/core/test/sanitize.test.ts`, `apps/api/test` (documents plaintext path keeps the attributes). (R1 sections 1b, 2b, 0 points 4 and 6.)

**Interfaces:**
- Produces: paragraph attributes `cap: "figure"|"table"|null` (`data-cap`), `capTitle` (`data-cap-title`, boolean-like "1"), `capNote` (`data-cap-note`) via a global-attribute Extension like `RefParagraph`, registered in `schemaExtensions`; image attribute `edits: string|null` (`data-edits`) on `SizedImage`; `data-cap`, `data-cap-title`, `data-cap-note`, `data-edits` named in `ALLOWED_ATTR`.

- [ ] Step 1: failing tests: `<p data-cap="figure"><strong>Figure 1</strong></p>`, `<p data-cap-title="1"><em>T</em></p>`, `<p data-cap-note="1"><em>Note.</em> n</p>` and `<img src="data:image/png;base64,AAAA" data-edits="cropped, bar">` round-trip through `sanitizeHtml` then `generateJSON`/`generateHTML(editorExtensions)` unchanged; the same HTML survives core `sanitizeHtml` in both paths; a v1-imported document keeps the caption mark after `new Editor({content})` and `getHTML()`.
- [ ] Step 2: run, expect FAIL (attributes dropped).
- [ ] Step 3: implement the Extension and the `edits` attribute; list the four attributes in `ALLOWED_ATTR`.
- [ ] Step 4: run `editorSchema`, `editorCommands`, `insert`, core sanitize and golden html tests: pass.
- [ ] Step 5: commit `feat(editor): caption paragraph attributes and picture edits attribute survive save and load`.

## Task 3: Picture engine (pure canvas helpers)

**Depends on:** none. **Files:** Create `apps/web/lib/editor/pictureOps.ts`; modify `apps/web/lib/editor/image.ts`; tests `apps/web/test/pictureOps.test.ts`, extend `apps/web/test/image.test.ts`. (R1 sections 2a, 3a "Studio ops".)

**Interfaces:**
- Produces: `MIN_DRAG = 6`; `normalizeRect(a:{x,y}, b:{x,y}, w:number, h:number): {x,y,w,h}` (clamped); `contrastFactor(contrast:number): number` (259(c+255)/(255(259-c)), c = contrast*2.55); `adjustPixels(data: Uint8ClampedArray, brightness:number, contrast:number, saturation?:number): void` (saturation around luma .299/.587/.114, before contrast and brightness); `pixelBlock(w:number,h:number): number` (`max(6, round(min(w,h)/6))`); `blurDivisor(w,h)` (`max(4, round(min(w,h)/10))`); `pixelateDims(w,h): {blk,sw,sh}`; `sharpenKernel` (`[0,-1,0,-1,5,-1,0,-1,0]`); `maskNote(log: string[], t: (k:string)=>string): string` (space-joined `ie_note_bar|ie_note_pix|ie_note_bg|ps_note_blur` for the ops used); `exportDataUrl(canvas: HTMLCanvasElement, wasPng: boolean): string` (PNG if `wasPng`, else/if longer than 600000 chars JPEG q0.92; then `shrinkDataUrl`); `shrinkDataUrl(dataUrl: string): Promise<string>`-equivalent sync-safe wrapper per `image.ts` conventions: max edge 1600, white fill, PNG kept only if source PNG and result at most 400000 chars else JPEG q0.85, GIF/SVG untouched; and the canvas drawing ops `applyCrop|applyBar|applyPixelate|applyBackground|applyRotate|applyFlip|applyBlur|applySharpen|applyBorder` each taking a `CanvasRenderingContext2D`/canvas and returning a new or the same canvas, exactly as R1 2a/3a describe (history cap 12 for the editor, 15 for the studio belongs to the shells).
- Changes `resizeImage` in `image.ts`: PNG-to-JPEG fallback above 400000 chars (v1 `imgShrinkDataUrl`).

- [ ] Step 1: failing tests: `contrastFactor(0) === 1`, `contrastFactor(100)` equals the v1 formula value; `adjustPixels` on a 2-pixel array with brightness 20 adds 51 clamped; `pixelBlock(60,60) === 10`, `pixelBlock(20,20) === 6`; `pixelateDims(100,60)` gives `blk 10, sw 10, sh 6`; `normalizeRect` drags backwards and clamps to the canvas; a drag under 6 px is rejected by `isDrag`; `maskNote(["bar","pixelated"], t)` joins both notes once; `exportDataUrl` picks PNG at 600000 or less and JPEG over it (stubbed `toDataURL`); `resizeImage` of a large PNG returns JPEG.
- [ ] Step 2: run, FAIL. Step 3: implement (canvas stubs as `test/image.test.ts` does; jsdom has no canvas). Step 4: run `pictureOps`, `image` tests: pass. Step 5: commit `feat(editor): picture engine and large-PNG fallback`.

## Task 4: Dictation logic, preferences, first-use notice

**Depends on:** Task 1. **Files:** Modify `apps/web/lib/editor/dictate.ts`; create `apps/web/lib/editor/dictPrefs.ts`, `apps/web/components/workspace/dialogs/DictationNotice.tsx`; fill `messages/tools/dictation.{en,hi}.json`; tests `apps/web/test/dictateFormat.test.ts`, `apps/web/test/dictation.test.tsx`. Do not edit `FormatBar.tsx` (Task 14). (R2 section 4.)

**Interfaces:**
- Produces: `DICTATION_LANGS` in v1 order `en-IN, hi-IN, en-GB, en-US`; `defaultDictationLang(contentLang: string): string`; `formatSpoken(raw: string, lang: string): string` (the English and Hindi lists, order and flags exactly as R2 4a); `placeSpoken(text: string, before: string, lang: string): {text: string; leadSpace: boolean}` (auto-capital unless Hindi; space rule `prev && !/\s$/.test(prev) && !/^[.,?!:;।\n)]/.test(t)`); `startDictation({lang,onInterim,onFinal,onEnd,onError,onGiveUp})` adding restart on `onend` while on, 3 consecutive runs under 1200 ms call `onGiveUp`; error codes returned as codes, not sentences; `readDictPrefs(userId)/writeDictLang(userId, lang)/hasAcked(userId)/ack(userId)` (try/catch, key `appu_dictlang_<userId>`, `appu_dict_ack_<userId>`); `<DictationNotice open onContinue onCancel/>` (Continue / Cancel, two paragraphs, v1 wording from R2 4a, new keys `dict_*` in the `dictation` pair including the seven error sentences, unsupported, listening, stop, give-up).

- [ ] Step 1: failing tests: `formatSpoken("a full stop b","en-IN")` is `"a. b"`; `"hello new paragraph world"` gives `"hello\n\nworld"`; `"semicolon"` is not matched by the colon rule; Hindi `"मैं पूर्ण विराम"` gives `"मैं।"`; `placeSpoken("hello","", "en-IN")` capitalises, `placeSpoken("next","done. ","en-IN")` capitalises, `placeSpoken("नमस्ते","", "hi-IN")` does not; `placeSpoken(".", "hello","en-IN").leadSpace === false`; with a fake recogniser, the notice appears before the first start, Cancel starts nothing and stores nothing, Continue stores the ack; three fast ends call `onGiveUp`; `not-allowed` reaches `onError` as `"not-allowed"`.
- [ ] Step 2 to 5: run (fail), implement, run (pass), commit `feat(dictation): spoken punctuation, auto-capitals, English (UK), first-use notice`.

## Task 5: Caption logic and dialog

**Depends on:** Tasks 1, 2. **Files:** Create `apps/web/lib/editor/captions.ts`, `apps/web/components/document/CaptionDialog.tsx`; fill `messages/tools/captions.{en,hi}.json` only if a new string is needed (v1 keys `cap_*` exist); tests `apps/web/test/captions.test.ts`, `apps/web/test/captionDialog.test.tsx`. Do not edit `FormatBar.tsx`. (R1 section 1.)

**Interfaces:**
- Produces in `captions.ts`: `captionHtml(kind: "figure"|"table", title: string): string` (`<p data-cap="figure"><strong>Figure 0</strong></p><p data-cap-title="1"><em>TITLE</em></p>`, title escaped); `noteHtml(note: string): string`; `renumberCaptions(editor: Editor): {f: number; t: number}` (document order, two counters, one transaction, no transaction when nothing changes); `hasCaptionAbove(editor: Editor, pos: number): boolean`; `topLevelBlockPos(editor: Editor, pos: number): number`; `nearestTablePos(editor: Editor): number | null`; `insertCaption(editor: Editor, o: {kind; title; note}): "inserted"|"need-title"` (table kind: above the table's top-level block, note below; figure kind: above the selected image's top-level block, note below; with no image, at the cursor; ends with `renumberCaptions`). `<CaptionDialog open onOpenChange editor/>` (Kind defaults to table when the cursor is in a table; empty title shows `cap_need_title` and stays open; Renumber all shows `cap_renum_done`).

- [ ] Step 1: failing tests: two figures and one table number `Figure 1`, `Figure 2`, `Table 1` in document order; deleting the first figure and pressing Renumber all makes the second `Figure 1`; caption goes above a table and the note below; a picture inside a table cell puts the caption above the whole table; an empty title returns `"need-title"` and changes nothing; the title `<b>x</b>` is escaped; `renumberCaptions` on an already-correct document dispatches no transaction; `hasCaptionAbove` true when the previous top-level sibling has a `cap` attribute; dialog defaults Kind to table when the cursor is in a table.
- [ ] Step 2 to 5: run (fail), implement, run (pass), commit `feat(editor): numbered APA captions`.

## Task 6: Picture editor dialog

**Depends on:** Tasks 1, 2, 3, 5, 9. **Files:** Create `apps/web/components/document/PictureEditor.tsx`; append new keys to `messages/tools/pictures.{en,hi}.json`; tests `apps/web/test/pictureEditor.test.tsx`. Do not edit `FormatBar.tsx`. (R1 section 2.)

**Interfaces:**
- Consumes: Task 3 helpers; Task 5 `insertCaption`-style helpers (`captionHtml`, `noteHtml`, `hasCaptionAbove`, `renumberCaptions`); Task 9 `fitsBudget(editor, extraChars): boolean` and `SIZE_BLOCK_KEY`.
- Produces: `<PictureEditor open onOpenChange editor onOpenStudio/>` working on the selected image (`editor.isActive("image")`): Turn left/right, Crop, Black bar, Pixelate, Plain background, Undo (cap 12), Start over, brightness and contrast sliders, background colour select, caption box (disabled with `ie_cap_exists` when `hasCaptionAbove`), footer Use this picture / Cancel / Open in a bigger window (`ps_open_btn`, calls `onOpenStudio`). Working canvas at most 1600 px. Pointer events with `touch-action: none`; a drag under 6 px is ignored. Because v1 has no keyboard path, add four number inputs (x, y, width, height) for the active tool's rectangle with a Apply-rectangle button (new keys in `pictures`). Apply: `exportDataUrl`, then `fitsBudget`; if it does not fit, show the size message and keep the dialog open; else `editor.chain().focus().updateAttributes("image", { src, edits })` (edits = de-duplicated log joined ", ", omitted when empty), width and alt kept; if the caption box is ticked and none exists, insert caption above the picture's top-level block and the note below, set `alt` to the title, then `renumberCaptions`. The ticking pre-fills the note with `maskNote`.

- [ ] Step 1: failing tests (canvas stubbed, `test/image.test.ts` style): Apply calls `updateAttributes("image", {src: <data url>, edits: "bar"})` and leaves width; Cancel leaves the document byte-identical; caption box disabled and shows `ie_cap_exists` when a caption sits above; ticking it pre-fills the black-bar note; a result over the budget keeps the dialog open and shows the size message; a 5 px drag does nothing; the rectangle inputs produce the same operation as a drag; Undo restores the previous canvas.
- [ ] Step 2 to 5: run (fail), implement, run (pass), commit `feat(editor): picture editor (crop, turn, black bar, pixelate)`.

## Task 7: Photo studio channel and host

**Depends on:** Tasks 1, 2. **Files:** Create `apps/web/lib/popout/photoChannel.ts`, `apps/web/lib/editor/photoStudioHost.ts`; tests `apps/web/test/photoChannel.test.ts`, `apps/web/test/photoStudioHost.test.tsx` (use `test/support/fakeChannel.ts`). (R1 section 3.)

**Interfaces:**
- Produces: `PHOTO_CHANNEL = "appu_photo"`; message types `{t:"ready",id}`, `{t:"load",id,src,capExists}`, `{t:"done",id,src,edits,capOn,title,note}`, `{t:"saved",id,ok}`, `{t:"cancel",id}`; `photoChannel()`, `setPhotoChannel(c|null)` (test hook, copy `lib/popout/channel.ts` including the Node `unref`); `newStudioId(): string`; `usePhotoStudioHost(editor: Editor | null): { openStudio(pos: number | null): "opened"|"blocked"|"no-channel" }`: `window.open("/photo-studio#id=" + id, "appu_photo_" + id, "popup=yes,width=1280,height=860")`, remembers `{pos, src}` per id, answers `ready` with `load`, on `done` replaces the image at the remembered position (re-finding by `src` if the position moved; mapping through transactions) with `setNodeMarkup` keeping width and alt and setting `edits`, or inserts `{type:"image", attrs:{src, width:360, edits}}` at the cursor when the original is gone or the studio opened empty, adds the caption per `capOn`, renumbers, posts `saved{ok}`; ignores other ids; ignores `done` over the size budget (`fitsBudget`) and posts `saved{ok:false}`.

- [ ] Step 1: failing tests with `FakeChannel`: ready then load carries the selected image `src`; done replaces that image only (width kept, `data-edits` set); done after the image was deleted inserts a new picture; two identical pictures: the one at the remembered position changes; unknown id ignored; cancel drops the record; popup blocked returns `"blocked"`; over-budget done answers `ok:false`.
- [ ] Step 2 to 5: run (fail), implement, run (pass), commit `feat(editor): photo studio channel and host`.

## Task 8: Photo studio page

**Depends on:** Tasks 3, 7. **Files:** Create `apps/web/app/(app)/photo-studio/page.tsx`, `apps/web/components/document/PhotoStudio.tsx`; append keys to `messages/tools/studio.{en,hi}.json` (v1 `ps_*` keys exist); one block in `apps/web/app/globals.css` (studio layout, phone breakpoint 760 px); tests `apps/web/test/photoStudio.test.tsx`. Must not mount `ProjectShell`. (R1 section 3a.)

**Interfaces:**
- Consumes: Task 3 ops; Task 7 channel types.
- Produces: `<PhotoStudio/>`: reads `id` from `location.hash`, posts `ready`, shows `ps_openhint` if no id; on `load` draws `src` (working canvas at most 2400 px) or waits for Open a picture (file input, images only); tools Crop (with `ps_aspect` shapes 1:1, 4:3, 3:4, 16:9), Black bar, Pixelate, Blur, Plain background (oval or box), Box, Arrow, Pen, Text; Colour (default `#e11d48`) and Size (1 to 30, default 6); Brightness, Contrast, Colour strength (-100 to 100); Turn left/right, Flip both ways, Sharpen, Add border, Width in pixels (50 to 4000) with Resize; Undo (cap 15), Redo, Start over, zoom (x1.25 steps, 0.1 to 4, Fit); Ctrl/Cmd+Z and Ctrl/Cmd+Y; caption box; Done posts `done` and waits up to 4000 ms for `saved` (then `ps_noparent`), closing 700 ms after `saved{ok:true}`; Close posts `cancel`; Save a copy downloads `picture.png|jpg`. Result goes through `exportDataUrl` (so long side returns to 1600). The page writes nothing to localStorage, IndexedDB or the API.

- [ ] Step 1: failing tests (channel faked, canvas stubbed): `ready` posted on mount; `load` shows the picture; Done posts `done` with `edits` joined ", "; no `saved` within 4000 ms (fake timers) shows `ps_noparent`; Close posts `cancel`; opening a non-image shows `ie_fail`; Undo then Redo; the page module does not import `ProjectShell` (grep test).
- [ ] Step 2 to 5: run (fail), implement, run (pass), commit `feat(editor): photo studio window`.

## Task 9: Document size guard

**Depends on:** Task 1. **Files:** Modify `apps/web/lib/useAutosave.ts`, `apps/web/lib/docMessages.ts` (or the file that holds the autosave messages); create `apps/web/lib/editor/sizeBudget.ts`; new keys in `messages/tools/pictures.{en,hi}.json`; tests `apps/web/test/sizeBudget.test.ts`, extend `apps/web/test/useAutosave.test.ts`. (R1 section 0 point 3, risks 1.)

**Interfaces:**
- Produces: `BODY_LIMIT_PLAIN = 2_800_000`, `BODY_LIMIT_SEALED = 2_100_000`; `fitsBudget(editor: Editor, extraChars: number, vaultOn: boolean): boolean`; `sizeMessageKey = "pic_too_big"` (new key: says the document is too large to hold this picture and to shrink or remove a picture); in `createAutosaver`, an HTTP 413 sets status `"too-large"` (a distinct message), stops the retry loop, and the badge says so; the student's next edit tries again.
- Note: callers get `vaultOn` from the vault context; `fitsBudget` has the same signature used by Tasks 6, 7 and 14 (the hosts pass it from `useVault`).

- [ ] Step 1: failing tests: 413 gives status `"too-large"` and no further retry until the next change; `fitsBudget` false when HTML length plus extra exceeds the sealed limit with the vault on, true for the plain limit with it off; boundary values.
- [ ] Step 2 to 5: run (fail), implement, run (pass), commit `feat(editor): picture size guard and a clear 413 message`.

## Task 10: Quick provider switch on the AI pill

**Depends on:** Task 1. **Files:** Modify `apps/web/components/frame/AppHeader.tsx` (one block: `AiPill`, and the phone menu rows), `apps/web/app/globals.css` (small rule); fill `messages/tools/aipill.{en,hi}.json`; tests `apps/web/test/aiPill.test.tsx` (copy `accountMenuExport.test.tsx` helpers). (R2 section 5.)

**Interfaces:**
- Produces: next to the pill (`data-testid="ai-pill"` unchanged, still opens Settings) a caret `data-testid="ai-pill-menu"` (aria-label from `t()`) opening a `DropdownMenu` of the six providers in `PROV_ORDER` (names from `PROVIDERS`), items `ai-switch-<id>`; the active one is bold with a check; a provider with a key (`useKeys().hasKey(p)`): `update({ provider: p })` and toast `aipill_now` with `{name,short}`; without: `openSettings(p)` and toast `aipill_paste`; item titles `aipill_key_saved` / `aipill_no_key`. Toast text is v1's (R2 5a) in the `aipill` pair; Hindi is DRAFT.

- [ ] Step 1: failing tests: item order equals `PROV_ORDER`; a keyed provider calls `update({provider})` and shows the "Now using" toast; an unkeyed one calls `openSettings("claude")` and the "Paste your" toast; the pill click still calls `openSettings()`; existing `accountMenuExport.test.tsx` still passes.
- [ ] Step 2 to 5: run (fail), implement, run (pass), commit `feat(header): quick provider switch on the AI pill`.

## Task 11: Specialty pack setting

**Depends on:** Task 1. **Files:** Fill `apps/web/components/workspace/dialogs/SettingsPack.tsx`; modify `apps/web/components/places/WritingPlace.tsx`; tests `apps/web/test/settingsPack.test.tsx`, extend `apps/web/test/places.test.tsx` (the one shared test this plan may extend). (R2 section 6.)

**Interfaces:**
- Produces: `<SettingsPack/>`: select with `settings_pack_general` / `settings_pack_psychology` options and `settings_pack_desc` (existing v1 keys), value `settings.pack ?? "psychology"`, change calls `update({ pack })`; `WritingPlace` renders the Research helpers fold only when `settings.pack !== "general"`. Register row notes that in v2 the "tab" is a fold in Writing.

- [ ] Step 1: failing tests: absent pack shows the helpers fold; `pack: "general"` hides it (fold list is only Chat); the select writes `{pack:"general"}`; `mergeSettings` keeps it.
- [ ] Step 2 to 5: run (fail), implement, run (pass), commit `feat(settings): specialty pack`.

## Task 12: Writing-sample capture

**Depends on:** Task 1. **Files:** Modify `packages/core/src/origin.ts`, `packages/core/src/index.ts`, `apps/web/components/document/DocumentCard.tsx` (one mount line), `apps/web/components/document/DocBar.tsx` (remove entry on mark-as-source and on delete); create `apps/web/lib/writingSamples/{captureSample.ts,useWritingSampleCapture.ts}`; fill `SettingsWritingSamples.tsx`; fill `messages/tools/samples.{en,hi}.json`; tests `packages/core/test/origin.test.ts` (extend), `apps/web/test/writingSamples.test.tsx`, `apps/web/test/settingsWritingSamples.test.tsx`. (R2 section 7.)

**Interfaces:**
- Produces: core `typedText(html: string): {text: string; words: number}` (text outside `span.ai-ins`, blocks separated by a space, whitespace squeezed); `MIN_SAMPLE_WORDS = 30`; hook `useWritingSampleCapture(editor, currentDoc)`: when `settings.writingSampleCapture === true`, the document is not a source, and words at least 30, writes `set(prev => ({...prev, [docId]: {title, text, words, updated}}))` to `useProjectBlob("writing_samples", projectId)`, at most once per 60 s per document and on document switch; does nothing in a pop-out; `<SettingsWritingSamples/>`: checkbox (`writingsample_label`), new honest description (`wsamp_desc`, P2), status `writingsample_status_fmt` for the open project's blob or `writingsample_status_off`, Clear button (`writingsample_clear_btn`, inline confirm using `writingsample_clear_confirm`) that issues `DELETE /projects/:id/blobs/writing_samples` for every project that has the kind (from the work list) and the scratch project, then toast `writingsample_cleared`.

- [ ] Step 1: failing tests: `typedText` drops AI spans, separates blocks, handles nested tags and entities, 29 words vs 30; hook: off writes nothing, source skipped, under 30 skipped, AI text absent from the written text, second write inside 60 s skipped, marking a document as source removes its entry; settings block: ticking writes `{writingSampleCapture:true}`, Clear calls DELETE for each project then shows the cleared toast.
- [ ] Step 2 to 5: run (fail), implement, run (pass), commit `feat(settings): writing-sample capture, opt-in`.

## Task 13: Resizable aside (dock)

**Depends on:** Task 1; after Task 12 (both edit `DocumentCard.tsx`). **Files:** Modify `apps/web/components/document/DocumentCard.tsx`, `apps/web/app/globals.css` (replace line 308's fixed column with `var(--aside-w, 420px)`; add `.aside-resize`); fill `messages/tools/dock.{en,hi}.json`; tests `apps/web/test/asideResize.test.tsx`. (R2 section 8c option B; copy the `docW` handle in `DocumentBeside.tsx`.)

**Interfaces:**
- Produces: a separator handle (`role="separator"`, `data-testid="aside-resize"`, `aria-valuemin 320`, `aria-valuemax 760`, `aria-valuenow`, `aria-label` from `t()`) shown only when the aside is shown, the document is not beside a place, and the viewport is at least 1100 px (`useMedia`); pointer drag sets `--aside-w` live and calls `update({ dockW })` once on release; Arrow Left/Right moves 40 px, Home = max, End = min; width clamped to `max(320, min(760, container width - 480 - gap))`; default 420.

- [ ] Step 1: failing tests: drag clamps at 320 and 760; `update` called once on pointer-up with the final width; keyboard steps and Home/End; hidden under 1100 px and when the document is beside; the clamp shrinks the maximum on a narrow container.
- [ ] Step 2 to 5: run (fail), implement, run (pass), commit `feat(document): resizable AI aside`.

## Task 14: Toolbar wiring

**Depends on:** Tasks 4, 5, 6, 7, 8, 9. **Files:** Modify `apps/web/components/document/FormatBar.tsx` only (and its tests: new `apps/web/test/formatBarExtras.test.tsx`). This is the only task that edits FormatBar.

**Interfaces:**
- Produces: a Caption button (`t("cap_btn")`, `data-testid="fmt-caption"`, after Table) opening `CaptionDialog`; an Edit picture button (`ie_btn`, `data-testid="fmt-edit-picture"`) beside the width slider in `.imgbar`, opening `PictureEditor`; a Photo studio button (`ps_tb_btn`, `data-testid="fmt-photo"`) in the More row calling `usePhotoStudioHost(editor).openStudio(null)`; the picture editor's `onOpenStudio` calls `openStudio(selectedImagePos)`; blocked popup shows `pop_blocked` and falls back to `PictureEditor`; no channel shows `ps_nochan` and falls back. Dictation: language select options from `DICTATION_LANGS`, persisted with `writeDictLang`, default from the project's `contentLang` then the account's; first start shows `DictationNotice`; `onFinal` runs `formatSpoken`, `placeSpoken` with `before` = the caret's textblock text before the caret, splits on `\n` (`splitBlock` for `\n\n`, `setHardBreak` for `\n`), inserts untagged text (no `ai-ins`) with no trailing space; status shows the last 70 characters of interim text; errors map codes to `dict_*` sentences and stop; give-up shows the keep-stopping sentence.

- [ ] Step 1: failing tests (real `Editor`, fake recogniser as in Task 4): Caption button opens the dialog; Edit picture button only with an image selected; Photo studio button calls `window.open` with `/photo-studio#id=`; blocked popup falls back; a final result "hello full stop next one" gives "Hello. Next one"; "new paragraph" makes two paragraphs; the chosen language survives a remount; Cancel on the notice starts nothing.
- [ ] Step 2 to 5: run (fail), implement, run (pass), commit `feat(document): caption, edit picture, photo studio and dictation extras in the toolbar`.

## Task 15: End-to-end tests, journey and full runs

**Depends on:** all. **Files:** Create `apps/web/e2e/wave-d.spec.ts` (and `apps/web/e2e/support/fakeSpeech.ts`); ledger `docs/superpowers/ledgers/2026-10-24-wave-d.md`; walk sheet `docs/walkthroughs/wave-d.md`; register rows. Use ports `E2E_WEB_PORT=3083`, `E2E_API_PORT=8883`, DB 5483; check for stale servers first.

- [ ] Step 1: write one e2e step per item, each asserting through the page: (1) insert two captions and a table caption, numbers read Figure 1, Figure 2, Table 1, reload keeps them; (2) insert a generated PNG, Edit picture, black bar, Apply: the saved PUT body (vault on) is ciphertext and the image `src` changed, with `data-edits` after reload; (3) open the studio popup, edit, Done: the main window picture changed, caption added; (4) fake speech: notice then "hello full stop" types "Hello."; (5) AI pill caret: choose a keyed provider, pill text changes, unkeyed opens Settings on it; (6) pack general hides the Research helpers fold; (7) writing-sample capture: tick, type 40 words, GET `/projects/:id/blobs/writing_samples` is 200, Clear then 404; (8) drag `aside-resize`, reload, width kept. Plus a size-guard step: a document past the cap shows the size message.
- [ ] Step 2: run the spec until green. Step 3: run the full web suite, core and api suites, typecheck, lint, and the journey e2e (`stage2-idea-literature.spec.ts`, `tools-g.spec.ts`, `phase2-walkthrough.spec.ts`) three times each locally; record every run in the ledger.
- [ ] Step 4: write `docs/walkthroughs/wave-d.md` (rows per item for OJ's live walk, release check as row 0) and the register rows D-S2-110 and up (one per deviation: P1 to P7, the keyboard rectangle inputs, the size guard, the honest sample copy, `data-edits` kept).
- [ ] Step 5: push `wave-d`, open the PR into `phase-3a-vault`, confirm three green checks, and send the main session the built / tested table (VERIFIED / SUPPORTED / BELIEVED / UNKNOWN).

---

## Self-review

- **Spec coverage:** items 1 (Tasks 2, 5, 14), 2 (3, 6, 9, 14), 3 (3, 7, 8, 14), 4 (4, 14), 5 (10), 6 (1, 11), 7 (1, 12), 8 (13). Storage question answered in Global Constraints and Tasks 6, 9 from R1 section 0. Task 15 covers e2e per item and the three local runs.
- **Types:** `fitsBudget(editor, extra, vaultOn)` is defined in Task 9 and used in Tasks 6, 7, 14 with that signature; `captionHtml/noteHtml/hasCaptionAbove/renumberCaptions` defined in Task 5 and used in 6, 7; channel types defined in Task 7 and used in 8; `formatSpoken/placeSpoken/readDictPrefs` defined in Task 4 and used in 14.
- **File conflicts:** `FormatBar.tsx` only in Task 14; `DocumentCard.tsx` in 12 then 13; `globals.css` blocks in 8, 10, 13 (one block each, small, run in sequence if edits collide); `pictures` message pair appended by Task 9 then Task 6 (Task 6 depends on 9). Parallel groups after Task 1 and the independent starters (2, 3): {4, 5, 7, 9, 10, 11, 12} then {6, 8, 13} then 14, then 15.
- **Review Focus:** each line has its test: line 1 in Tasks 9, 6; line 2 in Tasks 7, 8; line 3 in Task 2; line 4 in Tasks 5, 7; line 5 in Task 4.
- **Proportion:** step bodies are signatures, constants and test assertions; algorithms and strings are referenced to R1/R2 rather than copied.
