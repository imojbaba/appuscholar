// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import en from "../messages/en.json";
import hi from "../messages/hi.json";
import { SecretInput } from "../components/ui/secret-input";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(node); });
}
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("SecretInput (O14: the show-passphrase toggle)", () => {
  it("is a password field by default; the eye shows the text and hides it again, and says which through pass_show / pass_hide", () => {
    mount(<SecretInput value="correct horse" onChange={() => undefined} data-testid="f" toggleTestId="f-toggle" aria-label="Passphrase" />);
    const input = $("f") as HTMLInputElement;
    const eye = $("f-toggle") as HTMLButtonElement;
    expect(input.type).toBe("password");
    expect(input.value).toBe("correct horse");
    expect(input.className).toContain("input");
    expect(eye.type).toBe("button"); // never submits the form it sits in
    expect(eye.getAttribute("aria-label")).toBe(en.pass_show);
    expect(eye.getAttribute("aria-pressed")).toBe("false");
    act(() => { eye.click(); });
    expect(input.type).toBe("text");
    expect(eye.getAttribute("aria-label")).toBe(en.pass_hide);
    expect(eye.getAttribute("aria-pressed")).toBe("true");
    act(() => { eye.click(); });
    expect(input.type).toBe("password");
  });

  it("an API key field uses the key wording", () => {
    mount(<SecretInput value="" onChange={() => undefined} secret="key" data-testid="k" toggleTestId="k-toggle" aria-label="Key" />);
    expect($("k-toggle").getAttribute("aria-label")).toBe(en.key_show);
    act(() => { $("k-toggle").click(); });
    expect($("k-toggle").getAttribute("aria-label")).toBe(en.key_hide);
  });

  it("the four labels have Hindi drafts", () => {
    for (const k of ["pass_show", "pass_hide", "key_show", "key_hide"] as const) {
      expect(en[k]).toBeTruthy();
      expect((hi as Record<string, string>)[k]).toBeTruthy();
      expect((hi as Record<string, string>)[k]).not.toBe(en[k]);
    }
  });
});
