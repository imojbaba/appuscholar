"use client";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useTitle } from "@/lib/vault/titles";
import { placeHref } from "@/lib/frame/places";
import { STAGE_ORDER } from "@/lib/tools";
import { useProject } from "./ProjectContext";

/** The project's home, for now its title and a way into each of the six places. Task 7 builds the home itself (the question, the next step, the states). */
export function ProjectHome() {
  const t = useT();
  const { me } = useSettings();
  const { project, projectId } = useProject();
  const title = useTitle(project, "project");
  if (!projectId) return null;
  return (
    <section className="home-interim" data-testid="project-home">
      <h1 data-testid="home-title">{project ? title.text : projectId === me?.scratchProjectId ? t("scratch_name") : ""}</h1>
      <nav aria-label={t("home_places")}>
        <ul>
          {STAGE_ORDER.map((s) => <li key={s}><Link href={placeHref(projectId, s)} data-testid={"home-open-" + s}>{t("stage_name_" + s)}</Link></li>)}
        </ul>
      </nav>
    </section>
  );
}
