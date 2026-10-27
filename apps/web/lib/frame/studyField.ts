"use client";
import { useSyncExternalStore } from "react";
import { fieldLabel } from "@appuscholar/core";
import { useSettings } from "@/lib/settings";

/**
 * The open study's own field, as the ProjectShell last published it (start-a-study spec: set when the study is made), for the AI features that read it
 * and must work where there is no shell (a pop-out window, a tool's own test): null until a shell publishes one.
 */
let current: string | null = null;
const subs = new Set<() => void>();

export function publishStudyField(field: string | null): void {
  if (field === current) return;
  current = field;
  for (const f of subs) f();
}
const read = () => current;
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/**
 * The field the AI is told the student studies (v1 fieldName): the open study's own field, else the account's, as before. A study made before studies had
 * fields, the scratch space and a page outside a study use the account's.
 */
export function useStudyField(): string {
  const field = useSyncExternalStore(subscribe, read, () => null);
  const { settings } = useSettings();
  return fieldLabel(field || settings.field);
}
