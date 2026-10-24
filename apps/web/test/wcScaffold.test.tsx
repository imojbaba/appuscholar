// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { ChromeExtras } from "@/components/help/ChromeExtras";
import { HelpButtons } from "@/components/help/HelpButtons";
import { GUIDE } from "@/lib/help/guide/content";
import { DICTS } from "@/lib/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function draw(node: React.ReactNode): HTMLElement {
  const host = document.createElement("div");
  act(() => { createRoot(host).render(node); });
  return host;
}

describe("wave C scaffold (Task C0)", () => {
  it("the slots draw nothing until their feature fills them", () => {
    // Task C6 filled BackupSlot (its two buttons); the guide, report and install slots still draw nothing.
    const row = draw(<HelpButtons />).querySelector("[data-testid=help-wave-c]");
    expect(Array.from(row?.children ?? []).map((c) => c.getAttribute("data-testid"))).toEqual(["help-locked-backup", "help-check-backup"]);
    expect(draw(<ChromeExtras />).innerHTML).toBe("");
  });
  it("the Guide starts empty and the 'page looks broken' FAQ entry has its text", () => {
    expect(GUIDE).toEqual([]);
    expect(DICTS.en.faq_q_broken).toMatch(/looks broken/);
    expect(DICTS.en.faq_a_broken).toMatch(/hard refresh/i);
  });
});
