// Bayesian A/B math with no dependencies. Pure, so it is tested.

// Marsaglia–Tsang gamma sampler; Beta(a,b) = X/(X+Y).
function randn() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function gamma(k: number): number {
  if (k < 1) return gamma(k + 1) * Math.pow(Math.random(), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { x = randn(); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = Math.random(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
}
export function beta(a: number, b: number) { const x = gamma(a), y = gamma(b); return x / (x + y); }

export type Arm = { id: string; n: number; k: number };

// Chance each arm is the best one, from 4000 draws of each arm's Beta(1+k, 1+n−k).
export function probBest(arms: Arm[], draws = 4000): Record<string, number> {
  const wins: Record<string, number> = Object.fromEntries(arms.map((a) => [a.id, 0]));
  if (!arms.length) return wins;
  for (let i = 0; i < draws; i++) {
    let best = "", bv = -1;
    for (const a of arms) { const v = beta(1 + a.k, 1 + Math.max(0, a.n - a.k)); if (v > bv) { bv = v; best = a.id; } }
    wins[best]++;
  }
  for (const id in wins) wins[id] /= draws;
  return wins;
}

// Expected relative lift of B over A and the 90% interval, for display.
export function lift(a: Arm, b: Arm, draws = 4000) {
  const xs: number[] = [];
  for (let i = 0; i < draws; i++) { const pa = beta(1 + a.k, 1 + a.n - a.k), pb = beta(1 + b.k, 1 + b.n - b.k); xs.push(pa > 0 ? pb / pa - 1 : 0); }
  xs.sort((p, q) => p - q);
  return { mid: xs[Math.floor(draws / 2)], lo: xs[Math.floor(draws * 0.05)], hi: xs[Math.floor(draws * 0.95)] };
}

// Share of new leads each arm should get: Thompson sampling, with a floor for every arm while the test runs.
export function shares(arms: Arm[], floor: number): Record<string, number> {
  if (!arms.length) return {};
  const fl = Math.min(floor, 1 / arms.length);
  const p = probBest(arms, 2000);
  return Object.fromEntries(arms.map((a) => [a.id, fl + (1 - fl * arms.length) * p[a.id]]));
}
// Each lead draws its arm by those shares. The tick pushes a few leads at a time, so rounding per batch would starve the smaller arm.
export function allocate(arms: Arm[], total: number, floor: number, rnd: () => number = Math.random): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(arms.map((a) => [a.id, 0]));
  if (!arms.length || total <= 0) return out;
  const sh = shares(arms, floor);
  for (let i = 0; i < total; i++) { let x = rnd(), pick = arms[arms.length - 1].id; for (const a of arms) { x -= sh[a.id]; if (x <= 0) { pick = a.id; break; } } out[pick]++; }
  return out;
}

// Verdict in plain words for the tests page.
export function verdict(pBest: number, n: number, minN: number) {
  if (n < minN) return { tag: "", text: `Мало данных: нужно хотя бы ${minN} на вариант` };
  if (pBest >= 0.95) return { tag: "lime", text: "Победитель, можно переводить весь трафик" };
  if (pBest >= 0.8) return { tag: "good", text: "Скорее всего лучше, ещё немного данных" };
  if (pBest <= 0.05) return { tag: "bad", text: "Почти точно хуже, можно выключать" };
  return { tag: "", text: "Пока неясно" };
}
