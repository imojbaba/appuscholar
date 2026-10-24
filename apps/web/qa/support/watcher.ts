import type { BrowserContext, Dialog, Page } from "@playwright/test";
import { QA_API_ORIGIN, QA_WEB_ORIGIN } from "./origins";

/**
 * The watcher (spec section 8): it runs through every case and records an Error for what no step looked for. It listens on the browser context, so a second tab
 * and a pop-up are watched as the first page is. It records; the `qa` fixture (qa.ts) turns what it recorded into findings in the case's result.
 *
 * The rules, and what a case can do about each:
 *  - pageerror   an uncaught script error in the page.
 *  - console     a console error, unless `allow({ consoleErrors })` matches its text. The browser's own console line for a failing resource ("Failed to load
 *                resource: the server responded with a status of 404") and for a security-policy violation is the echo of a finding another rule owns, and is not a second one.
 *  - status      an answer of 500 or more from the web app or the API, or a 4xx from anywhere, unless `allow({ statuses })` lists the status (4xx or 5xx: a case that
 *                makes the provider fail expects the API's 502). A 5xx from another address is the case's own doing (an outside service it made fail) and is not looked at.
 *  - host        a request to any host except localhost and `allow({ hosts })`.
 *  - dialog      an alert, confirm, prompt or "Leave site?" that `expectDialog` did not announce. It is dismissed. An announced dialog is answered as announced, once.
 *  - csp         a `securitypolicyviolation`. An init script reports each one (and keeps them in `window.__qaCsp`), so a navigation does not lose it.
 *                One kind is not counted: a refusal of `eval` / `new Function` (see EVAL_PROBE below).
 *  - reload      a load of the main page that no `qa`-initiated navigation explains. `page.goto`, `reload`, `goBack`, `goForward` and `setContent` are wrapped and each
 *                excuses the one load it causes. Any other load (the app reloading itself, a plain link, a script setting `location`) is a finding.
 * An allow applies from the moment it is called. A finding that repeats is shown once with its count.
 */
export type WatcherRule = "pageerror" | "console" | "status" | "host" | "dialog" | "csp" | "reload" | "provider";

/** The words each rule is reported under. */
export const RULE_LABEL: Record<WatcherRule, string> = {
  pageerror: "uncaught error in the page",
  console: "console error",
  status: "answer from a server that is an error",
  host: "request to a host the case did not allow",
  dialog: "browser pop-up nobody expected",
  csp: "security-policy (CSP) violation",
  reload: "page load nobody asked for",
  provider: "AI provider request nobody could answer"
};

export type Allow = { hosts?: string[]; consoleErrors?: RegExp[]; statuses?: number[] };
export type DialogType = "alert" | "confirm" | "prompt" | "beforeunload";
export type Finding = { rule: WatcherRule; message: string; step?: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const NETWORK_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);
/** The console line the browser writes for a response that was an error; the response events decide what to do about the response itself. */
const RESOURCE_ECHO = /^Failed to load resource: the server responded with a status of \d+/;
/**
 * The production CSP has no 'unsafe-eval' (apps/web/proxy.ts), and libraries in the bundle test for it by calling `Function("")` or `Function("return this")()` and catching the
 * refusal (zod's `allowsEval` probe, core-js and underscore finding the global object). The browser still reports each refusal as a violation, on every page load, though nothing
 * depends on it. Counting those would fail every case. Code that really needs eval does not hide: it throws an EvalError, which the watcher reports as an error in the page or
 * the case's own checks see in what did not work. So a script-src refusal of `eval` is the one violation the watcher does not count (it stays in window.__qaCsp).
 */
const isEvalProbe = (v: { effectiveDirective?: string; blockedURI?: string }) => v.blockedURI === "eval" && (v.effectiveDirective ?? "").startsWith("script-src");

/** The navigations a case starts; each is asked for, and the load it causes is expected. The index is where its options argument is. */
const NAVIGATIONS = { goto: 1, reload: 0, goBack: 0, goForward: 0, setContent: 1 } as const;

function parse(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

export class Watcher {
  private readonly found: Finding[] = [];
  private readonly allowedHosts = new Set<string>();
  private readonly allowedConsole: RegExp[] = [];
  private readonly allowedStatuses = new Set<number>();
  private readonly dialogs: Array<{ type: DialogType; accept: boolean }> = [];
  /** The status of the last response to each address, to tell the console's echo of an error response from a console error of the page's own. */
  private readonly statusOf = new Map<string, number>();
  /** The loads the case asked for that have not happened yet. */
  private readonly expectedLoads: Array<{ consumed: boolean }> = [];

  constructor(private readonly o: { context: BrowserContext; page: Page; step: () => string | undefined; webOrigin?: string; apiOrigin?: string }) {}

  /** Starts listening. Call it once, before the case does anything. */
  async start(): Promise<void> {
    const { context, page } = this.o;
    const web = this.o.webOrigin ?? QA_WEB_ORIGIN;
    const api = this.o.apiOrigin ?? QA_API_ORIGIN;

    context.on("weberror", (e) => {
      const error = e.error();
      this.add("pageerror", `${error.message || String(error)} (on ${this.where(e.page())})`);
    });

    context.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (this.allowedConsole.some((r) => r.test(text))) return;
      if (RESOURCE_ECHO.test(text) && (this.statusOf.get(msg.location().url) ?? 0) >= 400) return;
      this.add("console", `${text.slice(0, 300)} (on ${this.where(msg.page())})`);
    });

    context.on("response", (res) => {
      const status = res.status();
      this.statusOf.set(res.url(), status);
      const u = parse(res.url());
      if (status < 400 || !u || !NETWORK_PROTOCOLS.has(u.protocol) || this.allowedStatuses.has(status)) return;
      const ours = u.origin === web || u.origin === api;
      if (status >= 500 && !ours) return;
      const who = u.origin === api ? "the API" : u.origin === web ? "the web app" : u.host;
      this.add("status", `${status} from ${who}: ${res.request().method()} ${u.pathname}`);
    });

    context.on("request", (req) => {
      const u = parse(req.url());
      if (!u || !NETWORK_PROTOCOLS.has(u.protocol)) return;
      if (LOCAL_HOSTS.has(u.hostname) || this.allowedHosts.has(u.hostname) || this.allowedHosts.has(u.host)) return;
      // The path, never the query: a query can carry a key or a student's words.
      this.add("host", `${u.host}: ${req.method()} ${u.origin}${u.pathname}`);
    });

    context.on("dialog", (dialog) => this.onDialog(dialog));

    // Security-policy violations: reported to the watcher the moment they happen (a navigation would lose the page's own list), and kept in window.__qaCsp.
    await context.exposeBinding("__qaCspReport", (source, json: string) => {
      const v = JSON.parse(json) as { violatedDirective: string; effectiveDirective?: string; blockedURI: string; sourceFile?: string; lineNumber?: number; sample?: string };
      if (isEvalProbe(v)) return;
      const from = parse(v.sourceFile ?? "");
      const at = from && NETWORK_PROTOCOLS.has(from.protocol) ? ` from ${from.pathname}:${v.lineNumber ?? 0}` : "";
      const sample = v.sample ? `: ${v.sample.slice(0, 80)}` : "";
      this.add("csp", `${v.violatedDirective} blocked ${v.blockedURI || "a resource"}${at}${sample} (on ${this.where(source.page)})`);
    });
    await context.addInitScript(() => {
      const w = window as unknown as { __qaCsp?: unknown[]; __qaCspReport?: (json: string) => Promise<void> };
      w.__qaCsp = [];
      document.addEventListener(
        "securitypolicyviolation",
        (e) => {
          const v = { violatedDirective: e.violatedDirective, effectiveDirective: e.effectiveDirective, blockedURI: e.blockedURI, sourceFile: e.sourceFile, lineNumber: e.lineNumber, sample: e.sample, disposition: e.disposition };
          w.__qaCsp?.push(v);
          // The binding goes away with the page it was called from.
          w.__qaCspReport?.(JSON.stringify(v))?.catch(() => {});
        },
        true
      );
    });

    this.watchLoads(page);
  }

  allow(o: Allow): void {
    for (const h of o.hosts ?? []) this.allowedHosts.add(h.toLowerCase());
    // A copy without g and y: a regular expression that remembers where it stopped would answer differently the second time.
    for (const r of o.consoleErrors ?? []) this.allowedConsole.push(new RegExp(r.source, r.flags.replace(/[gy]/g, "")));
    for (const s of o.statuses ?? []) this.allowedStatuses.add(s);
  }

  /** The next dialog of this type is expected, and is accepted or dismissed as given. */
  expectDialog(type: DialogType, accept: boolean): void {
    this.dialogs.push({ type, accept });
  }

  /** What was found so far, oldest first, a repeated finding once with its count. */
  findings(): Finding[] {
    const hasCsp = this.found.some((f) => f.rule === "csp");
    const out = new Map<string, Finding & { count: number }>();
    for (const f of this.found) {
      // The console line for a violation is the browser echoing a finding the csp rule already holds.
      if (hasCsp && f.rule === "console" && f.message.includes("Content Security Policy")) continue;
      const key = `${f.rule}\n${f.message}`;
      const seen = out.get(key);
      if (seen) seen.count++;
      else out.set(key, { ...f, count: 1 });
    }
    return [...out.values()].map(({ count, ...f }) => (count > 1 ? { ...f, message: `${f.message} (seen ${count} times)` } : f));
  }

  private add(rule: WatcherRule, message: string): void {
    const step = this.o.step();
    this.found.push({ rule, message, ...(step ? { step } : {}) });
  }

  private where(page: Page | null | undefined): string {
    if (!page) return "a page that has closed";
    const u = parse(page.url());
    return u && NETWORK_PROTOCOLS.has(u.protocol) ? u.pathname : page.url();
  }

  private onDialog(dialog: Dialog): void {
    const type = dialog.type() as DialogType;
    const i = this.dialogs.findIndex((d) => d.type === type);
    // A dialog answered after its page is gone throws; there is nothing left to answer.
    const answer = (accept: boolean) => (accept ? dialog.accept() : dialog.dismiss()).catch(() => {});
    if (i >= 0) {
      const [expected] = this.dialogs.splice(i, 1);
      void answer(expected!.accept);
      return;
    }
    this.add("dialog", `${type}() with the text "${dialog.message().slice(0, 200)}", dismissed (on ${this.where(dialog.page())})`);
    void answer(false);
  }

  /** Wraps the navigations a case starts so that each excuses the one load it causes, and flags every other load of the main page. */
  private watchLoads(page: Page): void {
    page.on("load", () => {
      const expected = this.expectedLoads.find((x) => !x.consumed);
      if (expected) expected.consumed = true;
      else this.add("reload", `the page loaded again with nobody asking (on ${this.where(page)})`);
    });
    for (const [name, optionsAt] of Object.entries(NAVIGATIONS)) {
      const target = page as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const original = target[name]!.bind(page);
      target[name] = async (...args: unknown[]) => {
        const token = { consumed: false };
        this.expectedLoads.push(token);
        const waitUntil = (args[optionsAt] as { waitUntil?: string } | undefined)?.waitUntil ?? "load";
        try {
          return await original(...args);
        } finally {
          // Once the call has waited for the load, a navigation that caused none (the same document, a hash) leaves nothing behind to excuse a later one.
          // A call that returned earlier (commit, domcontentloaded) keeps its token until its load arrives.
          if (token.consumed || waitUntil === "load" || waitUntil === "networkidle") this.expectedLoads.splice(this.expectedLoads.indexOf(token), 1);
        }
      };
    }
  }
}
