"use client";
import { useEffect, useSyncExternalStore } from "react";
import { DICTS, tFormat } from "@/lib/i18n";
import { reportClientError } from "@/lib/errors/reportClientError";

const noSubscribe = () => () => {};
const docLang = (): "en" | "hi" => (document.documentElement.lang === "hi" ? "hi" : "en");

/**
 * Replaces the root layout when it throws, so it brings its own <html> and <body> and has no providers (no LangProvider, no stylesheet):
 * the language is read from the document, and the styling is inline.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const lang = useSyncExternalStore(noSubscribe, docLang, () => "en" as const);
  useEffect(() => { reportClientError(error); }, [error]);
  return (
    <html lang={lang}>
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" }}>
        <div role="alert" style={{ maxWidth: 420, padding: 32 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 12px" }}>{tFormat(DICTS.en, DICTS.hi, "app_error_title", lang)}</h1>
          <button type="button" onClick={reset} style={{ font: "inherit", padding: "8px 16px", cursor: "pointer" }}>{tFormat(DICTS.en, DICTS.hi, "app_error_retry", lang)}</button>
        </div>
      </body>
    </html>
  );
}
