import {
  chartParseLines, escHTML, quickChartSvg, sanitizeHtml, statsParseText, VZ_I18N, vennSvg, vzAxisDefaults, vzCaption, vzChart, vzDefaults, vzGroups,
  type ParsedCol, type ParsedData, type VennInput, type VzOptions, type VzTr, type VzType
} from "@appuscholar/core";
import { blocksToHtml } from "./results";
import { svgDataUrl } from "./png";

/*
 * The Charts tab's side of v1's Chart Studio (vzLoad 3676-3689, vzSync 3698-3706, vzDefaults 3708-3721, vzDraw 3722-3737, vzInsert 3891-3900), the quick chart (chartGenerate 4874-4898) and the
 * Venn maker (vennGenerate 4900-4940). Core draws (vzChart, quickChartSvg, vennSvg); this file is what the tab does between the dialog's fields and core: which columns can be picked,
 * the options core is given, the defaults that fill the title, note and axis labels while the student has not typed there, and the markup that goes into the document.
 * The data rows (a pasted table, or the Data tab's) stay in memory: this file's memory holds the text of the paste box and the choices, never a blob (ledger R1).
 */

export type ErrKind = "ci" | "sd" | "se" | "none";
/** Everything Chart Studio's fields hold. A field typed over a default is a string; `null` means the student has not typed there, so it follows the default (v1's dataset.touched). */
export type StudioForm = {
  /** Where the table comes from: the paste box, or the table parsed in the Data tab. */
  source: "paste" | "lab";
  text: string;
  type: VzType;
  /** The score column's index as a string, or "" before one is picked (the first numeric column is then used). */
  y: string;
  /** null: not picked yet (the first categorical column is used, as v1 did); "": no groups; otherwise the column's index. */
  g: string | null;
  err: ErrKind;
  pal: "color" | "gray";
  bins: string;
  pts: boolean;
  showN: boolean;
  titleIn: boolean;
  title: string | null;
  xl: string | null;
  yl: string | null;
  note: string | null;
  yMin: string;
  yMax: string;
  /** The figure number; null follows `stats_prefs.figno` (1 when there is none). */
  fig: string | null;
};
export const defaultStudioForm = (): StudioForm => ({
  source: "paste", text: "", type: "box", y: "", g: null, err: "ci", pal: "color", bins: "", pts: true, showN: true, titleIn: false,
  title: null, xl: null, yl: null, note: null, yMin: "", yMax: "", fig: null
});

/** The quick chart's fields (v1 #chartType, #chartData, #chartTitle and the eleven Venn boxes). */
export type QuickForm = { type: "bar" | "line" | "venn2" | "venn3"; data: string; title: string; venn: VennInput };
export const defaultQuickForm = (): QuickForm => ({
  type: "bar", data: "", title: "", venn: { a: "", aSize: "", b: "", bSize: "", c: "", cSize: "", ab: "", ac: "", bc: "", abc: "", title: "" }
});

const studioMemory = new Map<string, StudioForm>();
const quickMemory = new Map<string, QuickForm>();
/** What was typed in Chart Studio and in the quick chart for a project, kept while the app is open: a tab switch mounts the tab again. */
export const recallStudio = (projectId: string): StudioForm => studioMemory.get(projectId) ?? defaultStudioForm();
export const rememberStudio = (projectId: string, f: StudioForm): void => { studioMemory.set(projectId, f); };
export const recallQuick = (projectId: string): QuickForm => quickMemory.get(projectId) ?? defaultQuickForm();
export const rememberQuick = (projectId: string, f: QuickForm): void => { quickMemory.set(projectId, f); };
export function resetCharts(): void { studioMemory.clear(); quickMemory.clear(); }

/** v1's t() for a `vz_*` key: the Hindi string when the language is Hindi and the key has one, else the English, else the key. */
export function vzTrFor(lang: "en" | "hi"): VzTr {
  const en = VZ_I18N.en as Record<string, string>, hi = VZ_I18N.hi as Record<string, string>;
  return (k) => (lang === "hi" && k in hi ? hi[k]! : en[k] ?? k);
}

/** The table Chart Studio draws from: the Data tab's table, or the paste box parsed by core (v1 vzLoad); null when there is none to use (no columns or no rows). */
export function studioData(form: StudioForm, lab: ParsedData | null): ParsedData | null {
  const d = form.source === "lab" ? lab : statsParseText(form.text);
  return d && d.cols.length && d.rows.length ? d : null;
}

/** The columns the two selects offer (v1 vzLoad 3680): numeric ones for the score, categorical ones for the groups. */
export function studioColumns(d: ParsedData): { num: ParsedCol[]; cat: ParsedCol[] } {
  return { num: d.cols.filter((c) => c.type === "numeric"), cat: d.cols.filter((c) => c.type === "categorical") };
}

/** The score and group columns the selects show: the picked one when it is still offered, else the first numeric column, and for groups the first categorical one (v1 vzLoad 3685-3686). */
export function settleColumns(form: StudioForm, d: ParsedData): { y: ParsedCol | null; g: ParsedCol | null } {
  const { num, cat } = studioColumns(d);
  const y = num.find((c) => String(c.index) === form.y) ?? num[0] ?? null;
  const g = form.g === "" ? null : cat.find((c) => String(c.index) === form.g) ?? cat[0] ?? null;
  return { y, g };
}

export type StudioView =
  | { kind: "nodata" }
  | { kind: "failed" }
  | {
      kind: "ok"; svg: string; src: string; tableHtml: string; warn: string; caption: { n: number; title: string; note: string };
      /** The fields as drawn: the typed value or the default. */
      fields: { title: string; note: string; xl: string; yl: string };
    };

/** The defaults vzSync and vzDefaults write into the title, note and axis labels, for the form's picks. */
export function studioDefaults(form: StudioForm, d: ParsedData, tr: VzTr): { title: string; note: string; xl: string; yl: string } {
  const { y, g } = settleColumns(form, d);
  const base = vzDefaults(form.type, y?.name ?? "", g?.name ?? "", form.err, form.pts);
  const ax = vzAxisDefaults(form.type, y?.name ?? "", g ? g.name : tr("vz_none"));
  return { ...base, xl: ax.xl, yl: ax.yl };
}

/** The options core is given (v1 vzBox and the others read these from the dialog). */
export function studioOptions(form: StudioForm, fields: { title: string; xl: string; yl: string }): VzOptions {
  return {
    type: form.type, palette: form.pal, title: form.titleIn ? fields.title : "", showPts: form.pts, showN: form.showN, err: form.err,
    bins: form.bins, yMin: form.yMin, yMax: form.yMax, yLabel: fields.yl, xLabel: fields.xl
  };
}

/**
 * v1 vzDraw (3722-3737): the groups from the picked columns, then core's chart. No groups: the "No numbers to draw yet" message. `figFallback` is the number the figure box shows
 * when the student has not typed there (the saved one). The chart's table is core's blocks as HTML through the sanitizer: it carries student group names. The picture is returned as the
 * svg string (for the PNG and the download) and as a data URL (for an <img>, which never runs a script and cannot turn a label into markup).
 */
export function studioView(form: StudioForm, d: ParsedData, tr: VzTr, figFallback: string): StudioView {
  const fields = studioDefaults(form, d, tr);
  const title = form.title ?? fields.title, note = form.note ?? fields.note, xl = form.xl ?? fields.xl, yl = form.yl ?? fields.yl;
  const { y, g } = settleColumns(form, d);
  let r;
  try {
    const gs = vzGroups(d, y ? y.index : NaN, g ? g.index : null);
    r = vzChart(studioOptions(form, { title, xl, yl }), gs, tr);
  } catch {
    // core's vzGroups throws for a group named like a member of Object.prototype ("constructor"), as v1's did
    return { kind: "failed" };
  }
  if (!r) return { kind: "nodata" };
  return {
    kind: "ok", svg: r.svg, src: svgDataUrl(r.svg), tableHtml: sanitizeHtml(blocksToHtml(r.table)), warn: r.warn ?? "",
    caption: vzCaption(form.fig ?? figFallback, title, note), fields: { title, note, xl, yl }
  };
}

/**
 * What vzInsert puts in the document (3891-3900), in v1's order: "Figure N" in bold, the title in italics, the picture, "Note." and the note, and an empty paragraph. The words
 * "Figure" and "Note." are APA 7's, as v1 wrote them. `png` must be a PNG data URL (the caller checks); the title, note and alt text are escaped.
 */
export function figureHtml(cp: { n: number; title: string; note: string }, png: string): string {
  return '<p data-cap="figure"><strong>Figure ' + cp.n + "</strong></p>" + (cp.title ? '<p data-cap-title="1"><em>' + escHTML(cp.title) + "</em></p>" : "") +
    '<img src="' + png + '" alt="' + escHTML(cp.title || "Figure " + cp.n) + '" style="max-width:520px;width:100%">' +
    (cp.note ? "<p><em>Note.</em> " + escHTML(cp.note) + "</p>" : "") + "<p><br></p>";
}

/** What chartInsertToDoc puts in (4941-4946) for a quick chart or a Venn diagram: the picture as PNG (R3), at the width v1 gave it. */
export function pictureHtml(png: string, alt: string): string {
  return '<img src="' + png + '" alt="' + escHTML(alt) + '" style="max-width:520px;width:100%">';
}

export type QuickView = { kind: "empty" } | { kind: "ok"; svg: string; src: string };
/**
 * v1 chartGenerate (4874-4898) and vennGenerate (4900-4940) as pure steps: a bar or line chart from the "label,value" lines (none readable: the refusal, nothing drawn), or a Venn
 * diagram from the boxes. The choice of 2 or 3 sets is what is drawn (v1 told them apart by whether the C label was typed: with "3 sets" and the label blank it drew two, and with "2 sets" and the hidden C label still holding text it drew three); a blank C label in the 3-set diagram is called "C", as core's fallback names it.
 */
export function quickView(f: QuickForm): QuickView {
  if (f.type === "bar" || f.type === "line") {
    const svg = quickChartSvg(chartParseLines(f.data), f.type, f.title.trim());
    return svg ? { kind: "ok", svg, src: svgDataUrl(svg) } : { kind: "empty" };
  }
  const v = f.type === "venn2" ? { ...f.venn, c: "" } : { ...f.venn, c: f.venn.c.trim() || "C" };
  const svg = vennSvg(v);
  return { kind: "ok", svg, src: svgDataUrl(svg) };
}
