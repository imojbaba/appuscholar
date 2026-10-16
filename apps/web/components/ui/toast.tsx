"use client";
import { useEffect, useState } from "react";

export type ToastAction = { label: string; onClick: () => void; testId?: string };
type Shown = { message: string; action?: ToastAction };
type Listener = (t: Shown | null) => void;
let listener: Listener | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Show a toast anywhere client-side. One at a time: a new one replaces the current. Auto-hides after 3.2 s (5.2 s above 70 characters);
 * `ms` overrides that, and `action` adds a button (the Undo of a deleted document).
 */
export function toast(message: string, opts: { ms?: number; action?: ToastAction } = {}) {
  clearTimeout(timer);
  listener?.({ message, action: opts.action });
  timer = setTimeout(() => listener?.(null), opts.ms ?? (message.length > 70 ? 5200 : 3200));
}

/** Mount once, in the (app) layout. */
export function ToastHost() {
  const [shown, setShown] = useState<Shown | null>(null);
  useEffect(() => {
    listener = setShown;
    return () => { if (listener === setShown) listener = null; clearTimeout(timer); };
  }, []);
  // The live region is always mounted, so a screen reader is already listening when the first message arrives.
  return (
    <div role="status" aria-live="polite" data-testid="toast-host">
      {shown && (
        <div className="toast" data-testid="toast">
          <span>{shown.message}</span>
          {shown.action && <button type="button" className="toast-action" data-testid={shown.action.testId} onClick={() => { const a = shown.action!; clearTimeout(timer); setShown(null); a.onClick(); }}>{shown.action.label}</button>}
        </div>
      )}
    </div>
  );
}
