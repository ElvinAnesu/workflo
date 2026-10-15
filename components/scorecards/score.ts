import type { KpiRow } from "../kpis/kpi.types.ts";

// Achievement against target as a percentage, rounded to one decimal.
// Returns null when there is no usable target.
export function kpiScore(direction: KpiRow["direction"], target: number, actual: number) {
  if (!Number.isFinite(target) || !Number.isFinite(actual) || target <= 0 || actual < 0) {
    return null;
  }
  const ratio =
    direction === "Higher is better"
      ? actual / target
      : actual === 0
        ? 1
        : target / actual;
  return Math.round(ratio * 1000) / 10;
}

export function averageScore(scores: (number | null)[]) {
  const values = scores.filter((score): score is number => score !== null);
  return values.length === 0
    ? null
    : Math.round((values.reduce((sum, score) => sum + score, 0) / values.length) * 10) / 10;
}
