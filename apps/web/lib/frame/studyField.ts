"use client";
import { fieldLabel } from "@appuscholar/core";
import { useSettings } from "@/lib/settings";
import { useProjectOrNull } from "@/components/frame/ProjectContext";

/**
 * The field the AI is told the student studies (v1 fieldName): the open study's own field (start-a-study spec: set when the study is made), else the
 * account's, as before. A study made before studies had fields, the scratch space and a page outside a study use the account's.
 */
export function useStudyField(): string {
  const project = useProjectOrNull()?.project;
  const { settings } = useSettings();
  return fieldLabel(project?.field || settings.field);
}
