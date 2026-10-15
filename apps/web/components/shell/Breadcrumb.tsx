import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
export type Crumb = { href?: string; label: string };
export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
      {items.map((c, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1">
          {i > 0 ? <CaretRight size={14} aria-hidden="true" /> : null}
          {c.href && i < items.length - 1 ? <Link href={c.href} className="truncate hover:text-foreground">{c.label}</Link> : <span className="truncate text-foreground">{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}
