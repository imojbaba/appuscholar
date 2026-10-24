"use client";
import { useSyncExternalStore } from "react";
import { carriedCapture } from "@/lib/cite/captureHash";

const subscribe = (cb: () => void) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); };
const here = () => carriedCapture(window.location.hash);
const server = () => "/";

/**
 * The `redirectTo` field of a sign-in form (wave B Task 20 fix round, register row D-S2-125, walk fault W5). A bookmark clicked while signed out opens `/add#capture=...`; the server
 * sends the browser to /signin, and a browser keeps the fragment across that redirect, but a fragment never reaches the server, so the page can only read it here, in the browser. The
 * field says `/add#capture=...` for a capture in the address and `/` for anything else (also on the server, and until the page has loaded), and the form's action checks it again
 * (carriedCapture): after signing in the student lands on the adding screen with the paper, not on a home that has never heard of it.
 */
export function CarryCapture() {
  const redirectTo = useSyncExternalStore(subscribe, here, server);
  return <input type="hidden" name="redirectTo" value={redirectTo} data-testid="signin-redirect" />;
}
