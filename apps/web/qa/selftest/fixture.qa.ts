import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Route } from "@playwright/test";
import { createShimFetch } from "../provider-shim/core.mjs";
import { QA_API_ORIGIN, QA_WEB_ORIGIN } from "../support/origins";
import type { ShimLogEntry } from "../support/providerLog";
import type { CaseMeta, CaseResult, CheckResult } from "../support/qa";
import { expect, notChecked, test } from "../support/test";
import { RULE_LABEL } from "../support/watcher";

/**
 * The `qa` fixture itself, on throwaway pages (`page.setContent`, or routed pages on a port nothing listens on): no app is needed.
 * A test that sets `qa.selfTest = true` gets no teardown throw, and reads the case's result back to assert on it. The few tests that leave it off
 * (or use `test.fail()`) pin what the teardown does: which failed checks turn the case red.
 */
const TAGS = { tag: ["@selftest", "@slice"] };
/** The tests that cannot set `qa.selfTest` (they pin what the teardown does, or need it to throw): the report reads this tag and leaves them out of the marks (ruling R21). */
const MECHANICS = { tag: ["@selftest", "@slice", "@mechanics"] };
const meta = (id: string, steps: string[]): CaseMeta => ({ story: "S0", id, goal: "Check the fixture", situation: {}, steps });
/** A page nothing listens on, for pages that need a real address (a navigation, a response header, a status). Every request to it is answered by a route. */
const NOWHERE = "http://localhost:1";
const CORS = { "access-control-allow-origin": "*" };

/** The fake provider's log for these selftests: their own, never the run's QA_PROVIDER_LOG (the other cases of the run are writing into that one). */
const providerCalls: ShimLogEntry[] = [];
test.use({ providerLog: { read: () => providerCalls } });

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
  expect(failed[0]).toMatchObject({ kind: "step", fail: "error", step: "press", label: 'step "press" did not complete' });
  expect(failed[0]!.message).toContain("the Run button was not there");
  expect(r.blocked).toBeUndefined();
  // Each step it did not reach is a NOT CHECKED, so the report reads the checks only.
  const unreached = r.checks.filter((c) => c.ok === null);
  expect(unreached).toEqual([expect.objectContaining({ kind: "step", label: "NOT CHECKED (stopped at step 2): read", step: "read", ok: null })]);
  expect(unreached[0]!.fail).toBeUndefined();
  expect(unreached[0]!.message).toContain("the Run button was not there");
});

test("fixture: a case that did not stop has no NOT CHECKED steps", TAGS, async ({ qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-03B", ["one", "two"]));
  await qa.step("one", async () => {});
  // The second step is not run, but the case did not stop: it simply ends. Nothing is invented for it.
  expect(qa.result().checks).toEqual([]);
  expect(qa.result().stoppedAt).toBeUndefined();
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

  qa.allow({ consoleErrors: [{ match: /known noise: \d+/, reason: "a library prints its retry count" }] });
  await page.evaluate(() => console.error("known noise: 42"));
  await page.evaluate(() => console.error("known noise: 43"));
  expect(withLabel(qa.result(), RULE_LABEL.console)).toHaveLength(1);
  await page.evaluate(() => console.error("known noise: none"));
  expect(withLabel(qa.result(), RULE_LABEL.console)).toHaveLength(2);
  // The allowance is in the result, with its reason and how often it excused something.
  expect(qa.result().allowed).toEqual([{ kind: "console", what: "/known noise: \\d+/", reason: "a library prints its retry count", builtIn: false, count: 2 }]);
});

test("fixture: the live-AI key is taken out before a message is cut: in a check, a console line, a dialog and a stop", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  const key = `gsk_live_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const prefix = key.slice(0, 12);
  const before = process.env.QA_LIVE_AI_KEY;
  process.env.QA_LIVE_AI_KEY = key;
  try {
    qa.begin(meta("SELF-38", ["ask", "stop"]));
    await page.setContent("<p>x</p>");
    await qa.step("ask", async () => {
      // Each text holds the key where the fixture cuts it: a check's message at 2,000 characters, a console line at 300, a dialog's text at 200. Cut first, and 14 characters of it stay.
      await qa.check("data", "the key never shows", async () => {
        throw new Error("x".repeat(1985) + ` ${key} ` + "y".repeat(50));
      });
      await page.evaluate((text) => console.error(text), "c".repeat(285) + ` ${key} and on`);
      await page.evaluate((text) => alert(text), "d".repeat(185) + ` ${key} and on`);
    });
    await expect(
      qa.step("stop", async () => {
        throw new Error("s".repeat(585) + ` ${key} and on`);
      })
    ).rejects.toThrow();
    const r = qa.result();
    const found = (label: string) => r.checks.find((c) => c.label === label)!.message!;
    for (const text of [found("the key never shows"), found(RULE_LABEL.console), found(RULE_LABEL.dialog), r.stoppedAt!.reason]) {
      expect(text).toContain("[redacted]");
      expect(text).not.toContain(prefix);
    }
    // Nowhere in the result, whole or as a prefix.
    const everything = JSON.stringify(r);
    expect(everything).not.toContain(key);
    expect(everything).not.toContain(prefix);
  } finally {
    if (before === undefined) delete process.env.QA_LIVE_AI_KEY;
    else process.env.QA_LIVE_AI_KEY = before;
  }
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

test("fixture: an expected answer is allowed by method, path and status with a reason, never by a bare status", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-14", ["ask"]));
  const answer = (status: number) => (route: Route) => route.fulfill({ status, headers: CORS, body: "{}" });
  await page.route(`${QA_WEB_ORIGIN}/**`, answer(404));
  await page.route(`${QA_API_ORIGIN}/**`, answer(502));
  await page.setContent("<p>x</p>");
  const ask = (origin: string, pathname: string, method = "GET") => page.evaluate(([o, p, m]) => fetch(o + p, { method: m }).then(() => 0), [origin, pathname, method] as const);

  // Before any allowance: a 4xx and a 5xx are findings, the browser's console line for each is not a second one.
  await ask(QA_WEB_ORIGIN, "/missing");
  await ask(QA_API_ORIGIN, "/ai/complete", "POST");
  expect(withLabel(qa.result(), RULE_LABEL.status).map((c) => c.message)).toEqual([expect.stringMatching(/404.*GET.*\/missing/), expect.stringMatching(/502.*POST.*\/ai\/complete/)]);
  expect(watcherFindings(qa.result())).toHaveLength(2);

  qa.allow({ responses: [{ method: "post", path: /^\/ai\/complete$/, status: 502, reason: "the provider fails on purpose in this case" }] });
  await ask(QA_API_ORIGIN, "/ai/complete", "POST"); // allowed: same method (any letter case), path and status
  expect(watcherFindings(qa.result())).toHaveLength(2);
  await ask(QA_API_ORIGIN, "/ai/complete", "GET"); // another method
  await ask(QA_API_ORIGIN, "/ai/test", "POST"); // another path
  await ask(QA_API_ORIGIN, "/ai/complete/extra", "POST"); // the pattern is anchored: another path
  expect(withLabel(qa.result(), RULE_LABEL.status).map((c) => c.message)).toEqual([
    expect.stringMatching(/404.*GET.*\/missing/),
    expect.stringMatching(/502.*POST.*\/ai\/complete$/),
    expect.stringMatching(/502.*GET.*\/ai\/complete$/),
    expect.stringMatching(/502.*POST.*\/ai\/test$/),
    expect.stringMatching(/502.*POST.*\/ai\/complete\/extra$/)
  ]);
  // The same method and path with another status is a finding as well.
  await page.route(`${QA_API_ORIGIN}/ai/complete`, answer(500));
  await ask(QA_API_ORIGIN, "/ai/complete", "POST");
  expect(withLabel(qa.result(), RULE_LABEL.status)).toHaveLength(6);
  expect(watcherFindings(qa.result())).toHaveLength(6);

  // The result says what was excused, why, and how often.
  expect(qa.result().allowed).toEqual([{ kind: "response", what: "POST /^\\/ai\\/complete$/ answered 502", reason: "the provider fails on purpose in this case", builtIn: false, count: 1 }]);
});

test("fixture: GET /me/vault answering 404 is on the built-in list; the same path with another status or method is not", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-14B", ["ask"]));
  await page.route(`${QA_API_ORIGIN}/**`, (route) => route.fulfill({ status: 404, headers: CORS, body: "{}" }));
  await page.setContent("<p>x</p>");
  expect(qa.result().allowed).toBeUndefined(); // a built-in allowance that excused nothing is not listed
  await page.evaluate((u) => fetch(u + "/me/vault").then(() => 0), QA_API_ORIGIN);
  expect(watcherFindings(qa.result())).toEqual([]);
  expect(qa.result().allowed).toEqual([expect.objectContaining({ kind: "response", what: expect.stringContaining("GET"), builtIn: true, count: 1, reason: expect.stringContaining("no vault") })]);
  await page.evaluate((u) => fetch(u + "/me/vault", { method: "PUT" }).then(() => 0), QA_API_ORIGIN);
  await page.route(`${QA_API_ORIGIN}/me/vault`, (route) => route.fulfill({ status: 500, headers: CORS, body: "{}" }));
  await page.evaluate((u) => fetch(u + "/me/vault").then(() => 0), QA_API_ORIGIN);
  await page.evaluate((u) => fetch(u + "/me/projects").then(() => 0), QA_API_ORIGIN);
  expect(withLabel(qa.result(), RULE_LABEL.status).map((c) => c.message)).toEqual([
    expect.stringMatching(/404.*PUT.*\/me\/vault$/),
    expect.stringMatching(/500.*GET.*\/me\/vault$/),
    expect.stringMatching(/404.*GET.*\/me\/projects$/)
  ]);
});

test("fixture: GET /projects/:id/blobs/:kind answering 404 is on the built-in list; another method, path or status is not", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-14D", ["ask"]));
  const project = "0a1b2c3d-0000-4000-8000-000000000000";
  const answer = (status: number) => (route: Route) => route.fulfill({ status, headers: CORS, body: "{}" });
  await page.route(`${QA_API_ORIGIN}/**`, answer(404));
  await page.setContent("<p>x</p>");
  const ask = (path: string, method = "GET") => page.evaluate(({ u, m }) => fetch(u, { method: m }).then(() => 0), { u: QA_API_ORIGIN + path, m: method });
  // A blob nobody has saved yet, by a plain kind and by a kind with a colon (the shelf's papers).
  await ask(`/projects/${project}/blobs/idea_intake`);
  await ask(`/projects/${project}/blobs/shelf_paper%3A${project}`);
  expect(watcherFindings(qa.result())).toEqual([]);
  expect(qa.result().allowed).toEqual([expect.objectContaining({ kind: "response", builtIn: true, count: 2, reason: expect.stringContaining("not saved yet") })]);
  // Another method, a document, the project itself, and the same blob answering something else, are findings.
  await ask(`/projects/${project}/blobs/idea_intake`, "PUT");
  await ask(`/projects/${project}/documents/abc`);
  await ask(`/projects/${project}`);
  await page.route(`${QA_API_ORIGIN}/projects/${project}/blobs/citations`, answer(500));
  await ask(`/projects/${project}/blobs/citations`);
  expect(withLabel(qa.result(), RULE_LABEL.status).map((c) => c.message)).toEqual([
    expect.stringMatching(/404.*PUT.*\/blobs\/idea_intake$/),
    expect.stringMatching(/404.*GET.*\/documents\/abc$/),
    expect.stringMatching(/404.*GET.*\/projects\/[0-9a-f-]+$/),
    expect.stringMatching(/500.*GET.*\/blobs\/citations$/)
  ]);

  // A blob this case saved and that then answers 404 is data lost, not "not saved yet": the built-in stops excusing that address until a DELETE of it answers ok.
  const kept = `/projects/${project}/blobs/shelf_index`;
  await page.route(`${QA_API_ORIGIN}${kept}`, (route) => {
    const method = route.request().method();
    return route.fulfill({ status: method === "PUT" ? 200 : method === "DELETE" ? 204 : 404, headers: CORS, body: method === "DELETE" ? "" : "{}" });
  });
  await ask(kept); // not saved yet: excused
  expect(withLabel(qa.result(), RULE_LABEL.status)).toHaveLength(4);
  await ask(kept, "PUT"); // saved
  await ask(kept); // and now gone: a finding
  expect(withLabel(qa.result(), RULE_LABEL.status).map((c) => c.message).slice(4)).toEqual([expect.stringMatching(/404.*GET.*\/blobs\/shelf_index \(a PUT to this address answered ok earlier/)]);
  await ask(kept, "DELETE"); // deleted on purpose: not saved any more
  await ask(kept); // excused again
  expect(withLabel(qa.result(), RULE_LABEL.status)).toHaveLength(5);
  // Another address the case saved does not matter to this one.
  await page.route(`${QA_API_ORIGIN}/projects/${project}/blobs/ap_notes`, answer(200));
  await ask(`/projects/${project}/blobs/ap_notes`, "PUT");
  await ask(`/projects/${project}/blobs/style_meta`);
  expect(withLabel(qa.result(), RULE_LABEL.status).filter((c) => /style_meta/.test(c.message ?? ""))).toHaveLength(0);
});

test("fixture: an allowance needs a reason", TAGS, async ({ qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-14C", ["go"]));
  expect(() => qa.allow({ consoleErrors: [{ match: /x/, reason: "" }] })).toThrow(/needs a reason/);
  expect(() => qa.allow({ responses: [{ method: "GET", path: /^\/x$/, status: 404, reason: "  " }] })).toThrow(/needs a reason/);
  expect(() => qa.allow({ responses: [{ method: "GET", path: /^\/x$/, status: 404 } as never] })).toThrow(/needs a reason/);
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
  const r = qa.result();
  expect(watcherFindings(r)).toEqual([]);
  expect(r.checks.filter((c) => c.ok === false)).toEqual([]);
  // It is information, not nothing: the result keeps it, with a count, for the report to list once.
  expect(r.notes).toEqual([{ kind: "csp-eval-probe", detail: expect.stringContaining("script-src"), count: 1 }]);
  expect(r.notes![0]!.detail).toContain("refused eval");
  // The same refusal again counts again.
  await page.goto(`${NOWHERE}/probe`);
  expect(qa.result().notes).toEqual([{ kind: "csp-eval-probe", detail: expect.any(String), count: 2 }]);
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
  // About 1,500 ms: a loaded machine takes longer to wake a timer, so the number is read, not matched digit by digit.
  const took = Number(/took ([\d,]+) ms; the budget is 1,000 ms/.exec(slow!.message ?? "")?.[1]?.replace(/,/g, ""));
  expect(took).toBeGreaterThanOrEqual(1500);
  expect(took).toBeLessThan(5000);
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

test("fixture: a failing check with a known id is recorded with it, and does not fail the case", MECHANICS, async ({ qa }) => {
  // No selfTest here: the teardown runs as it does in a real case, and this test passes only if it does not throw.
  qa.begin(meta("SELF-19", ["go"]));
  const ok = await qa.check("data", "open answers are not called names", async () => expect("looks like names").toBe("no flag"), { source: "tools-b row 4", known: "O12" });
  expect(ok).toBe(false);
  const [c] = qa.result().checks;
  expect(c).toMatchObject({ kind: "data", ok: false, fail: "unexpected", known: "O12", source: "tools-b row 4" });
  expect(qa.result().missingKnown ?? []).toEqual([]);
});

test("fixture: the same check passing is recorded ok with its known id (the report turns it into FIXED?)", TAGS, async ({ qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-20", ["go"]));
  expect(await qa.check("data", "open answers are not called names", async () => expect("no flag").toBe("no flag"), { known: "O12" })).toBe(true);
  expect(qa.result().checks[0]).toMatchObject({ kind: "data", ok: true, known: "O12" });
});

test("fixture: a failing check awaiting a decision does not fail the case either", MECHANICS, async ({ qa }) => {
  qa.begin(meta("SELF-21", ["go"]));
  await qa.check("conceptual", "the Viva tab says that Tab inserts AI text", async () => expect("silent").toBe("says so"), { known: "O20" });
  expect(qa.result().checks[0]).toMatchObject({ ok: false, known: "O20" });
});

test("fixture: a failing check with no known id fails the case", MECHANICS, async ({ qa }) => {
  test.fail();
  qa.begin(meta("SELF-22", ["go"]));
  await qa.check("data", "a plain failure", async () => expect(1).toBe(2));
});

test("fixture: a failing check whose known entry is fixed fails the case", MECHANICS, async ({ qa }) => {
  test.fail();
  qa.begin(meta("SELF-23", ["go"]));
  await qa.check("data", "F2 came back", async () => expect(1).toBe(2), { known: "F2" });
});

test("fixture: a failing check naming an id that known.json lacks fails the case, and the result notes the id", MECHANICS, async ({ qa }) => {
  test.fail();
  qa.begin(meta("SELF-24", ["go"]));
  await qa.check("data", "an unknown id", async () => expect(1).toBe(2), { known: "ZZ99" });
});

test("fixture: the result notes an id that known.json lacks, once", TAGS, async ({ qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-25", ["go"]));
  await qa.check("data", "one", async () => expect(1).toBe(2), { known: "ZZ99" });
  await qa.check("data", "two", async () => {}, { known: "ZZ99" });
  await qa.check("data", "three", async () => expect(1).toBe(2), { known: "O12" });
  const r = qa.result();
  expect(r.missingKnown).toEqual(["ZZ99"]);
  expect(r.checks.map((c) => c.known)).toEqual(["ZZ99", "ZZ99", "O12"]);
});

test("fixture: a failing check with a very long label still leaves its screenshot, and the case goes on", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-26B", ["long"]));
  await page.setContent("<h1>Home</h1>");
  const label = "the zip holds exactly the files of the parts listed: " + "the documents as .doc and .html, question.txt, the citations, the search list, ".repeat(5);
  expect(label.length).toBeGreaterThan(300);
  await qa.step("long", async () => {
    expect(await qa.check("data", label, async () => expect(1).toBe(2))).toBe(false);
  });
  const r = qa.result();
  expect(r.stoppedAt).toBeUndefined();
  expect(existsSync(r.checks[0]!.screenshot!)).toBe(true);
  expect(test.info().attachments.some((a) => a.name.startsWith("failed check: the zip holds exactly"))).toBe(true);
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

/** A request through the real fake provider (provider-shim/core.mjs); its log lines are the ones the shim really writes, and go to this selftest's log. */
async function viaShim(key: string, prompt: string, host: "api.groq.com" | "generativelanguage.googleapis.com" = "api.groq.com"): Promise<void> {
  const shim = createShimFetch(
    async () => {
      throw new Error("the fake provider passed a request on");
    },
    { replies: [{ match: "Summarise", reply: "A summary." }], log: (e) => providerCalls.push(e) }
  );
  const request =
    host === "api.groq.com"
      ? { url: "https://api.groq.com/openai/v1/chat/completions", body: { model: "m", messages: [{ role: "user", content: prompt }] } }
      : { url: "https://generativelanguage.googleapis.com/v1beta/models/m:generateContent", body: { contents: [{ parts: [{ text: prompt }] }] } };
  await shim(request.url, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: JSON.stringify(request.body) }).catch(() => {}); // the nonet mode throws, as a dropped connection does
}

test("fixture: the AI keys of the case are listed, and a provider request that went wrong is a finding", TAGS, async ({ qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-27", ["go"]));
  const mine = `gsk_qa_ok_${randomUUID().slice(0, 8)}`;
  const theirs = `gsk_qa_ok_${randomUUID().slice(0, 8)}`;
  const bogus = `gsk_qa_bogus_${randomUUID().slice(0, 8)}`;
  const rateLimited = `gsk_qa_fail429_${randomUUID().slice(0, 8)}`;
  const long = "Describe the sea in a way that has no recorded reply, at some length, so that the prompt is longer than one hundred and twenty characters. ";
  await viaShim(mine, "Summarise the abstract."); // answered
  await viaShim(mine, long); // unknown: no recorded reply
  await viaShim(mine, "A prompt for Gemini", "generativelanguage.googleapis.com"); // refused: not faked
  await viaShim(bogus, "A prompt with a mode that does not exist"); // failed under the mode "bogus"
  await viaShim(rateLimited, "A prompt that fails on purpose"); // failed under fail429: the case asked for it
  await viaShim(theirs, "Someone else's prompt with no reply"); // unknown, but another case's key
  // What the shim really wrote: the lines the rules are about.
  expect(providerCalls.filter((e) => e.key === mine).map((e) => e.outcome)).toEqual(["answered", "unknown", "refused"]);
  expect(providerCalls.filter((e) => e.key === bogus).map((e) => [e.mode, e.outcome])).toEqual([["bogus", "failed"]]);
  expect(providerCalls.filter((e) => e.key === rateLimited).map((e) => [e.mode, e.outcome])).toEqual([["fail429", "failed"]]);

  qa.useKey(mine);
  qa.useKey(mine);
  qa.useKey(bogus);
  qa.useKey(rateLimited);
  const r = qa.result();
  expect(r.keys).toEqual([mine, bogus, rateLimited]);
  const found = withLabel(r, RULE_LABEL.provider);
  expect(found).toHaveLength(3);
  for (const c of found) expect(c).toMatchObject({ kind: "watcher", ok: false, fail: "error" });
  const text = found.map((c) => c.message).join("\n");
  expect(text).toContain("api.groq.com");
  expect(text).toContain(long.slice(0, 120));
  expect(text).not.toContain(long.slice(0, 121));
  expect(text).toContain("generativelanguage.googleapis.com");
  expect(text).toContain("A prompt for Gemini");
  expect(text).toContain('key mode "bogus"');
  expect(text).toContain("A prompt with a mode that does not exist");
  expect(text).not.toContain("Summarise"); // answered
  expect(text).not.toContain("fails on purpose"); // fail429 asked for it
  expect(text).not.toContain("someone else"); // not this case's key
  // The key itself is not written into a finding.
  for (const k of [mine, bogus, rateLimited]) expect(text).not.toContain(k);
});

test("fixture: a request the fake provider could not take, under a key that is otherwise good, is a finding", TAGS, async ({ qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-27B", ["go"]));
  const key = `gsk_qa_ok_${randomUUID().slice(0, 8)}`;
  // A request the shim cannot take: not a chat completion with a prompt. It logs it as failed, under the mode of the key.
  const shim = createShimFetch(async () => new Response("passed on"), { replies: [], log: (e) => providerCalls.push(e) });
  await shim("https://api.groq.com/openai/v1/models", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: JSON.stringify({ messages: [{ role: "user", content: "x" }] }) });
  expect(providerCalls.filter((e) => e.key === key).map((e) => [e.mode, e.outcome])).toEqual([["ok", "failed"]]);
  qa.useKey(key);
  expect(withLabel(qa.result(), RULE_LABEL.provider)).toHaveLength(1);
  expect(withLabel(qa.result(), RULE_LABEL.provider)[0]!.message).toContain('key mode "ok"');
});

test("fixture: a provider request nobody could answer fails the case", MECHANICS, async ({ qa }) => {
  test.fail();
  qa.begin(meta("SELF-28", ["go"]));
  const key = `gsk_qa_ok_${randomUUID().slice(0, 8)}`;
  await viaShim(key, "a prompt with no recorded reply");
  qa.useKey(key);
});

test("fixture: the selftests give the fixture a provider log of their own, not the run's", TAGS, async ({ qa, providerLog }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-29B", ["go"]));
  expect(providerLog.read()).toBe(providerCalls);
});

/** The width and height in the header of a PNG file. */
const pngSize = (file: string) => {
  const b = readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};

test("fixture: a second browser context the case makes is watched once the case says so, page errors and all", TAGS, async ({ browser, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-31", ["act"]));
  const unwatched = await browser.newContext();
  const watched = await browser.newContext();
  try {
    await qa.watch(watched);
    await qa.watch(watched); // again: nothing doubles
    const [a, b] = [await watched.newPage(), await unwatched.newPage()];
    await b.setContent("<script>throw new Error('boom in a context nobody watches')</script>");
    expect(withLabel(qa.result(), RULE_LABEL.pageerror)).toEqual([]);
    await a.setContent("<script>throw new Error('boom in the second browser')</script>");
    await a.route("https://example.org/**", (route) => route.fulfill({ status: 200, headers: CORS, body: "{}" }));
    await a.evaluate(() => fetch("https://example.org/x").then(() => 0));
    await a.evaluate(() => confirm("sure?"));
    const r = qa.result();
    expect(withLabel(r, RULE_LABEL.pageerror).map((c) => c.message)).toEqual([expect.stringContaining("boom in the second browser")]);
    expect(withLabel(r, RULE_LABEL.host)).toHaveLength(1);
    expect(withLabel(r, RULE_LABEL.dialog)).toHaveLength(1);
    // Its page opens and loads without a finding, and a load nobody asked for is one.
    await a.route(`${NOWHERE}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<p>page</p>" }));
    await a.goto(`${NOWHERE}/a`);
    await a.reload();
    expect(withLabel(qa.result(), RULE_LABEL.reload)).toEqual([]);
    await Promise.all([a.waitForEvent("load"), a.evaluate(() => void setTimeout(() => location.reload(), 0))]);
    expect(withLabel(qa.result(), RULE_LABEL.reload)).toHaveLength(1);
  } finally {
    await Promise.all([watched.close(), unwatched.close()]);
  }
});

test("fixture: watching a page watches its whole context, and a page the app opens may load once", TAGS, async ({ browser, context, page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-32", ["act"]));
  const other = await browser.newContext();
  try {
    const page2 = await other.newPage();
    await qa.watch(page2); // a page that exists already: watched from here (its init script starts with its next navigation)
    await page2.goto(`about:blank`);
    await page2.setContent("<p>x</p><script>console.error('error in a page that was given to watch()')</script>");
    expect(withLabel(qa.result(), RULE_LABEL.console)).toHaveLength(1);
    // A pop-up the app opens: its first load is the page opening, not a reload.
    await context.route(`${NOWHERE}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<p>popup</p>" }));
    await page.setContent("<p>the app</p>");
    const [popup] = await Promise.all([context.waitForEvent("page"), page.evaluate((u) => void window.open(u), `${NOWHERE}/pop`)]);
    await popup.waitForLoadState("load");
    expect(withLabel(qa.result(), RULE_LABEL.reload)).toEqual([]);
    await Promise.all([popup.waitForEvent("load"), popup.evaluate(() => void setTimeout(() => location.reload(), 0))]);
    expect(withLabel(qa.result(), RULE_LABEL.reload)).toHaveLength(1);
  } finally {
    await other.close();
  }
});

test("fixture: a step or a check on another page is screenshotted, and a stop is addressed, from that page", TAGS, async ({ browser, page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-33", ["here", "there", "after"]));
  const other = await browser.newContext({ viewport: { width: 500, height: 400 } });
  try {
    await qa.watch(other);
    const second = await other.newPage();
    await page.setContent("<h1>first browser</h1>");
    await second.route(`${NOWHERE}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>second browser</h1>" }));
    await second.goto(`${NOWHERE}/second`);
    const mainSize = (await page.viewportSize())!;

    await qa.step("here", async () => {
      await qa.check("data", "fails on the first page", async () => expect(1).toBe(2));
    });
    await qa.check("data", "fails on the second page", async () => expect(1).toBe(2), { page: second });
    await qa.step("there", async () => {
      // A check in a step on the second page defaults to that page.
      await qa.check("data", "fails inside the step", async () => expect(1).toBe(2));
      throw new Error("the second browser did not answer");
    }, { page: second }).catch(() => {});

    const r = qa.result();
    expect(pngSize(r.checks[0]!.screenshot!)).toEqual(mainSize);
    expect(pngSize(r.checks[1]!.screenshot!)).toEqual({ width: 500, height: 400 });
    expect(r.checks[2]).toMatchObject({ label: "fails inside the step", step: "there" });
    expect(pngSize(r.checks[2]!.screenshot!)).toEqual({ width: 500, height: 400 });
    expect(r.stoppedAt).toMatchObject({ step: "there", url: `${NOWHERE}/second`, reason: "the second browser did not answer" });
    expect(pngSize(r.stoppedAt!.screenshot)).toEqual({ width: 500, height: 400 });
    // And a checkpoint can be taken of that page.
    await qa.checkpoint("second browser", { page: second });
    expect(pngSize(qa.result().screenshots[0]!.path).width).toBe(500);
  } finally {
    await other.close();
  }
});

test("fixture: a step after a step on another page acts on the fixture's page again, and a nested step on the enclosing step's", TAGS, async ({ browser, page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-33B", ["there", "nested", "back"]));
  const other = await browser.newContext({ viewport: { width: 500, height: 400 } });
  try {
    await qa.watch(other);
    const second = await other.newPage();
    for (const [p, name] of [[page, "first"], [second, "second"]] as const) {
      await p.route(`${NOWHERE}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: `<h1>${name} browser</h1>` }));
      await p.goto(`${NOWHERE}/${name}`);
    }
    const mainSize = (await page.viewportSize())!;
    const secondSize = { width: 500, height: 400 };

    await qa.step("there", async () => {
      await qa.step("nested", async () => {
        // No page given: the enclosing step's.
        await qa.check("data", "fails in the nested step", async () => expect(1).toBe(2));
      });
    }, { page: second });
    // A top-level step with no page is the fixture's page, not the page the step before it acted on.
    await expect(
      qa.step("back", async () => {
        await qa.check("data", "fails in the step after", async () => expect(1).toBe(2));
        throw new Error("the first browser did not answer");
      })
    ).rejects.toThrow("the first browser did not answer");

    const r = qa.result();
    expect(r.checks[0]).toMatchObject({ label: "fails in the nested step", step: "nested" });
    expect(pngSize(r.checks[0]!.screenshot!)).toEqual(secondSize);
    expect(r.checks[1]).toMatchObject({ label: "fails in the step after", step: "back" });
    expect(pngSize(r.checks[1]!.screenshot!)).toEqual(mainSize);
    expect(r.stoppedAt).toMatchObject({ step: "back", url: `${NOWHERE}/first` });
    expect(pngSize(r.stoppedAt!.screenshot)).toEqual(mainSize);
  } finally {
    await other.close();
  }
});

test("fixture: expectLoad acts on the page of the step it is called in, else the fixture's", TAGS, async ({ browser, page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-37", ["second"]));
  const other = await browser.newContext();
  try {
    await qa.watch(other);
    const second = await other.newPage();
    for (const p of [page, second]) {
      await p.route(`${NOWHERE}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<p>page</p>" }));
      await p.goto(`${NOWHERE}/a`);
    }
    const navigate = (p: typeof page, to: string) => Promise.all([p.waitForEvent("load"), p.evaluate((u) => void setTimeout(() => (location.href = u), 0), to)]);

    await qa.step("second", async () => {
      qa.expectLoad(); // the second page: this is its step
      await navigate(second, `${NOWHERE}/b`);
    }, { page: second });
    // Had it gone to the fixture's page, the second page's load would be a finding and the fixture's page would hold an announcement that never came.
    expect(withLabel(qa.result(), RULE_LABEL.reload)).toEqual([]);
    expect(qa.result().checks.filter((c) => c.ok === null)).toEqual([]);

    qa.expectLoad(); // outside every step: the fixture's page, even right after a step on the second
    await navigate(page, `${NOWHERE}/c`);
    expect(withLabel(qa.result(), RULE_LABEL.reload)).toEqual([]);
    expect(qa.result().checks.filter((c) => c.ok === null)).toEqual([]);
  } finally {
    await other.close();
  }
});

test("fixture: a load a click really causes is announced, and one announced that never comes is NOT CHECKED", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-34", ["go"]));
  await page.route(`${NOWHERE}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<p>page</p>" }));
  await page.goto(`${NOWHERE}/a`);
  const navigate = (to: string) => Promise.all([page.waitForEvent("load"), page.evaluate((u) => void setTimeout(() => (location.href = u), 0), to)]);

  qa.expectLoad();
  await navigate(`${NOWHERE}/b`);
  expect(withLabel(qa.result(), RULE_LABEL.reload)).toEqual([]);
  expect(qa.result().checks.filter((c) => c.ok === null)).toEqual([]);
  await navigate(`${NOWHERE}/c`); // not announced
  expect(withLabel(qa.result(), RULE_LABEL.reload)).toHaveLength(1);

  qa.expectLoad();
  const notChecked = qa.result().checks.filter((c) => c.ok === null);
  expect(notChecked).toEqual([expect.objectContaining({ kind: "watcher", label: "NOT CHECKED: an announced page load did not come", ok: null })]);
  expect(notChecked[0]!.fail).toBeUndefined();
  expect(notChecked[0]!.message).toContain("/c");
  // Once it comes, nothing is left over.
  await navigate(`${NOWHERE}/d`);
  expect(qa.result().checks.filter((c) => c.ok === null)).toEqual([]);
  expect(withLabel(qa.result(), RULE_LABEL.reload)).toHaveLength(1);
});

test("fixture: expectLoad refuses a page nobody watches", TAGS, async ({ browser, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-34B", ["go"]));
  const other = await browser.newContext();
  try {
    const page2 = await other.newPage();
    expect(() => qa.expectLoad({ page: page2 })).toThrow(/qa\.watch/);
  } finally {
    await other.close();
  }
});

test("fixture: a dialog announced that never comes is NOT CHECKED, and one that comes is not", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-35", ["go"]));
  await page.setContent("<p>x</p>");
  qa.expectDialog("prompt", true);
  qa.expectDialog("confirm", false);
  expect(qa.result().checks.filter((c) => c.ok === null).map((c) => c.label)).toEqual(["NOT CHECKED: an announced prompt() dialog did not come", "NOT CHECKED: an announced confirm() dialog did not come"]);
  expect(await page.evaluate(() => confirm("now?"))).toBe(false);
  const left = qa.result().checks.filter((c) => c.ok === null);
  expect(left).toEqual([expect.objectContaining({ kind: "watcher", label: "NOT CHECKED: an announced prompt() dialog did not come", ok: null })]);
  expect(left[0]!.fail).toBeUndefined();
  expect(withLabel(qa.result(), RULE_LABEL.dialog)).toEqual([]);
});

test("fixture: a soft expectation that fails inside a check fails that check", TAGS, async ({ qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-36", ["go"]));
  const info = test.info();
  const before = info.errors.length;
  const held = await qa.check("data", "a soft one", async () => {
    expect.soft(1, "the soft one").toBe(2);
  });
  const soft = info.errors.length - before;
  // Playwright has put the soft failure on the test; this test takes it back out after looking, as it is on purpose.
  info.errors.splice(before, soft);
  (info as { status: string | undefined }).status = "passed";
  expect(soft).toBe(1);
  expect(held).toBe(false);
  const [c] = qa.result().checks;
  expect(c).toMatchObject({ kind: "data", ok: false, fail: "unexpected" });
  expect(c!.message).toContain("the soft one");
  expect(qa.result().stoppedAt).toBeUndefined();
  // A check whose soft expectation passes is ok.
  expect(await qa.check("data", "a soft one that holds", async () => expect.soft(2).toBe(2))).toBe(true);
});

test("fixture: a soft expectation that fails in a check that then measured nothing still fails the check, and is not a stop", TAGS, async ({ qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-36B", ["go"]));
  const info = test.info();
  const before = info.errors.length;
  const held = await qa.check("data", "soft, then nothing to measure", async () => {
    expect.soft(1, "the soft one before").toBe(2);
    notChecked("there was nothing on the page");
  });
  const soft = info.errors.length - before;
  info.errors.splice(before, soft);
  (info as { status: string | undefined }).status = "passed";
  expect(soft).toBe(1);
  expect(held).toBe(false);
  const [c] = qa.result().checks;
  expect(c).toMatchObject({ kind: "data", ok: false, fail: "unexpected" });
  expect(c!.message).toContain("the soft one before");
  // With no soft failure, measuring nothing is still NOT CHECKED.
  await qa.check("data", "nothing to measure", async () => notChecked("there was nothing on the page"));
  expect(qa.result().checks[1]).toMatchObject({ ok: null, message: "there was nothing on the page" });
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
