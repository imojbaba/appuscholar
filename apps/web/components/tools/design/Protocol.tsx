"use client";
import { useState } from "react";
import { DESIGN_TOASTS, protoDone, protocolMarkdown, type ProtoFields } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { useInsertAtEnd } from "@/lib/tools/design/insertEnd";
import { notesOf, useDesign } from "@/lib/tools/design/useDesign";
import { Button } from "@/components/ui/button";
import { Notes } from "./Notes";

/** v1's textareas were three rows for the long sections and two for the others (1848-1855); the keys, in v1's order (protoLoad 5943-5946), are the stored fields' (the words are `design_proto_<key>` and `design_proto_<key>_ph`). */
const ROWS: Record<keyof ProtoFields, number> = { bg: 3, obj: 2, design: 2, part: 2, sample: 2, proc: 3, risk: 2, dmp: 2 };
const FIELDS = Object.keys(ROWS) as Array<keyof ProtoFields>;

/**
 * The protocol / synopsis builder (v1 protoLoad, protoRead, protoSave, protoGenerate 5942-5977 and the dialog 1845-1860): eight sections in the
 * student's own words. Save stores them trimmed with `done` (core's protoDone). "Generate protocol document" saves them first (v1 calls protoSave),
 * then puts core's protocolMarkdown at the end of the open document as plain text and says "Inserted"; with every section empty it inserts nothing and
 * shows core's "Fill in at least one section first" beside the button. What is typed is kept in the blob only when Save or Generate is pressed, as in v1.
 */
export function Protocol({ projectId }: { projectId: string }) {
  const t = useT();
  const proto = useDesign("proto", projectId);
  const { insert, busy } = useInsertAtEnd();
  const stored = proto.value;
  // What the boxes show: the stored texts, then what the student has typed since (nothing is stored until Save or Generate).
  const [edit, setEdit] = useState<Partial<ProtoFields>>({});
  const [msg, setMsg] = useState("");
  const now = Object.fromEntries(FIELDS.map((k) => [k, edit[k] ?? stored?.[k] ?? ""])) as ProtoFields;
  /** protoRead: the eight texts, trimmed. */
  const read = (): ProtoFields => Object.fromEntries(FIELDS.map((k) => [k, now[k].trim()])) as ProtoFields;
  /** protoSave's store (5953-5956): the trimmed texts and `done`, over the blob that was there (a key a later version adds is kept). */
  const store = (o: ProtoFields): boolean => {
    const ok = proto.save((prev) => ({ ...(prev ?? {}), ...o, done: protoDone(o) }));
    if (ok) setEdit({});
    return ok;
  };
  const save = () => { setMsg(""); if (store(read())) toast(t("design_saved")); };
  const generate = async () => {
    setMsg("");
    const o = read();
    const doc = protocolMarkdown(o);
    if (doc === null) { setMsg(DESIGN_TOASTS.protoEmpty); return; }
    store(o);
    if (!(await insert(doc))) setMsg(t("design_insert_failed"));
  };
  return (
    <div className="panel" data-testid="panel-design-protocol">
      <h3>{t("tab_name_protocol")}</h3>
      <p className="desc">{t("design_proto_intro")}</p>
      <Notes {...notesOf(proto)} />
      <div className="stack" style={{ maxWidth: "62ch" }}>
        {FIELDS.map((k) => (
          <label key={k} className="flex flex-col gap-1 text-[13.5px] text-ink">
            {t("design_proto_" + k)}
            <textarea
              className="input" rows={ROWS[k]} data-testid={"proto-" + k} placeholder={t("design_proto_" + k + "_ph")} value={now[k]}
              onChange={(e) => { setMsg(""); setEdit((p) => ({ ...p, [k]: e.target.value })); }}
            />
          </label>
        ))}
        <div className="place-row" style={{ marginBottom: 0 }}>
          <Button variant="primary" data-testid="proto-save" onClick={save}>{t("design_save")}</Button>
          <Button variant="gold" data-testid="proto-generate" disabled={busy} onClick={() => { void generate(); }}>{t("design_proto_generate")}</Button>
        </div>
        <div role="status" data-testid="proto-msg" className={msg ? "text-[13px] leading-[18px] text-ink" : ""}>{msg}</div>
      </div>
    </div>
  );
}
