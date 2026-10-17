import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole, type DOMWindow } from "jsdom";

/** Dr. Sharma's v1 (`appuscholer/index.html`) running in jsdom: its own functions, called as the page calls them. */
export type V1 = {
  window: DOMWindow;
  document: Document;
  build: string;
  sha256: string;
  lines: number;
  call<T = unknown>(name: string, ...args: unknown[]): T;
  eval<T = unknown>(expr: string): T;
  editor(): HTMLElement;
  setEditorHtml(html: string): void;
  selectEditor(): void;
  setValue(id: string, value: string): void;
  stubCallAI(reply?: string): Array<{ prompt: string; opts: Record<string, unknown> }>;
  toasts: string[];
};

const PACKAGE_DIR = fileURLToPath(new URL("../../../", import.meta.url));
/** The sibling checkout on OJ's Mac. */
const DEFAULT_INDEX = resolve(PACKAGE_DIR, "../../../appuscholer/index.html");

/**
 * Loads v1 the way port-audit-evidence/01-drive-v1-in-jsdom.cjs does. `indexPath`, else `V1_INDEX`, else the sibling checkout;
 * a relative path is taken from the directory the command was typed in (pnpm runs scripts in the package, but keeps that directory in INIT_CWD).
 */
export async function loadV1(indexPath?: string): Promise<V1> {
  const given = indexPath ?? process.env.V1_INDEX;
  const file = given ? resolve(process.env.INIT_CWD ?? process.cwd(), given) : DEFAULT_INDEX;
  const bytes = readFileSync(file);
  const text = bytes.toString("utf8");
  const dom = new JSDOM(text.replace(/<script src="https:[^>]*><\/script>/g, ""), {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "http://localhost/",
    // A VirtualConsole with no listeners swallows jsdom's errors and v1's console output.
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      const proto = w.HTMLElement.prototype as unknown as { showModal(this: { open: boolean }): void; close(this: { open: boolean }): void };
      proto.showModal = function () { this.open = true; };
      proto.close = function () { this.open = false; };
      w.matchMedia = w.matchMedia || ((() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {} })) as unknown as typeof w.matchMedia);
      w.TextEncoder = TextEncoder;
      w.TextDecoder = TextDecoder;
      // jsdom's `crypto` is a getter (no `subtle`): plain assignment throws in this strict module and is silently dropped in evidence 01's sloppy script.
      Object.defineProperty(w, "crypto", { value: webcrypto, configurable: true, enumerable: true, writable: true });
      w.scrollTo = () => {};
      w.Element.prototype.scrollIntoView = () => {};
    },
  });
  await new Promise((done) => setTimeout(done, 1500)); // v1's start-up timers
  const window = dom.window;
  const toasts: string[] = [];
  window.actLog = () => {};
  window.showToast = (m: unknown) => { toasts.push(String(m)); };
  const evalIn = <T = unknown>(expr: string): T => window.eval(expr) as T;
  const editor = () => evalIn<HTMLElement>("editor");
  return {
    window,
    document: window.document,
    build: evalIn<string>("APP_BUILD"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    lines: text.split("\n").length - (text.endsWith("\n") ? 1 : 0),
    // v1's top-level `function` declarations are window properties; `const`/`let` bindings are reached through eval.
    call<T = unknown>(name: string, ...args: unknown[]): T {
      const fn: unknown = window[name];
      if (typeof fn !== "function") throw new Error(`v1 has no function ${name}`);
      return Reflect.apply(fn, window, args) as T;
    },
    eval: evalIn,
    editor,
    setEditorHtml(html) { editor().innerHTML = html; },
    // hasSelection() and selText() (v1 5553–5554) then see the whole editor.
    selectEditor() { evalIn("savedRange=document.createRange();savedRange.selectNodeContents(editor)"); },
    setValue(id, value) {
      const el = window.document.getElementById(id);
      if (!el || !("value" in el)) throw new Error(`v1 has no field #${id}`);
      (el as HTMLInputElement).value = value;
    },
    stubCallAI(reply = "OK") {
      const calls: Array<{ prompt: string; opts: Record<string, unknown> }> = [];
      window.callAI = async (prompt: unknown, opts?: Record<string, unknown>) => {
        calls.push({ prompt: String(prompt), opts: { ...opts } });
        return reply;
      };
      return calls;
    },
    toasts,
  };
}
