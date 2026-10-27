"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { FIELD_LIST, OTHER_FIELD, cleanField, currentField, fieldKey } from "@/lib/fields";
import { toast } from "@/components/ui/toast";

/** The student's field of study (`settings.field`) in Settings: v1's list, with Other and a free-text box. A study's own field is chosen when it is made (NewStudy). */
export function FieldPicker() {
  const t = useT();
  const { settings, update } = useSettings();
  const field = currentField(settings.field);
  const known = FIELD_LIST.includes(field);
  const [other, setOther] = useState(!known);
  const [custom, setCustom] = useState(known ? "" : field);

  function choose(v: string) {
    if (v === OTHER_FIELD) { setOther(true); return; }
    setOther(false);
    void update({ field: v });
    toast(t("settings_field_set", { f: t(fieldKey(v)) }));
  }
  function saveCustom() {
    const v = cleanField(custom);
    if (!v) return;
    setCustom(v);
    if (v !== settings.field) { void update({ field: v }); toast(t("settings_field_set", { f: v })); }
  }

  return (
    <>
      <label htmlFor="fieldSel">{t("settings_field_label")}</label>
      <select className="input" id="fieldSel" value={other ? OTHER_FIELD : field} onChange={(e) => choose(e.target.value)} data-testid="field-select">
        {FIELD_LIST.map((f) => <option key={f} value={f}>{t(fieldKey(f))}</option>)}
        <option value={OTHER_FIELD}>{t("settings_field_other")}</option>
      </select>
      {other && <input className="input mt-1.5" type="text" maxLength={60} placeholder={t("settings_field_custom")} aria-label={t("settings_field_custom")} value={custom}
        onChange={(e) => setCustom(e.target.value)} onBlur={saveCustom} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveCustom(); } }} data-testid="field-custom" />}
    </>
  );
}
