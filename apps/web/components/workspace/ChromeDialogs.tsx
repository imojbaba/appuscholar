"use client";
import { PdHost } from "@/lib/ai/pdDialog";
import { useSettings } from "@/lib/settings";
import { toast } from "@/components/ui/toast";
import { ChromeExtras } from "@/components/help/ChromeExtras";
import { Help } from "./dialogs/Help";
import { Terms } from "./dialogs/Terms";
import { PassphraseHost } from "./dialogs/Passphrase";
import { SettingsWindow } from "./dialogs/Settings";
import { ConnectAI } from "./dialogs/ConnectAI";
import { RateLimit } from "./dialogs/RateLimit";
import { VaultRecoverHost } from "./dialogs/VaultRecover";
import { VaultSetupHost } from "./dialogs/VaultSetup";

/** Help, Terms and Settings live in dialogs/; Connect AI opens from the AI pill, the account menu, an AI button with no key and the idea screen; the passphrase, personal-data and rate-limit dialogs open from callAI; the vault setup from the vault pill and the account menu; the vault recovery from the unlock ask's vault_forgot link. */
export function ChromeDialogs() {
  const { update } = useSettings();
  return (
    <>
      <Help />
      <ChromeExtras />
      <Terms />
      <SettingsWindow />
      <ConnectAI />
      <PassphraseHost />
      <VaultSetupHost />
      <VaultRecoverHost />
      <PdHost />
      <RateLimit onSwitchToGroq={() => { void update({ provider: "groq" }); toast("Now using Groq ✓ Your next AI request goes to Groq."); }} />
    </>
  );
}
