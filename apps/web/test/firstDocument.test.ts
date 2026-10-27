import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ apiFetch: vi.fn(), popout: false }));
vi.mock("@/lib/api", () => ({ apiFetch: h.apiFetch }));
vi.mock("@/lib/popout/mode", () => ({ isPopout: () => h.popout }));

import { listOrSeed } from "../lib/frame/firstDocument";
import { tFormat } from "../lib/i18n";
import en from "../messages/en.json";
import hi from "../messages/hi.json";

const vault = { known: async () => "off" } as unknown as Parameters<typeof listOrSeed>[1];

beforeEach(() => { h.apiFetch.mockReset(); h.popout = false; });

describe("listOrSeed: the first document's title", () => {
  it("is the one it is given, in the page's language", async () => {
    for (const lang of ["en", "hi"] as const) {
      h.apiFetch.mockReset();
      h.apiFetch.mockResolvedValueOnce([]).mockResolvedValueOnce({ id: "D1" });
      const title = tFormat(en, hi, "doc_first_title", lang);
      await listOrSeed("p1", vault, title);
      const sent = JSON.parse(h.apiFetch.mock.calls[1]![1].body as string) as { title: string };
      expect(sent.title).toBe(title);
    }
    expect(tFormat(en, hi, "doc_first_title", "en")).toBe("My first document");
    expect(tFormat(en, hi, "doc_first_title", "hi")).not.toBe("My first document");
  });

  it("makes nothing when the project already has a document", async () => {
    h.apiFetch.mockResolvedValueOnce([{ id: "D0" }]);
    expect(await listOrSeed("p1", vault, "x")).toEqual([{ id: "D0" }]);
    expect(h.apiFetch).toHaveBeenCalledTimes(1);
  });
});
