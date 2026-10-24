/** The commit the header pill shows. Vercel's own variable first, then the one scripts/deploy-vercel.sh passes with --build-env (a CLI deploy from a git worktree gets no Vercel commit); empty for local builds. A production build with no commit fails rather than ship a pill that reads "Version dev" (W9). */
export function buildSha(env: Record<string, string | undefined>): string {
  const sha = env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || "";
  if (!sha && env.VERCEL_ENV === "production") {
    throw new Error("No commit SHA for a production build: deploy with scripts/deploy-vercel.sh from a full clone");
  }
  return sha;
}
