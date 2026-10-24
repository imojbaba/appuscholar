// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { repFacts, scrubMessage, type RingError } from "@/lib/help/report/repFacts";
import { clearErrors, noteError, readErrors } from "@/lib/help/report/errorRing";

const BASE = {
  build: "abc1234", tool: "writing", lang: "en", ua: "TestBrowser/1.0", screen: "1440x900, window 1280x720",
  online: true, provider: "gemini", keySaved: false, errors: [] as RingError[]
};
const factsFor = (message: string, where = "app.js:1"): string => {
  noteError(message, where, "writing");
  return repFacts({ ...BASE, errors: readErrors() });
};
/** The message the engine itself writes when it is handed text that is not JSON: it quotes the start of that text. */
const jsonError = (text: string): string => {
  try { JSON.parse(text); } catch (e) { return (e as Error).message; }
  throw new Error("expected a parse error");
};

afterEach(() => { clearErrors(); localStorage.clear(); });

describe("an engine message that quotes the document (Review Focus 4)", () => {
  it("a real JSON.parse error on document text carries none of that text", () => {
    const msg = jsonError("Participant Meera Kulkarni said the hostel food was cold");
    expect(msg).toContain("Participan"); // the engine does quote it: this is the leak the report must close
    const f = factsFor(msg);
    for (const w of ["Participan", "Meera", "Kulkarni", "hostel", "food"]) expect(f).not.toContain(w);
    expect(f).toContain("is not valid JSON");
  });
  it("a short document is quoted whole by the engine and is still removed", () => {
    const f = factsFor(jsonError("Meera"));
    expect(f).not.toContain("Meera");
    expect(f).not.toContain("'M'");
  });
  it("document text that holds quote marks of its own is removed too", () => {
    for (const doc of ['{"note": Meera said "cold"}', '[1, 2, Meera\'s "cold" food]', "{'a': 'Meera', \"b\": Kulkarni}"]) {
      const f = factsFor(jsonError(doc));
      for (const w of ["Meera", "Kulkarni", "cold", "food"]) expect(f, doc).not.toContain(w);
      clearErrors();
    }
  });
  it("every kind of quote opens a run that is removed: curly, single, backtick, guillemets", () => {
    for (const m of ["bad “Meera said” here", "bad ‘Meera said’ here", "bad 'Meera said' here", "bad `Meera said` here", "bad «Meera said» here", 'bad "Meera said" here']) {
      expect(scrubMessage(m), m).not.toContain("Meera");
      expect(scrubMessage(m), m).toContain("[text]");
      expect(scrubMessage(m), m).toMatch(/^bad .*here$|^bad \[text\]$/);
    }
  });
  it("a quote that never closes, or is cut off, removes the rest of the message", () => {
    expect(scrubMessage("Unexpected token 'M', \"Meera said the hostel")).not.toContain("Meera");
    expect(scrubMessage('a "b" c "d')).not.toMatch(/\bd\b/);
  });
  it("a contraction or a possessive is not taken for a quote", () => {
    expect(scrubMessage("Can't reach the student's server")).toBe("Can't reach the student's server");
  });
  it("a regular expression written in the message is removed", () => {
    const f = factsFor("Invalid regular expression: /(Meera said/gi: Unterminated group");
    expect(f).not.toContain("Meera");
    expect(f).toContain("Unterminated group");
  });
  it("what is left of an ordinary engine message still says what failed", () => {
    expect(scrubMessage("Cannot read properties of undefined (reading 'map')")).toBe("Cannot read properties of undefined (reading [text])");
    expect(scrubMessage("Failed to fetch")).toBe("Failed to fetch");
  });
});

describe("a key or token in an error message (Review Focus 4)", () => {
  const KEYS = [
    "AIzaSyDUMMYDUMMYDUMMYDUMMY12345",
    "sk-proj-DUMMYDUMMYDUMMY1234567890",
    "sk-ant-api03-DUMMYDUMMYDUMMY",
    "gsk_DUMMYDUMMYDUMMY1234567890",
    "abcdEFGH1234ijklMNOP5678qrst"
  ];
  it("a key in a web address is removed, with the whole query", () => {
    const f = factsFor("Request failed: https://api.example/v1/models?key=AIzaSyDUMMYDUMMYDUMMYDUMMY12345&alt=json returned 400");
    expect(f).not.toContain("AIza");
    expect(f).not.toContain("DUMMY");
    expect(f).not.toContain("alt=json");
    expect(f).toContain("returned 400");
  });
  it("a key anywhere in the text is removed, whatever its make", () => {
    for (const k of KEYS) {
      const f = factsFor("The provider refused " + k + " as invalid");
      expect(f, k).not.toContain(k.slice(0, 14));
      expect(f, k).toContain("as invalid");
      clearErrors();
    }
  });
  it("a bearer token is removed", () => {
    expect(scrubMessage("401 with Authorization: Bearer abc123tokenvalue")).not.toContain("abc123");
  });
  it("a query or fragment on a web address is removed, a plain address is kept", () => {
    expect(scrubMessage("GET /api/x?q=hostel+food&k=v failed")).not.toContain("hostel");
    expect(scrubMessage("opened https://app.example/p/1#capture=Meera%20said failed")).not.toContain("Meera");
    expect(scrubMessage("GET https://app.example/api/health failed")).toBe("GET https://app.example/api/health failed");
  });
  it("the file name of the script has no query in it", () => {
    noteError("x", "chunk.js?v=ZZZ123:12", "writing");
    expect(readErrors()[0]!.where).not.toContain("ZZZ123");
  });
});

describe("personal data as v1 build 2026.10.24a matches it", () => {
  const CASES: Array<[string, string, string]> = [
    ["a phone with a leading zero", "call 09876543210 now", "call [phone] now"],
    ["a phone written with hyphens", "call 987-654-3210 now", "call [phone] now"],
    ["a landline with an area code", "office 022-23456789 closed", "office [phone] closed"],
    ["a phone with the country code and a gap", "ring +91 98765 43210 please", "ring [phone] please"],
    ["a phone with 00 91", "ring 0091 98765 43210 please", "ring [phone] please"],
    ["an ID number with hyphens", "aadhaar 2345-6789-0123 saved", "aadhaar [id number] saved"],
    ["an ID number with gaps", "id 2345 6789 0123 saved", "id [id number] saved"],
    ["an ID number of twelve digits", "id 234567890123 saved", "id [id number] saved"],
    ["a tax ID", "pan ABCDE1234F saved", "pan [id number] saved"],
    ["an email address", "to asha.rao@example.com failed", "to [email] failed"]
  ];
  for (const [name, input, want] of CASES) {
    it("masks " + name, () => { expect(scrubMessage(input)).toBe(want); });
  }
  it("the same through the ring and the facts", () => {
    const f = factsFor("call 09876543210, 987-654-3210, 022-23456789; id 2345-6789-0123; ABCDE1234F");
    for (const d of ["09876543210", "987-654-3210", "022-23456789", "2345-6789-0123", "ABCDE1234F"]) expect(f).not.toContain(d);
  });
  it("leaves a date or a plain count alone", () => {
    expect(scrubMessage("saved 2026-10-24 after 3 tries at line 1204")).toBe("saved 2026-10-24 after 3 tries at line 1204");
  });
});

describe("a long message is cheap to handle", () => {
  it("masks and cuts a very long message in bounded time", () => {
    for (const long of ["x".repeat(100_000), "a@" + "b".repeat(100_000), "a ".repeat(50_000), "\"" + "q".repeat(100_000), "9".repeat(100_000)]) {
      const t0 = Date.now();
      const out = scrubMessage(long);
      noteError(long, long);
      expect(Date.now() - t0, long.slice(0, 5)).toBeLessThan(250);
      expect(out.length).toBeLessThanOrEqual(140);
    }
  });
  it("an address the first cut would split is not left half showing", () => {
    // 389 characters of quoted text, then an address that begins just before the 400th: the cut would leave "me@example." with no ending to match.
    const head = '"' + "z ".repeat(193) + '" ';
    expect(head.length).toBe(389);
    expect(scrubMessage(head + "me@example.com and more words")).not.toContain("me@");
    // ... and a number whose first half would survive the cut.
    expect(scrubMessage(head + "x 98765 43210 and more words")).not.toMatch(/98765|43210|432/);
  });
});
