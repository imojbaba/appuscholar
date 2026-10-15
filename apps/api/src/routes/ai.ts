import { Hono } from "hono";
import { z } from "zod";
import { classifyAiUse, contentLangInstruction, scanText } from "@appuscholar/core";
import type { Store } from "../store/types";
import type { AuthEnv } from "../auth";
import { complete, type GatewayDeps } from "../ai/gateway";
import { AiError, type AiErrorCode } from "../ai/types";

const Provider = z.enum(["gemini", "groq", "deepseek", "openrouter", "openai", "claude"]);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().startsWith(s));
const ApiKey = z.string().max(400);

const CompleteBody = z.object({
  provider: Provider,
  apiKey: ApiKey,
  prompt: z.string().min(1).max(60_000),
  day: Day,
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(16_000).optional(),
  noLang: z.boolean().default(false),
  contentLang: z.enum(["en", "hi"]).default("en"),
  pdAccepted: z.boolean().default(false),
  projectId: z.string().min(1).max(100).optional()
}).strict();
const TestBody = z.object({ provider: Provider, apiKey: ApiKey }).strict();
const Range = z.object({ from: Day.optional(), to: Day.optional() });

const STATUS: Record<AiErrorCode, 400 | 401 | 404 | 429 | 502> = {
  "personal-data": 400, blocked: 400, truncated: 400, empty: 400, "no-key": 400,
  "key-rejected": 401, "model-gone": 404, "rate-limit": 429, "provider-error": 502, network: 502
};

/** v1 pdPreSend wording ("Found: 1 email address, 2 phone numbers."), with "addresses" spelled correctly where v1 wrote "addresss". */
function foundSentence(counts: Record<string, number>): string {
  const plural = (k: string) => (k.endsWith("s") ? k + "es" : k + "s");
  return "Found: " + Object.keys(counts).map((k) => counts[k] + " " + (counts[k]! > 1 ? plural(k) : k)).join(", ") + ".";
}

export function aiRoutes(store: Store, deps: GatewayDeps) {
  const r = new Hono<AuthEnv>();
  r.use("*", async (c, next) => {
    await store.ensureUser(c.get("userId"), c.get("email"));
    await next();
  });

  // Never log the request body, the key or the prompt: only the error class is recorded.
  async function guarded(c: { json: (b: unknown, s: 400 | 401 | 404 | 429 | 502) => Response }, run: () => Promise<Response>): Promise<Response> {
    try {
      return await run();
    } catch (e) {
      if (e instanceof AiError) return c.json({ error: e.code, detail: e.detail }, STATUS[e.code]);
      const err = e as { name?: unknown; code?: unknown };
      console.error("ai gateway: unexpected error", typeof err?.name === "string" ? err.name : "unknown", typeof err?.code === "string" ? err.code : "");
      return c.json({ error: "provider-error", detail: "unexpected" }, 502);
    }
  }

  r.post("/complete", async (c) => {
    const body = CompleteBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const b = body.data;
    return guarded(c, async () => {
      const scan = scanText(b.prompt);
      if (scan.total > 0 && !b.pdAccepted) throw new AiError("personal-data", foundSentence(scan.counts));
      const prompt = b.noLang ? b.prompt : b.prompt + contentLangInstruction(b.contentLang);
      const out = await complete({ provider: b.provider, apiKey: b.apiKey, prompt, temperature: b.temperature, maxTokens: b.maxTokens }, deps);
      const userId = c.get("userId");
      const kind = classifyAiUse(b.prompt);
      const user = await store.getUser(userId);
      if (kind && !user?.settings.aiLogOff) {
        const projectId = b.projectId && (await store.getProject(userId, b.projectId)) ? b.projectId : null;
        await store.appendAiUse(userId, projectId, { d: b.day, p: b.provider, m: out.model, k: kind.k, g: kind.g });
      }
      return c.json({ text: out.text, model: out.model });
    });
  });

  r.post("/test", async (c) => {
    const body = TestBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    return guarded(c, async () => {
      const out = await complete({ provider: body.data.provider, apiKey: body.data.apiKey, prompt: "Reply with the single word OK.", temperature: 0, maxTokens: 20 }, deps);
      return c.json({ ok: true, reply: out.text });
    });
  });

  r.get("/log", async (c) => {
    const q = Range.safeParse(c.req.query());
    if (!q.success) return c.json({ error: "invalid" }, 400);
    return c.json(await store.listAiUse(c.get("userId"), q.data.from, q.data.to));
  });

  r.get("/log/summary", async (c) => {
    const q = Range.safeParse(c.req.query());
    if (!q.success) return c.json({ error: "invalid" }, 400);
    const rows = await store.listAiUse(c.get("userId"), q.data.from, q.data.to);
    const byKind: Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    for (const e of rows) { byKind[e.k] = (byKind[e.k] ?? 0) + 1; byProvider[e.p] = (byProvider[e.p] ?? 0) + 1; }
    return c.json({ byKind, byProvider, total: rows.length });
  });

  r.delete("/log", async (c) => {
    await store.eraseAiUse(c.get("userId"));
    return c.body(null, 204);
  });

  return r;
}
