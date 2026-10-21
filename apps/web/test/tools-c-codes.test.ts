import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import qualEn from "../messages/tools/qual.en.json";
import qualHi from "../messages/tools/qual.hi.json";
import { codeListDamaged } from "../lib/tools/qual/codeList";

const C = (id: string, name: string, parentId: string | null) => ({ id, name, parentId, color: "#000" });

describe("codeListDamaged (the check before qualDescendantIds, which overflows the stack on a loop)", () => {
  it("accepts trees, forests, orphans and the empty list", () => {
    expect(codeListDamaged([])).toBe(false);
    expect(codeListDamaged([C("a", "A", null), C("b", "B", "a"), C("c", "C", "b"), C("d", "D", "a"), C("z", "Z", "gone")])).toBe(false);
  });
  it("rejects a self-parent, a loop of two and a loop below a tree", () => {
    expect(codeListDamaged([C("a", "A", "a")])).toBe(true);
    expect(codeListDamaged([C("a", "A", "b"), C("b", "B", "a")])).toBe(true);
    expect(codeListDamaged([C("r", "R", null), C("a", "A", "r"), C("b", "B", "c"), C("c", "C", "b")])).toBe(true);
  });
  it("rejects a loop that only exists through a duplicated id, as the recursion would walk it", () => {
    expect(codeListDamaged([C("a", "A", null), C("a", "A2", "b"), C("b", "B", "a")])).toBe(true);
  });
  it("walks a very deep chain without recursing", () => {
    const deep = Array.from({ length: 50000 }, (_, i) => C("n" + i, "n", i === 0 ? null : "n" + (i - 1)));
    expect(codeListDamaged(deep)).toBe(false);
    deep[0] = C("n0", "n", "n49999");
    expect(codeListDamaged(deep)).toBe(true);
  });
});

describe("the Coding tab's copy", () => {
  it("Hindi has exactly the keys English has (plus its $draft marker), and no new key collides with the base dictionary", () => {
    const keys = (o: Record<string, string>) => Object.keys(o).filter((k) => !k.startsWith("$")).sort();
    expect(keys(qualHi as Record<string, string>)).toEqual(keys(qualEn as Record<string, string>));
    expect(Object.keys(qualHi)).toContain("$draft");
    for (const k of keys(qualEn as Record<string, string>)) expect(k in en, k).toBe(false);
    expect(keys(qualEn as Record<string, string>).length).toBeGreaterThan(10);
  });
  it("new copy has no emoji and no em-dash", () => {
    for (const [k, v] of Object.entries(qualEn as Record<string, string>)) {
      expect(/\p{Extended_Pictographic}/u.test(v), k).toBe(false);
      expect(v.includes("—"), k).toBe(false);
    }
  });
});
