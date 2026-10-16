import { Workspace } from "@/components/workspace/Workspace";
export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ import?: string }> }) {
  const { import: imp } = await searchParams;
  return <Workspace openImportV1={imp === "1"} />;
}
