import type { Editor } from "@tiptap/core";

/**
 * How much document HTML fits in one save. The api refuses a request body over 2.8 MB (DEFAULT_MAX_BODY_BYTES, apps/api/src/app.ts) with a 413,
 * and pictures are inline base64 inside the body, so a picture can push a document over it. Typed as it is the HTML is the body, with room left
 * for the JSON around it; with a vault the body is the ciphertext of the HTML's UTF-8 bytes in base64url, 4/3 as long, so those bytes must stay
 * under 3/4 of that (Hindi is 3 bytes a character, so a Hindi document reaches the sealed limit with fewer characters).
 */
export const BODY_LIMIT_PLAIN = 2_800_000;
export const BODY_LIMIT_SEALED = 2_100_000;

/** The message (pictures pair) that says a picture does not fit and what to do: make a picture smaller or remove one. */
export const sizeMessageKey = "pic_too_big";

/**
 * Whether the document, with `extraChars` more characters (a picture's data URL about to be inserted, or the growth of one about to be
 * replaced), is still small enough to save. `vaultOn` is whether the body is sealed (useVault().status is not "off"). Every caller asks
 * before it writes, and shows `sizeMessageKey` instead of writing when this is false.
 */
export function fitsBudget(editor: Editor, extraChars: number, vaultOn: boolean): boolean {
  const html = editor.getHTML();
  // Sealed: the size that is encrypted is the UTF-8 bytes. Plain: the api counts characters. A picture's data URL is ASCII, one byte a character.
  const size = vaultOn ? utf8.encode(html).length : html.length;
  return size + extraChars <= (vaultOn ? BODY_LIMIT_SEALED : BODY_LIMIT_PLAIN);
}
const utf8 = new TextEncoder();
