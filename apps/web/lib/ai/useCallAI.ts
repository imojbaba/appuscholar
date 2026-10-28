"use client";
import { useCallback, useEffect, useRef } from "react";
import { PROVIDERS, type ProviderId } from "@appuscholar/core";
import { useSettings } from "@/lib/settings";
import { toast } from "@/components/ui/toast";
import { useVault } from "@/lib/vault/useVault";
import { useProject } from "@/components/frame/ProjectContext";
import { askPassphrase } from "@/components/workspace/dialogs/Passphrase";
import { showRateLimit } from "@/components/workspace/dialogs/RateLimit";
import { callAI, type CallCtx, type CallOpts } from "./callAI";
import { askPd } from "./pdDialog";
import { isProvider } from "./keys";
import { useKeys } from "./useKeys";
import { readNamesCtx } from "./namesRead";
import { contentLangOf } from "./contentLang";

export { contentLangOf } from "./contentLang";

/** The AI button's entry point (Task 14): callAI with the workspace's provider, keys, language and dialogs filled in. */
export function useCallAI(): (prompt: string, opts?: CallOpts) => Promise<string> {
  const { settings } = useSettings();
  const { project, openConnect } = useProject();
  const keys = useKeys();
  // The names check reads the list and the plan when a request is made, with the vault as it is then (the callback below keeps its identity).
  const vault = useVault();
  const vaultRef = useRef(vault);
  useEffect(() => { vaultRef.current = vault; }, [vault]);
  const provider: ProviderId = isProvider(settings.provider) ? settings.provider : "gemini";
  const contentLang = contentLangOf(project, settings);
  const { blobs, hasKey, getUnlocked } = keys;
  const fallbackOn = settings.aiFallback !== false;
  const projectId = project?.id ?? null;
  return useCallback((prompt, opts = {}) => {
    const ctx: CallCtx = {
      provider: opts.provider ?? provider, blobs, fallbackOn, contentLang, projectId,
      askPassphrase: (p) => askPassphrase({ kind: "unlock", provider: p }),
      unlockKey: getUnlocked,
      askPd,
      // The open project's names (its participant list, its plan, whether the list is locked); none outside a project. Never raises a passphrase prompt (R1, R41).
      ...(projectId ? { names: () => readNamesCtx(projectId, () => vaultRef.current), unlock: () => vaultRef.current.ensureUnlocked() } : {}),
      openConnect: () => { void openConnect({ provider }); },
      onFailover: (from, to) => toast(`${PROVIDERS[from].short} did not answer, so this request used ${PROVIDERS[to].short} instead.`),
      onRateLimit: () => { if (provider !== "groq" && hasKey("groq")) showRateLimit(provider); }
    };
    return callAI(prompt, opts, ctx);
  }, [provider, blobs, fallbackOn, contentLang, projectId, openConnect, hasKey, getUnlocked]);
}
