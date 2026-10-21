"use client";
import { PdHost } from "@/lib/ai/pdDialog";
import { useSettings } from "@/lib/settings";
import { toast } from "@/components/ui/toast";
import { Help } from "./dialogs/Help";
import { Terms } from "./dialogs/Terms";
import { Welcome } from "./dialogs/Welcome";
import { PassphraseHost } from "./dialogs/Passphrase";
import { ProviderKey } from "./dialogs/ProviderKey";
import { RateLimit } from "./dialogs/RateLimit";
import { VaultRecoverHost } from "./dialogs/VaultRecover";
import { VaultSetupHost } from "./dialogs/VaultSetup";

/** Help, Terms and Welcome live in dialogs/; the passphrase, personal-data and rate-limit dialogs open from callAI and the key dialog; the vault setup from the vault pill and the key dialog; the vault recovery from the unlock ask's vault_forgot link. */
export function ChromeDialogs() {
  const { update } = useSettings();
  return (
    <>
      <Help />
      <Terms />
      <Welcome />
      <ProviderKey />
      <PassphraseHost />
      <VaultSetupHost />
      <VaultRecoverHost />
      <PdHost />
      <RateLimit onSwitchToGroq={() => { void update({ provider: "groq" }); toast("Now using Groq ✓ Your next AI request goes to Groq."); }} />
    </>
  );
}
