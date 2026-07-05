import { NextResponse } from "next/server";
import { getEVPlays, getEVPlaysFromFeed, OddsApiResult } from "@/lib/oddsApi";
import { getCurrentUserId } from "@/lib/auth";
import { supabase as supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Pro: 60s. On Hobby plan, change to 10.

// In-memory cache. Fresh on cold start, shared across requests on warm container.
let cache: { result: OddsApiResult; ts: number } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60s — protects against double-clicks / refresh spam

const DAILY_REFRESH_LIMIT = 20;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("refresh") === "1";

  // PRIMARY source is the shared hourly slate feed (free, more books).
  // The Odds API path survives as fallback — used only if the feed fetch
  // fails AND an ODDS_API_KEY is configured. Set ODDS_SOURCE=oddsapi to
  // force the legacy path.
  const useFeed = (process.env.ODDS_SOURCE ?? "feed") !== "oddsapi";
  const apiKey = process.env.ODDS_API_KEY;
  if (!useFeed && !apiKey) {
    return NextResponse.json(
      { error: "ODDS_API_KEY not set" },
      { status: 500 }
    );
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit only the explicit refresh action. Feed reads are free, so the
  // daily budget only applies when refreshes spend Odds API credits.
  if (force && !useFeed) {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
    const { data: row } = await supabaseAdmin
      .from("usage")
      .select("refresh_count")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();

    const current = row?.refresh_count ?? 0;
    if (current >= DAILY_REFRESH_LIMIT) {
      return NextResponse.json(
        {
          error: `Daily refresh limit reached (${DAILY_REFRESH_LIMIT}/day). Resets at UTC midnight.`,
          refreshesUsed: current,
          refreshesLimit: DAILY_REFRESH_LIMIT,
        },
        { status: 429 }
      );
    }

    await supabaseAdmin.from("usage").upsert(
      { user_id: userId, date: today, refresh_count: current + 1 },
      { onConflict: "user_id,date" }
    );
  }

  if (!force && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json({ ...cache.result, cached: true });
  }

  try {
    let result: OddsApiResult;
    if (useFeed) {
      try {
        result = await getEVPlaysFromFeed();
      } catch (feedErr) {
        // Feed unreachable — fall back to The Odds API if we can.
        if (!apiKey) throw feedErr;
        result = await getEVPlays(apiKey);
        result.errors.push(
          `slate feed failed (${String(feedErr)}) — served from The Odds API fallback`
        );
      }
    } else {
      result = await getEVPlays(apiKey!);
    }
    cache = { result, ts: Date.now() };
    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
