import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  americanToImplied,
  impliedToAmerican,
  devigPower,
} from "@/lib/math";
import { SHARP_BOOKS } from "@/lib/oddsApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Hobby plan cap. Keep this tight — typical run hits ≤5 events.
export const maxDuration = 10;

const BASE = "https://api.the-odds-api.com/v4";
const SPORT = "baseball_mlb";
// Mirror the live feed so closing book coverage matches open coverage.
const MARKETS = "batter_hits,batter_hits_alternate";
const MARKET_KEYS = new Set(["batter_hits", "batter_hits_alternate"]);
const REGIONS = "us,us2,us_ex";

interface ApiOutcome {
  name: string;
  description: string;
  price: number;
  point: number;
}
interface ApiMarket {
  key: string;
  outcomes: ApiOutcome[];
}
interface ApiBookmaker {
  key: string;
  title: string;
  markets: ApiMarket[];
}
interface ApiEventOdds {
  bookmakers?: ApiBookmaker[];
}

interface CloseData {
  bestBook: string | null;
  bestAmerican: number | null;
  pinnacleAmerican: number | null;
  sharpConsensusAmerican: number | null;
  devigeedMarketAmerican: number | null;
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ODDS_API_KEY not set" }, { status: 500 });
  }

  const now = new Date();
  // Capture window: bets whose game starts in the next 7 minutes,
  // or has started in the last 30 (handles missed cron runs).
  const horizonStart = new Date(now.getTime() - 30 * 60 * 1000);
  const horizonEnd = new Date(now.getTime() + 7 * 60 * 1000);

  const { data: bets, error: betsErr } = await supabase
    .from("bets")
    .select("*")
    .is("closing_captured_at", null)
    .gte("commence_time", horizonStart.toISOString())
    .lte("commence_time", horizonEnd.toISOString());

  if (betsErr) {
    return NextResponse.json({ error: betsErr.message }, { status: 500 });
  }

  if (!bets || bets.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      message: "No bets in capture window",
    });
  }

  // Group by event_id — one API call per unique event.
  const eventGroups = new Map<string, typeof bets>();
  for (const b of bets) {
    const arr = eventGroups.get(b.event_id) || [];
    arr.push(b);
    eventGroups.set(b.event_id, arr);
  }

  const results: Array<{
    eventId: string;
    betsUpdated: number;
    error?: string;
  }> = [];

  // Process events in parallel (Hobby has 10s cap; sequential gets dicey).
  await Promise.all(
    Array.from(eventGroups.entries()).map(async ([eventId, eventBets]) => {
      try {
        const url =
          `${BASE}/sports/${SPORT}/events/${eventId}/odds` +
          `?apiKey=${apiKey}&regions=${REGIONS}&markets=${MARKETS}&oddsFormat=american`;
        const res = await fetch(url, { cache: "no-store" });

        if (!res.ok) {
          results.push({
            eventId,
            betsUpdated: 0,
            error: `HTTP ${res.status}`,
          });
          return;
        }

        const data: ApiEventOdds = await res.json();

        await supabase.from("closing_snapshots").upsert({
          event_id: eventId,
          captured_at: new Date().toISOString(),
          game: eventBets[0].game,
          commence_time: eventBets[0].commence_time,
          raw_data: data,
        });

        await Promise.all(
          eventBets.map(async (bet) => {
            const closeData = computeCloseBenchmarks(
              data,
              bet.player,
              Number(bet.line),
              bet.side as "Over" | "Under"
            );

            await supabase
              .from("bets")
              .update({
                closing_captured_at: new Date().toISOString(),
                close_best_book: closeData.bestBook,
                close_best_american: closeData.bestAmerican,
                close_pinnacle_american: closeData.pinnacleAmerican,
                close_sharp_consensus_american:
                  closeData.sharpConsensusAmerican,
                close_devigged_market_american:
                  closeData.devigeedMarketAmerican,
              })
              .eq("id", bet.id);
          })
        );

        results.push({ eventId, betsUpdated: eventBets.length });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ eventId, betsUpdated: 0, error: msg });
      }
    })
  );

  return NextResponse.json({ ok: true, processed: bets.length, results });
}

/**
 * For one (player, line, side), compute the four closing-line benchmarks
 * across whatever bookmakers quoted that line at capture time.
 *
 * Mirrors collectPerBookSides() in lib/oddsApi.ts: a book may quote a side
 * in batter_hits and/or batter_hits_alternate. Standard takes precedence
 * when both exist (more reliable; alts are sometimes stale).
 */
function computeCloseBenchmarks(
  apiData: ApiEventOdds,
  player: string,
  line: number,
  side: "Over" | "Under"
): CloseData {
  const bookmakers = apiData.bookmakers || [];

  type Offer = {
    key: string;
    title: string;
    sidePrice: number;
    sideDevigged: number | null; // null when book only quoted one side
  };

  const offers: Offer[] = [];

  for (const bm of bookmakers) {
    let over: number | null = null;
    let under: number | null = null;
    let overFromStandard = false;
    let underFromStandard = false;

    for (const m of bm.markets || []) {
      if (!MARKET_KEYS.has(m.key)) continue;
      const isStandard = m.key === "batter_hits";
      for (const o of m.outcomes || []) {
        if (o.description !== player || o.point !== line) continue;
        if (
          o.name === "Over" &&
          (over === null || (isStandard && !overFromStandard))
        ) {
          over = o.price;
          overFromStandard = isStandard;
        } else if (
          o.name === "Under" &&
          (under === null || (isStandard && !underFromStandard))
        ) {
          under = o.price;
          underFromStandard = isStandard;
        }
      }
    }

    const sidePrice = side === "Over" ? over : under;
    if (sidePrice === null) continue;

    let sideDevigged: number | null = null;
    if (over !== null && under !== null) {
      const overImplied = americanToImplied(over);
      const underImplied = americanToImplied(under);
      const { over: overDevig, under: underDevig } = devigPower(
        overImplied,
        underImplied
      );
      sideDevigged = side === "Over" ? overDevig : underDevig;
    }

    offers.push({
      key: bm.key,
      title: bm.title,
      sidePrice,
      sideDevigged,
    });
  }

  if (offers.length === 0) {
    return {
      bestBook: null,
      bestAmerican: null,
      pinnacleAmerican: null,
      sharpConsensusAmerican: null,
      devigeedMarketAmerican: null,
    };
  }

  // Best price = highest American number = best payout for bettor.
  const best = offers.reduce((b, c) => (c.sidePrice > b.sidePrice ? c : b));

  // De-vigged-only pool for the consensus benchmarks
  const devigOffers = offers.filter(
    (o): o is Offer & { sideDevigged: number } => o.sideDevigged !== null
  );

  const pinnacle = devigOffers.find((o) => o.key === "pinnacle");
  const pinnacleAmerican = pinnacle ? impliedToAmerican(pinnacle.sideDevigged) : null;

  const sharps = devigOffers.filter((o) => SHARP_BOOKS.has(o.key));
  const sharpConsensusAmerican =
    sharps.length > 0
      ? impliedToAmerican(
          sharps.reduce((s, o) => s + o.sideDevigged, 0) / sharps.length
        )
      : null;

  const devigeedMarketAmerican =
    devigOffers.length > 0
      ? impliedToAmerican(
          devigOffers.reduce((s, o) => s + o.sideDevigged, 0) /
            devigOffers.length
        )
      : null;

  return {
    bestBook: best.title,
    bestAmerican: best.sidePrice,
    pinnacleAmerican,
    sharpConsensusAmerican,
    devigeedMarketAmerican,
  };
}
