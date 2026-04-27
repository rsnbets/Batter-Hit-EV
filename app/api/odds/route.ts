import { NextResponse } from "next/server";
import { getEVPlays, OddsApiResult } from "@/lib/oddsApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Pro: 60s. On Hobby plan, change to 10.

// In-memory cache. Fresh on cold start, shared across requests on warm container.
let cache: { result: OddsApiResult; ts: number } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60s — protects against double-clicks / refresh spam

export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("refresh") === "1";

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ODDS_API_KEY not set" },
      { status: 500 }
    );
  }

  if (!force && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json({ ...cache.result, cached: true });
  }

  try {
    const result = await getEVPlays(apiKey);
    cache = { result, ts: Date.now() };
    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
