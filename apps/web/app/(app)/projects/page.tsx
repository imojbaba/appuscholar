import { ProjectList } from "@/components/ProjectList";
export default function Projects() {
  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: 16 }}>
      <h1 style={{ color: "var(--primary)" }}>Research Projects</h1>
      <ProjectList />
    </div>
  );
}
