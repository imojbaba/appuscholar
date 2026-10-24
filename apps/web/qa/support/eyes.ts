import { expect, type Page } from "@playwright/test";

/**
 * The show-passphrase eye (components/ui/secret-input.tsx), shared by the stories that open a field with one (S10's passphrase windows, S1's key window).
 *
 * Each field keeps room at its right edge for its eye: its computed padding-right is at least the eye button's width (secret-input.tsx reserves it with `pr-11`; the `.input` rule in
 * app/globals.css, outside any layer, outranks it, so today the padding is 10 px and the eye lies over what is typed: Q5). The eye is the field's `<id>-toggle` when the field has
 * given it a test id (the passphrase fields, the key field), else the button beside the field (the OpenAlex key field does not). A field or an eye that is not on the screen fails the check,
 * saying which.
 */
export async function expectEyeRoom(page: Page, fields: string[]): Promise<void> {
  const rooms = await page.evaluate(
    (ids) =>
      ids.map((id) => {
        const input = document.querySelector(`[data-testid="${id}"]`);
        const eye = document.querySelector(`[data-testid="${id}-toggle"]`) ?? input?.parentElement?.querySelector("button") ?? null;
        return { id, padding: input ? parseFloat(getComputedStyle(input).paddingRight) : NaN, eye: eye ? eye.getBoundingClientRect().width : NaN };
      }),
    fields
  );
  const missing = rooms.filter((r) => Number.isNaN(r.padding) || Number.isNaN(r.eye)).map((r) => r.id);
  expect(missing, "fields (or their eyes) not on the screen").toEqual([]);
  expect(rooms.filter((r) => r.padding < r.eye).map((r) => `${r.id}: padding-right ${r.padding} px, eye ${r.eye} px wide`), "fields whose padding is narrower than their eye").toEqual([]);
}

/** Where a check of the eyes' room takes its expectation from. */
export const EYE_SOURCE = "components/ui/secret-input.tsx (the field keeps 44 px for its eye: pr-11); spec section 8, layout rules (no two controls on top of each other)";
