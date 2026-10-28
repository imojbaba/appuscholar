import type { Page } from "@playwright/test";

/**
 * A stand-in for the browser's speech recogniser, so dictation (lib/editor/dictate.ts) can be driven without a microphone: Chromium has a real
 * `SpeechRecognition` that would reach for one and send audio to a speech service. `installFakeSpeech(page)` defines the fake before any page script runs; the
 * test then plays the part of the browser with `speech.say`, `speech.fail` and `speech.end`, and reads what the app asked of it with `speech.state`.
 * The instances are recorded on `window.__speech`.
 *
 * It follows the real one where the app can tell: `start()` on a recogniser that is already listening throws InvalidStateError; `stop()` ends the session
 * a moment later through `onend`; `results` holds every result of the session, `resultIndex` the first one that changed, and an interim result is
 * replaced by the next one until one is final.
 */

type Fake = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: unknown) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  listening: boolean; started: number; stopped: number; results: unknown[];
};
type Log = { instances: Fake[]; newest(): Fake };
type Win = { __speech?: Log };

export type SpeechState = {
  /** How many recognisers the app has made. */
  instances: number;
  /** The newest one's language, and the options the app set on it. */
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  /** How many times the newest was started and stopped, and whether it is listening now. */
  started: number;
  stopped: number;
  listening: boolean;
};

/** Defines `SpeechRecognition` and `webkitSpeechRecognition` in every page this test opens, before the app's scripts run. */
export async function installFakeSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Win;
    const instances: Fake[] = [];
    w.__speech = {
      instances,
      newest() {
        const r = instances[instances.length - 1];
        if (!r) throw new Error("the app has not made a speech recogniser yet");
        return r;
      }
    };
    class FakeSpeechRecognition implements Fake {
      lang = ""; continuous = false; interimResults = false; maxAlternatives = 1;
      onresult: Fake["onresult"] = null; onerror: Fake["onerror"] = null; onend: Fake["onend"] = null;
      listening = false; started = 0; stopped = 0; results: unknown[] = [];
      constructor() { instances.push(this); }
      start() {
        if (this.listening) throw new DOMException("recognition has already started", "InvalidStateError");
        this.listening = true;
        this.started++;
        this.results = [];
      }
      stop() {
        if (!this.listening) return;
        this.listening = false;
        this.stopped++;
        // The real one ends the session by itself a moment later.
        setTimeout(() => { this.onend?.(); }, 0);
      }
      abort() { this.stop(); }
    }
    // The app takes the unprefixed name first (newer Chromium has it), then Chrome's prefixed one: both are replaced, so the real one is never reached.
    for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) {
      Object.defineProperty(window, name, { value: FakeSpeechRecognition, configurable: true, writable: true });
    }
  });
}

export const speech = {
  /** What the app asked of the newest recogniser. */
  state(page: Page): Promise<SpeechState> {
    return page.evaluate(() => {
      const { instances } = (window as unknown as Win).__speech!;
      const r = instances[instances.length - 1];
      return {
        instances: instances.length, lang: r?.lang ?? "", continuous: r?.continuous ?? false, interimResults: r?.interimResults ?? false,
        started: r?.started ?? 0, stopped: r?.stopped ?? 0, listening: r?.listening ?? false
      };
    });
  },

  /** The recogniser heard `text`: finished (the default) or still forming (`final` false, the words shown after "Listening…"). */
  say(page: Page, text: string, final = true): Promise<void> {
    return page.evaluate(([said, isFinal]) => {
      const r = (window as unknown as Win).__speech!.newest();
      const result = { isFinal, length: 1, 0: { transcript: said, confidence: 1 } };
      const last = r.results[r.results.length - 1] as { isFinal: boolean } | undefined;
      // An interim result is replaced by the next; a final one is kept and the next is a new result.
      const index = last && !last.isFinal ? r.results.length - 1 : r.results.length;
      r.results[index] = result;
      r.onresult?.({ resultIndex: index, results: r.results });
    }, [text, final] as const);
  },

  /** The recogniser failed with the browser's error `code` ("not-allowed" when the microphone is blocked, "network", "audio-capture" ...). */
  fail(page: Page, code: string): Promise<void> {
    return page.evaluate((c) => { (window as unknown as Win).__speech!.newest().onerror?.({ error: c }); }, code);
  },

  /** The browser ends the session by itself (silence, a network blip): the app is expected to start it again. */
  end(page: Page): Promise<void> {
    return page.evaluate(() => {
      const r = (window as unknown as Win).__speech!.newest();
      r.listening = false;
      r.onend?.();
    });
  }
};
