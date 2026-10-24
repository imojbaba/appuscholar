"use client";
import { useEffect, useRef } from "react";
import { bookmarkletHrefV3 } from "@appuscholar/core";
import { BookmarkSimple } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { buttonVariants } from "@/components/ui/button";

/**
 * "Add from any journal page" (wave B Task 20, register row D-S2-125, walk fault W6): the bookmark as an extra, under the search in Find (the paste box is the main way in). The
 * button is a link whose href is the bookmark, `bookmarkletHrefV3(origin)`, which opens the adding screen at `/add`; the student drags it to the bookmarks bar once, and on a
 * paper's page clicks it. The href is set on the element, as v1 sets it (citSetupBookmarklet 13635): React refuses a `javascript:` URL in an href prop. A click here does nothing
 * (v1's `onclick="return false"`); the button is for dragging.
 */
export function AddFromPage() {
  const t = useT();
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => { link.current?.setAttribute("href", bookmarkletHrefV3(window.location.origin)); }, []);
  return (
    <section className="addvia" aria-labelledby="addviaH" data-testid="add-from-page">
      <h2 id="addviaH" className="addvia-h">{t("addpage_h")}</h2>
      <p className="addvia-line">{t("addpage_line")}</p>
      <a ref={link} href="#" className={buttonVariants({ variant: "ghost" }) + " addvia-btn"} draggable="true" data-testid="add-bookmark" onClick={(e) => e.preventDefault()}>
        <BookmarkSimple size={18} aria-hidden="true" />{t("addpage_btn")}
      </a>
    </section>
  );
}
