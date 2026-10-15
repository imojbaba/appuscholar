import { cache } from "react";
import { auth } from "@/auth";
import { signApiToken } from "@/lib/token";
import type { Lang } from "@/lib/i18n";

/** The signed-in user's saved interface language, read server-side so the first paint has the right lang. Any failure gives "en". */
export const getServerLang = cache(async (): Promise<Lang> => {
  try {
    const session = await auth();
    const secret = process.env.API_JWT_SECRET;
    if (!session?.user?.id || !secret) return "en";
    const { token } = await signApiToken({ id: session.user.id, email: session.user.email ?? "" }, secret, 60);
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8788"}/me`, {
      headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(2000)
    });
    if (!r.ok) return "en";
    const me = (await r.json()) as { settings?: { lang?: string } };
    return me.settings?.lang === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
});
