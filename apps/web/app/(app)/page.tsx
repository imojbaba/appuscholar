"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { addingAddress } from "@/lib/cite/captureHash";
import { landingTarget } from "@/lib/frame/landing";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/` opens nothing of its own: it sends the student to first run, the active project's home or the list (lib/frame/landing.ts). An old bookmark's `/#capture=...` goes to the
 * adding screen at once, before /me and before GET /projects (wave B Task 20 fix round, walk fault W13): a project list that fails to load must not lose the paper, and the vault's
 * migration treats that hash as the adding screen (lib/popout/mode.ts), so nothing of the app's own work starts in between.
 */
export default function Landing() {
  const router = useRouter();
  const { me } = useSettings();
  const [error, setError] = useState(false);
  const userId = me?.id;
  const activeProjectId = me?.activeProjectId ?? null;
  const scratchProjectId = me?.scratchProjectId;
  useEffect(() => {
    const to = addingAddress(window.location.hash);
    if (to) router.replace(to);
  }, [router]);
  useEffect(() => {
    if (!userId || !scratchProjectId || addingAddress(window.location.hash)) return;
    let live = true;
    apiFetch<Array<{ id: string }>>("/projects").then((list) => {
      if (!live) return;
      const { search, hash } = window.location;
      router.replace(landingTarget({ projectIds: list.map((p) => p.id), activeProjectId, search, hash }));
    }, () => { if (live) setError(true); });
    return () => { live = false; };
  }, [userId, activeProjectId, scratchProjectId, router]);
  return error
    ? <p role="alert" className="p-6 text-sm text-destructive" data-testid="error-msg">Could not load your workspace.</p>
    : <div className="grid gap-4 p-6" aria-busy="true"><Skeleton className="h-6 w-60" /><Skeleton className="h-96" /></div>;
}
