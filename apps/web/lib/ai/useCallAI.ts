"use client";
import { useCallback } from "react";
import { PROVIDERS, type ProviderId } from "@appuscholar/core";
import { useSettings } from "@/lib/settings";
import { toast } from "@/components/ui/toast";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import { askPassphrase } from "@/components/workspace/dialogs/Passphrase";
import { showRateLimit } from "@/components/workspace/dialogs/RateLimit";
import { callAI, type CallCtx, type CallOpts } from "./callAI";
import { askPd } from "./pdDialog";
import { isProvider } from "./keys";
import { useKeys } from "./useKeys";

/** The content language a request is written in: the open project's, else the default in Settings (v1 getContentLang 2472). */
export function contentLangOf(project: { contentLang?: string } | null | undefined, settings: { contentLang?: string }): "en" | "hi" {
  return project ? (project.contentLang === "hi" ? "hi" : "en") : settings.contentLang === "hi" ? "hi" : "en";
}

/** The AI button's entry point (Task 14): callAI with the workspace's provider, keys, language and dialogs filled in. */
export function useCallAI(): (prompt: string, opts?: CallOpts) => Promise<string> {
  const { settings } = useSettings();
  const { project, openSettings } = useWorkspace();
  const keys = useKeys();
  const provider: ProviderId = isProvider(settings.provider) ? settings.provider : "gemini";
  const contentLang = contentLangOf(project, settings);
  const { blobs, hasKey, getUnlocked } = keys;
  const fallbackOn = settings.aiFallback !== false;
  const projectId = project?.id ?? null;
  return useCallback((prompt, opts = {}) => {
    const ctx: CallCtx = {
      provider, blobs, fallbackOn, contentLang, projectId,
      askPassphrase: (p) => askPassphrase({ kind: "unlock", provider: p }),
      unlockKey: getUnlocked,
      askPd,
      openSettings: () => openSettings(provider),
      onFailover: (from, to) => toast(`${PROVIDERS[from].short} did not answer, so this request used ${PROVIDERS[to].short} instead.`),
      onRateLimit: () => { if (provider !== "groq" && hasKey("groq")) showRateLimit(provider); }
    };
    return callAI(prompt, opts, ctx);
  }, [provider, blobs, fallbackOn, contentLang, projectId, openSettings, hasKey, getUnlocked]);
}
