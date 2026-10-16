import { describe, expect, it, vi } from "vitest";
import { buildChatPrompt } from "@appuscholar/core";
import { askAppuscholar } from "../lib/ai/chat";
import { selBubbleVisible, SEL_MAX, SEL_MIN } from "../lib/editor/selectionBubble";

describe("askAppuscholar", () => {
  it("sends the chat prompt for the student's field with its temperature and token cap", async () => {
    const callAI = vi.fn(async () => "Try three angles.");
    const r = await askAppuscholar("Give me 3 title ideas", { callAI, field: "economics" });
    const built = buildChatPrompt("economics", "Give me 3 title ideas");
    expect(callAI).toHaveBeenCalledWith(built.prompt, { temp: built.temp, max: built.max });
    expect(built.prompt).toContain("students of economics");
    expect(r).toEqual({ text: "Try three angles.", error: false });
  });
  it("falls back to psychology when no field is set", async () => {
    const callAI = vi.fn(async (_prompt: string, _opts: { temp: number; max: number }) => "ok");
    await askAppuscholar("q", { callAI, field: "" });
    expect(callAI.mock.calls[0]?.[0]).toContain("students of psychology");
  });
  it("turns a failure into the message for the bubble", async () => {
    const r = await askAppuscholar("q", { callAI: async () => { throw new Error("Your key was refused."); }, field: "psychology" });
    expect(r).toEqual({ text: "Your key was refused.", error: true });
  });
  it("uses a generic message when the error has none", async () => {
    const r = await askAppuscholar("q", { callAI: async () => { throw new Error(""); }, field: "psychology" });
    expect(r).toEqual({ text: "Something went wrong. Try again.", error: true });
  });
});

describe("selBubbleVisible", () => {
  const text = (n: number) => "a".repeat(n);
  it("needs a non-empty selection", () => expect(selBubbleVisible({ empty: true, text: text(20) })).toBe(false));
  it("is hidden below 8 trimmed characters and shown from 8", () => {
    expect(SEL_MIN).toBe(8);
    expect(selBubbleVisible({ empty: false, text: text(7) })).toBe(false);
    expect(selBubbleVisible({ empty: false, text: text(8) })).toBe(true);
    expect(selBubbleVisible({ empty: false, text: "   abc   " })).toBe(false);
  });
  it("is shown up to 800 characters and hidden above", () => {
    expect(SEL_MAX).toBe(800);
    expect(selBubbleVisible({ empty: false, text: text(800) })).toBe(true);
    expect(selBubbleVisible({ empty: false, text: text(801) })).toBe(false);
  });
});
