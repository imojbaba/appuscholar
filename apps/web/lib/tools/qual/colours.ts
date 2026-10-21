/*
 * The colours of the codes in the document (v1 qualTagSelection 6255: background colour + '55', box-shadow 0 0 0 1px colour + '88'). v2 never writes a colour into a
 * document (ruling R4): the module's DocumentLayer draws them from the code list with this stylesheet text. The id and the colour come from a stored list, so they are
 * untrusted strings that end up in CSS: a colour is accepted only as #rrggbb and an id only as letters, digits, "_" and "-"; a code with anything else is skipped, and
 * nothing else of a code (its name least of all) is ever put in the text.
 */
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const CODE_ID = /^[A-Za-z0-9_-]+$/;

/** The colour as a stored value gives it when it is #rrggbb, else undefined (no background): for a swatch's inline style, where the same untrusted string would otherwise go in unchecked. */
export function codeColourOf(color: unknown): string | undefined {
  return typeof color === "string" && HEX_COLOUR.test(color) ? color : undefined;
}

/** The stylesheet text for the codes: one rule for each usable code, one per line; "" when there is none (or the value is not a list). */
export function codeColourCss(codes: unknown): string {
  if (!Array.isArray(codes)) return "";
  const rules: string[] = [];
  for (const c of codes as unknown[]) {
    if (!c || typeof c !== "object") continue;
    const { id, color } = c as { id?: unknown; color?: unknown };
    if (typeof id !== "string" || typeof color !== "string" || !CODE_ID.test(id) || !HEX_COLOUR.test(color)) continue;
    rules.push(`.editor .ProseMirror span.qual-tag[data-qcode="${id}"]{background:${color}55;box-shadow:0 0 0 1px ${color}88}`);
  }
  return rules.join("\n");
}
