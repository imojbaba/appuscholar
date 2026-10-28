"use client";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";

/**
 * The specialty pack (v1 1171-1178, getPack 2660, setPack 2677): General research or Psychology, in Settings below the content language. No pack chosen
 * yet reads as psychology, as in v1 (ruling P3), so nobody loses the Research helpers; "general" hides that fold in Writing (WritingPlace). v1
 * toasted "Pack set: ..." in English only, which v2 leaves out: the select shows the choice. Mounted in Settings.tsx.
 */
export function SettingsPack() {
  const t = useT();
  const { settings, update } = useSettings();
  return (
    <div className="field !mb-0 border-t border-line pt-3">
      <label htmlFor="packSel">{t("settings_pack_label")}</label>
      <select className="input" id="packSel" value={settings.pack ?? "psychology"} onChange={(e) => { void update({ pack: e.target.value === "general" ? "general" : "psychology" }); }} data-testid="settings-pack">
        <option value="general">{t("settings_pack_general")}</option>
        <option value="psychology">{t("settings_pack_psychology")}</option>
      </select>
      <p className="m-0 text-[13px] text-muted-foreground">{t("settings_pack_desc")}</p>
    </div>
  );
}
