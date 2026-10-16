import { describe, it, expect } from "vitest";
import { classifyAiUse } from "../src/aiuse";
import { buildWritingPrompt, buildDraftFirstPrompt, buildChatPrompt } from "../src/prompts";

describe("AI-use classification (v1 AIU_RULES)", () => {
  it("labels the writing actions by their prompt heads", () => {
    expect(classifyAiUse(buildWritingPrompt("continue", "x").prompt)).toEqual({ k: "continuing my draft", g: "text" });
    expect(classifyAiUse(buildWritingPrompt("improve", "x").prompt)).toEqual({ k: "grammar and polish", g: "text" });
    expect(classifyAiUse(buildWritingPrompt("expand", "x").prompt)).toEqual({ k: "expanding my text", g: "text" });
    expect(classifyAiUse(buildDraftFirstPrompt("tail", "x").prompt)).toEqual({ k: "feedback on my draft", g: "feedback" });
    expect(classifyAiUse(buildChatPrompt("psychology", "x").prompt)).toEqual({ k: "answering a writing question", g: "explain" });
  });
  it("excludes the Appu help assistant and falls back to other help", () => {
    expect(classifyAiUse("You are Appu, the help assistant ...")).toBeNull();
    expect(classifyAiUse("Something new")).toEqual({ k: "other help", g: "other" });
  });
});
