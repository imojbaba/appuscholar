import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Response } from "@playwright/test";
import { dictUrl } from "@appuscholar/core";
import { T } from "../support/dict";
import { QA_API_ORIGIN } from "../support/origins";
import { serverRows } from "../support/server";
import { routeServices, SERVICE_DOWN_CONSOLE, SERVICE_HOSTS } from "../support/services";
import {
  cancelPassphraseAsks, catchDownload, docText, forgetOnThisComputer, goOffline, goOnline, lockByReload, newStudent, providerCalls, sameAccountElsewhere, selectInDoc, setLang, slowApi, toPlace,
  OFFLINE_CONSOLE, typeInDoc, unlock, vaultRemembered, type Student
} from "../support/student";
import { expect, notChecked, test } from "../support/test";
import { RULE_LABEL } from "../support/watcher";

/**
 * The student's helpers (support/student.ts), the outside services (services.ts) and the server's rows (server.ts), on the production build with its own account for each case.
 * Every case here is a real check: a helper that does not do what it says fails its case. The one that fails on purpose to see the watcher (a second browser) sets qa.selfTest.
 */
const TAGS = { tag: ["@selftest", "@slice"] };
const RECOVERY_CODE = /^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/;
/** A sealed title or body (lib/vault's AES-GCM output: a 16-character IV, a dot, the ciphertext, base64url). */
const CIPHERTEXT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;
const PROJECT = { name: "Sleep and exam anxiety", idea: "Does a fixed bedtime routine for one week lower exam anxiety in first-year college students?" };

/** A recording of the outside services by the start of its file name (apps/web/e2e/fixtures/recorded). */
const RECORDED = path.join(__dirname, "../../e2e/fixtures/recorded");
const recording = (prefix: string) => JSON.parse(readFileSync(path.join(RECORDED, readdirSync(RECORDED).find((f) => f.startsWith(prefix))!), "utf8")) as { url: string; status: number; body: string };

const isDocPut = (r: Response) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url()) && r.ok();

test("student: a new student with the vault on; locked and unlocked; off and on the network; a slow api; a download; what the server holds", TAGS, async ({ page, context, qa }) => {
  qa.begin({
    story: "S0",
    id: "SELF-STUDENT",
    goal: "The student's helpers set up an account and move it through the vault, the network, a download and the server's rows",
    situation: { vault: "open", network: "drop", screen: "desktop", lang: "en", ai: "answers" },
    steps: ["new student", "the key reaches the fake provider", "lock and unlock", "network off and on", "slow api", "download", "what the server holds"]
  });
  const pill = page.getByTestId("vault-pill");
  let s!: Student;

  await qa.step("new student", async () => {
    s = await newStudent(page, qa, { vault: "on", project: PROJECT });
    await qa.check("data", "the vault pill reads unlocked", async () => {
      await expect(pill).toHaveText(T("vault_pill_yours"));
    }, { source: "e2e: phase3a-vault step 3" });
    await qa.check("data", "the student has a key for the fake provider, a passphrase, a recovery code as the sheet prints it, and a project", async () => {
      expect(s.key).toMatch(/^gsk_qa_ok_[0-9a-f]{12}$/);
      expect(s.passphrase).toMatch(/^qa-pass-[0-9a-f]{12}$/);
      expect(s.recoveryCode).toMatch(RECOVERY_CODE);
      expect(s.email).toMatch(/@qa\.test$/);
      expect(page.url()).toContain(`/p/${s.projectId}`);
      await expect(page.getByTestId("project-switcher")).toContainText(PROJECT.name);
    });
    await qa.check("data", "setting the key up sent nothing to the AI provider", async () => {
      expect(await providerCalls(s.key!)).toEqual([]);
    });
    await qa.check("data", "newStudent excused no answer of its own: the only allowances in play are the watcher's built-in ones", async () => {
      expect((qa.result().allowed ?? []).filter((a) => !a.builtIn)).toEqual([]);
    });
  });

  await qa.step("the key reaches the fake provider", async () => {
    await toPlace(page, s.projectId!, "idea");
    await qa.check("data", "the Idea place opened without a page load: the vault is still unlocked", async () => {
      expect(page.url()).toContain(`/p/${s.projectId}/idea`);
      await expect(pill).toHaveText(T("vault_pill_yours"));
    });
    // The Idea place stores the read as the project's idea_intake a moment after it shows; a reload before that asks "Leave site?".
    const stored = page.waitForResponse((r) => r.request().method() === "PUT" && /\/projects\/[0-9a-f-]+\/blobs\/idea_intake$/.test(r.url()) && r.ok(), { timeout: 20_000 });
    await page.getByTestId("idea-check").click();
    await expect(page.getByTestId("idea-read")).toBeVisible();
    await stored;
    await qa.check("data", "the provider received one request with the student's key, as Groq, and answered it", async () => {
      const calls = await providerCalls(s.key!);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ key: s.key, mode: "ok", host: "api.groq.com", outcome: "answered" });
      expect(calls[0]!.prompt).toContain(PROJECT.idea);
    });
  });

  await qa.step("lock and unlock", async () => {
    const cancelled = await lockByReload(page, s);
    await qa.check("data", "after a reload the pill reads locked, and lockByReload counted the windows it cancelled (the Idea place opens at least one)", async () => {
      await expect(pill).toHaveText(T("vault_pill_locked"));
      await expect(page.getByTestId("pass-dialog")).toBeHidden();
      expect(cancelled).toBeGreaterThanOrEqual(1);
    }, { source: "e2e: phase3a-vault step 4c" });
    await unlock(page, s);
    await qa.check("data", "after unlock the pill reads unlocked", async () => {
      await expect(pill).toHaveText(T("vault_pill_yours"));
    });
  });

  await qa.step("network off and on", async () => {
    qa.allow({ consoleErrors: [OFFLINE_CONSOLE] });
    await goOffline(context);
    await qa.check("data", "the browser knows it is offline", async () => {
      expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    });
    // Coming back online makes the app read the vault record again (lib/vault/useVault.tsx).
    const reread = page.waitForResponse((r) => r.request().method() === "GET" && r.url() === `${QA_API_ORIGIN}/me/vault`, { timeout: 15_000 });
    await goOnline(context);
    await reread;
    // F2 was the pill leaving "unlocked" a moment after the network came back.
    await page.waitForTimeout(1_000);
    await qa.check("data", "the browser knows it is online again, and the pill is still unlocked", async () => {
      expect(await page.evaluate(() => navigator.onLine)).toBe(true);
      await expect(pill).toHaveText(T("vault_pill_yours"));
    });
  });

  await qa.step("slow api", async () => {
    const undo = await slowApi(context, 3_000);
    const started = Date.now();
    await page.reload();
    // The pill is not drawn until the api has answered GET /me/vault.
    await expect(pill).toBeVisible();
    const took = Date.now() - started;
    await undo();
    await qa.check("data", "a reload takes at least 3 s while the api waits 3 s for every request", async () => {
      expect(took).toBeGreaterThanOrEqual(3_000);
    });
    await unlock(page, s);
  });

  await qa.step("download", async () => {
    await page.getByTestId("help-btn").click();
    const file = await catchDownload(page, () => page.getByTestId("help-export").click());
    const files = await file.zip();
    await qa.check("data", "Help, Export all my work gives a zip named for the day, with index.json", async () => {
      expect(file.name).toMatch(/^appuscholar-export-\d{4}-\d{2}-\d{2}\.zip$/);
      expect(file.bytes.length).toBeGreaterThan(0);
      expect([...files.keys()]).toContain("index.json");
    }, { source: "e2e: phase3a-vault step 8" });
    await qa.check("data", "index.json names the project, opened from its sealed title", async () => {
      const index = JSON.parse(files.get("index.json")!.toString("utf8")) as { projects: Array<{ title: string }> };
      expect(index.projects.map((p) => p.title)).toContain(PROJECT.name);
    });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-dialog")).toBeHidden();
  });

  await qa.step("what the server holds", async () => {
    const rows = await serverRows(s.uid);
    await qa.check("data", "the project's title is not plaintext on the server", async () => {
      if (rows.titles.length === 0) notChecked("the account has no titles on the server, so there was nothing to read");
      expect(rows.titles.filter((t) => t.includes(PROJECT.name))).toEqual([]);
      expect(rows.titles.some((t) => CIPHERTEXT.test(t))).toBe(true);
    }, { source: "e2e: phase3a-vault step 3" });
    await qa.check("data", "no blob holds the idea in clear, and the idea's own blob is there sealed", async () => {
      if (rows.blobs.length === 0) notChecked("the account has no blobs on the server, so there was nothing to read");
      expect(rows.blobs.filter((b) => b.body.includes("bedtime"))).toEqual([]);
      expect(rows.blobs.find((b) => b.kind === "idea_intake")?.body).toMatch(CIPHERTEXT);
    });
    await qa.check("data", "the rows of the account are counted: its row, its vault, its projects, and the AI use the provider answered", async () => {
      expect(rows.userRows).toMatchObject({ users: 1, vault_keys: 1, ai_use_log: 1 });
      expect(rows.userRows["projects"]).toBeGreaterThanOrEqual(1);
      expect(rows.userRows["documents"]).toBeGreaterThanOrEqual(1);
      expect(rows.userRows["project_blobs"]).toBeGreaterThanOrEqual(1);
    });
  });
});

test("student: remembered on this computer, then forgotten", TAGS, async ({ page, qa }) => {
  qa.begin({
    story: "S0",
    id: "SELF-STUDENT-REMEMBER",
    goal: "Remember on this computer opens the vault after a reload, and Forget on this computer ends it",
    situation: { vault: "forgotten" },
    steps: ["new student", "remember", "forget"]
  });
  const pill = page.getByTestId("vault-pill");
  let s!: Student;

  await qa.step("new student", async () => {
    s = await newStudent(page, qa, { key: "none", vault: "on", project: false });
    await qa.check("data", "a new vault is not remembered on this computer (Remember was not ticked)", async () => {
      expect(await vaultRemembered(page, s.uid)).toBe(false);
    });
  });

  await qa.step("remember", async () => {
    const cancelled = await lockByReload(page, s);
    await qa.check("data", "first run does not ask for the passphrase, so lockByReload cancels nothing", async () => {
      expect(cancelled).toBe(0);
    });
    await unlock(page, s, { remember: true });
    await qa.check("data", "the vault is remembered, and a reload opens it without the passphrase", async () => {
      expect(await vaultRemembered(page, s.uid)).toBe(true);
      await page.reload();
      await expect(pill).toHaveAttribute("data-status", "unlocked");
      await expect(page.getByTestId("pass-dialog")).toBeHidden();
    }, { source: "plan S10-03" });
  });

  await qa.step("forget", async () => {
    await forgetOnThisComputer(page);
    await qa.check("data", "after Forget on this computer nothing is remembered, and a reload leaves the vault locked", async () => {
      expect(await vaultRemembered(page, s.uid)).toBe(false);
    });
    await lockByReload(page, s);
    await qa.check("data", "the pill reads locked", async () => {
      await expect(pill).toHaveText(T("vault_pill_locked"));
    });
  });
});

test("student: the language, the places and the document", TAGS, async ({ page, qa }) => {
  qa.begin({
    story: "S0",
    id: "SELF-STUDENT-DOC",
    goal: "A student with no key and no vault switches the language, moves between places and writes in the document",
    situation: { vault: "off", lang: "en" },
    steps: ["new student", "language", "places", "document"]
  });
  const pill = page.getByTestId("vault-pill");
  let s!: Student;

  await qa.step("new student", async () => {
    s = await newStudent(page, qa, { key: "none", project: PROJECT });
    await qa.check("data", "a student with no key and no vault has neither, and the pill reads off", async () => {
      expect(s).toEqual({ uid: expect.any(String), email: expect.stringMatching(/@qa\.test$/), projectId: expect.any(String) });
      await expect(pill).toHaveText(T("vault_pill_off"));
    });
  });

  await qa.step("language", async () => {
    await setLang(page, "hi");
    await qa.check("data", "the page is in Hindi, and the pill says so in Hindi", async () => {
      await expect(page.locator("html")).toHaveAttribute("lang", "hi");
      await expect(pill).toHaveText(T("vault_pill_off", {}, "hi"));
    });
    await qa.check("data", "the language was saved: it is still Hindi after a reload", async () => {
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", "hi");
      await expect(pill).toHaveText(T("vault_pill_off", {}, "hi"));
    });
    await setLang(page, "en");
    await setLang(page, "en");
    await qa.check("data", "asking for the language the page is in changes nothing", async () => {
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(pill).toHaveText(T("vault_pill_off"));
    });
  });

  await qa.step("places", async () => {
    await toPlace(page, s.projectId!, "literature", "citations");
    await qa.check("data", "Literature opens on its Citations tab", async () => {
      expect(page.url()).toContain(`/p/${s.projectId}/lit/citations`);
      await expect(page.getByTestId("place-name")).toHaveText(T("stage_name_lit"));
    });
    await toPlace(page, s.projectId!, "writing");
    await qa.check("data", "from a place, the next place opens by way of the home", async () => {
      expect(page.url()).toContain(`/p/${s.projectId}/writing`);
      await expect(page.locator(".ProseMirror")).toBeVisible();
    });
    await toPlace(page, s.projectId!, "collect", "data");
    await qa.check("data", "Collection and analysis opens on its Statistics tab (the place's first)", async () => {
      expect(page.url()).toContain(`/p/${s.projectId}/collect`);
      await expect(page.getByTestId("place-tab-data")).toHaveAttribute("aria-current", "true");
    });
    // From outside the project the place is loaded by its address.
    await page.goto("/projects");
    await toPlace(page, s.projectId!, "idea");
    await qa.check("data", "from the project list, the Idea place opens", async () => {
      expect(page.url()).toContain(`/p/${s.projectId}/idea`);
    });
  });

  await qa.step("document", async () => {
    await toPlace(page, s.projectId!, "writing");
    const editor = page.locator(".ProseMirror");
    await expect(editor).toBeVisible();
    await typeInDoc(page, "First sentence.");
    await typeInDoc(page, " Second sentence.");
    await typeInDoc(page, "\nThird line.");
    await qa.check("data", "typing at the end appends to the document, and Enter starts a new paragraph", async () => {
      expect(await docText(page)).toContain("First sentence. Second sentence.");
      await expect(editor.locator("p")).toHaveCount(2);
      expect((await docText(page)).trim().split(/\n+/)).toEqual(["First sentence. Second sentence.", "Third line."]);
    });
    await selectInDoc(page, "Second");
    await qa.check("data", "selectInDoc selects the text, as a drag would", async () => {
      expect(await page.evaluate(() => window.getSelection()!.toString())).toBe("Second");
    });
    // The save that carries the finished text (an earlier one may go out mid-typing, after the debounce).
    const saved = page.waitForResponse((r) => isDocPut(r) && (r.request().postData() ?? "").includes("2nd sentence."), { timeout: 30_000 });
    await typeInDoc(page, "2nd", { at: "cursor" });
    await qa.check("data", "typing at the cursor replaces the selection", async () => {
      const text = await docText(page);
      expect(text).toContain("First sentence. 2nd sentence.");
      expect(text).not.toContain("Second");
    });
    await qa.check("data", "selecting text the document does not hold says so", async () => {
      await expect(selectInDoc(page, "no such sentence in this document")).rejects.toThrow(/does not contain "no such sentence in this document"/);
    });
    await saved;
  });
});

test("student: a second browser on the same account is watched, and asks for the passphrase", TAGS, async ({ page, browser, qa }) => {
  // The case makes an error in the second browser on purpose, to see that the watcher sees it there.
  qa.selfTest = true;
  qa.begin({
    story: "S0",
    id: "SELF-STUDENT-ELSEWHERE",
    goal: "The same account in a fresh browser meets the locked vault, and the watcher listens to that browser too",
    situation: { vault: "locked" },
    steps: ["new student", "open the second browser", "the second browser"]
  });
  qa.allow({ hosts: SERVICE_HOSTS });
  let s!: Student;

  await qa.step("new student", async () => {
    s = await newStudent(page, qa, { key: "none", vault: "on", project: false });
  });

  const other = await qa.step("open the second browser", () => sameAccountElsewhere(browser, page, qa));
  try {
    await qa.step("the second browser", async () => {
      await other.page.goto("/");
      const pill = other.page.getByTestId("vault-pill");
      await expect(pill).toHaveText(T("vault_pill_locked"));
      await expect(page.getByTestId("vault-pill"), "the first browser keeps its vault open").toHaveText(T("vault_pill_yours"));
      await unlock(other.page, s);
      await expect(pill).toHaveText(T("vault_pill_yours"));
      // The second browser cannot reach a real service: its outside requests are routed as the first browser's would be.
      const rec = recording("oa-retractions-quiet");
      expect(await other.page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, body: await r.text() }; }, rec.url)).toEqual({ status: rec.status, body: rec.body });
      expect(other.services?.asked).toEqual([rec.url]);
      expect(other.services?.refused).toEqual([]);
      expect(qa.result().checks.filter((c) => c.kind === "watcher")).toEqual([]);
      await other.page.evaluate(() => console.error("QA probe: an error in the second browser"));
      await expect.poll(() => qa.result().checks.filter((c) => c.kind === "watcher" && c.label === RULE_LABEL.console && /QA probe/.test(c.message ?? "")).length).toBe(1);
    }, { page: other.page });
  } finally {
    await other.context.close();
  }
});

test("student: routeServices answers from recordings, refuses what nobody recorded, fails the services it is told to, and leaves the api alone", TAGS, async ({ page, context, qa }) => {
  qa.begin({
    story: "S0",
    id: "SELF-SERVICES",
    goal: "The outside services are answered from recordings under the production content-security-policy",
    situation: { network: "fine" },
    steps: ["recorded answers", "a request nobody recorded", "a service that is down", "the api is left alone"]
  });
  qa.allow({ hosts: SERVICE_HOSTS });
  const golden = (JSON.parse(readFileSync(path.join(__dirname, "../../../../packages/core/test/golden/words/cases.json"), "utf8")) as { dict: { fetch: Array<{ word: string; status: number; payload: unknown }> } }).dict.fetch;

  // An unsigned-in page of the app, so that the production policy (connect-src) is the one the services are asked under.
  await page.goto("/signin");
  type Got = { status: number; body: string } | { failed: string };
  const get = (url: string): Promise<Got> =>
    page.evaluate(async (u) => {
      try {
        const r = await fetch(u);
        return { status: r.status, body: await r.text() };
      } catch (e) {
        return { failed: String(e) };
      }
    }, url);

  const { asked, refused } = await routeServices(context);

  const oa = recording("oa-retractions-quiet");
  await qa.step("recorded answers", async () => {
    const cr = recording("cr-doi-mu");
    await qa.check("data", "OpenAlex and Crossref are answered with the recordings", async () => {
      expect(await get(oa.url)).toEqual({ status: oa.status, body: oa.body });
      expect(await get(cr.url)).toEqual({ status: cr.status, body: cr.body });
    }, { source: "e2e: stage2-idea-literature" });
    // The dictionary's own answer for a word it does not have (the Words golden's "zzyzx"); a lookup of an unknown word allows it the same way.
    qa.allow({ responses: [{ method: "GET", path: /^\/api\/v2\/entries\/en\/zzyzx$/, status: 404, reason: "dictionaryapi.dev answers 404 for a word it has no entry for; the Words golden recorded it for zzyzx" }] });
    await qa.check("data", "the dictionary is answered from the Words golden, 404 included", async () => {
      for (const word of ["study", "zzyzx"]) {
        const c = golden.find((x) => x.word === word)!;
        expect(await get(dictUrl(word))).toEqual({ status: c.status, body: JSON.stringify(c.payload) });
      }
    });
    await qa.check("data", "what was asked is listed, and nothing was refused", async () => {
      expect(asked).toEqual([oa.url, cr.url, dictUrl("study"), dictUrl("zzyzx")]);
      expect(refused).toEqual([]);
    });
  });

  await qa.step("a request nobody recorded", async () => {
    const url = "https://api.openalex.org/works?search=qa-nobody-recorded-this";
    await qa.check("data", "it is answered 599 so that the app shows an error, and listed as refused", async () => {
      expect(await get(url)).toEqual({ status: 599, body: "not recorded" });
      expect(refused).toEqual([url]);
      expect(asked.at(-1)).toBe(url);
    });
  });

  // The second router, made in the next step, takes over from the first (Playwright runs the latest route first): from then on `down` is the one that sees requests.
  let down!: Awaited<ReturnType<typeof routeServices>>;

  await qa.step("a service that is down", async () => {
    qa.allow({ consoleErrors: [SERVICE_DOWN_CONSOLE] });
    down = await routeServices(context, { fail: ["pubmed"] });
    const url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=qa";
    await qa.check("data", "the page's request to it fails, as when a service is down, and the other services still answer", async () => {
      const got = await get(url);
      expect("failed" in got).toBe(true);
      expect(await get(oa.url)).toEqual({ status: oa.status, body: oa.body });
      expect(down.asked).toEqual([url, oa.url]);
      expect(down.refused).toEqual([]);
    });
    await qa.check("data", "the browser's console error for it is the one the case allows, once", async () => {
      await expect.poll(() => (qa.result().allowed ?? []).find((a) => a.kind === "console")?.count).toBe(1);
    });
  });

  await qa.step("the api is left alone", async () => {
    await qa.check("data", "a request to the api and one to the web app never reach the router, and one to a service does", async () => {
      const before = down.asked.length;
      // no-cors: the answer is opaque, but it is the api's (a router answer would have been the same, so what is checked is that the router never saw it).
      await page.evaluate(async (api) => { await fetch(`${api}/health`, { mode: "no-cors" }); await fetch("/api/auth/providers"); }, QA_API_ORIGIN);
      expect(down.asked.length).toBe(before);
      // The same router does see an outside request, so the count above could have changed.
      expect(await get(oa.url)).toEqual({ status: oa.status, body: oa.body });
      expect(down.asked).toHaveLength(before + 1);
      expect(down.asked.at(-1)).toBe(oa.url);
    });
  });
});

test("student: on a phone in Hindi, a new student moves between places and back to English", { tag: ["@selftest", "@slice", "@phone"] }, async ({ page, browser, qa }) => {
  qa.begin({
    story: "S0",
    id: "SELF-STUDENT-PHONE",
    goal: "The helpers work through the phone's Menu and the phone's places, in Hindi",
    situation: { screen: "phone", lang: "hi" },
    steps: ["new student in Hindi", "places", "back to English", "open a second phone", "the second phone"]
  });
  let s!: Student;

  await qa.step("new student in Hindi", async () => {
    s = await newStudent(page, qa, { key: "none", lang: "hi", project: PROJECT });
    await qa.check("data", "the page is in Hindi, and the vault pill says so", async () => {
      await expect(page.locator("html")).toHaveAttribute("lang", "hi");
      await expect(page.getByTestId("vault-pill")).toHaveText(T("vault_pill_off", {}, "hi"));
    });
  });

  await qa.step("places", async () => {
    await toPlace(page, s.projectId!, "collect", "data");
    await qa.check("data", "Collection and analysis opens on its Statistics tab, named in Hindi", async () => {
      await expect(page.getByTestId("place-name")).toHaveText(T("stage_name_collect", {}, "hi"));
      await expect(page.getByTestId("place-tab-data")).toHaveAttribute("aria-current", "true");
    });
  });

  await qa.step("back to English", async () => {
    await setLang(page, "en");
    await qa.check("data", "the phone's Menu switched the language back", async () => {
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.getByTestId("place-name")).toHaveText(T("stage_name_collect"));
    });
  });

  // The same account on a second browser is a phone too: the window, the touch screen and the phone's header (its Menu holds the language, and the desktop's button is not shown).
  const other = await qa.step("open a second phone", () => sameAccountElsewhere(browser, page, qa));
  try {
    await qa.step("the second phone", async () => {
      await other.page.goto("/");
      await qa.check("data", "the second browser is 375 px wide, has a touch screen, and shows the phone's header", async () => {
        await expect(other.page.getByTestId("project-home")).toBeVisible();
        expect(await other.page.evaluate(() => ({ width: window.innerWidth, touch: navigator.maxTouchPoints > 0 }))).toEqual({ width: 375, touch: true });
        await expect(other.page.getByTestId("phone-menu")).toBeVisible();
        await expect(other.page.getByTestId("lang-toggle")).toBeHidden();
      });
      await qa.check("data", "its outside services are routed too", async () => {
        expect(other.services).toEqual({ asked: [], refused: [] });
      });
    }, { page: other.page });
  } finally {
    await other.context.close();
  }
});

test("student: lockByReload says at once when the page asks 'Leave site?', and counts what it cancels", TAGS, async ({ page, qa }) => {
  qa.begin({
    story: "S0",
    id: "SELF-STUDENT-LEAVE",
    goal: "A reload the page answers with 'Leave site?' fails the helper at once, naming it, and the helper works again once the page lets go",
    situation: { vault: "locked" },
    steps: ["new student", "leave site", "lock"]
  });
  let s!: Student;

  await qa.step("new student", async () => {
    s = await newStudent(page, qa, { key: "none", vault: "on", project: false });
  });

  await qa.step("leave site", async () => {
    // The page holds changes it has not saved: the watcher dismisses the dialog (announced, so it is not a finding), and the reload would never finish.
    qa.expectDialog("beforeunload", false);
    await page.evaluate(() => { window.onbeforeunload = (e) => { e.preventDefault(); return ""; }; });
    const started = Date.now();
    await qa.check("data", "lockByReload fails within seconds, and names the beforeunload dialog", async () => {
      await expect(lockByReload(page, s)).rejects.toThrow(/beforeunload.*not saved yet/s);
      expect(Date.now() - started).toBeLessThan(10_000);
    });
    await page.evaluate(() => { window.onbeforeunload = null; });
  });

  await qa.step("lock", async () => {
    const cancelled = await lockByReload(page, s);
    await qa.check("data", "once the page lets go the vault is locked by the reload, and a page that does not ask costs no Cancel", async () => {
      await expect(page.getByTestId("vault-pill")).toHaveAttribute("data-status", "locked");
      expect(cancelled).toBe(0);
    });
  });
});

test("student: cancelPassphraseAsks counts the Cancels that went through, and stops at its caps when the page never goes quiet or Cancel cannot be pressed", TAGS, async ({ page, qa }) => {
  qa.begin({
    story: "S0",
    id: "SELF-STUDENT-CANCEL",
    goal: "The Cancel loop of lockByReload ends: quiet page, a page that asks once, a page that asks for ever, and a Cancel that cannot be pressed",
    situation: { vault: "locked" },
    steps: ["quiet", "asks once", "asks for ever", "cannot press"]
  });
  const dialog = (cancel: string) => `<div id="d" data-testid="pass-dialog">Passphrase</div><button data-testid="pass-cancel" ${cancel}>Cancel</button>`;

  await qa.step("quiet", async () => {
    await page.setContent("<p>nothing asks</p>");
    await qa.check("data", "a page that does not ask costs no Cancel", async () => {
      expect(await cancelPassphraseAsks(page, { firstWaitMs: 200 })).toBe(0);
    });
  });

  await qa.step("asks once", async () => {
    await page.setContent(dialog(`onclick="document.getElementById('d').hidden = true"`));
    await qa.check("data", "a window that closes on Cancel is counted once", async () => {
      expect(await cancelPassphraseAsks(page)).toBe(1);
    });
  });

  await qa.step("asks for ever", async () => {
    await page.setContent(dialog(`onclick="const d = document.getElementById('d'); d.hidden = true; setTimeout(() => (d.hidden = false), 30)"`));
    await qa.check("data", "a page that asks again after every Cancel stops at ten, and says so", async () => {
      await expect(cancelPassphraseAsks(page)).rejects.toThrow(/again after each of ten cancels/);
    });
  });

  await qa.step("cannot press", async () => {
    await page.setContent(dialog("disabled"));
    const started = Date.now();
    await qa.check("data", "a Cancel that cannot be pressed stops at the attempt cap with a message that says so, not at the test timeout", async () => {
      await expect(cancelPassphraseAsks(page, { attempts: 3, clickMs: 100 })).rejects.toThrow(/still open after 3 attempts to press Cancel \(0 went through\)/);
      expect(Date.now() - started).toBeLessThan(10_000);
    });
    // The default is twenty presses.
    await qa.check("data", "the default cap is twenty attempts", async () => {
      await expect(cancelPassphraseAsks(page, { clickMs: 20 })).rejects.toThrow(/after 20 attempts/);
    });
  });
});
