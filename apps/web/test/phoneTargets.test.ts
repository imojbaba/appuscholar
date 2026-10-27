import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * On a phone (up to 700px) the rows of Analyse a paper and Help's questions are reachable: a button is 44px wide at least and its label wraps inside the screen (a long Hindi
 * label pushed the page 54px sideways), and a question of Help's list is a 44px target. The QA stories S2-08 and S9-05 measure the real screens; this pins the rules.
 */
const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const PHONE = CSS.slice(CSS.indexOf("@media (max-width: 700px) {"));
const phoneBlock = PHONE.slice(0, PHONE.indexOf("\n}\n"));
const rule = (sel: string): string => new RegExp(sel.replace(/[.[\]]/g, "\\$&") + "\\s*\\{([^}]*)\\}").exec(phoneBlock)?.[1] ?? "";

describe("phone targets", () => {
  it("an Analyse a paper button is at least 44px wide and its label wraps", () => {
    const decl = rule(".ap-row button");
    expect(decl).toMatch(/min-width:\s*44px/);
    expect(decl).toMatch(/max-width:\s*100%/);
    expect(decl).toMatch(/white-space:\s*normal/);
    expect(decl).toMatch(/height:\s*auto/);
  });
  it("a question of Help's list is at least 44px tall", () => {
    expect(rule(".help-faq summary")).toMatch(/min-height:\s*44px/);
  });
});
