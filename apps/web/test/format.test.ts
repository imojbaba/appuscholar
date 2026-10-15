import { describe, it, expect } from "vitest";
import { relativeTime, plural } from "../lib/format";

describe("relativeTime", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  it("handles null and recent times", () => {
    expect(relativeTime(null, now)).toBe("never");
    expect(relativeTime("2026-10-15T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-10-15T11:56:00Z", now)).toBe("4 minutes ago");
    expect(relativeTime("2026-10-15T09:00:00Z", now)).toBe("3 hours ago");
    expect(relativeTime("2026-10-14T09:00:00Z", now)).toBe("yesterday");
    expect(relativeTime("2026-10-03T09:00:00Z", now)).toBe("3 Oct");
    expect(relativeTime("2025-10-03T09:00:00Z", now)).toBe("3 Oct 2025");
  });
});
describe("plural", () => {
  it("picks the form", () => {
    expect(plural(0, "document", "documents")).toBe("0 documents");
    expect(plural(1, "document", "documents")).toBe("1 document");
    expect(plural(2, "document", "documents")).toBe("2 documents");
  });
});
