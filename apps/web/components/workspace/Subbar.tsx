"use client";
import { useEffect, useRef, useState } from "react";
import { PROVIDERS, PROV_ORDER, type ProviderId } from "@appuscholar/core";
import { useSettings } from "@/lib/settings";
import { useKeys } from "@/lib/ai/useKeys";
import { toast } from "@/components/ui/toast";
import { useWorkspace } from "./WorkspaceContext";

function isProvider(v: unknown): v is ProviderId { return typeof v === "string" && v in PROVIDERS; }

/** Provider pill and menu: a provider is "ready" when a key for it is usable now or saved (encrypted) on the server. */
export function Subbar() {
  const { settings, update } = useSettings();
  const { openSettings } = useWorkspace();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const current: ProviderId = isProvider(settings.provider) ? settings.provider : "gemini";
  const { hasKey } = useKeys();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const choose = (id: ProviderId) => {
    setOpen(false);
    if (hasKey(id)) { void update({ provider: id }); toast(`Now using ${PROVIDERS[id].short} ✓ Your next AI request goes to ${PROVIDERS[id].short}.`); return; }
    // No key yet: the provider stays as it is; open Settings on that provider so the student can paste one (v1 switchProv).
    openSettings(id);
    toast(`Paste your ${PROVIDERS[id].name} key to enable it`);
  };

  return (
    <div className="subbar" ref={wrap}>
      <button type="button" className="prov" aria-haspopup="menu" aria-expanded={open} data-testid="provider-pill" onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">🔌</span> {PROVIDERS[current].short} {hasKey(current) ? <span className="ok">✓ ready</span> : <span>no key</span>} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="prov-menu" role="menu" aria-label="AI provider">
          {PROV_ORDER.map((id) => (
            <button key={id} type="button" role="menuitemradio" aria-checked={id === current} data-testid={"provider-" + id} onClick={() => choose(id)}>
              <span className="em" aria-hidden="true">{hasKey(id) ? "✓" : ""}</span>{PROVIDERS[id].name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
