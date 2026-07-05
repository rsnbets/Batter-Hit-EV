// slateFeed.ts — batter-hits odds from the shared Profit Path slate feed.
//
// The public feed is published hourly by rsnbets/mlb-slate-fetcher (the ONE
// SportsGameOdds pull shared by every tool: Dinger, MLB-EV, K-prop, Underdog).
// Reading it costs nothing — no API key, no credits, no daily refresh budget —
// and carries MORE books than The Odds API did for this market.
//
// This module adapts the feed into the app's native OddsApiEvent shape so ALL
// existing math (de-vig, sharps-weighted fair, EV, arb detection) runs
// unchanged. The Odds API path stays intact as a fallback (lib/oddsApi.ts).
//
// Feed shape (per player): { ev: {id, home, away, start},
//   lines: { "0.5": { fair_over, fair_line?, books: {bk:{over, under, ou?}} } } }
// Odds are American strings ("+150"/"-200"); each alt line is priced separately.

import { OddsApiEvent, OddsApiOutcome } from "./types";

const FEED_URL =
  process.env.SLATE_FEED_URL ||
  "https://rsnbets.github.io/mlb-slate-fetcher/board_odds.json";

// SGO bookmaker ids -> The Odds API keys this app's TARGET_BOOKS/sharps use.
// Unmapped SGO books (unknown, underdog, foreign books) are dropped here —
// they'd be rejected by TARGET_BOOKS anyway.
const BOOK_MAP: Record<string, string> = {
  caesars: "williamhill_us",
  betonline: "betonlineag",
  mybookie: "mybookieag",
  prophetexchange: "prophetx",
  draftkings: "draftkings",
  fanduel: "fanduel",
  betmgm: "betmgm",
  betrivers: "betrivers",
  espnbet: "espnbet",
  ballybet: "ballybet",
  fliff: "fliff",
  hardrockbet: "hardrockbet",
  bovada: "bovada",
  novig: "novig",
  lowvig: "lowvig",
  betanysports: "betanysports",
  betopenly: "betopenly",
  betus: "betus",
};

interface FeedBookQuote {
  over?: string;
  under?: string;
  ou?: string; // book's own line when it differs from the group line
}
interface FeedLine {
  fair_over?: string | null;
  fair_line?: string;
  books: Record<string, FeedBookQuote>;
}
interface FeedPlayer {
  ev?: { id?: string; home?: string; away?: string; start?: string };
  line?: string;
  lines?: Record<string, FeedLine>;
}
interface Feed {
  fetched_at?: string;
  markets?: Record<string, Record<string, FeedPlayer>>;
}

function amStrToNum(s: unknown): number | null {
  if (s === null || s === undefined || s === "") return null;
  const v = parseInt(String(s).replace("+", ""), 10);
  if (!Number.isFinite(v) || v === 0 || (v > -100 && v < 100)) return null;
  return v;
}

export async function fetchFeedEvents(): Promise<{
  events: OddsApiEvent[];
  feedFetchedAt: string | null;
}> {
  const res = await fetch(`${FEED_URL}?cb=${Date.now()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`slate feed HTTP ${res.status}`);
  const feed = (await res.json()) as Feed;
  const hitters = feed.markets?.batting_hits ?? {};

  // Group per event; within an event, collect outcomes per (mapped) book.
  const events = new Map<
    string,
    { ev: OddsApiEvent; outcomes: Map<string, OddsApiOutcome[]> }
  >();

  for (const [player, entry] of Object.entries(hitters)) {
    const ctx = entry.ev;
    if (!ctx?.id || !ctx.start || !ctx.home || !ctx.away) continue;
    let bucket = events.get(ctx.id);
    if (!bucket) {
      bucket = {
        ev: {
          id: ctx.id,
          sport_key: "baseball_mlb",
          commence_time: ctx.start,
          home_team: ctx.home,
          away_team: ctx.away,
          bookmakers: [],
        },
        outcomes: new Map(),
      };
      events.set(ctx.id, bucket);
    }
    for (const [lineKey, lineData] of Object.entries(entry.lines ?? {})) {
      const groupPoint = parseFloat(lineKey);
      if (!Number.isFinite(groupPoint)) continue;
      for (const [sgoBook, quote] of Object.entries(lineData.books ?? {})) {
        const key = BOOK_MAP[sgoBook];
        if (!key) continue;
        // a book quoting its own number gets its own point, not the group's
        const point = quote.ou ? parseFloat(quote.ou) : groupPoint;
        if (!Number.isFinite(point)) continue;
        const over = amStrToNum(quote.over);
        const under = amStrToNum(quote.under);
        if (over === null && under === null) continue;
        let list = bucket.outcomes.get(key);
        if (!list) {
          list = [];
          bucket.outcomes.set(key, list);
        }
        if (over !== null)
          list.push({ name: "Over", description: player, price: over, point });
        if (under !== null)
          list.push({ name: "Under", description: player, price: under, point });
      }
    }
  }

  const out: OddsApiEvent[] = [];
  for (const { ev, outcomes } of events.values()) {
    ev.bookmakers = [...outcomes.entries()].map(([key, outs]) => ({
      key,
      title: key,
      markets: [{ key: "batter_hits", outcomes: outs }],
    }));
    if (ev.bookmakers.length > 0) out.push(ev);
  }
  return { events: out, feedFetchedAt: feed.fetched_at ?? null };
}
