"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useKeys } from "@/lib/ai/useKeys";
import { saveOpenAlexKey, useOpenAlexKey } from "@/lib/research/oaKey";
import { useVault } from "@/lib/vault/useVault";
import { SecretInput } from "@/components/ui/secret-input";
import { toast } from "@/components/ui/toast";

/**
 * The OpenAlex key (v1 1186-1190): in Settings, and where paper search has used up its free daily allowance (first-run build spec, OJ 2026-10-27). The field
 * shows the key when it is open in this tab, as v1's fieldInit fills #oaKeyIn (2510); saved on change (blur or Enter). `id` tells the two places apart.
 */
export function OpenAlexKeyField({ id = "oaKeyIn", testId = "oa-key-input" }: { id?: string; testId?: string }) {
  const t = useT();
  const keys = useKeys();
  const vault = useVault();
  const oaKey = useOpenAlexKey() ?? "";
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? oaKey;
  async function save() {
    if (typed === null || typed === oaKey) return;
    const ok = await saveOpenAlexKey(typed, { keys, vault, toast, t });
    if (ok) setTyped(null);
  }
  return (
    <div className="field !mb-0">
      <label htmlFor={id}>{t("rs2_oa_key_label")}</label>
      <SecretInput secret="key" id={id} autoComplete="off" spellCheck={false} value={shown} placeholder={t("rs2_oa_key_placeholder")}
        onChange={(e) => setTyped(e.target.value)} onBlur={() => { void save(); }} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} data-testid={testId} />
      <p className="m-0 text-[13px] text-muted-foreground">{t("rs2_oa_key_desc")}</p>
    </div>
  );
}
