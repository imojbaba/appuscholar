import Link from "next/link";
export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="font-display text-xl font-semibold tracking-tight text-primary">
      Appu<span className="text-foreground">scholar</span>
    </Link>
  );
}
