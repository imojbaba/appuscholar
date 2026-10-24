// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { BackupSlot } from "@/components/help/slots/BackupSlot";
import { ErrorSlot } from "@/components/help/slots/ErrorSlot";
import { GuideSlot } from "@/components/help/slots/GuideSlot";
import { InstallSlot } from "@/components/help/slots/InstallSlot";
import { NudgeSlot } from "@/components/help/slots/NudgeSlot";
import { OfflineSlot } from "@/components/help/slots/OfflineSlot";
import { RecapSlot } from "@/components/help/slots/RecapSlot";
import { ReportSlot } from "@/components/help/slots/ReportSlot";
import { DICTS } from "@/lib/i18n";

// Each feature task fills its own slot and tests what it draws there; this file only pins the frame they plug into (ruling R7).
describe("wave C scaffold (Task C0)", () => {
  it("each slot file exports one component of its own name", () => {
    for (const slot of [GuideSlot, ReportSlot, BackupSlot, InstallSlot, RecapSlot, NudgeSlot, OfflineSlot, ErrorSlot]) expect(typeof slot).toBe("function");
  });
  it("the 'page looks broken' FAQ entry has its text", () => {
    expect(DICTS.en.faq_q_broken).toMatch(/looks broken/);
    expect(DICTS.en.faq_a_broken).toMatch(/hard refresh/i);
  });
});
