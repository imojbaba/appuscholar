"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSettings } from "@/lib/settings";
import { oldPopoutTarget } from "@/lib/popout/mode";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The old pop-out page, kept so its links still work (register row D-S2-43): `/popout?tool=cite` goes to the active project's Citations and
 * `?tool=research` to its Find, each in a place's own window (`?window=1`; the scratch space's when no project is active); any other tool to the
 * project list.
 */
export default function OldPopout() {
  const router = useRouter();
  const { me } = useSettings();
  const projectId = me ? me.activeProjectId ?? me.scratchProjectId : null;
  useEffect(() => {
    const tool = new URLSearchParams(window.location.search).get("tool");
    const target = oldPopoutTarget(tool, projectId ?? "");
    // A Literature tab needs the project, from /me; the list does not.
    if (target === "/projects" || projectId) router.replace(target);
  }, [projectId, router]);
  return <div className="grid gap-4 p-6" aria-busy="true"><Skeleton className="h-6 w-60" /><Skeleton className="h-96" /></div>;
}
