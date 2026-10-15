import { describe, it, expect } from "vitest";
import en from "../messages/en.json";
import hi from "../messages/hi.json";
import { tFormat } from "../lib/i18n";

describe("v1 chrome strings", () => {
  it("has the keys the workspace uses, verbatim", () => {
    expect(en.project_bar_empty).toBe("No research project yet — working in scratch space");
    expect(en.settings_btn).toBe("⚙ AI Provider / Key");
    expect(en.stage_guide_final).toBe("Final stage — nothing after this in the sequence");
    expect(hi.df_btn).toBe("✍ पहले खुद लिखें");
    expect(hi.dock_ai_tab).toBe("✨ एआई सुझाव");
    expect(hi.tab_new_project).toBe("✨ नया शोध प्रोजेक्ट");
  });
  it("every Hindi key exists in English (no orphan translations)", () => {
    const missing = Object.keys(hi).filter(k => !(k in en));
    expect(missing).toEqual([]);
  });
  it("substitutes placeholders and falls back to English, then to the key", () => {
    expect(tFormat(en, hi, "stage_guide_fmt", "hi", { n: 2, total: 6 })).toBe("चरण 2/6");
    expect(tFormat(en, hi, "stage_guide_fmt", "en", { n: 2, total: 6 })).toBe("Stage 2 of 6");
    expect(tFormat(en, hi, "help_intro", "hi")).toBe(hi.help_intro);
    expect(tFormat(en, hi, "nonexistent_key", "hi")).toBe("nonexistent_key");
  });
});
