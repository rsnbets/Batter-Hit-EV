import {
  OddsApiEvent,
  OddsApiBookmaker,
  BookOffer,
  PlayProw,
  FairEstimate,
} from "./types";
import {
  americanToImplied,
  americanToDecimal,
  devigPower,
  weightedFairProb,
  impliedToAmerican,
  calcEV,
} from "./math";

const BASE = "https://api.the-odds-api.com/v4";
const SPORT = "baseball_mlb";
const MARKET = "batter_hits";
const REGIONS = "us,us2,eu"; // eu gives us Pinnacle

const TARGET_BOOKS = new Set([
  "pinnacle",
  "draftkings",
  "fanduel",
  "betmgm",
  "hardrockbet",
  "fanatics",
  "betonlineag",
  "circasports",
  "bet365",
  "williamhill_us", // Caesars
  "betrivers",
  "fliff",
  "espnbet",
  "betus",
  "lowvig",
  "mybookieag",
  "bookmaker",
  "sportsbetting",
  "bovada",
]);

export interface OddsApiResult {
  plays: PlayProw[];
  remainingRequests: string | null;
  usedRequests: string | null;
  fetchedAt: string;
  errors: string[];
}

async function fetchEvents(apiKey: string): Promise<OddsApiEvent[]> {
  const url = `${BASE}/sports/${SPORT}/events?apiKey=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Events fetch failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function fetchEventOdds(
  apiKey: string,
  eventId: string,
  attempt = 0
): Promise<{ data: OddsApiEvent | null; remaining: string | null; used: string | null }> {
  const url =
    `${BASE}/sports/${SPORT}/events/${eventId}/odds` +
    `?apiKey=${apiKey}&regions=${REGIONS}&markets=${MARKET}&oddsFormat=american`;
  const res = await fetch(url, { cache: "no-store" });
  const remaining = res.headers.get("x-requests-remaining");
  const used = res.headers.get("x-requests-used");

  if (res.status === 422) return { data: null, remaining, used }; // market not offered

  // 429 = rate limit. Retry up to 3 times with exponential backoff.
  if (res.status === 429 && attempt < 3) {
    const backoffMs = 500 * Math.pow(2, attempt) + Math.random() * 250;
    await new Promise((r) => setTimeout(r, backoffMs));
    return fetchEventOdds(apiKey, eventId, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(
      `Event odds fetch failed (${eventId}): ${res.status} ${await res.text()}`
    );
  }
  return { data: await res.json(), remaining, used };
}

function buildBookOffers(
  bookmakers: OddsApiBookmaker[],
  player: string,
  line: number
): BookOffer[] {
  const offers: BookOffer[] = [];
  for (const bm of bookmakers) {
    if (!TARGET_BOOKS.has(bm.key)) continue;
    const market = bm.markets.find((m) => m.key === MARKET);
    if (!market) continue;
    const over = market.outcomes.find(
      (o) => o.name === "Over" && o.description === player && o.point === line
    );
    const under = market.outcomes.find(
      (o) => o.name === "Under" && o.description === player && o.point === line
    );
    if (!over || !under) continue;

    const overImplied = americanToImplied(over.price);
    const underImplied = americanToImplied(under.price);
    const { over: overDevig, under: underDevig } = devigPower(
      overImplied,
      underImplied
    );

    offers.push({
      bookKey: bm.key,
      bookTitle: bm.title,
      overAmerican: over.price,
      underAmerican: under.price,
      overImplied,
      underImplied,
      overDevigged: overDevig,
      underDevigged: underDevig,
    });
  }
  return offers;
}

/**
 * Build a FairEstimate given a fair probability and the best American price.
 */
function buildFairEstimate(fairProb: number, bestAmerican: number): FairEstimate {
  return {
    fairProb,
    fairAmerican: impliedToAmerican(fairProb),
    evPercent: calcEV(fairProb, bestAmerican),
  };
}

/**
 * Compute three fair-odds estimates for a single side (Over or Under) using
 * the same set of book offers.
 */
function computeAllFair(
  offers: BookOffer[],
  side: "Over" | "Under",
  bestAmerican: number
): { raw: FairEstimate; devig: FairEstimate; weighted: FairEstimate; pinnacleUsed: boolean } {
  // Raw implied probs (vig still in) — your current "market average" method
  const rawProbs = offers.map((o) => (side === "Over" ? o.overImplied : o.underImplied));
  const rawAvg = rawProbs.reduce((s, p) => s + p, 0) / rawProbs.length;

  // De-vigged probs
  const devigProbs = offers.map((o) => ({
    bookKey: o.bookKey,
    prob: side === "Over" ? o.overDevigged : o.underDevigged,
  }));

  // Method 2: plain average of de-vigged probs (no Pinnacle weighting)
  const devigAvg =
    devigProbs.reduce((s, b) => s + b.prob, 0) / devigProbs.length;

  // Method 3: Pinnacle-weighted de-vigged
  const weighted = weightedFairProb(devigProbs);

  return {
    raw: buildFairEstimate(rawAvg, bestAmerican),
    devig: buildFairEstimate(devigAvg, bestAmerican),
    weighted: buildFairEstimate(weighted.fairProb, bestAmerican),
    pinnacleUsed: weighted.pinnacleUsed,
  };
}

function buildPlaysForEvent(event: OddsApiEvent): PlayProw[] {
  const plays: PlayProw[] = [];
  if (!event.bookmakers || event.bookmakers.length === 0) return plays;

  const combos = new Set<string>();
  for (const bm of event.bookmakers) {
    if (!TARGET_BOOKS.has(bm.key)) continue;
    const market = bm.markets.find((m) => m.key === MARKET);
    if (!market) continue;
    for (const o of market.outcomes) {
      combos.add(`${o.description}|||${o.point}`);
    }
  }

  const game = `${event.away_team} @ ${event.home_team}`;

  for (const combo of combos) {
    const [player, lineStr] = combo.split("|||");
    const line = Number(lineStr);
    const offers = buildBookOffers(event.bookmakers, player, line);
    if (offers.length < 2) continue;

    // Best book per side (highest American = best payout)
    const bestOverOffer = offers.reduce((best, cur) =>
      cur.overAmerican > best.overAmerican ? cur : best
    );
    const bestUnderOffer = offers.reduce((best, cur) =>
      cur.underAmerican > best.underAmerican ? cur : best
    );

    const overFair = computeAllFair(offers, "Over", bestOverOffer.overAmerican);
    const underFair = computeAllFair(offers, "Under", bestUnderOffer.underAmerican);

    plays.push({
      player,
      market: MARKET,
      line,
      side: "Over",
      game,
      commenceTime: event.commence_time,
      marketAvgRaw: overFair.raw,
      marketAvgDevig: overFair.devig,
      pinnacleWeighted: overFair.weighted,
      bestBook: bestOverOffer.bookTitle,
      bestAmerican: bestOverOffer.overAmerican,
      bestDecimal: americanToDecimal(bestOverOffer.overAmerican),
      numBooks: offers.length,
      pinnacleUsed: overFair.pinnacleUsed,
    });

    plays.push({
      player,
      market: MARKET,
      line,
      side: "Under",
      game,
      commenceTime: event.commence_time,
      marketAvgRaw: underFair.raw,
      marketAvgDevig: underFair.devig,
      pinnacleWeighted: underFair.weighted,
      bestBook: bestUnderOffer.bookTitle,
      bestAmerican: bestUnderOffer.underAmerican,
      bestDecimal: americanToDecimal(bestUnderOffer.underAmerican),
      numBooks: offers.length,
      pinnacleUsed: underFair.pinnacleUsed,
    });
  }

  return plays;
}

export async function getEVPlays(apiKey: string): Promise<OddsApiResult> {
  const errors: string[] = [];
  const events = await fetchEvents(apiKey);

  const now = Date.now();
  const horizon = now + 36 * 60 * 60 * 1000;
  const upcoming = events.filter((e) => {
    const t = new Date(e.commence_time).getTime();
    return t > now && t < horizon;
  });

  let lastRemaining: string | null = null;
  let lastUsed: string | null = null;

  // Batch concurrency: 4 requests in flight at a time, with a small gap
  // between batches. Prevents 429 EXCEEDED_FREQ_LIMIT errors.
  const BATCH_SIZE = 4;
  const BATCH_GAP_MS = 250;

  const allPlays: PlayProw[] = [];

  for (let i = 0; i < upcoming.length; i += BATCH_SIZE) {
    const batch = upcoming.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((ev) => fetchEventOdds(apiKey, ev.id))
    );

    results.forEach((r, j) => {
      if (r.status === "rejected") {
        errors.push(`Event ${batch[j].id}: ${r.reason}`);
        return;
      }
      const { data, remaining, used } = r.value;
      if (remaining !== null) lastRemaining = remaining;
      if (used !== null) lastUsed = used;
      if (!data) return;
      const plays = buildPlaysForEvent(data);
      allPlays.push(...plays);
    });

    // Small pause between batches if we have more to do
    if (i + BATCH_SIZE < upcoming.length) {
      await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
    }
  }

  // Default sort: by Pinnacle-weighted EV descending
  allPlays.sort((a, b) => b.pinnacleWeighted.evPercent - a.pinnacleWeighted.evPercent);

  return {
    plays: allPlays,
    remainingRequests: lastRemaining,
    usedRequests: lastUsed,
    fetchedAt: new Date().toISOString(),
    errors,
  };
}
