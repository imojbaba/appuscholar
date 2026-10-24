// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/p/abc123/design/budget";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { HelpButtons } from "@/components/help/HelpButtons";
import { ChromeExtras } from "@/components/help/ChromeExtras";
import { clearErrors, noteError } from "@/lib/help/report/errorRing";
import { DICTS } from "@/lib/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const T = (k: string) => DICTS.en[k]!;

let host: HTMLElement;
let root: ReturnType<typeof createRoot>;
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid=${id}]`);
const settle = async () => { await act(async () => { await Promise.resolve(); }); };

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

  it("shows v1's words, the preview of what the app adds, and counts this tool as opened", async () => {
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
    expect(JSON.parse(localStorage.getItem("appu_usage")!).tools).toEqual({ "design/budget": 1 });
  });

  it("the counts show in the preview only when the box is ticked, and Clear the counts empties appu_usage", async () => {
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
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await open();
    const ta = q("report-text") as unknown as HTMLTextAreaElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      set.call(ta, "The budget total did not update.");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
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
    await open();
    expect(q("report-facts")!.textContent).toContain("late failure (y.js:3)");
  });
});
