// @vitest-environment jsdom
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A paper the bookmark brought while the student was signed out is not lost at the sign-in redirect (wave B Task 20 fix round, register row D-S2-125, walk fault W5): the address's
 * `#capture=` hash comes through the redirect to /signin (a browser keeps a fragment across a redirect), a fragment never reaches the server, so a small client piece on the
 * page copies it into each sign-in form's redirectTo as `/add#capture=...`, and the form's action checks it again on the server. Only a capture, only to /add, never an outside URL.
 */
const h = vi.hoisted(() => ({ signIn: vi.fn(async (..._a: unknown[]) => {}) }));
vi.mock("@/auth", () => ({ signIn: h.signIn }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: ReactNode }) => <a href={href} {...r}>{children}</a> }));

import SignIn from "../app/signin/page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HASH = "#capture=eyJ0aXRsZSI6IlQifQ%3D%3D";
const roots: Root[] = [];
const savedEnv = { ...process.env };

/** Every <form> element in the page's element tree (the page is a server component: its forms' actions are plain functions here). */
function formsOf(node: ReactNode, out: ReactElement<{ action: (fd: FormData) => Promise<void>; children?: ReactNode }>[] = []): typeof out {
  if (Array.isArray(node)) { for (const n of node) formsOf(n, out); return out; }
  if (!isValidElement(node)) return out;
  const el = node as ReactElement<{ action: (fd: FormData) => Promise<void>; children?: ReactNode }>;
  if (el.type === "form") out.push(el);
  formsOf(el.props.children, out);
  return out;
}

async function mount() {
  const page = await SignIn({ searchParams: Promise.resolve({}) });
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(page); });
  return { page, el };
}
const hiddenIn = (form: HTMLFormElement) => form.querySelector<HTMLInputElement>('input[name="redirectTo"]');

beforeEach(() => {
  h.signIn.mockClear();
  process.env.AUTH_RESEND_KEY = "set";
  process.env.E2E_AUTH = "1";
  (process.env as Record<string, string>).NODE_ENV = "test";
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
  process.env = { ...savedEnv };
});

describe("the sign-in page carries a #capture= hash to the adding screen", () => {
  it("every sign-in form (Google, email, the E2E one) has a redirectTo field that reads /add#capture=... when the address has a capture", async () => {
    window.history.replaceState(null, "", "/signin" + HASH);
    const { el } = await mount();
    const forms = [...el.querySelectorAll("form")];
    expect(forms).toHaveLength(3);
    for (const f of forms) expect(hiddenIn(f)?.value, f.getAttribute("data-testid") ?? "form").toBe("/add" + HASH);
  });

  it("with no capture in the address, or another hash, every form still goes to /", async () => {
    for (const hash of ["", "#top"]) {
      window.history.replaceState(null, "", "/signin" + hash);
      const { el } = await mount();
      for (const f of el.querySelectorAll("form")) expect(hiddenIn(f)!.value, hash).toBe("/");
      act(() => { roots.splice(0)[0]!.unmount(); });
      document.body.innerHTML = "";
    }
  });

  it("each form's action signs in with that redirectTo, and with / when the field says anything but a capture for the adding screen", async () => {
    const { page } = await mount();
    const actions = formsOf(page).map((f) => f.props.action);
    expect(actions).toHaveLength(3);
    const good = "/add" + HASH;
    for (const action of actions) {
      for (const [sent, want] of [
        [good, good], ["", "/"], ["/", "/"], ["https://evil.example/", "/"], ["//evil.example/add" + HASH, "/"], ["/p/x/lit/find", "/"], ["/add#top", "/"], ["javascript:alert(1)", "/"]
      ] as const) {
        h.signIn.mockClear();
        const fd = new FormData();
        fd.set("email", "a@b.example");
        fd.set("redirectTo", sent);
        await action(fd);
        expect(h.signIn, sent).toHaveBeenCalledTimes(1);
        expect(h.signIn.mock.calls[0]![1], sent).toMatchObject({ redirectTo: want });
      }
      // A form posted without the field (before the page's script ran) goes to /.
      h.signIn.mockClear();
      const bare = new FormData();
      bare.set("email", "a@b.example");
      await action(bare);
      expect(h.signIn.mock.calls[0]![1]).toMatchObject({ redirectTo: "/" });
    }
  });
});
