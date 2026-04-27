// All the odds math lives here.
// Conventions:
//   - "American" odds: e.g. -110, +150
//   - "Decimal" odds: e.g. 1.909, 2.50
//   - "Implied prob": 0..1
// We always go American -> implied for math, then back to American/decimal for display.

export function americanToDecimal(american: number): number {
  if (american > 0) return 1 + american / 100;
  return 1 + 100 / Math.abs(american);
}

export function americanToImplied(american: number): number {
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

export function impliedToAmerican(p: number): number {
  if (p <= 0 || p >= 1) return NaN;
  if (p >= 0.5) return Math.round(-(p / (1 - p)) * 100);
  return Math.round(((1 - p) / p) * 100);
}

export function impliedToDecimal(p: number): number {
  return 1 / p;
}

/**
 * Power-method de-vig for a two-way market.
 * Given raw implied probs pOver, pUnder (which sum to >1 due to vig),
 * find exponent k such that pOver^k + pUnder^k = 1.
 * This is more accurate than simple multiplicative normalization for
 * lopsided lines (e.g. 0.5 hits at -250 / +200), where favorites are
 * under-priced and dogs over-priced by the multiplicative method.
 *
 * Solve numerically with bisection — fast and rock-solid for this domain.
 */
export function devigPower(
  pOver: number,
  pUnder: number
): { over: number; under: number } {
  // If something is degenerate, fall back to multiplicative
  if (pOver <= 0 || pUnder <= 0 || pOver >= 1 || pUnder >= 1) {
    const total = pOver + pUnder;
    return { over: pOver / total, under: pUnder / total };
  }

  // f(k) = pOver^k + pUnder^k - 1
  // f is strictly decreasing in k for p in (0,1). At k=1, f = vig (>0).
  // At k = large, f -> -1. So root exists in (1, kHi).
  const f = (k: number) => Math.pow(pOver, k) + Math.pow(pUnder, k) - 1;

  let lo = 0.5;
  let hi = 5;
  // Expand hi if needed (extremely unlikely with real sportsbook lines)
  while (f(hi) > 0 && hi < 100) hi *= 2;

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  const k = (lo + hi) / 2;
  return { over: Math.pow(pOver, k), under: Math.pow(pUnder, k) };
}

/**
 * Multiplicative de-vig (simpler, included for fallback / comparison).
 * pOver / (pOver + pUnder)
 */
export function devigMultiplicative(
  pOver: number,
  pUnder: number
): { over: number; under: number } {
  const total = pOver + pUnder;
  return { over: pOver / total, under: pUnder / total };
}

/**
 * Pinnacle-weighted consensus.
 * Pinnacle gets PINNACLE_WEIGHT of the total weight; remaining is split
 * evenly among other books. If Pinnacle isn't present, just average the
 * others (equal weight).
 *
 * Each input is a de-vigged probability for the SAME side (e.g. all Overs)
 * at the SAME line.
 */
export const PINNACLE_WEIGHT = 0.5;

export function weightedFairProb(
  bookProbs: { bookKey: string; prob: number }[]
): { fairProb: number; pinnacleUsed: boolean } {
  const pinnacle = bookProbs.find((b) => b.bookKey === "pinnacle");
  const others = bookProbs.filter((b) => b.bookKey !== "pinnacle");

  if (others.length === 0 && !pinnacle) {
    return { fairProb: NaN, pinnacleUsed: false };
  }

  if (!pinnacle) {
    // Plain average of others
    const avg = others.reduce((s, b) => s + b.prob, 0) / others.length;
    return { fairProb: avg, pinnacleUsed: false };
  }

  if (others.length === 0) {
    return { fairProb: pinnacle.prob, pinnacleUsed: true };
  }

  const otherAvg = others.reduce((s, b) => s + b.prob, 0) / others.length;
  const fair =
    PINNACLE_WEIGHT * pinnacle.prob + (1 - PINNACLE_WEIGHT) * otherAvg;
  return { fairProb: fair, pinnacleUsed: true };
}

/**
 * EV% = fairProb * decimalOdds - 1
 * Returns as percentage (e.g. 0.045 = +4.5% EV)
 */
export function calcEV(fairProb: number, bestAmerican: number): number {
  const dec = americanToDecimal(bestAmerican);
  return fairProb * dec - 1;
}
