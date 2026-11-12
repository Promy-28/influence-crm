// Server-rendered SVG bars. One y-axis per chart; series of different scale get separate charts.
export const SERIES = ["#5b3df5", "#0d9488", "#d97706"]; // validated categorical order: purple, teal, amber

type S = { name: string; values: number[] };
export function Bars({ days, series, height = 170, title }: { days: string[]; series: S[]; height?: number; title: string }) {
  const W = 720, H = height, pad = { l: 34, r: 8, t: 10, b: 22 };
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; })();
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const slot = iw / Math.max(1, days.length), gap = 2;
  const bw = Math.max(2, (slot - 4) / series.length - gap);
  const y = (v: number) => pad.t + ih - (v / nice) * ih;
  const ticks = nice < 4 ? Array.from({ length: nice + 1 }, (_, i) => i) : [0, nice / 2, nice];
  const every = Math.ceil(days.length / 8);
  return <figure style={{ margin: 0 }}>
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={title} style={{ height: H }}>
      {ticks.map((t) => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" /><text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="var(--muted)" fontFamily="var(--mono)">{t >= 1000 ? `${t / 1000}K` : t}</text></g>)}
      {days.map((d, i) => <g key={d}>
        {series.map((s, j) => { const v = s.values[i] ?? 0; const x = pad.l + i * slot + 2 + j * (bw + gap); const h = Math.max(v ? 2 : 0, pad.t + ih - y(v));
          return <g key={s.name}><rect x={x} y={pad.t + ih - h} width={bw} height={h} rx={Math.min(4, bw / 2)} fill={SERIES[j]} /><rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill="transparent"><title>{`${d.slice(8, 10)}.${d.slice(5, 7)}: ${series.map((x) => `${x.name} ${x.values[i] ?? 0}`).join(", ")}`}</title></rect></g>; })}
        {i % every === 0 && <text x={pad.l + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize="10.5" fill="var(--muted)" fontFamily="var(--mono)">{`${d.slice(8, 10)}.${d.slice(5, 7)}`}</text>}
      </g>)}
    </svg>
    {series.length > 1 && <figcaption className="legend">{series.map((s, j) => <span key={s.name}><i style={{ background: SERIES[j] }} />{s.name}: {s.values.reduce((a, b) => a + b, 0)}</span>)}</figcaption>}
  </figure>;
}

export function Funnel({ steps }: { steps: { name: string; v: number; hint?: string }[] }) {
  const top = Math.max(1, steps[0]?.v ?? 1);
  return <div className="funnel">{steps.map((s, i) => { const prev = i ? steps[i - 1].v : 0; const conv = i && prev ? `${((s.v / prev) * 100).toFixed(s.v / prev < 0.1 ? 1 : 0)}%` : "";
    return <div key={s.name} className="fstep" title={s.hint}><span>{s.name}</span><div className="fbar"><i style={{ width: `${Math.max(0.5, (s.v / top) * 100)}%` }} /></div><span style={{ fontSize: 12, textAlign: "right" }}><b style={{ fontSize: 14 }}>{s.v}</b> <span className="muted">{conv}</span></span></div>; })}</div>;
}
