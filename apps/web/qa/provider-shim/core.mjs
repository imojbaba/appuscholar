// The fake AI provider, as a function: createShimFetch(original, { replies, log, sleep }) wraps a `fetch` and answers the requests our API makes to the AI
// providers' addresses. Everything else goes to `original` untouched. shim.mjs installs it on globalThis.fetch before the API starts (node --import), so the
// API's own code runs as built (the names check, the error mapping, the retry, the AI-use log) and only the outside provider is simulated.
//
// Plain ESM, no TypeScript and no imports: Node runs it directly, and nothing from packages/ is available to a preload.

/**
 * @typedef {object} ShimLogEntry One request the fake provider received.
 * @property {number} t Date.now() when the request arrived.
 * @property {string} key The API key it carried (a `gsk_qa_<mode>_<random>` test key; "<not a QA key>" for anything else, which is never written down).
 * @property {string} mode What the key asked for: ok, fail429, fail401, fail500, nonet, empty, slow<ms>, failonce; "invalid" for a key that is not a test key.
 * @property {string} host The provider address the request went to.
 * @property {string | null} kind The AI-use kind of the prompt, as the API logs it (`classifyAiUse(prompt)?.k`); null for the Appu help assistant or when no prompt could be read.
 * @property {string} prompt The full prompt (`messages[0].content`), as the provider received it: the content-language line the API adds is included. Empty when none could be read.
 * @property {"answered" | "failed" | "unknown" | "refused"} outcome
 *   answered: text was given back.
 *   failed: the key's mode failed it, `empty` gave no text, or the shim could not take the request (a key that is not a test key, a mode that does not exist, a path that is
 *     not /chat/completions, a body that is not a chat request); the answer then says which.
 *   unknown: the request was fine and no recorded reply fits the prompt (and only that).
 *   refused: the request went to a provider the shim does not fake (Gemini, Anthropic). It was answered 400 here and not sent on.
 */

/**
 * @typedef {object} Reply A recorded reply.
 * @property {string} match The start of the prompt, where `*` stands for any text: "You are a statistics tutor" or "You help a student of *search research databases".
 * @property {unknown} reply The text to answer with. A value that is not a string (an object, an array) is sent as its JSON text.
 */

/**
 * @typedef {object} ShimOptions
 * @property {Reply[]} replies Tried in order; the first whose `match` fits the prompt answers it.
 * @property {(entry: ShimLogEntry) => void} log Called once for each request, when it arrives (before a `slow` wait). An error thrown here fails the request.
 * @property {(ms: number) => Promise<void>} [sleep] The wait of a `slow<ms>` key. Defaults to a timer.
 */

/** The addresses apps/api/src/ai/providers/openaiCompat.ts posts to (its URLS table); all four end in /chat/completions. */
const PROVIDER_HOSTS = new Set(["api.groq.com", "api.openai.com", "api.deepseek.com", "openrouter.ai"]);
/**
 * The other providers the API can call: Gemini (apps/api/src/ai/providers/gemini.ts, through the fetch given to the gateway) and Anthropic (the SDK, which uses the global
 * fetch). They are not faked, and the QA keys must not reach them, so a request to one is answered 400 here ("refused") and never sent on. Cases choose Groq.
 */
const REFUSED_HOSTS = new Set(["generativelanguage.googleapis.com", "api.anthropic.com"]);
/** The key: gsk_qa_<mode>_<random>. */
const KEY = /^gsk_qa_([a-z0-9]+)_(.+)$/;
/** The key modes that fail a request on purpose; the log says `failed` for them. The QA fixture (qa/support/qa.ts) reads this set: a request the shim failed under any other mode is a fault of the case, not of the app. */
export const FAILURE_MODES = new Set(["fail429", "fail401", "fail500", "nonet", "empty", "failonce"]);
const FIXED_MODES = new Set(["ok", ...FAILURE_MODES]);

// The AI-use kind of a prompt: a copy of AIU_RULES and classifyAiUse in packages/core/src/aiuse.ts (a preload cannot import the TypeScript sources).
// apps/web/test/qa/shim.test.ts fails when a row here differs from the core's, so change both together.
const AIU_RULES = [
  [/^Continue this writing/, "continuing my draft", "text"],
  [/^Improve this text/, "grammar and polish", "text"],
  [/^Expand this text/, "expanding my text", "text"],
  [/^Translate the following English academic quotation/, "translating a quotation into Hindi", "text"],
  [/academic writing assistant[^]{0,80}Below are/, "drafting a literature review paragraph from selected abstracts", "text"],
  [/APA 7th edition formatting expert/, "formatting statistics output in APA style", "text"],
  [/thesis supervisor reading/, "feedback on my draft", "feedback"],
  [/ask exactly ONE realistic, probing question/, "practice viva questions", "feedback"],
  [/Argue against the passage below/, "counter-arguments to my passage", "feedback"],
  [/find a research gap/, "looking for research gaps in selected abstracts", "feedback"],
  [/judge whether a project idea is realistic/, "checking whether my project idea is realistic", "feedback"],
  [/academic writing coach[^]{0,60}Using the text/, "advice on building a literature review", "feedback"],
  [/Summari[sz]e the (research|paper) text below/, "summarising a paper", "explain"],
  [/helping a [^]{0,40}read a paper/, "summarising a paper", "explain"],
  [/tutor helping a student[^]{0,40}study/, "analysing a case description", "explain"],
  [/^Explain the [^]{0,40}concept/, "explaining a concept", "explain"],
  [/statistics tutor/, "explaining statistics output in plain words", "explain"],
  [/^You are a careful English grammar and usage checker/, "checking grammar and wording", "text"],
  [/bilingual English and Hindi dictionary helper/, "looking up a word", "explain"],
  [/^You are reading the abstract of one research paper/, "reading one abstract quickly", "explain"],
  [/^You are (Professor RAJ|Dr Shuddhi Grant), an AI teaching character/, "asking a teaching character about the practice paper", "explain"],
  [/^You are screening search results for a student/, "ranking search results", "explain"],
  [/^You help a student of .{0,60} search research databases/, "suggesting search terms", "explain"],
  [/^Paraphrase the passage below in the voice/, "trying my style on a practice passage", "explain"],
  [/studying the writing style|^Analyze the writing style/, "describing my writing style", "explain"],
  [/scholarly writing coach/, "answering a writing question", "explain"],
  [/^You are a research-methods coach for a student who is shaping their study/, "thinking through my study plan", "feedback"]
];

/** @param {string} prompt @returns {string | null} classifyAiUse(prompt)?.k */
function classifyKind(prompt) {
  const p = String(prompt || "");
  if (/^You are Appu, the help assistant/.test(p)) return null;
  const head = p.slice(0, 400);
  for (const [re, k] of AIU_RULES) if (re.test(head)) return k;
  return "other help";
}

/** A `match` as a test on the prompt: its start, with `*` for any text between the fixed parts. */
function compileMatch(pattern) {
  if (typeof pattern !== "string" || pattern === "") throw new Error("QA shim: a recorded reply needs a non-empty `match` (an empty one would answer every prompt, and an unknown prompt must stay visible).");
  const parts = pattern.split("*");
  return (prompt) => {
    if (!prompt.startsWith(parts[0])) return false;
    let at = parts[0].length;
    for (let i = 1; i < parts.length; i++) {
      const found = prompt.indexOf(parts[i], at);
      if (found < 0) return false;
      at = found + parts[i].length;
    }
    return true;
  };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const text = (status, body) => new Response(body, { status, headers: { "content-type": "text/plain" } });
const FAILURES = {
  fail429: () => json(429, { error: { message: "Rate limit reached for requests. Please try again later.", type: "rate_limit_exceeded", code: "rate_limit_exceeded" } }),
  fail401: () => json(401, { error: { message: "Invalid API Key", type: "invalid_request_error", code: "invalid_api_key" } }),
  fail500: () => json(500, { error: { message: "The server had an error while processing your request. Sorry about that!", type: "server_error" } })
};

/** @param {Request | URL | string} input */
function urlOf(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Wraps `original` (a fetch) so the AI providers' addresses are answered here and never reached.
 *
 * What a request is answered with comes from its API key, `gsk_qa_<mode>_<random>`:
 *   ok         the recorded reply for the prompt;
 *   fail429    429 (the provider's rate limit);   fail401  401 (a rejected key);   fail500  500, every time (the API retries it three times);
 *   nonet      fetch rejects, as when the connection drops;   empty  200 with no text;
 *   slow<ms>   the recorded reply after that many milliseconds (slow8000);
 *   failonce   the first request with this key answers 429, the later ones answer (the count is per key, and per shim).
 * A prompt no recorded reply fits is answered 400 `QA: no recorded reply for: <its first 120 characters>`, which the API shows as the provider's error.
 * A request to one of those addresses that is not a usable chat request, or whose key is not a test key, is answered 400 with a message that says why (`failed`).
 * A request to Gemini or Anthropic, which are not faked, is answered 400 `QA: provider not faked: <host>` (`refused`). Neither kind is ever passed on.
 *
 * @param {typeof fetch} original
 * @param {ShimOptions} o
 * @returns {typeof fetch}
 */
export function createShimFetch(original, o) {
  const replies = o.replies.map((r) => ({
    test: compileMatch(r.match),
    reply: typeof r.reply === "string" ? r.reply : JSON.stringify(r.reply)
  }));
  const sleep = o.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  /** failonce: the keys that have had their one failure. */
  const failed = new Set();

  return async function shimFetch(input, init) {
    let url;
    try {
      url = new URL(urlOf(input));
    } catch {
      return original(input, init);
    }
    const host = url.hostname;
    const faked = PROVIDER_HOSTS.has(host);
    if (!faked && !REFUSED_HOSTS.has(host)) return original(input, init);

    // Past this point nothing goes to `original`: a provider address is only ever answered here.
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    // Groq, OpenAI, DeepSeek and OpenRouter send the key as a Bearer token; Anthropic as x-api-key, Gemini as x-goog-api-key.
    const bearer = (/^Bearer\s+(.+)$/i.exec(headers.get("authorization") ?? "")?.[1] ?? headers.get("x-api-key") ?? headers.get("x-goog-api-key") ?? "").trim();
    const keyMatch = KEY.exec(bearer);
    const mode = keyMatch ? /** @type {string} */ (keyMatch[1]) : "invalid";
    const slowMs = /^slow(\d+)$/.exec(mode)?.[1];

    let prompt = "";
    /** @type {string | undefined} */
    let model;
    try {
      const raw = init?.body !== undefined ? init.body : input instanceof Request ? await input.clone().text() : undefined;
      const body = JSON.parse(typeof raw === "string" ? raw : "");
      if (faked) {
        if (typeof body?.messages?.[0]?.content === "string") prompt = body.messages[0].content;
      } else {
        // Only to say, in the log, which feature reached a provider that is not faked: Anthropic's messages[0].content, Gemini's contents[0].parts[0].text.
        const asked = body?.messages?.[0]?.content ?? body?.contents?.[0]?.parts?.[0]?.text;
        if (typeof asked === "string") prompt = asked;
      }
      if (typeof body?.model === "string") model = body.model;
    } catch {
      // Not JSON: handled below, as a request with no prompt.
    }

    /** @type {ShimLogEntry} */
    const entry = { t: Date.now(), key: keyMatch ? bearer : "<not a QA key>", mode, host, kind: prompt ? classifyKind(prompt) : null, prompt, outcome: "failed" };
    const refuse = (status, message, outcome) => { entry.outcome = outcome; o.log(entry); return text(status, message); };

    if (!faked) return refuse(400, "QA: provider not faked: " + host, "refused");
    if (!url.pathname.endsWith("/chat/completions") || !prompt) {
      return refuse(400, `QA: the fake provider answers chat completions with a prompt in messages[0].content; got ${init?.method ?? "GET"} ${host}${url.pathname}`, "failed");
    }
    if (!keyMatch) {
      return refuse(400, "QA: the API key is not a gsk_qa_<mode>_<random> test key. The fake provider answers test keys only and never passes a request on to the real provider.", "failed");
    }
    if (!FIXED_MODES.has(mode) && slowMs === undefined) {
      return refuse(400, `QA: unknown key mode "${mode}" in a gsk_qa_<mode>_<random> key. Modes: ok, fail429, fail401, fail500, nonet, empty, slow<ms>, failonce.`, "failed");
    }

    if (Object.hasOwn(FAILURES, mode)) {
      o.log(entry);
      return /** @type {Record<string, () => Response>} */ (FAILURES)[mode]();
    }
    if (mode === "failonce" && !failed.has(bearer)) {
      failed.add(bearer);
      o.log(entry);
      return FAILURES.fail429();
    }
    if (mode === "nonet") {
      o.log(entry);
      throw new TypeError("fetch failed");
    }
    if (mode === "empty") {
      o.log(entry);
      return answer("", model);
    }

    // ok, slow<ms>, failonce after its failure.
    const recorded = replies.find((r) => r.test(prompt));
    if (!recorded) return refuse(400, "QA: no recorded reply for: " + prompt.slice(0, 120), "unknown");
    entry.outcome = "answered";
    o.log(entry);
    if (slowMs !== undefined) await sleep(Number(slowMs));
    return answer(recorded.reply, model);
  };
}

/** The OpenAI chat-completions answer the API reads (`choices[0].message.content`). */
function answer(content, model) {
  return json(200, {
    id: "chatcmpl-qa-" + Math.random().toString(36).slice(2, 12),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: model ?? "qa-model",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }]
  });
}
