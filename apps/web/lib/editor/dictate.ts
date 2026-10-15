/** v1 dictation: the browser's speech recognition (Chrome and Edge), no key and no server of ours. */
type Alt = { transcript: string };
type Result = { isFinal: boolean; 0: Alt; length: number };
type SREvent = { resultIndex: number; results: { length: number; [i: number]: Result } };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: SREvent) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void;
};
type Ctor = new () => Recognition;

export const UNSUPPORTED_MESSAGE = "Dictation is not available in this browser. Chrome and Edge support it.";
export const DICTATION_LANGS = [
  { code: "en-IN", label: "English (India)" },
  { code: "hi-IN", label: "Hindi" },
  { code: "en-US", label: "English (US)" }
] as const;

/** hi-IN when the content language is Hindi, else en-IN. */
export function defaultDictationLang(contentLang: string | undefined): string {
  return contentLang === "hi" ? "hi-IN" : "en-IN";
}

function ctor(): Ctor | null {
  const w = globalThis as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function dictationSupported(): boolean { return ctor() !== null; }

export type Dictation = { stop(): void };

/**
 * Starts listening. `onInterim` gets the words still being recognised (shown in a live region, replaced as they firm up);
 * `onFinal` gets each finished phrase once. `onEnd` fires when listening stops for any reason, `onError` with the browser's error code.
 * Returns null when the browser has no speech recognition.
 */
export function startDictation(opts: { lang: string; onInterim(text: string): void; onFinal(text: string): void; onEnd(): void; onError?(code: string): void }): Dictation | null {
  const C = ctor();
  if (!C) return null;
  const rec = new C();
  rec.lang = opts.lang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (!r) continue;
      if (r.isFinal) opts.onFinal(r[0].transcript);
      else interim += r[0].transcript;
    }
    opts.onInterim(interim);
  };
  rec.onerror = (e) => opts.onError?.(e.error);
  rec.onend = () => { opts.onInterim(""); opts.onEnd(); };
  rec.start();
  return { stop: () => rec.stop() };
}
