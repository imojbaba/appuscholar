import type { BrowserContext, Dialog, Page } from "@playwright/test";
import { QA_API_ORIGIN, QA_WEB_ORIGIN } from "./origins";

/**
 * The watcher (spec section 8): it runs through every case and records an Error for what no step looked for. It records; the `qa` fixture (qa.ts) turns what it recorded
 * into findings in the case's result. It listens on browser contexts: the fixture's own from the start, and any other the case makes once it says `qa.watch(context)`.
 * Every page of a watched context is watched, a pop-up and a second tab included.
 *
 * The rules, and what a case can do about each:
 *  - pageerror   an uncaught script error in the page.
 *  - console     a console error, unless `allow({ consoleErrors })` has an entry (a pattern and the reason) that matches its text. The browser's own console line for a failing
 *                resource ("Failed to load resource: the server responded with a status of 404") and for a security-policy violation is the echo of a finding another rule owns.
 *  - status      an answer of 500 or more from the web app or the API, or a 4xx from anywhere, unless an allowed response fits it: `allow({ responses })` names the method, the path,
 *                the status and the reason, and nothing broader (a bare status would hide a real 404 or 500 elsewhere). A short built-in list holds the answers every case meets.
 *                A 5xx from another address is the case's own doing (an outside service it made fail) and is not looked at.
 *  - host        a request to any host except localhost and `allow({ hosts })`.
 *  - dialog      an alert, confirm, prompt or "Leave site?" that `expectDialog` did not announce. It is dismissed. An announced dialog is answered as announced, once;
 *                one that never comes is NOT CHECKED in the result.
 *  - csp         a `securitypolicyviolation`. An init script reports each one (and keeps them in `window.__qaCsp`), so a navigation does not lose it.
 *                A refusal of `eval` is kept as a note, not a finding (EVAL_PROBE below).
 *  - reload      a load of a page that nothing explains. `page.goto`, `reload`, `goBack`, `goForward` and `setContent` are wrapped, on every watched page, and each excuses the
 *                one load it causes; so does the first load of a page the app opens (a pop-up), and each `expectLoad` for a load a click causes. Any other load (the app
 *                reloading itself, a plain link, a script setting `location`) is a finding. An announced load that never comes is NOT CHECKED in the result.
 * An allow applies from the moment it is called. A finding that repeats is shown once with its count. Every allowance, built-in or the case's, is listed in the result
 * with the number of times it excused something.
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

/** An answer the case expects from a server, by method, path and status. The reason says why it is expected. */
export type ResponseAllowance = { method: string; path: RegExp; status: number; reason: string };
/** A console error the case expects, by a pattern on its text. The reason says why it is expected. */
export type ConsoleAllowance = { match: RegExp; reason: string };
export type Allow = { hosts?: string[]; consoleErrors?: ConsoleAllowance[]; responses?: ResponseAllowance[] };
export type DialogType = "alert" | "confirm" | "prompt" | "beforeunload";
export type Finding = { rule: WatcherRule; message: string; step?: string };

/** What an allowance excused in a case, for the result: what it is, why, whether it is built in, and how many times it excused something. */
export type Allowance = { kind: "response" | "console" | "host"; what: string; reason?: string; builtIn: boolean; count: number };
/** Something the watcher saw and did not count as an Error, with how many times: information for the report. */
export type Note = { kind: "csp-eval-probe"; detail: string; count: number };
/** Something announced (a dialog, a load) that did not come: the result holds it as NOT CHECKED. */
export type Unmet = { label: string; message: string };

/** The answers every case meets, with the reason for each. Add one only when a real case meets it. */
const BUILT_IN_RESPONSES: ResponseAllowance[] = [
  {
    method: "GET",
    path: /^\/me\/vault$/,
    status: 404,
    reason: "an account with no vault yet: the api answers GET /me/vault with a 404 (\"record or 404\", apps/web/lib/vault/useVault.tsx)"
  }
];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const NETWORK_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);
/** The console line the browser writes for a response that was an error; the response events decide what to do about the response itself. */
const RESOURCE_ECHO = /^Failed to load resource: the server responded with a status of \d+/;
/**
 * The production CSP has no 'unsafe-eval' (apps/web/proxy.ts), and libraries in the bundle test for it by calling `Function("")` or `Function("return this")()` and catching the
 * refusal (zod's `allowsEval` probe, core-js and underscore finding the global object). The browser still reports each refusal as a violation, on every page load, though nothing
 * depends on it. Counting those would fail every case. Code that really needs eval does not hide: it throws an EvalError, which the watcher reports as an error in the page or
 * the case's own checks see in what did not work. So a script-src refusal of `eval` is not a finding; it is kept as a note in the result, and in window.__qaCsp.
 */
const isEvalProbe = (v: { effectiveDirective?: string; blockedURI?: string }) => v.blockedURI === "eval" && (v.effectiveDirective ?? "").startsWith("script-src");

/** The navigations a case starts; each is asked for, and the load it causes is expected. The index is where its options argument is. */
const NAVIGATIONS = { goto: 1, reload: 0, goBack: 0, goForward: 0, setContent: 1 } as const;

/** One load of a page that is expected: asked for by a wrapped navigation, announced with `expectLoad`, or the first load of a page the app opened. */
type LoadToken = { consumed: boolean; announced: boolean };

function parse(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

const withoutStateFlags = (r: RegExp) => new RegExp(r.source, r.flags.replace(/[gy]/g, ""));

function needReason(what: string, reason: unknown): string {
  if (typeof reason !== "string" || !reason.trim()) throw new Error(`QA allow: ${what} needs a reason (why this is expected).`);
  return reason;
}

export class Watcher {
  private readonly found: Finding[] = [];
  private readonly hosts = new Map<string, Allowance>();
  private readonly consoleAllowed: Array<{ match: RegExp; entry: Allowance }> = [];
  private readonly responsesAllowed: Array<{ method: string; path: RegExp; status: number; entry: Allowance }> = [];
  private readonly dialogs: Array<{ type: DialogType; accept: boolean }> = [];
  private readonly noted = new Map<string, Note>();
  /** The status of the last response to each address, to tell the console's echo of an error response from a console error of the page's own. */
  private readonly statusOf = new Map<string, number>();
  /** The watched contexts. */
  private readonly contexts = new Set<BrowserContext>();
  /** The loads each watched page is expecting. */
  private readonly loads = new Map<Page, LoadToken[]>();

  constructor(private readonly o: { step: () => string | undefined; webOrigin?: string; apiOrigin?: string }) {
    for (const r of BUILT_IN_RESPONSES) this.addResponse(r, true);
  }

  /** Watches the page's browser context, or this one, and every page it has and opens. Again for a context already watched does nothing. Call it before the context opens its pages. */
  async watch(target: Page | BrowserContext): Promise<void> {
    const context = "newPage" in target ? target : target.context();
    if (this.contexts.has(context)) return;
    this.contexts.add(context);
    await this.listen(context);
  }

  allow(o: Allow): void {
    for (const h of o.hosts ?? []) {
      const key = h.toLowerCase();
      if (!this.hosts.has(key)) this.hosts.set(key, { kind: "host", what: key, builtIn: false, count: 0 });
    }
    for (const c of o.consoleErrors ?? []) {
      const entry: Allowance = { kind: "console", what: String(c.match), reason: needReason(`the console error ${c.match}`, c.reason), builtIn: false, count: 0 };
      this.consoleAllowed.push({ match: withoutStateFlags(c.match), entry });
    }
    for (const r of o.responses ?? []) this.addResponse(r, false);
  }

  /** The next dialog of this type is expected, and is accepted or dismissed as given. */
  expectDialog(type: DialogType, accept: boolean): void {
    this.dialogs.push({ type, accept });
  }

  /** The next load of this page is expected (a click that really navigates, such as a deleted account landing on the sign-in page). */
  expectLoad(page: Page): void {
    const tokens = this.loads.get(page);
    if (!tokens) throw new Error("QA: expectLoad() was given a page the watcher does not watch. Call qa.watch(context) for a context the case made, before it opens its pages.");
    tokens.push({ consumed: false, announced: true });
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

  /** What the case announced and did not get. */
  unmet(): Unmet[] {
    const out: Unmet[] = [];
    for (const d of this.dialogs) {
      out.push({ label: `NOT CHECKED: an announced ${d.type}() dialog did not come`, message: `expectDialog("${d.type}", ${d.accept}) was called and no such dialog appeared, so what the case expected of it was not looked at` });
    }
    for (const [page, tokens] of this.loads) {
      for (const t of tokens) {
        if (t.announced && !t.consumed) {
          out.push({ label: "NOT CHECKED: an announced page load did not come", message: `expectLoad() was called for the page now on ${this.where(page)} and it did not load again, so what the case expected of the new page was not looked at` });
        }
      }
    }
    return out;
  }

  /** The allowances that excused something, and every one the case made, with their counts. */
  allowances(): Allowance[] {
    return [...this.hosts.values(), ...this.consoleAllowed.map((c) => c.entry), ...this.responsesAllowed.map((r) => r.entry)].filter((a) => !a.builtIn || a.count > 0).map((a) => ({ ...a }));
  }

  notes(): Note[] {
    return [...this.noted.values()].map((n) => ({ ...n }));
  }

  private addResponse(r: ResponseAllowance, builtIn: boolean): void {
    const method = r.method.toUpperCase();
    const what = `${method} ${r.path} answered ${r.status}`;
    const entry: Allowance = { kind: "response", what, reason: needReason(what, r.reason), builtIn, count: 0 };
    this.responsesAllowed.push({ method, path: withoutStateFlags(r.path), status: r.status, entry });
  }

  private add(rule: WatcherRule, message: string): void {
    const step = this.o.step();
    this.found.push({ rule, message, ...(step ? { step } : {}) });
  }

  private note(kind: Note["kind"], detail: string): void {
    const key = `${kind}\n${detail}`;
    const seen = this.noted.get(key);
    if (seen) seen.count++;
    else this.noted.set(key, { kind, detail, count: 1 });
  }

  private where(page: Page | null | undefined): string {
    if (!page) return "a page that has closed";
    const u = parse(page.url());
    return u && NETWORK_PROTOCOLS.has(u.protocol) ? u.pathname : page.url();
  }

  private async listen(context: BrowserContext): Promise<void> {
    const web = this.o.webOrigin ?? QA_WEB_ORIGIN;
    const api = this.o.apiOrigin ?? QA_API_ORIGIN;

    context.on("weberror", (e) => {
      const error = e.error();
      this.add("pageerror", `${error.message || String(error)} (on ${this.where(e.page())})`);
    });

    context.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      const allowed = this.consoleAllowed.find((c) => c.match.test(text));
      if (allowed) {
        allowed.entry.count++;
        return;
      }
      if (RESOURCE_ECHO.test(text) && (this.statusOf.get(msg.location().url) ?? 0) >= 400) return;
      this.add("console", `${text.slice(0, 300)} (on ${this.where(msg.page())})`);
    });

    context.on("response", (res) => {
      const status = res.status();
      this.statusOf.set(res.url(), status);
      const u = parse(res.url());
      if (status < 400 || !u || !NETWORK_PROTOCOLS.has(u.protocol)) return;
      const ours = u.origin === web || u.origin === api;
      if (status >= 500 && !ours) return;
      const method = res.request().method();
      const allowed = this.responsesAllowed.find((r) => r.method === method && r.status === status && r.path.test(u.pathname));
      if (allowed) {
        allowed.entry.count++;
        return;
      }
      const who = u.origin === api ? "the API" : u.origin === web ? "the web app" : u.host;
      this.add("status", `${status} from ${who}: ${method} ${u.pathname}`);
    });

    context.on("request", (req) => {
      const u = parse(req.url());
      if (!u || !NETWORK_PROTOCOLS.has(u.protocol) || LOCAL_HOSTS.has(u.hostname)) return;
      const allowed = this.hosts.get(u.hostname) ?? this.hosts.get(u.host);
      if (allowed) {
        allowed.count++;
        return;
      }
      // The path, never the query: a query can carry a key or a student's words.
      this.add("host", `${u.host}: ${req.method()} ${u.origin}${u.pathname}`);
    });

    context.on("dialog", (dialog) => this.onDialog(dialog));
    // A page the app (or the case) opens from here on. Its first load is the page opening.
    context.on("page", (page) => this.watchPage(page, true));

    // Security-policy violations: reported to the watcher the moment they happen (a navigation would lose the page's own list), and kept in window.__qaCsp.
    await context.exposeBinding("__qaCspReport", (source, json: string) => {
      const v = JSON.parse(json) as { violatedDirective: string; effectiveDirective?: string; blockedURI: string; sourceFile?: string; lineNumber?: number; sample?: string };
      const from = parse(v.sourceFile ?? "");
      const at = from && NETWORK_PROTOCOLS.has(from.protocol) ? ` from ${from.pathname}:${v.lineNumber ?? 0}` : "";
      if (isEvalProbe(v)) {
        this.note("csp-eval-probe", `${v.violatedDirective} refused eval${at}`);
        return;
      }
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

    for (const page of context.pages()) this.watchPage(page, false);
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

  /**
   * Watches a page's loads, and wraps the navigations a case starts so that each excuses the one load it causes. Every other load is a finding.
   * `opened`: the page was opened after the context was watched (a pop-up, or `context.newPage()`), so its first load is the page opening, and is expected.
   */
  private watchPage(page: Page, opened: boolean): void {
    if (this.loads.has(page)) return;
    const tokens: LoadToken[] = opened ? [{ consumed: false, announced: false }] : [];
    this.loads.set(page, tokens);
    page.on("load", () => {
      const expected = tokens.find((x) => !x.consumed);
      if (expected) expected.consumed = true;
      else this.add("reload", `the page loaded again with nobody asking (on ${this.where(page)})`);
    });
    for (const [name, optionsAt] of Object.entries(NAVIGATIONS)) {
      const target = page as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const original = target[name]!.bind(page);
      target[name] = async (...args: unknown[]) => {
        const token: LoadToken = { consumed: false, announced: false };
        tokens.push(token);
        const waitUntil = (args[optionsAt] as { waitUntil?: string } | undefined)?.waitUntil ?? "load";
        try {
          return await original(...args);
        } finally {
          // Once the call has waited for the load, a navigation that caused none (the same document, a hash) leaves nothing behind to excuse a later one.
          // A call that returned earlier (commit, domcontentloaded) keeps its token until its load arrives.
          if (token.consumed || waitUntil === "load" || waitUntil === "networkidle") tokens.splice(tokens.indexOf(token), 1);
        }
      };
    }
  }
}
