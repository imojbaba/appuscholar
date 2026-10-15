"use client";
import { useEffect, useState } from "react";

type Listener = (msg: string | null) => void;
let listener: Listener | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Show a toast anywhere client-side. One at a time: a new one replaces the current. Auto-hides after 3.2 s (5.2 s above 70 characters). */
export function toast(message: string, ms: number = message.length > 70 ? 5200 : 3200) {
  clearTimeout(timer);
  listener?.(message);
  timer = setTimeout(() => listener?.(null), ms);
}

/** Mount once, in the (app) layout. */
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    listener = setMsg;
    return () => { if (listener === setMsg) listener = null; clearTimeout(timer); };
  }, []);
  if (!msg) return null;
  return <div role="status" className="toast" data-testid="toast">{msg}</div>;
}
