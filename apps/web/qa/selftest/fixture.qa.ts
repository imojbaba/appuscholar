import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { QA_API_ORIGIN, QA_PROVIDER_LOG, QA_WEB_ORIGIN } from "../support/origins";
import type { CaseMeta, CaseResult, CheckResult } from "../support/qa";
import { expect, notChecked, test } from "../support/test";
import { RULE_LABEL } from "../support/watcher";

/**
 * The `qa` fixture itself, on throwaway pages (`page.setContent`, or routed pages on a port nothing listens on): no app is needed.
 * A test that sets `qa.selfTest = true` gets no teardown throw, and reads the case's result back to assert on it. The few tests that leave it off
 * (or use `test.fail()`) pin what the teardown does: which failed checks turn the case red.
 */
const TAGS = { tag: ["@selftest", "@slice"] };
const meta = (id: string, steps: string[]): CaseMeta => ({ story: "S0", id, goal: "Check the fixture", situation: {}, steps });
/** A page nothing listens on, for pages that need a real address (a navigation, a response header, a status). Every request to it is answered by a route. */
const NOWHERE = "http://localhost:1";
const CORS = { "access-control-allow-origin": "*" };

const watcherFindings = (r: CaseResult): CheckResult[] => r.checks.filter((c) => c.kind === "watcher");
const withLabel = (r: CaseResult, label: string): CheckResult[] => r.checks.filter((c) => c.label === label);

test("fixture: a failing check is recorded with its kind, and the next step still runs", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-01", ["first", "second"]));
  await page.setContent("<p id=n>41</p>");
  await qa.step("first", async () => {
    const data = await qa.check("data", "the number is 42", async () => expect(await page.locator("#n").textContent()).toBe("42"), { source: "selftest" });
    expect(data).toBe(false);
    const visual = await qa.check("visual", "the number is big", async () => expect(await page.locator("#n").evaluate((e) => getComputedStyle(e).fontSize)).toBe("99px"));
    expect(visual).toBe(false);
    const concept = await qa.check("conceptual", "the number is honest", async () => {
      throw new Error("it is not");
    });
    expect(concept).toBe(false);
    expect(await qa.check("data", "the number is 41", async () => expect(await page.locator("#n").textContent()).toBe("41"))).toBe(true);
  });
  let secondRan = false;
  await qa.step("second", async () => {
    secondRan = true;
  });
  expect(secondRan).toBe(true);

  const r = qa.result();
  expect(r.reached).toEqual(["first", "second"]);
  expect(r.stoppedAt).toBeUndefined();
  expect(r.checks).toHaveLength(4);
  expect(r.checks[0]).toMatchObject({ kind: "data", label: "the number is 42", ok: false, fail: "unexpected", source: "selftest", step: "first" });
  expect(r.checks[0]!.message).toContain("42");
  expect(r.checks[0]!.message).toContain("41");
  expect(r.checks[1]).toMatchObject({ kind: "visual", ok: false, fail: "ui" });
  expect(r.checks[2]).toMatchObject({ kind: "conceptual", ok: false, fail: "unexpected", message: "it is not" });
  expect(r.checks[3]).toMatchObject({ kind: "data", ok: true });
  expect(r.checks[3]!.fail).toBeUndefined();
  // A failed check leaves a screenshot of the page as the student saw it.
  expect(existsSync(r.checks[0]!.screenshot!)).toBe(true);
  expect(r.checks[3]!.screenshot).toBeUndefined();
  expect(r.meta.id).toBe("SELF-01");
  expect(r.durationMs).toBeGreaterThan(0);
});

test("fixture: a check that measured nothing is NOT CHECKED, not a pass", TAGS, async ({ qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-02", ["only"]));
  const done = await qa.check("data", "the version", async () => notChecked("GITHUB_SHA is not set"));
  expect(done).toBe(false);
  const [c] = qa.result().checks;
  expect(c).toMatchObject({ kind: "data", label: "the version", ok: null, message: "GITHUB_SHA is not set" });
  expect(c!.fail).toBeUndefined();
});

test("fixture: a step that throws ends the case there, and says where", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-03", ["open", "press", "read"]));
  await page.setContent("<h1>Where it stopped</h1>");
  await qa.step("open", async () => {});
  await expect(
    qa.step("press", async () => {
      throw new Error("the Run button was not there");
    })
  ).rejects.toThrow("the Run button was not there");

  const r = qa.result();
  expect(r.stoppedAt).toMatchObject({ step: "press", url: page.url(), reason: "the Run button was not there" });
  expect(existsSync(r.stoppedAt!.screenshot)).toBe(true);
  expect(statSync(r.stoppedAt!.screenshot).size).toBeGreaterThan(0);
  // The step that threw was reached; the one after it was not.
  expect(r.reached).toEqual(["open", "press"]);
  expect(r.meta.steps.filter((s) => !r.reached.includes(s))).toEqual(["read"]);
  // The stop is a failure of the case (an Error), not only a note: the marks are worked out from the checks.
  const failed = r.checks.filter((c) => c.ok === false);
  expect(failed).toHaveLength(1);
  expect(failed[0]).toMatchObject({ kind: "watcher", fail: "error", step: "press" });
  expect(failed[0]!.message).toContain("the Run button was not there");
  expect(r.blocked).toBeUndefined();
});

test("fixture: only the step that threw is recorded as the stop, however deep it was", TAGS, async ({ qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-04", ["outer", "inner"]));
  await expect(
    qa.step("outer", async () => {
      await qa.step("inner", async () => {
        throw new Error("deep");
      });
    })
  ).rejects.toThrow("deep");
  const r = qa.result();
  expect(r.stoppedAt?.step).toBe("inner");
  expect(r.reached).toEqual(["outer", "inner"]);
  expect(r.checks.filter((c) => c.ok === false)).toHaveLength(1);
});

test("fixture: a step must be one the case announced, and a case begins once", TAGS, async ({ qa }) => {
  qa.selfTest = true;
  await expect(qa.step("early", async () => {})).rejects.toThrow(/begin/);
  qa.begin(meta("SELF-05", ["known"]));
  expect(() => qa.begin(meta("SELF-05", ["known"]))).toThrow(/once/);
  await expect(qa.step("not announced", async () => {})).rejects.toThrow(/not announced.*meta\.steps/s);
  expect(qa.result().reached).toEqual([]);
});

test("fixture: a step returns what its function returns", TAGS, async ({ qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-06", ["count"]));
  expect(await qa.step("count", async () => 7)).toBe(7);
});

test("fixture: a script error in the page is a watcher finding of kind error, in any tab", TAGS, async ({ page, context, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-07", ["load"]));
  await qa.step("load", async () => {
    await page.setContent("<p>hello</p><script>throw new Error('boom from the page')</script>");
  });
  const second = await context.newPage();
  await second.setContent("<script>throw new Error('boom in a second tab')</script>");
  const found = withLabel(qa.result(), RULE_LABEL.pageerror);
  expect(found).toHaveLength(2);
  expect(found[0]).toMatchObject({ kind: "watcher", ok: false, fail: "error" });
  expect(found.map((c) => c.message).join("\n")).toContain("boom from the page");
  expect(found.map((c) => c.message).join("\n")).toContain("boom in a second tab");
  expect(found[0]!.step).toBe("load");
});

test("fixture: a request to another host is a finding that names the host, and not the query", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-08", ["ask"]));
  await page.route("https://example.org/**", (route) => route.fulfill({ status: 200, headers: CORS, body: "{}" }));
  await page.setContent("<p>x</p>");
  await qa.step("ask", async () => {
    await page.evaluate(() => fetch("https://example.org/data?token=secret-value").then(() => 0));
  });
  const found = withLabel(qa.result(), RULE_LABEL.host);
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ kind: "watcher", ok: false, fail: "error", step: "ask" });
  expect(found[0]!.message).toContain("example.org");
  expect(found[0]!.message).not.toContain("secret-value");
  expect(watcherFindings(qa.result())).toHaveLength(1);
});

test("fixture: localhost and the hosts a case allows are not findings", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-09", ["ask"]));
  qa.allow({ hosts: ["example.org"] });
  await page.route("https://example.org/**", (route) => route.fulfill({ status: 200, headers: CORS, body: "{}" }));
  await page.route(`${NOWHERE}/**`, (route) => route.fulfill({ status: 200, headers: CORS, body: "{}" }));
  await page.setContent("<p>x</p>");
  await page.evaluate(() => fetch("https://example.org/data").then(() => 0));
  await page.evaluate((u) => fetch(u + "/data").then(() => 0), NOWHERE);
  await page.evaluate(() => fetch("data:text/plain,hello").then((r) => r.text()));
  expect(watcherFindings(qa.result())).toEqual([]);
});

test("fixture: an unannounced confirm is a finding and is dismissed; an announced one is not, and is answered as announced", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-10", ["ask"]));
  await page.setContent("<p>x</p>");

  expect(await page.evaluate(() => confirm("Leave without saving?"))).toBe(false);
  const found = withLabel(qa.result(), RULE_LABEL.dialog);
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ kind: "watcher", ok: false, fail: "error" });
  expect(found[0]!.message).toContain("confirm");
  expect(found[0]!.message).toContain("Leave without saving?");

  qa.expectDialog("confirm", true);
  expect(await page.evaluate(() => confirm("Delete this?"))).toBe(true);
  qa.expectDialog("confirm", false);
  expect(await page.evaluate(() => confirm("Delete that?"))).toBe(false);
  expect(withLabel(qa.result(), RULE_LABEL.dialog)).toHaveLength(1);
});

test("fixture: an announced dialog is for one dialog of its type", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-11", ["ask"]));
  await page.setContent("<p>x</p>");
  qa.expectDialog("confirm", true);
  await page.evaluate(() => alert("a different kind"));
  expect(withLabel(qa.result(), RULE_LABEL.dialog)).toHaveLength(1);
  // The confirm is still announced, so this one is expected; a second one is not.
  expect(await page.evaluate(() => confirm("expected"))).toBe(true);
  await page.evaluate(() => confirm("not expected"));
  const found = withLabel(qa.result(), RULE_LABEL.dialog);
  expect(found).toHaveLength(2);
  expect(found.map((c) => c.message).join("\n")).toContain("not expected");
});

test("fixture: a console error is a finding unless the case allows it; warnings and logs are not", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-12", ["go"]));
  await page.setContent("<p>x</p>");
  await page.evaluate(() => {
    console.log("just a log");
    console.warn("just a warning");
    console.error("the save failed for real");
  });
  expect(withLabel(qa.result(), RULE_LABEL.console).map((c) => c.message)).toEqual([expect.stringContaining("the save failed for real")]);

  qa.allow({ consoleErrors: [/known noise: \d+/] });
  await page.evaluate(() => console.error("known noise: 42"));
  expect(withLabel(qa.result(), RULE_LABEL.console)).toHaveLength(1);
  await page.evaluate(() => console.error("known noise: none"));
  expect(withLabel(qa.result(), RULE_LABEL.console)).toHaveLength(2);
});

test("fixture: an answer of 500 or more from the web or the api is a finding; the browser's own echo of it is not a second one", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-13", ["ask"]));
  await page.route(`${QA_API_ORIGIN}/**`, (route) => route.fulfill({ status: 502, headers: CORS, body: "{}" }));
  await page.route(`${QA_WEB_ORIGIN}/**`, (route) => route.fulfill({ status: 503, headers: CORS, body: "{}" }));
  await page.route(`${NOWHERE}/**`, (route) => route.fulfill({ status: 503, headers: CORS, body: "{}" }));
  await page.setContent("<p>x</p>");
  await page.evaluate((u) => fetch(u + "/ai/complete", { method: "POST" }).then(() => 0), QA_API_ORIGIN);
  await page.evaluate((u) => fetch(u + "/api/token").then(() => 0), QA_WEB_ORIGIN);
  // Another address (an outside service the case faked) answering 503 is the case's own doing, not a server of ours failing.
  await page.evaluate((u) => fetch(u + "/lookup").then(() => 0), NOWHERE);
  const r = qa.result();
  const found = withLabel(r, RULE_LABEL.status);
  expect(found.map((c) => c.message)).toEqual([expect.stringMatching(/502.*POST.*\/ai\/complete/), expect.stringMatching(/503.*GET.*\/api\/token/)]);
  expect(found[0]).toMatchObject({ kind: "watcher", ok: false, fail: "error" });
  expect(watcherFindings(r)).toHaveLength(2);
});

test("fixture: a 4xx is a finding unless its status is allowed, and allowing a status allows its echo in the console too", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-14", ["ask"]));
  await page.route(`${QA_WEB_ORIGIN}/**`, (route) => route.fulfill({ status: 404, headers: CORS, body: "{}" }));
  await page.route(`${QA_API_ORIGIN}/**`, (route) => route.fulfill({ status: 401, headers: CORS, body: "{}" }));
  await page.setContent("<p>x</p>");
  await page.evaluate((u) => fetch(u + "/missing").then(() => 0), QA_WEB_ORIGIN);
  expect(withLabel(qa.result(), RULE_LABEL.status).map((c) => c.message)).toEqual([expect.stringMatching(/404.*GET.*\/missing/)]);
  expect(watcherFindings(qa.result())).toHaveLength(1);

  qa.allow({ statuses: [401] });
  await page.evaluate((u) => fetch(u + "/me").then(() => 0), QA_API_ORIGIN);
  expect(watcherFindings(qa.result())).toHaveLength(1);

  // An allowed status can be a 5xx too: a case that makes the provider fail expects the api's 502.
  await page.route(`${QA_API_ORIGIN}/ai/**`, (route) => route.fulfill({ status: 502, headers: CORS, body: "{}" }));
  qa.allow({ statuses: [502] });
  await page.evaluate((u) => fetch(u + "/ai/complete").then(() => 0), QA_API_ORIGIN);
  expect(watcherFindings(qa.result())).toHaveLength(1);
});

test("fixture: a security-policy violation is a finding, and window.__qaCsp keeps it", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-15", ["open"]));
  await page.route(`${NOWHERE}/csp`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", headers: { "content-security-policy": "script-src 'none'" }, body: "<p>x</p><script>window.ran = true</script>" })
  );
  await qa.step("open", async () => {
    await page.goto(`${NOWHERE}/csp`);
  });
  expect(await page.evaluate(() => (window as unknown as { __qaCsp: unknown[] }).__qaCsp.length)).toBe(1);
  expect(await page.evaluate(() => "ran" in window)).toBe(false);
  const r = qa.result();
  const found = withLabel(r, RULE_LABEL.csp);
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ kind: "watcher", ok: false, fail: "error", step: "open" });
  expect(found[0]!.message).toContain("script-src");
  // The console line the browser writes for the same violation is not a second finding.
  expect(watcherFindings(r)).toHaveLength(1);
});

test("fixture: a refusal of eval, which libraries probe for and catch, is not counted; the page still records it", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-15B", ["open"]));
  await page.route(`${NOWHERE}/probe`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      headers: { "content-security-policy": "script-src 'unsafe-inline'" },
      body: "<p>x</p><script>try { new Function('return 1') } catch (e) { window.refused = e.name }</script>"
    })
  );
  await qa.step("open", async () => {
    await page.goto(`${NOWHERE}/probe`);
  });
  expect(await page.evaluate(() => (window as unknown as { refused?: string }).refused)).toBe("EvalError");
  expect(await page.evaluate(() => (window as unknown as { __qaCsp: Array<{ blockedURI: string }> }).__qaCsp.map((v) => v.blockedURI))).toEqual(["eval"]);
  expect(watcherFindings(qa.result())).toEqual([]);
});

test("fixture: a page load the case did not ask for is a finding; goto, reload and setContent are asked for", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-16", ["open", "reload"]));
  await page.route(`${NOWHERE}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<p>page</p>" }));
  await qa.step("open", async () => {
    await page.goto(`${NOWHERE}/a`);
    await page.goto(`${NOWHERE}/a#section`); // the same document: no load, and nothing left over to excuse the next one
    await page.setContent("<p>second</p>");
    await page.goto(`${NOWHERE}/b`);
  });
  await qa.step("reload", async () => {
    await page.reload();
  });
  expect(withLabel(qa.result(), RULE_LABEL.reload)).toEqual([]);

  // The page reloads itself: nobody asked for it.
  await Promise.all([page.waitForEvent("load"), page.evaluate(() => void setTimeout(() => location.reload(), 0))]);
  const found = withLabel(qa.result(), RULE_LABEL.reload);
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ kind: "watcher", ok: false, fail: "error" });

  // Going back and forward are asked for as well.
  await page.goto(`${NOWHERE}/c`);
  await page.goBack();
  await page.goForward();
  expect(withLabel(qa.result(), RULE_LABEL.reload)).toHaveLength(1);
});

test("fixture: a timed action over its budget is slow, and one within it is not", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-17", ["wait"]));
  const value = await qa.timed("a slow export", 1000, async () => {
    await page.waitForTimeout(1500);
    return "done";
  }, { source: "O10" });
  expect(value).toBe("done");
  await qa.timed("a quick one", 5000, async () => {});
  const [slow, quick] = qa.result().checks;
  expect(slow).toMatchObject({ kind: "time", label: "a slow export", ok: false, fail: "slow", source: "O10" });
  expect(slow!.message).toMatch(/1,5\d\d ms.*1,000 ms/);
  expect(quick).toMatchObject({ kind: "time", label: "a quick one", ok: true });
  expect(quick!.fail).toBeUndefined();
});

test("fixture: a timed function that throws measured nothing, and the error goes on", TAGS, async ({ qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-18", ["wait"]));
  await expect(
    qa.timed("a broken export", 1000, async () => {
      throw new Error("no export button");
    })
  ).rejects.toThrow("no export button");
  const [c] = qa.result().checks;
  expect(c).toMatchObject({ kind: "time", label: "a broken export", ok: null });
  expect(c!.message).toContain("no export button");
});

test("fixture: a failing check with a known id is recorded with it, and does not fail the case", TAGS, async ({ qa }) => {
  // No selfTest here: the teardown runs as it does in a real case, and this test passes only if it does not throw.
  qa.begin(meta("SELF-19", ["go"]));
  const ok = await qa.check("data", "open answers are not called names", async () => expect("looks like names").toBe("no flag"), { source: "tools-b row 4", known: "F1" });
  expect(ok).toBe(false);
  const [c] = qa.result().checks;
  expect(c).toMatchObject({ kind: "data", ok: false, fail: "unexpected", known: "F1", source: "tools-b row 4" });
  expect(qa.result().missingKnown ?? []).toEqual([]);
});

test("fixture: the same check passing is recorded ok with its known id (the report turns it into FIXED?)", TAGS, async ({ qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-20", ["go"]));
  expect(await qa.check("data", "open answers are not called names", async () => expect("no flag").toBe("no flag"), { known: "F1" })).toBe(true);
  expect(qa.result().checks[0]).toMatchObject({ kind: "data", ok: true, known: "F1" });
});

test("fixture: a failing check awaiting a decision does not fail the case either", TAGS, async ({ qa }) => {
  qa.begin(meta("SELF-21", ["go"]));
  await qa.check("conceptual", "the statement says where the requests go", async () => expect("browser").toBe("server"), { known: "O4" });
  expect(qa.result().checks[0]).toMatchObject({ ok: false, known: "O4" });
});

test("fixture: a failing check with no known id fails the case", TAGS, async ({ qa }) => {
  test.fail();
  qa.begin(meta("SELF-22", ["go"]));
  await qa.check("data", "a plain failure", async () => expect(1).toBe(2));
});

test("fixture: a failing check whose known entry is fixed fails the case", TAGS, async ({ qa }) => {
  test.fail();
  qa.begin(meta("SELF-23", ["go"]));
  await qa.check("data", "F2 came back", async () => expect(1).toBe(2), { known: "F2" });
});

test("fixture: a failing check naming an id that known.json lacks fails the case, and the result notes the id", TAGS, async ({ qa }) => {
  test.fail();
  qa.begin(meta("SELF-24", ["go"]));
  await qa.check("data", "an unknown id", async () => expect(1).toBe(2), { known: "ZZ99" });
});

test("fixture: the result notes an id that known.json lacks, once", TAGS, async ({ qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-25", ["go"]));
  await qa.check("data", "one", async () => expect(1).toBe(2), { known: "ZZ99" });
  await qa.check("data", "two", async () => {}, { known: "ZZ99" });
  await qa.check("data", "three", async () => expect(1).toBe(2), { known: "F1" });
  const r = qa.result();
  expect(r.missingKnown).toEqual(["ZZ99"]);
  expect(r.checks.map((c) => c.known)).toEqual(["ZZ99", "ZZ99", "F1"]);
});

test("fixture: a checkpoint takes a full-page screenshot, attached and listed", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-26", ["look"]));
  await page.setContent("<h1>Home</h1><div style='height:3000px'>tall</div>");
  await qa.step("look", async () => {
    await qa.checkpoint("home screen");
  });
  const r = qa.result();
  expect(r.screenshots).toHaveLength(1);
  expect(r.screenshots[0]!.name).toBe("home screen");
  expect(path.isAbsolute(r.screenshots[0]!.path)).toBe(true);
  expect(statSync(r.screenshots[0]!.path).size).toBeGreaterThan(0);
  expect(test.info().attachments.map((a) => a.name)).toContain("checkpoint: home screen");
  // A different name each time, even for the same checkpoint name.
  await qa.checkpoint("home screen");
  const again = qa.result().screenshots;
  expect(again).toHaveLength(2);
  expect(new Set(again.map((s) => s.path)).size).toBe(2);
});

test("fixture: the AI keys of the case are listed, and a provider request nobody could answer is a finding", TAGS, async ({ qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-27", ["go"]));
  const mine = `gsk_qa_ok_${randomUUID().slice(0, 8)}`;
  const theirs = `gsk_qa_ok_${randomUUID().slice(0, 8)}`;
  const long = "Summarise the following interview transcript for the methods chapter. ".repeat(4);
  const line = (key: string, mode: string, outcome: string, prompt: string, host = "api.groq.com") => JSON.stringify({ t: Date.now(), key, mode, host, kind: null, prompt, outcome }) + "\n";
  mkdirSync(path.dirname(QA_PROVIDER_LOG), { recursive: true });
  appendFileSync(
    QA_PROVIDER_LOG,
    [
      line(mine, "ok", "answered", "an answered prompt"),
      line(mine, "ok", "unknown", long),
      line(mine, "ok", "refused", "a prompt for Gemini", "generativelanguage.googleapis.com"),
      line("<not a QA key>", "invalid", "failed", "a prompt with a real-looking key"),
      line(mine, "invalid", "failed", "a prompt with a key that is not a test key"),
      line(mine, "fail429", "failed", "a prompt that was rate limited, as the key asked"),
      line(theirs, "ok", "unknown", "someone else's prompt")
    ].join("")
  );
  qa.useKey(mine);
  qa.useKey(mine);
  const r = qa.result();
  expect(r.keys).toEqual([mine]);
  const found = withLabel(r, RULE_LABEL.provider);
  expect(found).toHaveLength(3);
  for (const c of found) expect(c).toMatchObject({ kind: "watcher", ok: false, fail: "error" });
  const text = found.map((c) => c.message).join("\n");
  expect(text).toContain("api.groq.com");
  expect(text).toContain(long.slice(0, 120));
  expect(text).not.toContain(long.slice(0, 121));
  expect(text).toContain("generativelanguage.googleapis.com");
  expect(text).toContain("a prompt for Gemini");
  expect(text).toContain("a prompt with a key that is not a test key");
  expect(text).not.toContain("answered prompt");
  expect(text).not.toContain("rate limited");
  expect(text).not.toContain("someone else");
  expect(text).not.toContain("real-looking key"); // not this case's key
  // The key itself is not written into a finding.
  expect(text).not.toContain(mine);
});

test("fixture: a provider request nobody could answer fails the case", TAGS, async ({ qa }) => {
  test.fail();
  qa.begin(meta("SELF-28", ["go"]));
  const key = `gsk_qa_ok_${randomUUID().slice(0, 8)}`;
  mkdirSync(path.dirname(QA_PROVIDER_LOG), { recursive: true });
  appendFileSync(QA_PROVIDER_LOG, JSON.stringify({ t: Date.now(), key, mode: "ok", host: "api.groq.com", kind: null, prompt: "a prompt with no recorded reply", outcome: "unknown" }) + "\n");
  qa.useKey(key);
});

test.describe("blocked", () => {
  // qa.blocked ends the case on the page that stopped it, as a skipped test (CI turns red only on a FAIL). The test body cannot run after it, so its result is
  // read in afterEach, and asserted by the second test. They share this worker (serial), and the first runs first.
  test.describe.configure({ mode: "serial" });
  const BLOCKED_TEST = "ends on the page that stopped it";
  let seen: CaseResult | undefined;
  let statusSeen: string | undefined;
  test.afterEach(async ({ qa }, testInfo) => {
    if (!testInfo.title.includes(BLOCKED_TEST)) return;
    seen = qa.result();
    statusSeen = testInfo.status;
  });

  test(`fixture: blocked: the case ${BLOCKED_TEST} and is skipped, not failed`, TAGS, async ({ page, qa }) => {
    qa.selfTest = true;
    qa.begin(meta("SELF-29", ["open", "look up", "write"]));
    await page.setContent("<h1>The dictionary is down</h1>");
    await qa.step("open", async () => {});
    await qa.step("look up", async () => {
      qa.blocked("the dictionary service refuses browsers");
    });
    throw new Error("the case went on after blocked()");
  });

  test("fixture: blocked: the result says where, and records no failure for it", TAGS, async ({ qa }) => {
    qa.selfTest = true;
    qa.begin(meta("SELF-30", ["read"]));
    expect(statusSeen).toBe("skipped");
    expect(seen).toBeDefined();
    const r = seen!;
    expect(r.blocked).toBe("the dictionary service refuses browsers");
    expect(r.stoppedAt).toMatchObject({ step: "look up", reason: "the dictionary service refuses browsers" });
    expect(existsSync(r.stoppedAt!.screenshot)).toBe(true);
    expect(r.reached).toEqual(["open", "look up"]);
    expect(r.checks.filter((c) => c.ok === false)).toEqual([]);
  });
});
