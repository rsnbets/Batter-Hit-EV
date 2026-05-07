import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth";
import { americanToDecimal } from "@/lib/math";
import type { BetRow, BetWithCLV } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const required = [
      "player",
      "line",
      "side",
      "bet_book_key",
      "bet_book_title",
      "bet_american",
      "event_id",
      "game",
      "commence_time",
    ];
    for (const f of required) {
      if (body[f] === undefined || body[f] === null) {
        return NextResponse.json(
          { error: `Missing required field: ${f}` },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from("bets")
      .insert({
        user_id: userId,
        player: body.player,
        line: body.line,
        side: body.side,
        bet_book_key: body.bet_book_key,
        bet_book_title: body.bet_book_title,
        bet_american: body.bet_american,
        stake: body.stake ?? 1,
        event_id: body.event_id,
        game: body.game,
        commence_time: body.commence_time,
        fair_devigged_american: body.fair_devigged_american ?? null,
        fair_pinnacle_weighted_american:
          body.fair_pinnacle_weighted_american ?? null,
        ev_at_bet_pct: body.ev_at_bet_pct ?? null,
        ev_at_bet_devig_pct: body.ev_at_bet_devig_pct ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 500 }
      );
    }
    return NextResponse.json({ bet: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("bets")
      .select("*")
      .eq("user_id", userId)
      .order("commence_time", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 500 }
      );
    }

    const bets: BetWithCLV[] = (data as BetRow[]).map((b) => {
      const betDecimal = americanToDecimal(b.bet_american);

      const clvOf = (closeAmerican: number | null): number | null => {
        if (closeAmerican === null) return null;
        const closeDecimal = americanToDecimal(closeAmerican);
        return betDecimal / closeDecimal - 1;
      };

      return {
        ...b,
        clv_vs_best_pct: clvOf(b.close_best_american),
        clv_vs_pinnacle_pct: clvOf(b.close_pinnacle_american),
        clv_vs_sharp_consensus_pct: clvOf(b.close_sharp_consensus_american),
        clv_vs_devigged_market_pct: clvOf(b.close_devigged_market_american),
      };
    });

    return NextResponse.json({ bets });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
