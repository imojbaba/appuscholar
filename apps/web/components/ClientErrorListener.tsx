"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/errors/reportClientError";

/** Reports uncaught errors and unhandled promise rejections in this tab to our own server (class name and route only). Renders nothing. */
export function ClientErrorListener() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportClientError(e.error);
    const onRejection = (e: PromiseRejectionEvent) => reportClientError(e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
