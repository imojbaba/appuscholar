"use client";
import { useEffect, useRef, useState } from "react";
import { DownloadSimple, Presentation } from "@phosphor-icons/react";
import { docToSlideModelV2, pptPreviewBullets, type PptSlide } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useDocAccess } from "@/lib/editor/docAccess";
import { downloadBlob } from "@/lib/export/download";
import { buildPptx } from "@/lib/tools/slides/buildPptx";
import { pickSource, previewImages } from "@/lib/tools/slides/source";
import { useProject } from "@/components/frame/ProjectContext";
import { Button } from "@/components/ui/button";

/** What a press of Generate built: the slides, whether a heading made them, and the document's title (for the file's name). v1's `_pptxSlideModel`, kept in memory only. */
type Built = { slides: PptSlide[]; hasHeadings: boolean; title: string | null };
/** What the preview area shows: a model, or "unreadable" when the open document could not be read (no model is built then). */
type Shown = Built | "unreadable";

/**
 * Review's Slides tab (v1 panel 1041-1050, pptxBuildPreview 4988-5008, pptxDownload 5009-5030): Heading 1, 2 and 3 start a slide, the text under it becomes bullets, a picture goes on the
 * slide it sits under. "Generate slide preview" reads the open document and shows the slides; "Download as PowerPoint (.pptx)" writes the model the preview built (as v1 did), with the
 * library loaded only then. Nothing is sent anywhere, no AI is used, and nothing is written to the document or to storage.
 */
export default function SlidesBody() {
  const t = useT();
  const access = useDocAccess();
  const { currentDoc } = useProject();
  const [shown, setShown] = useState<Shown | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const built = shown !== null && shown !== "unreadable" ? shown : null;
  const [note, setNote] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function generate() {
    if (reading) return;
    setNote(null);
    setReading(true);
    const text = access.text();
    let docs: Awaited<ReturnType<typeof access.allDocuments>> | null = null;
    try { docs = await access.allDocuments(); } catch { docs = null; }
    if (!alive.current) return;
    setReading(false);
    const src = docs === null ? null : pickSource(docs, currentDoc?.id ?? null, text);
    if (src === null) { setShown("unreadable"); return; }
    if (src === "none") { setShown({ slides: [], hasHeadings: false, title: null }); return; }
    setShown({ ...docToSlideModelV2(src.html, src.title), title: src.title });
  }

  async function download() {
    if (!built || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const { fileName, blob } = await buildPptx(built.slides, built.title);
      if (!alive.current) return;
      downloadBlob(fileName, blob);
    } catch {
      if (alive.current) setNote(t("slides_failed"));
    }
    if (alive.current) setBusy(false);
  }

  return (
    <div className="panel" data-testid="panel-slides">
      <h3>{t("slides_head")}</h3>
      <p className="desc">{t("slides_desc")}</p>
      <div className="ap-row">
        <Button variant="primary" size="sm" data-testid="slides-generate" disabled={reading} aria-busy={reading} onClick={() => void generate()}>
          <Presentation aria-hidden="true" />{t("slides_generate_btn")}
        </Button>
      </div>
      {reading && <p className="note" role="status" data-testid="slides-status">{t("slides_reading")}</p>}
      {shown === "unreadable" && <p className="ap-warn" role="status" data-testid="slides-unreadable">{t("slides_read_failed")}</p>}
      {built && (
        <div className="mt-3" data-testid="slides-preview">
          {built.slides.length === 0 ? <p className="desc">{t("slides_empty")}</p> : (
            <>
              {!built.hasHeadings && <p className="ap-warn" data-testid="slides-no-headings">{t("slides_no_headings")}</p>}
              {built.slides.map((s, i) => (
                <div key={i} className="mt-2 rounded-lg border border-line p-3" data-testid="slides-card">
                  <div className="ap-small" data-testid="slides-num">{t("slides_card_num", { n: i + 1 })}</div>
                  <h4 className="mt-0.5 text-[15px] font-semibold">{s.title || t("slides_untitled")}</h4>
                  {s.bullets.length > 0 && <ul className="mt-1 list-disc pl-5 text-[13px] leading-[1.5]">{pptPreviewBullets(s.bullets).map((b, j) => <li key={j} className="whitespace-pre-line">{b}</li>)}</ul>}
                  {/* eslint-disable-next-line @next/next/no-img-element -- the student's own picture, from the document: its source is a data:, https: or blob: URL */}
                  {previewImages(s).map((src, j) => <img key={j} src={src} alt={t("slides_picture_alt", { n: i + 1 })} className="mt-2 max-h-48 max-w-full rounded" />)}
                </div>
              ))}
              <div className="ap-row mt-2.5">
                <Button variant="gold" size="sm" data-testid="slides-download" disabled={busy} aria-busy={busy} onClick={() => void download()}>
                  <DownloadSimple aria-hidden="true" />{busy ? t("slides_preparing") : t("slides_download")}
                </Button>
              </div>
              {note && <p className="ap-warn" role="status" data-testid="slides-note">{note}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
