import { describe, expect, it } from "vitest";
import { PLACE_TABS, homeHref, parsePlace, placeHref } from "@/lib/frame/places";
import { STAGE_ORDER } from "@/lib/tools";

describe("places", () => {
  it("Literature has Find, Reading list, Compare, Citations; the stage 3 to 6 places and Writing have the registry's tabs; Idea has none", () => {
    expect(PLACE_TABS).toEqual({
      idea: [],
      lit: ["find", "reading", "compare", "citations"],
      design: ["overview", "pathway", "protocol", "ethics", "registration", "investigator", "budget", "aiuse"],
      collect: ["data", "power", "charts", "check", "scales", "coding"],
      writing: ["document", "style", "words"],
      review: ["closeness", "viva", "slides"]
    });
    expect(Object.keys(PLACE_TABS)).toEqual(STAGE_ORDER);
  });

  it("a project's home and its places have one address each", () => {
    expect(homeHref("p1")).toBe("/p/p1");
    expect(placeHref("p1", "idea")).toBe("/p/p1/idea");
    expect(placeHref("p1", "lit", "find")).toBe("/p/p1/lit/find");
  });

  it("parsePlace accepts lit/find, gives Literature its first tab, refuses lit/matrix and an unknown stage", () => {
    expect(parsePlace("lit", ["find"])).toEqual({ stage: "lit", tab: "find", rest: [] });
    expect(parsePlace("lit", undefined)).toEqual({ stage: "lit", tab: "find", rest: [] });
    expect(parsePlace("lit", [])).toEqual({ stage: "lit", tab: "find", rest: [] });
    expect(parsePlace("lit", ["reading", "paper-1"])).toEqual({ stage: "lit", tab: "reading", rest: ["paper-1"] });
    expect(parsePlace("lit", ["matrix"])).toBeNull();
    expect(parsePlace("method", undefined)).toBeNull();
    expect(parsePlace("toString", undefined)).toBeNull();
  });

  it("a stage with no tabs takes none", () => {
    expect(parsePlace("idea", undefined)).toEqual({ stage: "idea", tab: null, rest: [] });
    expect(parsePlace("idea", ["find"])).toBeNull();
  });

  it("a stage 3 to 6 place opens on its first tab and refuses a tab of another stage", () => {
    expect(parsePlace("design", undefined)).toEqual({ stage: "design", tab: "overview", rest: [] });
    expect(parsePlace("writing", undefined)).toEqual({ stage: "writing", tab: "document", rest: [] });
    expect(parsePlace("review", ["viva"])).toEqual({ stage: "review", tab: "viva", rest: [] });
    expect(parsePlace("review", ["data"])).toBeNull();
  });
});
