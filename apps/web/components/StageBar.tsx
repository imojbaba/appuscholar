const STAGES = [["idea","Idea & Feasibility"],["lit","Literature Review"],["design","Design & Ethics"],["analysis","Collection & Analysis"],["writing","Writing"],["publish","Review & Publish"]] as const;
export function StageBar({ stage }: { stage: string }) {
  const i = Math.max(0, STAGES.findIndex(([k]) => k === stage));
  return (
    <nav aria-label="Research stages" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
      {STAGES.map(([k, label], idx) => (
        <span key={k} style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid var(--border)", background: idx === i ? "var(--primary)" : "var(--card)", color: idx === i ? "#fff" : "var(--muted-foreground)", fontSize: 13 }}>
          {idx + 1}. {label}
        </span>
      ))}
    </nav>
  );
}
