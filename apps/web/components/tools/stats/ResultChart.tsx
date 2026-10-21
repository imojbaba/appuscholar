"use client";
import { VZ_COL, vzFmt, vzNice } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import type { ChartSpec } from "@/lib/tools/stats/resultChart";

/*
 * The chart under a result, drawn from a ChartSpec (lib/tools/stats/resultChart.ts) as SVG elements: ledger R3 (no Chart.js, no CDN script) and register row D-S2-66.
 * Every string is a React text child, never markup, so a group label that looks like HTML is shown as text. Bars start at zero (rule 14, R2): the axis always holds
 * zero, the bar runs from zero to its value and an error bar may reach beyond it. The picture is a plain figure with a title, an axis label, ticks and a label under
 * each bar; colours are the palette of the Chart studio (colour-blind safe) and the page's text colour, so it follows light and dark.
 */

const W = 640, H = 320, L = 58, R = 16, T = 38, B = 64;
const PW = W - L - R, PH = H - T - B;
const INK = "currentColor";
const GRID = "var(--line, #d9d4e6)";
const trim = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + "…" : s);

type Scale = ReturnType<typeof vzNice>;
const sy = (s: Scale) => (v: number): number => T + PH - ((v - s.min) / (s.max - s.min)) * PH;
const sx = (lo: number, hi: number) => (v: number): number => L + ((v - lo) / (hi - lo || 1)) * PW;

function YAxis({ s, label }: { s: Scale; label: string }) {
  const y = sy(s);
  return (
    <g>
      {s.ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={INK}>{vzFmt(t, s.step)}</text>
        </g>
      ))}
      <line x1={L} x2={L} y1={T} y2={T + PH} stroke={INK} strokeWidth={1} />
      {label && <text transform={`translate(14 ${T + PH / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill={INK}>{trim(label, 40)}</text>}
    </g>
  );
}
function Title({ text }: { text: string }) {
  return <text x={W / 2} y={20} textAnchor="middle" fontSize={13} fontWeight={600} fill={INK}>{trim(text, 96)}</text>;
}
/** A category label under its slot; long labels are cut and slanted when there are many. */
function CatLabel({ x, text, many }: { x: number; text: string; many: boolean }) {
  const y = T + PH + 16;
  return many
    ? <text transform={`translate(${x} ${y}) rotate(-30)`} textAnchor="end" fontSize={11} fill={INK}><title>{text}</title>{trim(text, 16)}</text>
    : <text x={x} y={y} textAnchor="middle" fontSize={11} fill={INK}><title>{text}</title>{trim(text, 22)}</text>;
}
function Legend({ labels }: { labels: string[] }) {
  return (
    <g>
      {labels.map((l, i) => (
        <g key={i} transform={`translate(${L + i * 120} ${H - 10})`}>
          <rect width={10} height={10} y={-9} fill={VZ_COL[i % VZ_COL.length]} />
          <text x={14} fontSize={11} fill={INK}><title>{l}</title>{trim(l, 14)}</text>
        </g>
      ))}
    </g>
  );
}

/** Bars from zero, with the error bar of each when it has one. */
function Bars({ spec }: { spec: Extract<ChartSpec, { kind: "bars" }> }) {
  const reach = spec.values.flatMap((v, i) => [v, spec.errs[i]?.plus ?? v, spec.errs[i]?.minus ?? v]);
  const s = vzNice(Math.min(0, ...reach), Math.max(0, ...reach), 5);
  const y = sy(s), n = spec.values.length, slot = PW / n, bw = Math.min(70, slot * 0.6);
  return (
    <g>
      <Title text={spec.title} /><YAxis s={s} label={spec.yLabel} />
      {spec.values.map((v, i) => {
        const cx = L + slot * (i + 0.5), e = spec.errs[i];
        return (
          <g key={i} data-testid="stats-chart-bar">
            <rect x={cx - bw / 2} y={Math.min(y(v), y(0))} width={bw} height={Math.abs(y(v) - y(0))} fill={VZ_COL[0]} />
            {e && <g stroke={INK} strokeWidth={1.5}><line x1={cx} x2={cx} y1={y(e.plus)} y2={y(e.minus)} /><line x1={cx - 6} x2={cx + 6} y1={y(e.plus)} y2={y(e.plus)} /><line x1={cx - 6} x2={cx + 6} y1={y(e.minus)} y2={y(e.minus)} /></g>}
            <CatLabel x={cx} text={spec.labels[i]!} many={n > 5} />
          </g>
        );
      })}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke={INK} strokeWidth={1.5} data-testid="stats-chart-zero" />
    </g>
  );
}
function Hist({ spec }: { spec: Extract<ChartSpec, { kind: "hist" }> }) {
  const s = vzNice(0, Math.max(...spec.bins), 5), y = sy(s), slot = PW / spec.bins.length;
  return (
    <g>
      <Title text={spec.title} /><YAxis s={s} label={spec.yLabel} />
      {spec.bins.map((c, i) => {
        const a = spec.start + i * spec.width;
        return (
          <g key={i} data-testid="stats-chart-bar">
            <rect x={L + slot * i + 1} y={y(c)} width={slot - 2} height={y(0) - y(c)} fill={VZ_COL[0]} />
            <CatLabel x={L + slot * (i + 0.5)} text={`${a.toFixed(1)}–${(a + spec.width).toFixed(1)}`} many />
          </g>
        );
      })}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke={INK} strokeWidth={1.5} data-testid="stats-chart-zero" />
    </g>
  );
}
function XAxisNumeric({ lo, hi, label }: { lo: number; hi: number; label: string }) {
  const s = vzNice(lo, hi, 6), x = sx(s.min, s.max);
  return (
    <g>
      <line x1={L} x2={W - R} y1={T + PH} y2={T + PH} stroke={INK} strokeWidth={1} />
      {s.ticks.map((t) => <text key={t} x={x(t)} y={T + PH + 16} textAnchor="middle" fontSize={11} fill={INK}>{vzFmt(t, s.step)}</text>)}
      <text x={L + PW / 2} y={T + PH + 34} textAnchor="middle" fontSize={12} fill={INK}>{trim(label, 50)}</text>
    </g>
  );
}
function Scatter({ spec }: { spec: Extract<ChartSpec, { kind: "scatter" }> }) {
  const xs = spec.points.map((p) => p.x), ys = spec.points.map((p) => p.y);
  const xs2 = vzNice(Math.min(...xs), Math.max(...xs), 6), ys2 = vzNice(Math.min(...ys), Math.max(...ys), 5), x = sx(xs2.min, xs2.max), y = sy(ys2);
  return (
    <g>
      <Title text={spec.title} /><YAxis s={ys2} label={spec.yLabel} /><XAxisNumeric lo={Math.min(...xs)} hi={Math.max(...xs)} label={spec.xLabel} />
      {spec.fit && <line x1={x(spec.fit[0]!.x)} y1={y(spec.fit[0]!.y)} x2={x(spec.fit[1]!.x)} y2={y(spec.fit[1]!.y)} stroke="var(--gold, #c9932e)" strokeWidth={2} />}
      {spec.points.map((p, i) => <circle key={i} cx={x(p.x)} cy={y(p.y)} r={3.2} fill={VZ_COL[0]} fillOpacity={0.75} />)}
    </g>
  );
}
function Grouped({ spec }: { spec: Extract<ChartSpec, { kind: "grouped" }> }) {
  const s = vzNice(0, Math.max(...spec.table.flat()), 5), y = sy(s), slot = PW / spec.rowLabels.length, k = spec.colLabels.length, bw = Math.min(40, (slot * 0.8) / k);
  return (
    <g>
      <Title text={spec.title} /><YAxis s={s} label={spec.yLabel} />
      {spec.rowLabels.map((r, i) => (
        <g key={i}>
          {spec.colLabels.map((_, j) => {
            const v = spec.table[i]![j]!, x0 = L + slot * (i + 0.5) - (bw * k) / 2 + bw * j;
            return <rect key={j} data-testid="stats-chart-bar" x={x0} y={y(v)} width={bw - 1} height={y(0) - y(v)} fill={VZ_COL[j % VZ_COL.length]} />;
          })}
          <CatLabel x={L + slot * (i + 0.5)} text={r} many={spec.rowLabels.length > 5} />
        </g>
      ))}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke={INK} strokeWidth={1.5} data-testid="stats-chart-zero" />
      <Legend labels={spec.colLabels} />
    </g>
  );
}
/** Lines are not bars, so their axis does not have to hold zero (v1's interaction plot did not either). */
function Lines({ spec }: { spec: Extract<ChartSpec, { kind: "lines" }> }) {
  const all = spec.series.flatMap((s) => s.ys), s = vzNice(Math.min(...all), Math.max(...all), 5), y = sy(s), slot = PW / spec.xLabels.length;
  return (
    <g>
      <Title text={spec.title} /><YAxis s={s} label={spec.yLabel} />
      {spec.xLabels.map((l, i) => <CatLabel key={i} x={L + slot * (i + 0.5)} text={l} many={spec.xLabels.length > 5} />)}
      {spec.series.map((se, q) => {
        const col = VZ_COL[q % VZ_COL.length];
        return (
          <g key={q} stroke={col} fill={col}>
            <polyline fill="none" strokeWidth={2} points={se.ys.map((v, i) => `${L + slot * (i + 0.5)},${y(v)}`).join(" ")} />
            {se.ys.map((v, i) => <circle key={i} cx={L + slot * (i + 0.5)} cy={y(v)} r={4} />)}
          </g>
        );
      })}
      <Legend labels={spec.series.map((x) => x.label)} />
    </g>
  );
}
function Slopes({ spec }: { spec: Extract<ChartSpec, { kind: "slopes" }> }) {
  const ys = spec.lines.flatMap((l) => [l.b0 + l.b1 * spec.xmin, l.b0 + l.b1 * spec.xmax]);
  const xs2 = vzNice(spec.xmin, spec.xmax, 6), ys2 = vzNice(Math.min(...ys), Math.max(...ys), 5), x = sx(xs2.min, xs2.max), y = sy(ys2);
  const dash = ["6 4", "", "2 3"];
  return (
    <g>
      <Title text={spec.title} /><YAxis s={ys2} label={spec.yLabel} /><XAxisNumeric lo={spec.xmin} hi={spec.xmax} label={spec.xLabel} />
      {spec.lines.map((l, i) => (
        <line key={i} x1={x(spec.xmin)} y1={y(l.b0 + l.b1 * spec.xmin)} x2={x(spec.xmax)} y2={y(l.b0 + l.b1 * spec.xmax)} stroke={VZ_COL[i % VZ_COL.length]} strokeWidth={2.5} strokeDasharray={dash[i % 3]} />
      ))}
      <Legend labels={spec.lines.map((l) => l.label)} />
    </g>
  );
}

/** The figure (a captioned, labelled picture; the spec's title is its caption for a screen reader). */
export function ResultChart({ spec }: { spec: ChartSpec }) {
  const t = useT();
  return (
    <figure style={{ margin: "12px 0 0" }} data-testid="stats-chart" data-kind={spec.kind}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("stats_chart_alt", { title: spec.title })} style={{ width: "100%", height: "auto", maxWidth: 720, color: "inherit", fontFamily: "inherit" }}>
        {spec.kind === "bars" && <Bars spec={spec} />}
        {spec.kind === "hist" && <Hist spec={spec} />}
        {spec.kind === "scatter" && <Scatter spec={spec} />}
        {spec.kind === "grouped" && <Grouped spec={spec} />}
        {spec.kind === "lines" && <Lines spec={spec} />}
        {spec.kind === "slopes" && <Slopes spec={spec} />}
      </svg>
    </figure>
  );
}
