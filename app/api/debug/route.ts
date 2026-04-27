import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://api.the-odds-api.com/v4";
const SPORT = "baseball_mlb";

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ODDS_API_KEY not set" }, { status: 500 });
  }

  const eventsRes = await fetch(
    `${BASE}/sports/${SPORT}/events?apiKey=${apiKey}`,
    { cache: "no-store" }
  );
  if (!eventsRes.ok) {
    return NextResponse.json(
      { error: `Events failed: ${eventsRes.status}` },
      { status: 500 }
    );
  }
  const events = await eventsRes.json();

  const now = Date.now();
  const upcoming = events
    .filter((e: { commence_time: string }) => new Date(e.commence_time).getTime() > now)
    .sort(
      (a: { commence_time: string }, b: { commence_time: string }) =>
        new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime()
    );

  if (upcoming.length === 0) {
    return NextResponse.json({ error: "No upcoming events" }, { status: 404 });
  }

  const event = upcoming[0];

  const oddsRes = await fetch(
    `${BASE}/sports/${SPORT}/events/${event.id}/odds?apiKey=${apiKey}&regions=us,us2,eu&markets=batter_hits&oddsFormat=american`,
    { cache: "no-store" }
  );

  if (!oddsRes.ok) {
    return NextResponse.json({
      error: `Odds failed: ${oddsRes.status}`,
      detail: await oddsRes.text(),
    });
  }

  const data = await oddsRes.json();

  const bookmakers = (data.bookmakers || []).map(
    (bm: { key: string; title: string; markets: { key: string; outcomes: unknown[] }[] }) => ({
      key: bm.key,
      title: bm.title,
      hasBatterHits: bm.markets.some((m) => m.key === "batter_hits"),
      numOutcomes:
        bm.markets.find((m) => m.key === "batter_hits")?.outcomes.length || 0,
    })
  );

  return NextResponse.json({
    eventId: event.id,
    game: `${event.away_team} @ ${event.home_team}`,
    commence_time: event.commence_time,
    totalBookmakersReturned: bookmakers.length,
    bookmakers: bookmakers.sort((a: { key: string }, b: { key: string }) =>
      a.key.localeCompare(b.key)
    ),
  });
}
