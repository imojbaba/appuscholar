"use client";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { TERMS_SINCE, needsTerms } from "@/lib/terms";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProject } from "@/components/frame/ProjectContext";
import { TermsBody, useTermsForm } from "./TermsBody";

/**
 * First-use terms with the 18+ gate (v1 `termsOpen`/`termsAccept`/`termsUnder`), and the same text read-only from the AI Provider / Key dialog.
 * While the gate applies the dialog cannot be dismissed: Escape, a click outside and a focus change are refused, and Escape shows the need line.
 * Accepting records it on the server (POST /me/terms); the under-18 path records nothing. The text and the form are TermsBody's, which the adding screen shows in place too.
 */
export function Terms() {
  const { me } = useSettings();
  const { dialog, closeDialog } = useProject();
  const gate = needsTerms(me, TERMS_SINCE);
  const open = gate || dialog === "terms";
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !gate) closeDialog(); }}>
      {open && <TermsContent gate={gate} onClose={closeDialog} />}
    </Dialog>
  );
}

// Mounted only while the dialog is open, so every opening starts clean (v1 termsOpen).
function TermsContent({ gate, onClose }: { gate: boolean; onClose(): void }) {
  const t = useT();
  const form = useTermsForm();
  return (
      <DialogContent
        className="max-w-xl"
        showCloseButton={false}
        aria-describedby={undefined}
        data-testid="terms-dialog"
        onEscapeKeyDown={(e) => { if (gate) { e.preventDefault(); form.setNeed(true); } }}
        onPointerDownOutside={(e) => { if (gate) e.preventDefault(); }}
        onInteractOutside={(e) => { if (gate) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-purple-800">{t("terms_h")}</DialogTitle>
        </DialogHeader>
        <TermsBody gate={gate} form={form} onClose={onClose} />
      </DialogContent>
  );
}
