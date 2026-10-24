"use client";
import { useId } from "react";
import { useT } from "@/lib/i18n";
import { HOME_LIMIT, attentionText, fixLabel, type AttentionItem } from "@/lib/attention";
import { useCiteChecks } from "@/lib/cite/checks";
import { useLibrary } from "@/lib/cite/useLibrary";
import { useAttention, type Attention } from "@/lib/useAttention";

/**
 * After a fix the button the student pressed may be gone, its item having left, and the focus with it. Called before the fix, it answers (to be called after) by putting the focus on the
 * list the item was in, or when that is gone too on the row of the paper around it; a button that is still there keeps it.
 */
function keepFocus(from: HTMLElement): () => void {
  const list = from.closest<HTMLElement>("[data-attention-root]");
  const row = list?.closest<HTMLElement>('[data-testid="source-row"], [data-testid="rl-row"]') ?? null;
  return () => {
    const now = document.activeElement;
    if (now && now !== document.body && now.isConnected) return;
    const to = list?.isConnected ? list : row?.isConnected ? row : null;
    if (!to) return;
    if (!to.hasAttribute("tabindex")) to.tabIndex = -1;
    to.focus({ preventScroll: true });
  };
}

/**
 * One thing that needs attention, as a line: its sentence and, when it has one, its fix button. The same line is on the project home, beside the paper in Citations and beside the paper
 * in the Reading list (`pid`: the line of that paper's own row, where an item about several papers has words for one). While its fix runs the button says so and is off; a fix that did
 * not work says so under the line. The button is described by the sentence, so a screen reader hears what a "Use Crossref details" is for.
 */
export function AttentionLine({ item, attention, pid }: { item: AttentionItem; attention: Attention; pid?: string }) {
  const t = useT();
  const textId = useId();
  const label = fixLabel(item, t, pid);
  const working = attention.busy === item.id;
  return (
    <li className={"attn-item attn-item-" + item.kind} data-testid="attention-item" data-kind={item.kind} aria-busy={working || undefined}>
      <span className="attn-text" id={textId} data-testid="attention-text">{attentionText(item, t, pid)}</span>
      {label && attention.canFix(item) && (
        <button type="button" className="attn-fix" data-testid="attention-fix" data-fix={item.fix ?? undefined} aria-describedby={textId}
          disabled={attention.busy !== null}
          onClick={(e) => {
            const restore = keepFocus(e.currentTarget);
            void attention.fix(item, pid).then(() => { setTimeout(restore, 0); });
          }}>
          {working ? t("attn_working") : label}
        </button>
      )}
      {attention.failed === item.id && <p className="attn-fail" role="alert" data-testid="attention-fail">{t("attn_fix_fail")}</p>}
    </li>
  );
}

/** The lines for a paper's own row (Citations, the Reading list); nothing at all when the paper has none. */
export function AttentionItems({ items, attention, pid }: { items: AttentionItem[]; attention: Attention; pid: string }) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <ul className="attn-list" aria-label={t("attn_list_aria")} data-attention-root data-testid="attention-items">
      {items.map((item) => <AttentionLine key={item.id} item={item} attention={attention} pid={pid} />)}
    </ul>
  );
}

/**
 * "Needs your attention" on the project home (canvas Main and Phone): what is wrong with the project's sources, five lines at most, each with its fix, then "See all in Citations"
 * when there are more. No items, no card; so too while the sources and the check answers are being read, or cannot be (the home says so itself when the vault is locked). It reads the
 * library through the shell's shared client, so the ids the paper-id migration gave are there (the home mounts it only once that has settled), and a fix made here or in Citations
 * is seen by both. `onMerged`: a merge changed the reading list and the notes, which the home also shows; it reads them again.
 */
export function AttentionCard({ onSeeAll, onMerged }: { onSeeAll(): void; onMerged(): void }) {
  const t = useT();
  const headId = useId();
  const library = useLibrary({ passive: true });
  const checks = useCiteChecks(library, { refresh: false });
  const attention = useAttention(library, checks, { onMerged });
  const items = attention.items;
  if (!items || items.length === 0) return null;
  return (
    <section className="home-card attn-card" aria-labelledby={headId} data-attention-root data-testid="home-attention">
      <h2 id={headId}>{t("attn_h")}</h2>
      <ul className="attn-list attn-list-home" data-testid="attention-items">
        {items.slice(0, HOME_LIMIT).map((item) => <AttentionLine key={item.id} item={item} attention={attention} />)}
      </ul>
      {items.length > HOME_LIMIT && <button type="button" className="home-link attn-all" data-testid="attention-all" onClick={onSeeAll}>{t("attn_see_all")}</button>}
    </section>
  );
}
