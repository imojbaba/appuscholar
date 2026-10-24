// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isAddingScreen, mayMigrate } from "@/lib/popout/mode";

/** Where the adding screen's no-migration rule (ruling B2-R16) holds: /add, and an old bookmark's hop through / with its #capture= hash; a hash on any other page changes nothing. */
describe("isAddingScreen", () => {
  it("a #capture= hash counts as the adding screen on / (the old bookmark's hop) and on /add, not on any other page", () => {
    try {
      window.history.replaceState(null, "", "/#capture=eyJ0aXRsZSI6IlQifQ%3D%3D");
      expect(isAddingScreen()).toBe(true);
      window.history.replaceState(null, "", "/add");
      expect(isAddingScreen()).toBe(true);
      window.history.replaceState(null, "", "/p/x#capture=eyJ0aXRsZSI6IlQifQ%3D%3D");
      expect(isAddingScreen()).toBe(false);
      expect(mayMigrate()).toBe(true);
      window.history.replaceState(null, "", "/p/x/lit/find");
      expect(isAddingScreen()).toBe(false);
    } finally { window.history.replaceState(null, "", "/"); }
  });
});
