import { Breadcrumb } from "@/components/shell/Breadcrumb";
import { ImportV1 } from "@/components/import/ImportV1";
export default function ImportPage() {
  return (
    <div className="grid gap-6">
      <Breadcrumb items={[{ href: "/projects", label: "Research Projects" }, { label: "Import a v1 backup" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import a v1 backup</h1>
        <p className="mt-1 text-sm text-muted-foreground">Bring documents from the browser-only Appuscholar into your account.</p>
      </div>
      <ImportV1 />
    </div>
  );
}
