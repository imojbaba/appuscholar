"use client";
import { useRef } from "react";

type AutoFocus = (event: Event) => void;

/**
 * Radix returns focus to the dialog's Trigger when it closes, and moves it to nowhere when the dialog is opened by state
 * (every dialog of the workspace is: Help, Settings, Projects, the drawer). This remembers what had focus as the dialog opened
 * and gives it back on close, unless the caller's own `onCloseAutoFocus` already chose where focus goes (preventDefault)
 * or the opener is gone (a dialog opened from a menu or another dialog that has since closed),
 * or focus has already gone somewhere on purpose (the next dialog opened by the click that closed this one).
 */
export function useRestoreFocus(own: { onOpenAutoFocus?: AutoFocus; onCloseAutoFocus?: AutoFocus } = {}) {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: (e: Event) => {
      const a = document.activeElement;
      opener.current = a instanceof HTMLElement && a !== document.body ? a : null;
      own.onOpenAutoFocus?.(e);
    },
    onCloseAutoFocus: (e: Event) => {
      own.onCloseAutoFocus?.(e);
      const el = opener.current;
      opener.current = null;
      const a = document.activeElement;
      const free = !a || a === document.body;
      if (!e.defaultPrevented && free && el?.isConnected) { e.preventDefault(); el.focus(); }
    }
  };
}
