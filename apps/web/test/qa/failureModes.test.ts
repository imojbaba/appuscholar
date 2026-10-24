import { describe, expect, it } from "vitest";
import { createShimFetch, FAILURE_MODES, type ShimLogEntry } from "../../qa/provider-shim/core.mjs";

/**
 * The `qa` fixture flags a provider request the fake provider failed under a key mode that does not fail on purpose (qa/support/qa.ts reads FAILURE_MODES from the shim).
 * This pins that set to what the shim does, so a mode added to or changed in the shim cannot leave the fixture treating a deliberate failure as a fault of the case, or the reverse.
 */
const GROQ = "https://api.groq.com/openai/v1/chat/completions";
const REPLIES = [{ match: "Summarise", reply: "A summary." }];

/** One good chat request under a key of this mode, through a fresh shim; the log line it writes. */
async function logged(mode: string, body: unknown = { model: "m", messages: [{ role: "user", content: "Summarise the abstract." }] }, url = GROQ): Promise<ShimLogEntry | undefined> {
  const log: ShimLogEntry[] = [];
  const shim = createShimFetch(
    async () => {
      throw new Error("the shim passed a request on");
    },
    { replies: REPLIES, log: (e) => log.push(e), sleep: async () => {} }
  );
  // The nonet mode rejects, as a dropped connection does.
  await shim(url, { method: "POST", headers: { authorization: `Bearer gsk_qa_${mode}_abcd1234` }, body: JSON.stringify(body) }).catch(() => {});
  return log[0];
}

/** The modes the shim names when a key's mode does not exist ("Modes: ok, fail429, ..., slow<ms>, failonce."), so a mode added to the shim shows up here. */
async function modesTheShimNames(): Promise<string[]> {
  const shim = createShimFetch(async () => new Response("passed on"), { replies: REPLIES, log: () => {} });
  const r = await shim(GROQ, { method: "POST", headers: { authorization: "Bearer gsk_qa_nosuchmode_abcd1234" }, body: JSON.stringify({ messages: [{ role: "user", content: "Summarise" }] }) });
  const named = /Modes: ([^.]+)\./.exec(await r.text())?.[1];
  if (!named) throw new Error("the shim no longer lists its modes in the unknown-mode message");
  return named.split(", ");
}

describe("FAILURE_MODES (provider-shim/core.mjs)", () => {
  it("is exactly the modes under which the shim logs a good request as failed", async () => {
    const modes = (await modesTheShimNames()).map((m) => (m === "slow<ms>" ? "slow5" : m));
    expect(modes).toContain("ok");
    const failing: string[] = [];
    for (const mode of modes) if ((await logged(mode))?.outcome === "failed") failing.push(mode);
    expect(new Set(failing)).toEqual(FAILURE_MODES);
  });

  it("does not include a mode that answers (ok, slow<ms>)", async () => {
    for (const mode of ["ok", "slow5"]) {
      expect((await logged(mode))?.outcome, mode).toBe("answered");
      expect(FAILURE_MODES.has(mode)).toBe(false);
    }
  });

  it("does not include a mode that does not exist, or ok on a request the shim cannot take: the shim logs both as failed", async () => {
    expect(await logged("bogus")).toMatchObject({ mode: "bogus", outcome: "failed" });
    expect(await logged("ok", { not: "a chat request" })).toMatchObject({ mode: "ok", outcome: "failed" });
    expect(FAILURE_MODES.has("bogus")).toBe(false);
    expect(FAILURE_MODES.has("ok")).toBe(false);
  });
});

describe("modesTheShimNames", () => {
  it("reads the modes from the shim's own message", async () => {
    expect(await modesTheShimNames()).toEqual(expect.arrayContaining(["ok", "fail429", "slow<ms>", "failonce"]));
  });
});
