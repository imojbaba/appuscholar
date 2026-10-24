// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/p/abc123/design/budget";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
// The mail app is opened by setting the address; jsdom cannot follow a mailto: link, so the test watches the one place that does it.
vi.mock("@/lib/help/report/mail", () => ({ openMail: vi.fn() }));

import { HelpButtons } from "@/components/help/HelpButtons";
import { ChromeExtras } from "@/components/help/ChromeExtras";
import { ErrorSlot } from "@/components/help/slots/ErrorSlot";
import { ToastHost } from "@/components/ui/toast";
import { SessionProvider } from "@/lib/session";
import { clearErrors, noteError, readErrors } from "@/lib/help/report/errorRing";
import { openMail } from "@/lib/help/report/mail";
import { bumpUsage } from "@/lib/help/report/usage";
import { APP_VERSION } from "@/lib/version";
import { DICTS } from "@/lib/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const T = (k: string) => DICTS.en[k]!;

let host: HTMLElement;
let root: ReturnType<typeof createRoot>;
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid=${id}]`);
const settle = async () => { await act(async () => { await Promise.resolve(); }); };
/** Types into a React-controlled box the way a keyboard does. */
const typeInto = async (id: string, value: string) => {
  const ta = q(id) as unknown as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(ta, value);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const stubClipboard = (writeText: (s: string) => Promise<void>) => Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

async function open() {
  await act(async () => { root.render(<HelpButtons />); });
  await act(async () => { q("help-report")!.click(); });
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  localStorage.clear();
  clearErrors();
  vi.mocked(openMail).mockClear();
  pathname = "/p/abc123/design/budget";
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  vi.unstubAllEnvs();
});

describe("Report a problem (Task C4)", () => {
  it("adds one button to Help's wave C row", async () => {
    await act(async () => { root.render(<HelpButtons />); });
    expect(q("help-report")?.textContent).toContain(T("wc_rep_btn"));
  });

  it("shows v1's words and the preview of what the app adds; opening it counts nothing", async () => {
    await open();
    const dlg = q("report-dialog")!;
    expect(dlg.textContent).toContain(T("wc_rep_desc"));
    expect(dlg.textContent).toContain(T("wc_rep_added_h"));
    expect(dlg.textContent).toContain(T("wc_rep_added"));
    expect(dlg.textContent).toContain(T("wc_rep_usage_tick"));
    const facts = q("report-facts")!.textContent!;
    expect(facts).toContain("Tool open: design/budget");
    expect(facts).toContain("Recent errors: none");
    expect(facts).not.toContain("abc123");
    expect(localStorage.getItem("appu_usage")).toBeNull();
  });

  it("the counts show in the preview only when the box is ticked, and Clear the counts empties appu_usage", async () => {
    bumpUsage("design/budget");
    await open();
    expect(q("report-facts")!.textContent).not.toContain("Tool opens:");
    expect(q("report-local")!.textContent).toContain("Tool opens: design/budget 1");
    await act(async () => { q("report-usage")!.click(); });
    expect(q("report-facts")!.textContent).toContain("Tool opens: design/budget 1");
    await act(async () => { q("report-clear")!.click(); });
    expect(localStorage.getItem("appu_usage")).toBeNull();
    expect(q("report-status")!.textContent).toBe(T("wc_rep_cleared"));
    expect(q("report-local")!.textContent).toContain("Tool opens: nothing yet");
  });

  it("shows a masked error in the preview", async () => {
    noteError("Failed for asha.rao@example.com", "a.js:1", "writing");
    await open();
    const facts = q("report-facts")!.textContent!;
    expect(facts).toContain("[email]");
    expect(facts).not.toContain("asha.rao");
  });

  it("Copy the report writes the description, the divider and the facts to the clipboard and says so in the dialog (no toast)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    await act(async () => { root.render(<><ToastHost /><HelpButtons /></>); });
    await act(async () => { q("help-report")!.click(); });
    expect(q("toast-host")).not.toBeNull(); // the toast host is on the page, so "no toast" below means something
    await typeInto("report-text", "The budget total did not update.");
    await act(async () => { q("report-copy")!.click(); });
    await settle();
    const text = writeText.mock.calls[0]![0] as string;
    expect(text.startsWith("The budget total did not update.\n\n--- Added by the app ---\nAppuscholar build: ")).toBe(true);
    expect(text).toContain("Tool open: design/budget");
    expect(q("report-status")!.textContent).toBe(T("wc_rep_copied"));
    expect(q("toast")).toBeNull();
  });

  it("says so inline when the clipboard refuses", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("no")) }, configurable: true });
    await open();
    await act(async () => { q("report-copy")!.click(); });
    await settle();
    expect(q("report-status")!.textContent).toBe(T("wc_rep_copy_fail"));
  });

  it("has no mail button without NEXT_PUBLIC_SUPPORT_EMAIL, and shows Help's unset line instead", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "");
    await open();
    expect(q("report-mail")).toBeNull();
    expect(q("report-dialog")!.textContent).toContain(T("help_contact_unset"));
  });

  it("has the mail button when a support address is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "help@example.org");
    await open();
    expect(q("report-mail")?.textContent).toContain(T("wc_rep_mail"));
    expect(q("report-dialog")!.textContent).not.toContain(T("help_contact_unset"));
    expect(q("report-dialog")!.textContent).toContain(T("wc_rep_closing"));
  });

  it("the error slot draws nothing and records errors while mounted", async () => {
    await act(async () => { root.render(<ChromeExtras />); });
    expect(host.innerHTML).toBe("");
    window.dispatchEvent(new ErrorEvent("error", { message: "late failure", filename: "x/y.js", lineno: 3 }));
    expect(readErrors().map((e) => e.message)).toEqual(["late failure"]);
    await act(async () => { root.render(<HelpButtons />); });
    await act(async () => { q("help-report")!.click(); });
    expect(q("report-facts")!.textContent).toContain("late failure (y.js:3)");
  });

  it("an error that happens while the dialog is open shows in the preview and is in what is sent", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    await open();
    expect(q("report-facts")!.textContent).toContain("Recent errors: none");
    await act(async () => { noteError("failed after opening for asha.rao@example.com", "z.js:9", "design/budget"); });
    const shown = q("report-facts")!.textContent!;
    expect(shown).toContain("failed after opening for [email]");
    expect(q("report-local")!.textContent).toContain("Errors by tool: design/budget 1");
    await act(async () => { q("report-copy")!.click(); });
    await settle();
    const sent = writeText.mock.calls[0]![0] as string;
    expect(sent).toContain("failed after opening for [email]");
    expect(sent).not.toContain("asha.rao");
    // what is shown is what goes: the facts block of the copy is the preview word for word
    expect(sent.endsWith(shown)).toBe(true);
  });

  it("starts fresh at each opening (counts box unticked, status empty); the description stays, as in v1", async () => {
    await open();
    await typeInto("report-text", "It froze when I pasted.");
    await act(async () => { q("report-usage")!.click(); });
    await act(async () => { q("report-clear")!.click(); });
    expect(q("report-status")!.textContent).toBe(T("wc_rep_cleared"));
    await act(async () => { q("report-close")!.click(); });
    expect(q("report-dialog")).toBeNull();
    await act(async () => { q("help-report")!.click(); });
    expect((q("report-usage") as unknown as HTMLInputElement).checked).toBe(false);
    expect(q("report-status")!.textContent).toBe("");
    expect((q("report-text") as unknown as HTMLTextAreaElement).value).toBe("It froze when I pasted.");
  });

  describe("the mail button", () => {
    const hrefOf = (): string => vi.mocked(openMail).mock.calls[0]![0];
    const subject = "Appuscholar problem report (" + APP_VERSION + ")";

    it("opens the mail app with the subject and the report, and copies nothing when the report is short", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "help@example.org");
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubClipboard(writeText);
      await open();
      await typeInto("report-text", "Short note.");
      await act(async () => { q("report-mail")!.click(); });
      await settle();
      expect(openMail).toHaveBeenCalledTimes(1);
      expect(hrefOf().startsWith("mailto:help@example.org?subject=" + encodeURIComponent(subject) + "&body=")).toBe(true);
      expect(decodeURIComponent(hrefOf().split("&body=")[1]!).startsWith("Short note.\n\n--- Added by the app ---\n")).toBe(true);
      expect(writeText).not.toHaveBeenCalled();
      expect(q("report-status")!.textContent).toBe("");
    });

    it("a long report is cut to 1,500 characters in the link, copied whole, and the dialog says so", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "help@example.org");
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubClipboard(writeText);
      await open();
      const long = "The totals row stays blank. ".repeat(80); // over 2,000 characters
      await typeInto("report-text", long);
      await act(async () => { q("report-mail")!.click(); });
      await settle();
      expect(q("report-status")!.textContent).toBe(T("wc_rep_long"));
      expect(writeText).toHaveBeenCalledTimes(1);
      const copied = writeText.mock.calls[0]![0] as string;
      expect(copied.startsWith(long.trim())).toBe(true);
      expect(copied).toContain("--- Added by the app ---");
      expect(openMail).toHaveBeenCalledTimes(1);
      expect(hrefOf().startsWith("mailto:help@example.org?subject=" + encodeURIComponent(subject) + "&body=")).toBe(true);
      const body = decodeURIComponent(hrefOf().split("&body=")[1]!);
      expect(body).toHaveLength(1500);
      expect(copied.startsWith(body)).toBe(true);
    });
  });
});

describe("tool opens are counted by the error slot, from the address (Task C4, D-C-64)", () => {
  const slot = async () => { await act(async () => { root.render(<ErrorSlot />); }); };
  const tools = (): Record<string, number> => JSON.parse(localStorage.getItem("appu_usage") ?? "{}").tools ?? {};

  it("counts the place or tab each time it changes, never the project id, and not a page that is no tool", async () => {
    pathname = "/projects";
    await slot();
    expect(localStorage.getItem("appu_usage")).toBeNull();
    pathname = "/p/abc123/writing";
    await slot();
    expect(tools()).toEqual({ writing: 1 });
    await slot(); // drawn again at the same address: not another opening
    expect(tools()).toEqual({ writing: 1 });
    pathname = "/p/abc123/design/budget";
    await slot();
    pathname = "/p/abc123/writing";
    await slot();
    expect(tools()).toEqual({ writing: 2, "design/budget": 1 });
    expect(localStorage.getItem("appu_usage")).not.toContain("abc123");
  });

  it("one opening counts once under React's StrictMode, which runs a new component's effects twice in development", async () => {
    pathname = "/p/abc123/lit";
    await act(async () => { root.render(<StrictMode><ErrorSlot /></StrictMode>); });
    expect(tools()).toEqual({ lit: 1 });
  });

  it("opening the report does not count the tool, and the first run (no tool) counts none", async () => {
    pathname = "/start";
    await slot();
    expect(localStorage.getItem("appu_usage")).toBeNull();
    await act(async () => { root.render(<><ErrorSlot /><HelpButtons /></>); });
    await act(async () => { q("help-report")!.click(); });
    expect(localStorage.getItem("appu_usage")).toBeNull();
    expect(q("report-local")!.textContent).toContain("Tool opens: nothing yet");
  });

  it("a count made while the dialog is open shows in its local counts", async () => {
    pathname = "/projects";
    await act(async () => { root.render(<><ErrorSlot /><HelpButtons /></>); });
    await act(async () => { q("help-report")!.click(); });
    pathname = "/p/abc123/writing";
    await act(async () => { root.render(<><ErrorSlot /><HelpButtons /></>); });
    expect(q("report-local")!.textContent).toContain("Tool opens: writing 1");
  });

  it("the ring starts empty when a different account is signed in on this tab", async () => {
    const as = (email: string) => <SessionProvider value={{ email, signOutAction: async () => {} }}><ErrorSlot /></SessionProvider>;
    pathname = "/projects";
    await act(async () => { root.render(as("first@example.org")); });
    noteError("first account's failure", "a.js:1", "writing");
    await act(async () => { root.render(as("first@example.org")); });
    expect(readErrors()).toHaveLength(1);
    await act(async () => { root.render(as("second@example.org")); });
    expect(readErrors()).toHaveLength(0);
  });
});
