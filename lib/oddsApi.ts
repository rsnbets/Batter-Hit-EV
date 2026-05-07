import {
  OddsApiEvent,
  OddsApiBookmaker,
  BookOffer,
  PlayProw,
  FairEstimate,
  ArbRow,
} from "./types";
import {
  americanToImplied,
  americanToDecimal,
  devigPower,
  weightedFairProbWithSharps,
  impliedToAmerican,
  calcEV,
  detectArb,
} from "./math";

const BASE = "https://api.the-odds-api.com/v4";
const SPORT = "baseball_mlb";
// Pull both the standard market and the alternate-line market.
// Some books (FanDuel, Caesars/williamhill_us, Kalshi, MyBookie, Rebet)
// only post hits props in the alternate market — and often only one side.
const MARKETS = "batter_hits,batter_hits_alternate";
const MARKET_KEYS = new Set(["batter_hits", "batter_hits_alternate"]);
// Stored on the play row so the UI can still show a single market label.
// Use the standard key when both are present.
const MARKET_LABEL = "batter_hits";

// Regions:
//   us  - DraftKings, FanDuel, BetMGM, Caesars (paid), BetRivers, BetUS, Bovada, etc.
//   us2 - ESPN BET, Fliff, Bally Bet, betPARX, BetAnySports, Hard Rock variants
//   us_ex - Exchanges: Novig (no-vig), ProphetX, Kalshi, BetOpenly
// `eu` is intentionally dropped: Pinnacle does not post batter_hits, and the only
// `eu` books that quote it (betonlineag, mybookieag) are also available via `us`.
// Dropping `eu` saves ~25% of API credits per refresh with no data loss.
const REGIONS = "us,us2,us_ex";

/**
 * Books we accept into the analysis. Verified against the official Odds API
 * bookmaker list at the-odds-api.com/sports-odds-data/bookmaker-apis.html
 */
const TARGET_BOOKS = new Set([
  // Sharps / consensus anchors (used in "sharps pool" for fair calc)
  "pinnacle",          // eu region
  "novig",             // us_ex - no-vig peer-to-peer exchange
  "prophetx",          // us_ex - peer-to-peer exchange

  // Other exchanges
  "betopenly",         // us_ex
  // Kalshi excluded — prediction market posts placeholder prices like
  // -100000 / -9900 frequently enough to pollute the de-vig pool, and not
  // a book the user has an account on.

  // US major retail
  "draftkings",
  "fanduel",
  "betmgm",
  "williamhill_us",    // Caesars (requires paid sub)
  "betrivers",
  "fanatics",          // requires paid sub
  "betus",
  "bovada",

  // US2 (newer wave / often softer pricing)
  "espnbet",           // theScore Bet / formerly ESPN BET
  "ballybet",
  // betparx excluded — not bettable for the user, and posts unreliable lines.
  "fliff",
  "betanysports",      // formerly BetAnySports
  "hardrockbet",       // IN + multiple states with same odds
  "hardrockbet_az",
  "hardrockbet_fl",
  "hardrockbet_oh",

  // Offshore / low-vig (us region)
  "betonlineag",       // BetOnline.ag — sister site to Bookmaker.eu
  "lowvig",
  "mybookieag",
]);

/**
 * Books considered "sharp" for fair-odds weighting purposes.
 * These get pooled together with elevated weight (vs. retail books).
 */
export const SHARP_BOOKS = new Set([
  "pinnacle",
  "novig",
  "prophetx",
]);

/**
 * Books we consider "soft" — these are good targets for the Single Book
 * (target-book) mode because they tend to have stale or mispriced lines.
 */
export const SOFT_BOOKS = new Set([
  "betonlineag",
  "lowvig",
  "mybookieag",
  "betus",
  "bovada",
  "fliff",
  "ballybet",
  "betanysports",
  "espnbet",
  "hardrockbet",
  "hardrockbet_az",
  "hardrockbet_fl",
  "hardrockbet_oh",
  "fanatics",
]);

export interface OddsApiResult {
  plays: PlayProw[];
  arbs: ArbRow[];
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
    `?apiKey=${apiKey}&regions=${REGIONS}&markets=${MARKETS}&oddsFormat=american`;
  const res = await fetch(url, { cache: "no-store" });
  const remaining = res.headers.get("x-requests-remaining");
  const used = res.headers.get("x-requests-used");

  // 422 = market not offered for this event yet
  if (res.status === 422) return { data: null, remaining, used };

  // 429 = rate-limited. Retry up to 3 times with exponential backoff.
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

interface PerBookSides {
  bookKey: string;
  bookTitle: string;
  over: number | null;
  under: number | null;
}

/**
 * Collect each book's Over and Under at the given (player, line),
 * looking across BOTH the standard `batter_hits` market and the
 * `batter_hits_alternate` market. A book may quote in either or both.
 *
 * If a book quotes the same side in both markets, we keep the standard
 * market's price (more reliable; alts are sometimes stale).
 */
// Sanity bound on American odds. Anything outside this range (e.g. Kalshi
// occasionally posts -100000 / -9900 placeholder prices) is treated as
// missing data — these would otherwise pollute the de-vig pool and produce
// spurious EV. ±2500 corresponds to ~96% / ~4% implied probability and is
// well outside any realistic batter_hits market.
const ODDS_BOUND = 2500;
function isSanePrice(american: number): boolean {
  return Number.isFinite(american) && Math.abs(american) <= ODDS_BOUND;
}

function collectPerBookSides(
  bookmakers: OddsApiBookmaker[],
  player: string,
  line: number
): PerBookSides[] {
  const out: PerBookSides[] = [];
  for (const bm of bookmakers) {
    if (!TARGET_BOOKS.has(bm.key)) continue;
    let over: number | null = null;
    let under: number | null = null;
    let overFromStandard = false;
    let underFromStandard = false;
    for (const m of bm.markets) {
      if (!MARKET_KEYS.has(m.key)) continue;
      const isStandard = m.key === "batter_hits";
      for (const o of m.outcomes) {
        if (o.description !== player || o.point !== line) continue;
        if (!isSanePrice(o.price)) continue;
        if (o.name === "Over" && (over === null || (isStandard && !overFromStandard))) {
          over = o.price;
          overFromStandard = isStandard;
        } else if (o.name === "Under" && (under === null || (isStandard && !underFromStandard))) {
          under = o.price;
          underFromStandard = isStandard;
        }
      }
    }
    if (over !== null || under !== null) {
      out.push({ bookKey: bm.key, bookTitle: bm.title, over, under });
    }
  }
  return out;
}

/**
 * Build de-viggable two-sided offers from per-book outcomes.
 * Books with only one side are excluded here (they're tracked separately
 * in PerBookSides for display + best-price purposes).
 */
function buildDevigOffers(perBook: PerBookSides[]): BookOffer[] {
  const offers: BookOffer[] = [];
  for (const b of perBook) {
    if (b.over === null || b.under === null) continue;
    const overImplied = americanToImplied(b.over);
    const underImplied = americanToImplied(b.under);
    const { over: overDevig, under: underDevig } = devigPower(
      overImplied,
      underImplied
    );
    offers.push({
      bookKey: b.bookKey,
      bookTitle: b.bookTitle,
      overAmerican: b.over,
      underAmerican: b.under,
      overImplied,
      underImplied,
      overDevigged: overDevig,
      underDevigged: underDevig,
    });
  }
  return offers;
}

function buildFairEstimate(fairProb: number, bestAmerican: number): FairEstimate {
  return {
    fairProb,
    fairAmerican: impliedToAmerican(fairProb),
    evPercent: calcEV(fairProb, bestAmerican),
  };
}

/**
 * Compute three fair-odds estimates for a single side using the same set of offers:
 *   1. Raw market average (vig included) — what most people do by default
 *   2. De-vigged market average — vig removed, equal weight
 *   3. Sharp-pool-weighted — sharps (Pinnacle/Novig/ProphetX) get 50% weight,
 *      retail books split the other 50%
 */
function computeAllFair(
  offers: BookOffer[],
  side: "Over" | "Under",
  bestAmerican: number
): {
  raw: FairEstimate;
  devig: FairEstimate;
  weighted: FairEstimate;
  pinnacleUsed: boolean;
  sharpCount: number;
} {
  const rawProbs = offers.map((o) => (side === "Over" ? o.overImplied : o.underImplied));
  const rawAvg = rawProbs.reduce((s, p) => s + p, 0) / rawProbs.length;

  const devigProbs = offers.map((o) => ({
    bookKey: o.bookKey,
    prob: side === "Over" ? o.overDevigged : o.underDevigged,
  }));

  const devigAvg = devigProbs.reduce((s, b) => s + b.prob, 0) / devigProbs.length;

  // Sharp-pool-weighted (Pinnacle + Novig + ProphetX share the sharp slot)
  const weighted = weightedFairProbWithSharps(devigProbs, SHARP_BOOKS);

  const pinnacleUsed = offers.some((o) => o.bookKey === "pinnacle");
  const sharpCount = offers.filter((o) => SHARP_BOOKS.has(o.bookKey)).length;

  return {
    raw: buildFairEstimate(rawAvg, bestAmerican),
    devig: buildFairEstimate(devigAvg, bestAmerican),
    weighted: buildFairEstimate(weighted.fairProb, bestAmerican),
    pinnacleUsed,
    sharpCount,
  };
}

interface EventOutput {
  plays: PlayProw[];
  arbs: ArbRow[];
}

function buildPlaysForEvent(event: OddsApiEvent): EventOutput {
  const plays: PlayProw[] = [];
  const arbs: ArbRow[] = [];
  if (!event.bookmakers || event.bookmakers.length === 0) {
    return { plays, arbs };
  }

  // Collect every (player, line) combo seen across either market and any book
  const combos = new Set<string>();
  for (const bm of event.bookmakers) {
    if (!TARGET_BOOKS.has(bm.key)) continue;
    for (const m of bm.markets) {
      if (!MARKET_KEYS.has(m.key)) continue;
      for (const o of m.outcomes) {
        combos.add(`${o.description}|||${o.point}`);
      }
    }
  }

  const game = `${event.away_team} @ ${event.home_team}`;

  for (const combo of combos) {
    const [player, lineStr] = combo.split("|||");
    const line = Number(lineStr);

    const perBook = collectPerBookSides(event.bookmakers, player, line);
    const devigOffers = buildDevigOffers(perBook);
    if (devigOffers.length < 2) continue; // need ≥ 2 two-sided books to de-vig

    // Build a snapshot covering ALL books (de-vig + one-sided) for display.
    const devigByKey = new Map(devigOffers.map((o) => [o.bookKey, o]));
    const allBookOffers = perBook.map((b) => {
      const dv = devigByKey.get(b.bookKey);
      return {
        bookKey: b.bookKey,
        bookTitle: b.bookTitle,
        overAmerican: b.over,
        underAmerican: b.under,
        devigged: dv !== undefined,
        overDevigAmerican: dv ? impliedToAmerican(dv.overDevigged) : null,
        underDevigAmerican: dv ? impliedToAmerican(dv.underDevigged) : null,
      };
    });

    // Best Over: max across every book that quoted an Over (de-vig or one-sided)
    let bestOverPrice = -Infinity;
    let bestOverBookKey = "";
    let bestOverBookTitle = "";
    for (const b of perBook) {
      if (b.over !== null && b.over > bestOverPrice) {
        bestOverPrice = b.over;
        bestOverBookKey = b.bookKey;
        bestOverBookTitle = b.bookTitle;
      }
    }
    // Best Under: same idea
    let bestUnderPrice = -Infinity;
    let bestUnderBookKey = "";
    let bestUnderBookTitle = "";
    for (const b of perBook) {
      if (b.under !== null && b.under > bestUnderPrice) {
        bestUnderPrice = b.under;
        bestUnderBookKey = b.bookKey;
        bestUnderBookTitle = b.bookTitle;
      }
    }

    const overFair = computeAllFair(devigOffers, "Over", bestOverPrice);
    const underFair = computeAllFair(devigOffers, "Under", bestUnderPrice);

    // Counts: numBooks = anyone quoting that side; numDevigBooks = the de-vig pool size.
    const numOverBooks = perBook.filter((b) => b.over !== null).length;
    const numUnderBooks = perBook.filter((b) => b.under !== null).length;

    plays.push({
      player,
      market: MARKET_LABEL,
      line,
      side: "Over",
      game,
      commenceTime: event.commence_time,
      eventId: event.id,
      marketAvgRaw: overFair.raw,
      marketAvgDevig: overFair.devig,
      pinnacleWeighted: overFair.weighted,
      bestBook: bestOverBookTitle,
      bestBookKey: bestOverBookKey,
      bestAmerican: bestOverPrice,
      bestDecimal: americanToDecimal(bestOverPrice),
      numBooks: numOverBooks,
      numDevigBooks: devigOffers.length,
      pinnacleUsed: overFair.pinnacleUsed,
      sharpCount: overFair.sharpCount,
      allBookOffers,
    });

    plays.push({
      player,
      market: MARKET_LABEL,
      line,
      side: "Under",
      game,
      commenceTime: event.commence_time,
      eventId: event.id,
      marketAvgRaw: underFair.raw,
      marketAvgDevig: underFair.devig,
      pinnacleWeighted: underFair.weighted,
      bestBook: bestUnderBookTitle,
      bestBookKey: bestUnderBookKey,
      bestAmerican: bestUnderPrice,
      bestDecimal: americanToDecimal(bestUnderPrice),
      numBooks: numUnderBooks,
      numDevigBooks: devigOffers.length,
      pinnacleUsed: underFair.pinnacleUsed,
      sharpCount: underFair.sharpCount,
      allBookOffers,
    });

    // Two-way arb: best Over (price) + best Under (price) across all books for
    // the same line. Skip if same book (would just be that book's vig). The
    // ±2500 sanity filter is already applied at collectPerBookSides ingest.
    if (
      bestOverPrice !== -Infinity &&
      bestUnderPrice !== -Infinity &&
      bestOverBookKey !== bestUnderBookKey
    ) {
      const arb = detectArb(bestOverPrice, bestUnderPrice);
      if (arb) {
        arbs.push({
          player,
          market: MARKET_LABEL,
          line,
          game,
          commenceTime: event.commence_time,
          eventId: event.id,
          overBook: bestOverBookTitle,
          overBookKey: bestOverBookKey,
          overAmerican: bestOverPrice,
          underBook: bestUnderBookTitle,
          underBookKey: bestUnderBookKey,
          underAmerican: bestUnderPrice,
          marginPct: arb.margin,
          overStakeFraction: arb.overStake,
          underStakeFraction: arb.underStake,
          numBooks: devigOffers.length,
        });
      }
    }
  }

  return { plays, arbs };
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

  // Batch concurrency: 4 in flight, 250ms gap between batches.
  // Prevents 429 EXCEEDED_FREQ_LIMIT errors.
  const BATCH_SIZE = 4;
  const BATCH_GAP_MS = 250;

  const allPlays: PlayProw[] = [];
  const allArbs: ArbRow[] = [];

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
      const out = buildPlaysForEvent(data);
      allPlays.push(...out.plays);
      allArbs.push(...out.arbs);
    });

    if (i + BATCH_SIZE < upcoming.length) {
      await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
    }
  }

  // Default sort by sharp-pool-weighted EV descending
  allPlays.sort(
    (a, b) => b.pinnacleWeighted.evPercent - a.pinnacleWeighted.evPercent
  );

  // Arbs sorted by margin descending — biggest guaranteed-profit edge first.
  allArbs.sort((a, b) => b.marginPct - a.marginPct);

  return {
    plays: allPlays,
    arbs: allArbs,
    remainingRequests: lastRemaining,
    usedRequests: lastUsed,
    fetchedAt: new Date().toISOString(),
    errors,
  };
}
