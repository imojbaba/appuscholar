// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import hi from "../messages/hi.json";
import dictEn from "../messages/tools/dictation.en.json";
import dictHi from "../messages/tools/dictation.hi.json";
import { DICTS } from "../lib/i18n";
import { DICTATION_LANGS, dictErrorKey, dictationSupported, startDictation, type Dictation } from "../lib/editor/dictate";
import { ack, dictLangFor, hasAcked, readDictPrefs, writeDictLang } from "../lib/editor/dictPrefs";
import { DictationNotice, useDictationGate } from "../components/workspace/dialogs/DictationNotice";

/*
 * Wave D Task 4: the dictation engine around the browser's recogniser (restart on end, give up after three fast runs, error codes), the per-device
 * preferences, and the first-use notice. A fake recogniser stands in for webkitSpeechRecognition; Date.now is driven by fake timers.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class FakeRec {
  static instances: FakeRec[] = [];
  lang = ""; continuous = false; interimResults = false; maxAlternatives = 0;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = 0; stopped = 0; failStart = false;
  constructor() { FakeRec.instances.push(this); }
  start() { if (this.failStart) throw new Error("InvalidStateError"); this.started++; }
  stop() { this.stopped++; }
  say(text: string, isFinal = true) { this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal, length: 1, 0: { transcript: text } } } }); }
  fail(code?: string) { this.onerror?.({ error: code as string }); }
  /** The browser ending the session by itself, after `ms` milliseconds of listening. */
  end(ms: number) { vi.advanceTimersByTime(ms); this.onend?.(); }
}
const rec = () => FakeRec.instances[FakeRec.instances.length - 1]!;
const G = globalThis as unknown as { webkitSpeechRecognition?: unknown; SpeechRecognition?: unknown };

function spies() {
  return { onInterim: vi.fn(), onFinal: vi.fn(), onEnd: vi.fn(), onError: vi.fn(), onGiveUp: vi.fn() };
}
function begin(over: Partial<Parameters<typeof startDictation>[0]> = {}) {
  const cb = spies();
  const d = startDictation({ lang: "en-IN", ...cb, ...over }) as Dictation;
  return { d, cb, r: rec() };
}

beforeEach(() => {
  FakeRec.instances = [];
  G.webkitSpeechRecognition = FakeRec;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T09:00:00Z"));
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete G.webkitSpeechRecognition;
  delete G.SpeechRecognition;
});

describe("startDictation", () => {
  it("returns null when the browser has no speech recognition, and reports support", () => {
    expect(dictationSupported()).toBe(true);
    delete G.webkitSpeechRecognition;
    expect(dictationSupported()).toBe(false);
    expect(startDictation({ lang: "en-IN", ...spies() })).toBeNull();
  });
  it("prefers the unprefixed constructor and sets up a continuous, interim, one-alternative session in the chosen language", () => {
    class Plain extends FakeRec {}
    G.SpeechRecognition = Plain;
    const cb = spies();
    startDictation({ lang: "hi-IN", ...cb });
    expect(FakeRec.instances).toHaveLength(1);
    expect(FakeRec.instances[0]).toBeInstanceOf(Plain);
    expect(rec()).toMatchObject({ lang: "hi-IN", continuous: true, interimResults: true, maxAlternatives: 1, started: 1 });
  });
  it("hands finished phrases to onFinal and the words still forming to onInterim", () => {
    const { r, cb } = begin();
    r.say("hello wor", false);
    expect(cb.onInterim).toHaveBeenLastCalledWith("hello wor");
    r.say("hello world", true);
    expect(cb.onFinal).toHaveBeenCalledTimes(1);
    expect(cb.onFinal).toHaveBeenCalledWith("hello world");
  });
  it("starts the recogniser again when the browser ends it after a real stretch of listening", () => {
    const { r, cb } = begin();
    r.end(5000);
    expect(r.started).toBe(2);
    expect(cb.onEnd).not.toHaveBeenCalled();
    expect(cb.onGiveUp).not.toHaveBeenCalled();
    r.end(1200);
    expect(r.started).toBe(3);
  });
  it("counts a run shorter than 1200 ms as a fail, and gives up on the third in a row without starting a fourth time", () => {
    const { r, cb } = begin();
    r.end(300);
    expect(r.started).toBe(2);
    r.end(300);
    expect(r.started).toBe(3);
    expect(cb.onGiveUp).not.toHaveBeenCalled();
    r.end(300);
    expect(cb.onGiveUp).toHaveBeenCalledTimes(1);
    expect(cb.onEnd).toHaveBeenCalledTimes(1);
    expect(cb.onError).not.toHaveBeenCalled();
    expect(r.started).toBe(3);
    expect(r.stopped).toBe(1);
  });
  it("treats 1199 ms as fast and 1200 ms as a real run", () => {
    const fast = begin();
    fast.r.end(1199); fast.r.end(1199); fast.r.end(1199);
    expect(fast.cb.onGiveUp).toHaveBeenCalledTimes(1);
    const slow = begin();
    slow.r.end(1200); slow.r.end(1200); slow.r.end(1200); slow.r.end(1200);
    expect(slow.cb.onGiveUp).not.toHaveBeenCalled();
    expect(slow.r.started).toBe(5);
  });
  it("a slow run, or a finished phrase, clears the count of fast runs", () => {
    const { r, cb } = begin();
    r.end(200); r.end(200);
    r.end(3000);
    r.end(200); r.end(200);
    expect(cb.onGiveUp).not.toHaveBeenCalled();
    r.say("one phrase");
    r.end(200); r.end(200);
    expect(cb.onGiveUp).not.toHaveBeenCalled();
    r.end(200);
    expect(cb.onGiveUp).toHaveBeenCalledTimes(1);
  });
  it("does not restart after the user stops, and onEnd fires once however many times it is asked", () => {
    const { d, r, cb } = begin();
    r.end(5000);
    d.stop();
    expect(r.stopped).toBe(1);
    expect(cb.onEnd).toHaveBeenCalledTimes(1);
    // the browser's own end event after stop() must not bring it back
    r.onend?.();
    d.stop();
    expect(r.started).toBe(2);
    expect(cb.onEnd).toHaveBeenCalledTimes(1);
    expect(cb.onGiveUp).not.toHaveBeenCalled();
    expect(cb.onInterim).toHaveBeenLastCalledWith("");
  });
  it("a phrase that arrives after the user pressed stop is still delivered", () => {
    const { d, r, cb } = begin();
    d.stop();
    r.say("last words");
    expect(cb.onFinal).toHaveBeenCalledWith("last words");
  });
  it("shows no words still forming once stopped (v1 dictStatus checks it is on)", () => {
    const { d, r, cb } = begin();
    d.stop();
    cb.onInterim.mockClear();
    r.say("half a", false);
    expect(cb.onInterim).not.toHaveBeenCalled();
  });
  it("passes a blocked microphone to onError as the code string, stops, and does not restart", () => {
    const { r, cb } = begin();
    r.fail("not-allowed");
    expect(cb.onError).toHaveBeenCalledTimes(1);
    expect(cb.onError).toHaveBeenCalledWith("not-allowed");
    expect(cb.onEnd).toHaveBeenCalledTimes(1);
    r.onend?.();
    expect(r.started).toBe(1);
  });
  it.each(["service-not-allowed", "network", "audio-capture", "language-not-supported", "bad-grammar"])("passes %s to onError as the code and stops", (code) => {
    const { r, cb } = begin();
    r.fail(code);
    expect(cb.onError).toHaveBeenCalledWith(code);
    expect(cb.onEnd).toHaveBeenCalledTimes(1);
  });
  it("hands over 'unknown' when the error has no code", () => {
    const { r, cb } = begin();
    r.fail(undefined);
    expect(cb.onError).toHaveBeenCalledWith("unknown");
  });
  it("ignores no-speech and aborted: no message, still listening, and the next end restarts", () => {
    const { r, cb } = begin();
    r.fail("no-speech");
    r.fail("aborted");
    expect(cb.onError).not.toHaveBeenCalled();
    expect(cb.onEnd).not.toHaveBeenCalled();
    r.end(4000);
    expect(r.started).toBe(2);
  });
  it("works without onError and onGiveUp", () => {
    const onEnd = vi.fn();
    const d = startDictation({ lang: "en-IN", onInterim: () => {}, onFinal: () => {}, onEnd })!;
    const r = rec();
    r.fail("network");
    expect(onEnd).toHaveBeenCalledTimes(1);
    d.stop();
    const again = startDictation({ lang: "en-IN", onInterim: () => {}, onFinal: () => {}, onEnd })!;
    const r2 = rec();
    r2.end(10); r2.end(10); r2.end(10);
    expect(onEnd).toHaveBeenCalledTimes(2);
    again.stop();
  });
  it("ends cleanly when the restart itself throws", () => {
    const { r, cb } = begin();
    r.failStart = true;
    r.end(5000);
    expect(cb.onEnd).toHaveBeenCalledTimes(1);
    expect(cb.onGiveUp).not.toHaveBeenCalled();
  });
  it("returns null when the first start throws", () => {
    class Broken extends FakeRec { constructor() { super(); this.failStart = true; } }
    G.webkitSpeechRecognition = Broken;
    const cb = spies();
    expect(startDictation({ lang: "en-IN", ...cb })).toBeNull();
    // Nothing is left listening: a late event from that recogniser reaches no callback.
    const r = rec();
    expect([r.onresult, r.onerror, r.onend]).toEqual([null, null, null]);
    expect(cb.onEnd).not.toHaveBeenCalled();
  });
});

describe("dictation messages", () => {
  const E = dictEn as Record<string, string>;
  const H = dictHi as Record<string, string>;
  const base = en as Record<string, string>;
  const baseHi = hi as Record<string, string>;
  it("every error code maps to a key the dictation pair defines, in English and Hindi", () => {
    for (const code of ["not-allowed", "service-not-allowed", "network", "audio-capture", "language-not-supported", "other"]) {
      const key = dictErrorKey(code);
      expect(E[key], key).toBeTruthy();
      expect(H[key], key).toBeTruthy();
    }
    expect(E.dict_err_other).toContain("{code}");
    expect(H.dict_err_other).toContain("{code}");
  });
  it("carries the v1 sentences word for word", () => {
    expect(E.dict_err_not_allowed).toBe("The microphone is blocked. Allow it in the address bar, then try again.");
    expect(E.dict_err_service).toBe("The browser will not let this page use speech recognition.");
    expect(E.dict_err_network).toBe("Dictation needs an internet connection.");
    expect(E.dict_err_audio).toBe("No microphone was found.");
    expect(E.dict_err_lang).toBe("This browser cannot recognise that language.");
    expect(E.dict_err_other).toBe("Dictation stopped ({code}).");
    expect(E.dict_give_up).toBe("Dictation keeps stopping. Check your microphone and try again.");
    expect(E.dict_unsupported).toBe("Dictation works in Chrome and Edge. This browser does not offer it.");
    expect(E.dict_btn_title).toBe("Speak to type. Works in Chrome and Edge. Your voice goes to the browser's speech service.");
    expect(E.dict_notice_1).toBe("Dictation uses your browser's own speech service. In Chrome the audio goes to Google, and in Edge to Microsoft, to be turned into text. Appuscholar never receives it.");
    expect(E.dict_notice_2).toBe("Do not dictate participant names, interviews or anything that identifies a person.");
    expect(E.dict_listening).toBe("Listening…");
  });
  it("has a Hindi draft for every key, no key English lacks, no emoji and no dashes used as dashes", () => {
    const keys = Object.keys(E);
    expect(keys.length).toBe(14);
    expect(keys.filter((k) => !k.startsWith("dict_"))).toEqual([]);
    expect(keys.filter((k) => !H[k])).toEqual([]);
    expect(Object.keys(H).filter((k) => !k.startsWith("$") && !(k in E))).toEqual([]);
    for (const v of [...Object.values(E), ...Object.values(H)]) expect(v).not.toMatch(/[—–\p{Extended_Pictographic}]/u);
  });
  it("redefines nothing v1 already has, and the t() lookup finds every key in both languages", () => {
    for (const k of Object.keys(E)) { expect(k in base, k).toBe(false); expect(k in baseHi, k).toBe(false); }
    const v1Values = new Set(Object.values(base).map((v) => v.trim()));
    for (const [k, v] of Object.entries(E)) expect(v1Values.has(v.trim()), k).toBe(false);
    for (const k of Object.keys(E)) { expect(DICTS.en[k], k).toBe(E[k]); expect(DICTS.hi[k], k).toBe(H[k]); }
  });
});

describe("dictation preferences", () => {
  it("remembers the language per account on this device", () => {
    expect(readDictPrefs("u1").lang).toBeNull();
    writeDictLang("u1", "hi-IN");
    expect(readDictPrefs("u1").lang).toBe("hi-IN");
    expect(readDictPrefs("u2").lang).toBeNull();
    writeDictLang("u2", "en-GB");
    expect(readDictPrefs("u1").lang).toBe("hi-IN");
    expect(readDictPrefs("u2").lang).toBe("en-GB");
    expect(localStorage.getItem("appu_dictlang_u1")).toBe("hi-IN");
  });
  it("reads back what was written, for every listed language", () => {
    for (const l of DICTATION_LANGS) { writeDictLang("u1", l.code); expect(readDictPrefs("u1").lang).toBe(l.code); }
  });
  it("returns the saved language only if it is one of the four, and does not store another", () => {
    localStorage.setItem("appu_dictlang_u1", "fr-FR");
    expect(readDictPrefs("u1").lang).toBeNull();
    writeDictLang("u3", "fr-FR");
    expect(localStorage.getItem("appu_dictlang_u3")).toBeNull();
    writeDictLang("u3", "");
    expect(readDictPrefs("u3").lang).toBeNull();
  });
  it("dictLangFor falls back to the content language's default when nothing valid is saved (v1 dictLang)", () => {
    expect(dictLangFor("u1", "hi")).toBe("hi-IN");
    expect(dictLangFor("u1", "en")).toBe("en-IN");
    localStorage.setItem("appu_dictlang_u1", "xx");
    expect(dictLangFor("u1", "hi")).toBe("hi-IN");
    writeDictLang("u1", "en-US");
    expect(dictLangFor("u1", "hi")).toBe("en-US");
  });
  it("keeps the notice acknowledgement per account", () => {
    expect(hasAcked("u1")).toBe(false);
    ack("u1");
    expect(hasAcked("u1")).toBe(true);
    expect(hasAcked("u2")).toBe(false);
    expect(localStorage.getItem("appu_dict_ack_u1")).toBe("1");
    localStorage.setItem("appu_dict_ack_u2", "0");
    expect(hasAcked("u2")).toBe(false);
  });
  it("stores nothing, and reads nothing, with no signed-in account", () => {
    for (const u of [null, undefined, ""]) {
      writeDictLang(u, "hi-IN");
      ack(u);
      expect(readDictPrefs(u).lang).toBeNull();
      expect(hasAcked(u)).toBe(false);
    }
    expect(localStorage.length).toBe(0);
  });
  it("does not throw when storage refuses reads and writes", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    expect(() => writeDictLang("u1", "hi-IN")).not.toThrow();
    expect(() => ack("u1")).not.toThrow();
    expect(readDictPrefs("u1").lang).toBeNull();
    expect(hasAcked("u1")).toBe(false);
    expect(dictLangFor("u1", "hi")).toBe("hi-IN");
  });
  it("does not throw when touching localStorage itself throws (blocked site data)", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("SecurityError"); });
    expect(() => writeDictLang("u1", "hi-IN")).not.toThrow();
    expect(() => ack("u1")).not.toThrow();
    expect(readDictPrefs("u1").lang).toBeNull();
    expect(hasAcked("u1")).toBe(false);
  });
});

describe("DictationNotice and useDictationGate", () => {
  const roots: Root[] = [];
  const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

  /** A button that does what the toolbar will: ask the gate, and start dictating only once it allows. */
  function Harness({ userId, onStarted }: { userId: string | null; onStarted(d: Dictation | null): void }) {
    const gate = useDictationGate(userId);
    return (
      <div>
        <button data-testid="go" onClick={() => gate.request(() => onStarted(startDictation({ lang: "en-IN", ...spies() })))}>Dictate</button>
        {gate.notice}
      </div>
    );
  }
  function mount(userId: string | null, onStarted: (d: Dictation | null) => void = () => {}) {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    roots.push(root);
    act(() => { root.render(<Harness userId={userId} onStarted={onStarted} />); });
  }
  const click = (id: string) => act(() => { $(id)!.click(); });

  it("shows the notice before the first start and starts nothing until Continue", () => {
    mount("u1");
    expect($("dict-notice")).toBeNull();
    click("go");
    const notice = $("dict-notice")!;
    expect(notice).toBeTruthy();
    expect(FakeRec.instances).toHaveLength(0);
    expect(notice.textContent).toContain(dictEn.dict_notice_title);
    expect(notice.textContent).toContain(dictEn.dict_notice_1);
    expect(notice.textContent).toContain(dictEn.dict_notice_2);
    expect(notice.querySelectorAll("p")).toHaveLength(2);
    expect($("dict-notice-continue")!.textContent).toBe((en as Record<string, string>).terms_cont);
    expect($("dict-notice-cancel")!.textContent).toBe((en as Record<string, string>).sap_cancel_btn);
  });
  it("Cancel starts nothing, stores nothing, and the notice comes back next time", () => {
    mount("u1");
    click("go");
    click("dict-notice-cancel");
    expect($("dict-notice")).toBeNull();
    expect(FakeRec.instances).toHaveLength(0);
    expect(localStorage.length).toBe(0);
    expect(hasAcked("u1")).toBe(false);
    click("go");
    expect($("dict-notice")).toBeTruthy();
    expect(FakeRec.instances).toHaveLength(0);
  });
  it("Escape counts as Cancel", () => {
    mount("u1");
    click("go");
    act(() => { $("dict-notice")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect($("dict-notice")).toBeNull();
    expect(FakeRec.instances).toHaveLength(0);
    expect(localStorage.length).toBe(0);
  });
  it("Continue stores the acknowledgement for this account only and then starts dictating once", () => {
    const started = vi.fn();
    mount("u1", started);
    click("go");
    click("dict-notice-continue");
    expect($("dict-notice")).toBeNull();
    expect(hasAcked("u1")).toBe(true);
    expect(hasAcked("u2")).toBe(false);
    expect(FakeRec.instances).toHaveLength(1);
    expect(rec().started).toBe(1);
    expect(started).toHaveBeenCalledTimes(1);
    expect(started.mock.calls[0]![0]).not.toBeNull();
  });
  it("starts at once, with no notice, once acknowledged", () => {
    ack("u1");
    mount("u1");
    click("go");
    expect($("dict-notice")).toBeNull();
    expect(FakeRec.instances).toHaveLength(1);
  });
  it("asks again for another account on the same device", () => {
    ack("u1");
    mount("u2");
    click("go");
    expect($("dict-notice")).toBeTruthy();
    expect(FakeRec.instances).toHaveLength(0);
  });
  it("still starts after Continue when storage is blocked, and asks again next time", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    mount("u1");
    click("go");
    click("dict-notice-continue");
    expect(FakeRec.instances).toHaveLength(1);
    click("go");
    expect($("dict-notice")).toBeTruthy();
  });
  it("<DictationNotice> renders nothing while closed, and its buttons call the handlers", () => {
    const onContinue = vi.fn(); const onCancel = vi.fn();
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    roots.push(root);
    act(() => { root.render(<DictationNotice open={false} onContinue={onContinue} onCancel={onCancel} />); });
    expect($("dict-notice")).toBeNull();
    act(() => { root.render(<DictationNotice open onContinue={onContinue} onCancel={onCancel} />); });
    click("dict-notice-continue");
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    click("dict-notice-cancel");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
