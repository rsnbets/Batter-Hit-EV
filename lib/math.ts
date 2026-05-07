// All odds math lives here.
// Conventions:
//   - American: e.g. -110, +150
//   - Decimal: e.g. 1.909, 2.50
//   - Implied prob: 0..1
// Always go American -> implied for math, then back to American/decimal for display.

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
 * Find exponent k such that pOver^k + pUnder^k = 1.
 * More accurate than multiplicative for lopsided lines (e.g. 0.5 hits at -250/+200).
 * Solved by bisection — fast and rock-solid for this domain.
 */
export function devigPower(
  pOver: number,
  pUnder: number
): { over: number; under: number } {
  if (pOver <= 0 || pUnder <= 0 || pOver >= 1 || pUnder >= 1) {
    const total = pOver + pUnder;
    return { over: pOver / total, under: pUnder / total };
  }

  const f = (k: number) => Math.pow(pOver, k) + Math.pow(pUnder, k) - 1;

  let lo = 0.5;
  let hi = 5;
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
 * Multiplicative de-vig (simple normalization). Kept for fallback/comparison.
 */
export function devigMultiplicative(
  pOver: number,
  pUnder: number
): { over: number; under: number } {
  const total = pOver + pUnder;
  return { over: pOver / total, under: pUnder / total };
}

/**
 * Plain Pinnacle-only weighting (kept for backward compatibility).
 * Pinnacle gets PINNACLE_WEIGHT, others split the rest evenly.
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
    const avg = others.reduce((s, b) => s + b.prob, 0) / others.length;
    return { fairProb: avg, pinnacleUsed: false };
  }
  if (others.length === 0) {
    return { fairProb: pinnacle.prob, pinnacleUsed: true };
  }
  const otherAvg = others.reduce((s, b) => s + b.prob, 0) / others.length;
  const fair = PINNACLE_WEIGHT * pinnacle.prob + (1 - PINNACLE_WEIGHT) * otherAvg;
  return { fairProb: fair, pinnacleUsed: true };
}

/**
 * Sharp-pool weighting:
 *   - All sharp books (Pinnacle, Novig, ProphetX, ...) are averaged together
 *     to form a single "sharp consensus" probability.
 *   - That consensus gets SHARP_POOL_WEIGHT (default 50%).
 *   - All non-sharp books split the remaining weight evenly.
 *   - If no sharps are present, falls back to plain average of non-sharps.
 *   - If only sharps are present, returns the sharp consensus.
 *
 * This is more robust than relying on a single sharp book — when Pinnacle is
 * missing (early in the day), Novig/ProphetX can fill the sharp slot. When
 * multiple sharps are present, they're treated as a pool.
 */
export const SHARP_POOL_WEIGHT = 0.5;

export function weightedFairProbWithSharps(
  bookProbs: { bookKey: string; prob: number }[],
  sharpKeys: Set<string>
): { fairProb: number; sharpsUsed: boolean; sharpCount: number } {
  const sharps = bookProbs.filter((b) => sharpKeys.has(b.bookKey));
  const others = bookProbs.filter((b) => !sharpKeys.has(b.bookKey));

  if (sharps.length === 0 && others.length === 0) {
    return { fairProb: NaN, sharpsUsed: false, sharpCount: 0 };
  }
  if (sharps.length === 0) {
    const avg = others.reduce((s, b) => s + b.prob, 0) / others.length;
    return { fairProb: avg, sharpsUsed: false, sharpCount: 0 };
  }
  if (others.length === 0) {
    const sharpAvg = sharps.reduce((s, b) => s + b.prob, 0) / sharps.length;
    return { fairProb: sharpAvg, sharpsUsed: true, sharpCount: sharps.length };
  }

  const sharpAvg = sharps.reduce((s, b) => s + b.prob, 0) / sharps.length;
  const otherAvg = others.reduce((s, b) => s + b.prob, 0) / others.length;
  const fair = SHARP_POOL_WEIGHT * sharpAvg + (1 - SHARP_POOL_WEIGHT) * otherAvg;
  return { fairProb: fair, sharpsUsed: true, sharpCount: sharps.length };
}

/**
 * EV per dollar staked.
 *   EV% = fairProb * decimalOdds - 1
 * Returns as a fraction (0.045 = +4.5%).
 */
export function calcEV(fairProb: number, bestAmerican: number): number {
  const dec = americanToDecimal(bestAmerican);
  return fairProb * dec - 1;
}

/**
 * Probability edge: difference between fair probability and the price's
 * implied probability (in percentage points, as a fraction).
 *
 *   probEdge = fairProb - impliedProbOfPrice
 *
 * Conceptually different from EV — measures "how much more often will this
 * hit than the price implies" rather than "expected dollar return per stake."
 * Both are valid; we display both.
 */
export function calcProbEdge(fairProb: number, american: number): number {
  return fairProb - americanToImplied(american);
}

/**
 * Detect a two-way arbitrage given the best Over and Under American prices.
 *
 * Returns null if the implied probabilities sum to >= 1 (no arb).
 * Returns arb details when the sum is < 1, meaning correctly proportioned
 * stakes on both sides guarantee profit regardless of outcome.
 *
 * - margin: guaranteed return on total stake (e.g. 0.0623 = 6.23% profit).
 * - overStake / underStake: how to split $1 of total stake to perfectly hedge
 *   (sum to 1.0). Multiply by your real bankroll for actual leg sizes.
 * - overReturn / underReturn: total return per $1 staked when each side hits.
 *   Both equal 1 + margin in a clean arb.
 */
export interface ArbResult {
  margin: number;
  overStake: number;
  underStake: number;
  overReturn: number;
  underReturn: number;
}

export function detectArb(
  bestOverAmerican: number,
  bestUnderAmerican: number
): ArbResult | null {
  const overImplied = americanToImplied(bestOverAmerican);
  const underImplied = americanToImplied(bestUnderAmerican);
  const sum = overImplied + underImplied;
  if (sum >= 1) return null;

  const margin = 1 - sum;
  const overStake = overImplied / sum;
  const underStake = underImplied / sum;
  const overReturn = overStake * americanToDecimal(bestOverAmerican);
  const underReturn = underStake * americanToDecimal(bestUnderAmerican);

  return { margin, overStake, underStake, overReturn, underReturn };
}
